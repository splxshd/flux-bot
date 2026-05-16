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

function fmtRel(ts) {
  return `<t:${Math.floor(ts)}:R>`;
}

function parseDuration(str) {
  if (!str) return null;
  const m = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return parseInt(m[1]) * mult[m[2].toLowerCase()];
}

function durationLabel(ms) {
  if (!ms) return '10m';
  if (ms < 60_000)       return `${ms / 1000}s`;
  if (ms < 3_600_000)    return `${ms / 60_000}m`;
  if (ms < 86_400_000)   return `${ms / 3_600_000}h`;
  return `${ms / 86_400_000}d`;
}

/** Try to get a readable username for a user ID */
function resolveTag(client, userId) {
  return client.users.cache.get(userId)?.username ?? `<@${userId}>`;
}

/** Add an entry to mod_history */
function logCase(guildId, userId, modId, action, reason = 'No reason provided') {
  try {
    db.run(
      'INSERT INTO mod_history (guild_id, user_id, mod_id, action, reason) VALUES (?,?,?,?,?)',
      [guildId, userId, modId, action, reason]
    );
  } catch {}
}

/** Returns the last inserted rowid from a db.run result */
function lastId(result) {
  return result?.lastInsertRowid ?? result?.changes ?? '?';
}

// ── Error embed ───────────────────────────────────────────────────────────────
function err(msg) {
  return new EmbedBuilder().setColor(C.red).setDescription(`> ❌  ${msg}`);
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
    if (!member) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow)
        .setDescription('> ⚠️  **Usage**\n> `,warn <@user | id> <reason>`')],
    });

    const reason = args.slice(message.mentions.members.size ? 1 : 1).join(' ') || 'No reason provided';
    const result  = db.addWarning(message.guild.id, member.id, message.author.id, reason);
    const caseId  = lastId(result);
    const allWarns = db.getWarnings(message.guild.id, member.id) ?? [];
    logCase(message.guild.id, member.id, message.author.id, 'warn', reason);

    // DM the warned user
    member.user.send({ embeds: [
      new EmbedBuilder()
        .setColor(C.yellow)
        .setAuthor({ name: `⚠️  Warning from ${message.guild.name}`, iconURL: message.guild.iconURL() ?? undefined })
        .setDescription(`You received a warning.\n\n**Reason:** ${reason}`)
        .setTimestamp(),
    ] }).catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(C.yellow)
      .setAuthor({ name: `${member.user.username} warned`, iconURL: member.user.displayAvatarURL() })
      .addFields(
        { name: '👤 User',       value: `${member}`, inline: true },
        { name: '👮 Moderator',  value: `${message.author}`, inline: true },
        { name: '📋 Reason',     value: reason },
      )
      .setFooter({ text: `Case #${caseId}  •  Warn #${allWarns.length} for this user` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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
    if (!target) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,warns <@user | id>`')],
    });

    const list = db.getWarnings(message.guild.id, target.id) ?? [];
    const total = list.length;

    let description;
    if (!total) {
      description = '*No warnings on record.*';
    } else {
      description = list.slice(0, 10).map(w => {
        const modName = resolveTag(message.client, w.mod_id);
        return `⚠️  \`#${w.id}\`  \`${fmtDate(w.created_at)}\` — ${w.reason}\n> Mod: **${modName}**`;
      }).join('\n');
      if (total > 10) description += `\n*…and ${total - 10} more*`;
    }

    const color = total === 0 ? C.green : total < 3 ? C.yellow : C.red;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: `Warnings — ${target.username}`, iconURL: target.displayAvatarURL() })
      .setDescription(description)
      .setFooter({ text: `${total} warning${total !== 1 ? 's' : ''} total  •  ID: ${target.id}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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
    if (!id) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,delwarn <case_id>`')],
    });

    const row = db.get?.('SELECT * FROM warnings WHERE id=? AND guild_id=?', [id, message.guild.id])
               ?? db.all('SELECT * FROM warnings WHERE id=? AND guild_id=?', [id, message.guild.id])[0];

    if (!row) return message.reply({ embeds: [err(`Case **#${id}** not found.`)] });

    db.run('DELETE FROM warnings WHERE id=? AND guild_id=?', [id, message.guild.id]);

    const embed = new EmbedBuilder()
      .setColor(C.green)
      .setDescription(`> ✅  Deleted warning **#${id}** for <@${row.user_id}> (\`${row.reason}\`).`)
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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
    if (!target) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,clearwarns <@user | id>`')],
    });

    const count = (db.getWarnings(message.guild.id, target.id) ?? []).length;
    db.clearWarnings(message.guild.id, target.id);

    const embed = new EmbedBuilder()
      .setColor(C.green)
      .setAuthor({ name: `${target.username} — warnings cleared`, iconURL: target.displayAvatarURL() })
      .setDescription(`> ✅  Cleared **${count}** warning${count !== 1 ? 's' : ''} from ${target}.`)
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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
    if (!member) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,kick <@user | id> [reason]`')],
    });

    if (!member.kickable) return message.reply({ embeds: [err('I cannot kick that member (they may be above me in the role hierarchy).')] });
    const reason = args.slice(message.mentions.members.size ? 1 : 1).join(' ') || 'No reason provided';

    member.user.send({ embeds: [
      new EmbedBuilder().setColor(C.orange)
        .setAuthor({ name: `You were kicked from ${message.guild.name}`, iconURL: message.guild.iconURL() ?? undefined })
        .setDescription(`**Reason:** ${reason}`)
        .setTimestamp(),
    ] }).catch(() => {});

    await member.kick(reason).catch(() => {});
    logCase(message.guild.id, member.id, message.author.id, 'kick', reason);

    const embed = new EmbedBuilder()
      .setColor(C.orange)
      .setAuthor({ name: `${member.user.username} kicked`, iconURL: member.user.displayAvatarURL() })
      .addFields(
        { name: '👤 User',      value: `${member.user}`, inline: true },
        { name: '👮 Moderator', value: `${message.author}`, inline: true },
        { name: '📋 Reason',    value: reason },
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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
    if (!target) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,ban <@user | id> [reason]`')],
    });

    const member = await message.guild.members.fetch(target.id).catch(() => null);
    if (member && !member.bannable) return message.reply({ embeds: [err('I cannot ban that member.')] });

    const reason = args.slice(message.mentions.users.size ? 1 : 1).join(' ') || 'No reason provided';

    target.send({ embeds: [
      new EmbedBuilder().setColor(C.red)
        .setAuthor({ name: `You were banned from ${message.guild.name}`, iconURL: message.guild.iconURL() ?? undefined })
        .setDescription(`**Reason:** ${reason}`)
        .setTimestamp(),
    ] }).catch(() => {});

    await message.guild.bans.create(target.id, { reason, deleteMessageSeconds: 86400 }).catch(() => {});
    logCase(message.guild.id, target.id, message.author.id, 'ban', reason);

    const embed = new EmbedBuilder()
      .setColor(C.red)
      .setAuthor({ name: `${target.username} banned`, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: '👤 User',      value: `${target}`, inline: true },
        { name: '👮 Moderator', value: `${message.author}`, inline: true },
        { name: '📋 Reason',    value: reason },
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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
    if (!userId) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,unban <user_id> [reason]`')],
    });

    const reason = args.slice(1).join(' ') || 'No reason provided';
    const ban_ = await message.guild.bans.fetch(userId).catch(() => null);
    if (!ban_) return message.reply({ embeds: [err(`<@${userId}> is not banned.`)] });

    await message.guild.bans.remove(userId, `${reason} — by ${message.author.tag}`).catch(() => {});
    logCase(message.guild.id, userId, message.author.id, 'unban', reason);

    const embed = new EmbedBuilder()
      .setColor(C.green)
      .setAuthor({ name: `${ban_.user.username} unbanned`, iconURL: ban_.user.displayAvatarURL() })
      .addFields(
        { name: '👤 User',      value: `${ban_.user}`, inline: true },
        { name: '👮 Moderator', value: `${message.author}`, inline: true },
        { name: '📋 Reason',    value: reason },
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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
    if (!member) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,mute <@user | id> [10m|2h|7d] [reason]`')],
    });

    const argStart  = message.mentions.members.size ? 1 : 1;
    const durStr    = args[argStart];
    const durMs     = parseDuration(durStr) ?? 10 * 60_000;
    const reason    = args.slice(durStr && parseDuration(durStr) ? argStart + 1 : argStart).join(' ') || 'No reason provided';
    const label     = durStr && parseDuration(durStr) ? durStr : durationLabel(durMs);
    const expiresAt = Math.floor((Date.now() + durMs) / 1000);

    await member.timeout(durMs, reason).catch(() => {});
    logCase(message.guild.id, member.id, message.author.id, 'mute', reason);

    member.user.send({ embeds: [
      new EmbedBuilder().setColor(C.yellow)
        .setAuthor({ name: `You were muted in ${message.guild.name}`, iconURL: message.guild.iconURL() ?? undefined })
        .addFields(
          { name: '⏱️ Duration', value: label, inline: true },
          { name: '⌛ Expires',  value: fmtRel(expiresAt), inline: true },
          { name: '📋 Reason',   value: reason },
        )
        .setTimestamp(),
    ] }).catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(C.yellow)
      .setAuthor({ name: `${member.user.username} muted`, iconURL: member.user.displayAvatarURL() })
      .addFields(
        { name: '👤 User',       value: `${member}`, inline: true },
        { name: '👮 Moderator',  value: `${message.author}`, inline: true },
        { name: '⏱️ Duration',   value: label, inline: true },
        { name: '⌛ Expires',    value: fmtRel(expiresAt), inline: true },
        { name: '📋 Reason',     value: reason },
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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
    if (!member) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,unmute <@user | id>`')],
    });

    await member.timeout(null).catch(() => {});
    logCase(message.guild.id, member.id, message.author.id, 'unmute');

    const embed = new EmbedBuilder()
      .setColor(C.green)
      .setAuthor({ name: `${member.user.username} unmuted`, iconURL: member.user.displayAvatarURL() })
      .setDescription(`> ✅  ${member} has been unmuted.`)
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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
    if (!target) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,history <@user | id>`')],
    });

    const cases = db.all(
      'SELECT * FROM mod_history WHERE guild_id=? AND user_id=? ORDER BY created_at DESC LIMIT 10',
      [message.guild.id, target.id]
    );

    const ACTION_ICONS = {
      ban: '🔨', unban: '🔓', kick: '🦶', mute: '🔇', unmute: '🔊',
      warn: '⚠️', timeout: '⏱️', note: '📝',
    };

    let desc;
    if (!cases.length) {
      desc = '*No moderation history for this user.*';
    } else {
      desc = cases.map(c => {
        const icon = ACTION_ICONS[c.action] ?? '📋';
        const mod  = resolveTag(message.client, c.mod_id);
        return `${icon}  \`#${c.id}\`  \`${fmtDate(c.created_at)}\`  **${c.action}** — ${c.reason || 'No reason'}\n> Mod: **${mod}**`;
      }).join('\n');
    }

    const embed = new EmbedBuilder()
      .setColor(C.blue)
      .setAuthor({ name: `History — ${target.username}`, iconURL: target.displayAvatarURL() })
      .setDescription(desc)
      .setFooter({ text: `${cases.length} recent actions  •  ID: ${target.id}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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
        .setDescription(`> 💣  Nuking **#${channel.name}**.\n> Reply \`confirm\` within 10s to proceed.`),
    ] });

    const collected = await message.channel.awaitMessages({
      filter: m => m.author.id === message.author.id && m.content.toLowerCase() === 'confirm',
      max: 1, time: 10_000,
    }).catch(() => null);

    if (!collected?.size)
      return msg.edit({ embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⏰  Nuke cancelled.')] });

    const pos = channel.rawPosition;
    const newCh = await channel.clone({ reason: `Nuked by ${message.author.tag}` }).catch(() => null);
    if (newCh) {
      await newCh.setPosition(pos).catch(() => {});
      await channel.delete(`Nuked by ${message.author.tag}`).catch(() => {});
      await newCh.send({ embeds: [
        new EmbedBuilder().setColor(C.red)
          .setAuthor({ name: '💥  Channel Nuked' })
          .setDescription(`This channel was nuked by ${message.author}.`)
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

    const amount = Math.min(parseInt(args[0]) || 20, 100);
    const msgs   = await message.channel.messages.fetch({ limit: amount }).catch(() => null);
    if (!msgs) return;
    const botMsgs = msgs.filter(m => m.author.bot);
    await message.channel.bulkDelete(botMsgs, true).catch(() => {});

    const reply = await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.green).setDescription(`> 🗑️  Deleted **${botMsgs.size}** bot message${botMsgs.size !== 1 ? 's' : ''}.`),
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
    if (!members.size) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,massban @user1 @user2 ...`')],
    });

    let count = 0;
    for (const [, m] of members) {
      if (m.bannable) {
        await m.ban({ reason: `Mass ban by ${message.author.tag}` }).catch(() => {});
        count++;
      }
    }

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.red)
        .setAuthor({ name: 'Mass Ban' })
        .setDescription(`> 🔨  Banned **${count}** of **${members.size}** members.`)
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
    if (!members.size) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,masskick @user1 @user2 ...`')],
    });

    let count = 0;
    for (const [, m] of members) {
      if (m.kickable) { await m.kick(`Mass kick by ${message.author.tag}`).catch(() => {}); count++; }
    }

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.orange)
        .setAuthor({ name: 'Mass Kick' })
        .setDescription(`> 🦶  Kicked **${count}** of **${members.size}** members.`)
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
        .setAuthor({ name: '🛡️  Raid Mode Toggled' })
        .setDescription('> New joins will be restricted until raid mode is lifted.')
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
    if (!member) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,stripstaff <@user>`')],
    });

    const dangerous = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageRoles,
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
        .setAuthor({ name: `${member.user.username} — roles stripped`, iconURL: member.user.displayAvatarURL() })
        .setDescription(stripped.length
          ? `> ✅  Stripped **${stripped.length}** staff role${stripped.length !== 1 ? 's' : ''}:\n> ${stripped.join(', ')}`
          : '> ℹ️  No elevated roles to strip.')
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
    if (!member) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,jail <@user> [reason]`')],
    });

    const reason = args.slice(1).join(' ') || 'No reason provided';

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.orange)
        .setAuthor({ name: `${member.user.username} jailed`, iconURL: member.user.displayAvatarURL() })
        .addFields(
          { name: '👤 User',      value: `${member}`, inline: true },
          { name: '👮 Moderator', value: `${message.author}`, inline: true },
          { name: '📋 Reason',    value: reason },
        )
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
    if (!member) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,unjail <@user>`')],
    });

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.green)
        .setDescription(`> ✅  ${member} has been released from jail.`)
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
    if (!caseId || !newReason) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,reason <case_id> <reason>`')],
    });

    const row = db.all('SELECT * FROM mod_history WHERE id=? AND guild_id=?', [caseId, message.guild.id])[0];
    if (!row) return message.reply({ embeds: [err(`Case **#${caseId}** not found.`)] });

    db.run('UPDATE mod_history SET reason=? WHERE id=?', [newReason, caseId]);

    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.green)
        .setDescription(`> ✅  Updated reason for case **#${caseId}**:\n> ${newReason}`)
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

    const bans    = db.all('SELECT COUNT(*) as c FROM mod_history WHERE guild_id=? AND mod_id=? AND action="ban"',  [message.guild.id, target.id])[0]?.c ?? 0;
    const kicks   = db.all('SELECT COUNT(*) as c FROM mod_history WHERE guild_id=? AND mod_id=? AND action="kick"', [message.guild.id, target.id])[0]?.c ?? 0;
    const mutes   = db.all('SELECT COUNT(*) as c FROM mod_history WHERE guild_id=? AND mod_id=? AND action="mute"', [message.guild.id, target.id])[0]?.c ?? 0;
    const warns   = db.all('SELECT COUNT(*) as c FROM mod_history WHERE guild_id=? AND mod_id=? AND action="warn"', [message.guild.id, target.id])[0]?.c ?? 0;
    const total   = bans + kicks + mutes + warns;

    const embed = new EmbedBuilder()
      .setColor(C.blue)
      .setAuthor({ name: `Mod Stats — ${target.username}`, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: '🔨 Bans',    value: String(bans),  inline: true },
        { name: '🦶 Kicks',   value: String(kicks), inline: true },
        { name: '🔇 Mutes',   value: String(mutes), inline: true },
        { name: '⚠️ Warns',   value: String(warns), inline: true },
        { name: '📊 Total',   value: String(total), inline: true },
      )
      .setFooter({ text: `ID: ${target.id}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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
    if (!target) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,permit <@user>`')],
    });
    await message.reply({ embeds: [
      new EmbedBuilder().setColor(C.green)
        .setDescription(`> ✅  **${target.username}** can now bypass restrictions.`)
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
      if (!target || !text) return message.reply({
        embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,sudo dm <@user> <message>`')],
      });
      await target.send(text).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(C.green).setDescription(`> ✅  DM sent to **${target.username}**.`)] });
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
    if (!channel || !text) return message.reply({
      embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,talk <#channel> <message>`')],
    });

    await channel.send(text).catch(() => {});
    await message.reply({ embeds: [new EmbedBuilder().setColor(C.green).setDescription(`> ✅  Message sent to ${channel}.`)] });
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
      if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,autorole add <@role>`')] });
      db.addAutorole(guildId, role.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(C.green).setDescription(`> ✅  **${role.name}** will now be given to new members.`)] });
    }
    if (sub === 'remove') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply({ embeds: [new EmbedBuilder().setColor(C.yellow).setDescription('> ⚠️  **Usage**\n> `,autorole remove <@role>`')] });
      db.removeAutorole(guildId, role.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(C.green).setDescription(`> ✅  **${role.name}** removed from auto-roles.`)] });
    }
    if (sub === 'clear') {
      db.clearAutoroles(guildId);
      return message.reply({ embeds: [new EmbedBuilder().setColor(C.green).setDescription('> ✅  All auto-roles cleared.')] });
    }
    if (sub === 'list') {
      const roles = db.getAutoroles(guildId);
      const embed = new EmbedBuilder().setColor(C.blue).setAuthor({ name: 'Auto-Roles' });
      embed.setDescription(roles.length
        ? roles.map(r => `• <@&${r.role_id}>`).join('\n')
        : '*No auto-roles configured.*');
      return message.reply({ embeds: [embed] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(C.blue)
      .setAuthor({ name: 'Auto-Role' })
      .setDescription('`,autorole add <@role>`\n`,autorole remove <@role>`\n`,autorole list`\n`,autorole clear`')] });
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
        .setAuthor({ name: '⚙️  Server Setup Wizard' })
        .setDescription('Use `/log`, `/welcome`, and `/ticket setup` to configure your server.\nOr use `,log`, `,welcome` for prefix setup.')
        .setTimestamp(),
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
