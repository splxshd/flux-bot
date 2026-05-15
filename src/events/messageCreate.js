'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

// Lazy-loaded so there's no circular-require issue at startup
let _generalCmds = null;
function getGeneral() {
  if (!_generalCmds) _generalCmds = require('../prefix/general');
  return _generalCmds;
}

// Permission string → PermissionFlagsBits value
const PERM_FLAGS = {
  'Ban Members':      PermissionFlagsBits.BanMembers,
  'Kick Members':     PermissionFlagsBits.KickMembers,
  'Manage Messages':  PermissionFlagsBits.ManageMessages,
  'Manage Guild':     PermissionFlagsBits.ManageGuild,
  'Manage Roles':     PermissionFlagsBits.ManageRoles,
  'Manage Channels':  PermissionFlagsBits.ManageChannels,
  'Moderate Members': PermissionFlagsBits.ModerateMembers,
  'Administrator':    PermissionFlagsBits.Administrator,
  'Manage Nicknames': PermissionFlagsBits.ManageNicknames,
  'Manage Webhooks':  PermissionFlagsBits.ManageWebhooks,
  'View Audit Log':   PermissionFlagsBits.ViewAuditLog,
};

const YELLOW = '#FEE75C';
const GREEN  = '#57F287';

// Anti-raid mention tracker
const mentionTracker = new Map(); // userId -> count (reset per guild, simple per-message check)

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    db.trackMessage(message.guild.id, message.author.id, message.channel.id, message.channel.name);

    const guild = message.guild;

    // 1. Anti-raid mention spam
    const antiraid = db.getAntiraid(guild.id);
    if (antiraid && antiraid.enabled && antiraid.mention_threshold > 0) {
      const mentionCount = message.mentions.users.size + message.mentions.roles.size;
      if (mentionCount >= antiraid.mention_threshold) {
        await message.delete().catch(() => {});
        const member = message.member;
        if (member) {
          if (antiraid.action === 'ban') await member.ban({ reason: 'Mention spam' }).catch(() => {});
          else if (antiraid.action === 'kick') await member.kick('Mention spam').catch(() => {});
          else if (antiraid.action === 'timeout') await member.timeout(10 * 60 * 1000, 'Mention spam').catch(() => {});
        }
        if (antiraid.log_channel) {
          const logCh = guild.channels.cache.get(antiraid.log_channel);
          if (logCh) logCh.send(`⚠️ **Mention spam** by <@${message.author.id}> — ${mentionCount} mentions. Action: **${antiraid.action}**`).catch(() => {});
        }
        return;
      }
    }

    // 2. AFK mention check
    if (message.mentions.users.size > 0) {
      for (const [, user] of message.mentions.users) {
        if (user.id === message.author.id) continue;
        const afkRow = db.getAfk(guild.id, user.id);
        if (!afkRow) continue;

        const member = guild.members.cache.get(user.id);
        const displayName = member?.displayName || user.username;
        const setAt = new Date(afkRow.set_at * 1000);
        const elapsedSec = Math.floor(Date.now() / 1000 - afkRow.set_at);
        const elapsed = elapsedSec < 60
          ? 'just now'
          : elapsedSec < 3600
            ? `${Math.floor(elapsedSec / 60)}m ago`
            : elapsedSec < 86400
              ? `${Math.floor(elapsedSec / 3600)}h ago`
              : `${Math.floor(elapsedSec / 86400)}d ago`;

        const embed = new EmbedBuilder()
          .setColor(YELLOW)
          .setAuthor({ name: `${displayName} (@${user.username}) is currently AFK`, iconURL: user.displayAvatarURL() })
          .setDescription(afkRow.reason || 'No reason given.')
          .setFooter({ text: `AFK for ${elapsed}` })
          .setTimestamp(setAt);

        await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => {});
      }
    }

    // 3. AFK removal (when AFK user sends a message)
    const myAfk = db.getAfk(guild.id, message.author.id);
    if (myAfk) {
      db.removeAfk(guild.id, message.author.id);
      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: `Welcome back, ${message.member?.displayName || message.author.username}!`, iconURL: message.author.displayAvatarURL() })
        .setDescription('Your AFK status has been removed.')
        .setFooter({ text: 'flux bot' })
        .setTimestamp();
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => {});
    }

    // 4. Prefix commands
    const prefix = db.getPrefix(message.guild.id);
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/\s+/);
      const commandName = args.shift().toLowerCase();
      const cmd = message.client.prefixCommands?.get(commandName);
      if (cmd) {
        // ── Permission gate ───────────────────────────────────────────────
        const { CMD_META, buildCommandEmbed } = getGeneral();
        const meta     = CMD_META[cmd.name];
        const permName = meta?.permission;
        const flag     = permName && PERM_FLAGS[permName];

        if (flag && !message.member.permissions.has(flag)) {
          const embed = buildCommandEmbed(cmd, prefix, message.client);
          return message.reply({ embeds: [embed] });
        }

        // ── Execute ───────────────────────────────────────────────────────
        await cmd.execute(message, args, message.client).catch(e => {
          console.error(`[Prefix:${commandName}]`, e);
          message.reply(`❌ Error: ${e.message}`).catch(() => {});
        });
        return;
      }
    }

    // 5. Autoresponder
    const responders = db.getAutoresponders(guild.id);
    for (const row of responders) {
      if (message.content.toLowerCase().includes(row.trigger.toLowerCase())) {
        // Detect JSON embed responses (saved from dashboard embed builder)
        let parsed = null;
        try { parsed = JSON.parse(row.response); } catch {}
        if (parsed && typeof parsed === 'object' && (parsed.title || parsed.description || parsed.color)) {
          const embed = new EmbedBuilder();
          if (parsed.title)       embed.setTitle(parsed.title);
          if (parsed.description) embed.setDescription(parsed.description);
          if (parsed.color)       embed.setColor(parsed.color);
          if (parsed.footer)      embed.setFooter({ text: parsed.footer });
          if (parsed.thumbnail)   embed.setThumbnail(parsed.thumbnail);
          if (parsed.image)       embed.setImage(parsed.image);
          if (parsed.author)      embed.setAuthor({ name: parsed.author });
          if (Array.isArray(parsed.fields)) {
            for (const f of parsed.fields) embed.addFields({ name: f.name, value: f.value, inline: !!f.inline });
          }
          await message.channel.send({ embeds: [embed] }).catch(() => {});
        } else {
          await message.channel.send(row.response).catch(() => {});
        }
        break;
      }
    }

    // 5. Auto reactions
    const reactions = db.getReactions(guild.id);
    for (const row of reactions) {
      if (message.content.toLowerCase().includes(row.trigger.toLowerCase())) {
        await message.react(row.emoji).catch(() => {});
      }
    }

    // 6. Sticky messages
    const sticky = db.getStickyMessage(guild.id, message.channel.id);
    if (sticky && message.id !== sticky.last_message_id) {
      if (sticky.last_message_id) {
        const lastMsg = await message.channel.messages.fetch(sticky.last_message_id).catch(() => null);
        if (lastMsg) await lastMsg.delete().catch(() => {});
      }

      // Support embed-style sticky (same tag syntax as ,ce)
      const sc = sticky.content;
      const titleMatch  = sc.match(/\{title:\s*([^}]+)\}/i);
      const descMatch   = sc.match(/\{desc(?:ription)?:\s*([^}]+)\}/i);
      const colorMatch  = sc.match(/\{color:\s*#?([0-9a-fA-F]{6})\}/i);
      const footerMatch = sc.match(/\{footer:\s*([^}]+)\}/i);
      const thumbMatch  = sc.match(/\{thumbnail:\s*([^}]+)\}/i);
      const imageMatch  = sc.match(/\{image:\s*([^}]+)\}/i);
      const authorMatch = sc.match(/\{author:\s*([^}]+)\}/i);

      let sent = null;
      if (titleMatch || descMatch || colorMatch || footerMatch || thumbMatch || imageMatch || authorMatch) {
        const emb = new EmbedBuilder().setColor(colorMatch ? parseInt(colorMatch[1], 16) : 0x5865F2);
        if (titleMatch)  emb.setTitle(titleMatch[1].trim());
        if (descMatch)   emb.setDescription(descMatch[1].trim());
        if (footerMatch) emb.setFooter({ text: footerMatch[1].trim() });
        if (thumbMatch)  emb.setThumbnail(thumbMatch[1].trim());
        if (imageMatch)  emb.setImage(imageMatch[1].trim());
        if (authorMatch) emb.setAuthor({ name: authorMatch[1].trim() });
        // If no title/desc, use leftover plain text
        if (!titleMatch && !descMatch) {
          const leftover = sc.replace(/\{[^}]+\}/g, '').trim();
          if (leftover) emb.setDescription(leftover.slice(0, 2000));
        }
        sent = await message.channel.send({ embeds: [emb] }).catch(() => null);
      } else {
        sent = await message.channel.send(sc).catch(() => null);
      }

      if (sent) db.updateStickyLastMessage(guild.id, message.channel.id, sent.id);
    }
  });
};
