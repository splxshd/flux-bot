'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../database');
const { parseDuration, formatDuration, truncate } = require('../utils/helpers');
const { ensureMuteRole } = require('../utils/muteRole');

/** username\nID — two-line value matching reference embed style */
function uv(user) { return `${user.username}\n${user.id}`; }

// Shared embed builder for mod actions
function modEmbed(opts) {
  const {
    color, emoji, action, target, moderator,
    reason, extra = [], caseId = '?',
  } = opts;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${action}`)
    .addFields(
      { name: 'Member',    value: uv(target),    inline: true },
      { name: 'Moderator', value: uv(moderator), inline: true },
      { name: 'Reason',    value: reason },
      ...extra,
    )
    .setFooter({ text: `Case #${caseId}` })
    .setTimestamp();
}

const COLORS = {
  ban: '#ED4245',
  kick: '#FFA500',
  mute: '#99AAB5',
  warn: '#FEE75C',
  good: '#57F287',
  info: '#5865F2',
};

// ─── /ban ────────────────────────────────────────────────────────────────────
const ban = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the ban'))
    .addIntegerOption(o => o.setName('delete_days').setDescription('Days of messages to delete (0–7)').setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const delDays = interaction.options.getInteger('delete_days') ?? 0;

    try {
      await interaction.guild.members.ban(target, { reason, deleteMessageDays: delDays });
    } catch {
      return interaction.reply({ content: '❌ Failed to ban — check my role position and permissions.', ephemeral: true });
    }

    const banHist = db.addHistory(interaction.guild.id, target.id, interaction.user.id, 'ban', reason);
    const banCase = banHist?.lastInsertRowid ?? '?';

    const embed = modEmbed({
      color: COLORS.ban, emoji: '🔨', action: 'Member Banned',
      target, moderator: interaction.user, reason, caseId: banCase,
      extra: [{ name: 'Messages Deleted', value: `${delDays} day(s)`, inline: true }],
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /tempban ────────────────────────────────────────────────────────────────
const tempban = {
  data: new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Temporarily ban a member')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 1d, 12h)').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const durationMs = parseDuration(durationStr);

    if (!durationMs) return interaction.reply({ content: '❌ Invalid duration format. Try `10m`, `1h`, `2d`.', ephemeral: true });

    const expiresAt = Math.floor((Date.now() + durationMs) / 1000);

    try {
      await interaction.guild.members.ban(target, { reason });
    } catch {
      return interaction.reply({ content: '❌ Failed to ban — check my role position.', ephemeral: true });
    }

    db.addBan(interaction.guild.id, target.id, interaction.user.id, reason, expiresAt);
    const tbHist = db.addHistory(interaction.guild.id, target.id, interaction.user.id, 'tempban', reason, `expires:${expiresAt}`);
    const tbCase = tbHist?.lastInsertRowid ?? '?';

    const embed = modEmbed({
      color: COLORS.ban, emoji: '⏱️', action: 'Member Temp-Banned',
      target, moderator: interaction.user, reason, caseId: tbCase,
      extra: [
        { name: 'Duration', value: formatDuration(durationMs), inline: true },
        { name: 'Expires',  value: `<t:${expiresAt}:R>`,      inline: true },
      ],
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /kick ───────────────────────────────────────────────────────────────────
const kick = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!target) return interaction.reply({ content: '❌ Member not found in this server.', ephemeral: true });

    try {
      await target.kick(reason);
    } catch {
      return interaction.reply({ content: '❌ Failed to kick — check my role position.', ephemeral: true });
    }

    const kickHist = db.addHistory(interaction.guild.id, target.id, interaction.user.id, 'kick', reason);
    const kickCase = kickHist?.lastInsertRowid ?? '?';

    const embed = modEmbed({
      color: COLORS.kick, emoji: '👢', action: 'Member Kicked',
      target: target.user, moderator: interaction.user, reason, caseId: kickCase,
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /mute ───────────────────────────────────────────────────────────────────
const mute = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a member using the Muted role')
    .addUserOption(o => o.setName('user').setDescription('Member to mute').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 10m, 1h) — omit for permanent'))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getMember('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!target) return interaction.editReply('❌ Member not found.');

    const durationMs = durationStr ? parseDuration(durationStr) : null;
    if (durationStr && !durationMs) return interaction.editReply('❌ Invalid duration. Try `10m`, `1h`, `7d`.');

    const muteRole = await ensureMuteRole(interaction.guild);
    await target.roles.add(muteRole, reason);

    const expiresAt = durationMs ? Math.floor((Date.now() + durationMs) / 1000) : null;
    db.addMute(interaction.guild.id, target.id, expiresAt, reason);
    const muteHist = db.addHistory(interaction.guild.id, target.id, interaction.user.id, 'mute', reason, durationStr || 'permanent');
    const muteCase = muteHist?.lastInsertRowid ?? '?';

    const embed = modEmbed({
      color: COLORS.mute, emoji: '🔇', action: 'Member Muted',
      target: target.user, moderator: interaction.user, reason, caseId: muteCase,
      extra: [
        { name: 'Duration', value: durationMs ? formatDuration(durationMs) : 'Permanent', inline: true },
        { name: 'Expires',  value: expiresAt ? `<t:${expiresAt}:R>` : '—',               inline: true },
      ],
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

// ─── /unmute ─────────────────────────────────────────────────────────────────
const unmute = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a member')
    .addUserOption(o => o.setName('user').setDescription('Member to unmute').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!target) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    const muteRole = interaction.guild.roles.cache.find(r => r.name === 'Muted');
    if (muteRole) await target.roles.remove(muteRole, reason);
    db.removeMute(interaction.guild.id, target.id);
    const unmuteHist = db.addHistory(interaction.guild.id, target.id, interaction.user.id, 'unmute', reason);
    const unmuteCase = unmuteHist?.lastInsertRowid ?? '?';

    const embed = modEmbed({
      color: COLORS.good, emoji: '🔊', action: 'Member Unmuted',
      target: target.user, moderator: interaction.user, reason, caseId: unmuteCase,
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /warn ───────────────────────────────────────────────────────────────────
const warn = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member')
    .addUserOption(o => o.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    db.addWarning(interaction.guild.id, target.id, interaction.user.id, reason);
    const warnHist = db.addHistory(interaction.guild.id, target.id, interaction.user.id, 'warn', reason);
    const warnCase = warnHist?.lastInsertRowid ?? '?';
    const allWarns = db.getWarnings(interaction.guild.id, target.id);

    const embed = modEmbed({
      color: COLORS.warn, emoji: '⚠️', action: 'Member Warned',
      target, moderator: interaction.user, reason, caseId: warnCase,
      extra: [{ name: 'Total Warnings', value: `${allWarns.length} warning(s)`, inline: true }],
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /warnings ───────────────────────────────────────────────────────────────
const warnings = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a user')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const warns = db.getWarnings(interaction.guild.id, target.id);

    const embed = new EmbedBuilder()
      .setColor(warns.length === 0 ? COLORS.good : COLORS.warn)
      .setTitle(`⚠️ Warnings — ${target.username}`)
      .setThumbnail(target.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: `User ID: ${target.id}` });

    if (warns.length === 0) {
      embed.setDescription('✅ This user has no warnings.');
    } else {
      embed.setDescription(
        warns.map((w, i) =>
          `\`#${i + 1}\` **${w.reason}**\n> by <@${w.mod_id}> • <t:${w.created_at}:R>`
        ).join('\n\n')
      );
      embed.addFields({ name: '📊 Total', value: `**${warns.length}** warning(s)`, inline: true });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /clearwarns ─────────────────────────────────────────────────────────────
const clearwarns = {
  data: new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clear all warnings for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const before = db.getWarnings(interaction.guild.id, target.id).length;
    db.clearWarnings(interaction.guild.id, target.id);
    const cwHist = db.addHistory(interaction.guild.id, target.id, interaction.user.id, 'clearwarns', `Cleared ${before} warning(s)`);
    const cwCase = cwHist?.lastInsertRowid ?? '?';

    const embed = new EmbedBuilder()
      .setColor(COLORS.good)
      .setTitle('✅ Warnings Cleared')
      .addFields(
        { name: 'Member',    value: uv(target),            inline: true },
        { name: 'Moderator', value: uv(interaction.user),  inline: true },
        { name: 'Cleared',   value: `${before} warning(s)` },
      )
      .setFooter({ text: `Case #${cwCase}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /notes ──────────────────────────────────────────────────────────────────
const notes = {
  data: new SlashCommandBuilder()
    .setName('notes')
    .setDescription('Add or view moderator notes on a user')
    .addSubcommand(s => s.setName('add').setDescription('Add a note')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addStringOption(o => o.setName('content').setDescription('Note content').setRequired(true)))
    .addSubcommand(s => s.setName('view').setDescription('View notes for a user')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('user');

    if (sub === 'add') {
      const content = interaction.options.getString('content');
      db.addNote(interaction.guild.id, target.id, interaction.user.id, content);

      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('📝 Note Added')
        .addFields(
          { name: 'Member',    value: uv(target),            inline: true },
          { name: 'Moderator', value: uv(interaction.user),  inline: true },
          { name: 'Note',      value: content },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else {
      const noteList = db.getNotes(interaction.guild.id, target.id);

      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle(`📝 Notes — ${target.username}`)
        .setThumbnail(target.displayAvatarURL())
        .setFooter({ text: `User ID: ${target.id}` })
        .setTimestamp();

      if (noteList.length === 0) {
        embed.setDescription('No notes on record.');
      } else {
        embed.setDescription(
          noteList.map((n, i) =>
            `\`#${i + 1}\` ${n.content}\n> by <@${n.mod_id}> • <t:${n.created_at}:R>`
          ).join('\n\n')
        );
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

// ─── /history ────────────────────────────────────────────────────────────────
const history = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View moderation history for a user')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const hist = db.getHistory(interaction.guild.id, target.id);

    const ACTION_EMOJI = { ban: '🔨', tempban: '⏱️', kick: '👢', mute: '🔇', unmute: '🔊', warn: '⚠️', note: '📝' };

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`📋 Mod History — ${target.username}`)
      .setThumbnail(target.displayAvatarURL())
      .setFooter({ text: `${hist.length} total action(s) • ID: ${target.id}` })
      .setTimestamp();

    if (hist.length === 0) {
      embed.setDescription('✅ No moderation history on record.');
    } else {
      embed.setDescription(
        hist.slice(0, 10).map((h, i) => {
          const emoji = ACTION_EMOJI[h.action] || '🔹';
          return `\`#${i + 1}\` ${emoji} **${h.action.toUpperCase()}** — ${h.reason || 'No reason'}\n> <@${h.mod_id}> • <t:${h.created_at}:R>`;
        }).join('\n\n')
      );
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /reason ─────────────────────────────────────────────────────────────────
const reason = {
  data: new SlashCommandBuilder()
    .setName('reason')
    .setDescription('Update the reason for a mod action')
    .addIntegerOption(o => o.setName('id').setDescription('History entry ID').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('New reason').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const id = interaction.options.getInteger('id');
    const newReason = interaction.options.getString('reason');
    db.run('UPDATE mod_history SET reason = ? WHERE id = ? AND guild_id = ?', [newReason, id, interaction.guild.id]);

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setDescription(`✅ Reason updated for case **#${id}**.\n> ${newReason}`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /nuke ───────────────────────────────────────────────────────────────────
const nuke = {
  data: new SlashCommandBuilder()
    .setName('nuke')
    .setDescription('Clone and delete a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to nuke (defaults to current)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;

    const embed = new EmbedBuilder()
      .setColor(COLORS.ban)
      .setTitle('💥 Confirm Nuke')
      .setDescription(`You are about to **delete and recreate** ${channel}.\n\nThis will wipe all message history. Are you sure?`)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`nuke_confirm_${channel.id}`).setLabel('Nuke It').setStyle(ButtonStyle.Danger).setEmoji('💥'),
      new ButtonBuilder().setCustomId('nuke_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};

// ─── /nukeschedule ───────────────────────────────────────────────────────────
const nukeschedule = {
  data: new SlashCommandBuilder()
    .setName('nukeschedule')
    .setDescription('Schedule automatic channel nukes')
    .addSubcommand(s => s.setName('set').setDescription('Schedule a recurring nuke')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
      .addStringOption(o => o.setName('interval').setDescription('Interval (e.g. 1h, 6h, 1d)').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List active nuke schedules'))
    .addSubcommand(s => s.setName('stop').setDescription('Stop a nuke schedule')
      .addIntegerOption(o => o.setName('id').setDescription('Schedule ID').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      const intervalStr = interaction.options.getString('interval');
      const intervalMs = parseDuration(intervalStr);
      if (!intervalMs) return interaction.reply({ content: '❌ Invalid interval format.', ephemeral: true });

      db.addNukeSchedule(interaction.guild.id, channel.id, intervalMs, Math.floor((Date.now() + intervalMs) / 1000));

      const embed = new EmbedBuilder()
        .setColor(COLORS.ban)
        .setTitle('💥 Nuke Scheduled')
        .addFields(
          { name: '📍 Channel', value: `${channel}`, inline: true },
          { name: '⏱️ Interval', value: formatDuration(intervalMs), inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'list') {
      const schedules = db.getNukeSchedules(interaction.guild.id);
      if (schedules.length === 0) return interaction.reply({ content: 'No nuke schedules configured.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('💥 Nuke Schedules')
        .setDescription(schedules.map(s =>
          `**ID ${s.id}** — <#${s.channel_id}>\nEvery **${formatDuration(s.interval_ms)}** • Next: <t:${s.next_at}:R>`
        ).join('\n\n'))
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'stop') {
      const id = interaction.options.getInteger('id');
      db.removeNukeSchedule(id);
      await interaction.reply({ content: `✅ Nuke schedule **#${id}** removed.`, ephemeral: true });
    }
  },
};

// ─── /role ───────────────────────────────────────────────────────────────────
const role = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Add or remove a role from a member')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const r = interaction.options.getRole('role');
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    const had = member.roles.cache.has(r.id);
    if (had) await member.roles.remove(r);
    else await member.roles.add(r);

    const embed = new EmbedBuilder()
      .setColor(had ? COLORS.warn : COLORS.good)
      .setTitle(had ? '🗑️ Role Removed' : '✅ Role Added')
      .addFields(
        { name: 'Member',    value: uv(member.user),        inline: true },
        { name: 'Moderator', value: uv(interaction.user),   inline: true },
        { name: 'Role',      value: `${r.name}\n${r.id}` },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /rolehumans ─────────────────────────────────────────────────────────────
const rolehumans = {
  data: new SlashCommandBuilder()
    .setName('rolehumans')
    .setDescription('Add or remove a role from all human members')
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true)
      .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const r = interaction.options.getRole('role');
    const action = interaction.options.getString('action');
    const members = await interaction.guild.members.fetch();
    const humans = members.filter(m => !m.user.bot);
    let count = 0;
    for (const [, m] of humans) {
      if (action === 'add') await m.roles.add(r).catch(() => {});
      else await m.roles.remove(r).catch(() => {});
      count++;
    }

    const embed = new EmbedBuilder()
      .setColor(action === 'add' ? COLORS.good : COLORS.warn)
      .setTitle(`${action === 'add' ? '✅ Role Added' : '🗑️ Role Removed'} — All Humans`)
      .addFields(
        { name: '🏷️ Role', value: `${r}`, inline: true },
        { name: '👥 Affected', value: `${count} member(s)`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

// ─── /rolebots ───────────────────────────────────────────────────────────────
const rolebots = {
  data: new SlashCommandBuilder()
    .setName('rolebots')
    .setDescription('Add or remove a role from all bots')
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true)
      .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const r = interaction.options.getRole('role');
    const action = interaction.options.getString('action');
    const members = await interaction.guild.members.fetch();
    const bots = members.filter(m => m.user.bot);
    let count = 0;
    for (const [, m] of bots) {
      if (action === 'add') await m.roles.add(r).catch(() => {});
      else await m.roles.remove(r).catch(() => {});
      count++;
    }

    const embed = new EmbedBuilder()
      .setColor(action === 'add' ? COLORS.good : COLORS.warn)
      .setTitle(`${action === 'add' ? '✅ Role Added' : '🗑️ Role Removed'} — All Bots`)
      .addFields(
        { name: '🏷️ Role', value: `${r}`, inline: true },
        { name: '🤖 Affected', value: `${count} bot(s)`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

// ─── /temprole ───────────────────────────────────────────────────────────────
const temprole = {
  data: new SlashCommandBuilder()
    .setName('temprole')
    .setDescription('Give a member a temporary role')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 1h, 1d)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const r = interaction.options.getRole('role');
    const durationStr = interaction.options.getString('duration');
    const durationMs = parseDuration(durationStr);

    if (!durationMs) return interaction.reply({ content: '❌ Invalid duration.', ephemeral: true });
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    await member.roles.add(r);
    const expiresAt = Math.floor((Date.now() + durationMs) / 1000);
    db.addTempRole(interaction.guild.id, member.id, r.id, expiresAt);

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('⏱️ Temporary Role Assigned')
      .addFields(
        { name: 'Member',    value: uv(member.user),        inline: true },
        { name: 'Moderator', value: uv(interaction.user),   inline: true },
        { name: 'Role',      value: `${r.name}\n${r.id}` },
        { name: 'Duration',  value: formatDuration(durationMs), inline: true },
        { name: 'Expires',   value: `<t:${expiresAt}:R>`,       inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /temprolelist ───────────────────────────────────────────────────────────
const temprolelist = {
  data: new SlashCommandBuilder()
    .setName('temprolelist')
    .setDescription('List all active temporary roles in this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const rows = db.getAllTempRoles(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('⏱️ Active Temporary Roles')
      .setTimestamp()
      .setFooter({ text: `${rows.length} active temp role(s)` });

    if (rows.length === 0) {
      embed.setDescription('No active temporary roles.');
    } else {
      embed.setDescription(rows.map(r =>
        `<@${r.user_id}> → <@&${r.role_id}>\nExpires <t:${r.expires_at}:R>`
      ).join('\n\n'));
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /forcenickname ──────────────────────────────────────────────────────────
const forcenickname = {
  data: new SlashCommandBuilder()
    .setName('forcenickname')
    .setDescription('Force a nickname on a member (persists on rejoin)')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('nickname').setDescription('Nickname (omit to remove)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const nick = interaction.options.getString('nickname');
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    if (nick) {
      db.setForcedNickname(interaction.guild.id, member.id, nick);
      await member.setNickname(nick).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('📛 Nickname Forced')
        .addFields(
          { name: 'Member',    value: uv(member.user),       inline: true },
          { name: 'Moderator', value: uv(interaction.user),  inline: true },
          { name: 'Nickname',  value: nick },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
      db.removeForcedNickname(interaction.guild.id, member.id);
      await member.setNickname(null).catch(() => {});
      await interaction.reply({ content: `✅ Removed forced nickname from **${member.user.tag}**.`, ephemeral: true });
    }
  },
};

// ─── /forcenicknamelist ──────────────────────────────────────────────────────
const forcenicknamelist = {
  data: new SlashCommandBuilder()
    .setName('forcenicknamelist')
    .setDescription('List all forced nicknames in this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  async execute(interaction) {
    const rows = db.getAllForcedNicknames(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('📛 Forced Nicknames')
      .setTimestamp()
      .setFooter({ text: `${rows.length} forced nickname(s)` });

    embed.setDescription(rows.length === 0
      ? 'No forced nicknames set.'
      : rows.map(r => `<@${r.user_id}> → **${r.nickname}**`).join('\n')
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /rolepersist ────────────────────────────────────────────────────────────
const rolepersist = {
  data: new SlashCommandBuilder()
    .setName('rolepersist')
    .setDescription('Manually save a member\'s roles to persist on rejoin')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    const roleIds = member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.id);
    db.saveRoles(interaction.guild.id, member.id, roleIds);

    const embed = new EmbedBuilder()
      .setColor(COLORS.good)
      .setDescription(`✅ Saved **${roleIds.length}** role(s) for **${member.user.tag}** — will be restored on rejoin.`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /unrolepersist ──────────────────────────────────────────────────────────
const unrolepersist = {
  data: new SlashCommandBuilder()
    .setName('unrolepersist')
    .setDescription('Clear saved persistent roles for a member')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });
    db.run('DELETE FROM role_persist WHERE guild_id = ? AND user_id = ?', [interaction.guild.id, member.id]);
    await interaction.reply({ content: `✅ Cleared role persist for **${member.user.tag}**.`, ephemeral: true });
  },
};

// ─── /rolerestore ────────────────────────────────────────────────────────────
const rolerestore = {
  data: new SlashCommandBuilder()
    .setName('rolerestore')
    .setDescription('Restore saved roles to a member immediately')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    const saved = db.getSavedRoles(interaction.guild.id, member.id);
    if (!saved) return interaction.reply({ content: '❌ No saved roles found for this member.', ephemeral: true });

    const roleIds = JSON.parse(saved.roles || '[]');
    for (const id of roleIds) await member.roles.add(id).catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(COLORS.good)
      .setDescription(`✅ Restored **${roleIds.length}** role(s) to **${member.user.tag}**.`)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /stripstaff ─────────────────────────────────────────────────────────────
const stripstaff = {
  data: new SlashCommandBuilder()
    .setName('stripstaff')
    .setDescription('Remove all roles from a member')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    const count = member.roles.cache.size - 1;
    await member.roles.set([]);

    const embed = new EmbedBuilder()
      .setColor(COLORS.warn)
      .setTitle('🧹 Roles Stripped')
      .addFields(
        { name: 'Member',    value: uv(member.user),       inline: true },
        { name: 'Moderator', value: uv(interaction.user),  inline: true },
        { name: 'Removed',   value: `${count} role(s)` },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /bans ───────────────────────────────────────────────────────────────────
const bans = {
  data: new SlashCommandBuilder()
    .setName('bans')
    .setDescription('List active temporary bans in this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const rows = db.getAllBans(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(COLORS.ban)
      .setTitle('🔨 Active Temp Bans')
      .setTimestamp()
      .setFooter({ text: `${rows.length} temp ban(s)` });

    embed.setDescription(rows.length === 0
      ? 'No tracked temp bans.'
      : rows.map(r => `<@${r.user_id}>\n${r.expires_at ? `Expires <t:${r.expires_at}:R>` : '**Permanent**'}`).join('\n\n')
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /mutes ──────────────────────────────────────────────────────────────────
const mutes = {
  data: new SlashCommandBuilder()
    .setName('mutes')
    .setDescription('List all active mutes in this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const rows = db.getAllMutes(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setColor(COLORS.mute)
      .setTitle('🔇 Active Mutes')
      .setTimestamp()
      .setFooter({ text: `${rows.length} active mute(s)` });

    embed.setDescription(rows.length === 0
      ? 'No active mutes.'
      : rows.map(r =>
        `<@${r.user_id}>\n${r.expires_at ? `Expires <t:${r.expires_at}:R>` : '**Permanent**'}${r.reason ? `\n> ${r.reason}` : ''}`
      ).join('\n\n')
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /jaillist ───────────────────────────────────────────────────────────────
const jaillist = {
  data: new SlashCommandBuilder()
    .setName('jaillist')
    .setDescription('List all members currently in the Muted role')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const muteRole = interaction.guild.roles.cache.find(r => r.name === 'Muted');

    const embed = new EmbedBuilder()
      .setColor(COLORS.mute)
      .setTitle('🔇 Jailed Members')
      .setTimestamp();

    if (!muteRole || muteRole.members.size === 0) {
      embed.setDescription('No members currently muted.');
    } else {
      embed.setDescription(muteRole.members.map(m => `<@${m.id}> — ${m.user.tag}`).join('\n'));
      embed.setFooter({ text: `${muteRole.members.size} jailed member(s)` });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /timeoutlist ────────────────────────────────────────────────────────────
const timeoutlist = {
  data: new SlashCommandBuilder()
    .setName('timeoutlist')
    .setDescription('List Discord-timed-out members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const members = await interaction.guild.members.fetch();
    const timedOut = members.filter(m => m.communicationDisabledUntilTimestamp && m.communicationDisabledUntilTimestamp > Date.now());

    const embed = new EmbedBuilder()
      .setColor(COLORS.mute)
      .setTitle('⏳ Discord Timed-Out Members')
      .setTimestamp()
      .setFooter({ text: `${timedOut.size} timed-out member(s)` });

    embed.setDescription(timedOut.size === 0
      ? 'No timed-out members.'
      : [...timedOut.values()].map(m =>
        `<@${m.id}> — until <t:${Math.floor(m.communicationDisabledUntilTimestamp / 1000)}:R>`
      ).join('\n')
    );

    await interaction.editReply({ embeds: [embed] });
  },
};

// ─── /modstats ───────────────────────────────────────────────────────────────
const modstats = {
  data: new SlashCommandBuilder()
    .setName('modstats')
    .setDescription('View moderation statistics for a moderator')
    .addUserOption(o => o.setName('mod').setDescription('Moderator (defaults to yourself)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const mod = interaction.options.getUser('mod') || interaction.user;
    const stats = db.getModStats(interaction.guild.id, mod.id);

    const ACTION_EMOJI = { ban: '🔨', tempban: '⏱️', kick: '👢', mute: '🔇', unmute: '🔊', warn: '⚠️' };
    const total = stats.reduce((sum, s) => sum + s.count, 0);

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setAuthor({ name: `Mod Stats — ${mod.tag}`, iconURL: mod.displayAvatarURL() })
      .setThumbnail(mod.displayAvatarURL())
      .setFooter({ text: `${total} total action(s)` })
      .setTimestamp();

    if (stats.length === 0) {
      embed.setDescription('No moderation actions on record.');
    } else {
      embed.addFields(stats.map(s => ({
        name: `${ACTION_EMOJI[s.action] || '🔹'} ${s.action.charAt(0).toUpperCase() + s.action.slice(1)}`,
        value: `**${s.count}**`,
        inline: true,
      })));
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /raid ───────────────────────────────────────────────────────────────────
const raid = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Mass-action recent-join raiders')
    .addIntegerOption(o => o.setName('minutes').setDescription('Join window in minutes').setRequired(true).setMinValue(1).setMaxValue(60))
    .addStringOption(o => o.setName('action').setDescription('Action').addChoices(
      { name: 'ban', value: 'ban' }, { name: 'kick', value: 'kick' }
    ))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const minutes = interaction.options.getInteger('minutes');
    const action = interaction.options.getString('action') || 'ban';
    const cutoff = Date.now() - minutes * 60 * 1000;
    const members = await interaction.guild.members.fetch();
    const raiders = members.filter(m => !m.user.bot && m.joinedTimestamp && m.joinedTimestamp >= cutoff);

    let count = 0;
    for (const [, m] of raiders) {
      if (action === 'ban') await m.ban({ reason: `Anti-raid — joined last ${minutes}m` }).catch(() => {});
      else await m.kick(`Anti-raid — joined last ${minutes}m`).catch(() => {});
      count++;
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.ban)
      .setTitle('🛡️ Raid Action Complete')
      .addFields(
        { name: '⚡ Action', value: action.toUpperCase(), inline: true },
        { name: '⏱️ Window', value: `${minutes} minute(s)`, inline: true },
        { name: '👥 Affected', value: `**${count}** member(s)`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

// ─── /talk ───────────────────────────────────────────────────────────────────
const talk = {
  data: new SlashCommandBuilder()
    .setName('talk')
    .setDescription('Allow a muted member to talk in one channel temporarily')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const channel = interaction.options.getChannel('channel');
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });

    await channel.permissionOverwrites.edit(member, { SendMessages: true });
    await interaction.reply({ content: `✅ **${member.user.tag}** can now speak in ${channel}.`, ephemeral: true });
  },
};

// ─── /silence / /unsilence ────────────────────────────────────────────────────
const silence = {
  data: new SlashCommandBuilder()
    .setName('silence')
    .setDescription('Prevent everyone from sending messages in a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to current)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    const embed = new EmbedBuilder().setColor(COLORS.mute).setDescription(`🔕 ${channel} has been **silenced**.`).setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

const unsilence = {
  data: new SlashCommandBuilder()
    .setName('unsilence')
    .setDescription('Restore sending permissions in a silenced channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to current)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    const embed = new EmbedBuilder().setColor(COLORS.good).setDescription(`🔔 ${channel} has been **unsilenced**.`).setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /imute / /iunmute ────────────────────────────────────────────────────────
const imute = {
  data: new SlashCommandBuilder()
    .setName('imute')
    .setDescription('Block a member from sending images/attachments')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });
    for (const [, ch] of interaction.guild.channels.cache) {
      await ch.permissionOverwrites.edit(member, { AttachFiles: false, EmbedLinks: false }).catch(() => {});
    }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.mute).setDescription(`🖼️ **${member.user.tag}** can no longer send images or attachments.`).setTimestamp()], ephemeral: true });
  },
};

const iunmute = {
  data: new SlashCommandBuilder()
    .setName('iunmute')
    .setDescription('Restore image/attachment permissions for a member')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });
    for (const [, ch] of interaction.guild.channels.cache) {
      await ch.permissionOverwrites.edit(member, { AttachFiles: null, EmbedLinks: null }).catch(() => {});
    }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.good).setDescription(`🖼️ Image mute removed from **${member.user.tag}**.`).setTimestamp()], ephemeral: true });
  },
};

// ─── /rmute / /runmute ────────────────────────────────────────────────────────
const rmute = {
  data: new SlashCommandBuilder()
    .setName('rmute')
    .setDescription('Block a member from adding reactions')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });
    for (const [, ch] of interaction.guild.channels.cache) {
      await ch.permissionOverwrites.edit(member, { AddReactions: false }).catch(() => {});
    }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.mute).setDescription(`😶 **${member.user.tag}** can no longer add reactions.`).setTimestamp()], ephemeral: true });
  },
};

const runmute = {
  data: new SlashCommandBuilder()
    .setName('runmute')
    .setDescription('Restore reaction permissions for a member')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    if (!member) return interaction.reply({ content: '❌ Member not found.', ephemeral: true });
    for (const [, ch] of interaction.guild.channels.cache) {
      await ch.permissionOverwrites.edit(member, { AddReactions: null }).catch(() => {});
    }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.good).setDescription(`😄 Reaction mute removed from **${member.user.tag}**.`).setTimestamp()], ephemeral: true });
  },
};

// ─── /fakepermissions ────────────────────────────────────────────────────────
const fakepermissions = {
  data: new SlashCommandBuilder()
    .setName('fakepermissions')
    .setDescription('Manage displayed fake permissions for roles')
    .addSubcommand(s => s.setName('grant').setDescription('Grant a fake permission')
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
      .addStringOption(o => o.setName('permission').setDescription('Permission name').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a fake permission')
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))
      .addStringOption(o => o.setName('permission').setDescription('Permission name').setRequired(true)))
    .addSubcommand(s => s.setName('reset').setDescription('Reset all fake permissions for a role')
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List fake permissions for a role')
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const r = interaction.options.getRole('role');

    if (sub === 'grant') {
      const perm = interaction.options.getString('permission');
      db.grantFakePerm(interaction.guild.id, r.id, perm);
      await interaction.reply({ content: `✅ Granted fake permission **${perm}** to ${r}.`, ephemeral: true });
    } else if (sub === 'remove') {
      const perm = interaction.options.getString('permission');
      db.removeFakePerm(interaction.guild.id, r.id, perm);
      await interaction.reply({ content: `✅ Removed **${perm}** from ${r}.`, ephemeral: true });
    } else if (sub === 'reset') {
      db.resetFakePerms(interaction.guild.id, r.id);
      await interaction.reply({ content: `✅ Reset all fake permissions for ${r}.`, ephemeral: true });
    } else if (sub === 'list') {
      const perms = db.getFakePerms(interaction.guild.id, r.id);
      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle(`🔐 Fake Permissions — ${r.name}`)
        .setDescription(perms.length === 0 ? 'No fake permissions set.' : perms.map(p => `• \`${p.permission}\``).join('\n'))
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

// ─── /invokemod ──────────────────────────────────────────────────────────────
const invokemod = {
  data: new SlashCommandBuilder()
    .setName('invokemod')
    .setDescription('Configure automatic messages sent when mod actions occur')
    .addSubcommand(s => s.setName('message').setDescription('Set channel + DM message for a mod action')
      .addStringOption(o => o.setName('action').setDescription('Action (ban/kick/mute/warn)').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Channel message').setRequired(true))
      .addStringOption(o => o.setName('dm_message').setDescription('DM to target')))
    .addSubcommand(s => s.setName('dm').setDescription('Set only the DM message for a mod action')
      .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true))
      .addStringOption(o => o.setName('dm_message').setDescription('DM message').setRequired(true)))
    .addSubcommand(s => s.setName('view').setDescription('View all configured invoke messages'))
    .addSubcommand(s => s.setName('remove').setDescription('Remove invoke messages for an action')
      .addStringOption(o => o.setName('action').setDescription('Action').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'message') {
      const action = interaction.options.getString('action');
      const msg = interaction.options.getString('message');
      const dm = interaction.options.getString('dm_message');
      db.setInvokeMod(interaction.guild.id, action, msg, dm);
      await interaction.reply({ content: `✅ Invoke message set for \`${action}\`.`, ephemeral: true });
    } else if (sub === 'dm') {
      const action = interaction.options.getString('action');
      const dm = interaction.options.getString('dm_message');
      const existing = db.getInvokeMod(interaction.guild.id, action);
      db.setInvokeMod(interaction.guild.id, action, existing?.message || null, dm);
      await interaction.reply({ content: `✅ DM message set for \`${action}\`.`, ephemeral: true });
    } else if (sub === 'view') {
      const rows = db.all('SELECT * FROM invoke_mods WHERE guild_id = ?', [interaction.guild.id]);
      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('⚙️ Invoke Mod Messages')
        .setTimestamp();
      embed.setDescription(rows.length === 0
        ? 'No invoke messages configured.'
        : rows.map(r => `**\`${r.action}\`**\nMessage: ${r.message || '_None_'}\nDM: ${r.dm_message || '_None_'}`).join('\n\n')
      );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'remove') {
      const action = interaction.options.getString('action');
      db.removeInvokeMod(interaction.guild.id, action);
      await interaction.reply({ content: `✅ Removed invoke messages for \`${action}\`.`, ephemeral: true });
    }
  },
};

module.exports = [
  ban, tempban, kick, mute, unmute, warn, warnings, clearwarns,
  notes, history, reason, nuke, nukeschedule, role, rolehumans, rolebots,
  temprole, temprolelist, forcenickname, forcenicknamelist,
  rolepersist, unrolepersist, rolerestore, stripstaff, bans, mutes,
  jaillist, timeoutlist, modstats, raid, talk, silence, unsilence,
  imute, iunmute, rmute, runmute, fakepermissions, invokemod,
];
