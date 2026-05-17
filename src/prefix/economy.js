'use strict';

const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');

const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const BLUE   = '#5865F2';
const GOLD   = '#F1C40F';

// ── Helpers ───────────────────────────────────────────────────────────────────
const OWNER_ID = process.env.OWNER_ID ?? '';

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
  return message.author.id === OWNER_ID
    || message.guild.ownerId === message.author.id
    || message.member.permissions.has(PermissionFlagsBits.Administrator);
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

    // 45% success chance
    if (Math.random() < 0.45) {
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
        const success     = Math.random() < finalOdds;
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

module.exports = [balance, daily, work, depositCmd, withdrawCmd, pay, donate, rob, richlist, give, take, setbal, reseteco, ecoset, crime];
