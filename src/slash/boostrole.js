'use strict';

const {
  SlashCommandBuilder, EmbedBuilder,
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const db = require('../database');

const boostrole = {
  data: new SlashCommandBuilder()
    .setName('boostrole')
    .setDescription('Manage your custom booster role')
    .addSubcommand(s => s.setName('setup').setDescription('Create or update your custom boost role'))
    .addSubcommand(s => s.setName('delete').setDescription('Remove your custom boost role'))
    .addSubcommand(s => s.setName('view').setDescription('View your current boost role')),

  async execute(interaction) {
    if (!interaction.member.premiumSince)
      return interaction.reply({ content: '❌ You need to be a **server booster** to use this.', ephemeral: true });

    const sub = interaction.options.getSubcommand();

    // ── SETUP ──────────────────────────────────────────────────────────────────
    if (sub === 'setup') {
      const existing     = db.getBoostRole(interaction.guild.id, interaction.user.id);
      const existingRole = existing ? interaction.guild.roles.cache.get(existing.role_id) : null;

      const modal = new ModalBuilder().setCustomId('boostrole_modal').setTitle('✨ Custom Boost Role');

      const nameInput = new TextInputBuilder()
        .setCustomId('br_name').setLabel('Role Name')
        .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Drax\'s Throne').setMaxLength(100).setRequired(true);
      if (existingRole) nameInput.setValue(existingRole.name);

      const colorInput = new TextInputBuilder()
        .setCustomId('br_color').setLabel('Color (hex code)')
        .setStyle(TextInputStyle.Short).setPlaceholder('#FF5733').setMaxLength(7).setRequired(true);
      if (existingRole?.color)
        colorInput.setValue('#' + existingRole.color.toString(16).padStart(6, '0').toUpperCase());

      const iconInput = new TextInputBuilder()
        .setCustomId('br_icon').setLabel('Role Icon — unicode emoji (optional)')
        .setStyle(TextInputStyle.Short).setPlaceholder('🌟').setMaxLength(10).setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(colorInput),
        new ActionRowBuilder().addComponents(iconInput),
      );
      return interaction.showModal(modal);
    }

    // ── DELETE ─────────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      const existing = db.getBoostRole(interaction.guild.id, interaction.user.id);
      if (!existing)
        return interaction.reply({ content: "❌ You don't have a custom role yet.", ephemeral: true });
      const role = interaction.guild.roles.cache.get(existing.role_id);
      if (role) await role.delete('Boost role removed by user').catch(() => {});
      db.removeBoostRole(interaction.guild.id, interaction.user.id);
      return interaction.reply({ content: '🗑️ Your custom role has been removed.', ephemeral: true });
    }

    // ── VIEW ───────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const existing = db.getBoostRole(interaction.guild.id, interaction.user.id);
      if (!existing)
        return interaction.reply({ content: "❌ You don't have a custom role yet. Use `/boostrole setup` to create one.", ephemeral: true });
      const role = interaction.guild.roles.cache.get(existing.role_id);
      if (!role) {
        db.removeBoostRole(interaction.guild.id, interaction.user.id);
        return interaction.reply({ content: "❌ Your role was deleted. Use `/boostrole setup` to make a new one.", ephemeral: true });
      }
      const hex = role.color ? '#' + role.color.toString(16).padStart(6, '0').toUpperCase() : 'None';
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(role.color || 0x9B59B6)
          .setTitle(`✨ ${role.name}`)
          .setDescription(`Your custom boost role: ${role}`)
          .addFields({ name: '🎨 Color', value: hex, inline: true })
          .setFooter({ text: 'flux • boost perks' })],
        ephemeral: true,
      });
    }
  },
};

module.exports = [boostrole];
