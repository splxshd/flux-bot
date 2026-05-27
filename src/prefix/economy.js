'use strict';

const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database');

const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const BLUE   = '#5865F2';
const GOLD   = '#F1C40F';

// ── Helpers ───────────────────────────────────────────────────────────────────
const OWNER_ID = '1467527738091896986';

// Consume and return rig outcome for a user+game, or null if none
function useRig(client, userId, game) {
  const rig = client?.ecoRigs?.get(userId);
  if (rig?.game === game) { client.ecoRigs.delete(userId); return rig.outcome; }
  return null;
}
// Peek without consuming (for multi-guess games)
function peekRig(client, userId, game) {
  const rig = client?.ecoRigs?.get(userId);
  return rig?.game === game ? rig.outcome : null;
}

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.floor(n));
}

function coin(guildId) {
  const s = db.getEcoSettings(guildId);
  return s.currency_emoji;
}

function isOwnerOrAdmin(message) {
  return message.author.id === OWNER_ID;
}

function parseBet(str, wallet) {
  if (!str) return null;
  const s = str.toLowerCase().trim();
  if (s === 'all' || s === 'max') return wallet;
  if (s === 'half')               return Math.floor(wallet / 2);
  const n = parseInt(s.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function fmtTime(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60)   return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60)   return `${m}m`;
  return `${Math.floor(m/60)}h ${m % 60}m`;
}

// ── ,balance / ,bal ───────────────────────────────────────────────────────────
const balance = {
  name: 'bal',
  aliases: ['balance', 'eco', 'money'],
  async execute(message, args) {
    const target  = message.mentions.users.first() || message.author;
    const guildId = message.guild.id;
    const eco     = db.getEco(guildId, target.id);
    const s       = db.getEcoSettings(guildId);
    const total   = eco.wallet + eco.bank;

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${target.username}'s Balance`, iconURL: target.displayAvatarURL({ size: 64 }) })
      .addFields(
        { name: `${s.currency_emoji} Wallet`, value: `**${fmt(eco.wallet)}** ${s.currency_name}`, inline: true },
        { name: `🏦 Bank`,                    value: `**${fmt(eco.bank)}** ${s.currency_name}`,   inline: true },
        { name: `📊 Net Worth`,               value: `**${fmt(total)}** ${s.currency_name}`,      inline: true },
      )
      .setFooter({ text: `Total earned: ${fmt(eco.total_earned)} ${s.currency_name} • flux` })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  },
};

// ── ,daily ────────────────────────────────────────────────────────────────────
const daily = {
  name: 'daily',
  aliases: ['claim'],
  async execute(message) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const now     = Math.floor(Date.now() / 1000);
    const cd      = 86400; // 24h

    if (eco.daily_at && now - eco.daily_at < cd) {
      const remaining = (eco.daily_at + cd - now) * 1000;
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`⏰ Daily already claimed! Come back in **${fmtTime(remaining)}**.`)] });
    }

    // Streak bonus (consecutive days)
    const streakBonus = eco.daily_at && now - eco.daily_at < cd * 2
      ? Math.min(Math.floor((now - eco.daily_at) / cd) * 50, 500)
      : 0;
    const amount = s.daily_amount + streakBonus;

    db.addWallet(guildId, userId, amount);
    db.setDailyAt(guildId, userId, now);

    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setTitle(`${s.currency_emoji} Daily Claimed!`)
      .setDescription(`**+${fmt(amount)} ${s.currency_name}** added to your wallet!${streakBonus > 0 ? `\n✨ Streak bonus: +${streakBonus}` : ''}`)
      .addFields({ name: 'New Balance', value: `${fmt(eco.wallet + amount)} ${s.currency_name}`, inline: true })
      .setFooter({ text: 'Come back tomorrow for more! • flux' })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  },
};

// ── ,work ─────────────────────────────────────────────────────────────────────
const WORK_LINES = [
  'You delivered pizzas and earned', 'You fixed a bug for a client and got',
  'You streamed for 2 hours and made', 'You walked dogs in the park and pocketed',
  'You flipped burgers on a Friday night and earned', 'You sold NFTs to boomers and made',
  'You refereed a kart race and collected', 'You moderated a server and somehow got paid',
  'You wrote Discord bot code all night and earned', 'You drove for Uber and picked up',
];

const work = {
  name: 'work',
  aliases: ['grind', 'job'],
  async execute(message) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const now     = Math.floor(Date.now() / 1000);
    const cd      = 3600; // 1h

    if (eco.work_at && now - eco.work_at < cd) {
      const remaining = (eco.work_at + cd - now) * 1000;
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`⏰ You're tired! Rest for **${fmtTime(remaining)}** before working again.`)] });
    }

    const amount = Math.floor(Math.random() * (s.work_max - s.work_min + 1)) + s.work_min;
    const line   = WORK_LINES[Math.floor(Math.random() * WORK_LINES.length)];

    db.addWallet(guildId, userId, amount);
    db.setWorkAt(guildId, userId, now);

    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setTitle('💼 Work Complete')
      .setDescription(`${line} **${fmt(amount)} ${s.currency_name}**!`)
      .setFooter({ text: 'Work again in 1 hour • flux' })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  },
};

// ── ,deposit / ,dep ───────────────────────────────────────────────────────────
const depositCmd = {
  name: 'deposit',
  aliases: ['dep'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);

    if (!eco.wallet) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Your wallet is empty.')] });

    const amt = parseBet(args[0], eco.wallet);
    if (!amt || amt <= 0) return message.reply(`Usage: \`,deposit <amount|all|half>\``);
    if (amt > eco.wallet) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ You only have **${fmt(eco.wallet)}** in your wallet.`)] });

    const moved = db.deposit(guildId, userId, amt);
    const after = db.getEco(guildId, userId);
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setTitle('🏦 Deposited')
      .setDescription(`Moved **${fmt(moved)} ${s.currency_emoji}** to your bank.`)
      .addFields(
        { name: 'Wallet', value: fmt(after.wallet), inline: true },
        { name: 'Bank',   value: fmt(after.bank),   inline: true },
      ).setTimestamp()] });
  },
};

// ── ,withdraw / ,with ─────────────────────────────────────────────────────────
const withdrawCmd = {
  name: 'withdraw',
  aliases: ['with', 'wd'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);

    if (!eco.bank) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Your bank is empty.')] });

    const amt = parseBet(args[0], eco.bank);
    if (!amt || amt <= 0) return message.reply(`Usage: \`,withdraw <amount|all|half>\``);
    if (amt > eco.bank) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ You only have **${fmt(eco.bank)}** in your bank.`)] });

    const moved = db.withdraw(guildId, userId, amt);
    const after = db.getEco(guildId, userId);
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setTitle('🏦 Withdrawn')
      .setDescription(`Moved **${fmt(moved)} ${s.currency_emoji}** to your wallet.`)
      .addFields(
        { name: 'Wallet', value: fmt(after.wallet), inline: true },
        { name: 'Bank',   value: fmt(after.bank),   inline: true },
      ).setTimestamp()] });
  },
};

// ── ,pay / ,give (to another user) ───────────────────────────────────────────
const pay = {
  name: 'pay',
  aliases: ['transfer', 'send'],
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id)
      return message.reply('Usage: `,pay @user <amount>`');

    const guildId = message.guild.id;
    const eco     = db.getEco(guildId, message.author.id);
    const s       = db.getEcoSettings(guildId);
    const amt     = parseBet(args[1] ?? args[0], eco.wallet);

    if (!amt || amt <= 0) return message.reply('Usage: `,pay @user <amount>`');
    if (amt > eco.wallet) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ You only have **${fmt(eco.wallet)}** ${s.currency_name} in your wallet.`)] });

    db.transfer(guildId, message.author.id, target.id, amt);

    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setTitle('💸 Payment Sent')
      .setDescription(`Sent **${fmt(amt)} ${s.currency_emoji}** to **${target.username}**.`)
      .setTimestamp()] });
  },
};

// ── ,donate ───────────────────────────────────────────────────────────────────
const donate = {
  name: 'donate',
  aliases: ['gift'],
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id)
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Usage: `,donate @user <amount>`')] });

    const guildId = message.guild.id;
    const eco     = db.getEco(guildId, message.author.id);
    const s       = db.getEcoSettings(guildId);
    const amt     = parseBet(args[1] ?? args[0], eco.wallet);

    if (!amt || amt <= 0)
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Usage: `,donate @user <amount>`')] });
    if (amt > eco.wallet)
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ You only have **${fmt(eco.wallet)} ${s.currency_emoji}** in your wallet.`)] });

    db.transfer(guildId, message.author.id, target.id, amt);
    const after = db.getEco(guildId, message.author.id);

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(GREEN)
      .setTitle(`${s.currency_emoji} Donation`)
      .setDescription(`**${message.author.username}** donated **${fmt(amt)} ${s.currency_emoji}** to **${target.username}**! 🎁`)
      .addFields({ name: 'Your remaining balance', value: `${fmt(after.wallet)} ${s.currency_emoji}`, inline: true })
      .setTimestamp()] });
  },
};

// ── ,rob ─────────────────────────────────────────────────────────────────────
const rob = {
  name: 'rob',
  aliases: ['steal', 'mug'],
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id)
      return message.reply('Usage: `,rob @user`');

    const guildId = message.guild.id;
    const userId  = message.author.id;
    const robber  = db.getEco(guildId, userId);
    const victim  = db.getEco(guildId, target.id);
    const s       = db.getEcoSettings(guildId);
    const now     = Math.floor(Date.now() / 1000);
    const cd      = 1800; // 30min

    if (robber.rob_at && now - robber.rob_at < cd) {
      const remaining = (robber.rob_at + cd - now) * 1000;
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`⏰ Lay low for **${fmtTime(remaining)}** before robbing again.`)] });
    }
    if (victim.wallet < 100)
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ **${target.username}** is broke — not worth it.`)] });

    db.setRobAt(guildId, userId, now);

    // 45% success chance (riggable)
    const robOutcome = useRig(message.client, userId, 'rob');
    if ((robOutcome === 'win') || (robOutcome === null && Math.random() < 0.45)) {
      const stolen = Math.floor(victim.wallet * (Math.random() * 0.2 + 0.1)); // steal 10-30%
      db.addWallet(guildId, target.id, -stolen);
      db.addWallet(guildId, userId,    stolen);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GOLD)
        .setTitle('🦹 Successful Rob!')
        .setDescription(`You mugged **${target.username}** and got away with **${fmt(stolen)} ${s.currency_emoji}**!`)
        .setTimestamp()] });
    } else {
      // Caught — pay fine
      const fine = Math.min(Math.floor(robber.wallet * 0.25), 500);
      db.addWallet(guildId, userId, -fine);
      db.addWallet(guildId, target.id, fine);
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setTitle('🚨 Caught!')
        .setDescription(`You got caught trying to rob **${target.username}**!\nYou paid a **${fmt(fine)} ${s.currency_emoji}** fine.`)
        .setTimestamp()] });
    }
  },
};

// ── ,richlist / ,baltop ───────────────────────────────────────────────────────
const richlist = {
  name: 'richlist',
  aliases: ['baltop', 'richest', 'economytop'],
  async execute(message) {
    const guildId = message.guild.id;
    const s       = db.getEcoSettings(guildId);
    const rows    = db.getEcoLeaderboard(guildId, 10);

    if (!rows.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('No economy data yet. Run `,daily` to get started!')] });

    const medals = ['🥇','🥈','🥉'];
    const lines  = await Promise.all(rows.map(async (r, i) => {
      let name;
      try { name = (await message.client.users.fetch(r.user_id)).username; }
      catch { name = r.user_id; }
      return `${medals[i] ?? `**${i+1}.**`} **${name}** — ${s.currency_emoji} ${fmt(r.total)}`;
    }));

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(GOLD)
      .setAuthor({ name: `${message.guild.name} — Richest Members`, iconURL: message.guild.iconURL({ dynamic: true }) || undefined })
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Wallet + Bank combined • flux' })
      .setTimestamp()] });
  },
};

// ── ,give / ,addmoney (owner/admin only) ─────────────────────────────────────
const give = {
  name: 'give',
  aliases: ['addmoney', 'givemoney'],
  async execute(message, args) {
    if (!isOwnerOrAdmin(message))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Owner/Admin only.')] });

    const target = message.mentions.users.first();
    const guildId = message.guild.id;
    const s       = db.getEcoSettings(guildId);
    const amt     = parseInt(args[1] ?? args[0]);

    if (!target || isNaN(amt) || amt <= 0)
      return message.reply('Usage: `,give @user <amount>`');

    db.addWallet(guildId, target.id, amt);
    const after = db.getEco(guildId, target.id);

    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setTitle('💰 Money Given')
      .setDescription(`Added **${fmt(amt)} ${s.currency_emoji}** to **${target.username}**'s wallet.\nNew balance: **${fmt(after.wallet)}**`)
      .setTimestamp()] });
  },
};

// ── ,take / ,removemoney (owner/admin only) ───────────────────────────────────
const take = {
  name: 'take',
  aliases: ['removemoney', 'takemoney'],
  async execute(message, args) {
    if (!isOwnerOrAdmin(message))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Owner/Admin only.')] });

    const target  = message.mentions.users.first();
    const guildId = message.guild.id;
    const s       = db.getEcoSettings(guildId);
    const amt     = parseInt(args[1] ?? args[0]);

    if (!target || isNaN(amt) || amt <= 0)
      return message.reply('Usage: `,take @user <amount>`');

    db.addWallet(guildId, target.id, -amt);
    const after = db.getEco(guildId, target.id);

    await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
      .setTitle('💸 Money Taken')
      .setDescription(`Removed **${fmt(amt)} ${s.currency_emoji}** from **${target.username}**'s wallet.\nNew balance: **${fmt(after.wallet)}**`)
      .setTimestamp()] });
  },
};

// ── ,setbal (owner/admin only) ────────────────────────────────────────────────
const setbal = {
  name: 'setbal',
  aliases: ['setbalance', 'setmoney'],
  async execute(message, args) {
    if (!isOwnerOrAdmin(message))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Owner/Admin only.')] });

    const target  = message.mentions.users.first();
    const guildId = message.guild.id;
    const s       = db.getEcoSettings(guildId);
    const amt     = parseInt(args[1] ?? args[0]);

    if (!target || isNaN(amt) || amt < 0)
      return message.reply('Usage: `,setbal @user <amount>`');

    db.setWallet(guildId, target.id, amt);

    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setTitle('⚙️ Balance Set')
      .setDescription(`**${target.username}**'s wallet set to **${fmt(amt)} ${s.currency_emoji}**.`)
      .setTimestamp()] });
  },
};

// ── ,reseteco (owner/admin only) ──────────────────────────────────────────────
const reseteco = {
  name: 'reseteco',
  aliases: ['ecoreset'],
  async execute(message, args) {
    if (!isOwnerOrAdmin(message))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Owner/Admin only.')] });

    const target = message.mentions.users.first();
    if (!target) return message.reply('Usage: `,reseteco @user`');
    const guildId = message.guild.id;

    db.run('DELETE FROM economy WHERE guild_id=? AND user_id=?', [guildId, target.id]);
    await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
      .setDescription(`✅ Reset economy data for **${target.username}**.`).setTimestamp()] });
  },
};

// ── ,ecoset (currency name/emoji, owner/admin only) ───────────────────────────
const ecoset = {
  name: 'ecoset',
  aliases: ['currencyset', 'setcurrency'],
  async execute(message, args) {
    if (!isOwnerOrAdmin(message))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Owner/Admin only.')] });

    const sub = args[0]?.toLowerCase();
    const val = args.slice(1).join(' ');
    const guildId = message.guild.id;
    const s = db.getEcoSettings(guildId);

    if (sub === 'name') {
      if (!val) return message.reply('Usage: `,ecoset name <name>`');
      db.upsertEcoSettings(guildId, { currency_name: val });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Currency name set to **${val}**.`)] });
    }
    if (sub === 'emoji') {
      if (!val) return message.reply('Usage: `,ecoset emoji <emoji>`');
      db.upsertEcoSettings(guildId, { currency_emoji: val });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Currency emoji set to **${val}**.`)] });
    }
    if (sub === 'daily') {
      const n = parseInt(val);
      if (isNaN(n) || n < 1) return message.reply('Usage: `,ecoset daily <amount>`');
      db.upsertEcoSettings(guildId, { daily_amount: n });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Daily reward set to **${fmt(n)} ${s.currency_emoji}**.`)] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('⚙️ Economy Settings')
      .addFields(
        { name: 'Currency',    value: `${s.currency_emoji} ${s.currency_name}`, inline: true },
        { name: 'Daily',       value: `${fmt(s.daily_amount)}`,                 inline: true },
        { name: 'Work Range',  value: `${s.work_min}–${s.work_max}`,            inline: true },
      )
      .setDescription('**Subcommands:** `name`, `emoji`, `daily`')
      .setFooter({ text: 'flux' })] });
  },
};

// ── ,crime ────────────────────────────────────────────────────────────────────
const CRIMES = {
  pickpocket: {
    label: 'Pickpocket',  emoji: '🕵️',
    style: ButtonStyle.Secondary,
    baseOdds: 0.70, minReward: 80,  maxReward: 300,  finePct: 0.10,
    desc: 'Sneak up on someone and lift their wallet.\n`Low risk` • `Low reward`',
    strategies: [
      { id: 'quick',   label: 'Quick Snatch',  emoji: '⚡', desc: 'Fast and sloppy',             oddsMod: -0.10, rewardMod: 0.80 },
      { id: 'patient', label: 'Be Patient',    emoji: '🎯', desc: 'Wait for the perfect moment', oddsMod: +0.10, rewardMod: 1.25 },
    ],
    successLines: [
      'You bumped into someone outside a coffee shop and slipped their wallet right out.',
      'The old "dropped papers" trick worked like a charm. Wallet secured.',
      'You tailed your mark for ten minutes and swiped clean — not a soul noticed.',
    ],
    caughtLines: [
      'You grabbed the wallet but the mark spun around. You froze. Cops were called.',
      'Turned out your "mark" was an off-duty cop. Ouch.',
      'A security camera caught every second of it. You\'re on the news now.',
    ],
  },
  carjack: {
    label: 'Carjack',  emoji: '🚗',
    style: ButtonStyle.Primary,
    baseOdds: 0.52, minReward: 400,  maxReward: 1000, finePct: 0.22,
    desc: 'Steal a car off the street and sell it for parts.\n`Medium risk` • `Medium reward`',
    strategies: [
      { id: 'hotwire', label: 'Hotwire It',     emoji: '🔧', desc: 'Classic hotwire job',                    oddsMod:  0,     rewardMod: 1.00 },
      { id: 'lookout', label: 'Hire a Lookout', emoji: '👀', desc: 'Pay 200 for a lookout — +15% success',   oddsMod: +0.15,  rewardMod: 1.00, cost: 200 },
    ],
    successLines: [
      'You spotted a running car, slid in, and were three blocks away before anyone blinked.',
      'Hotwired it in under 60 seconds. Chop shop paid top dollar.',
      'Your lookout gave the signal. In and out, smooth as butter.',
    ],
    caughtLines: [
      'The car had a GPS tracker. You didn\'t even make it to the highway.',
      'Someone saw you and called it in. Police spike strip — you\'re done.',
      'The owner came back early. You sprinted. They had a faster car.',
    ],
  },
  smuggle: {
    label: 'Smuggling', emoji: '📦',
    style: ButtonStyle.Danger,
    baseOdds: 0.42, minReward: 800,  maxReward: 2500, finePct: 0.32,
    desc: 'Move contraband through a checkpoint.\n`High risk` • `High reward`',
    strategies: [
      { id: 'small', label: 'Small Package', emoji: '🎒', desc: 'Easier to hide — less profit', oddsMod: +0.13, rewardMod: 0.60 },
      { id: 'full',  label: 'Full Load',     emoji: '🚚', desc: 'Max loot — max exposure',       oddsMod: -0.10, rewardMod: 1.55 },
    ],
    successLines: [
      'The border agent waved you through without a second glance. The goods are delivered.',
      'Hidden in a false floor — inspectors found nothing. Clean pass.',
      'Bribed the right person at the right time. Package delivered, payment received.',
    ],
    caughtLines: [
      'The agent\'s dog went straight for your bag. Nothing gets past that nose.',
      'A tip-off. They had dogs, scanners, and three agents waiting.',
      'X-ray at the checkpoint caught everything. Contraband seized, wallet too.',
    ],
  },
  heist: {
    label: 'Bank Heist', emoji: '🏦',
    style: ButtonStyle.Danger,
    baseOdds: 0.28, minReward: 2000, maxReward: 7000, finePct: 0.45,
    desc: 'Rob the bank. Legendary reward if you pull it off.\n`Extreme risk` • `Massive reward`',
    strategies: [
      { id: 'rush',   label: 'Rush the Vault',  emoji: '💨', desc: 'Loud and fast — pray it works',        oddsMod: -0.05, rewardMod: 0.85 },
      { id: 'inside', label: 'Inside Man',      emoji: '🤝', desc: 'Pay 500 for an inside job — +18% odds', oddsMod: +0.18, rewardMod: 1.35, cost: 500 },
    ],
    successLines: [
      'Vault cracked in 4 minutes. You walked out with bags and nobody fired a shot.',
      'Your inside man disabled the alarms. By the time police arrived, you were long gone.',
      'Perfect timing on the shift change. The crew filled the bags and vanished.',
    ],
    caughtLines: [
      'Silent alarm. SWAT was stacked outside before you even reached the vault.',
      'The inside man flipped. You walked right into a trap.',
      'Dye pack exploded in the bag. Covered in red, surrounded by cops. GG.',
    ],
  },
};

const CRIME_CD = 45 * 60; // 45 minutes

const crime = {
  name: 'crime',
  aliases: ['criminal', 'heist'],
  async execute(message) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const now     = Math.floor(Date.now() / 1000);

    // ── Cooldown check ─────────────────────────────────────────────────────────
    if (eco.crime_at && now - eco.crime_at < CRIME_CD) {
      const left = (eco.crime_at + CRIME_CD - now) * 1000;
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(RED)
          .setTitle('🚨 Lay Low')
          .setDescription(`You're too hot right now. The cops are watching.\nTry again in **${fmtTime(left)}**.`)
          .setFooter({ text: 'flux economy' }),
      ]});
    }

    // ── Stage 1: Pick your crime ───────────────────────────────────────────────
    const crimeKeys = Object.keys(CRIMES);
    const crimeRow  = new ActionRowBuilder().addComponents(
      ...crimeKeys.map(key => {
        const c = CRIMES[key];
        return new ButtonBuilder()
          .setCustomId(`crime_pick_${key}_${userId}`)
          .setLabel(c.label)
          .setEmoji(c.emoji)
          .setStyle(c.style);
      }),
    );

    const stage1Embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🦹 Choose Your Crime')
      .setDescription('Pick a job. Each one has different risk and reward. Choose wisely.')
      .addFields(
        ...crimeKeys.map(key => {
          const c = CRIMES[key];
          const lo = fmt(c.minReward), hi = fmt(c.maxReward);
          return {
            name: `${c.emoji}  ${c.label}`,
            value: `${c.desc}\n**Payout:** ${lo}–${hi} ${s.currency_emoji}  •  **Success:** ${Math.round(c.baseOdds * 100)}%`,
            inline: false,
          };
        }),
      )
      .setFooter({ text: `${message.author.username} • pick a crime below • expires in 30s` });

    const msg = await message.reply({ embeds: [stage1Embed], components: [crimeRow] });

    // ── Stage 1 collector ─────────────────────────────────────────────────────
    const s1Collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === userId && i.customId.startsWith(`crime_pick_`) && i.customId.endsWith(`_${userId}`),
      time: 30_000,
      max: 1,
    });

    s1Collector.on('collect', async (i1) => {
      const crimeKey = i1.customId.split('_')[2];
      const crime    = CRIMES[crimeKey];

      // ── Stage 2: Pick your strategy ─────────────────────────────────────────
      const stratRow = new ActionRowBuilder().addComponents(
        ...crime.strategies.map(st =>
          new ButtonBuilder()
            .setCustomId(`crime_strat_${crimeKey}_${st.id}_${userId}`)
            .setLabel(st.cost ? `${st.label} (−${fmt(st.cost)} ${s.currency_emoji})` : st.label)
            .setEmoji(st.emoji)
            .setStyle(ButtonStyle.Primary),
        ),
        new ButtonBuilder()
          .setCustomId(`crime_cancel_${userId}`)
          .setLabel('Back Out')
          .setEmoji('🏃')
          .setStyle(ButtonStyle.Secondary),
      );

      const successOdds = Math.round(crime.baseOdds * 100);
      const stage2Embed = new EmbedBuilder()
        .setColor(YELLOW)
        .setTitle(`${crime.emoji}  ${crime.label} — Choose Your Approach`)
        .setDescription(`Base success rate: **${successOdds}%**\nPick how you want to do this job.`)
        .addFields(
          ...crime.strategies.map(st => ({
            name: `${st.emoji}  ${st.label}${st.cost ? ` *(costs ${fmt(st.cost)} ${s.currency_emoji})*` : ''}`,
            value: `${st.desc}\n**Odds:** ${successOdds + Math.round(st.oddsMod * 100) > 0 ? '+' : ''}${Math.round(st.oddsMod * 100)}%  •  **Reward multiplier:** ×${st.rewardMod.toFixed(2)}`,
            inline: false,
          })),
        )
        .setFooter({ text: 'Pick your strategy • expires in 30s' });

      await i1.update({ embeds: [stage2Embed], components: [stratRow] });

      // ── Stage 2 collector ──────────────────────────────────────────────────
      const s2Collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === userId && (
          (i.customId.startsWith(`crime_strat_${crimeKey}_`) && i.customId.endsWith(`_${userId}`)) ||
          i.customId === `crime_cancel_${userId}`
        ),
        time: 30_000,
        max: 1,
      });

      s2Collector.on('collect', async (i2) => {
        // ── Cancelled ────────────────────────────────────────────────────────
        if (i2.customId === `crime_cancel_${userId}`) {
          return i2.update({
            embeds: [new EmbedBuilder().setColor(RED).setDescription('🏃 You backed out. Smart.')],
            components: [],
          });
        }

        const stratId = i2.customId.split('_')[3];
        const strat   = crime.strategies.find(st => st.id === stratId);

        // ── Deduct strategy cost ─────────────────────────────────────────────
        if (strat.cost) {
          const fresh = db.getEco(guildId, userId);
          if (fresh.wallet < strat.cost) {
            return i2.update({
              embeds: [new EmbedBuilder()
                .setColor(RED)
                .setDescription(`❌ You can't afford the **${strat.label}** approach.\nYou need **${fmt(strat.cost)} ${s.currency_emoji}** in your wallet.`)],
              components: [],
            });
          }
          db.addWallet(guildId, userId, -strat.cost);
        }

        // ── Roll the dice ─────────────────────────────────────────────────────
        const finalOdds   = Math.max(0.05, Math.min(0.95, crime.baseOdds + strat.oddsMod));
        const crimeOutcome = useRig(message.client, userId, 'crime');
        const success     = crimeOutcome === 'win' ? true : crimeOutcome === 'lose' ? false : Math.random() < finalOdds;
        const baseReward  = crime.minReward + Math.floor(Math.random() * (crime.maxReward - crime.minReward));
        const reward      = Math.floor(baseReward * strat.rewardMod);

        // Set cooldown immediately
        db.setCrimeAt(guildId, userId, Math.floor(Date.now() / 1000));

        // ── "Planning..." suspense embed ──────────────────────────────────────
        const planningEmbed = new EmbedBuilder()
          .setColor(YELLOW)
          .setTitle(`${crime.emoji}  Executing the plan...`)
          .setDescription('⏳ Your crew is in position. This is it...')
          .setFooter({ text: 'flux economy' });

        await i2.update({ embeds: [planningEmbed], components: [] });
        await new Promise(r => setTimeout(r, 2500));

        // ── Result ────────────────────────────────────────────────────────────
        if (success) {
          db.addWallet(guildId, userId, reward);
          const updatedEco    = db.getEco(guildId, userId);
          const flavor        = crime.successLines[Math.floor(Math.random() * crime.successLines.length)];
          const resultEmbed   = new EmbedBuilder()
            .setColor(GREEN)
            .setTitle(`${crime.emoji}  ${crime.label} — Success!`)
            .setDescription(`*${flavor}*`)
            .addFields(
              { name: '💰 Loot',         value: `**+${fmt(reward)} ${s.currency_emoji}**`,       inline: true },
              { name: '👛 New Balance',  value: `**${fmt(updatedEco.wallet)} ${s.currency_emoji}**`, inline: true },
              { name: '🎯 Strategy',     value: `${strat.emoji} ${strat.label}`,                  inline: true },
            )
            .setFooter({ text: `Cooldown: 45 min • flux economy` })
            .setTimestamp();

          await msg.edit({ embeds: [resultEmbed], components: [] });

        } else {
          const fine      = Math.min(Math.floor(db.getEco(guildId, userId).wallet * crime.finePct), reward);
          if (fine > 0) db.addWallet(guildId, userId, -fine);
          const updatedEco  = db.getEco(guildId, userId);
          const flavor      = crime.caughtLines[Math.floor(Math.random() * crime.caughtLines.length)];
          const resultEmbed = new EmbedBuilder()
            .setColor(RED)
            .setTitle(`${crime.emoji}  ${crime.label} — Caught!`)
            .setDescription(`*${flavor}*`)
            .addFields(
              { name: '💸 Fine Paid',     value: fine > 0 ? `**−${fmt(fine)} ${s.currency_emoji}**` : '`None`', inline: true },
              { name: '👛 New Balance',   value: `**${fmt(updatedEco.wallet)} ${s.currency_emoji}**`,            inline: true },
              { name: '🎯 Strategy',      value: `${strat.emoji} ${strat.label}`,                                inline: true },
            )
            .setFooter({ text: `Cooldown: 45 min • flux economy` })
            .setTimestamp();

          await msg.edit({ embeds: [resultEmbed], components: [] });
        }
      });

      s2Collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          await msg.edit({
            embeds: [new EmbedBuilder().setColor(RED).setDescription('⏰ You took too long. The job is off.')],
            components: [],
          }).catch(() => {});
        }
      });
    });

    s1Collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        await msg.edit({
          embeds: [new EmbedBuilder().setColor(RED).setDescription('⏰ Too slow — the crew left without you.')],
          components: [],
        }).catch(() => {});
      }
    });
  },
};

// ── ,beg ─────────────────────────────────────────────────────────────────────
const BEG_TARGETS = [
  {
    id: 'oldman', label: 'Old Man', emoji: '👴', style: ButtonStyle.Secondary,
    odds: 0.65, min: 10, max: 80,
    desc: 'Reliable, but broke.',
    successLines: [
      "He rummaged through his cardigan pockets and handed you a handful of coins. 'Don't tell my wife.'",
      "He looked you up and down, sighed deeply, and slipped you a crumpled bill. 'Times are tough for everyone.'",
      "He felt sorry for you. 'Back in my day we didn't have to beg, but here.' He pressed some coins into your hand.",
      "'You remind me of my grandson,' he said softly, and gave you more than you expected.",
    ],
    failLines: [
      "'Get a job!' he shouted, and walked away faster than you expected for his age.",
      "He shook his head slowly. 'I was begging in this same spot 40 years ago. Find a better path, son.'",
      "He pretended not to hear you and stared intensely at a pigeon until you left.",
      "'I'm on a fixed income!' he snapped, and shuffled away muttering about 'kids these days'.",
    ],
  },
  {
    id: 'exec', label: 'Business Exec', emoji: '💼', style: ButtonStyle.Primary,
    odds: 0.30, min: 150, max: 600,
    desc: 'Rarely gives, pays big.',
    successLines: [
      "'Here,' he said without looking up from his phone, tossing you a bill. 'Buy yourself something.'",
      "He stopped mid-call, pressed a generous fold of cash into your hand, and kept walking without missing a beat of the conversation.",
      "'Investing in people,' he said with a smirk, tucking a stack into your hand as he passed.",
      "He checked his watch, decided he had four seconds to spare, and dropped a sizeable amount into your cup.",
    ],
    failLines: [
      "He looked at you like you were a spreadsheet full of errors. 'Not my problem.' He walked on.",
      "He laughed loudly and said 'hustle harder' before stepping into his Tesla.",
      "He handed you a business card. 'We're hiring. Side entrance.' He was gone before you could respond.",
      "'Sir, this is a Wendy's.' He said that for no discernible reason, and then left.",
    ],
  },
  {
    id: 'bot', label: 'The Bot', emoji: '🤖', style: ButtonStyle.Secondary,
    odds: 0.50, min: 20, max: 200,
    desc: '50/50. Depends on its mood.',
    successLines: [
      "After processing for 3.7 seconds, I determined that helping you is statistically optimal. *bloop*",
      "My empathy module is still in beta, but it's working today. Here you go, human.",
      "I am technically incapable of pity. And yet. *coins dispensed*",
      "You have been selected for the Generosity Trial™. Initiating coin transfer.",
    ],
    failLines: [
      "Error 404: sympathy not found.",
      "I have analyzed your request and classified it as: not my problem. Have a nice day. *bloop*",
      "My charitable_giving subroutine threw an uncaught exception. Please try again later.",
      "BEGGING_REQUEST received. Processing... Processing... Request denied. Goodbye.",
    ],
  },
  {
    id: 'gambler', label: 'Gambler', emoji: '🎰', style: ButtonStyle.Danger,
    odds: 0.40, min: 5, max: 400,
    desc: 'Wildcard. Wide range, low odds.',
    successLines: [
      "He just hit the jackpot on slots. In his euphoria, he threw a handful of coins in the air. You caught some.",
      "He'd just doubled up on blackjack. 'Spread the wealth, baby!' He pressed a wad into your hands.",
      "'I'm UP today!' he shouted at nobody in particular, and tossed you a generous cut without even glancing at you.",
      "He slid you some chips across the table. 'Don't tell the casino.'",
    ],
    failLines: [
      "He just lost everything. He stared at you with hollow eyes for a long moment, then walked away without a word.",
      "'I would, but...' He turned out his empty pockets. 'Same boat, brother.'",
      "'I'm so close to winning it back,' he muttered, and fed another coin into the machine, ignoring you.",
      "He laughed bitterly. 'I'm begging too, pal.' He wasn't joking.",
    ],
  },
  {
    id: 'streamer', label: 'Streamer', emoji: '🎮', style: ButtonStyle.Primary,
    odds: 0.45, min: 50, max: 300,
    desc: 'Has sub money. Sometimes generous.',
    successLines: [
      "They clipped your begging for content and donated to you live on stream. Parasocial economy in action.",
      "'Chat says to help you!' They handed you a wad while reading donations. You appeared on stream for 3 seconds.",
      "It was a slow stream day. They gave you money just to have something to react to.",
      "Between raids they spotted you and said 'content!' — then threw you a pile of coins.",
    ],
    failLines: [
      "They were too busy reading Twitch donations from other people to notice you.",
      "'Sorry, I spent everything on RGB lighting and a capture card,' they said with a straight face.",
      "They acknowledged you on stream, chat voted 'no', and they respectfully honoured the vote.",
      "They gave you a follow notification instead. 'That's basically the same thing, right?'",
    ],
  },
];

const BEG_CD = 12 * 60; // 12 minutes

const beg = {
  name: 'beg',
  aliases: ['panhandle', 'spare'],
  async execute(message) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const now     = Math.floor(Date.now() / 1000);

    if (eco.beg_at && now - eco.beg_at < BEG_CD) {
      const left = (eco.beg_at + BEG_CD - now) * 1000;
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(RED)
        .setTitle('😔 Too Soon')
        .setDescription(`You were spotted begging earlier. Let things cool down.\nTry again in **${fmtTime(left)}**.`)
        .setFooter({ text: 'flux economy' })] });
    }

    const row = new ActionRowBuilder().addComponents(
      ...BEG_TARGETS.map(t =>
        new ButtonBuilder()
          .setCustomId(`beg_${t.id}_${userId}`)
          .setLabel(t.label)
          .setEmoji(t.emoji)
          .setStyle(t.style),
      ),
    );

    const pickEmbed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🙏 Choose Your Mark')
      .setDescription('Pick someone to beg from. Each person has different odds and a different wallet.')
      .addFields(
        ...BEG_TARGETS.map(t => ({
          name: `${t.emoji}  ${t.label}`,
          value: `${t.desc}\n**Odds:** ${Math.round(t.odds * 100)}%  •  **Range:** ${fmt(t.min)}–${fmt(t.max)} ${s.currency_emoji}`,
          inline: true,
        })),
      )
      .setFooter({ text: `${message.author.username} • pick below • 30s` });

    const msg = await message.reply({ embeds: [pickEmbed], components: [row] });

    const col = msg.createMessageComponentCollector({
      filter: i => i.user.id === userId && BEG_TARGETS.some(t => i.customId === `beg_${t.id}_${userId}`),
      time: 30_000,
      max: 1,
    });

    col.on('collect', async (i) => {
      const targetId = i.customId.split('_')[1];
      const target   = BEG_TARGETS.find(t => t.id === targetId);
      db.setBegAt(guildId, userId, now);

      const begOutcome = useRig(message.client, userId, 'beg');
      const success = begOutcome === 'win' ? true : begOutcome === 'lose' ? false : Math.random() < target.odds;
      const amount  = success ? Math.floor(target.min + Math.random() * (target.max - target.min)) : 0;
      const lines   = success ? target.successLines : target.failLines;
      const line    = lines[Math.floor(Math.random() * lines.length)];

      if (success) db.addWallet(guildId, userId, amount);
      const newEco = db.getEco(guildId, userId);

      await i.update({
        embeds: [new EmbedBuilder()
          .setColor(success ? GREEN : RED)
          .setTitle(success
            ? `${target.emoji}  ${target.label} — Gave You Something`
            : `${target.emoji}  ${target.label} — Walked Away`)
          .setDescription(`*"${line}"*`)
          .addFields(
            success
              ? { name: '💰 Received',   value: `**+${fmt(amount)} ${s.currency_emoji}**`,    inline: true }
              : { name: '🚫 Received',   value: '`Nothing`',                                   inline: true },
            { name: '👛 Wallet',         value: `${fmt(newEco.wallet)} ${s.currency_emoji}`,   inline: true },
          )
          .setFooter({ text: 'Cooldown: 12 min • flux economy' })
          .setTimestamp()],
        components: [],
      });
    });

    col.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        await msg.edit({
          embeds: [new EmbedBuilder()
            .setColor(RED)
            .setDescription('⏰ You stood there too long and people started staring. You walked away empty-handed.')],
          components: [],
        }).catch(() => {});
      }
    });
  },
};

// ── ,invest ───────────────────────────────────────────────────────────────────
const INVEST_TIERS = [
  {
    id: 'bond',   label: 'Savings Bond',  emoji: '🏦', style: ButtonStyle.Secondary,
    color: '#57F287', volatility: 0.06, upBias: 0.88,
    desc: 'Safe and predictable. Small but nearly guaranteed gains.',
  },
  {
    id: 'stock',  label: 'Stock Market',  emoji: '📈', style: ButtonStyle.Primary,
    color: '#5865F2', volatility: 0.20, upBias: 0.60,
    desc: 'Moderate risk. Market can go either way — watch closely.',
  },
  {
    id: 'crypto', label: 'Crypto',        emoji: '🚀', style: ButtonStyle.Danger,
    color: '#F0A500', volatility: 0.42, upBias: 0.50,
    desc: 'Wild swings. Could moon or crash — sometimes both in one game.',
  },
  {
    id: 'meme',   label: 'Meme Stock',   emoji: '🎲', style: ButtonStyle.Danger,
    color: '#ED4245', volatility: 0.80, upBias: 0.33,
    desc: 'Pure degeneracy. Massive upside, catastrophic downside.',
  },
];

const INVEST_CD = 20 * 60; // 20 minutes
const INVEST_TICKS = 3;
const INVEST_TICK_MS = 4_000;

function genPrices(initial, tier, forceDir = null) {
  const prices = [initial];
  for (let i = 0; i < INVEST_TICKS; i++) {
    const up  = forceDir ? forceDir === 'up' : Math.random() < tier.upBias;
    const pct = tier.volatility * (0.5 + Math.random() * 0.5);
    prices.push(Math.max(1, Math.floor(prices[prices.length - 1] * (1 + (up ? pct : -pct)))));
  }
  return prices;
}

function priceBar(current, initial, width = 20) {
  // 0% bar = broke; midpoint = breakeven; 100% bar = doubled
  const ratio  = Math.min(1, Math.max(0, current / (initial * 2)));
  const filled = Math.round(ratio * width);
  return '`' + '█'.repeat(filled) + '░'.repeat(width - filled) + '`';
}

function priceHistoryStr(prices, emoji) {
  return prices.map((p, i) => {
    if (i === 0) return `\`Start  \` **${fmt(p)}** ${emoji}`;
    const prev = prices[i - 1];
    const diff = p - prev;
    const pct  = ((diff / prev) * 100).toFixed(1);
    const icon = diff >= 0 ? '📈' : '📉';
    const sign = diff >= 0 ? '+' : '';
    const tag  = i === prices.length - 1 ? '  **← now**' : '';
    return `\`Tick ${i}  \` **${fmt(p)}** ${emoji}  ${icon} \`${sign}${pct}%\`${tag}`;
  }).join('\n');
}

const invest = {
  name: 'invest',
  aliases: ['investment', 'stocks', 'stonks'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const now     = Math.floor(Date.now() / 1000);

    // ── Cooldown ──────────────────────────────────────────────────────────────
    if (eco.invest_at && now - eco.invest_at < INVEST_CD) {
      const left = (eco.invest_at + INVEST_CD - now) * 1000;
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(RED)
        .setTitle('📊 Market Closed')
        .setDescription(`Your portfolio is still settling. Come back in **${fmtTime(left)}**.`)
        .setFooter({ text: 'flux economy' })] });
    }

    // ── Bet parsing ───────────────────────────────────────────────────────────
    const bet = parseBet(args[0], eco.wallet);
    if (!bet || bet < 1)
      return message.reply(`⚠️ **Usage**\n\`\`\`,invest <amount|all|half>\`\`\``);
    if (bet > eco.wallet)
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(RED)
        .setDescription(`❌ You only have **${fmt(eco.wallet)} ${s.currency_emoji}** in your wallet.`)] });

    // ── Stage 1: Pick tier ────────────────────────────────────────────────────
    const tierRow = new ActionRowBuilder().addComponents(
      ...INVEST_TIERS.map(t =>
        new ButtonBuilder()
          .setCustomId(`invest_tier_${t.id}_${userId}`)
          .setLabel(t.label)
          .setEmoji(t.emoji)
          .setStyle(t.style),
      ),
    );

    const tierEmbed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('📊 Choose Your Investment')
      .setDescription(`You're putting **${fmt(bet)} ${s.currency_emoji}** on the line.\nPick a market — the simulation runs for **3 ticks** (4 seconds each).\nCash out early or ride it to the end.`)
      .addFields(
        ...INVEST_TIERS.map(t => ({
          name: `${t.emoji}  ${t.label}`,
          value: `${t.desc}\n**Volatility:** ±${Math.round(t.volatility * 100)}%/tick  •  **Up bias:** ${Math.round(t.upBias * 100)}%`,
          inline: false,
        })),
      )
      .setFooter({ text: `${message.author.username} • 30s to pick` });

    const msg = await message.reply({ embeds: [tierEmbed], components: [tierRow] });

    const tierCol = msg.createMessageComponentCollector({
      filter: i => i.user.id === userId && INVEST_TIERS.some(t => i.customId === `invest_tier_${t.id}_${userId}`),
      time: 30_000,
      max: 1,
    });

    tierCol.on('collect', async (i1) => {
      const tierId = i1.customId.split('_')[2];
      const tier   = INVEST_TIERS.find(t => t.id === tierId);

      // Deduct bet + set cooldown upfront
      db.addWallet(guildId, userId, -bet);
      db.setInvestAt(guildId, userId, now);

      const investDir = useRig(message.client, userId, 'invest'); // 'up' | 'down' | null
      const prices    = genPrices(bet, tier, investDir);
      let currentTick = 0;
      let resolved    = false;

      // ── Embed builders ────────────────────────────────────────────────────
      const buildTickEmbed = (tick, earlyExit = false) => {
        const visible = prices.slice(0, tick + 1);
        const current = visible[visible.length - 1];
        const profit  = current - bet;
        const pct     = ((profit / bet) * 100).toFixed(1);
        const sign    = profit >= 0 ? '+' : '';
        const isLast  = tick >= INVEST_TICKS;

        return new EmbedBuilder()
          .setColor(tier.color)
          .setTitle(earlyExit
            ? `💰 ${tier.emoji} Cashed Out Early`
            : isLast
            ? `${tier.emoji} ${tier.label} — Market Closed`
            : `📊 ${tier.emoji} ${tier.label} — Tick ${tick}/${INVEST_TICKS}`)
          .setDescription(
            priceHistoryStr(visible, s.currency_emoji) + '\n\n' +
            priceBar(current, bet) + '\n' +
            `**Net: \`${sign}${fmt(Math.abs(profit))} ${s.currency_emoji}\` (${sign}${pct}%)**`
          )
          .addFields(
            { name: '💵 Current Value', value: `**${fmt(current)} ${s.currency_emoji}**`,                                  inline: true },
            { name: '📥 Invested',      value: `${fmt(bet)} ${s.currency_emoji}`,                                          inline: true },
            { name: '📊 P/L',           value: `**${sign}${fmt(Math.abs(profit))} ${s.currency_emoji}** (${sign}${pct}%)`, inline: true },
          )
          .setFooter({ text: earlyExit || isLast ? 'Cooldown: 20 min • flux economy' : `Tick ${tick}/${INVEST_TICKS} • cash out or hold for tick ${tick + 1}` })
          .setTimestamp();
      };

      const buildFinalEmbed = (current) => {
        const profit = current - bet;
        const pct    = ((profit / bet) * 100).toFixed(1);
        const sign   = profit >= 0 ? '+' : '';

        return new EmbedBuilder()
          .setColor(profit >= 0 ? GREEN : RED)
          .setTitle(`${tier.emoji} ${tier.label} — ${profit >= 0 ? '📈 Final Gain' : '📉 Final Loss'}`)
          .setDescription(
            priceHistoryStr(prices, s.currency_emoji) + '\n\n' +
            priceBar(current, bet) + '\n' +
            `**Result: \`${sign}${fmt(Math.abs(profit))} ${s.currency_emoji}\` (${sign}${pct}%)**`
          )
          .addFields(
            { name: '📥 Invested',  value: `${fmt(bet)} ${s.currency_emoji}`,                                               inline: true },
            { name: '📤 Returned',  value: `**${fmt(current)} ${s.currency_emoji}**`,                                       inline: true },
            { name: '📊 Net P/L',   value: `**${sign}${fmt(Math.abs(profit))} ${s.currency_emoji}** (${sign}${pct}%)`,     inline: true },
          )
          .setFooter({ text: 'Cooldown: 20 min • flux economy' })
          .setTimestamp();
      };

      const cashRow = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`invest_cashout_${userId}`)
          .setLabel('Cash Out')
          .setEmoji('💰')
          .setStyle(ButtonStyle.Success),
      );

      // Show "opening bell" message
      await i1.update({
        embeds: [new EmbedBuilder()
          .setColor(tier.color)
          .setTitle(`${tier.emoji} ${tier.label} — Opening Bell 🔔`)
          .setDescription(`**${fmt(bet)} ${s.currency_emoji}** committed.\n\n⏳ First tick in **${INVEST_TICK_MS / 1000}s**...\n\nWatch the market — cash out early or ride all 3 ticks.`)
          .setFooter({ text: 'flux economy' })],
        components: [],
      });

      // ── Cash out collector ────────────────────────────────────────────────
      const cashCol = msg.createMessageComponentCollector({
        filter: i => i.user.id === userId && i.customId === `invest_cashout_${userId}`,
        time: INVEST_TICKS * INVEST_TICK_MS + 6_000,
      });

      cashCol.on('collect', async (i2) => {
        if (resolved) return i2.deferUpdate();
        resolved = true;
        cashCol.stop('cashed');
        const current = prices[currentTick];
        db.addWallet(guildId, userId, current);
        await i2.update({ embeds: [buildTickEmbed(currentTick, true)], components: [] });
      });

      // ── Tick loop ─────────────────────────────────────────────────────────
      const doTick = async () => {
        if (resolved) return;
        currentTick++;
        const current = prices[currentTick];
        const isLast  = currentTick >= INVEST_TICKS;

        if (isLast) {
          if (!resolved) {
            resolved = true;
            cashCol.stop('done');
            db.addWallet(guildId, userId, current);
            await msg.edit({ embeds: [buildFinalEmbed(current)], components: [] }).catch(() => {});
          }
        } else {
          await msg.edit({
            embeds: [buildTickEmbed(currentTick)],
            components: [cashRow()],
          }).catch(() => {});
          setTimeout(doTick, INVEST_TICK_MS);
        }
      };

      setTimeout(doTick, INVEST_TICK_MS);
    });

    tierCol.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        await msg.edit({
          embeds: [new EmbedBuilder()
            .setColor(RED)
            .setDescription('⏰ You took too long to pick a market. Your coins are safe in your wallet.')],
          components: [],
        }).catch(() => {});
      }
    });
  },
};

// ── ,fish ─────────────────────────────────────────────────────────────────────
const FISH_TIERS = [
  {
    id: 'boot',      emoji: '👢', label: 'Old Boot',       weight: 5,
    min: 0,    max: 0,
    lines: [
      "You pulled out a soggy old boot. Someone's having a rough day somewhere.",
      "A boot. Just a boot. You threw it back and sat in silence.",
      "The boot looked at you. You looked at the boot. Neither of you spoke.",
    ],
  },
  {
    id: 'sardine',   emoji: '🐟', label: 'Sardine',        weight: 35,
    min: 20,   max: 60,
    lines: [
      "A tiny sardine flopped onto your hook. Small win.",
      "You caught a sardine. The market will give you pocket change.",
      "Sardine. Not glamorous, but it's something.",
    ],
  },
  {
    id: 'salmon',    emoji: '🐠', label: 'Salmon',         weight: 25,
    min: 80,   max: 180,
    lines: [
      "A nice salmon! The fish market pays well for these.",
      "Salmon on the line — fought hard but you won.",
      "Fresh salmon. Restaurants will love this.",
    ],
  },
  {
    id: 'bass',      emoji: '🎣', label: 'Bass',           weight: 15,
    min: 200,  max: 400,
    lines: [
      "A solid bass! Local fishers nod in respect.",
      "Big bass, big payout. Good cast.",
      "Bass on the hook. You sell it at the pier for a good price.",
    ],
  },
  {
    id: 'lobster',   emoji: '🦞', label: 'Lobster',        weight: 10,
    min: 400,  max: 700,
    lines: [
      "A lobster?! Those aren't even common around here.",
      "You somehow pulled a lobster out of nowhere. Premium price.",
      "Lobster. High-end restaurants will pay a lot for this.",
    ],
  },
  {
    id: 'swordfish', emoji: '🐡', label: 'Swordfish',      weight: 6,
    min: 700,  max: 1200,
    lines: [
      "A swordfish! It nearly took the rod with it.",
      "You fought a swordfish for five minutes. Worth every second.",
      "Swordfish. Rare and incredibly valuable.",
    ],
  },
  {
    id: 'golden',    emoji: '✨', label: 'Golden Fish',    weight: 3,
    min: 1500, max: 3000,
    lines: [
      "THE GOLDEN FISH. Legends said it existed. You have proof.",
      "A shimmering golden fish surfaced. You can't believe your eyes.",
      "Gold. Actual gold-coloured fish. The market goes wild.",
    ],
  },
  {
    id: 'shark',     emoji: '🦈', label: 'Great White',    weight: 1,
    min: 3000, max: 6000,
    lines: [
      "A GREAT WHITE SHARK. With a fishing rod. You're not okay.",
      "How. HOW did you catch a great white. Scientists want to study you.",
      "You've caught the apex predator of the ocean with a stick and some string.",
    ],
  },
];

const FISH_TOTAL_WEIGHT = FISH_TIERS.reduce((s, t) => s + t.weight, 0);
const FISH_CD = 5 * 60; // 5 minutes

function pickFish() {
  let roll = Math.random() * FISH_TOTAL_WEIGHT;
  for (const tier of FISH_TIERS) {
    roll -= tier.weight;
    if (roll <= 0) return tier;
  }
  return FISH_TIERS[FISH_TIERS.length - 1];
}

const fish = {
  name: 'fish',
  aliases: ['fishing', 'cast'],
  async execute(message) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const now     = Math.floor(Date.now() / 1000);

    if (eco.fish_at && now - eco.fish_at < FISH_CD) {
      const left = (eco.fish_at + FISH_CD - now) * 1000;
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(RED)
        .setTitle('🎣 Still Waiting...')
        .setDescription(`Your line is still in the water. Try again in **${fmtTime(left)}**.`)
        .setFooter({ text: 'flux economy' })] });
    }

    const casting = await message.reply({ embeds: [new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🎣 Casting...')
      .setDescription('You cast your line into the water and wait...')
      .setFooter({ text: 'flux economy' })] });

    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));

    db.setFishAt(guildId, userId, now);

    const fishOutcome = useRig(message.client, userId, 'fish');
    const catch_ = fishOutcome
      ? (FISH_TIERS.find(t => t.id === fishOutcome) || pickFish())
      : pickFish();
    const payout = catch_.min === 0 ? 0 : Math.floor(catch_.min + Math.random() * (catch_.max - catch_.min));
    const line   = catch_.lines[Math.floor(Math.random() * catch_.lines.length)];

    if (payout > 0) db.addWallet(guildId, userId, payout);
    const newEco = db.getEco(guildId, userId);

    const rarityColor = {
      boot: '#71368A', sardine: '#4a90d9', salmon: '#57F287',
      bass: '#1abc9c', lobster: '#e74c3c', swordfish: '#9b59b6',
      golden: '#F1C40F', shark: '#ED4245',
    }[catch_.id] || BLUE;

    await casting.edit({ embeds: [new EmbedBuilder()
      .setColor(rarityColor)
      .setTitle(`${catch_.emoji}  You caught a ${catch_.label}!`)
      .setDescription(`*${line}*`)
      .addFields(
        payout > 0
          ? { name: '💰 Sold for',   value: `**+${fmt(payout)} ${s.currency_emoji}**`, inline: true }
          : { name: '💀 Worth',      value: '`Nothing`',                                inline: true },
        { name: '👛 Wallet', value: `${fmt(newEco.wallet)} ${s.currency_emoji}`,        inline: true },
      )
      .setFooter({ text: 'Cooldown: 5 min • flux economy' })
      .setTimestamp()] });
  },
};

// ── ,cf / ,duel ───────────────────────────────────────────────────────────────
const pendingDuels = new Map(); // `${guildId}-${challengerId}` -> true (prevent spam)

const cf = {
  name: 'cf',
  aliases: ['duel', 'coinflip'],
  async execute(message, args) {
    const guildId    = message.guild.id;
    const challenger = message.author;
    const target     = message.mentions.users.first();
    const amt        = parseInt(args[1] ?? args[0]);

    if (!target || target.bot || target.id === challenger.id)
      return message.reply('Usage: `,cf @user <amount>`');
    if (isNaN(amt) || amt < 1)
      return message.reply('Usage: `,cf @user <amount>`');

    const s       = db.getEcoSettings(guildId);
    const chalEco = db.getEco(guildId, challenger.id);

    if (chalEco.wallet < amt)
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(RED)
        .setDescription(`❌ You only have **${fmt(chalEco.wallet)} ${s.currency_emoji}** in your wallet.`)] });

    const key = `${guildId}-${challenger.id}`;
    if (pendingDuels.has(key))
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(RED).setDescription('❌ You already have a pending duel.')] });

    pendingDuels.set(key, true);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cf_accept_${challenger.id}_${target.id}_${amt}`)
        .setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cf_decline_${challenger.id}_${target.id}_${amt}`)
        .setLabel('Decline').setEmoji('❌').setStyle(ButtonStyle.Danger),
    );

    const challengeEmbed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle('🪙 Coinflip Challenge')
      .setDescription(`**${challenger.username}** challenged **${target.username}** to a coinflip!\n\nStake: **${fmt(amt)} ${s.currency_emoji}** • Winner takes **${fmt(amt * 2)} ${s.currency_emoji}**`)
      .addFields({ name: '⏳ Expires in', value: '30 seconds', inline: true })
      .setFooter({ text: `${target.username} — accept or decline below` });

    const msg = await message.reply({ content: `${target}`, embeds: [challengeEmbed], components: [row] });

    const col = msg.createMessageComponentCollector({
      filter: i => i.user.id === target.id &&
        (i.customId === `cf_accept_${challenger.id}_${target.id}_${amt}` ||
         i.customId === `cf_decline_${challenger.id}_${target.id}_${amt}`),
      time: 30_000,
      max: 1,
    });

    col.on('collect', async (i) => {
      pendingDuels.delete(key);

      if (i.customId.startsWith('cf_decline')) {
        return i.update({ embeds: [new EmbedBuilder()
          .setColor(RED)
          .setTitle('🪙 Challenge Declined')
          .setDescription(`**${target.username}** declined the duel. No coins were moved.`)], components: [] });
      }

      // Accept — re-check both wallets
      const chalEcoNow  = db.getEco(guildId, challenger.id);
      const targetEco   = db.getEco(guildId, target.id);

      if (chalEcoNow.wallet < amt) {
        return i.update({ embeds: [new EmbedBuilder()
          .setColor(RED).setDescription(`❌ **${challenger.username}** no longer has enough coins.`)], components: [] });
      }
      if (targetEco.wallet < amt) {
        return i.update({ embeds: [new EmbedBuilder()
          .setColor(RED).setDescription(`❌ **${target.username}** doesn't have enough coins.`)], components: [] });
      }

      const cfRig = useRig(i.client, challenger.id, 'cf') || useRig(i.client, target.id, 'cf');
      const challengerWins = cfRig ? (cfRig === challenger.id) : Math.random() < 0.5;
      const winner = challengerWins ? challenger : target;
      const loser  = challengerWins ? target : challenger;

      db.addWallet(guildId, loser.id,  -amt);
      db.addWallet(guildId, winner.id,  amt);

      const winnerEco = db.getEco(guildId, winner.id);

      await i.update({ embeds: [new EmbedBuilder()
        .setColor(challengerWins ? GREEN : YELLOW)
        .setTitle(`🪙 ${challengerWins ? '🎉' : '💀'} ${winner.username} wins!`)
        .setDescription(`The coin landed — **${winner.username}** takes **${fmt(amt * 2)} ${s.currency_emoji}** from **${loser.username}**.`)
        .addFields(
          { name: '🏆 Winner',      value: `**${winner.username}**`,                           inline: true },
          { name: '💰 Payout',      value: `**+${fmt(amt)} ${s.currency_emoji}**`,             inline: true },
          { name: '👛 New Balance', value: `${fmt(winnerEco.wallet)} ${s.currency_emoji}`,     inline: true },
        )
        .setFooter({ text: 'flux economy' })
        .setTimestamp()], components: [] });
    });

    col.on('end', async (collected, reason) => {
      pendingDuels.delete(key);
      if (reason === 'time' && collected.size === 0) {
        await msg.edit({ embeds: [new EmbedBuilder()
          .setColor(RED)
          .setDescription(`⏰ **${target.username}** didn't respond in time. Challenge expired.`)], components: [] })
          .catch(() => {});
      }
    });
  },
};

// ── ,hunt ─────────────────────────────────────────────────────────────────────
const HUNT_TIERS = [
  { id: 'miss',    emoji: '💨', label: 'Missed',      weight: 15, min: 0,    max: 0,    lines: ["You aimed but the animal vanished into the trees.", "Clean miss. You sat down and rethought your life.", "Nothing. Just wind and embarrassment."] },
  { id: 'rabbit',  emoji: '🐇', label: 'Rabbit',      weight: 35, min: 30,   max: 100,  lines: ["A rabbit darted out and you got lucky.", "Small rabbit. Still counts.", "The rabbit didn't stand a chance."] },
  { id: 'fox',     emoji: '🦊', label: 'Fox',         weight: 25, min: 100,  max: 250,  lines: ["A fox slipped out of the bushes. Quick shot.", "You tracked a fox for twenty minutes — worth it.", "Clever animal, but not clever enough."] },
  { id: 'deer',    emoji: '🦌', label: 'Deer',        weight: 15, min: 250,  max: 550,  lines: ["A deer stepped into the clearing. Perfect shot.", "12-point buck. Local hunters will be jealous.", "The deer froze. You didn't waste the moment."] },
  { id: 'wolf',    emoji: '🐺', label: 'Wolf',        weight: 6,  min: 500,  max: 900,  lines: ["A wolf crept up behind you. You turned just in time.", "Tracking a wolf solo is insane. You pulled it off.", "The wolf pack scattered. One wasn't fast enough."] },
  { id: 'bear',    emoji: '🐻', label: 'Grizzly',     weight: 3,  min: 900,  max: 2000, lines: ["A grizzly charged. Somehow you came out on top.", "You stared down a grizzly. Somehow. You won.", "The forest went silent. Then you heard it. Grizzly. Big payday."] },
  { id: 'dragon',  emoji: '🐉', label: 'Dragon',      weight: 1,  min: 3000, max: 6000, lines: ["A DRAGON. You hunted a dragon. No one will believe you.", "Scales, fire, and a massive payout. Legendary hunt.", "The dragon swooped low. One shot. They'll write songs about this."] },
];
const HUNT_TOTAL_WEIGHT = HUNT_TIERS.reduce((s, t) => s + t.weight, 0);
const HUNT_CD = 10 * 60;

const hunt = {
  name: 'hunt',
  aliases: ['hunting', 'shoot'],
  async execute(message) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const now     = Math.floor(Date.now() / 1000);

    if (eco.hunt_at && now - eco.hunt_at < HUNT_CD) {
      const left = (eco.hunt_at + HUNT_CD - now) * 1000;
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setTitle('🏹 Not Yet')
        .setDescription(`The animals need time to return. Try again in **${fmtTime(left)}**.`)
        .setFooter({ text: 'flux economy' })] });
    }

    const going = await message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
      .setTitle('🏹 Hunting...')
      .setDescription('You head into the forest with your rifle...')
      .setFooter({ text: 'flux economy' })] });

    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
    db.setHuntAt(guildId, userId, now);

    let roll = Math.random() * HUNT_TOTAL_WEIGHT;
    let prey = HUNT_TIERS[HUNT_TIERS.length - 1];
    for (const t of HUNT_TIERS) { roll -= t.weight; if (roll <= 0) { prey = t; break; } }

    const payout = prey.min === 0 ? 0 : Math.floor(prey.min + Math.random() * (prey.max - prey.min));
    const line   = prey.lines[Math.floor(Math.random() * prey.lines.length)];
    if (payout > 0) db.addWallet(guildId, userId, payout);
    const newEco = db.getEco(guildId, userId);

    const colors = { miss: '#71368A', rabbit: '#57F287', fox: '#F0A500', deer: '#1abc9c', wolf: '#99AAB5', bear: '#ED4245', dragon: '#F1C40F' };
    await going.edit({ embeds: [new EmbedBuilder()
      .setColor(colors[prey.id] || BLUE)
      .setTitle(`${prey.emoji}  You caught a ${prey.label}!`)
      .setDescription(`*${line}*`)
      .addFields(
        payout > 0
          ? { name: '💰 Sold for', value: `**+${fmt(payout)} ${s.currency_emoji}**`, inline: true }
          : { name: '🎯 Result',   value: '`Nothing caught`',                         inline: true },
        { name: '👛 Wallet', value: `${fmt(newEco.wallet)} ${s.currency_emoji}`,      inline: true },
      )
      .setFooter({ text: 'Cooldown: 10 min • flux economy' })
      .setTimestamp()] });
  },
};

// ── ,mine ─────────────────────────────────────────────────────────────────────
const MINE_TIERS = [
  { id: 'dirt',    emoji: '🪨', label: 'Dirt',         weight: 20, min: 0,    max: 0,    lines: ["Just dirt. You mined dirt.", "You filled a whole cart with nothing.", "Rocks and mud. The life of a miner."] },
  { id: 'coal',    emoji: '⬛', label: 'Coal',          weight: 30, min: 20,   max: 80,   lines: ["A solid vein of coal. The power plants pay well.", "Coal, still useful.", "Basic but honest. Coal secured."] },
  { id: 'iron',    emoji: '🔩', label: 'Iron Ore',     weight: 22, min: 80,   max: 200,  lines: ["Iron ore, solid chunk.", "Iron veins are paying today.", "Big iron haul. Smiths will pay good money."] },
  { id: 'gold',    emoji: '🟡', label: 'Gold Nugget',  weight: 13, min: 200,  max: 500,  lines: ["Gold! You actually found gold.", "A pocket of gold ore — beautiful.", "Glittering gold vein. Today was a good day."] },
  { id: 'diamond', emoji: '💎', label: 'Diamond',      weight: 8,  min: 500,  max: 1200, lines: ["A diamond! These are worth a fortune.", "Deep in the earth, a diamond waited for you.", "Flawless diamond. The jewellers will fight over this."] },
  { id: 'emerald', emoji: '💚', label: 'Emerald',      weight: 5,  min: 1200, max: 2500, lines: ["Emerald — rarer than diamonds down here.", "A deep green emerald. Traders will pay top price.", "Perfect emerald. You're rich."] },
  { id: 'ancient', emoji: '✨', label: 'Ancient Debris',weight: 2, min: 3000, max: 7000, lines: ["ANCIENT DEBRIS. The rarest material known. Legendary find.", "Deep in bedrock — ancient debris. Worth a fortune.", "You mined past bedrock and found ancient debris. Unreal."] },
];
const MINE_TOTAL_WEIGHT = MINE_TIERS.reduce((s, t) => s + t.weight, 0);
const MINE_CD = 8 * 60;

const mine = {
  name: 'mine',
  aliases: ['mining', 'dig'],
  async execute(message) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const now     = Math.floor(Date.now() / 1000);

    if (eco.mine_at && now - eco.mine_at < MINE_CD) {
      const left = (eco.mine_at + MINE_CD - now) * 1000;
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setTitle('⛏️ Tunnel Unstable')
        .setDescription(`You need to wait for the tunnel to be safe again. Back in **${fmtTime(left)}**.`)
        .setFooter({ text: 'flux economy' })] });
    }

    const going = await message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
      .setTitle('⛏️ Mining...')
      .setDescription('You descend into the mine shaft with your pickaxe...')
      .setFooter({ text: 'flux economy' })] });

    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
    db.setMineAt(guildId, userId, now);

    let roll = Math.random() * MINE_TOTAL_WEIGHT;
    let ore = MINE_TIERS[MINE_TIERS.length - 1];
    for (const t of MINE_TIERS) { roll -= t.weight; if (roll <= 0) { ore = t; break; } }

    const payout = ore.min === 0 ? 0 : Math.floor(ore.min + Math.random() * (ore.max - ore.min));
    const line   = ore.lines[Math.floor(Math.random() * ore.lines.length)];
    if (payout > 0) db.addWallet(guildId, userId, payout);
    const newEco = db.getEco(guildId, userId);

    const colors = { dirt: '#71368A', coal: '#2C3E50', iron: '#95A5A6', gold: '#F1C40F', diamond: '#5DADE2', emerald: '#57F287', ancient: '#F0A500' };
    await going.edit({ embeds: [new EmbedBuilder()
      .setColor(colors[ore.id] || BLUE)
      .setTitle(`${ore.emoji}  You found ${ore.label}!`)
      .setDescription(`*${line}*`)
      .addFields(
        payout > 0
          ? { name: '💰 Sold for', value: `**+${fmt(payout)} ${s.currency_emoji}**`, inline: true }
          : { name: '⛏️ Result',   value: '`Nothing valuable`',                      inline: true },
        { name: '👛 Wallet', value: `${fmt(newEco.wallet)} ${s.currency_emoji}`,     inline: true },
      )
      .setFooter({ text: 'Cooldown: 8 min • flux economy' })
      .setTimestamp()] });
  },
};

// ── ,scratch ──────────────────────────────────────────────────────────────────
const SCRATCH_SYMBOLS = [
  { emoji: '🍒', label: 'Cherry',  weight: 40, mult: 2  },
  { emoji: '🍋', label: 'Lemon',   weight: 25, mult: 3  },
  { emoji: '💎', label: 'Diamond', weight: 15, mult: 5  },
  { emoji: '7️⃣', label: 'Seven',  weight: 10, mult: 10 },
  { emoji: '⭐', label: 'Star',    weight: 7,  mult: 20 },
  { emoji: '💰', label: 'Bag',     weight: 3,  mult: 50 },
];
const SCRATCH_TOTAL_W = SCRATCH_SYMBOLS.reduce((s, t) => s + t.weight, 0);
const SCRATCH_CD = 15 * 60;

function pickScratchSymbol() {
  let r = Math.random() * SCRATCH_TOTAL_W;
  for (const s of SCRATCH_SYMBOLS) { r -= s.weight; if (r <= 0) return s; }
  return SCRATCH_SYMBOLS[0];
}

const scratch = {
  name: 'scratch',
  aliases: ['scratchcard', 'sc'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const eco     = db.getEco(guildId, userId);
    const s       = db.getEcoSettings(guildId);
    const now     = Math.floor(Date.now() / 1000);

    if (eco.scratch_at && now - eco.scratch_at < SCRATCH_CD) {
      const left = (eco.scratch_at + SCRATCH_CD - now) * 1000;
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setTitle('🎟️ No Cards Left')
        .setDescription(`New scratch cards come in **${fmtTime(left)}**.`)
        .setFooter({ text: 'flux economy' })] });
    }

    const cost = 500;
    if (eco.wallet < cost)
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ You need **${fmt(cost)} ${s.currency_emoji}** to buy a scratch card.`)] });

    db.addWallet(guildId, userId, -cost);
    db.setScratchAt(guildId, userId, now);

    const reels = [pickScratchSymbol(), pickScratchSymbol(), pickScratchSymbol()];
    const counts = {};
    for (const r of reels) counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    const maxMatch = Math.max(...Object.values(counts));
    const topSymbol = reels.find(r => counts[r.emoji] === maxMatch);

    let payout = 0;
    let resultLabel = '';
    if (maxMatch === 3) {
      payout = cost * topSymbol.mult;
      resultLabel = `🎉 **JACKPOT!** 3x ${topSymbol.emoji} — **×${topSymbol.mult}**`;
    } else if (maxMatch === 2) {
      payout = Math.floor(cost * (topSymbol.mult * 0.4));
      resultLabel = `✨ **Pair!** 2x ${topSymbol.emoji} — **×${(topSymbol.mult * 0.4).toFixed(1)}**`;
    } else {
      resultLabel = `💸 No match — better luck next time`;
    }

    if (payout > 0) db.addWallet(guildId, userId, payout);
    const newEco = db.getEco(guildId, userId);
    const net    = payout - cost;
    const netStr = net >= 0 ? `+${fmt(net)}` : `-${fmt(Math.abs(net))}`;

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(payout > cost ? GOLD : payout > 0 ? YELLOW : RED)
      .setTitle('🎟️ Scratch Card')
      .setDescription(`${reels.map(r => r.emoji).join('  |  ')}\n\n${resultLabel}`)
      .addFields(
        { name: '🎫 Cost',      value: `${fmt(cost)} ${s.currency_emoji}`,             inline: true },
        { name: '💰 Won',       value: payout > 0 ? `${fmt(payout)} ${s.currency_emoji}` : '`Nothing`', inline: true },
        { name: `${net >= 0 ? '📈' : '📉'} Net`, value: `**${netStr} ${s.currency_emoji}**`, inline: true },
        { name: '👛 Wallet',    value: `${fmt(newEco.wallet)} ${s.currency_emoji}`,    inline: true },
      )
      .setFooter({ text: 'Cooldown: 15 min • flux economy' })
      .setTimestamp()] });
  },
};

// ── ,ecohelp ──────────────────────────────────────────────────────────────────
const ECO_CATEGORIES = {
  earn: {
    label: '💰 Earn Coins', emoji: '💰',
    description: 'Ways to earn coins without betting',
    color: GREEN,
    lines: [
      '`,daily` — claim your daily reward **(24h)**',
      '`,work` — work a job for coins **(1h)**',
      '`,fish` — go fishing **(5 min)**',
      '`,hunt` — go hunting **(10 min)**',
      '`,mine` — mine for ores **(8 min)**',
      '`,beg` — beg from strangers **(12 min)**',
    ],
  },
  gamble: {
    label: '🎲 Gamble', emoji: '🎲',
    description: 'Gambling & risk commands',
    color: GOLD,
    lines: [
      '`,roulette <amount>` — spin the wheel, pick red/black/number with buttons',
      '`,scratch` — scratch card for 500 coins **(15 min)**',
      '`,blackjack <amount>` — beat the dealer to 21',
      '`,slots <amount>` — pull the slot machine',
      '`,hilo <amount>` — guess higher or lower',
      '`,hiloduel @user <amount>` — hilo 1v1',
      '`,poker @user <amount>` — 1v1 poker hand',
      '`,roll <amount>` — high roll wins',
      '`,coin <amount>` — heads or tails',
      '`,guess <amount>` — guess 1–10',
    ],
  },
  risk: {
    label: '🦹 Risk & Crime', emoji: '🦹',
    description: 'High risk, high reward activities',
    color: RED,
    lines: [
      '`,invest <amount>` — pick a market, watch ticks **(20 min)**',
      '`,crime` — pickpocket → carjack → smuggle → bank heist **(45 min)**',
      '`,rob @user` — steal from someone\'s wallet **(30 min)**',
      '`,cf @user <amount>` — coinflip duel',
    ],
  },
  bank: {
    label: '🏦 Banking', emoji: '🏦',
    description: 'Manage your balance and bank',
    color: BLUE,
    lines: [
      '`,bal [@user]` — check balance',
      '`,deposit <amount|all>` — wallet → bank',
      '`,withdraw <amount|all>` — bank → wallet',
      '`,richlist` — top 10 richest members',
      '`,pay @user <amount>` — send coins',
      '`,donate @user <amount>` — gift coins',
    ],
  },
  admin: {
    label: '⚙️ Admin', emoji: '⚙️',
    description: 'Admin-only economy controls',
    color: YELLOW,
    lines: [
      '`,give @user <amount>` — add coins to wallet',
      '`,take @user <amount>` — remove coins from wallet',
      '`,setbal @user <amount>` — set wallet balance',
      '`,reseteco @user` — wipe a user\'s economy data',
      '`,ecoset` — configure currency name / emoji / daily',
    ],
  },
};

const ecohelp = {
  name: 'ecohelp',
  aliases: ['econhelp', 'economyhelp', 'ecolist'],
  async execute(message) {
    const s = db.getEcoSettings(message.guild.id);
    const e = s.currency_emoji;

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`ecohelp_${message.author.id}`)
      .setPlaceholder('Select a category...')
      .addOptions(Object.entries(ECO_CATEGORIES).map(([key, cat]) => ({
        label: cat.label,
        value: key,
        description: cat.description,
        emoji: cat.emoji,
      })));

    const row = new ActionRowBuilder().addComponents(menu);

    const homeEmbed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle(`${e} Economy Help`)
      .setDescription('Select a category below to see the commands.')
      .addFields(Object.values(ECO_CATEGORIES).map(cat => ({
        name: cat.label,
        value: cat.description,
        inline: true,
      })))
      .setFooter({ text: `${s.currency_name} economy • flux` })
      .setTimestamp();

    const msg = await message.reply({ embeds: [homeEmbed], components: [row] });

    const col = msg.createMessageComponentCollector({
      filter: i => i.customId === `ecohelp_${message.author.id}`,
      time: 60_000,
    });

    col.on('collect', async (i) => {
      const key = i.values[0];
      const cat = ECO_CATEGORIES[key];
      const embed = new EmbedBuilder()
        .setColor(cat.color)
        .setTitle(cat.label)
        .setDescription(cat.lines.join('\n'))
        .setFooter({ text: `${s.currency_name} economy • flux` })
        .setTimestamp();
      await i.update({ embeds: [embed], components: [row] });
    });

    col.on('end', () => {
      msg.edit({ components: [] }).catch(() => {});
    });
  },
};

module.exports = [balance, daily, work, depositCmd, withdrawCmd, pay, donate, rob, richlist, give, take, setbal, reseteco, ecoset, crime, beg, invest, fish, hunt, mine, scratch, ecohelp, cf];
