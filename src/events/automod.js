'use strict';

const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const db = require('../database');

// ── In-memory trackers (cleared on restart, intentionally) ───────────────────
const spamTracker  = new Map(); // `guildId:userId` → [timestamps]
const dupesTracker = new Map(); // `guildId:userId` → [{content, ts}]

// ── Regexes ───────────────────────────────────────────────────────────────────
const URL_REGEX    = /https?:\/\/[^\s<]+|discord\.gg\/\S+|discord\.com\/invite\/\S+/gi;
const INVITE_REGEX = /discord\.gg\/\S+|discord\.com\/invite\/\S+/gi;
const EMOJI_REGEX  = /(\p{Emoji_Presentation}|\p{Extended_Pictographic}|<a?:\w+:\d+>)/gu;
const ZALGO_REGEX  = /[̀-ͯ҉᪰-᫿᷀-᷿⃐-⃿︠-︯]{3,}/g;

// ── Helpers ───────────────────────────────────────────────────────────────────
function isExempt(member, channelId, settings) {
  try {
    const roles    = JSON.parse(settings.exempt_roles    || '[]');
    const channels = JSON.parse(settings.exempt_channels || '[]');
    if (channels.includes(channelId)) return true;
    if (member.roles.cache.some(r => roles.includes(r.id))) return true;
  } catch {}
  return false;
}

function checkSpam(guildId, userId, settings) {
  const key  = `${guildId}:${userId}`;
  const now  = Date.now();
  const wind = settings.spam_interval * 1000;
  const hist = (spamTracker.get(key) || []).filter(t => now - t < wind);
  hist.push(now);
  spamTracker.set(key, hist);
  return hist.length >= settings.spam_limit;
}

function checkCaps(content, settings) {
  const text = content.replace(/[^a-zA-Z]/g, '');
  if (text.length < settings.caps_min_length) return false;
  const caps = content.replace(/[^A-Z]/g, '').length;
  return (caps / text.length) * 100 >= settings.caps_percent;
}

function checkLinks(content, settings) {
  const urls = content.match(URL_REGEX);
  if (!urls) return false;
  const wl = JSON.parse(settings.links_whitelist || '[]');
  for (const url of urls) {
    if (INVITE_REGEX.test(url) && settings.links_invites) return true;
    try {
      const host = new URL(url.startsWith('http') ? url : 'https://' + url)
        .hostname.replace(/^www\./, '');
      if (!wl.some(w => host === w || host.endsWith('.' + w))) return true;
    } catch { return true; }
  }
  return false;
}

function checkWords(content, words) {
  const lower = content.toLowerCase();
  return words.some(w => lower.includes(w));
}

function checkDupes(guildId, userId, content, settings) {
  const key  = `${guildId}:${userId}`;
  const now  = Date.now();
  const wind = settings.dupes_interval * 1000;
  const norm = content.toLowerCase().trim();
  const hist = (dupesTracker.get(key) || []).filter(e => now - e.ts < wind);
  hist.push({ content: norm, ts: now });
  dupesTracker.set(key, hist);
  return hist.filter(e => e.content === norm).length >= settings.dupes_limit;
}

function checkZalgo(content) {
  const m = content.match(ZALGO_REGEX);
  return m && m.length >= 2;
}

function countMentions(message) {
  return message.mentions.users.size + message.mentions.roles.size +
    (message.mentions.everyone ? 1 : 0);
}

function countEmojis(content) {
  return (content.match(EMOJI_REGEX) || []).length;
}

// ── Action executor ───────────────────────────────────────────────────────────
async function enforce(message, rule, baseAction, settings, client) {
  const { guild, member, channel } = message;
  if (!member) return;

  // Strike escalation
  let action = baseAction;
  let strikeCount = 0;
  if (settings.strikes_enabled) {
    strikeCount = db.addAutomodStrike(guild.id, member.id, settings.strikes_decay_hours);
    if      (strikeCount >= settings.strikes_ban_at)     action = 'ban';
    else if (strikeCount >= settings.strikes_kick_at)    action = 'kick';
    else if (strikeCount >= settings.strikes_timeout_at) {
      if (action !== 'ban' && action !== 'kick') action = 'timeout';
    }
  }

  const reason = `[AutoMod] ${rule}${strikeCount > 0 ? ` — strike ${strikeCount}` : ''}`;

  // Delete the message
  await message.delete().catch(() => {});

  // Take action
  try {
    if (action === 'warn') {
      const w = await channel.send({ embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setDescription(`⚠️ ${member} — **${rule}** is not allowed here.`)] });
      setTimeout(() => w.delete().catch(() => {}), 7000);

    } else if (action === 'timeout') {
      const dur = rule === 'spam' ? settings.spam_timeout_dur : settings.strikes_timeout_dur;
      await member.timeout(dur * 1000, reason).catch(() => {});

    } else if (action === 'kick') {
      await member.kick(reason).catch(() => {});

    } else if (action === 'ban') {
      await guild.members.ban(member.id, { reason, deleteMessageSeconds: 86400 }).catch(() => {});
    }
  } catch {}

  // Log to automod log channel
  if (!settings.log_channel) return;
  const logCh = guild.channels.cache.get(settings.log_channel);
  if (!logCh) return;

  const actionColors = { delete: 0x5865F2, warn: 0xFEE75C, timeout: 0xFFA500, kick: 0xED4245, ban: 0xFF0000 };
  const actionLabel  = action.charAt(0).toUpperCase() + action.slice(1);

  const embed = new EmbedBuilder()
    .setColor(actionColors[action] || 0x5865F2)
    .setAuthor({ name: `${member.user.tag} — ${rule}`, iconURL: member.user.displayAvatarURL() })
    .addFields(
      { name: '👤 User',    value: `${member} \`${member.id}\``,    inline: true },
      { name: '📌 Channel', value: `<#${channel.id}>`,              inline: true },
      { name: '⚡ Action',  value: actionLabel + (strikeCount > 0 ? ` (strike ${strikeCount})` : ''), inline: true },
      { name: '💬 Content', value: (message.content || '*[no text]*').slice(0, 512) },
    )
    .setFooter({ text: `Rule: ${rule}` })
    .setTimestamp();

  logCh.send({ embeds: [embed] }).catch(() => {});
}

// ── Event registration ────────────────────────────────────────────────────────
module.exports = (client) => {

  // ── messageCreate: all message-based rules ────────────────────────────────
  client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot || !message.member) return;

    const settings = db.getAutomodSettings(message.guild.id);
    if (!settings.enabled) return;
    if (isExempt(message.member, message.channel.id, settings)) return;

    // Admins + manage guild bypass
    if (message.member.permissions.has('Administrator') ||
        message.member.permissions.has('ManageGuild')) return;

    const content = message.content || '';

    // Spam
    if (settings.spam_enabled && checkSpam(message.guild.id, message.author.id, settings)) {
      return enforce(message, 'Spam', settings.spam_action, settings, client);
    }

    // Zalgo (check early — corrupts other checks)
    if (settings.zalgo_enabled && checkZalgo(content)) {
      return enforce(message, 'Zalgo Text', settings.zalgo_action, settings, client);
    }

    // Caps
    if (settings.caps_enabled && checkCaps(content, settings)) {
      return enforce(message, 'Excessive Caps', settings.caps_action, settings, client);
    }

    // Links
    if (settings.links_enabled && checkLinks(content, settings)) {
      return enforce(message, 'Blocked Link', settings.links_action, settings, client);
    }

    // Words
    if (settings.words_enabled) {
      const words = db.getAutomodWords(message.guild.id);
      if (checkWords(content, words)) {
        return enforce(message, 'Banned Word', settings.words_action, settings, client);
      }
    }

    // Mentions
    if (settings.mentions_enabled && countMentions(message) >= settings.mentions_limit) {
      return enforce(message, 'Mention Spam', settings.mentions_action, settings, client);
    }

    // Emojis
    if (settings.emojis_enabled && countEmojis(content) >= settings.emojis_limit) {
      return enforce(message, 'Emoji Spam', settings.emojis_action, settings, client);
    }

    // Duplicates
    if (settings.dupes_enabled && checkDupes(message.guild.id, message.author.id, content, settings)) {
      return enforce(message, 'Duplicate Message', settings.dupes_action, settings, client);
    }
  });

  // ── guildMemberAdd: new account gate ─────────────────────────────────────
  client.on('guildMemberAdd', async (member) => {
    const settings = db.getAutomodSettings(member.guild.id);
    if (!settings.enabled || !settings.newaccts_enabled) return;

    const ageMs  = Date.now() - member.user.createdTimestamp;
    const ageDays = ageMs / 86400000;
    if (ageDays >= settings.newaccts_min_days) return;

    const reason = `[AutoMod] Account too new (${Math.floor(ageDays)}d old, min ${settings.newaccts_min_days}d)`;

    try {
      // DM the user before kicking/banning
      await member.send({ embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Access Denied')
        .setDescription(`Your account is too new to join **${member.guild.name}**.\nYour account must be at least **${settings.newaccts_min_days} days old**.`)
        .setFooter({ text: 'This is an automated action.' })] }).catch(() => {});

      if (settings.newaccts_action === 'ban') {
        await member.guild.members.ban(member.id, { reason }).catch(() => {});
      } else {
        await member.kick(reason).catch(() => {});
      }
    } catch {}

    // Log
    if (!settings.log_channel) return;
    const logCh = member.guild.channels.cache.get(settings.log_channel);
    if (!logCh) return;

    logCh.send({ embeds: [new EmbedBuilder()
      .setColor(0xED4245)
      .setAuthor({ name: `${member.user.tag} — New Account`, iconURL: member.user.displayAvatarURL() })
      .addFields(
        { name: '👤 User',        value: `${member.user} \`${member.id}\``,                                      inline: true },
        { name: '📅 Account Age', value: `${Math.floor(ageDays)} days`,                                          inline: true },
        { name: '⚡ Action',      value: settings.newaccts_action.charAt(0).toUpperCase() + settings.newaccts_action.slice(1), inline: true },
      )
      .setFooter({ text: 'AutoMod · New Account Gate' })
      .setTimestamp()] }).catch(() => {});
  });

  // ── Periodic cleanup: trim old in-memory entries every 5 min ─────────────
  setInterval(() => {
    const now = Date.now();
    for (const [k, hist] of spamTracker)  { const f = hist.filter(t => now - t < 60000);  if (f.length) spamTracker.set(k, f); else spamTracker.delete(k); }
    for (const [k, hist] of dupesTracker) { const f = hist.filter(e => now - e.ts < 300000); if (f.length) dupesTracker.set(k, f); else dupesTracker.delete(k); }
  }, 300_000);

};
