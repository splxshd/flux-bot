'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType,
} = require('discord.js');
const db = require('../database');

// ── Colors ────────────────────────────────────────────────────────────────────
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const BLUE   = '#5865F2';
const GOLD   = '#F1C40F';
const PURPLE = '#9B59B6';

// ── Economy helpers ───────────────────────────────────────────────────────────
function parseBet(str, wallet) {
  if (!str) return 0;
  const s = str.toLowerCase().trim();
  if (s === 'all' || s === 'max') return wallet;
  if (s === 'half')               return Math.floor(wallet / 2);
  const n = parseInt(s.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function fmtCoins(n) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}k`;
  return String(Math.floor(n));
}

// Returns null if valid, or an error string
function checkBet(eco, bet, s) {
  if (bet < 1) return `❌ Minimum bet is **1 ${s.currency_emoji}**.`;
  if (bet > eco.wallet) return `❌ You only have **${fmtCoins(eco.wallet)} ${s.currency_emoji}** in your wallet.`;
  return null;
}

function betLine(bet, s) {
  return bet > 0 ? `\nBet: **${fmtCoins(bet)} ${s.currency_emoji}**` : '';
}

// ── Deck helpers ──────────────────────────────────────────────────────────────
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['♠','♥','♦','♣'];

function makeDeck() {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push({ r, s });
  return d.sort(() => Math.random() - 0.5);
}
function draw(deck) { return deck.pop(); }
function cardStr({ r, s }) { return `\`${r}${s}\``; }
function handStr(hand) { return hand.map(cardStr).join(' '); }

// Blackjack value
function bjVal(c) { return c.r === 'A' ? 11 : ['J','Q','K'].includes(c.r) ? 10 : parseInt(c.r); }
function bjTotal(hand) {
  let t = hand.reduce((a, c) => a + bjVal(c), 0);
  let aces = hand.filter(c => c.r === 'A').length;
  while (t > 21 && aces-- > 0) t -= 10;
  return t;
}

// ── Active game sessions ───────────────────────────────────────────────────────
const bjGames     = new Map(); // userId  → { deck, player, dealer }
const hiloGames   = new Map(); // userId  → { current, streak }
const pokerTables = new Map(); // msgId   → { host, players[], deck, stage }

// ─────────────────────────────────────────────────────────────────────────────
// 1. 🃏 BLACKJACK — Hit / Stand / Double buttons, hidden dealer card
// ─────────────────────────────────────────────────────────────────────────────
const blackjack = {
  name: 'blackjack',
  aliases: ['bj'],
  async execute(message, args) {
    if (bjGames.has(message.author.id))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You already have an active game! Finish it first.')] });

    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const bet     = parseBet(args[0], eco.wallet);

    if (args[0]) {
      const err = checkBet(eco, bet, s);
      if (err) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(err)] });
      db.addWallet(guildId, userId, -bet); // deduct upfront
    }

    const deck   = makeDeck();
    const player = [draw(deck), draw(deck)];
    const dealer = [draw(deck), draw(deck)];
    bjGames.set(userId, { deck, player, dealer, bet, totalBet: bet });

    const payout = (result) => {
      if (!bet) return '';
      const ecoNow = db.getEco(guildId, userId);
      if (result === 'win')  { db.addWallet(guildId, userId, bet * 2);    return `\n💰 **+${fmtCoins(bet)} ${s.currency_emoji}**`; }
      if (result === 'bj')   { db.addWallet(guildId, userId, Math.floor(bet * 2.5)); return `\n💰 **+${fmtCoins(Math.floor(bet*1.5))} ${s.currency_emoji}** (Blackjack 1.5×)`; }
      if (result === 'push') { db.addWallet(guildId, userId, bet);        return `\n🔄 Bet returned`; }
      if (result === 'lose' || result === 'bust') return `\n💸 **-${fmtCoins(bet)} ${s.currency_emoji}**`;
      return '';
    };

    const buildEmbed = (p, d, hideDealer = true, result = null, extra = '') => {
      const pt = bjTotal(p), dt = bjTotal(d);
      const color = result === 'win' || result === 'bj' ? GREEN : result === 'lose' || result === 'bust' ? RED : result === 'push' ? YELLOW : BLUE;
      const e = new EmbedBuilder()
        .setColor(color)
        .setTitle('🃏 Blackjack')
        .addFields(
          { name: `Your Hand  (${pt})`, value: handStr(p) },
          { name: hideDealer ? 'Dealer Hand  (??)' : `Dealer Hand  (${dt})`,
            value: hideDealer ? `${cardStr(d[0])}  \`??\`` : handStr(d) },
        )
        .setFooter({ text: `${bet ? `Bet: ${fmtCoins(bet)} ${s.currency_name} • ` : ''}flux • 60s timeout` });
      if (result === 'win')  e.setDescription(`🎉 **You win!**${extra}`);
      if (result === 'lose') e.setDescription(`💀 **You lose!**${extra}`);
      if (result === 'bust') e.setDescription(`💀 **Bust!**${extra}`);
      if (result === 'push') e.setDescription(`🤝 **Push — tie!**${extra}`);
      if (result === 'bj')   e.setDescription(`🎉 **Blackjack!**${extra}`);
      return e;
    };

    const buildRow = (disabled = false, canDouble = true) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setEmoji('🃏').setStyle(ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
      new ButtonBuilder().setCustomId('bj_double').setLabel('Double Down').setEmoji('⬆️').setStyle(ButtonStyle.Success).setDisabled(disabled || !canDouble),
    );

    // Can only double if wallet covers extra bet
    const canDouble = () => !bet || db.getEco(guildId, userId).wallet >= bet;

    // Instant blackjack check
    if (bjTotal(player) === 21) {
      bjGames.delete(userId);
      const extra = payout('bj');
      return message.reply({ embeds: [buildEmbed(player, dealer, false, 'bj', extra)], components: [buildRow(true)] });
    }

    const sent = await message.reply({ embeds: [buildEmbed(player, dealer)], components: [buildRow(false, canDouble())] });

    const col = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === userId,
      time: 60_000,
    });

    col.on('collect', async (i) => {
      const game = bjGames.get(userId);
      if (!game) return;

      if (i.customId === 'bj_double') {
        // Deduct extra bet for double down
        if (bet) {
          const w = db.getEco(guildId, userId).wallet;
          if (w < bet) return i.reply({ content: `❌ Not enough ${s.currency_emoji} to double down!`, ephemeral: true });
          db.addWallet(guildId, userId, -bet);
          game.totalBet = bet * 2;
        }
        game.player.push(draw(game.deck));
        const pt = bjTotal(game.player);
        if (pt > 21) {
          bjGames.delete(userId); col.stop('done');
          const extra = bet ? `\n💸 **-${fmtCoins(game.totalBet)} ${s.currency_emoji}**` : '';
          return i.update({ embeds: [buildEmbed(game.player, game.dealer, false, 'bust', extra)], components: [buildRow(true)] });
        }
        while (bjTotal(game.dealer) < 17) game.dealer.push(draw(game.deck));
        const res = evalBj(bjTotal(game.player), bjTotal(game.dealer));
        const extra = bet ? (res === 'win' ? `\n💰 **+${fmtCoins(game.totalBet)} ${s.currency_emoji}**` : res === 'push' ? '\n🔄 Bet returned' : `\n💸 **-${fmtCoins(game.totalBet)} ${s.currency_emoji}**`) : '';
        if (res === 'win')  db.addWallet(guildId, userId, game.totalBet * 2);
        if (res === 'push') db.addWallet(guildId, userId, game.totalBet);
        bjGames.delete(userId); col.stop('done');
        return i.update({ embeds: [buildEmbed(game.player, game.dealer, false, res, extra)], components: [buildRow(true)] });
      }

      if (i.customId === 'bj_hit') {
        game.player.push(draw(game.deck));
        const pt = bjTotal(game.player);
        if (pt > 21) {
          const extra = payout('bust');
          bjGames.delete(userId); col.stop('done');
          return i.update({ embeds: [buildEmbed(game.player, game.dealer, false, 'bust', extra)], components: [buildRow(true)] });
        }
        if (pt === 21) {
          while (bjTotal(game.dealer) < 17) game.dealer.push(draw(game.deck));
          const res = evalBj(21, bjTotal(game.dealer));
          const extra = payout(res);
          bjGames.delete(userId); col.stop('done');
          return i.update({ embeds: [buildEmbed(game.player, game.dealer, false, res, extra)], components: [buildRow(true)] });
        }
        return i.update({ embeds: [buildEmbed(game.player, game.dealer)], components: [buildRow(false, canDouble())] });
      }

      if (i.customId === 'bj_stand') {
        while (bjTotal(game.dealer) < 17) game.dealer.push(draw(game.deck));
        const res = evalBj(bjTotal(game.player), bjTotal(game.dealer));
        const extra = payout(res);
        bjGames.delete(userId); col.stop('done');
        return i.update({ embeds: [buildEmbed(game.player, game.dealer, false, res, extra)], components: [buildRow(true)] });
      }
    });

    col.on('end', (_, reason) => {
      if (reason === 'time') {
        bjGames.delete(userId);
        sent.edit({ components: [buildRow(true)] }).catch(() => {});
      }
    });
  },
};

function evalBj(pt, dt) {
  if (pt > 21) return 'bust';
  if (dt > 21 || pt > dt) return 'win';
  if (pt === dt) return 'push';
  return 'lose';
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 🎰 SLOTS — Animated spinning + Spin Again button
// ─────────────────────────────────────────────────────────────────────────────
const REELS  = ['🍒','🍋','🍊','🍇','⭐','🔔','7️⃣','💎'];
const REEL_W = ['🍒','🍒','🍋','🍋','🍊','🍊','🍇','⭐','🔔','7️⃣','💎']; // weighted

function spinResult() { return [0,1,2].map(() => REEL_W[Math.floor(Math.random() * REEL_W.length)]); }

function slotEmbed(reels, spinning = false, done = false) {
  const allSame  = reels[0] === reels[1] && reels[1] === reels[2];
  const twoSame  = reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2];
  const is7      = allSame && reels[0] === '7️⃣';
  const isDiamond = allSame && reels[0] === '💎';

  const color = spinning ? BLUE
    : is7 || isDiamond ? GOLD
    : allSame ? GREEN
    : twoSame ? YELLOW
    : RED;

  const display = `╔══════════════╗\n║  ${reels.join('  ')}  ║\n╚══════════════╝`;

  const outcome = spinning ? '⏳  Spinning...'
    : isDiamond ? '💎  **DIAMOND JACKPOT!!**'
    : is7       ? '7️⃣  **LUCKY SEVENS — JACKPOT!**'
    : allSame   ? '🎉  **JACKPOT — Triple match!**'
    : twoSame   ? '✨  **Two match — small win!**'
    : '💀  **No match. Try again!**';

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🎰 Slot Machine')
    .setDescription(`${display}\n\n${outcome}`)
    .setFooter({ text: 'flux • Good luck!' });
}

const slots = {
  name: 'slots',
  aliases: ['slot'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    let bet       = parseBet(args[0], eco.wallet);

    if (args[0]) {
      const err = checkBet(eco, bet, s);
      if (err) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(err)] });
    } else { bet = 0; }

    const slotPayout = (reels) => {
      if (!bet) return { mult: 0, label: '' };
      const allSame  = reels[0] === reels[1] && reels[1] === reels[2];
      const twoSame  = reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2];
      const is7      = allSame && reels[0] === '7️⃣';
      const isDiamond = allSame && reels[0] === '💎';
      if (isDiamond) return { mult: 50, label: `💰 **+${fmtCoins(bet*49)} ${s.currency_emoji}** (50×)` };
      if (is7)       return { mult: 20, label: `💰 **+${fmtCoins(bet*19)} ${s.currency_emoji}** (20×)` };
      if (allSame)   return { mult: 10, label: `💰 **+${fmtCoins(bet*9)} ${s.currency_emoji}** (10×)` };
      if (twoSame)   return { mult: 2,  label: `💰 **+${fmtCoins(bet)} ${s.currency_emoji}** (2×)` };
      return { mult: 0, label: `💸 **-${fmtCoins(bet)} ${s.currency_emoji}**` };
    };

    const spinRow     = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('slots_spin').setLabel(bet ? `Spin Again (${fmtCoins(bet)} ${s.currency_emoji})` : 'Spin Again').setEmoji('🎰').setStyle(ButtonStyle.Primary),
    );
    const disabledRow = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('slots_spin').setLabel('Spin Again').setEmoji('🎰').setStyle(ButtonStyle.Primary).setDisabled(true),
    );

    const doSpin = async (editFn, currentBet) => {
      if (currentBet) {
        const w = db.getEco(guildId, userId).wallet;
        if (w < currentBet) {
          await editFn({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ Not enough ${s.currency_emoji} to spin!`)], components: [] });
          return null;
        }
        db.addWallet(guildId, userId, -currentBet);
      }
      const frames = [['🔄','🔄','🔄'],['❓','🔄','🔄'],['❓','❓','🔄']];
      for (const f of frames) {
        await editFn({ embeds: [slotEmbed(f, true)], components: [disabledRow()] });
        await new Promise(r => setTimeout(r, 420));
      }
      const result = spinResult();
      const { mult, label } = slotPayout(result);
      if (currentBet && mult > 0) db.addWallet(guildId, userId, currentBet * mult);
      const embed = slotEmbed(result, false, true);
      if (label) embed.setDescription((embed.data.description || '') + `\n\n${label}`);
      await editFn({ embeds: [embed], components: [spinRow()] });
      return result;
    };

    if (bet) db.addWallet(guildId, userId, -bet); // deduct first spin
    const sent = await message.reply({ embeds: [slotEmbed(['🔄','🔄','🔄'], true)], components: [disabledRow()] });
    const result = spinResult();
    const { mult, label } = slotPayout(result);
    if (bet && mult > 0) db.addWallet(guildId, userId, bet * mult);
    const firstEmbed = slotEmbed(result, false, true);
    if (label) firstEmbed.setDescription((firstEmbed.data.description || '') + `\n\n${label}`);
    await sent.edit({ embeds: [firstEmbed], components: [spinRow()] });

    const col = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === userId,
      time: 120_000,
    });

    col.on('collect', async (i) => {
      await i.deferUpdate();
      await doSpin(opts => sent.edit(opts), bet);
    });

    col.on('end', () => {
      sent.edit({ components: [disabledRow()] }).catch(() => {});
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. 🪙 COINFLIP — Heads / Tails buttons + Flip Again
// ─────────────────────────────────────────────────────────────────────────────
const coinflip = {
  name: 'coin',
  aliases: ['flip', 'coinflip'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const bet     = parseBet(args[0], eco.wallet);
    if (args[0]) {
      const err = checkBet(eco, bet, s);
      if (err) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(err)] });
    }

    const btnLabel = (side) => bet ? `${side} (${fmtCoins(bet)} ${s.currency_emoji})` : side;
    const pickRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('coin_heads').setLabel(btnLabel('Heads')).setEmoji('🟡').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('coin_tails').setLabel(btnLabel('Tails')).setEmoji('⚪').setStyle(ButtonStyle.Secondary),
    );

    const prompt = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🪙 Coinflip')
      .setDescription(`Pick a side before the coin lands!${bet ? `\n\nBet: **${fmtCoins(bet)} ${s.currency_emoji}**` : ''}`)
      .setFooter({ text: 'flux • 30s to choose' });

    const sent = await message.reply({ embeds: [prompt], components: [pickRow] });

    const runFlip = async (i, choice) => {
      await i.deferUpdate();

      // Spinning animation
      const spinEmbed = new EmbedBuilder().setColor(YELLOW).setTitle('🪙 Coinflip').setDescription('🌀  Flipping...').setFooter({ text: 'flux' });
      await sent.edit({ embeds: [spinEmbed], components: [] });
      await new Promise(r => setTimeout(r, 900));

      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      const won    = choice === result;

      // Economy payout
      let payoutLine = '';
      if (bet) {
        if (won) { db.addWallet(guildId, userId, bet); payoutLine = `\n💰 **+${fmtCoins(bet)} ${s.currency_emoji}**`; }
        else     { db.addWallet(guildId, userId, -bet); payoutLine = `\n💸 **-${fmtCoins(bet)} ${s.currency_emoji}**`; }
      }

      const newEco = db.getEco(guildId, userId);
      const flipRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('coin_heads').setLabel(bet && newEco.wallet >= bet ? btnLabel('Heads') : 'Heads').setEmoji('🟡').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('coin_tails').setLabel(bet && newEco.wallet >= bet ? btnLabel('Tails') : 'Tails').setEmoji('⚪').setStyle(ButtonStyle.Secondary),
      );
      const resultEmbed = new EmbedBuilder()
        .setColor(won ? GREEN : RED)
        .setTitle('🪙 Coinflip')
        .setDescription(
          `${result === 'heads' ? '🟡' : '⚪'} **${result.toUpperCase()}!**\n\n` +
          (won ? `🎉 You called it!${payoutLine}` : `💀 You picked **${choice}** — better luck next time!${payoutLine}`)
        )
        .setFooter({ text: 'Click to flip again!' });

      await sent.edit({ embeds: [resultEmbed], components: [flipRow] });
    };

    const col = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: 120_000,
    });

    col.on('collect', async (i) => {
      await runFlip(i, i.customId === 'coin_heads' ? 'heads' : 'tails');
    });

    col.on('end', () => {
      sent.edit({ components: [] }).catch(() => {});
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. 🎴 HI-LO — Higher / Lower / Same buttons + Cash Out, economy bets
// ─────────────────────────────────────────────────────────────────────────────
const CARD_NAMES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const CARD_VALS  = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 };
const HILO_MULTI = [1.0, 1.35, 1.75, 2.25, 3.00, 4.00, 5.50, 7.50]; // index = streak

function randCard()   { return CARD_NAMES[Math.floor(Math.random() * 13)]; }
function hiloMult(s)  { return HILO_MULTI[Math.min(s, HILO_MULTI.length - 1)]; }

const hilo = {
  name: 'hilo',
  aliases: ['highlow'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);

    // ── Bet parsing ────────────────────────────────────────────────────────────
    const bet = parseBet(args[0], eco.wallet);
    const err = checkBet(eco, bet, s);
    if (err) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(err)] });

    // Deduct bet upfront
    db.addWallet(guildId, userId, -bet);

    let current = randCard();
    let streak  = 0;

    const potentialWin  = () => Math.floor(bet * hiloMult(streak));
    const nextWin       = () => Math.floor(bet * hiloMult(streak + 1));

    const buildEmbed = (state = 'playing', next = null) => {
      const winNow  = potentialWin();
      const winNext = nextWin();

      if (state === 'playing') {
        return new EmbedBuilder()
          .setColor(streak > 0 ? YELLOW : BLUE)
          .setTitle('🎴 Hi-Lo')
          .setDescription(
            `**Current card:** \`${current}\`\n\n` +
            `Is the next card **higher**, **lower**, or the **same**?`
          )
          .addFields(
            { name: '🔥 Streak',       value: `**${streak}**`,                                        inline: true },
            { name: '💰 Cash Out Now', value: `**${fmtCoins(winNow)} ${s.currency_emoji}**`,          inline: true },
            { name: '⬆️ Next Correct', value: `→ **${fmtCoins(winNext)} ${s.currency_emoji}**`,      inline: true },
          )
          .setFooter({ text: `Bet: ${fmtCoins(bet)} ${s.currency_emoji} • ×${hiloMult(streak).toFixed(2)} multiplier • 30s per guess` });
      }

      if (state === 'correct') {
        return new EmbedBuilder()
          .setColor(GREEN)
          .setTitle('🎴 Hi-Lo — Correct!')
          .setDescription(`\`${next}\` — ✅ Right call!\n\n**Streak: ${streak}**`)
          .addFields(
            { name: '💰 Cash Out Now', value: `**${fmtCoins(winNow)} ${s.currency_emoji}**`,     inline: true },
            { name: '⬆️ Next Correct', value: `→ **${fmtCoins(winNext)} ${s.currency_emoji}**`, inline: true },
          )
          .setFooter({ text: `×${hiloMult(streak).toFixed(2)} multiplier • keep going or cash out!` });
      }

      if (state === 'cashout') {
        return new EmbedBuilder()
          .setColor(GOLD)
          .setTitle('💰 Cashed Out!')
          .setDescription(`You walked away after a **${streak}** streak.`)
          .addFields(
            { name: '🎯 Bet',     value: `${fmtCoins(bet)} ${s.currency_emoji}`,   inline: true },
            { name: '✖️ Mult',   value: `×${hiloMult(streak).toFixed(2)}`,          inline: true },
            { name: '💵 Payout', value: `**+${fmtCoins(winNow)} ${s.currency_emoji}**`, inline: true },
          )
          .setFooter({ text: 'flux economy' })
          .setTimestamp();
      }

      if (state === 'wrong') {
        return new EmbedBuilder()
          .setColor(RED)
          .setTitle('💀 Wrong!')
          .setDescription(`\`${current}\` → \`${next}\` — ❌ Bad call.\n\nThe next card was **${next}**.`)
          .addFields(
            { name: '🔥 Final Streak', value: `**${streak}**`,                         inline: true },
            { name: '💸 Lost',         value: `**${fmtCoins(bet)} ${s.currency_emoji}**`, inline: true },
          )
          .setFooter({ text: 'flux economy' })
          .setTimestamp();
      }

      if (state === 'timeout') {
        const auto = streak > 0 ? potentialWin() : 0;
        return new EmbedBuilder()
          .setColor(streak > 0 ? GOLD : RED)
          .setTitle(streak > 0 ? '⏰ Time\'s Up — Auto Cashed Out' : '⏰ Time\'s Up')
          .setDescription(streak > 0
            ? `You ran out of time but had a **${streak}** streak — auto cashed out!`
            : 'You ran out of time with no streak. Bet lost.')
          .addFields(
            streak > 0
              ? { name: '💵 Auto Payout', value: `**+${fmtCoins(auto)} ${s.currency_emoji}**`, inline: true }
              : { name: '💸 Lost', value: `**${fmtCoins(bet)} ${s.currency_emoji}**`, inline: true },
          )
          .setFooter({ text: 'flux economy' })
          .setTimestamp();
      }

      return new EmbedBuilder().setColor(BLUE).setTitle('🎴 Hi-Lo').setDescription('Game over.');
    };

    const buildRow = (disabled = false) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hilo_higher').setLabel('Higher').setEmoji('⬆️').setStyle(ButtonStyle.Success).setDisabled(disabled),
      new ButtonBuilder().setCustomId('hilo_lower').setLabel('Lower').setEmoji('⬇️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
      new ButtonBuilder().setCustomId('hilo_same').setLabel('Same').setEmoji('↔️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
      new ButtonBuilder().setCustomId('hilo_cashout').setLabel('Cash Out').setEmoji('💰')
        .setStyle(streak > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(disabled || streak === 0),
    );

    const sent = await message.reply({ embeds: [buildEmbed('playing')], components: [buildRow()] });

    const col = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === userId,
      time: 30_000,
      idle: 30_000,
    });

    col.on('collect', async (i) => {
      // ── Cash Out ─────────────────────────────────────────────────────────────
      if (i.customId === 'hilo_cashout') {
        col.stop('cashout');
        const payout = potentialWin();
        db.addWallet(guildId, userId, payout);
        return i.update({ embeds: [buildEmbed('cashout')], components: [buildRow(true)] });
      }

      // ── Guess ─────────────────────────────────────────────────────────────────
      const next  = randCard();
      const cv    = CARD_VALS[current], nv = CARD_VALS[next];
      const guess = i.customId === 'hilo_higher' ? 'higher' : i.customId === 'hilo_lower' ? 'lower' : 'same';
      const ok    = (guess === 'higher' && nv > cv)
                 || (guess === 'lower'  && nv < cv)
                 || (guess === 'same'   && nv === cv);

      if (ok) {
        streak++;
        current = next;
        col.resetTimer();
        // Show correct flash, then transition to next-card prompt
        await i.update({ embeds: [buildEmbed('correct', next)], components: [buildRow()] });
        await new Promise(r => setTimeout(r, 900));
        await sent.edit({ embeds: [buildEmbed('playing')], components: [buildRow()] }).catch(() => {});
      } else {
        col.stop('wrong');
        await i.update({ embeds: [buildEmbed('wrong', next)], components: [buildRow(true)] });
      }
    });

    col.on('end', async (_, reason) => {
      if (reason === 'cashout' || reason === 'wrong') return; // already handled
      // Timeout — auto-cashout if they had a streak
      if (streak > 0) {
        const payout = potentialWin();
        db.addWallet(guildId, userId, payout);
      }
      await sent.edit({ embeds: [buildEmbed('timeout')], components: [buildRow(true)] }).catch(() => {});
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. 🎲 DICE — Select dice type via dropdown, roll button
// ─────────────────────────────────────────────────────────────────────────────
const DICE_TYPES = [
  { label: 'D4',  value: '4',  emoji: '🎲', description: 'Roll a 4-sided die' },
  { label: 'D6',  value: '6',  emoji: '🎲', description: 'Roll a 6-sided die (standard)' },
  { label: 'D8',  value: '8',  emoji: '🎲', description: 'Roll an 8-sided die' },
  { label: 'D10', value: '10', emoji: '🎲', description: 'Roll a 10-sided die' },
  { label: 'D12', value: '12', emoji: '🎲', description: 'Roll a 12-sided die' },
  { label: 'D20', value: '20', emoji: '🎲', description: 'Roll a 20-sided die (D&D)' },
  { label: 'D100','value': '100', emoji: '🎲', description: 'Roll percentile dice' },
];

const dice = {
  name: 'roll',
  aliases: ['dice', 'd20', 'd6'],
  async execute(message, args) {
    // Quick roll: ,roll 3d6 style
    if (args[0] && /^\d*d\d+$/i.test(args[0])) {
      const [countStr, sidesStr] = args[0].toLowerCase().split('d');
      const count = Math.min(parseInt(countStr) || 1, 10);
      const sides = parseInt(sidesStr);
      if (sides < 2 || sides > 1000) return message.reply('❌ Sides must be between 2 and 1000.');
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
      const total = rolls.reduce((a, b) => a + b, 0);
      const isCrit = count === 1 && sides === 20 && rolls[0] === 20;
      const isFail = count === 1 && sides === 20 && rolls[0] === 1;
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(isCrit ? GOLD : isFail ? RED : BLUE)
          .setTitle(`🎲 ${count}d${sides}`)
          .setDescription(
            count === 1
              ? `Result: **${rolls[0]}**${isCrit ? ' 🌟 **NATURAL 20!**' : isFail ? ' 💀 **CRITICAL FAIL!**' : ''}`
              : `Rolls: ${rolls.map(r => `\`${r}\``).join(' ')}\nTotal: **${total}**`
          )
          .setFooter({ text: 'flux' })
      ]});
    }

    // Interactive: show dice selector
    let selectedSides = 6;

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('dice_type')
      .setPlaceholder('Choose a die type…')
      .addOptions(DICE_TYPES.map(d =>
        new StringSelectMenuOptionBuilder()
          .setLabel(d.label)
          .setValue(d.value)
          .setDescription(d.description)
          .setEmoji(d.emoji)
          .setDefault(d.value === '6')
      ));

    const rollBtn = new ButtonBuilder()
      .setCustomId('dice_roll')
      .setLabel(`Roll D${selectedSides}`)
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Primary);

    const buildRows = (sides) => [
      new ActionRowBuilder().addComponents(selectMenu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dice_roll').setLabel(`Roll D${sides}`).setEmoji('🎲').setStyle(ButtonStyle.Primary)
      ),
    ];

    const buildEmbed = (result = null, sides = 6) => {
      const isCrit = sides === 20 && result === 20;
      const isFail = sides === 20 && result === 1;
      return new EmbedBuilder()
        .setColor(result === null ? BLUE : isCrit ? GOLD : isFail ? RED : result >= sides * 0.8 ? GREEN : BLUE)
        .setTitle('🎲 Dice Roller')
        .setDescription(result === null
          ? `Selected: **D${sides}**\n\nClick **Roll D${sides}** to throw!`
          : `**D${sides}** → \`${result}\`${isCrit ? '\n🌟 **NATURAL 20!**' : isFail ? '\n💀 **CRITICAL FAIL!**' : ''}`)
        .setFooter({ text: 'flux • Select a die then roll' });
    };

    const sent = await message.reply({ embeds: [buildEmbed(null, selectedSides)], components: buildRows(selectedSides) });

    const col = sent.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 120_000,
    });

    col.on('collect', async (i) => {
      if (i.componentType === ComponentType.StringSelect && i.customId === 'dice_type') {
        selectedSides = parseInt(i.values[0]);
        // Update select default visually
        const newSelect = new StringSelectMenuBuilder()
          .setCustomId('dice_type')
          .setPlaceholder('Choose a die type…')
          .addOptions(DICE_TYPES.map(d =>
            new StringSelectMenuOptionBuilder()
              .setLabel(d.label).setValue(d.value).setDescription(d.description).setEmoji(d.emoji)
              .setDefault(d.value === String(selectedSides))
          ));
        await i.update({
          embeds: [buildEmbed(null, selectedSides)],
          components: [
            new ActionRowBuilder().addComponents(newSelect),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('dice_roll').setLabel(`Roll D${selectedSides}`).setEmoji('🎲').setStyle(ButtonStyle.Primary)
            ),
          ],
        });
      }

      if (i.componentType === ComponentType.Button && i.customId === 'dice_roll') {
        const result = Math.floor(Math.random() * selectedSides) + 1;
        const newSelect = new StringSelectMenuBuilder()
          .setCustomId('dice_type').setPlaceholder('Choose a die type…')
          .addOptions(DICE_TYPES.map(d =>
            new StringSelectMenuOptionBuilder()
              .setLabel(d.label).setValue(d.value).setDescription(d.description).setEmoji(d.emoji)
              .setDefault(d.value === String(selectedSides))
          ));
        await i.update({
          embeds: [buildEmbed(result, selectedSides)],
          components: [
            new ActionRowBuilder().addComponents(newSelect),
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('dice_roll').setLabel(`Roll D${selectedSides} Again`).setEmoji('🎲').setStyle(ButtonStyle.Primary)
            ),
          ],
        });
      }
    });

    col.on('end', () => {
      sent.edit({ components: [] }).catch(() => {});
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. 🔴 ROULETTE — Color buttons + number select menu
// ─────────────────────────────────────────────────────────────────────────────
// Standard roulette: 0-36, reds/blacks/green(0)
const RED_NUMS   = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const BLACK_NUMS = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];

function rouletteColor(n) {
  if (n === 0) return 'green';
  if (RED_NUMS.includes(n)) return 'red';
  return 'black';
}

const roulette = {
  name: 'roulette',
  aliases: ['roul'],
  async execute(message, args) {
    const buildBetRow = () => [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rou_red').setLabel('Red').setEmoji('🔴').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('rou_black').setLabel('Black').setEmoji('⚫').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rou_green').setLabel('Green (0)').setEmoji('🟢').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('rou_even').setLabel('Even').setEmoji('2️⃣').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rou_odd').setLabel('Odd').setEmoji('1️⃣').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('rou_number')
          .setPlaceholder('Or pick a specific number (0–36)…')
          .addOptions(
            Array.from({ length: 37 }, (_, i) => {
              const col = rouletteColor(i);
              return new StringSelectMenuOptionBuilder()
                .setLabel(`${i} — ${col.charAt(0).toUpperCase() + col.slice(1)}`)
                .setValue(String(i))
                .setEmoji(col === 'red' ? '🔴' : col === 'green' ? '🟢' : '⚫');
            })
          )
      ),
    ];

    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const bet     = parseBet(args[0], eco.wallet);
    if (args[0]) {
      const err = checkBet(eco, bet, s);
      if (err) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(err)] });
    }

    const prompt = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle('🎡 Roulette')
      .setDescription(`Place your bet!\n\n🔴 Red / ⚫ Black — pays **2×**\n🟢 Green (0) — pays **14×**\n2️⃣ Even / 1️⃣ Odd — pays **2×**\n🔢 Specific number — pays **35×**${bet ? `\n\n${s.currency_emoji} Wagering: **${fmtCoins(bet)}**` : ''}`)
      .setFooter({ text: 'flux • 30s to place bet' });

    const sent = await message.reply({ embeds: [prompt], components: buildBetRow() });

    const spin = async (i, betType) => {
      await i.deferUpdate();

      // Check wallet before each spin
      if (bet) {
        const w = db.getEco(guildId, userId).wallet;
        if (w < bet) {
          return sent.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ Not enough ${s.currency_emoji} to bet!`)], components: [] });
        }
        db.addWallet(guildId, userId, -bet);
      }

      await sent.edit({
        embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🎡 Roulette').setDescription('🌀  The wheel is spinning...').setFooter({ text: 'flux' })],
        components: [],
      });
      await new Promise(r => setTimeout(r, 1200));

      const number = Math.floor(Math.random() * 37);
      const color  = rouletteColor(number);
      const colorEmoji = color === 'red' ? '🔴' : color === 'green' ? '🟢' : '⚫';

      let won = false, mult = 0;
      if (betType === 'red')   { won = color === 'red';                   mult = 2; }
      if (betType === 'black') { won = color === 'black';                 mult = 2; }
      if (betType === 'green') { won = number === 0;                      mult = 14; }
      if (betType === 'even')  { won = number !== 0 && number % 2 === 0; mult = 2; }
      if (betType === 'odd')   { won = number % 2 === 1;                  mult = 2; }
      if (!isNaN(parseInt(betType))) { won = number === parseInt(betType); mult = 35; }

      let payoutLine = '';
      if (bet) {
        if (won) { db.addWallet(guildId, userId, bet * mult); payoutLine = `\n💰 **+${fmtCoins(bet * (mult-1))} ${s.currency_emoji}** (${mult}×)`; }
        else     { payoutLine = `\n💸 **-${fmtCoins(bet)} ${s.currency_emoji}**`; }
      }

      const betLabel = betType === 'red' ? '🔴 Red' : betType === 'black' ? '⚫ Black' : betType === 'green' ? '🟢 Green'
        : betType === 'even' ? '2️⃣ Even' : betType === 'odd' ? '1️⃣ Odd' : `🔢 Number ${betType}`;

      const result = new EmbedBuilder()
        .setColor(won ? GREEN : RED)
        .setTitle('🎡 Roulette')
        .setDescription(
          `The ball lands on **${colorEmoji} ${number}**!\n\nYour bet: **${betLabel}**\n\n` +
          (won ? `🎉 **You win!**${payoutLine}` : `💀 **You lose!**${payoutLine}`)
        )
        .setFooter({ text: 'Click to play again!' });

      await sent.edit({ embeds: [result], components: buildBetRow() });
    };

    const col = sent.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 120_000,
    });

    col.on('collect', async (i) => {
      col.resetTimer();
      if (i.customId.startsWith('rou_')) {
        await spin(i, i.customId.replace('rou_', ''));
      } else if (i.customId === 'rou_number') {
        await spin(i, i.values[0]);
      }
    });

    col.on('end', () => {
      sent.edit({ components: [] }).catch(() => {});
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. ♠️ POKER TABLE — Challenge user → Accept → Deal 5 cards each → Compare
//    OR ,poker table → up to 4 players join via button → host deals
// ─────────────────────────────────────────────────────────────────────────────

// Poker hand evaluator (5-card)
const PRANK = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

function evalPokerHand(hand) {
  const vals  = hand.map(c => PRANK.indexOf(c.r)).sort((a,b) => b-a);
  const suits  = hand.map(c => c.s);
  const flush  = suits.every(s => s === suits[0]);
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.values(counts).sort((a,b) => b-a);
  const uniq   = [...new Set(vals)].sort((a,b) => b-a);
  const straight = uniq.length === 5 && (uniq[0] - uniq[4] === 4
    || (uniq[0] === 12 && uniq[1] === 3)); // A-5 straight

  if (straight && flush && uniq[0] === 12) return { rank: 9, name: '👑 Royal Flush' };
  if (straight && flush)                    return { rank: 8, name: '🌟 Straight Flush' };
  if (groups[0] === 4)                      return { rank: 7, name: '4️⃣ Four of a Kind' };
  if (groups[0] === 3 && groups[1] === 2)   return { rank: 6, name: '🏠 Full House' };
  if (flush)                                return { rank: 5, name: '♠️ Flush' };
  if (straight)                             return { rank: 4, name: '➡️ Straight' };
  if (groups[0] === 3)                      return { rank: 3, name: '3️⃣ Three of a Kind' };
  if (groups[0] === 2 && groups[1] === 2)   return { rank: 2, name: '2️⃣ Two Pair' };
  if (groups[0] === 2)                      return { rank: 1, name: '1️⃣ One Pair' };
  return { rank: 0, name: `🃏 High Card (${PRANK[uniq[0]]})` };
}

const poker = {
  name: 'poker',
  aliases: ['card'],
  async execute(message, args) {
    const guildId = message.guild.id;

    // ,poker table — open a table for up to 4 players
    if (args[0]?.toLowerCase() === 'table') {
      const players = [message.author];

      const tableEmbed = () => new EmbedBuilder()
        .setColor(PURPLE)
        .setTitle('♠️ Poker Table')
        .setDescription(
          `**Host:** ${message.author}\n\n**Players (${players.length}/4):**\n` +
          players.map((p, i) => `${i + 1}. ${p}`).join('\n') +
          '\n\nClick **Join Table** to sit down, or the host clicks **Deal** to start!'
        )
        .setFooter({ text: 'flux • Need 2–4 players' });

      const tableRows = (dealing = false) => [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ptable_join').setLabel('Join Table').setEmoji('🪑').setStyle(ButtonStyle.Primary).setDisabled(dealing || players.length >= 4),
          new ButtonBuilder().setCustomId('ptable_deal').setLabel('Deal').setEmoji('🃏').setStyle(ButtonStyle.Success).setDisabled(dealing || players.length < 2),
          new ButtonBuilder().setCustomId('ptable_leave').setLabel('Leave').setEmoji('🚪').setStyle(ButtonStyle.Danger).setDisabled(dealing),
        ),
      ];

      const sent = await message.reply({ embeds: [tableEmbed()], components: tableRows() });

      const col = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => !i.user.bot,
        time: 120_000,
      });

      col.on('collect', async (i) => {
        if (i.customId === 'ptable_join') {
          if (players.find(p => p.id === i.user.id))
            return i.reply({ content: '❌ You\'re already at the table!', ephemeral: true });
          if (players.length >= 4)
            return i.reply({ content: '❌ Table is full!', ephemeral: true });
          players.push(i.user);
          return i.update({ embeds: [tableEmbed()], components: tableRows() });
        }

        if (i.customId === 'ptable_leave') {
          if (i.user.id === message.author.id)
            return i.reply({ content: '❌ Host can\'t leave. Close the table instead.', ephemeral: true });
          const idx = players.findIndex(p => p.id === i.user.id);
          if (idx === -1) return i.reply({ content: '❌ You\'re not at the table.', ephemeral: true });
          players.splice(idx, 1);
          return i.update({ embeds: [tableEmbed()], components: tableRows() });
        }

        if (i.customId === 'ptable_deal') {
          if (i.user.id !== message.author.id)
            return i.reply({ content: '❌ Only the host can deal.', ephemeral: true });
          col.stop('deal');

          await i.update({ embeds: [tableEmbed()], components: tableRows(true) });

          // Deal 5 cards to each player
          const deck  = makeDeck();
          const hands = players.map(p => ({ user: p, hand: [draw(deck), draw(deck), draw(deck), draw(deck), draw(deck)] }));

          // Evaluate all hands
          const results = hands.map(({ user, hand }) => ({
            user, hand,
            eval: evalPokerHand(hand),
          })).sort((a, b) => {
            if (b.eval.rank !== a.eval.rank) return b.eval.rank - a.eval.rank;
            // Tie-break: highest card
            const av = a.hand.map(c => PRANK.indexOf(c.r)).sort((x,y)=>y-x);
            const bv = b.hand.map(c => PRANK.indexOf(c.r)).sort((x,y)=>y-x);
            for (let k=0;k<5;k++) if (bv[k]!==av[k]) return bv[k]-av[k];
            return 0;
          });

          const winner  = results[0];
          const isTie   = results.length > 1 && results[0].eval.rank === results[1].eval.rank;

          const resultEmbed = new EmbedBuilder()
            .setColor(GOLD)
            .setTitle('♠️ Poker — Showdown!')
            .setDescription(
              results.map((r, i) =>
                `${i === 0 && !isTie ? '🏆 ' : `${i + 1}. `}**${r.user.username}** — ${r.eval.name}\n${handStr(r.hand)}`
              ).join('\n\n') +
              `\n\n${isTie ? '🤝 **It\'s a tie!**' : `🏆 **${winner.user} wins!**`}`
            )
            .setFooter({ text: 'flux • gg' });

          await sent.edit({ embeds: [resultEmbed], components: [] });
        }
      });

      col.on('end', (_, reason) => {
        if (reason !== 'deal') {
          sent.edit({ components: [] }).catch(() => {});
        }
      });
      return;
    }

    // ,poker @user — direct 1v1 challenge
    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id)
      return message.reply('❌ Mention a valid opponent: `,poker @user` — or start a table: `,poker table`');

    const challengeEmbed = new EmbedBuilder()
      .setColor(PURPLE)
      .setTitle('♠️ Poker Challenge')
      .setDescription(`${message.author} challenges ${opponent} to a game of poker!\n\n${opponent}, do you accept?`)
      .setFooter({ text: 'flux • 30s to respond' });

    const challengeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('poker_accept').setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('poker_decline').setLabel('Decline').setEmoji('❌').setStyle(ButtonStyle.Danger),
    );

    const sent = await message.reply({ content: `${opponent}`, embeds: [challengeEmbed], components: [challengeRow] });

    const response = await sent.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: i => i.user.id === opponent.id,
      time: 30_000,
    }).catch(() => null);

    if (!response || response.customId === 'poker_decline') {
      const declined = new EmbedBuilder().setColor(RED).setTitle('♠️ Poker Challenge').setDescription(`${opponent} declined the challenge.`);
      return sent.edit({ embeds: [declined], components: [] });
    }

    await response.deferUpdate();

    // Deal
    const deck = makeDeck();
    const hostHand = [draw(deck), draw(deck), draw(deck), draw(deck), draw(deck)];
    const oppHand  = [draw(deck), draw(deck), draw(deck), draw(deck), draw(deck)];
    const hostEval = evalPokerHand(hostHand);
    const oppEval  = evalPokerHand(oppHand);

    let winner;
    if (hostEval.rank > oppEval.rank) winner = message.author;
    else if (oppEval.rank > hostEval.rank) winner = opponent;
    else {
      // Tie-break: highest card
      const hv = hostHand.map(c => PRANK.indexOf(c.r)).sort((a,b)=>b-a);
      const ov = oppHand.map(c => PRANK.indexOf(c.r)).sort((a,b)=>b-a);
      for (let k=0;k<5;k++) {
        if (hv[k] > ov[k]) { winner = message.author; break; }
        if (ov[k] > hv[k]) { winner = opponent; break; }
      }
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle('♠️ Poker — Showdown!')
      .addFields(
        { name: `${message.author.username}  •  ${hostEval.name}`, value: handStr(hostHand) },
        { name: `${opponent.username}  •  ${oppEval.name}`, value: handStr(oppHand) },
      )
      .setDescription(winner ? `\n🏆 **${winner} wins!**` : '\n🤝 **It\'s a perfect tie!**')
      .setFooter({ text: 'flux • gg' });

    await sent.edit({ embeds: [resultEmbed], components: [] });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. 🔢 GUESS — Guess a number 1-10, then 1-100 hard mode button
// ─────────────────────────────────────────────────────────────────────────────
const guess = {
  name: 'guess',
  aliases: ['guessthenumber', 'gtn'],
  async execute(message, args) {
    const hardMode  = args[0]?.toLowerCase() === 'hard';
    const maxNum    = hardMode ? 100 : 10;
    const answer    = Math.floor(Math.random() * maxNum) + 1;
    const guessTime = hardMode ? 45_000 : 25_000;

    const buildPrompt = (hard) => new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🔢 Guess the Number')
      .setDescription(
        `I'm thinking of a number between **1 and ${hard ? 100 : 10}**.\nType your answer in chat!` +
        (hard ? '\n\n🔥 **Hard mode** — you get hints based on distance.' : '')
      )
      .setFooter({ text: `${guessTime / 1000}s to answer • flux` });

    const buildModeRow = (hard, disabled = false) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gtn_easy').setLabel('Easy (1–10)').setStyle(hard ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId('gtn_hard').setLabel('Hard (1–100)').setStyle(hard ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(disabled),
    );

    const sent = await message.reply({ embeds: [buildPrompt(hardMode)], components: [buildModeRow(hardMode)] });

    let done = false; // guard against both collectors firing

    // ── Message collector ─────────────────────────────────────────────────────
    let hints   = 3;
    const msgCol = message.channel.createMessageCollector({
      filter: m => m.author.id === message.author.id && /^\d+$/.test(m.content.trim()),
      time: guessTime,
    });

    msgCol.on('collect', async (m) => {
      if (done) return;
      const g = parseInt(m.content.trim());
      if (g < 1 || g > maxNum) return;

      if (g === answer) {
        done = true;
        msgCol.stop('solved');
        await sent.edit({ components: [buildModeRow(hardMode, true)] }).catch(() => {});
        await m.reply({ embeds: [
          new EmbedBuilder()
            .setColor(GREEN)
            .setTitle('🎉 Correct!')
            .setDescription(`The number was **${answer}**! Nice one, ${message.author}!`)
            .setTimestamp(),
        ]});
        return;
      }

      // Wrong guess — hint
      const dir  = g > answer ? '📉 Too high!' : '📈 Too low!';
      if (hardMode && hints > 0) {
        hints--;
        const diff = Math.abs(g - answer);
        const proximity = diff <= 5 ? '🔥 Very close!' : diff <= 15 ? '🌡️ Warm!' : diff <= 30 ? '❄️ Cold...' : '🧊 Way off!';
        await m.reply({ embeds: [
          new EmbedBuilder()
            .setColor(YELLOW)
            .setDescription(`${dir} ${proximity}${hints > 0 ? `\n*(${hints} hint${hints !== 1 ? 's' : ''} left)*` : '\n*No more hints!*'}`),
        ], allowedMentions: { repliedUser: false } });
      } else {
        await m.reply({ content: dir, allowedMentions: { repliedUser: false } });
      }
    });

    msgCol.on('end', async (_, reason) => {
      if (reason === 'solved' || done) return;
      done = true;
      await sent.edit({ components: [buildModeRow(hardMode, true)] }).catch(() => {});
      await message.channel.send({ embeds: [
        new EmbedBuilder()
          .setColor(RED)
          .setTitle('⏰ Time\'s up!')
          .setDescription(`Nobody guessed it! The number was **${answer}**.`)
          .setTimestamp(),
      ]}).catch(() => {});
    });

    // ── Mode switch collector ─────────────────────────────────────────────────
    const modeCol = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === message.author.id,
      time: guessTime,
      max: 1,
    });

    modeCol.on('collect', async (i) => {
      if (done) return i.deferUpdate();
      done = true;
      msgCol.stop('mode_switch'); // kill the old message collector first
      await i.update({ embeds: [buildPrompt(hardMode)], components: [buildModeRow(hardMode, true)] });
      // Small delay so old collector fully winds down before new game starts
      await new Promise(r => setTimeout(r, 150));
      const newArgs = i.customId === 'gtn_hard' ? ['hard'] : [];
      guess.execute(message, newArgs);
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HILO DUEL — challenger plays first, target must beat their streak
// ─────────────────────────────────────────────────────────────────────────────
const pendingHiloDuels = new Map(); // `${guildId}-${challengerId}` -> true

async function runHiloTurn(message, guildId, player, bet, s, opts = {}) {
  // opts.targetStreak — if set, player must beat this to win (target's turn)
  // opts.opponentName — shown in embed footer
  // Returns: { streak, reason } where reason is 'cashout' | 'bust' | 'timeout'
  return new Promise(async (resolve) => {
    const uid     = `hd_${player.id}_${Date.now()}`;
    let current   = randCard();
    let streak    = 0;

    const potWin  = () => Math.floor(bet * hiloMult(streak));
    const nextWin = () => Math.floor(bet * hiloMult(streak + 1));

    const targetLine = opts.targetStreak != null
      ? `\nYou need a streak of **${opts.targetStreak + 1}+** to win.`
      : '';

    const buildEmbed = (state = 'playing', next = null) => {
      const winNow  = potWin();
      const winNext = nextWin();
      const context = opts.targetStreak != null
        ? ` • Beat streak: **${opts.targetStreak}**`
        : ' • Opponent watches';

      if (state === 'playing') {
        return new EmbedBuilder()
          .setColor(streak > 0 ? YELLOW : BLUE)
          .setTitle(`🎴 Hi-Lo Duel — ${player.username}'s Turn`)
          .setDescription(`**Current card:** \`${current}\`\n\nIs the next card **higher**, **lower**, or the **same**?${targetLine}`)
          .addFields(
            { name: '🔥 Streak',       value: `**${streak}**`,                                   inline: true },
            { name: '💰 Cash Out',     value: `**${fmtCoins(winNow)} ${s.currency_emoji}**`,     inline: true },
            { name: '⬆️ Next Correct', value: `→ **${fmtCoins(winNext)} ${s.currency_emoji}**`, inline: true },
          )
          .setFooter({ text: `Bet: ${fmtCoins(bet)} ${s.currency_emoji}${context} • 30s per guess` });
      }
      if (state === 'correct') {
        return new EmbedBuilder()
          .setColor(GREEN)
          .setTitle(`🎴 Hi-Lo Duel — Correct!`)
          .setDescription(`\`${next}\` — ✅ Right call! Streak: **${streak}**${targetLine}`)
          .addFields(
            { name: '💰 Cash Out', value: `**${fmtCoins(winNow)} ${s.currency_emoji}**`,     inline: true },
            { name: '⬆️ Next',    value: `→ **${fmtCoins(winNext)} ${s.currency_emoji}**`, inline: true },
          )
          .setFooter({ text: `×${hiloMult(streak).toFixed(2)} multiplier` });
      }
      if (state === 'bust') {
        return new EmbedBuilder()
          .setColor(RED)
          .setTitle(`💀 ${player.username} Busted!`)
          .setDescription(`\`${current}\` → \`${next}\` — ❌ Wrong call.\nFinal streak: **${streak}**`)
          .setFooter({ text: 'flux economy' }).setTimestamp();
      }
      if (state === 'cashout') {
        return new EmbedBuilder()
          .setColor(GOLD)
          .setTitle(`💰 ${player.username} Locked In`)
          .setDescription(`Cashed out with a streak of **${streak}**.`)
          .addFields({ name: '🔒 Streak Locked', value: `**${streak}**`, inline: true })
          .setFooter({ text: 'flux economy' }).setTimestamp();
      }
      if (state === 'timeout') {
        return new EmbedBuilder()
          .setColor(streak > 0 ? GOLD : RED)
          .setTitle(`⏰ ${player.username} Timed Out`)
          .setDescription(streak > 0
            ? `Ran out of time — streak of **${streak}** locked in.`
            : `Ran out of time with no streak.`)
          .setFooter({ text: 'flux economy' }).setTimestamp();
      }
      return new EmbedBuilder().setColor(BLUE).setDescription('Done.');
    };

    const buildRow = (disabled = false) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${uid}_higher`).setLabel('Higher').setEmoji('⬆️').setStyle(ButtonStyle.Success).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`${uid}_lower`).setLabel('Lower').setEmoji('⬇️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`${uid}_same`).setLabel('Same').setEmoji('↔️').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`${uid}_cashout`).setLabel('Cash Out').setEmoji('💰')
        .setStyle(streak > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(disabled || streak === 0),
    );

    const sent = await message.channel.send({
      content: `${player} — it's your turn!`,
      embeds: [buildEmbed('playing')],
      components: [buildRow()],
    });

    const col = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === player.id,
      time: 30_000,
      idle: 30_000,
    });

    col.on('collect', async (i) => {
      if (i.customId === `${uid}_cashout`) {
        col.stop('cashout');
        await i.update({ embeds: [buildEmbed('cashout')], components: [buildRow(true)] });
        return resolve({ streak, reason: 'cashout' });
      }

      const next  = randCard();
      const cv    = CARD_VALS[current], nv = CARD_VALS[next];
      const guess = i.customId === `${uid}_higher` ? 'higher' : i.customId === `${uid}_lower` ? 'lower' : 'same';
      const ok    = (guess === 'higher' && nv > cv) || (guess === 'lower' && nv < cv) || (guess === 'same' && nv === cv);

      if (ok) {
        streak++;
        current = next;
        col.resetTimer();
        await i.update({ embeds: [buildEmbed('correct', next)], components: [buildRow()] });
        await new Promise(r => setTimeout(r, 900));
        await sent.edit({ embeds: [buildEmbed('playing')], components: [buildRow()] }).catch(() => {});
      } else {
        col.stop('bust');
        await i.update({ embeds: [buildEmbed('bust', next)], components: [buildRow(true)] });
        return resolve({ streak, reason: 'bust' });
      }
    });

    col.on('end', async (_, reason) => {
      if (reason === 'cashout' || reason === 'bust') return;
      await sent.edit({ embeds: [buildEmbed('timeout')], components: [buildRow(true)] }).catch(() => {});
      resolve({ streak, reason: 'timeout' });
    });
  });
}

const hiloduel = {
  name: 'hiloduel',
  aliases: ['hd', 'hilobet', 'hduel'],
  async execute(message, args) {
    const guildId    = message.guild.id;
    const challenger = message.author;
    const target     = message.mentions.users.first();
    const s          = db.getEcoSettings(guildId);
    const amt        = parseBet(args[1] ?? args[0], db.getEco(guildId, challenger.id).wallet);

    if (!target || target.bot || target.id === challenger.id)
      return message.reply('Usage: `,hiloduel @user <amount>`');
    if (amt < 1)
      return message.reply('Usage: `,hiloduel @user <amount>`');

    const chalEco = db.getEco(guildId, challenger.id);
    const err = checkBet(chalEco, amt, s);
    if (err) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(err)] });

    const key = `${guildId}-${challenger.id}`;
    if (pendingHiloDuels.has(key))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You already have a pending Hi-Lo duel.')] });

    pendingHiloDuels.set(key, true);

    // ── Challenge embed ───────────────────────────────────────────────────────
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`hdc_accept_${challenger.id}`).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`hdc_decline_${challenger.id}`).setLabel('Decline').setEmoji('❌').setStyle(ButtonStyle.Danger),
    );

    const challengeMsg = await message.reply({
      content: `${target}`,
      embeds: [new EmbedBuilder()
        .setColor(PURPLE)
        .setTitle('🎴 Hi-Lo Duel Challenge')
        .setDescription(
          `**${challenger.username}** challenged **${target.username}** to a Hi-Lo duel!\n\n` +
          `**Stake:** ${fmtCoins(amt)} ${s.currency_emoji} each — pot of **${fmtCoins(amt * 2)} ${s.currency_emoji}**\n\n` +
          `**How it works:**\n> ${challenger.username} plays first and locks in a streak.\n> ${target.username} must beat that streak to win.`
        )
        .setFooter({ text: `${target.username} — accept or decline • 30s` })],
      components: [row],
    });

    const acceptCol = challengeMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === target.id,
      time: 30_000,
      max: 1,
    });

    acceptCol.on('collect', async (i) => {
      pendingHiloDuels.delete(key);

      if (i.customId === `hdc_decline_${challenger.id}`) {
        return i.update({
          embeds: [new EmbedBuilder().setColor(RED).setTitle('🎴 Duel Declined').setDescription(`**${target.username}** declined the duel.`)],
          components: [],
        });
      }

      // Re-check both wallets
      const chalEcoNow = db.getEco(guildId, challenger.id);
      const targEco    = db.getEco(guildId, target.id);
      if (chalEcoNow.wallet < amt)
        return i.update({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ **${challenger.username}** no longer has enough coins.`)], components: [] });
      if (targEco.wallet < amt)
        return i.update({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ **${target.username}** doesn't have enough coins.`)], components: [] });

      // Deduct both upfront
      db.addWallet(guildId, challenger.id, -amt);
      db.addWallet(guildId, target.id, -amt);

      await i.update({
        embeds: [new EmbedBuilder()
          .setColor(PURPLE)
          .setTitle('🎴 Hi-Lo Duel — Starting!')
          .setDescription(`Both players put up **${fmtCoins(amt)} ${s.currency_emoji}**.\n**${challenger.username}** goes first!`)],
        components: [],
      });

      // ── Round 1: Challenger ───────────────────────────────────────────────
      const { streak: chalStreak } = await runHiloTurn(message, guildId, challenger, amt, s, {
        targetStreak: null,
        opponentName: target.username,
      });

      // ── Transition ────────────────────────────────────────────────────────
      await message.channel.send({ embeds: [new EmbedBuilder()
        .setColor(PURPLE)
        .setTitle('🎴 Hi-Lo Duel — Round 2')
        .setDescription(
          `**${challenger.username}** locked in a streak of **${chalStreak}**.\n\n` +
          `**${target.username}**, you need a streak of **${chalStreak + 1}+** to win!\n` +
          (chalStreak === 0 ? '> They busted immediately — any streak wins! 👀' : '')
        )
        .setFooter({ text: `Target to beat: ${chalStreak}` })] });

      // ── Round 2: Target ───────────────────────────────────────────────────
      const { streak: targStreak, reason: targReason } = await runHiloTurn(message, guildId, target, amt, s, {
        targetStreak: chalStreak,
        opponentName: challenger.username,
      });

      // ── Result ────────────────────────────────────────────────────────────
      const targetWins = targStreak > chalStreak;
      const winner = targetWins ? target : challenger;
      const loser  = targetWins ? challenger : target;
      const pot    = amt * 2;

      db.addWallet(guildId, winner.id, pot);
      const winnerEco = db.getEco(guildId, winner.id);

      await message.channel.send({ embeds: [new EmbedBuilder()
        .setColor(targetWins ? GREEN : GOLD)
        .setTitle(`🏆 ${winner.username} wins the duel!`)
        .setDescription(
          `**${challenger.username}** streak: **${chalStreak}**\n` +
          `**${target.username}** streak: **${targStreak}**\n\n` +
          `**${winner.username}** takes the pot of **${fmtCoins(pot)} ${s.currency_emoji}**!`
        )
        .addFields(
          { name: '🏆 Winner',      value: winner.username,                              inline: true },
          { name: '💰 Pot',         value: `${fmtCoins(pot)} ${s.currency_emoji}`,      inline: true },
          { name: '👛 New Balance', value: `${fmtCoins(winnerEco.wallet)} ${s.currency_emoji}`, inline: true },
        )
        .setFooter({ text: 'flux economy' })
        .setTimestamp()] });
    });

    acceptCol.on('end', async (collected, reason) => {
      pendingHiloDuels.delete(key);
      if (reason === 'time' && collected.size === 0) {
        await challengeMsg.edit({
          embeds: [new EmbedBuilder().setColor(RED).setDescription(`⏰ **${target.username}** didn't respond. Duel expired.`)],
          components: [],
        }).catch(() => {});
      }
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
module.exports = [blackjack, slots, coinflip, hilo, dice, roulette, poker, guess, hiloduel];
