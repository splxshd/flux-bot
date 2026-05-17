'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  red:    '#ED4245',
  green:  '#57F287',
  yellow: '#FEE75C',
  blue:   '#5865F2',
  orange: '#F0A500',
  purple: '#9B59B6',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

function fmtRel(ts) { return `<t:${Math.floor(ts)}:R>`; }

function parseDuration(str) {
  if (!str) return null;
  const m = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return parseInt(m[1]) * mult[m[2].toLowerCase()];
}

function durationLabel(ms) {
  if (!ms) return '10m';
  if (ms < 60_000)     return `${ms / 1000}s`;
  if (ms < 3_600_000)  return `${ms / 60_000}m`;
  if (ms < 86_400_000) return `${ms / 3_600_000}h`;
  return `${ms / 86_400_000}d`;
}

/** username\nID  — matches the exact two-line style in reference screenshots */
function uv(user) { return `${user.username}\n${user.id}`; }

/** Try to get a readable username for a user ID */
function resolveTag(client, userId) {
  return client.users.cache.get(userId)?.username ?? userId;
}

/** Add an entry to mod_history, returns the case ID */
function logCase(guildId, userId, modId, action, reason = 'No reason provided') {
  try {
    const r = db.run(
      'INSERT INTO mod_history (guild_id, user_id, mod_id, action, reason) VALUES (?,?,?,?,?)',
      [guildId, userId, modId, action, reason]
    );
    return r?.lastInsertRowid ?? '?';
  } catch { return '?'; }
}

/** Returns the last inserted rowid from a db.run result */
function lastId(result) {
  return result?.lastInsertRowid ?? result?.changes ?? '?';
}

// ── Error / usage embeds ──────────────────────────────────────────────────────
function err(msg) {
  return new EmbedBuilder().setColor(C.red).setDescription(`❌ ${msg}`);
}

function usage(cmd) {
  return new EmbedBuilder().setColor(C.yellow).setDescription(`⚠️ **Usage**\n\`${cmd}\``);
}

// ── ,warn ─────────────────────────────────────────────────────────────────────
const warn = {
  name: 'warn',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [err('You need **Manage Messages** permission.')] });

    const member = message.mentions.members.first()
      || (args[0] && await message.guild.members.fetch(args[0]).catch(() => null));
    if (!member) return message.reply({ embeds: [usage(`,warn <@user | id> <reason>`)] });

    const reason   = args.slice(message.mentions.members.size ? 1 : 1).join(' ') || 'No reason provided';
    const result   = db.addWarning(message.guild.id, member.id, message.author.id, reason);
    const caseId   = lastId(result);
    const allWarns = db.getWarnings(message.guild.id, member.id) ?? [];
    logCase(message.guild.id, member.id, message.author.id, 'warn', reason);

    member.user.send({ embeds: [
      new EmbedBuilder().setColor(C.yellow)
        .setTitle(`⚠️ Warning from ${message.guild.name}`)
        .addFields({ name: 'Reason', value: reason })
        .setTimestamp(),
    ] }).catch(() => {});

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(C.yellow)
        .setTitle('⚠️ Member Warned')
        .addFields(
          { name: 'Member',     value: uv(member.user),     inline: true },
          { name: 'Moderator',  value: uv(message.author),  inline: true },
          { name: 'Reason',     value: reason },
        )
        .setFooter({ text: `Case #${caseId}  •  Warn #${allWarns.length} for this user` })
        .setTimestamp(),
    ] });
  },
};

// ── ,warns ────────────────────────────────────────────────────────────────────
const warnings = {
  name: 'warnings',
  aliases: ['warns'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [err('You need **Manage Messages** permission.')] });

    const target = message.mentions.users.first()
      || (args[0] && await message.client.users.fetch(args[0]).catch(() => null));
    if (!target) return message.reply({ embeds: [usage(`,warns <@user | id>`)] });

    const list  = db.getWarnings(message.guild.id, target.id) ?? [];
    const total = list.length;

    const description = !total
      ? 'No warnings.'
      : list.slice(0, 10).map(w => {
          const modName = resolveTag(message.client, w.mod_id);
          return `⚠️ #${w.id}  ${fmtDate(w.created_at)} — ${w.reason}\nMod: ${modName}`;
        }).join('\n\n') + (total > 10 ? `\n\n*…and ${total - 10} more*` : '');

    const color = total === 0 ? C.green : total < 3 ? C.yellow : C.red;

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: `Warnings — ${target.username}`, iconURL: target.displayAvatarURL() })
        .setThumbnail(target.displayAvatarURL())
        .setDescription(description)
        .setFooter({ text: `${total} warning${total !== 1 ? 's' : ''} total  •  ID: ${target.id}` })
        .setTimestamp(),
    ] });
  },
};

// ── ,delwarn ──────────────────────────────────────────────────────────────────
const delwarn = {
  name: 'delwarn',
  aliases: ['removewarn', 'warnremove'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [err('You need **Manage Messages** permission.')] });

    const id = parseInt(args[0]);
    if (!id) return message.reply({ embeds: [usage(`,delwarn <case_id>`)] });

    const row = db.all('SELECT * FROM warnings WHERE id=? AND guild_id=?', [id, message.guild.id])[0];
    if (!row) return message.reply({ embeds: [err(`Case **#${id}** not found.`)] });

    db.run('DELETE FROM warnings WHERE id=? AND guild_id=?', [id, message.guild.id]);

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.green)
        .setTitle('Warning Removed')
        .setDescription(`Deleted warning **#${id}** for <@${row.user_id}>\nReason: \`${row.reason}\``)
        .setTimestamp(),
    ] });
  },
};

// ── ,clearwarns ───────────────────────────────────────────────────────────────
const clearwarns = {
  name: 'clearwarns',
  aliases: ['clearwarnings', 'warnsclear'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [err('You need **Manage Messages** permission.')] });

    const target = message.mentions.users.first()
      || (args[0] && await message.client.users.fetch(args[0]).catch(() => null));
    if (!target) return message.reply({ embeds: [usage(`,clearwarns <@user | id>`)] });

    const count = (db.getWarnings(message.guild.id, target.id) ?? []).length;
    db.clearWarnings(message.guild.id, target.id);

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.green)
        .setTitle('Warnings Cleared')
        .addFields(
          { name: 'Member',    value: uv(target),              inline: true },
          { name: 'Moderator', value: uv(message.author),      inline: true },
          { name: 'Count',     value: `${count} warning${count !== 1 ? 's' : ''} removed` },
        )
        .setTimestamp(),
    ] });
  },
};

// ── ,kick ─────────────────────────────────────────────────────────────────────
const kick = {
  name: 'kick',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
      return message.reply({ embeds: [err('You need **Kick Members** permission.')] });

    const member = message.mentions.members.first()
      || (args[0] && await message.guild.members.fetch(args[0]).catch(() => null));
    if (!member) return message.reply({ embeds: [usage(`,kick <@user | id> [reason]`)] });
    if (!member.kickable) return message.reply({ embeds: [err('I cannot kick that member.')] });

    const reason = args.slice(message.mentions.members.size ? 1 : 1).join(' ') || 'No reason provided';
    const caseId = logCase(message.guild.id, member.id, message.author.id, 'kick', reason);

    member.user.send({ embeds: [
      new EmbedBuilder().setColor(C.orange)
        .setTitle(`You were kicked from ${message.guild.name}`)
        .addFields({ name: 'Reason', value: reason })
        .setTimestamp(),
    ] }).catch(() => {});

    await member.kick(reason).catch(() => {});

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(C.orange)
        .setTitle('🦶 Member Kicked')
        .addFields(
          { name: 'Member',     value: uv(member.user),     inline: true },
          { name: 'Moderator',  value: uv(message.author),  inline: true },
          { name: 'Reason',     value: reason },
        )
        .setFooter({ text: `Case #${caseId}` })
        .setTimestamp(),
    ] });
  },
};

// ── ,ban ──────────────────────────────────────────────────────────────────────
const ban = {
  name: 'ban',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply({ embeds: [err('You need **Ban Members** permission.')] });

    const target = message.mentions.users.first()
      || (args[0] && await message.client.users.fetch(args[0]).catch(() => null));
    if (!target) return message.reply({ embeds: [usage(`,ban <@user | id> [reason]`)] });

    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (member && !member.bannable) return message.reply({ embeds: [err('I cannot ban that member.')] });

    const reason = args.slice(message.mentions.users.size ? 1 : 1).join(' ') || 'No reason provided';
    const caseId = logCase(message.guild.id, target.id, message.author.id, 'ban', reason);

    target.send({ embeds: [
      new EmbedBuilder().setColor(C.red)
        .setTitle(`You were banned from ${message.guild.name}`)
        .addFields({ name: 'Reason', value: reason })
        .setTimestamp(),
    ] }).catch(() => {});

    await message.guild.bans.create(target.id, { reason, deleteMessageSeconds: 86400 }).catch(() => {});

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(C.red)
        .setTitle('🔨 Member Banned')
        .addFields(
          { name: 'Member',     value: uv(target),           inline: true },
          { name: 'Moderator',  value: uv(message.author),   inline: true },
          { name: 'Reason',     value: reason },
        )
        .setFooter({ text: `Case #${caseId}` })
        .setTimestamp(),
    ] });
  },
};

// ── ,unban ────────────────────────────────────────────────────────────────────
const unban = {
  name: 'unban',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply({ embeds: [err('You need **Ban Members** permission.')] });

    const userId = args[0]?.replace(/\D/g, '');
    if (!userId) return message.reply({ embeds: [usage(`,unban <user_id> [reason]`)] });

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const ban_   = await message.guild.bans.fetch(userId).catch(() => null);
    if (!ban_) return message.reply({ embeds: [err(`<@${userId}> is not banned.`)] });

    await message.guild.bans.remove(userId, reason).catch(() => {});
    const caseId = logCase(message.guild.id, userId, message.author.id, 'unban', reason);

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(C.green)
        .setTitle('🔓 Member Unbanned')
        .addFields(
          { name: 'Member',     value: uv(ban_.user),         inline: true },
          { name: 'Moderator',  value: uv(message.author),    inline: true },
          { name: 'Reason',     value: reason },
        )
        .setFooter({ text: `Case #${caseId}` })
        .setTimestamp(),
    ] });
  },
};

// ── ,mute ─────────────────────────────────────────────────────────────────────
const mute = {
  name: 'mute',
  aliases: ['timeout', 'to'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply({ embeds: [err('You need **Moderate Members** permission.')] });

    const member = message.mentions.members.first()
      || (args[0] && await message.guild.members.fetch(args[0]).catch(() => null));
    if (!member) return message.reply({ embeds: [usage(`,mute <@user | id> [10m|2h|7d] [reason]`)] });

    const argStart = message.mentions.members.size ? 1 : 1;
    const durStr   = args[argStart];
    const durMs    = parseDuration(durStr) ?? 10 * 60_000;
    const reason   = args.slice(durStr && parseDuration(durStr) ? argStart + 1 : argStart).join(' ') || 'No reason provided';
    const label    = durStr && parseDuration(durStr) ? durStr : durationLabel(durMs);
    const expires  = Math.floor((Date.now() + durMs) / 1000);

    await member.timeout(durMs, reason).catch(() => {});
    const caseId = logCase(message.guild.id, member.id, message.author.id, 'mute', reason);

    member.user.send({ embeds: [
      new EmbedBuilder().setColor(C.yellow)
        .setTitle(`You were muted in ${message.guild.name}`)
        .addFields(
          { name: 'Duration', value: label, inline: true },
          { name: 'Expires',  value: fmtRel(expires), inline: true },
          { name: 'Reason',   value: reason },
        )
        .setTimestamp(),
    ] }).catch(() => {});

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(C.yellow)
        .setTitle('🔇 Member Muted')
        .addFields(
          { name: 'Member',     value: uv(member.user),     inline: true },
          { name: 'Moderator',  value: uv(message.author),  inline: true },
          { name: 'Duration',   value: label,                inline: true },
          { name: 'Expires',    value: fmtRel(expires),      inline: true },
          { name: 'Reason',     value: reason },
        )
        .setFooter({ text: `Case #${caseId}` })
        .setTimestamp(),
    ] });
  },
};

// ── ,unmute ───────────────────────────────────────────────────────────────────
const unmute = {
  name: 'unmute',
  aliases: ['untimeout'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply({ embeds: [err('You need **Moderate Members** permission.')] });

    const member = message.mentions.members.first()
      || (args[0] && await message.guild.members.fetch(args[0]).catch(() => null));
    if (!member) return message.reply({ embeds: [usage(`,unmute <@user | id>`)] });

    await member.timeout(null).catch(() => {});
    const caseId = logCase(message.guild.id, member.id, message.author.id, 'unmute');

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(C.green)
        .setTitle('🔊 Member Unmuted')
        .addFields(
          { name: 'Member',     value: uv(member.user),     inline: true },
          { name: 'Moderator',  value: uv(message.author),  inline: true },
        )
        .setFooter({ text: `Case #${caseId}` })
        .setTimestamp(),
    ] });
  },
};

// ── ,history ──────────────────────────────────────────────────────────────────
const history = {
  name: 'history',
  aliases: ['hist', 'modhistory'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [err('You need **Manage Messages** permission.')] });

    const target = message.mentions.users.first()
      || (args[0] && await message.client.users.fetch(args[0]).catch(() => null));
    if (!target) return message.reply({ embeds: [usage(`,history <@user | id>`)] });

    const cases = db.all(
      'SELECT * FROM mod_history WHERE guild_id=? AND user_id=? ORDER BY created_at DESC LIMIT 10',
      [message.guild.id, target.id]
    );

    const ACTION_ICONS = {
      ban: '🔨', unban: '🔓', kick: '🦶', mute: '🔇',
      unmute: '🔊', warn: '⚠️', timeout: '⏱️', note: '📝',
    };

    const desc = !cases.length
      ? '*No moderation history for this user.*'
      : cases.map(c => {
          const icon = ACTION_ICONS[c.action] ?? '📋';
          const mod  = resolveTag(message.client, c.mod_id);
          return `${icon}  \`#${c.id}\`  \`${fmtDate(c.created_at)}\`  **${c.action}** — ${c.reason || 'No reason'}\nMod: ${mod}`;
        }).join('\n\n');

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(C.blue)
        .setAuthor({ name: `History — ${target.username}`, iconURL: target.displayAvatarURL() })
        .setDescription(desc)
        .setFooter({ text: `${cases.length} recent action${cases.length !== 1 ? 's' : ''}  •  ID: ${target.id}` })
        .setTimestamp(),
    ] });
  },
};

// ── ,nuke ─────────────────────────────────────────────────────────────────────
const nuke = {
  name: 'nuke',
  aliases: ['clonechannel'],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply({ embeds: [err('You need **Manage Channels** permission.')] });

    const channel = message.channel;
    const msg = await message.channel.send({ embeds: [
      new EmbedBuilder().setColor(C.red)
        .setTitle('💣 Nuke Channel')
        .setDescription(`Type \`confirm\` within 10s to nuke **#${channel.name}**.`),
    ] });

    const collected = await message.channel.awaitMessages({
      filter: m => m.author.id === message.author.id && m.content.toLowerCase() === 'confirm',
      max: 1, time: 10_000,
    }).catch(() => null);

    if (!collected?.size)
      return msg.edit({ embeds: [new EmbedBuilder().setColor(C.yellow).setTitle('Nuke Cancelled').setDescription('No confirmation received.')] });

    const pos   = channel.rawPosition;
    const newCh = await channel.clone({ reason: `Nuked by ${message.author.tag}` }).catch(() => null);
    if (newCh) {
      await newCh.setPosition(pos).catch(() => {});
      await channel.delete(`Nuked by ${message.author.tag}`).catch(() => {});
      await newCh.send({ embeds: [
        new EmbedBuilder().setColor(C.red)
          .setTitle('💥 Channel Nuked')
          .addFields({ name: 'Moderator', value: uv(message.author) })
          .setTimestamp(),
      ] });
    }
  },
};

// ── ,botclear ─────────────────────────────────────────────────────────────────
const botclear = {
  name: 'botclear',
  aliases: ['bc', 'clearbots'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [err('You need **Manage Messages** permission.')] });

    const amount  = Math.min(parseInt(args[0]) || 20, 100);
    const msgs    = await message.channel.messages.fetch({ limit: amount }).catch(() => null);
    if (!msgs) return;
    const botMsgs = msgs.filter(m => m.author.bot);
    await message.channel.bulkDelete(botMsgs, true).catch(() => {});

    const reply = await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.green)
        .setTitle('Bot Messages Cleared')
        .setDescription(`Deleted **${botMsgs.size}** bot message${botMsgs.size !== 1 ? 's' : ''}.`),
    ] });
    setTimeout(() => reply.delete().catch(() => {}), 3000);
  },
};

// ── ,massban ──────────────────────────────────────────────────────────────────
const massban = {
  name: 'massban',
  aliases: [],
  async execute(message, args) {
    if (message.author.id !== message.guild.ownerId && !message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply({ embeds: [err('You need **Administrator** permission.')] });

    const members = message.mentions.members;
    if (!members.size) return message.reply({ embeds: [usage(`,massban @user1 @user2 ...`)] });

    let count = 0;
    for (const [, m] of members) {
      if (m.bannable) { await m.ban({ reason: `Mass ban by ${message.author.tag}` }).catch(() => {}); count++; }
    }

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.red)
        .setTitle('🔨 Mass Ban')
        .addFields(
          { name: 'Moderator', value: uv(message.author),          inline: true },
          { name: 'Banned',    value: `${count}/${members.size}`,  inline: true },
        )
        .setTimestamp(),
    ] });
  },
};

// ── ,masskick ─────────────────────────────────────────────────────────────────
const masskick = {
  name: 'masskick',
  aliases: [],
  async execute(message, args) {
    if (message.author.id !== message.guild.ownerId && !message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply({ embeds: [err('You need **Administrator** permission.')] });

    const members = message.mentions.members;
    if (!members.size) return message.reply({ embeds: [usage(`,masskick @user1 @user2 ...`)] });

    let count = 0;
    for (const [, m] of members) {
      if (m.kickable) { await m.kick(`Mass kick by ${message.author.tag}`).catch(() => {}); count++; }
    }

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.orange)
        .setTitle('🦶 Mass Kick')
        .addFields(
          { name: 'Moderator', value: uv(message.author),          inline: true },
          { name: 'Kicked',    value: `${count}/${members.size}`,  inline: true },
        )
        .setTimestamp(),
    ] });
  },
};

// ── ,raid ─────────────────────────────────────────────────────────────────────
const raid = {
  name: 'raid',
  aliases: ['raidmode'],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [err('You need **Manage Server** permission.')] });
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.red)
        .setTitle('🛡️ Raid Mode Toggled')
        .setDescription('New joins will be restricted until raid mode is lifted.')
        .setTimestamp(),
    ] });
  },
};

// ── ,stripstaff ───────────────────────────────────────────────────────────────
const stripstaff = {
  name: 'stripstaff',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply({ embeds: [err('You need **Administrator** permission.')] });

    const member = message.mentions.members.first();
    if (!member) return message.reply({ embeds: [usage(`,stripstaff <@user>`)] });

    const dangerous = [
      PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageRoles,
    ];
    const stripped = [];
    for (const [, role] of member.roles.cache) {
      if (role.id === message.guild.id) continue;
      if (dangerous.some(p => role.permissions.has(p))) {
        await member.roles.remove(role).catch(() => {});
        stripped.push(role.name);
      }
    }

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(stripped.length ? C.orange : C.yellow)
        .setTitle('Staff Roles Stripped')
        .addFields(
          { name: 'Member',    value: uv(member.user),     inline: true },
          { name: 'Moderator', value: uv(message.author),  inline: true },
          { name: 'Roles',     value: stripped.length ? stripped.join(', ') : 'None found' },
        )
        .setTimestamp(),
    ] });
  },
};

// ── ,jail ─────────────────────────────────────────────────────────────────────
const jail = {
  name: 'jail',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [err('You need **Manage Roles** permission.')] });

    const member = message.mentions.members.first();
    if (!member) return message.reply({ embeds: [usage(`,jail <@user> [reason]`)] });

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const caseId = logCase(message.guild.id, member.id, message.author.id, 'jail', reason);

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.orange)
        .setTitle('🔒 Member Jailed')
        .addFields(
          { name: 'Member',     value: uv(member.user),     inline: true },
          { name: 'Moderator',  value: uv(message.author),  inline: true },
          { name: 'Reason',     value: reason },
        )
        .setFooter({ text: `Case #${caseId}` })
        .setTimestamp(),
    ] });
  },
};

// ── ,unjail ───────────────────────────────────────────────────────────────────
const unjail = {
  name: 'unjail',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [err('You need **Manage Roles** permission.')] });

    const member = message.mentions.members.first();
    if (!member) return message.reply({ embeds: [usage(`,unjail <@user>`)] });

    const caseId = logCase(message.guild.id, member.id, message.author.id, 'unjail');

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.green)
        .setTitle('🔓 Member Released')
        .addFields(
          { name: 'Member',     value: uv(member.user),     inline: true },
          { name: 'Moderator',  value: uv(message.author),  inline: true },
        )
        .setFooter({ text: `Case #${caseId}` })
        .setTimestamp(),
    ] });
  },
};

// ── ,reason ───────────────────────────────────────────────────────────────────
const reason = {
  name: 'reason',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [err('You need **Manage Messages** permission.')] });

    const caseId    = parseInt(args[0]);
    const newReason = args.slice(1).join(' ');
    if (!caseId || !newReason) return message.reply({ embeds: [usage(`,reason <case_id> <reason>`)] });

    const row = db.all('SELECT * FROM mod_history WHERE id=? AND guild_id=?', [caseId, message.guild.id])[0];
    if (!row) return message.reply({ embeds: [err(`Case **#${caseId}** not found.`)] });

    db.run('UPDATE mod_history SET reason=? WHERE id=?', [newReason, caseId]);

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.green)
        .setTitle('Reason Updated')
        .addFields(
          { name: 'Case',   value: `#${caseId}`,  inline: true },
          { name: 'Reason', value: newReason },
        )
        .setTimestamp(),
    ] });
  },
};

// ── ,modstats ─────────────────────────────────────────────────────────────────
const modstats = {
  name: 'modstats',
  aliases: [],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;

    const bans  = db.all('SELECT COUNT(*) as c FROM mod_history WHERE guild_id=? AND mod_id=? AND action="ban"',  [message.guild.id, target.id])[0]?.c ?? 0;
    const kicks = db.all('SELECT COUNT(*) as c FROM mod_history WHERE guild_id=? AND mod_id=? AND action="kick"', [message.guild.id, target.id])[0]?.c ?? 0;
    const mutes = db.all('SELECT COUNT(*) as c FROM mod_history WHERE guild_id=? AND mod_id=? AND action="mute"', [message.guild.id, target.id])[0]?.c ?? 0;
    const warns = db.all('SELECT COUNT(*) as c FROM mod_history WHERE guild_id=? AND mod_id=? AND action="warn"', [message.guild.id, target.id])[0]?.c ?? 0;

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(C.blue)
        .setAuthor({ name: `Mod Stats — ${target.username}`, iconURL: target.displayAvatarURL() })
        .addFields(
          { name: 'Bans',  value: String(bans),  inline: true },
          { name: 'Kicks', value: String(kicks), inline: true },
          { name: 'Mutes', value: String(mutes), inline: true },
          { name: 'Warns', value: String(warns), inline: true },
          { name: 'Total', value: String(bans + kicks + mutes + warns), inline: true },
        )
        .setFooter({ text: `ID: ${target.id}` })
        .setTimestamp(),
    ] });
  },
};

// ── ,permit ───────────────────────────────────────────────────────────────────
const permit = {
  name: 'permit',
  aliases: ['perm'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [err('You need **Manage Server** permission.')] });
    const target = message.mentions.users.first();
    if (!target) return message.reply({ embeds: [usage(`,permit <@user>`)] });
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.green)
        .setTitle('Permission Granted')
        .addFields({ name: 'Member', value: uv(target) })
        .setTimestamp(),
    ] });
  },
};

// ── ,sudo ─────────────────────────────────────────────────────────────────────
const sudo = {
  name: 'sudo',
  aliases: ['runas'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply({ embeds: [err('You need **Administrator** permission.')] });

    if (args[0]?.toLowerCase() === 'dm') {
      const target = message.mentions.users.first();
      const text   = args.slice(2).join(' ');
      if (!target || !text) return message.reply({ embeds: [usage(`,sudo dm <@user> <message>`)] });
      await target.send(text).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(C.green).setTitle('DM Sent').addFields({ name: 'Recipient', value: uv(target) }).setTimestamp()] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(C.blue).setDescription('**Subcommands:** `dm <@user> <msg>`')] });
  },
};

// ── ,talk ─────────────────────────────────────────────────────────────────────
const talk = {
  name: 'talk',
  aliases: ['say_in'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [err('You need **Manage Messages** permission.')] });

    const channel = message.mentions.channels.first();
    const text    = args.slice(message.mentions.channels.size ? 1 : 0).join(' ');
    if (!channel || !text) return message.reply({ embeds: [usage(`,talk <#channel> <message>`)] });

    await channel.send(text).catch(() => {});
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.green)
        .setTitle('Message Sent')
        .addFields({ name: 'Channel', value: `#${channel.name}\n${channel.id}` })
        .setTimestamp(),
    ] });
  },
};

// ── ,autorole ─────────────────────────────────────────────────────────────────
const autorole = {
  name: 'autorole',
  aliases: ['joinrole'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [err('You need **Manage Roles** permission.')] });

    const sub     = args[0]?.toLowerCase();
    const guildId = message.guild.id;

    if (sub === 'add') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply({ embeds: [usage(`,autorole add <@role>`)] });
      db.addAutorole(guildId, role.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(C.green).setTitle('Auto-Role Added').addFields({ name: 'Role', value: `${role.name}\n${role.id}` }).setTimestamp()] });
    }
    if (sub === 'remove') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply({ embeds: [usage(`,autorole remove <@role>`)] });
      db.removeAutorole(guildId, role.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(C.green).setTitle('Auto-Role Removed').addFields({ name: 'Role', value: `${role.name}\n${role.id}` }).setTimestamp()] });
    }
    if (sub === 'clear') {
      db.clearAutoroles(guildId);
      return message.reply({ embeds: [new EmbedBuilder().setColor(C.green).setTitle('Auto-Roles Cleared').setDescription('All auto-roles have been removed.').setTimestamp()] });
    }
    if (sub === 'list') {
      const roles = db.getAutoroles(guildId);
      return message.reply({ embeds: [
        new EmbedBuilder().setColor(C.blue).setTitle('Auto-Roles')
          .setDescription(roles.length ? roles.map(r => `<@&${r.role_id}>`).join('\n') : '*No auto-roles configured.*'),
      ] });
    }

    return message.reply({ embeds: [
      new EmbedBuilder().setColor(C.blue).setTitle('Auto-Role')
        .setDescription('`,autorole add <@role>`\n`,autorole remove <@role>`\n`,autorole list`\n`,autorole clear`'),
    ] });
  },
};

// ── ,setup ────────────────────────────────────────────────────────────────────
const setup = {
  name: 'setup',
  aliases: [],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [err('You need **Manage Server** permission.')] });
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.blue)
        .setTitle('⚙️ Server Setup Wizard')
        .setDescription('Use `/log`, `/welcome`, and `/ticket setup` to configure your server.\nOr use `,log`, `,welcome` for prefix setup.'),
    ] });
  },
};

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = [
  kick, ban, unban, mute, unmute,
  warn, warnings, delwarn, clearwarns,
  history, nuke, botclear, massban, masskick,
  raid, stripstaff, jail, unjail, reason,
  modstats, permit, sudo, talk, autorole, setup,
];
