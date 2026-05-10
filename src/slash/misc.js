'use strict';

const { SlashCommandBuilder, EmbedBuilder, ActivityType, PermissionFlagsBits } = require('discord.js');
const { isOwner } = require('../utils/helpers');
const db = require('../database');

const BLUE  = '#5865F2';
const GREEN = '#57F287';

// ─── /setstatus ──────────────────────────────────────────────────────────────
const setstatus = {
  data: new SlashCommandBuilder()
    .setName('setstatus')
    .setDescription('Change bot presence (owner only)')
    .addStringOption(o => o.setName('type').setDescription('Activity type').setRequired(true)
      .addChoices(
        { name: 'Playing', value: 'Playing' },
        { name: 'Watching', value: 'Watching' },
        { name: 'Listening', value: 'Listening' },
        { name: 'Competing', value: 'Competing' },
        { name: 'Streaming', value: 'Streaming' },
      ))
    .addStringOption(o => o.setName('text').setDescription('Status text').setRequired(true)),

  async execute(interaction, client) {
    if (!isOwner(client, interaction.user.id)) {
      return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
    }

    const type = interaction.options.getString('type');
    const text = interaction.options.getString('text');

    const typeMap = {
      Playing:   ActivityType.Playing,
      Watching:  ActivityType.Watching,
      Listening: ActivityType.Listening,
      Competing: ActivityType.Competing,
      Streaming: ActivityType.Streaming,
    };

    client.user.setPresence({
      activities: [{ name: text, type: typeMap[type] }],
      status: 'online',
    });

    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setAuthor({ name: '✅ Status Updated', iconURL: client.user.displayAvatarURL() })
      .addFields(
        { name: '🎮 Type', value: type, inline: true },
        { name: '💬 Text', value: text, inline: true },
      )
      .setFooter({ text: 'flux bot' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /restart ────────────────────────────────────────────────────────────────
const restart = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Restart the bot process (owner only)'),

  async execute(interaction, client) {
    if (!isOwner(client, interaction.user.id)) {
      return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
    }
    await interaction.reply({ content: '🔄 Restarting...', ephemeral: true });
    process.exit(0);
  },
};

// ─── /rate ───────────────────────────────────────────────────────────────────
const RATE_COMMENTS = [
  'Not bad at all!',
  'Absolutely phenomenal.',
  'Meh, could be worse.',
  'Truly a masterpiece.',
  'I\'ve seen better, honestly.',
  'Peak perfection.',
  'A solid choice.',
  'Questionable, but okay.',
  'Off the charts!',
  'The audacity...',
  'Surprisingly delightful.',
  'Science cannot explain this.',
  'The numbers speak for themselves.',
  'My calculations say it\'s mid.',
  'Legendary status unlocked.',
];

const SCORE_COLORS = ['#ED4245', '#ED4245', '#ED4245', '#E67E22', '#E67E22', '#FEE75C', '#FEE75C', '#57F287', '#57F287', '#57F287', '#FFD700'];

const rate = {
  data: new SlashCommandBuilder()
    .setName('rate')
    .setDescription('Rate anything out of 10')
    .addStringOption(o => o.setName('thing').setDescription('What to rate').setRequired(true)),

  async execute(interaction) {
    const thing   = interaction.options.getString('thing');
    const score   = Math.floor(Math.random() * 11);
    const comment = RATE_COMMENTS[Math.floor(Math.random() * RATE_COMMENTS.length)];
    const bar     = '█'.repeat(score) + '░'.repeat(10 - score);

    const embed = new EmbedBuilder()
      .setColor(SCORE_COLORS[score])
      .setAuthor({ name: `📊 Rating: ${thing}`, iconURL: interaction.user.displayAvatarURL() })
      .setDescription(`\`${bar}\`\n\n**${score}/10** — *${comment}*`)
      .setFooter({ text: `Rated by ${interaction.user.tag} • flux bot` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /setprefix ──────────────────────────────────────────────────────────────
const setprefix = {
  data: new SlashCommandBuilder()
    .setName('setprefix')
    .setDescription('Change the bot prefix for this server')
    .addStringOption(o => o.setName('prefix').setDescription('New prefix (e.g. ! or . or ,)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const prefix = interaction.options.getString('prefix');

    if (prefix.length > 5) {
      return interaction.reply({ content: '❌ Prefix must be 5 characters or fewer.', ephemeral: true });
    }

    db.setPrefix(interaction.guild.id, prefix);

    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setAuthor({ name: '✅ Prefix Updated', iconURL: interaction.user.displayAvatarURL() })
      .addFields(
        { name: '🔤 New Prefix', value: `\`${prefix}\``, inline: true },
        { name: '📖 Example', value: `\`${prefix}help\``, inline: true },
      )
      .setFooter({ text: 'flux bot' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

module.exports = [setstatus, restart, rate, setprefix];
