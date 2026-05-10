'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';

const LOG_EVENTS = ['ban', 'kick', 'mute', 'warn', 'message_delete', 'message_edit', 'member_join', 'member_leave', 'role_create', 'role_delete', 'channel_create', 'channel_delete', 'voice_join', 'voice_leave', 'invite_create', 'invite_delete'];

const log = {
  name: 'log',
  aliases: ['logs', 'logging', 'logger'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (!sub || sub.startsWith('<#')) {
      const channel = message.mentions.channels.first();
      const events = args.slice(1).join(' ') || 'all';
      if (!channel) return message.reply('Usage: `,log <#channel> [events]`');
      db.setLogChannel?.(message.guild.id, channel.id, events);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setTitle('📋 Logging Configured')
        .addFields(
          { name: '📌 Channel', value: `${channel}`,  inline: true },
          { name: '📊 Events',  value: events,         inline: true },
        )
        .setTimestamp()] });
    }

    if (sub === 'off') {
      const events = args.slice(1).join(' ') || 'all';
      db.disableLog?.(message.guild.id, events);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Disabled logging for: **${events}**.`)] });
    }

    if (sub === 'setup') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setTitle('📋 Logging Setup')
        .setDescription(`**Available Events:**\n${LOG_EVENTS.map(e => `\`${e}\``).join(', ')}\n\n**Usage:** \`,log <#channel> <event1> <event2>...\`\nor \`,log <#channel> all\` for everything.`)
        .setTimestamp()] });
    }

    if (sub === 'ignore') {
      const target = message.mentions.channels.first() || message.mentions.users.first();
      if (!target) return message.reply('Usage: `,log ignore <#channel or @user> [events]`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Ignoring **${target.name || target.username}** from logging.`)] });
    }

    if (sub === 'unignore') {
      const target = message.mentions.channels.first() || message.mentions.users.first();
      if (!target) return message.reply('Usage: `,log unignore <#channel or @user>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed ignore rule for **${target.name || target.username}**.`)] });
    }

    if (sub === 'color') {
      const event = args[1];
      const hex = args[2]?.replace('#', '');
      if (!event || !hex) return message.reply('Usage: `,log color <event> <#hex>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(parseInt(hex, 16)).setDescription(`✅ Set **${event}** log color to **#${hex.toUpperCase()}**.`)] });
    }

    if (sub === 'list' || sub === 'status') {
      const config = db.getLogConfig?.(message.guild.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setTitle('📋 Logging Configuration')
        .setDescription(config ? `Logging to <#${config.channel_id}> for: ${config.events || 'all events'}` : 'No logging configured. Use `,log <#channel>` to start.')
        .setTimestamp()] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
      .setAuthor({ name: '📋 Logging' })
      .setDescription('**Subcommands:** `<#ch> [events]`, `off [events]`, `setup`, `ignore`, `unignore`, `color`, `list`')
      .setTimestamp()] });
  }
};

module.exports = [log];
