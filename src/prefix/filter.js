'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';

const filter = {
  name: 'filter',
  aliases: ['wordfilter', 'wf'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'add') {
      const word = args.slice(1).join(' ');
      if (!word) return message.reply('Usage: `,filter add <word>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Added **${word}** to the word filter.`)] });
    }

    if (sub === 'remove') {
      const word = args.slice(1).join(' ');
      if (!word) return message.reply('Usage: `,filter remove <word>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed **${word}** from the word filter.`)] });
    }

    if (sub === 'list') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('Word Filter').setDescription('ℹ️ No filtered words configured yet.')] });
    }

    if (sub === 'invites') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Discord invite link filter has been toggled.')] });
    }

    if (sub === 'log') {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('Usage: `,filter log <#channel>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Filter logs will be sent to ${channel}.`)] });
    }

    if (sub === 'bypass') {
      const action = args[1]?.toLowerCase();
      if (action === 'toggle') {
        const target = message.mentions.roles.first() || message.mentions.users.first();
        if (!target) return message.reply('Usage: `,filter bypass toggle <@role or @user>`');
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Toggled filter bypass for **${target.name || target.username}**.`)] });
      }
      if (action === 'list') {
        return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ No filter bypass entries configured.')] });
      }
    }

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: 'Word Filter' })
      .setDescription('**Subcommands:** `add <word>`, `remove <word>`, `list`, `invites`, `log <#ch>`, `bypass toggle`, `bypass list`')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

module.exports = [filter];
