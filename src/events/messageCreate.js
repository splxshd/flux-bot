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

function buildHoneypotEmbed(actionWord, count) {
  return new EmbedBuilder()
    .setColor('#ED4245')
    .setTitle('⚠️ RESTRICTED SECURITY CHANNEL')
    .setDescription(
      '**DO NOT** `SEND` **ANY** `MESSAGES` **HERE**\n\n' +
      'This channel is a trap designed to catch `spam bots` and `compromised accounts`.\n' +
      `Any message sent here will automatically result in **a ${actionWord.toLowerCase().replace(/s$/, '')}**.`
    )
    .addFields({ name: `🍯 ${actionWord}`, value: `**${count}**`, inline: true })
    .setTimestamp();
}

// Anti-raid mention tracker
const mentionTracker = new Map(); // userId -> count (reset per guild, simple per-message check)

// Sticky message counter — tracks messages since last repost per sticky id
const stickyCounter = new Map(); // stickyId -> count

// Credit earn cooldown — in-memory per user to avoid DB spam
const creditCooldowns = new Map(); // `${guildId}-${userId}` -> timestamp ms

module.exports = (client) => {
  console.log('[messageCreate] handler registered');
  client.on('messageCreate', async (message) => {
    try { await handleMessage(client, message); }
    catch (e) { console.error('[messageCreate fatal]', e); }
  });
};

async function handleMessage(client, message) {
    if (!message.guild || message.author.bot) return;

    // ── Honeypot channel ────────────────────────────────────────────────────────
    const honeypot = db.getHoneypot(message.guild.id, message.channel.id);
    if (honeypot) {
      // Admins/mods can still type without getting caught
      if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        await message.delete().catch(() => {});

        const action = honeypot.action || 'kick';
        const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member) {
          try {
            if (action === 'ban') {
              await member.ban({ reason: 'Honeypot channel — auto-ban', deleteMessageDays: 1 });
            } else if (action === 'softban') {
              await member.ban({ reason: 'Honeypot channel — softban', deleteMessageDays: 1 });
              await message.guild.bans.remove(member.id, 'Softban complete').catch(() => {});
            } else {
              await member.kick('Honeypot channel — auto-kick');
            }
          } catch (_) {}

          // DM the user
          const actionPast = action === 'ban' ? 'banned' : action === 'softban' ? 'softbanned' : 'kicked';
          message.author.send({
            embeds: [new EmbedBuilder()
              .setColor('#ED4245')
              .setTitle('⚠️ You triggered a honeypot')
              .setDescription(`You sent a message in a restricted channel in **${message.guild.name}** and were automatically **${actionPast}**.\nIf you believe this was a mistake, contact the server staff.`)
              .setTimestamp()],
          }).catch(() => {});
        }

        // Increment counter and update the warning embed
        db.incrementHoneypotCount(message.guild.id, message.channel.id);
        const updated = db.getHoneypot(message.guild.id, message.channel.id);
        if (updated?.message_id) {
          const ch = message.channel;
          const pinned = await ch.messages.fetch(updated.message_id).catch(() => null);
          if (pinned?.author?.id === client.user.id) {
            const actionWord = action === 'ban' ? 'Bans' : action === 'softban' ? 'Softbans' : 'Kicks';
            await pinned.edit({ embeds: [buildHoneypotEmbed(actionWord, updated.count)] }).catch(() => {});
          }
        }
      }
      return; // Never process honeypot messages as commands
    }

    db.trackMessage(message.guild.id, message.author.id, message.channel.id, message.channel.name);

    // ── Credits ──────────────────────────────────────────────────────────────
    try {
      const cs = db.getCreditSettings(message.guild.id);
      if (cs.enabled && cs.credits_per_msg > 0) {
        const key      = `${message.guild.id}-${message.author.id}`;
        const lastAt   = creditCooldowns.get(key) || 0;
        const nowMs    = Date.now();
        if (nowMs - lastAt >= cs.cooldown_sec * 1000) {
          creditCooldowns.set(key, nowMs);
          db.addCredits(message.guild.id, message.author.id, cs.credits_per_msg);
        }
      }
    } catch (e) { console.error('[credits earn]', e); }

    // ── XP / Leveling ────────────────────────────────────────────────────────
    const lvlSettings = db.getLevelSettings(message.guild.id);
    if (!lvlSettings || lvlSettings.enabled !== 0) {
      const xpGain = Math.floor(Math.random() * 11) + 15; // 15–25 XP per message
      const { leveled, newLevel } = db.addXp(message.guild.id, message.author.id, xpGain);
      if (leveled) {
        // Give level reward role if configured
        const rewards = db.getLevelRewards(message.guild.id);
        const reward = rewards.find(r => r.level === newLevel);
        if (reward) {
          const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
          if (member) await member.roles.add(reward.role_id).catch(() => {});
        }
        // Send level-up message
        const levelupChannelId = lvlSettings?.levelup_channel;
        const levelupMsg = (lvlSettings?.levelup_message || '🎉 {user} just reached **Level {level}**!')
          .replace('{user}', `<@${message.author.id}>`)
          .replace('{level}', newLevel)
          .replace('{username}', message.author.username);
        const destChannel = levelupChannelId
          ? (message.guild.channels.cache.get(levelupChannelId) || message.channel)
          : message.channel;
        await destChannel.send({ content: levelupMsg }).catch(() => {});
      }
    }

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

      // Restore original nickname (remove [AFK] prefix)
      if (message.member) {
        const restoredNick = myAfk.nick ?? null; // null = remove custom nick (show username)
        message.member.setNickname(restoredNick).catch(() => {});
      }

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

    // 5. Auto reactions (trigger-based)
    const reactions = db.getReactions(guild.id);
    for (const row of reactions) {
      if (message.content.toLowerCase().includes(row.trigger.toLowerCase())) {
        await message.react(row.emoji).catch(() => {});
      }
    }

    // 5b. Channel auto-react (react to every message in configured channels)
    const chReacts = db.getChannelAutoreacts(guild.id, message.channel.id);
    for (const row of chReacts) {
      await message.react(row.emoji).catch(() => {});
    }

    // 6. Sticky messages (repost every STICKY_INTERVAL messages, supports multiple per channel)
    const stickies = db.getStickiesForChannel(guild.id, message.channel.id);
    for (const sticky of stickies) {
      if (message.id === sticky.last_message_id) continue;
      const count = (stickyCounter.get(sticky.id) ?? 0) + 1;
      stickyCounter.set(sticky.id, count);
      if (count >= (sticky.interval || 25)) {
        stickyCounter.set(sticky.id, 0);
        if (sticky.last_message_id) {
          const lastMsg = await message.channel.messages.fetch(sticky.last_message_id).catch(() => null);
          if (lastMsg) await lastMsg.delete().catch(() => {});
        }
        const sent = await sendStickyContent(message.channel, sticky.content);
        if (sent) db.updateStickyLastMessage(sticky.id, sent.id);
      }
    }
}
