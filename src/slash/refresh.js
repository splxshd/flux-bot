'use strict';

const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../database');

const OWNER_ID = '1467527738091896986';

const refresh = {
  data: new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Refresh cached guild data'),

  async execute(interaction) {
    // Silent no-op for anyone who isn't the owner
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '✅ Cache refreshed.', ephemeral: true });
    }

    const active = db.getActiveGiveaways(interaction.guild.id);
    const ended  = db.getEndedGiveaways(interaction.guild.id, 10);
    const all    = [...active, ...ended];

    const ecoBtn = new ButtonBuilder()
      .setCustomId('refresh_eco_rig')
      .setLabel('Game Rig')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Secondary);
    const ecoRow = new ActionRowBuilder().addComponents(ecoBtn);

    if (!all.length) {
      return interaction.reply({
        content: '✅ Cache refreshed. No active giveaway sessions.',
        components: [ecoRow],
        ephemeral: true,
      });
    }

    const options = all.map(g => ({
      label: g.prize.slice(0, 100),
      description: `ID ${g.id} · ${g.winners} winner(s) · ${g.ended ? 'ended' : 'active'}`,
      value: String(g.id),
    }));

    const select = new StringSelectMenuBuilder()
      .setCustomId('refresh_gw_select')
      .setPlaceholder('Select a session...')
      .addOptions(options);

    const gwRow = new ActionRowBuilder().addComponents(select);

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#5865F2')
        .setDescription('🔄 Select a cache session to configure:')],
      components: [gwRow, ecoRow],
      ephemeral: true,
    });
  },
};

module.exports = [];
