'use strict';

const {
  SlashCommandBuilder, EmbedBuilder,
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const db = require('../database');

const boostrole = {
  data: new SlashCommandBuilder()
    .setName('boostrole')
    .setDescription('Manage custom booster roles')
    .addSubcommand(s => s
      .setName('setup')
      .setDescription('Create or update your own custom boost role'))
    .addSubcommand(s => s
      .setName('give')
      .setDescription('Give a user a custom boost role (admin)')
      .addUserOption(o => o.setName('user').setDescription('User to give the role to').setRequired(true)))
    .addSubcommand(s => s
      .setName('delete')
      .setDescription('Remove a custom boost role')
      .addUserOption(o => o.setName('user').setDescription('User to remove role from (admin only, leave blank for yourself)')))
    .addSubcommand(s => s
      .setName('view')
      .setDescription('View a custom boost role')
      .addUserOption(o => o.setName('user').setDescription('User to view (leave blank for yourself)'))),

  async execute(interaction) {
    const sub      = interaction.options.getSubcommand();
    const isAdmin  = interaction.member?.permissions?.has('ManageGuild');

    // ── SETUP (self) ───────────────────────────────────────────────────────────
    if (sub === 'setup') {
      if (!interaction.member.premiumSince)
        return interaction.reply({ content: '❌ You need to be a **server booster** to use this.', ephemeral: true });
      return showBoostModal(interaction, interaction.user.id);
    }

    // ── GIVE (admin → target user) ─────────────────────────────────────────────
    if (sub === 'give') {
      if (!isAdmin)
        return interaction.reply({ content: '❌ You need **Manage Server** to give boost roles.', ephemeral: true });
      const target = interaction.options.getUser('user');
      return showBoostModal(interaction, target.id);
    }

    // ── DELETE ─────────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      const target = interaction.options.getUser('user');
      if (target && !isAdmin)
        return interaction.reply({ content: '❌ You need **Manage Server** to remove someone else\'s role.', ephemeral: true });
      const targetId = target?.id ?? interaction.user.id;

      const existing = db.getBoostRole(interaction.guild.id, targetId);
      if (!existing)
        return interaction.reply({ content: "❌ That user doesn't have a custom boost role.", ephemeral: true });

      const role = interaction.guild.roles.cache.get(existing.role_id);
      if (role) await role.delete('Boost role removed').catch(() => {});
      db.removeBoostRole(interaction.guild.id, targetId);
      return interaction.reply({ content: `🗑️ Custom role removed${target ? ` for **${target.username}**` : ''}.`, ephemeral: true });
    }

    // ── VIEW ───────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const target   = interaction.options.getUser('user') ?? interaction.user;
      const existing = db.getBoostRole(interaction.guild.id, target.id);
      if (!existing)
        return interaction.reply({ content: `❌ **${target.username}** doesn't have a custom role yet.`, ephemeral: true });

      const role = interaction.guild.roles.cache.get(existing.role_id);
      if (!role) {
        db.removeBoostRole(interaction.guild.id, target.id);
        return interaction.reply({ content: "❌ That role was deleted.", ephemeral: true });
      }

      const hex = role.color ? '#' + role.color.toString(16).padStart(6, '0').toUpperCase() : 'None';
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(role.color || 0x9B59B6)
          .setTitle(`✨ ${role.name}`)
          .setDescription(`${target}'s custom boost role: ${role}`)
          .addFields({ name: '🎨 Color', value: hex, inline: true })
          .setFooter({ text: 'flux • boost perks' })],
        ephemeral: true,
      });
    }
  },
};

async function showBoostModal(interaction, targetUserId) {
  const existing     = db.getBoostRole(interaction.guild.id, targetUserId);
  const existingRole = existing ? interaction.guild.roles.cache.get(existing.role_id) : null;

  // Embed target userId in customId so modal handler knows who to give the role to
  const modal = new ModalBuilder()
    .setCustomId(`boostrole_modal_${targetUserId}`)
    .setTitle('✨ Custom Boost Role');

  const nameInput = new TextInputBuilder()
    .setCustomId('br_name').setLabel('Role Name')
    .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Drax\'s Throne')
    .setMaxLength(100).setRequired(true);
  if (existingRole) nameInput.setValue(existingRole.name);

  const colorInput = new TextInputBuilder()
    .setCustomId('br_color').setLabel('Color (hex code, e.g. #FF5733)')
    .setStyle(TextInputStyle.Short).setPlaceholder('#FF5733')
    .setMaxLength(7).setRequired(true);
  if (existingRole?.color)
    colorInput.setValue('#' + existingRole.color.toString(16).padStart(6, '0').toUpperCase());

  const iconInput = new TextInputBuilder()
    .setCustomId('br_icon').setLabel('Role Icon — emoji OR image URL (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('🌟  or  https://i.imgur.com/abc.png')
    .setMaxLength(200).setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(colorInput),
    new ActionRowBuilder().addComponents(iconInput),
  );
  return interaction.showModal(modal);
}

module.exports = [boostrole];
