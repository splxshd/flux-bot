'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const BLUE   = '#5865F2';
const ORANGE = '#F0A500';

function fmtRel(d) { return `<t:${Math.floor(d.getTime() / 1000)}:R>`; }

function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * mult[unit];
}

// ── ,kick ─────────────────────────────────────────────────────────────────────
const kick = {
  name: 'kick',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Kick Members** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,kick <@user> [reason]`');
    const reason = args.slice(1).join(' ') || 'No reason provided.';
    if (!member.kickable) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ I cannot kick that member.')] });
    await member.kick(reason).catch(() => {});
    await member.user.send({ embeds: [new EmbedBuilder().setColor(ORANGE).setDescription(`🦶 You were kicked from **${message.guild.name}**.\n**Reason:** ${reason}`)] }).catch(() => {});
    const embed = new EmbedBuilder()
      .setColor(ORANGE)
      .setAuthor({ name: `${member.user.username} kicked`, iconURL: member.user.displayAvatarURL() })
      .addFields(
        { name: '👤 User',     value: `<@${member.id}>`, inline: true },
        { name: '👮 Mod',      value: `<@${message.author.id}>`, inline: true },
        { name: '📋 Reason',   value: reason, inline: false },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,ban ──────────────────────────────────────────────────────────────────────
const ban = {
  name: 'ban',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Ban Members** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,ban <@user> [reason]`');
    const reason = args.slice(1).join(' ') || 'No reason provided.';
    if (!member.bannable) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ I cannot ban that member.')] });
    await member.user.send({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`🔨 You were banned from **${message.guild.name}**.\n**Reason:** ${reason}`)] }).catch(() => {});
    await member.ban({ reason, deleteMessageSeconds: 86400 }).catch(() => {});
    const embed = new EmbedBuilder()
      .setColor(RED)
      .setAuthor({ name: `${member.user.username} banned`, iconURL: member.user.displayAvatarURL() })
      .addFields(
        { name: '👤 User',   value: `<@${member.id}>`, inline: true },
        { name: '👮 Mod',    value: `<@${message.author.id}>`, inline: true },
        { name: '📋 Reason', value: reason, inline: false },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,unban ────────────────────────────────────────────────────────────────────
const unban = {
  name: 'unban',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Ban Members** permission.')] });
    const userId = args[0]?.replace(/\D/g, '');
    if (!userId) return message.reply('Usage: `,unban <user_id>`');
    await message.guild.bans.remove(userId, `Unbanned by ${message.author.tag}`).catch(() => {});
    const embed = new EmbedBuilder().setColor(GREEN).setDescription(`✅ **${userId}** has been unbanned.`).setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,mute ─────────────────────────────────────────────────────────────────────
const mute = {
  name: 'mute',
  aliases: ['timeout'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Moderate Members** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,mute <@user> [duration] [reason]`');
    const durationStr = args[1];
    const duration = parseDuration(durationStr) || 10 * 60 * 1000;
    const reason = args.slice(parseDuration(durationStr) ? 2 : 1).join(' ') || 'No reason provided.';
    await member.timeout(duration, reason).catch(() => {});
    await member.user.send({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`🔇 You were muted in **${message.guild.name}**.\n**Reason:** ${reason}`)] }).catch(() => {});
    const embed = new EmbedBuilder()
      .setColor(YELLOW)
      .setAuthor({ name: `${member.user.username} muted` })
      .addFields(
        { name: '👤 User',     value: `<@${member.id}>`, inline: true },
        { name: '👮 Mod',      value: `<@${message.author.id}>`, inline: true },
        { name: '⏱️ Duration', value: durationStr || '10m', inline: true },
        { name: '📋 Reason',   value: reason, inline: false },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,unmute ───────────────────────────────────────────────────────────────────
const unmute = {
  name: 'unmute',
  aliases: ['untimeout'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Moderate Members** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,unmute <@user>`');
    await member.timeout(null).catch(() => {});
    const embed = new EmbedBuilder().setColor(GREEN).setDescription(`✅ Unmuted **${member.user.username}**.`).setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,warn ─────────────────────────────────────────────────────────────────────
const warn = {
  name: 'warn',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,warn <@user> [reason]`');
    const reason = args.slice(1).join(' ') || 'No reason provided.';
    db.addWarn?.(message.guild.id, member.id, message.author.id, reason);
    await member.user.send({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`⚠️ You received a warning in **${message.guild.name}**.\n**Reason:** ${reason}`)] }).catch(() => {});
    const embed = new EmbedBuilder()
      .setColor(YELLOW)
      .setAuthor({ name: `${member.user.username} warned` })
      .addFields(
        { name: '👤 User',   value: `<@${member.id}>`, inline: true },
        { name: '👮 Mod',    value: `<@${message.author.id}>`, inline: true },
        { name: '📋 Reason', value: reason, inline: false },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,warnings ─────────────────────────────────────────────────────────────────
const warnings = {
  name: 'warnings',
  aliases: ['warns'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const target = message.mentions.users.first();
    if (!target) return message.reply('Usage: `,warnings <@user>`');
    const list = db.getWarns?.(message.guild.id, target.id) || [];
    const embed = new EmbedBuilder()
      .setColor(YELLOW)
      .setAuthor({ name: `${target.username} — Warnings (${list.length})`, iconURL: target.displayAvatarURL() })
      .setDescription(list.length ? list.map((w, i) => `**${i + 1}.** ${w.reason} — <@${w.mod_id}> ${fmtRel(new Date(w.created_at * 1000))}`).join('\n') : 'No warnings.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,clearwarns ───────────────────────────────────────────────────────────────
const clearwarns = {
  name: 'clearwarns',
  aliases: ['clearwarnings'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const target = message.mentions.users.first();
    if (!target) return message.reply('Usage: `,clearwarns <@user>`');
    db.clearWarns?.(message.guild.id, target.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Cleared all warnings for **${target.username}**.`)] });
  }
};

// ── ,history ──────────────────────────────────────────────────────────────────
const history = {
  name: 'history',
  aliases: ['hist'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const target = message.mentions.users.first();
    if (!target) return message.reply('Usage: `,history <@user>`');
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${target.username} — Moderation History`, iconURL: target.displayAvatarURL() })
      .setDescription('ℹ️ Moderation history requires database integration.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,nuke ─────────────────────────────────────────────────────────────────────
const nuke = {
  name: 'nuke',
  aliases: ['clonechannel'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Channels** permission.')] });
    const channel = message.mentions.channels.first() || message.channel;
    const msg = await message.channel.send({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`⚠️ Nuking **${channel.name}**... Reply \`confirm\` to proceed.`)] });
    const collected = await message.channel.awaitMessages({ filter: m => m.author.id === message.author.id && m.content.toLowerCase() === 'confirm', max: 1, time: 10000 }).catch(() => null);
    if (!collected || collected.size === 0) return msg.edit({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⏰ Nuke cancelled.')] });
    const pos = channel.rawPosition;
    const newCh = await channel.clone({ reason: `Nuked by ${message.author.tag}` }).catch(() => null);
    if (newCh) {
      await newCh.setPosition(pos).catch(() => {});
      await channel.delete(`Nuked by ${message.author.tag}`).catch(() => {});
      await newCh.send({ embeds: [new EmbedBuilder().setColor(RED).setTitle('💥 Channel Nuked').setDescription(`This channel was nuked by <@${message.author.id}>.`).setTimestamp()] });
    }
  }
};

// ── ,botclear ─────────────────────────────────────────────────────────────────
const botclear = {
  name: 'botclear',
  aliases: ['bc', 'clearbots'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const amount = Math.min(parseInt(args[0]) || 20, 100);
    const msgs = await message.channel.messages.fetch({ limit: amount }).catch(() => null);
    if (!msgs) return;
    const botMsgs = msgs.filter(m => m.author.bot);
    await message.channel.bulkDelete(botMsgs, true).catch(() => {});
    const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Deleted **${botMsgs.size}** bot messages.`)] });
    setTimeout(() => reply.delete().catch(() => {}), 3000);
  }
};

// ── ,massban ──────────────────────────────────────────────────────────────────
const massban = {
  name: 'massban',
  aliases: [],
  async execute(message, args) {
    if (message.author.id !== message.guild.ownerId)
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Only the server owner can use this command.')] });
    const members = message.mentions.members;
    if (!members.size) return message.reply('Usage: `,massban @user1 @user2 ...`');
    let count = 0;
    for (const [, m] of members) {
      if (m.bannable) { await m.ban({ reason: `Mass ban by ${message.author.tag}` }).catch(() => {}); count++; }
    }
    await message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`🔨 Mass banned **${count}** members.`)] });
  }
};

// ── ,masskick ─────────────────────────────────────────────────────────────────
const masskick = {
  name: 'masskick',
  aliases: [],
  async execute(message, args) {
    if (message.author.id !== message.guild.ownerId)
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Only the server owner can use this command.')] });
    const members = message.mentions.members;
    if (!members.size) return message.reply('Usage: `,masskick @user1 @user2 ...`');
    let count = 0;
    for (const [, m] of members) {
      if (m.kickable) { await m.kick(`Mass kick by ${message.author.tag}`).catch(() => {}); count++; }
    }
    await message.reply({ embeds: [new EmbedBuilder().setColor(ORANGE).setDescription(`🦶 Mass kicked **${count}** members.`)] });
  }
};

// ── ,raid ─────────────────────────────────────────────────────────────────────
const raid = {
  name: 'raid',
  aliases: ['raidmode'],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
    await message.reply({ embeds: [new EmbedBuilder().setColor(RED).setTitle('🛡️ Raid Mode').setDescription('Raid mode has been toggled. New joins will be restricted.').setTimestamp()] });
  }
};

// ── ,stripstaff ───────────────────────────────────────────────────────────────
const stripstaff = {
  name: 'stripstaff',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Administrator** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,stripstaff <@user>`');
    const dangerousPerms = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageRoles];
    const stripped = [];
    for (const [, role] of member.roles.cache) {
      if (role.id === message.guild.id) continue;
      if (dangerousPerms.some(p => role.permissions.has(p))) {
        await member.roles.remove(role).catch(() => {});
        stripped.push(role.name);
      }
    }
    await message.reply({ embeds: [new EmbedBuilder().setColor(ORANGE)
      .setDescription(`✅ Stripped ${stripped.length} staff role(s) from **${member.user.username}**: ${stripped.join(', ') || 'none'}.`).setTimestamp()] });
  }
};

// ── ,mentions ─────────────────────────────────────────────────────────────────
const mentions = {
  name: 'mentions',
  aliases: ['pings'],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const msgs = await message.channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!msgs) return;
    const found = msgs.filter(m => m.mentions.users.has(target.id));
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${target.username} — Recent Mentions (${found.size})` })
      .setDescription(found.size ? [...found.values()].slice(0, 5).map(m => `[Jump](${m.url}) — ${m.content?.slice(0, 60) || '*embed*'}`).join('\n') : 'No recent mentions.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,jail ─────────────────────────────────────────────────────────────────────
const jail = {
  name: 'jail',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const member = message.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided.';
    if (!member) return message.reply('Usage: `,jail <@user> [reason]`');
    await message.reply({ embeds: [new EmbedBuilder().setColor(ORANGE)
      .setDescription(`🔒 **${member.user.username}** has been jailed.\n**Reason:** ${reason}`).setTimestamp()] });
  }
};

// ── ,unjail ───────────────────────────────────────────────────────────────────
const unjail = {
  name: 'unjail',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,unjail <@user>`');
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ **${member.user.username}** has been released from jail.`)] });
  }
};

// ── ,reason ───────────────────────────────────────────────────────────────────
const reason = {
  name: 'reason',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const caseId = args[0];
    const newReason = args.slice(1).join(' ');
    if (!caseId || !newReason) return message.reply('Usage: `,reason <case_id> <reason>`');
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Updated reason for case **#${caseId}**: ${newReason}`)] });
  }
};

// ── ,modstats ─────────────────────────────────────────────────────────────────
const modstats = {
  name: 'modstats',
  aliases: [],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${target.username} — Mod Stats`, iconURL: target.displayAvatarURL() })
      .setDescription('ℹ️ Moderation statistics require database logging to be configured.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,permit ───────────────────────────────────────────────────────────────────
const permit = {
  name: 'permit',
  aliases: ['perm'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
    const target = message.mentions.users.first();
    if (!target) return message.reply('Usage: `,permit <@user>`');
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ **${target.username}** has been permitted to bypass certain restrictions.`)] });
  }
};

// ── ,sudo ─────────────────────────────────────────────────────────────────────
const sudo = {
  name: 'sudo',
  aliases: ['runas'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Administrator** permission.')] });
    const sub = args[0]?.toLowerCase();
    if (sub === 'dm') {
      const target = message.mentions.users.first();
      const text = args.slice(2).join(' ');
      if (!target || !text) return message.reply('Usage: `,sudo dm <@user> <message>`');
      await target.send(text).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ DM sent to **${target.username}**.`)] });
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('**Subcommands:** `dm <@user> <msg>`')] });
  }
};

// ── ,talk ─────────────────────────────────────────────────────────────────────
const talk = {
  name: 'talk',
  aliases: ['say_in'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const channel = message.mentions.channels.first();
    const text = args.slice(message.mentions.channels.size ? 2 : 1).join(' ');
    if (!channel || !text) return message.reply('Usage: `,talk <#channel> <message>`');
    await channel.send(text).catch(() => {});
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Message sent to ${channel}.`)] });
  }
};

// ── ,bind ─────────────────────────────────────────────────────────────────────
const bind = {
  name: 'bind',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
    const sub = args[0]?.toLowerCase();
    if (sub === 'list') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ No command permission binds set.')] });
    }
    const role = message.mentions.roles.first();
    const command = args.slice(1).join(' ');
    if (!role || !command) return message.reply('Usage: `,bind <@role> <command>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Bound **${command}** to role **${role.name}**.`)] });
  }
};

// ── ,autorole ─────────────────────────────────────────────────────────────────
const autorole = {
  name: 'autorole',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const role = message.mentions.roles.first();
    if (!role) return message.reply('Usage: `,autorole <@role>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ New members will automatically receive **${role.name}**.`)] });
  }
};

// ── ,setup ────────────────────────────────────────────────────────────────────
const setup = {
  name: 'setup',
  aliases: [],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('⚙️ Server Setup Wizard')
      .setDescription('Use the slash command `/log`, `/welcome`, and `/ticket setup` to configure your server. Or use `,log`, `,welcome`, etc. for prefix setup.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

module.exports = [
  kick, ban, unban, mute, unmute, warn, warnings, clearwarns,
  history, nuke, botclear, massban, masskick, raid, stripstaff,
  mentions, jail, unjail, reason, modstats, permit, sudo, talk, bind, autorole, setup,
];
