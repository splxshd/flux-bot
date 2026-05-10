'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';

const welcome = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome messages')
    .addSubcommand(s => s.setName('setup').setDescription('Set welcome channel')
      .addChannelOption(o => o.setName('channel').setDescription('Welcome channel').setRequired(true)))
    .addSubcommand(s => s.setName('message').setDescription('Configure embed content')
      .addStringOption(o => o.setName('title').setDescription('Title (supports {user} {mention} {server} {count})'))
      .addStringOption(o => o.setName('description').setDescription('Description (supports {user} {mention} {server} {count})'))
      .addStringOption(o => o.setName('color').setDescription('Hex color'))
      .addStringOption(o => o.setName('footer').setDescription('Footer text'))
      .addStringOption(o => o.setName('image_url').setDescription('Image URL'))
      .addBooleanOption(o => o.setName('thumbnail').setDescription('Show user avatar as thumbnail')))
    .addSubcommand(s => s.setName('preview').setDescription('Preview the welcome embed'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable welcome messages'))
    .addSubcommand(s => s.setName('view').setDescription('View current config'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      db.upsertWelcomeSettings(interaction.guild.id, { channel_id: channel.id, enabled: 1 });

      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ Welcome System Configured', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '📍 Channel', value: `${channel}`, inline: true },
          { name: '✅ Status', value: 'Enabled', inline: true },
        )
        .setFooter({ text: 'Use /welcome message to customize the embed • flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'message') {
      const fields = {};
      const title       = interaction.options.getString('title');
      const description = interaction.options.getString('description');
      const color       = interaction.options.getString('color');
      const footer      = interaction.options.getString('footer');
      const imageUrl    = interaction.options.getString('image_url');
      const thumbnail   = interaction.options.getBoolean('thumbnail');

      if (title !== null)     fields.title = title;
      if (description !== null) fields.description = description;
      if (color !== null)     fields.color = color;
      if (footer !== null)    fields.footer = footer;
      if (imageUrl !== null)  fields.image_url = imageUrl;
      if (thumbnail !== null) fields.thumbnail = thumbnail ? 1 : 0;

      db.upsertWelcomeSettings(interaction.guild.id, fields);

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(GREEN)
          .setAuthor({ name: '✅ Welcome Message Updated', iconURL: interaction.user.displayAvatarURL() })
          .setDescription('Use `/welcome preview` to see how it looks.')
          .setFooter({ text: 'flux bot' })
          .setTimestamp()],
        ephemeral: true,
      });

    } else if (sub === 'preview') {
      const settings = db.getWelcomeSettings(interaction.guild.id);
      const member = interaction.member;

      const replace = (str) => {
        if (!str) return '';
        return str
          .replace(/{user}/g, member.user.tag)
          .replace(/{mention}/g, `<@${member.id}>`)
          .replace(/{server}/g, interaction.guild.name)
          .replace(/{count}/g, interaction.guild.memberCount.toString());
      };

      const embed = new EmbedBuilder()
        .setTitle(replace(settings?.title) || `Welcome to ${interaction.guild.name}!`)
        .setDescription(replace(settings?.description) || `Welcome <@${member.id}>! You are member #${interaction.guild.memberCount}.`)
        .setColor(settings?.color || BLUE);

      if (settings?.footer) embed.setFooter({ text: replace(settings.footer) });
      if (settings?.image_url) embed.setImage(settings.image_url);
      if (settings?.thumbnail !== 0) embed.setThumbnail(member.user.displayAvatarURL());

      await interaction.reply({ content: '**Preview:**', embeds: [embed] });

    } else if (sub === 'disable') {
      db.upsertWelcomeSettings(interaction.guild.id, { enabled: 0 });

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(RED)
          .setAuthor({ name: '🔕 Welcome Messages Disabled', iconURL: interaction.user.displayAvatarURL() })
          .setFooter({ text: 'flux bot' })
          .setTimestamp()],
        ephemeral: true,
      });

    } else if (sub === 'view') {
      const settings = db.getWelcomeSettings(interaction.guild.id);
      if (!settings) return interaction.reply({ content: '❌ No welcome settings configured.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('👋 Welcome Configuration')
        .setColor(BLUE)
        .setThumbnail(interaction.guild.iconURL())
        .addFields(
          { name: '✅ Enabled', value: settings.enabled ? 'Yes' : 'No', inline: true },
          { name: '📍 Channel', value: settings.channel_id ? `<#${settings.channel_id}>` : 'None', inline: true },
          { name: '🎨 Color', value: settings.color || BLUE, inline: true },
          { name: '🖼️ Thumbnail', value: settings.thumbnail !== 0 ? 'User Avatar' : 'Off', inline: true },
          { name: '📝 Title', value: settings.title || 'Default', inline: false },
          { name: '💬 Description', value: settings.description || 'Default', inline: false },
          ...(settings.footer ? [{ name: '📋 Footer', value: settings.footer, inline: false }] : []),
        )
        .setFooter({ text: 'Supports {user} {mention} {server} {count} • flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

module.exports = [welcome];
