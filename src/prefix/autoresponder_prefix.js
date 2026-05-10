'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';

const ar = {
  name: 'ar',
  aliases: ['autoresponder', 'autoresponse'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'add') {
      const rest = args.slice(1).join(' ');
      const parts = rest.split('|');
      if (parts.length < 2) return message.reply('Usage: `,ar add <trigger> | <response>` — separate trigger and response with `|`');
      const trigger = parts[0].trim();
      const response = parts.slice(1).join('|').trim();
      db.addAutoresponder(message.guild.id, trigger, response);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setTitle('✅ Auto Responder Added')
        .addFields(
          { name: '🎯 Trigger',  value: `\`${trigger}\``,  inline: true },
          { name: '💬 Response', value: response.slice(0, 200), inline: false },
        )
        .setTimestamp()] });
    }

    if (sub === 'remove') {
      const trigger = args.slice(1).join(' ');
      if (!trigger) return message.reply('Usage: `,ar remove <trigger>`');
      db.removeAutoresponder?.(message.guild.id, trigger);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed auto responder for \`${trigger}\`.`)] });
    }

    if (sub === 'list') {
      const list = db.getAutoresponders(message.guild.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setTitle(`💬 Auto Responders (${list.length})`)
        .setDescription(list.length ? list.slice(0, 20).map((r, i) => `**${i + 1}.** \`${r.trigger}\` → ${r.response.slice(0, 50)}`).join('\n') : 'None configured.')
        .setTimestamp()] });
    }

    if (sub === 'clear') {
      db.clearAutoresponders?.(message.guild.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ All auto responders cleared.')] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
      .setAuthor({ name: '💬 Auto Responder' })
      .setDescription('**Subcommands:** `add <trigger> | <response>`, `remove <trigger>`, `list`, `clear`')
      .setTimestamp()] });
  }
};

module.exports = [ar];
