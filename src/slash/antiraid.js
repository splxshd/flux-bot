'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';

const antiraid = {
  data: new SlashCommandBuilder()
    .setName('antiraid')
    .setDescription('Manage anti-raid protection')
    .addSubcommand(s => s.setName('enable').setDescription('Enable anti-raid protection'))
    .addSubcommand(s => s.setName('disable').setDescription('Disable anti-raid protection'))
    .addSubcommand(s => s.setName('config').setDescription('Configure anti-raid settings')
      .addIntegerOption(o => o.setName('join_threshold').setDescription('Joins to trigger (default: 10)').setMinValue(1))
      .addIntegerOption(o => o.setName('join_window').setDescription('Window in seconds (default: 10)').setMinValue(1))
      .addStringOption(o => o.setName('action').setDescription('Action on detection').addChoices(
        { name: 'kick', value: 'kick' },
        { name: 'ban', value: 'ban' },
        { name: 'timeout', value: 'timeout' },
      ))
      .addIntegerOption(o => o.setName('mention_threshold').setDescription('Mention count to trigger (default: 10)').setMinValue(1))
      .addChannelOption(o => o.setName('log_channel').setDescription('Log channel')))
    .addSubcommand(s => s.setName('view').setDescription('View anti-raid config'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'enable') {
      db.upsertAntiraid(interaction.guild.id, { enabled: 1 });

      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '🛡️ Anti-Raid Enabled', iconURL: interaction.user.displayAvatarURL() })
        .setDescription('Anti-raid protection is now **active**. Suspicious join patterns will be detected and actioned.')
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'disable') {
      db.upsertAntiraid(interaction.guild.id, { enabled: 0 });

      const embed = new EmbedBuilder()
        .setColor(RED)
        .setAuthor({ name: '🛡️ Anti-Raid Disabled', iconURL: interaction.user.displayAvatarURL() })
        .setDescription('Anti-raid protection has been **disabled**.')
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'config') {
      const fields = {};
      const joinThreshold    = interaction.options.getInteger('join_threshold');
      const joinWindow       = interaction.options.getInteger('join_window');
      const action           = interaction.options.getString('action');
      const mentionThreshold = interaction.options.getInteger('mention_threshold');
      const logChannel       = interaction.options.getChannel('log_channel');

      if (joinThreshold !== null)    fields.join_threshold = joinThreshold;
      if (joinWindow !== null)       fields.join_window = joinWindow;
      if (action !== null)           fields.action = action;
      if (mentionThreshold !== null) fields.mention_threshold = mentionThreshold;
      if (logChannel !== null)       fields.log_channel = logChannel.id;

      db.upsertAntiraid(interaction.guild.id, fields);

      const updated = db.getAntiraid(interaction.guild.id);
      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ Anti-Raid Config Updated', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '⚡ Action', value: updated?.action || 'kick', inline: true },
          { name: '👥 Join Threshold', value: `${updated?.join_threshold || 10} joins`, inline: true },
          { name: '⏱️ Join Window', value: `${updated?.join_window || 10}s`, inline: true },
          { name: '📣 Mention Threshold', value: `${updated?.mention_threshold || 10} mentions`, inline: true },
          { name: '📋 Log Channel', value: updated?.log_channel ? `<#${updated.log_channel}>` : 'None', inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'view') {
      const settings = db.getAntiraid(interaction.guild.id);
      if (!settings) {
        return interaction.reply({ content: '❌ No anti-raid config. Use `/antiraid config` to set up.', ephemeral: true });
      }

      const statusColor = settings.enabled ? GREEN : RED;
      const statusLabel = settings.enabled ? '🟢 Enabled' : '🔴 Disabled';

      const embed = new EmbedBuilder()
        .setTitle('🛡️ Anti-Raid Configuration')
        .setColor(statusColor)
        .setThumbnail(interaction.guild.iconURL())
        .addFields(
          { name: '📡 Status', value: statusLabel, inline: true },
          { name: '⚡ Action', value: settings.action || 'kick', inline: true },
          { name: '​', value: '​', inline: true },
          { name: '👥 Join Threshold', value: `${settings.join_threshold || 10} joins`, inline: true },
          { name: '⏱️ Join Window', value: `${settings.join_window || 10}s`, inline: true },
          { name: '📣 Mention Threshold', value: `${settings.mention_threshold || 10} mentions`, inline: true },
          { name: '📋 Log Channel', value: settings.log_channel ? `<#${settings.log_channel}>` : 'None', inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

// ─── /emoji ──────────────────────────────────────────────────────────────────
const emoji = {
  data: new SlashCommandBuilder()
    .setName('emoji')
    .setDescription('Manage server emojis')
    .addSubcommand(s => s.setName('add').setDescription('Add an emoji')
      .addStringOption(o => o.setName('name').setDescription('Emoji name').setRequired(true))
      .addStringOption(o => o.setName('url').setDescription('Image URL').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove an emoji')
      .addStringOption(o => o.setName('name').setDescription('Emoji name').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List server emojis'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEmojisAndStickers),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const name = interaction.options.getString('name');
      const url  = interaction.options.getString('url');
      const created = await interaction.guild.emojis.create({ attachment: url, name });
      await interaction.reply({ content: `✅ Emoji ${created} (\`:${name}:\`) added.`, ephemeral: true });

    } else if (sub === 'remove') {
      const name = interaction.options.getString('name');
      const em = interaction.guild.emojis.cache.find(e => e.name === name);
      if (!em) return interaction.reply({ content: `❌ Emoji \`${name}\` not found.`, ephemeral: true });
      await em.delete();
      await interaction.reply({ content: `✅ Emoji \`${name}\` deleted.`, ephemeral: true });

    } else if (sub === 'list') {
      const emojis = interaction.guild.emojis.cache;
      if (emojis.size === 0) return interaction.reply({ content: 'No custom emojis.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`${interaction.guild.name} — Emojis`)
        .setColor(BLUE)
        .setDescription([...emojis.values()].map(e => `${e} \`:${e.name}:\``).join('  ').slice(0, 4000))
        .setFooter({ text: `${emojis.size} emoji(s) • flux bot` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

// ─── /sticker ────────────────────────────────────────────────────────────────
const sticker = {
  data: new SlashCommandBuilder()
    .setName('sticker')
    .setDescription('Manage server stickers')
    .addSubcommand(s => s.setName('add').setDescription('Add a sticker')
      .addStringOption(o => o.setName('name').setDescription('Sticker name').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Related emoji').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Description').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a sticker')
      .addStringOption(o => o.setName('name').setDescription('Sticker name').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List server stickers'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEmojisAndStickers),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      await interaction.reply({ content: '❌ To add a sticker, please attach the file when using `/sticker add` in Discord client with attachment support, or use the server settings directly.', ephemeral: true });

    } else if (sub === 'remove') {
      const name = interaction.options.getString('name');
      const s = interaction.guild.stickers.cache.find(st => st.name === name);
      if (!s) return interaction.reply({ content: `❌ Sticker \`${name}\` not found.`, ephemeral: true });
      await s.delete();
      await interaction.reply({ content: `✅ Sticker \`${name}\` deleted.`, ephemeral: true });

    } else if (sub === 'list') {
      const stickers = interaction.guild.stickers.cache;
      if (stickers.size === 0) return interaction.reply({ content: 'No stickers.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`${interaction.guild.name} — Stickers`)
        .setColor(BLUE)
        .setDescription([...stickers.values()].map(s => `**${s.name}** — ${s.description || 'No description'}`).join('\n'))
        .setFooter({ text: `${stickers.size} sticker(s) • flux bot` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

module.exports = [antiraid, emoji, sticker];
