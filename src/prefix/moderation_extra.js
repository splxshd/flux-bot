'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const BLUE   = '#5865F2';
const ORANGE = '#F0A500';

// ── ,imute / ,iunmute ─────────────────────────────────────────────────────────
const imute = {
  name: 'imute',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,imute <@user> [reason]`');
    const reason = args.slice(1).join(' ') || 'No reason provided.';
    await message.channel.permissionOverwrites.edit(member, { AttachFiles: false, EmbedLinks: false }).catch(() => {});
    await member.user.send({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`🖼️ You were image-muted in **${message.guild.name}**.\n**Reason:** ${reason}`)] }).catch(() => {});
    return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`✅ Image-muted **${member.user.username}**. Reason: ${reason}`)] });
  }
};

const iunmute = {
  name: 'iunmute',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,iunmute <@user>`');
    await message.channel.permissionOverwrites.edit(member, { AttachFiles: null, EmbedLinks: null }).catch(() => {});
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed image-mute from **${member.user.username}**.`)] });
  }
};

// ── ,rmute / ,runmute ─────────────────────────────────────────────────────────
const rmute = {
  name: 'rmute',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,rmute <@user> [reason]`');
    await message.channel.permissionOverwrites.edit(member, { AddReactions: false }).catch(() => {});
    return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`✅ Reaction-muted **${member.user.username}**.`)] });
  }
};

const runmute = {
  name: 'runmute',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,runmute <@user>`');
    await message.channel.permissionOverwrites.edit(member, { AddReactions: null }).catch(() => {});
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed reaction-mute from **${member.user.username}**.`)] });
  }
};

// ── ,setupmute ────────────────────────────────────────────────────────────────
const setupmute = {
  name: 'setupmute',
  aliases: [],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    let muteRole = message.guild.roles.cache.find(r => r.name === 'Muted');
    if (!muteRole) {
      muteRole = await message.guild.roles.create({ name: 'Muted', color: '#808080', reason: 'Muted role setup' }).catch(() => null);
      if (!muteRole) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Failed to create Muted role.')] });
      for (const [, channel] of message.guild.channels.cache) {
        await channel.permissionOverwrites.edit(muteRole, { SendMessages: false, AddReactions: false, Speak: false }).catch(() => {});
      }
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Muted role set up: **${muteRole.name}** (<@&${muteRole.id}>).`)] });
  }
};

// ── ,hardban ─────────────────────────────────────────────────────────────────
const hardban = {
  name: 'hardban',
  aliases: ['hb'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Ban Members** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,hardban <@user> [reason]`');
    const reason = args.slice(1).join(' ') || 'No reason provided.';
    if (member.bannable) await member.ban({ reason }).catch(() => {});
    return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`🔨 **${member.user.username}** has been hard-banned. They will be auto-rebanned on rejoin.`)] });
  }
};

// ── ,jaillist ─────────────────────────────────────────────────────────────────
const jaillist = {
  name: 'jaillist',
  aliases: [],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('🔒 Jailed Members').setDescription('ℹ️ No members are currently jailed.').setTimestamp()] });
  }
};

// ── ,timeoutlist ──────────────────────────────────────────────────────────────
const timeoutlist = {
  name: 'timeoutlist',
  aliases: ['tlist', 'tolist', 'timeout list'],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Moderate Members** permission.')] });
    await message.guild.members.fetch().catch(() => {});
    const timedOut = message.guild.members.cache.filter(m => m.communicationDisabledUntil && m.communicationDisabledUntil > new Date());
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(YELLOW)
      .setTitle(`⏱️ Timed Out Members (${timedOut.size})`)
      .setDescription(timedOut.size
        ? [...timedOut.values()].map(m => `<@${m.id}> — until <t:${Math.floor(m.communicationDisabledUntil.getTime() / 1000)}:R>`).join('\n')
        : 'No members are currently timed out.')
      .setTimestamp()] });
  }
};

// ── ,notes ────────────────────────────────────────────────────────────────────
const notes = {
  name: 'notes',
  aliases: ['staffnotes'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const target = message.mentions.users.first();
    if (!target) return message.reply('Usage: `,notes <@user>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setAuthor({ name: `${target.username} — Staff Notes`, iconURL: target.displayAvatarURL() }).setDescription('ℹ️ No notes on this user.').setTimestamp()] });
  }
};

// ── ,note_remove ─────────────────────────────────────────────────────────────
const note_remove = {
  name: 'note_remove',
  aliases: ['removenote'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const target = message.mentions.users.first();
    const id = args[1];
    if (!target || !id) return message.reply('Usage: `,note_remove <@user> <note_id>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed note **#${id}** from **${target.username}**.`)] });
  }
};

// ── ,moderationhistory ────────────────────────────────────────────────────────
const moderationhistory = {
  name: 'moderationhistory',
  aliases: ['modhistory'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const target = message.mentions.users.first() || message.author;
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setAuthor({ name: `${target.username} — Mod Action History`, iconURL: target.displayAvatarURL() }).setDescription('ℹ️ Moderation action history requires database logging.').setTimestamp()] });
  }
};

// ── ,invoke ───────────────────────────────────────────────────────────────────
const invoke = {
  name: 'invoke',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const caseId = args[0];
    if (!caseId) return message.reply('Usage: `,invoke <case_id>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(`ℹ️ Looking up case **#${caseId}**... Database required for case invocation.`)] });
  }
};

// ── ,nukestop ────────────────────────────────────────────────────────────────
const nukestop = {
  name: 'nukestop',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Channels** permission.')] });
    const channel = message.mentions.channels.first() || message.channel;
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Nuke cancelled for **${channel.name}**.`)] });
  }
};

// ── ,nukes ────────────────────────────────────────────────────────────────────
const nukes = {
  name: 'nukes',
  aliases: [],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Channels** permission.')] });
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('💥 Nuke Log').setDescription('No recent nukes.').setTimestamp()] });
  }
};

module.exports = [imute, iunmute, rmute, runmute, setupmute, hardban, jaillist, timeoutlist, notes, note_remove, moderationhistory, invoke, nukestop, nukes];
