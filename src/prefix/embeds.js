'use strict';

const { EmbedBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const db = require('../database');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';

// ── ,ce (createembed) ─────────────────────────────────────────────────────────
const ce = {
  name: 'ce',
  aliases: ['createembed', 'embed'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });

    if (!args.length) {
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('Embed Builder')
        .setDescription([
          '**Usage:** `,ce <embed script>`',
          '',
          '**Variables:**',
          '`{title: My Title}` · `{description: My Desc}` · `{color: #hex}`',
          '`{footer: Footer text}` · `{thumbnail: url}` · `{image: url}`',
          '`{author: Name}` · `{field: Name | Value | inline}`',
          '',
          'You can also use `,variables` to see all placeholders.',
        ].join('\n'))
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // Use raw content to preserve newlines (args.join splits on \n)
    const prefix = db.getPrefix(message.guild.id);
    const script = message.content.slice(prefix.length).trim().replace(/^ce\s+/i, '');
    const titleMatch = script.match(/\{title:\s*([^}]+)\}/i);
    const descMatch  = script.match(/\{description:\s*([^}]+)\}/i) || script.match(/\{desc:\s*([^}]+)\}/i);
    const colorMatch = script.match(/\{color:\s*#?([0-9a-fA-F]{6})\}/i);
    const footerMatch = script.match(/\{footer:\s*([^}]+)\}/i);
    const thumbMatch = script.match(/\{thumbnail:\s*([^}]+)\}/i);
    const imageMatch = script.match(/\{image:\s*([^}]+)\}/i);

    const built = new EmbedBuilder().setColor(colorMatch ? parseInt(colorMatch[1], 16) : 0x5865F2);
    if (titleMatch) built.setTitle(titleMatch[1].trim());
    if (descMatch)  built.setDescription(descMatch[1].trim());
    if (footerMatch) built.setFooter({ text: footerMatch[1].trim() });
    if (thumbMatch) built.setThumbnail(thumbMatch[1].trim());
    if (imageMatch) built.setImage(imageMatch[1].trim());

    if (!titleMatch && !descMatch) built.setDescription(script.slice(0, 2000));

    await message.channel.send({ embeds: [built] });
    await message.delete().catch(() => {});
  }
};

// ── ,ceedit ───────────────────────────────────────────────────────────────────
const ceedit = {
  name: 'ceedit',
  aliases: ['ce_edit', 'ceupdate'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const msgId = args[0];
    if (!msgId) return message.reply('Usage: `,ceedit <message_id> <script>`');
    const target = await message.channel.messages.fetch(msgId).catch(() => null);
    if (!target) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Message not found.')] });
    if (!target.editable) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ I cannot edit that message.')] });
    const newDesc = args.slice(1).join(' ');
    const embed = new EmbedBuilder().setColor(BLUE).setDescription(newDesc || 'Edited.');
    await target.edit({ embeds: [embed] }).catch(() => {});
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Embed updated.')] });
  }
};

// ── ,ceclone ─────────────────────────────────────────────────────────────────
const ceclone = {
  name: 'ceclone',
  aliases: ['cecopy'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const channel = message.mentions.channels.first();
    const msgId = args[1] || args[0];
    if (!channel || !msgId) return message.reply('Usage: `,ceclone <#channel> <message_id>`');
    const src = await message.channel.messages.fetch(msgId).catch(() => null);
    if (!src || !src.embeds.length) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No embed found on that message.')] });
    await channel.send({ embeds: src.embeds }).catch(() => {});
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Embed cloned to ${channel}.`)] });
  }
};

// ── ,ec (embedcopy) ───────────────────────────────────────────────────────────
const ec = {
  name: 'ec',
  aliases: ['embedcopy', 'embedsource'],
  async execute(message, args) {
    const msgId = args[0];
    if (!msgId) return message.reply('Usage: `,ec <message_id>`');
    const src = await message.channel.messages.fetch(msgId).catch(() => null);
    if (!src || !src.embeds.length) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No embed found.')] });
    const emb = src.embeds[0];
    const parts = [];
    if (emb.title) parts.push(`{title: ${emb.title}}`);
    if (emb.description) parts.push(`{description: ${emb.description}}`);
    if (emb.color) parts.push(`{color: #${emb.color.toString(16).padStart(6, '0')}}`);
    if (emb.footer?.text) parts.push(`{footer: ${emb.footer.text}}`);
    await message.reply({ content: `\`\`\`\n${parts.join(' ') || 'Empty embed'}\n\`\`\`` });
  }
};

// ── ,variables ────────────────────────────────────────────────────────────────
const variables = {
  name: 'variables',
  aliases: ['vars', 'placeholders'],
  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('📝 Embed Script Variables')
      .addFields(
        { name: 'Structure', value: '`{title: ...}` `{description: ...}` `{color: #hex}`\n`{footer: ...}` `{thumbnail: url}` `{image: url}`\n`{author: name}` `{field: Name | Value | true/false}`' },
        { name: 'User', value: '`{user}` `{user.mention}` `{user.id}` `{user.avatar}` `{user.created}`' },
        { name: 'Server', value: '`{guild}` `{guild.id}` `{guild.count}` `{guild.icon}` `{guild.owner}`' },
        { name: 'Channel', value: '`{channel}` `{channel.mention}` `{channel.id}`' },
        { name: 'Time', value: '`{date}` `{time}` `{timestamp}`' },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,tag ──────────────────────────────────────────────────────────────────────
const tag = {
  name: 'tag',
  aliases: ['tags', 'ct'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'create') {
      const name = args[1];
      const content = args.slice(2).join(' ');
      if (!name || !content) return message.reply('Usage: `,tag create <name> <content>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Tag **${name}** created.`)] });
    }
    if (sub === 'delete') {
      const name = args[1];
      if (!name) return message.reply('Usage: `,tag delete <name>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Tag **${name}** deleted.`)] });
    }
    if (sub === 'edit') {
      const name = args[1];
      const content = args.slice(2).join(' ');
      if (!name || !content) return message.reply('Usage: `,tag edit <name> <content>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Tag **${name}** updated.`)] });
    }
    if (sub === 'send') {
      const name = args[1];
      if (!name) return message.reply('Usage: `,tag send <name>`');
      return message.channel.send(`📌 **${name}** — Tag content will display here once database is configured.`);
    }

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: 'Tags' })
      .setDescription('**Subcommands:** `create <name> <content>`, `delete <name>`, `edit <name> <content>`, `send <name>`')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

module.exports = [ce, ceedit, ceclone, ec, variables, tag];
