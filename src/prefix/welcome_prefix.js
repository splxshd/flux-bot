'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';

// ── ,welcome ──────────────────────────────────────────────────────────────────
const welcome = {
  name: 'welcome',
  aliases: ['greet', 'wlc'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'add') {
      const channel = message.mentions.channels.first();
      const msg = args.slice(2).join(' ');
      if (!channel || !msg) return message.reply('Usage: `,welcome add <#channel> <message>`');
      db.setWelcome?.(message.guild.id, channel.id, msg);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Welcome message set for ${channel}.\n\n**Preview:** ${msg.slice(0, 200)}`)] });
    }

    if (sub === 'remove') {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('Usage: `,welcome remove <#channel>`');
      db.removeWelcome?.(message.guild.id, channel.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed welcome message for ${channel}.`)] });
    }

    if (sub === 'list') {
      const list = db.getWelcomes?.(message.guild.id) || [];
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('👋 Welcome Messages').setDescription(list.length ? list.map(w => `<#${w.channel_id}>`).join('\n') : 'No welcome messages set.').setTimestamp()] });
    }

    if (sub === 'view') {
      const channel = message.mentions.channels.first() || message.channel;
      const w = db.getWelcome?.(message.guild.id, channel.id);
      if (!w) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No welcome message for that channel.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle(`Welcome Preview — #${channel.name}`).setDescription(w.message.replace('{user}', `<@${message.author.id}>`).replace('{server}', message.guild.name)).setTimestamp()] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setAuthor({ name: '👋 Welcome' }).setDescription('**Subcommands:** `add <#ch> <msg>`, `remove <#ch>`, `list`, `view [#ch]`\n\n**Variables:** `{user}` `{server}` `{membercount}`').setTimestamp()] });
  }
};

// ── ,goodbye ──────────────────────────────────────────────────────────────────
const goodbye = {
  name: 'goodbye',
  aliases: ['bye', 'farewell'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'add') {
      const channel = message.mentions.channels.first();
      const msg = args.slice(2).join(' ');
      if (!channel || !msg) return message.reply('Usage: `,goodbye add <#channel> <message>`');
      db.setGoodbye?.(message.guild.id, channel.id, msg);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Goodbye message set for ${channel}.`)] });
    }

    if (sub === 'remove') {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('Usage: `,goodbye remove <#channel>`');
      db.removeGoodbye?.(message.guild.id, channel.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed goodbye message for ${channel}.`)] });
    }

    if (sub === 'list') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('👋 Goodbye Messages').setDescription('ℹ️ No goodbye messages configured.').setTimestamp()] });
    }

    if (sub === 'view') {
      const channel = message.mentions.channels.first() || message.channel;
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle(`Goodbye Preview — #${channel.name}`).setDescription('ℹ️ No goodbye message set for this channel.').setTimestamp()] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setAuthor({ name: '👋 Goodbye' }).setDescription('**Subcommands:** `add <#ch> <msg>`, `remove <#ch>`, `list`, `view [#ch]`').setTimestamp()] });
  }
};

module.exports = [welcome, goodbye];
