'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
  name: 'balance',
  aliases: ['bal', 'wallet', 'eco', 'money'],
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

module.exports = [balance, daily, work, depositCmd, withdrawCmd, pay, rob, richlist, give, take, setbal, reseteco, ecoset];
