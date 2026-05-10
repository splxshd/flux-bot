'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../database');
const { parseDuration, formatDuration } = require('../utils/helpers');

const GOLD = '#FFD700';
const RED  = '#ED4245';

function giveawayEmbed({ prize, winners, endsAt, hostId, hostAvatarURL, color, giveawayId, requiredRole, extra = [] }) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: '🎉 GIVEAWAY', iconURL: hostAvatarURL })
    .setTitle(prize)
    .setColor(color || GOLD)
    .addFields(
      { name: '🏆 Winners', value: winners.toString(), inline: true },
      { name: '⏰ Ends', value: `<t:${endsAt}:R>`, inline: true },
      { name: '🎟️ Host', value: `<@${hostId}>`, inline: true },
      ...extra,
    )
    .setFooter({ text: `ID: ${giveawayId} • Click Enter to join!` })
    .setTimestamp(endsAt * 1000);
  if (requiredRole) embed.addFields({ name: '📋 Required Role', value: requiredRole.toString(), inline: true });
  return embed;
}

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
          { name: 'prize', value: 'prize' },
          { name: 'winners', value: 'winners' },
          { name: 'duration', value: 'duration' },
          { name: 'host', value: 'host' },
          { name: 'color', value: 'color' },
        ))
      .addStringOption(o => o.setName('value').setDescription('New value').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const prize = interaction.options.getString('prize');
      const durationStr = interaction.options.getString('duration');
      const winners = interaction.options.getInteger('winners') || 1;
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const color = interaction.options.getString('color') || GOLD;
      const requiredRole = interaction.options.getRole('required_role');
      const minLevel = interaction.options.getInteger('min_level') || 0;
      const maxLevel = interaction.options.getInteger('max_level') || null;
      const stay = interaction.options.getBoolean('stay') || false;
      const vc = interaction.options.getChannel('vc');

      const durationMs = parseDuration(durationStr);
      if (!durationMs) return interaction.reply({ content: '❌ Invalid duration.', ephemeral: true });

      const endsAt = Math.floor((Date.now() + durationMs) / 1000);

      const data = {
        guild_id: interaction.guild.id,
        channel_id: channel.id,
        host_id: interaction.user.id,
        prize,
        winners,
        ends_at: endsAt,
        required_roles: requiredRole ? JSON.stringify([requiredRole.id]) : '[]',
        min_level: minLevel,
        max_level: maxLevel,
        stay_in_server: stay ? 1 : 0,
        color,
        voice_channel: vc?.id || null,
      };

      db.createGiveaway(data);
      const giveaway = db.get('SELECT * FROM giveaways WHERE rowid = last_insert_rowid()');

      const embed = giveawayEmbed({
        prize,
        winners,
        endsAt,
        hostId: interaction.user.id,
        hostAvatarURL: interaction.user.displayAvatarURL(),
        color,
        giveawayId: giveaway?.id || '?',
        requiredRole,
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway_enter_${giveaway?.id || '0'}`)
          .setLabel('Enter Giveaway')
          .setEmoji('🎉')
          .setStyle(ButtonStyle.Success)
      );

      const msg = await channel.send({ embeds: [embed], components: [row] });
      if (giveaway) db.updateGiveawayMessageId(giveaway.id, msg.id);

      const confirmEmbed = new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: '✅ Giveaway Started', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '🏆 Prize', value: prize, inline: true },
          { name: '🎟️ Winners', value: winners.toString(), inline: true },
          { name: '📍 Channel', value: `${channel}`, inline: true },
          { name: '⏰ Duration', value: formatDuration(durationMs), inline: true },
          { name: '🆔 ID', value: `${giveaway?.id || '?'}`, inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

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
            `**#${g.id}** — **${g.prize}**\n<#${g.channel_id}> • ${g.winners} winner(s) • ends <t:${g.ends_at}:R>`
          ).join('\n\n')
        )
        .setFooter({ text: `${active.length} active giveaway(s) • flux bot` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'cancel') {
      const id = interaction.options.getInteger('id');
      const giveaway = db.getGiveaway(id);
      if (!giveaway || giveaway.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
      }
      db.cancelGiveaway(id);

      const embed = new EmbedBuilder()
        .setColor(RED)
        .setAuthor({ name: '🗑️ Giveaway Cancelled', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '🏆 Prize', value: giveaway.prize, inline: true },
          { name: '🆔 ID', value: id.toString(), inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'end') {
      const id = interaction.options.getInteger('id');
      const giveaway = db.getGiveaway(id);
      if (!giveaway || giveaway.guild_id !== interaction.guild.id || giveaway.ended) {
        return interaction.reply({ content: '❌ Giveaway not found or already ended.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const gChannel = interaction.guild.channels.cache.get(giveaway.channel_id);
      if (!gChannel) { db.endGiveaway(id); return interaction.editReply('✅ Ended (channel not found).'); }

      const message = await gChannel.messages.fetch(giveaway.message_id).catch(() => null);
      let winners = [];

      if (message) {
        const react = message.reactions.cache.get('🎉');
        if (react) {
          const users = await react.users.fetch();
          const eligible = users.filter(u => !u.bot).map(u => u);
          for (let i = 0; i < Math.min(giveaway.winners, eligible.length); i++) {
            const idx = Math.floor(Math.random() * eligible.length);
            winners.push(eligible.splice(idx, 1)[0]);
          }
        }
      }

      db.endGiveaway(id);

      if (winners.length > 0) {
        const winEmbed = new EmbedBuilder()
          .setAuthor({ name: '🎊 Giveaway Ended!' })
          .setTitle(giveaway.prize)
          .setColor(GOLD)
          .setDescription(`Congratulations to our winner${winners.length > 1 ? 's' : ''}!`)
          .addFields(
            { name: '🏆 Winner(s)', value: winners.map(w => `<@${w.id}>`).join('\n'), inline: true },
            { name: '🎟️ Host', value: `<@${giveaway.host_id}>`, inline: true },
          )
          .setFooter({ text: `ID: ${id} • flux bot` })
          .setTimestamp();
        await gChannel.send({ embeds: [winEmbed] });
      } else {
        const noWinEmbed = new EmbedBuilder()
          .setColor(RED)
          .setTitle('😢 Giveaway Ended — No Winners')
          .setDescription(`No valid entrants for **${giveaway.prize}**.`)
          .setFooter({ text: `ID: ${id} • flux bot` })
          .setTimestamp();
        await gChannel.send({ embeds: [noWinEmbed] });
      }

      await interaction.editReply({ content: `✅ Giveaway ended. Winners: ${winners.map(w => w.tag).join(', ') || 'None'}` });

    } else if (sub === 'reroll') {
      const id = interaction.options.getInteger('id');
      const giveaway = db.getGiveaway(id);
      if (!giveaway || giveaway.guild_id !== interaction.guild.id) {
        return interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const gChannel = interaction.guild.channels.cache.get(giveaway.channel_id);
      if (!gChannel) return interaction.editReply('❌ Channel not found.');

      const message = await gChannel.messages.fetch(giveaway.message_id).catch(() => null);
      if (!message) return interaction.editReply('❌ Giveaway message not found.');

      const react = message.reactions.cache.get('🎉');
      if (!react) return interaction.editReply('❌ No reactions found.');

      const users = await react.users.fetch();
      const eligible = users.filter(u => !u.bot).map(u => u);
      if (eligible.length === 0) return interaction.editReply('❌ No eligible users for reroll.');

      const winner = eligible[Math.floor(Math.random() * eligible.length)];

      const rerollEmbed = new EmbedBuilder()
        .setAuthor({ name: '🔁 Giveaway Rerolled!' })
        .setTitle(giveaway.prize)
        .setColor(GOLD)
        .addFields(
          { name: '🏆 New Winner', value: `<@${winner.id}>`, inline: true },
          { name: '🎟️ Host', value: `<@${giveaway.host_id}>`, inline: true },
        )
        .setFooter({ text: `ID: ${id} • flux bot` })
        .setTimestamp();

      await gChannel.send({ embeds: [rerollEmbed] });
      await interaction.editReply({ content: `✅ Rerolled! New winner: **${winner.tag}**` });

    } else if (sub === 'edit') {
      const id = interaction.options.getInteger('id');
      const field = interaction.options.getString('field');
      const value = interaction.options.getString('value');
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
        const newEnd = Math.floor((Date.now() + ms) / 1000);
        db.updateGiveaway(id, { ends_at: newEnd });
      } else {
        db.updateGiveaway(id, { [field]: value });
      }

      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: '✏️ Giveaway Updated', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '🆔 ID', value: id.toString(), inline: true },
          { name: '📝 Field', value: field, inline: true },
          { name: '🔄 New Value', value: value, inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

module.exports = [giveaways];
