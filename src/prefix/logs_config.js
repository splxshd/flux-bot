'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';
const YELLOW = '#FEE75C';

const LOG_EVENTS = ['ban','kick','mute','warn','message_delete','message_edit','member_join','member_leave','role_update','channel_create','channel_delete','voice'];

const logs = {
  name: 'logs',
  aliases: ['log', 'logging'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });

    const sub = args[0]?.toLowerCase();
    const settings = db.getGuildSettings(message.guild.id);

    if (sub === 'setup' || sub === 'channel') {
      const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!ch) return message.reply('Usage: `,logs setup <#channel>`');
      db.updateGuildSettings(message.guild.id, { log_channel: ch.id });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setTitle('📋 Log Channel Set')
        .setDescription(`All logs will be sent to ${ch}.`)
        .setTimestamp()] });
    }

    if (sub === 'view' || sub === 'events') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setTitle('📋 Logging Configuration')
        .addFields(
          { name: '📍 Log Channel', value: settings?.log_channel ? `<#${settings.log_channel}>` : 'Not set', inline: true },
          { name: '📊 Events Tracked', value: LOG_EVENTS.join(', '), inline: false },
        )
        .setTimestamp()] });
    }

    if (sub === 'disable' || sub === 'clear') {
      db.updateGuildSettings(message.guild.id, { log_channel: null });
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⚠️ Logging disabled. No log channel set.')] });
    }

    if (sub === 'test') {
      const logCh = settings?.log_channel ? message.guild.channels.cache.get(settings.log_channel) : null;
      if (!logCh) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No log channel set. Use `,logs setup <#channel>`.')] });
      await logCh.send({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setTitle('✅ Log Test')
        .setDescription(`Logging is working correctly. Triggered by ${message.author}.`)
        .setTimestamp()] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Test log sent to ${logCh}.`)] });
    }

    if (sub === 'ignore') {
      const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!ch) return message.reply('Usage: `,logs ignore <#channel>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ ${ch} will now be ignored in logs.`)] });
    }

    message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
      .setTitle('📋 Logs — Subcommands')
      .addFields(
        { name: '`,logs setup <#ch>`',   value: 'Set the log channel', inline: true },
        { name: '`,logs view`',           value: 'View current config', inline: true },
        { name: '`,logs test`',           value: 'Send a test log',     inline: true },
        { name: '`,logs ignore <#ch>`',   value: 'Ignore a channel',    inline: true },
        { name: '`,logs disable`',        value: 'Disable logging',     inline: true },
      )
      .setTimestamp()] });
  }
};

module.exports = [logs];
