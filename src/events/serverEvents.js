'use strict';

/**
 * Comprehensive server-event logging.
 * Covers: channels, roles, voice, bans, invites, bulk-delete,
 *         threads, emojis, stickers, server settings, webhooks.
 *
 * Reads log_channel from guild_settings; silently does nothing if unset.
 */

const { EmbedBuilder, AuditLogEvent, ChannelType, PermissionsBitField } = require('discord.js');
const db = require('../database');

// ── Helpers ───────────────────────────────────────────────────────────────────

function logCh(guild) {
  const s = db.getGuildSettings(guild.id);
  if (!s?.log_channel) return null;
  return guild.channels.cache.get(s.log_channel) ?? null;
}

function send(guild, embed) {
  const ch = logCh(guild);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

const CHANNEL_TYPES = {
  [ChannelType.GuildText]:          'Text',
  [ChannelType.GuildVoice]:         'Voice',
  [ChannelType.GuildCategory]:      'Category',
  [ChannelType.GuildAnnouncement]:  'Announcement',
  [ChannelType.GuildStageVoice]:    'Stage',
  [ChannelType.GuildForum]:         'Forum',
  [ChannelType.GuildMedia]:         'Media',
  [ChannelType.PublicThread]:       'Public Thread',
  [ChannelType.PrivateThread]:      'Private Thread',
  [ChannelType.AnnouncementThread]: 'Announcement Thread',
};

function chType(ch) {
  return CHANNEL_TYPES[ch.type] ?? 'Unknown';
}

/** Return human-readable list of permission flag names that differ between two bitfields */
function permDiff(oldBits, newBits) {
  const old_ = new PermissionsBitField(BigInt(oldBits));
  const new_ = new PermissionsBitField(BigInt(newBits));
  const added   = new PermissionsBitField(new_.bitfield & ~old_.bitfield);
  const removed = new PermissionsBitField(old_.bitfield & ~new_.bitfield);

  const fmt = (bits) =>
    Object.keys(PermissionsBitField.Flags)
      .filter(k => bits.has(PermissionsBitField.Flags[k]))
      .map(k => k.replace(/_/g, ' ').toLowerCase())
      .join(', ') || 'none';

  return { added: fmt(added), removed: fmt(removed) };
}

/** Fetch the latest audit log entry for a given action (returns executor tag + reason) */
async function auditInfo(guild, action, targetId = null, timeout = 1500) {
  await new Promise(r => setTimeout(r, timeout));
  try {
    const logs = await guild.fetchAuditLogs({ type: action, limit: 1 });
    const entry = logs.entries.first();
    if (!entry) return {};
    if (targetId && entry.target?.id !== targetId) return {};
    return {
      executor: entry.executor?.tag ?? 'Unknown',
      reason:   entry.reason ?? null,
    };
  } catch { return {}; }
}

// ── Module ────────────────────────────────────────────────────────────────────

module.exports = (client) => {

  // ══════════════════════════════════════════════════════
  //  CHANNELS
  // ══════════════════════════════════════════════════════

  client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    const { executor } = await auditInfo(channel.guild, AuditLogEvent.ChannelCreate, channel.id);

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setAuthor({ name: 'Channel Created' })
      .addFields(
        { name: '📌 Name',     value: `${channel}`, inline: true },
        { name: '🏷️ Type',    value: chType(channel), inline: true },
        { name: '🆔 ID',      value: channel.id, inline: true },
      )
      .setFooter({ text: executor ? `Created by ${executor}` : 'Creator unknown' })
      .setTimestamp();

    if (channel.parent) embed.addFields({ name: '📂 Category', value: channel.parent.name, inline: true });
    send(channel.guild, embed);
  });

  client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    const { executor } = await auditInfo(channel.guild, AuditLogEvent.ChannelDelete, channel.id);

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: 'Channel Deleted' })
      .addFields(
        { name: '📌 Name',  value: channel.name, inline: true },
        { name: '🏷️ Type', value: chType(channel), inline: true },
        { name: '🆔 ID',   value: channel.id, inline: true },
      )
      .setFooter({ text: executor ? `Deleted by ${executor}` : 'Deleter unknown' })
      .setTimestamp();

    if (channel.parent) embed.addFields({ name: '📂 Category', value: channel.parent.name, inline: true });
    send(channel.guild, embed);
  });

  client.on('channelUpdate', async (oldCh, newCh) => {
    if (!newCh.guild) return;

    const changes = [];
    if (oldCh.name    !== newCh.name)    changes.push({ name: '✏️ Name',    value: `${oldCh.name} → ${newCh.name}` });
    if (oldCh.topic   !== newCh.topic)   changes.push({ name: '📝 Topic',   value: `${oldCh.topic || '*none*'} → ${newCh.topic || '*none*'}` });
    if (oldCh.nsfw    !== newCh.nsfw)    changes.push({ name: '🔞 NSFW',    value: `${oldCh.nsfw} → ${newCh.nsfw}`, inline: true });
    if (oldCh.rateLimitPerUser !== newCh.rateLimitPerUser)
      changes.push({ name: '🐌 Slowmode', value: `${oldCh.rateLimitPerUser}s → ${newCh.rateLimitPerUser}s`, inline: true });
    if (oldCh.bitrate !== newCh.bitrate) changes.push({ name: '🔊 Bitrate', value: `${oldCh.bitrate} → ${newCh.bitrate}`, inline: true });
    if ((oldCh.parentId ?? '') !== (newCh.parentId ?? ''))
      changes.push({ name: '📂 Category', value: `${oldCh.parent?.name ?? 'none'} → ${newCh.parent?.name ?? 'none'}` });

    if (!changes.length) return;

    const { executor } = await auditInfo(newCh.guild, AuditLogEvent.ChannelUpdate, newCh.id);

    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setAuthor({ name: 'Channel Updated' })
      .addFields(
        { name: '📌 Channel', value: `${newCh}`, inline: true },
        { name: '🆔 ID',     value: newCh.id, inline: true },
        ...changes,
      )
      .setFooter({ text: executor ? `Updated by ${executor}` : 'Updater unknown' })
      .setTimestamp();

    send(newCh.guild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  ROLES
  // ══════════════════════════════════════════════════════

  client.on('roleCreate', async (role) => {
    const { executor } = await auditInfo(role.guild, AuditLogEvent.RoleCreate, role.id);

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setAuthor({ name: 'Role Created' })
      .addFields(
        { name: '🎭 Name',        value: role.name, inline: true },
        { name: '🎨 Color',       value: role.hexColor, inline: true },
        { name: '🆔 ID',         value: role.id, inline: true },
        { name: '📣 Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
        { name: '📌 Hoisted',     value: role.hoist ? 'Yes' : 'No', inline: true },
      )
      .setFooter({ text: executor ? `Created by ${executor}` : 'Creator unknown' })
      .setTimestamp();

    send(role.guild, embed);
  });

  client.on('roleDelete', async (role) => {
    const { executor } = await auditInfo(role.guild, AuditLogEvent.RoleDelete, role.id);

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: 'Role Deleted' })
      .addFields(
        { name: '🎭 Name',  value: role.name, inline: true },
        { name: '🎨 Color', value: role.hexColor, inline: true },
        { name: '🆔 ID',   value: role.id, inline: true },
      )
      .setFooter({ text: executor ? `Deleted by ${executor}` : 'Deleter unknown' })
      .setTimestamp();

    send(role.guild, embed);
  });

  client.on('roleUpdate', async (oldRole, newRole) => {
    const changes = [];
    if (oldRole.name         !== newRole.name)         changes.push({ name: '✏️ Name',        value: `${oldRole.name} → ${newRole.name}` });
    if (oldRole.hexColor     !== newRole.hexColor)     changes.push({ name: '🎨 Color',       value: `${oldRole.hexColor} → ${newRole.hexColor}`, inline: true });
    if (oldRole.hoist        !== newRole.hoist)        changes.push({ name: '📌 Hoisted',     value: `${oldRole.hoist} → ${newRole.hoist}`, inline: true });
    if (oldRole.mentionable  !== newRole.mentionable)  changes.push({ name: '📣 Mentionable', value: `${oldRole.mentionable} → ${newRole.mentionable}`, inline: true });

    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      const { added, removed } = permDiff(oldRole.permissions.bitfield, newRole.permissions.bitfield);
      if (added   !== 'none') changes.push({ name: '➕ Permissions Added',   value: added });
      if (removed !== 'none') changes.push({ name: '➖ Permissions Removed', value: removed });
    }

    if (!changes.length) return;

    const { executor } = await auditInfo(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);

    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setAuthor({ name: 'Role Updated' })
      .addFields(
        { name: '🎭 Role', value: `${newRole}`, inline: true },
        { name: '🆔 ID',  value: newRole.id, inline: true },
        ...changes,
      )
      .setFooter({ text: executor ? `Updated by ${executor}` : 'Updater unknown' })
      .setTimestamp();

    send(newRole.guild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  VOICE
  // ══════════════════════════════════════════════════════

  client.on('voiceStateUpdate', (oldState, newState) => {
    const guild  = newState.guild;
    const member = newState.member;
    if (!member || member.user.bot) return;

    const oldCh = oldState.channel;
    const newCh = newState.channel;

    let description, color;

    if (!oldCh && newCh) {
      description = `**${member.user.tag}** joined **${newCh.name}**`;
      color = '#57F287';
    } else if (oldCh && !newCh) {
      description = `**${member.user.tag}** left **${oldCh.name}**`;
      color = '#ED4245';
    } else if (oldCh && newCh && oldCh.id !== newCh.id) {
      description = `**${member.user.tag}** moved from **${oldCh.name}** → **${newCh.name}**`;
      color = '#FEE75C';
    } else {
      // Mute/deafen/stream state changes
      const details = [];
      if (oldState.selfMute    !== newState.selfMute)    details.push(newState.selfMute    ? 'Self-muted'      : 'Self-unmuted');
      if (oldState.selfDeaf    !== newState.selfDeaf)    details.push(newState.selfDeaf    ? 'Self-deafened'   : 'Self-undeafened');
      if (oldState.serverMute  !== newState.serverMute)  details.push(newState.serverMute  ? 'Server-muted'    : 'Server-unmuted');
      if (oldState.serverDeaf  !== newState.serverDeaf)  details.push(newState.serverDeaf  ? 'Server-deafened' : 'Server-undeafened');
      if (oldState.streaming   !== newState.streaming)   details.push(newState.streaming   ? 'Started streaming' : 'Stopped streaming');
      if (!details.length) return;
      description = `**${member.user.tag}** in **${newCh?.name ?? oldCh?.name}**: ${details.join(', ')}`;
      color = '#5865F2';
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: '🔊 Voice State', iconURL: member.user.displayAvatarURL() })
      .setDescription(description)
      .setFooter({ text: `User ID: ${member.id}` })
      .setTimestamp();

    send(guild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  BANS
  // ══════════════════════════════════════════════════════

  client.on('guildBanAdd', async (ban) => {
    const { executor, reason } = await auditInfo(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: `${ban.user.tag} was banned`, iconURL: ban.user.displayAvatarURL() })
      .setThumbnail(ban.user.displayAvatarURL())
      .addFields(
        { name: '👤 User',   value: `${ban.user}`, inline: true },
        { name: '🆔 ID',    value: ban.user.id, inline: true },
        { name: '🔨 Banned by', value: executor ?? 'Unknown', inline: true },
        { name: '📝 Reason', value: reason ?? ban.reason ?? 'No reason provided' },
      )
      .setFooter({ text: `User ID: ${ban.user.id}` })
      .setTimestamp();

    send(ban.guild, embed);
  });

  client.on('guildBanRemove', async (ban) => {
    const { executor } = await auditInfo(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setAuthor({ name: `${ban.user.tag} was unbanned`, iconURL: ban.user.displayAvatarURL() })
      .setThumbnail(ban.user.displayAvatarURL())
      .addFields(
        { name: '👤 User',      value: `${ban.user}`, inline: true },
        { name: '🆔 ID',       value: ban.user.id, inline: true },
        { name: '🔓 Unbanned by', value: executor ?? 'Unknown', inline: true },
      )
      .setFooter({ text: `User ID: ${ban.user.id}` })
      .setTimestamp();

    send(ban.guild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  INVITES
  // ══════════════════════════════════════════════════════

  client.on('inviteCreate', (invite) => {
    if (!invite.guild) return;

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setAuthor({ name: 'Invite Created' })
      .addFields(
        { name: '🔗 Code',      value: `discord.gg/${invite.code}`, inline: true },
        { name: '📌 Channel',   value: invite.channel ? `<#${invite.channel.id}>` : 'Unknown', inline: true },
        { name: '👤 Created by',value: invite.inviter?.tag ?? 'Unknown', inline: true },
        { name: '🔢 Max Uses',  value: invite.maxUses ? String(invite.maxUses) : 'Unlimited', inline: true },
        { name: '⏳ Expires',   value: invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>` : 'Never', inline: true },
      )
      .setTimestamp();

    send(invite.guild, embed);
  });

  client.on('inviteDelete', (invite) => {
    if (!invite.guild) return;

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: 'Invite Deleted' })
      .addFields(
        { name: '🔗 Code',    value: `discord.gg/${invite.code}`, inline: true },
        { name: '📌 Channel', value: invite.channel ? `<#${invite.channel.id}>` : 'Unknown', inline: true },
      )
      .setTimestamp();

    send(invite.guild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  BULK DELETE
  // ══════════════════════════════════════════════════════

  client.on('messageDeleteBulk', async (messages, channel) => {
    if (!channel.guild) return;
    const { executor } = await auditInfo(channel.guild, AuditLogEvent.MessageBulkDelete, channel.id);

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: 'Bulk Message Delete' })
      .addFields(
        { name: '📌 Channel',    value: `${channel}`, inline: true },
        { name: '🗑️ Count',     value: `${messages.size} messages`, inline: true },
        { name: '🔨 Purged by', value: executor ?? 'Unknown', inline: true },
      )
      .setTimestamp();

    send(channel.guild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  THREADS
  // ══════════════════════════════════════════════════════

  client.on('threadCreate', async (thread, newlyCreated) => {
    if (!newlyCreated || !thread.guild) return;

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setAuthor({ name: 'Thread Created' })
      .addFields(
        { name: '💬 Thread',  value: `${thread}`, inline: true },
        { name: '🏷️ Type',   value: chType(thread), inline: true },
        { name: '🆔 ID',     value: thread.id, inline: true },
      )
      .setTimestamp();

    if (thread.parent) embed.addFields({ name: '📌 Parent', value: `${thread.parent}`, inline: true });
    send(thread.guild, embed);
  });

  client.on('threadDelete', async (thread) => {
    if (!thread.guild) return;

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: 'Thread Deleted' })
      .addFields(
        { name: '💬 Name',  value: thread.name, inline: true },
        { name: '🏷️ Type', value: chType(thread), inline: true },
        { name: '🆔 ID',   value: thread.id, inline: true },
      )
      .setTimestamp();

    if (thread.parent) embed.addFields({ name: '📌 Parent', value: `${thread.parent}`, inline: true });
    send(thread.guild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  EMOJIS
  // ══════════════════════════════════════════════════════

  client.on('emojiCreate', async (emoji) => {
    const { executor } = await auditInfo(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setAuthor({ name: 'Emoji Created' })
      .setThumbnail(emoji.url)
      .addFields(
        { name: '😀 Name',      value: `:${emoji.name}:`, inline: true },
        { name: '🆔 ID',       value: emoji.id, inline: true },
        { name: '✨ Animated', value: emoji.animated ? 'Yes' : 'No', inline: true },
      )
      .setFooter({ text: executor ? `Added by ${executor}` : 'Creator unknown' })
      .setTimestamp();

    send(emoji.guild, embed);
  });

  client.on('emojiDelete', async (emoji) => {
    const { executor } = await auditInfo(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: 'Emoji Deleted' })
      .addFields(
        { name: '😀 Name', value: `:${emoji.name}:`, inline: true },
        { name: '🆔 ID',  value: emoji.id, inline: true },
      )
      .setFooter({ text: executor ? `Removed by ${executor}` : 'Remover unknown' })
      .setTimestamp();

    send(emoji.guild, embed);
  });

  client.on('emojiUpdate', async (oldEmoji, newEmoji) => {
    if (oldEmoji.name === newEmoji.name) return;
    const { executor } = await auditInfo(newEmoji.guild, AuditLogEvent.EmojiUpdate, newEmoji.id);

    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setAuthor({ name: 'Emoji Updated' })
      .setThumbnail(newEmoji.url)
      .addFields(
        { name: '✏️ Name', value: `:${oldEmoji.name}: → :${newEmoji.name}:`, inline: true },
        { name: '🆔 ID',  value: newEmoji.id, inline: true },
      )
      .setFooter({ text: executor ? `Updated by ${executor}` : 'Updater unknown' })
      .setTimestamp();

    send(newEmoji.guild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  STICKERS
  // ══════════════════════════════════════════════════════

  client.on('stickerCreate', async (sticker) => {
    if (!sticker.guild) return;
    const { executor } = await auditInfo(sticker.guild, AuditLogEvent.StickerCreate, sticker.id);

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setAuthor({ name: 'Sticker Created' })
      .addFields(
        { name: '🏷️ Name', value: sticker.name, inline: true },
        { name: '🆔 ID',  value: sticker.id, inline: true },
      )
      .setFooter({ text: executor ? `Added by ${executor}` : 'Creator unknown' })
      .setTimestamp();

    if (sticker.url) embed.setThumbnail(sticker.url);
    send(sticker.guild, embed);
  });

  client.on('stickerDelete', async (sticker) => {
    if (!sticker.guild) return;
    const { executor } = await auditInfo(sticker.guild, AuditLogEvent.StickerDelete, sticker.id);

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: 'Sticker Deleted' })
      .addFields(
        { name: '🏷️ Name', value: sticker.name, inline: true },
        { name: '🆔 ID',  value: sticker.id, inline: true },
      )
      .setFooter({ text: executor ? `Removed by ${executor}` : 'Remover unknown' })
      .setTimestamp();

    send(sticker.guild, embed);
  });

  client.on('stickerUpdate', async (oldSticker, newSticker) => {
    if (!newSticker.guild) return;
    const changes = [];
    if (oldSticker.name        !== newSticker.name)        changes.push({ name: '✏️ Name',        value: `${oldSticker.name} → ${newSticker.name}` });
    if (oldSticker.description !== newSticker.description) changes.push({ name: '📝 Description', value: `${oldSticker.description || 'none'} → ${newSticker.description || 'none'}` });
    if (!changes.length) return;

    const { executor } = await auditInfo(newSticker.guild, AuditLogEvent.StickerUpdate, newSticker.id);

    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setAuthor({ name: 'Sticker Updated' })
      .addFields(...changes, { name: '🆔 ID', value: newSticker.id, inline: true })
      .setFooter({ text: executor ? `Updated by ${executor}` : 'Updater unknown' })
      .setTimestamp();

    send(newSticker.guild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  SERVER SETTINGS
  // ══════════════════════════════════════════════════════

  client.on('guildUpdate', async (oldGuild, newGuild) => {
    const changes = [];
    if (oldGuild.name             !== newGuild.name)             changes.push({ name: '✏️ Name',               value: `${oldGuild.name} → ${newGuild.name}` });
    if (oldGuild.description      !== newGuild.description)      changes.push({ name: '📝 Description',        value: `${oldGuild.description || 'none'} → ${newGuild.description || 'none'}` });
    if (oldGuild.verificationLevel!== newGuild.verificationLevel)changes.push({ name: '🔒 Verification Level', value: `${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`, inline: true });
    if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter)
      changes.push({ name: '🛡️ Content Filter', value: `${oldGuild.explicitContentFilter} → ${newGuild.explicitContentFilter}`, inline: true });
    if (oldGuild.afkChannelId     !== newGuild.afkChannelId)     changes.push({ name: '💤 AFK Channel', value: `<#${newGuild.afkChannelId ?? 'none'}>`, inline: true });
    if (oldGuild.afkTimeout       !== newGuild.afkTimeout)       changes.push({ name: '⏲️ AFK Timeout', value: `${oldGuild.afkTimeout}s → ${newGuild.afkTimeout}s`, inline: true });
    if (oldGuild.icon             !== newGuild.icon)             changes.push({ name: '🖼️ Icon',        value: 'Server icon changed' });
    if (oldGuild.banner           !== newGuild.banner)           changes.push({ name: '🎨 Banner',      value: 'Server banner changed' });
    if (oldGuild.vanityURLCode    !== newGuild.vanityURLCode)    changes.push({ name: '🔗 Vanity URL',  value: `${oldGuild.vanityURLCode || 'none'} → ${newGuild.vanityURLCode || 'none'}` });
    if ((oldGuild.systemChannelId ?? '') !== (newGuild.systemChannelId ?? ''))
      changes.push({ name: '📣 System Channel', value: newGuild.systemChannelId ? `<#${newGuild.systemChannelId}>` : 'none', inline: true });

    if (!changes.length) return;

    const { executor } = await auditInfo(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);

    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setAuthor({ name: 'Server Updated', iconURL: newGuild.iconURL() ?? undefined })
      .addFields(...changes)
      .setFooter({ text: executor ? `Updated by ${executor}` : 'Updater unknown' })
      .setTimestamp();

    send(newGuild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  WEBHOOKS
  // ══════════════════════════════════════════════════════

  client.on('webhooksUpdate', async (channel) => {
    if (!channel.guild) return;

    // Audit log to determine create/update/delete
    await new Promise(r => setTimeout(r, 1500));
    let action = 'updated', executor = null;
    try {
      const create = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 1 });
      const update = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookUpdate, limit: 1 });
      const del    = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookDelete, limit: 1 });
      const recent = [create.entries.first(), update.entries.first(), del.entries.first()]
        .filter(Boolean)
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];
      if (recent) {
        const actions = {
          [AuditLogEvent.WebhookCreate]: 'created',
          [AuditLogEvent.WebhookUpdate]: 'updated',
          [AuditLogEvent.WebhookDelete]: 'deleted',
        };
        action   = actions[recent.action] ?? 'updated';
        executor = recent.executor?.tag ?? null;
      }
    } catch {}

    const embed = new EmbedBuilder()
      .setColor(action === 'created' ? '#57F287' : action === 'deleted' ? '#ED4245' : '#FEE75C')
      .setAuthor({ name: `Webhook ${action.charAt(0).toUpperCase() + action.slice(1)}` })
      .addFields({ name: '📌 Channel', value: `${channel}`, inline: true })
      .setFooter({ text: executor ? `By ${executor}` : 'Actor unknown' })
      .setTimestamp();

    send(channel.guild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  STAGE INSTANCES
  // ══════════════════════════════════════════════════════

  client.on('stageInstanceCreate', (stageInstance) => {
    if (!stageInstance.guild) return;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({ name: 'Stage Started' })
      .addFields(
        { name: '🎙️ Topic',   value: stageInstance.topic, inline: true },
        { name: '📌 Channel', value: `<#${stageInstance.channelId}>`, inline: true },
      )
      .setTimestamp();

    send(stageInstance.guild, embed);
  });

  client.on('stageInstanceDelete', (stageInstance) => {
    if (!stageInstance.guild) return;

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: 'Stage Ended' })
      .addFields(
        { name: '🎙️ Topic',   value: stageInstance.topic, inline: true },
        { name: '📌 Channel', value: `<#${stageInstance.channelId}>`, inline: true },
      )
      .setTimestamp();

    send(stageInstance.guild, embed);
  });

  // ══════════════════════════════════════════════════════
  //  SCHEDULED EVENTS
  // ══════════════════════════════════════════════════════

  client.on('guildScheduledEventCreate', (event) => {
    if (!event.guild) return;

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setAuthor({ name: 'Scheduled Event Created' })
      .addFields(
        { name: '📅 Name',    value: event.name, inline: true },
        { name: '🆔 ID',     value: event.id, inline: true },
        { name: '⏰ Starts', value: event.scheduledStartAt ? `<t:${Math.floor(event.scheduledStartAt.getTime() / 1000)}:F>` : 'Unknown', inline: true },
      )
      .setTimestamp();

    if (event.description) embed.addFields({ name: '📝 Description', value: event.description.slice(0, 512) });
    send(event.guild, embed);
  });

  client.on('guildScheduledEventDelete', (event) => {
    if (!event.guild) return;

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: 'Scheduled Event Deleted' })
      .addFields(
        { name: '📅 Name', value: event.name, inline: true },
        { name: '🆔 ID',  value: event.id, inline: true },
      )
      .setTimestamp();

    send(event.guild, embed);
  });

  client.on('guildScheduledEventUpdate', (oldEvent, newEvent) => {
    if (!newEvent?.guild) return;
    const changes = [];
    if (oldEvent?.name   !== newEvent.name)   changes.push({ name: '✏️ Name',   value: `${oldEvent?.name ?? '?'} → ${newEvent.name}` });
    if (oldEvent?.status !== newEvent.status) changes.push({ name: '📊 Status', value: `${oldEvent?.status ?? '?'} → ${newEvent.status}`, inline: true });
    if (!changes.length) return;

    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setAuthor({ name: 'Scheduled Event Updated' })
      .addFields(...changes, { name: '🆔 ID', value: newEvent.id, inline: true })
      .setTimestamp();

    send(newEvent.guild, embed);
  });

};
