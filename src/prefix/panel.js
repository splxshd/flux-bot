'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database');

const RED  = '#ED4245';
const GREEN = '#57F287';

const panel = {
  name: 'panel',
  aliases: ['sendpanel', 'embedpanel'],
  description: 'Send an embed with a dropdown menu — `,panel <json>`',
  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });

    const rawJson = message.content.slice(message.content.indexOf(args[0])).trim();
    let data;
    try {
      data = JSON.parse(rawJson);
    } catch {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Invalid JSON. Use the embed builder on the dashboard to generate the command.')] });
    }

    // Build the embed
    const emb = new EmbedBuilder();
    if (data.title)       emb.setTitle(data.title);
    if (data.description) emb.setDescription(data.description);
    if (data.color)       emb.setColor(data.color);
    if (data.footer)      emb.setFooter({ text: data.footer });
    if (data.footerIcon)  emb.setFooter({ text: data.footer || '​', iconURL: data.footerIcon });
    if (data.thumbnail)   emb.setThumbnail(data.thumbnail);
    if (data.image)       emb.setImage(data.image);
    if (data.author)      emb.setAuthor({ name: data.author, iconURL: data.authorIcon || undefined });
    if (Array.isArray(data.fields)) {
      for (const f of data.fields) {
        if (f.name && f.value) emb.addFields({ name: f.name, value: f.value, inline: !!f.inline });
      }
    }

    const panelId = `${message.guild.id}_${Date.now()}`;
    const components = [];

    if (data.dropdown && Array.isArray(data.dropdown.options) && data.dropdown.options.length > 0) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`panel:${panelId}`)
        .setPlaceholder(data.dropdown.placeholder || 'Choose an option.')
        .addOptions(
          data.dropdown.options.slice(0, 25).map((o, i) => ({
            label: o.label.slice(0, 100),
            value: o.value || `opt_${i}`,
            ...(o.description ? { description: o.description.slice(0, 100) } : {}),
          }))
        );
      components.push(new ActionRowBuilder().addComponents(menu));
    }

    await message.delete().catch(() => {});
    const sent = await message.channel.send({ embeds: [emb], components });

    if (data.dropdown && sent) {
      db.setPanel(panelId, message.guild.id, sent.id, JSON.stringify(data.dropdown.options));
    }
  },
};

module.exports = [panel];
