'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../database');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';

const autoping = {
  data: new SlashCommandBuilder()
    .setName('autoping')
    .setDescription('Auto-ping new members in channels')
    .addSubcommand(s => s.setName('setup').setDescription('Add a channel to autoping')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to ping in').setRequired(true))
      .addIntegerOption(o => o.setName('delete_after').setDescription('Delete ping after N seconds (0 = never, default 5)').setMinValue(0)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a channel from autoping')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List all autoping channels'))
    .addSubcommand(s => s.setName('toggle').setDescription('Toggle a channel on/off')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)))
    .addSubcommand(s => s.setName('clear').setDescription('Remove all autoping channels'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const deleteAfter = interaction.options.getInteger('delete_after') ?? 5;
      db.addAutoping(interaction.guild.id, channel.id, deleteAfter);

      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ Autoping Added', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '📍 Channel', value: `${channel}`, inline: true },
          { name: '🗑️ Delete After', value: deleteAfter === 0 ? 'Never' : `${deleteAfter}s`, inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'remove') {
      const channel = interaction.options.getChannel('channel');
      db.removeAutoping(interaction.guild.id, channel.id);

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(RED)
          .setAuthor({ name: '🗑️ Autoping Removed', iconURL: interaction.user.displayAvatarURL() })
          .addFields({ name: '📍 Channel', value: `${channel}`, inline: true })
          .setFooter({ text: 'flux bot' })
          .setTimestamp()],
        ephemeral: true,
      });

    } else if (sub === 'list') {
      const rows = db.getAutopings(interaction.guild.id);
      if (rows.length === 0) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(BLUE).setDescription('📭 No autoping channels configured.').setTimestamp()],
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('🔔 Autoping Channels')
        .setColor(BLUE)
        .setDescription(
          rows.map(r => {
            const status = r.enabled ? '🟢' : '🔴';
            const delay  = r.delete_after === 0 ? 'never' : `${r.delete_after}s`;
            return `${status} <#${r.channel_id}> — delete after **${delay}**`;
          }).join('\n')
        )
        .setFooter({ text: `${rows.length} channel(s) • flux bot` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'toggle') {
      const channel = interaction.options.getChannel('channel');
      const newState = db.toggleAutoping(interaction.guild.id, channel.id);
      if (newState === null) return interaction.reply({ content: '❌ Channel not in autoping list.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(newState ? GREEN : RED)
        .setAuthor({ name: `🔔 Autoping ${newState ? 'Enabled' : 'Disabled'}`, iconURL: interaction.user.displayAvatarURL() })
        .addFields({ name: '📍 Channel', value: `${channel}`, inline: true })
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'clear') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('autoping_clear_yes').setLabel('Yes, clear all').setStyle(ButtonStyle.Danger).setEmoji('✅'),
        new ButtonBuilder().setCustomId('autoping_clear_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('❌'),
      );

      const embed = new EmbedBuilder()
        .setColor(RED)
        .setAuthor({ name: '⚠️ Clear All Autoping Channels?', iconURL: interaction.user.displayAvatarURL() })
        .setDescription('This will remove **all** autoping channels from this server.')
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
  },
};

module.exports = [autoping];
