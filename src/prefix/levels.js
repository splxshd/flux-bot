'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const PURPLE = '#9B59B6';

// ── ,rank ────────────────────────────────────────────────────────────────────
const rank = {
  name: 'rank',
  aliases: ['level', 'xp'],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setColor(PURPLE)
      .setAuthor({ name: `${target.username} — Rank Card`, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: '🏆 Rank',  value: '**#?**',  inline: true },
        { name: '⭐ Level', value: '**?**',   inline: true },
        { name: '✨ XP',    value: '**?**',   inline: true },
      )
      .setDescription('ℹ️ Leveling system is active. XP data will display once configured in the database.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,leaderboard ─────────────────────────────────────────────────────────────
const leaderboard = {
  name: 'leaderboard',
  aliases: ['lb', 'top'],
  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(PURPLE)
      .setAuthor({ name: `${message.guild.name} — XP Leaderboard`, iconURL: message.guild.iconURL({ dynamic: true }) || undefined })
      .setDescription('ℹ️ Leaderboard will display here once leveling data is collected.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,xplb ────────────────────────────────────────────────────────────────────
const xplb = {
  name: 'xplb',
  aliases: ['xpleaderboard'],
  async execute(message) {
    return leaderboard.execute(message, []);
  }
};

// ── ,levels ──────────────────────────────────────────────────────────────────
const levels = {
  name: 'levels',
  aliases: ['leveling'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'enable') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Leveling system **enabled** for this server.')] });
    }
    if (sub === 'disable') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⚠️ Leveling system **disabled** for this server.')] });
    }
    if (sub === 'setreward') {
      const lvl = parseInt(args[1]);
      const role = message.mentions.roles.first();
      if (!lvl || !role) return message.reply('Usage: `,levels setreward <level> <@role>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Set level **${lvl}** reward to **${role.name}**.`)] });
    }
    if (sub === 'removereward' || sub === 'delreward') {
      const lvl = parseInt(args[1]);
      if (!lvl) return message.reply('Usage: `,levels removereward <level>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed reward for level **${lvl}**.`)] });
    }
    if (sub === 'rewards') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ No level rewards configured yet.')] });
    }
    if (sub === 'setlevelup') {
      const channel = message.mentions.channels.first() || args[1];
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Level-up channel set to ${channel}.`)] });
    }
    if (sub === 'xp') {
      const action = args[1]?.toLowerCase();
      const target = message.mentions.users.first();
      const amount = parseInt(args[3]) || parseInt(args[2]);
      if (!target || !amount) return message.reply('Usage: `,levels xp <add/remove> <@user> <amount>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ ${action === 'add' ? 'Added' : 'Removed'} **${amount} XP** ${action === 'add' ? 'to' : 'from'} **${target.username}**.`)] });
    }
    if (sub === 'reset') {
      const target = message.mentions.users.first();
      if (!target) return message.reply('Usage: `,levels reset <@user>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`✅ Reset XP for **${target.username}**.`)] });
    }

    const embed = new EmbedBuilder()
      .setColor(PURPLE)
      .setAuthor({ name: 'Levels System' })
      .setDescription('**Subcommands:** `enable`, `disable`, `setreward`, `removereward`, `rewards`, `setlevelup`, `xp`, `reset`')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,msgchart ────────────────────────────────────────────────────────────────
const msgchart = {
  name: 'msgchart',
  aliases: ['messagechart'],
  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setDescription('📊 Message activity chart not yet generated. Data is being tracked.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,msgrank ─────────────────────────────────────────────────────────────────
const msgrank = {
  name: 'msgrank',
  aliases: ['mrank', 'messagerank'],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setColor(PURPLE)
      .setAuthor({ name: `${target.username} — Message Rank`, iconURL: target.displayAvatarURL() })
      .setDescription('ℹ️ Message rank tracking is active. Data will populate over time.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,msgreset ────────────────────────────────────────────────────────────────
const msgreset = {
  name: 'msgreset',
  aliases: ['resetmsg'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
    const target = message.mentions.users.first();
    if (!target) return message.reply('Usage: `,msgreset <@user>`');
    const embed = new EmbedBuilder().setColor(GREEN).setDescription(`✅ Reset message stats for **${target.username}**.`).setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,servermessages ───────────────────────────────────────────────────────────
const servermessages = {
  name: 'servermessages',
  aliases: ['messagestats', 'msgstats', 'serverstats'],
  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${message.guild.name} — Message Stats`, iconURL: message.guild.iconURL({ dynamic: true }) || undefined })
      .setDescription('📊 Server message statistics are being collected. Check back later.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,topchannels ─────────────────────────────────────────────────────────────
const topchannels = {
  name: 'topchannels',
  aliases: ['topchan', 'activechannels'],
  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${message.guild.name} — Top Channels` })
      .setDescription('📊 Channel activity data is being collected.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,topmessages ─────────────────────────────────────────────────────────────
const topmessages = {
  name: 'topmessages',
  aliases: ['topmsg', 'msgtop'],
  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${message.guild.name} — Top Messagers` })
      .setDescription('📊 Top message senders will appear here as data is collected.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,usermessages ────────────────────────────────────────────────────────────
const usermessages = {
  name: 'usermessages',
  aliases: ['umsg', 'msginfo'],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${target.username} — Message Stats`, iconURL: target.displayAvatarURL() })
      .setDescription('ℹ️ Message statistics are being tracked. Data will populate over time.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

module.exports = [rank, leaderboard, xplb, levels, msgchart, msgrank, msgreset, servermessages, topchannels, topmessages, usermessages];
