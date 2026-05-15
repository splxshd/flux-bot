'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { sendStickyContent } = require('../utils/sendSticky');
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

// Sticky message counter — tracks messages since last sticky post per channel
const stickyCounter = new Map(); // channelId -> count
const STICKY_INTERVAL = 10;

module.exports = (client) => {
  console.log('[messageCreate] handler registered');
  client.on('messageCreate', async (message) => {
    try { await handleMessage(client, message); }
    catch (e) { console.error('[messageCreate fatal]', e); }
  });
};

async function handleMessage(client, message) {
    if (!message.guild || message.author.bot) return;

    console.log(`[MC] msg from ${message.author.tag} | content: ${message.content.slice(0,30)}`);

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
    console.log(`[MC] prefix="${prefix}" starts=${message.content.startsWith(prefix)}`);
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/\s+/);
      const commandName = args.shift().toLowerCase();
      const cmd = message.client.prefixCommands?.get(commandName);
      console.log(`[MC] cmd="${commandName}" found=${!!cmd}`);
      if (cmd) {
        // ── Permission gate ───────────────────────────────────────────────
        try {
          const { CMD_META, buildCommandEmbed } = getGeneral();
          const meta     = CMD_META[cmd.name];
          const permName = meta?.permission;
          const flag     = permName && PERM_FLAGS[permName];
          if (flag && !message.member.permissions.has(flag)) {
            const embed = buildCommandEmbed(cmd, prefix, message.client);
            return message.reply({ embeds: [embed] });
          }
        } catch (e) { console.error('[PermGate]', e); }

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

    // 6. Sticky messages (repost every STICKY_INTERVAL messages)
    const sticky = db.getStickyMessage(guild.id, message.channel.id);
    if (sticky && message.id !== sticky.last_message_id) {
      const count = (stickyCounter.get(message.channel.id) ?? 0) + 1;
      stickyCounter.set(message.channel.id, count);
      if (count >= STICKY_INTERVAL) {
        stickyCounter.set(message.channel.id, 0);
        if (sticky.last_message_id) {
          const lastMsg = await message.channel.messages.fetch(sticky.last_message_id).catch(() => null);
          if (lastMsg) await lastMsg.delete().catch(() => {});
        }
        const sent = await sendStickyContent(message.channel, sticky.content);
        if (sent) db.updateStickyLastMessage(guild.id, message.channel.id, sent.id);
      }
    }
}
