'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database');

const RED = '#ED4245';

const panel = {
  name: 'panel',
  aliases: ['sendpanel', 'embedpanel'],
  description: 'Send an embed with a dropdown menu — `,panel <json>`',
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });

    if (!args.length)
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Usage: `,panel <json>`\n\nBuild your panel at the embed builder on the dashboard.')] });

    // Grab everything after the command name as raw JSON
    const prefix   = db.getPrefix(message.guild.id);
    const rawJson  = message.content.slice((prefix + 'panel').length).trim();

    let data;
    try {
      data = JSON.parse(rawJson);
    } catch {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Invalid JSON. Make sure to copy the full command from the embed builder.')] });
    }

    // Build the embed
    const emb = new EmbedBuilder();
    if (data.color)       emb.setColor(data.color);
    if (data.title)       emb.setTitle(data.title);
    if (data.description) emb.setDescription(data.description);
    if (data.thumbnail)   emb.setThumbnail(data.thumbnail);
    if (data.image)       emb.setImage(data.image);
    if (data.author)      emb.setAuthor({ name: data.author, iconURL: data.authorIcon || undefined });
    if (data.footer)      emb.setFooter({ text: data.footer, iconURL: data.footerIcon || undefined });
    if (Array.isArray(data.fields)) {
      for (const f of data.fields) {
        if (f.name && f.value) emb.addFields({ name: f.name, value: f.value, inline: !!f.inline });
      }
    }

    // Fallback: if nothing is set give it an invisible description so Discord accepts it
    const hasContent = data.title || data.description || (Array.isArray(data.fields) && data.fields.length);
    if (!hasContent) emb.setDescription('​'); // zero-width space

    // Build dropdown if present
    const panelId  = `${message.guild.id}_${Date.now()}`;
    const components = [];

    if (data.dropdown && Array.isArray(data.dropdown.options) && data.dropdown.options.length > 0) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`panel:${panelId}`)
        .setPlaceholder(data.dropdown.placeholder || 'Choose an option.')
        .addOptions(
          data.dropdown.options.slice(0, 25).map((o, i) => {
            const opt = {
              label: (o.label || `Option ${i + 1}`).slice(0, 100),
              value: (o.value || `opt_${i}`).slice(0, 100),
            };
            if (o.description) opt.description = o.description.slice(0, 100);
            if (o.emoji) {
              // Numeric ID = custom emoji, otherwise treat as unicode
              opt.emoji = /^\d+$/.test(o.emoji.trim())
                ? { id: o.emoji.trim() }
                : { name: o.emoji.trim() };
            }
            return opt;
          })
        );
      components.push(new ActionRowBuilder().addComponents(menu));
    }

    // Send FIRST, then delete the command message
    let sent;
    try {
      sent = await message.channel.send({ embeds: [emb], components });
    } catch (e) {
      console.error('[panel send]', e);
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ Failed to send panel: ${e.message}`)] });
    }

    await message.delete().catch(() => {});

    if (data.dropdown && sent) {
      db.setPanel(panelId, message.guild.id, sent.id, JSON.stringify(data.dropdown.options));
    }
  },
};

module.exports = [panel];
