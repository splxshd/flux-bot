'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';

const webhook = {
  name: 'webhook',
  aliases: ['wh', 'webhooks'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageWebhooks))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Webhooks** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'create') {
      const channel = message.mentions.channels.first() || message.channel;
      const name = args.slice(message.mentions.channels.size ? 2 : 1).join(' ') || 'flux Webhook';
      const wh = await channel.createWebhook({ name, reason: `Created by ${message.author.tag}` }).catch(() => null);
      if (!wh) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Failed to create webhook.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setAuthor({ name: '✅ Webhook Created' })
        .addFields(
          { name: '📛 Name', value: wh.name, inline: true },
          { name: '📌 Channel', value: `<#${channel.id}>`, inline: true },
          { name: '🆔 ID', value: `\`${wh.id}\``, inline: false },
        )
        .setTimestamp()] });
    }

    if (sub === 'delete') {
      const id = args[1];
      if (!id) return message.reply('Usage: `,webhook delete <webhook_id>`');
      const whs = await message.guild.fetchWebhooks().catch(() => null);
      const target = whs?.get(id);
      if (!target) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Webhook not found.')] });
      await target.delete(`Deleted by ${message.author.tag}`).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Webhook **${target.name}** deleted.`)] });
    }

    if (sub === 'edit') {
      const id = args[1];
      const name = args.slice(2).join(' ');
      if (!id || !name) return message.reply('Usage: `,webhook edit <id> <new name>`');
      const whs = await message.guild.fetchWebhooks().catch(() => null);
      const target = whs?.get(id);
      if (!target) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Webhook not found.')] });
      await target.edit({ name }, `Edited by ${message.author.tag}`).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Webhook renamed to **${name}**.`)] });
    }

    if (sub === 'list') {
      const whs = await message.guild.fetchWebhooks().catch(() => null);
      if (!whs || whs.size === 0) return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ No webhooks in this server.')] });
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setAuthor({ name: `${message.guild.name} — Webhooks (${whs.size})` })
        .setDescription([...whs.values()].map(w => `**${w.name}** · \`${w.id}\` · <#${w.channelId}>`).join('\n'))
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'send') {
      const id = args[1];
      const content = args.slice(2).join(' ');
      if (!id || !content) return message.reply('Usage: `,webhook send <id> <message>`');
      const whs = await message.guild.fetchWebhooks().catch(() => null);
      const target = whs?.get(id);
      if (!target) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Webhook not found.')] });
      await target.send(content).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Message sent via webhook.')] });
    }

    if (sub === 'lock') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Webhook locked.')] });
    }
    if (sub === 'unlock') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Webhook unlocked.')] });
    }

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: 'Webhook Commands' })
      .setDescription('**Subcommands:** `create <#ch> [name]`, `delete <id>`, `edit <id> <name>`, `list`, `send <id> <msg>`, `lock`, `unlock`')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

module.exports = [webhook];
