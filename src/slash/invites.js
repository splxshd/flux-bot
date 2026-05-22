'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const GOLD = '#FFD700';
const BLUE = '#5865F2';
const RED  = '#ED4245';

const invites = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Invite tracking')
    .addSubcommand(s => s
      .setName('check')
      .setDescription('Check how many invites a user has')
      .addUserOption(o => o.setName('user').setDescription('User to check (defaults to you)')))
    .addSubcommand(s => s
      .setName('leaderboard')
      .setDescription('Top inviters in this server'))
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Manually add invites to a user')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to add').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s
      .setName('reset')
      .setDescription('Reset a user\'s invite count')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── check ────────────────────────────────────────────────────────────────
    if (sub === 'check') {
      const target = interaction.options.getUser('user') || interaction.user;
      const count  = db.getInvites(interaction.guild.id, target.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(GOLD)
          .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
          .setDescription(`<@${target.id}> has **${count}** invite${count !== 1 ? 's' : ''}`)
          .setTimestamp()],
        ephemeral: false,
      });
    }

    // ── leaderboard ──────────────────────────────────────────────────────────
    if (sub === 'leaderboard') {
      const rows = db.getInviteLeaderboard(interaction.guild.id, 10);
      if (!rows.length) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(BLUE).setDescription('📭 No invite data yet.')],
          ephemeral: true,
        });
      }
      const desc = rows
        .map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.invites}** invite${r.invites !== 1 ? 's' : ''}`)
        .join('\n');
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(GOLD)
          .setTitle(`🏆 Invite Leaderboard — ${interaction.guild.name}`)
          .setDescription(desc)
          .setTimestamp()],
      });
    }

    // ── add (ManageGuild) ────────────────────────────────────────────────────
    if (sub === 'add') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ You need **Manage Server** permission.', ephemeral: true });
      }
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      db.incrementInvites(interaction.guild.id, target.id, amount);
      const newTotal = db.getInvites(interaction.guild.id, target.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(GOLD)
          .setDescription(`✅ Added **${amount}** invite${amount !== 1 ? 's' : ''} to <@${target.id}>. Total: **${newTotal}**`)],
        ephemeral: true,
      });
    }

    // ── reset (ManageGuild) ──────────────────────────────────────────────────
    if (sub === 'reset') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: '❌ You need **Manage Server** permission.', ephemeral: true });
      }
      const target = interaction.options.getUser('user');
      db.resetInvites(interaction.guild.id, target.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(RED)
          .setDescription(`🗑️ Reset invite count for <@${target.id}>.`)],
        ephemeral: true,
      });
    }
  },
};

module.exports = [invites];
