'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
} = require('discord.js');
const db = require('../database');
const { parseDuration, formatDuration } = require('../utils/helpers');
const { buildActiveEmbed, buildEndedEmbed, buildRow, processGiveawayEnd, GOLD } = require('../utils/giveawayHelpers');

const RED = '#ED4245';

const giveaways = {
  data: new SlashCommandBuilder()
    .setName('giveaways')
    .setDescription('Manage giveaways')
    .addSubcommand(s => s.setName('start').setDescription('Start a giveaway')
      .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 1d, 12h)').setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20))
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post in'))
      .addStringOption(o => o.setName('color').setDescription('Embed color (hex)'))
      .addStringOption(o => o.setName('image').setDescription('Image URL to display in the embed'))
      .addRoleOption(o => o.setName('required_role').setDescription('Required role to enter'))
      .addIntegerOption(o => o.setName('min_level').setDescription('Minimum level required'))
      .addIntegerOption(o => o.setName('max_level').setDescription('Maximum level allowed'))
      .addBooleanOption(o => o.setName('stay').setDescription('Must stay in server to win'))
      .addChannelOption(o => o.setName('vc').setDescription('Must be in this voice channel')))
    .addSubcommand(s => s.setName('list').setDescription('List active giveaways'))
    .addSubcommand(s => s.setName('cancel').setDescription('Cancel a giveaway')
      .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))
    .addSubcommand(s => s.setName('end').setDescription('End a giveaway early')
      .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))
    .addSubcommand(s => s.setName('reroll').setDescription('Reroll giveaway winners')
      .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))
    .addSubcommand(s => s.setName('edit').setDescription('Edit a giveaway field')
      .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))
      .addStringOption(o => o.setName('field').setDescription('Field to edit').setRequired(true)
        .addChoices(
          { name: 'prize',    value: 'prize' },
          { name: 'winners',  value: 'winners' },
          { name: 'duration', value: 'duration' },
          { name: 'host',     value: 'host' },
          { name: 'color',    value: 'color' },
          { name: 'image',    value: 'image_url' },
        ))
      .addStringOption(o => o.setName('value').setDescription('New value').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    // ── start ────────────────────────────────────────────────────────────────
    if (sub === 'start') {
      const prize        = interaction.options.getString('prize');
      const durationStr  = interaction.options.getString('duration');
      const winners      = interaction.options.getInteger('winners') || 1;
      const channel      = interaction.options.getChannel('channel') || interaction.channel;
      const color        = interaction.options.getString('color') || GOLD;
      const imageUrl     = interaction.options.getString('image') || null;
      const requiredRole = interaction.options.getRole('required_role');
      const minLevel     = interaction.options.getInteger('min_level') || 0;
      const maxLevel     = interaction.options.getInteger('max_level') || null;
      const stay         = interaction.options.getBoolean('stay') || false;
      const vc           = interaction.options.getChannel('vc');

      const durationMs = parseDuration(durationStr);
      if (!durationMs) return interaction.reply({ content: '❌ Invalid duration.', ephemeral: true });

      const endsAt = Math.floor((Date.now() + durationMs) / 1000);

      db.createGiveaway({
        guild_id:       interaction.guild.id,
        channel_id:     channel.id,
        host_id:        interaction.user.id,
        prize,
        winners,
        ends_at:        endsAt,
        required_roles: requiredRole ? JSON.stringify([requiredRole.id]) : '[]',
        min_level:      minLevel,
        max_level:      maxLevel,
        stay_in_server: stay ? 1 : 0,
        color,
        voice_channel:  vc?.id || null,
        image_url:      imageUrl,
      });

      const giveaway = db.get('SELECT * FROM giveaways WHERE rowid = last_insert_rowid()');

      const embed = buildActiveEmbed({
        prize, winners, endsAt,
        hostId:   interaction.user.id,
        color,
        imageUrl,
      });

      const row = buildRow(giveaway?.id || 0, 0, false);

      const msg = await channel.send({ embeds: [embed], components: [row] });
      if (giveaway) db.updateGiveawayMessageId(giveaway.id, msg.id);

      const confirmEmbed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('✅ Giveaway Started')
        .addFields(
          { name: '🏆 Prize',    value: prize,                        inline: true },
          { name: '🎟️ Winners', value: winners.toString(),            inline: true },
          { name: '📍 Channel', value: `${channel}`,                  inline: true },
          { name: '⏰ Duration', value: formatDuration(durationMs),   inline: true },
          { name: '🆔 ID',       value: `${giveaway?.id || '?'}`,     inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

    // ── list ─────────────────────────────────────────────────────────────────
    } else if (sub === 'list') {
      const active = db.getActiveGiveaways(interaction.guild.id);
      if (active.length === 0) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor('#5865F2').setDescription('📭 No active giveaways.').setTimestamp()],
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('🎉 Active Giveaways')
        .setColor(GOLD)
        .setDescription(
          active.map(g =>
            `**#${g.id}** — **${g.prize}**\n<#${g.channel_id}> · ${g.winners} winner(s) · ends <t:${g.ends_at}:R> · ${db.getEntryCount(g.id)} entries`
          ).join('\n\n')
        )
        .setFooter({ text: `${active.length} active · flux bot` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    // ── cancel ───────────────────────────────────────────────────────────────
    } else if (sub === 'cancel') {
      const id = interaction.options.getInteger('id');
      const giveaway = db.getGiveaway(id);
      if (!giveaway || giveaway.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
      }
      db.cancelGiveaway(id);

      // Disable buttons on original message
      if (giveaway.message_id) {
        const gChannel = interaction.guild.channels.cache.get(giveaway.channel_id);
        if (gChannel) {
          const msg = await gChannel.messages.fetch(giveaway.message_id).catch(() => null);
          if (msg) {
            const cancelledEmbed = buildEndedEmbed({
              prize:     giveaway.prize,
              winners:   giveaway.winners,
              endsAt:    giveaway.ends_at,
              hostId:    giveaway.host_id,
              winnerIds: [],
              color:     giveaway.color,
              imageUrl:  giveaway.image_url,
            });
            const row = buildRow(id, db.getEntryCount(id), true);
            await msg.edit({ embeds: [cancelledEmbed], components: [row] }).catch(() => {});
          }
        }
      }

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(RED)
          .setDescription(`🗑️ Giveaway **#${id}** (**${giveaway.prize}**) has been cancelled.`)
          .setTimestamp()
        ],
        ephemeral: true,
      });

    // ── end ──────────────────────────────────────────────────────────────────
    } else if (sub === 'end') {
      const id = interaction.options.getInteger('id');
      const giveaway = db.getGiveaway(id);
      if (!giveaway || giveaway.guild_id !== interaction.guild.id || giveaway.ended) {
        return interaction.reply({ content: '❌ Giveaway not found or already ended.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      db.endGiveaway(id);
      const winnerIds = await processGiveawayEnd(client, giveaway);

      await interaction.editReply({
        content: winnerIds.length
          ? `✅ Ended! Winners: ${winnerIds.map(id => `<@${id}>`).join(', ')}`
          : '✅ Ended with no winners.',
      });

    // ── reroll ───────────────────────────────────────────────────────────────
    } else if (sub === 'reroll') {
      const id = interaction.options.getInteger('id');
      const giveaway = db.getGiveaway(id);
      if (!giveaway || giveaway.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
      }

      const entries = db.getEntries(id);
      if (entries.length === 0) {
        return interaction.reply({ content: '❌ No entries to reroll from.', ephemeral: true });
      }

      const winner = entries[Math.floor(Math.random() * entries.length)];
      const gChannel = interaction.guild.channels.cache.get(giveaway.channel_id);
      if (gChannel) {
        await gChannel.send({
          content: `<@${winner.user_id}>`,
          embeds: [new EmbedBuilder()
            .setColor(GOLD)
            .setTitle('🔁 Giveaway Rerolled!')
            .setDescription(`New winner: <@${winner.user_id}>\nPrize: **${giveaway.prize}**`)
            .setTimestamp()
          ],
        }).catch(() => {});
      }

      await interaction.reply({ content: `✅ Rerolled! New winner: <@${winner.user_id}>`, ephemeral: true });

    // ── edit ─────────────────────────────────────────────────────────────────
    } else if (sub === 'edit') {
      const id      = interaction.options.getInteger('id');
      const field   = interaction.options.getString('field');
      const value   = interaction.options.getString('value');
      const giveaway = db.getGiveaway(id);
      if (!giveaway || giveaway.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
      }

      if (field === 'winners') {
        const n = parseInt(value);
        if (isNaN(n) || n < 1) return interaction.reply({ content: '❌ Invalid winner count.', ephemeral: true });
        db.updateGiveaway(id, { winners: n });
      } else if (field === 'duration') {
        const ms = parseDuration(value);
        if (!ms) return interaction.reply({ content: '❌ Invalid duration.', ephemeral: true });
        db.updateGiveaway(id, { ends_at: Math.floor((Date.now() + ms) / 1000) });
      } else {
        db.updateGiveaway(id, { [field]: value });
      }

      // Refresh the live embed if giveaway is still active
      if (!giveaway.ended && !giveaway.cancelled && giveaway.message_id) {
        const updated = db.getGiveaway(id);
        const gChannel = interaction.guild.channels.cache.get(giveaway.channel_id);
        if (gChannel && updated) {
          const msg = await gChannel.messages.fetch(giveaway.message_id).catch(() => null);
          if (msg) {
            const newEmbed = buildActiveEmbed({
              prize:    updated.prize,
              winners:  updated.winners,
              endsAt:   updated.ends_at,
              hostId:   updated.host_id,
              color:    updated.color,
              imageUrl: updated.image_url,
            });
            await msg.edit({ embeds: [newEmbed] }).catch(() => {});
          }
        }
      }

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(GOLD)
          .setDescription(`✏️ Giveaway **#${id}** updated — \`${field}\` → \`${value}\``)
          .setTimestamp()
        ],
        ephemeral: true,
      });
    }
  },
};

module.exports = [giveaways];
