'use strict';
// Shares the bot's database — path resolved from env or default
const path = require('path');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '../../data/database.db');

const { createRequire } = require('module');
const localRequire = createRequire(require.resolve('../../src/database.js'));

// Re-use the bot's own database module so we share the same connection + helpers
let _db;
try {
  _db = require('../../src/database');
} catch {
  console.warn('[DB] Could not load bot database module, using stub');
  _db = {};
}

const db = _db;

// ── Extra dashboard-only queries ──────────────────────────────────────────────
const { Database } = (() => {
  try { return require('node-sqlite3-wasm'); } catch { return {}; }
})();

let rawDb;
function getRaw() {
  if (rawDb) return rawDb;
  if (!Database) return null;
  try {
    rawDb = new Database(DB_PATH);
    return rawDb;
  } catch (e) {
    console.error('[DB] Failed to open raw DB:', e.message);
    return null;
  }
}

function all(sql, params = []) {
  try {
    const d = getRaw();
    if (!d) return [];
    return d.prepare(sql).all(...params);
  } catch { return []; }
}

function get(sql, params = []) {
  try {
    const d = getRaw();
    if (!d) return null;
    return d.prepare(sql).get(...params);
  } catch { return null; }
}

function run(sql, params = []) {
  try {
    const d = getRaw();
    if (!d) return;
    d.prepare(sql).run(...params);
  } catch (e) { console.error('[DB run]', e.message); }
}

// ── User queries ──────────────────────────────────────────────────────────────
function getUserMessageStats(guildId, userId) {
  return db.getMessageStats?.(guildId, userId) || {
    d1: all(`SELECT count(*) as c FROM message_stats WHERE guild_id=? AND user_id=? AND sent_at > strftime('%s','now','-1 day')`, [guildId, userId])[0]?.c || 0,
    d7: all(`SELECT count(*) as c FROM message_stats WHERE guild_id=? AND user_id=? AND sent_at > strftime('%s','now','-7 days')`, [guildId, userId])[0]?.c || 0,
    d30: all(`SELECT count(*) as c FROM message_stats WHERE guild_id=? AND user_id=? AND sent_at > strftime('%s','now','-30 days')`, [guildId, userId])[0]?.c || 0,
    topChannels: [],
  };
}

function getUserVoiceStats(guildId, userId) {
  return db.getVoiceStats?.(guildId, userId) || { d1: 0, d7: 0, d30: 0 };
}

function getUserRank(guildId, userId) {
  return db.getMessageRank?.(guildId, userId) || null;
}

// ── Admin queries ─────────────────────────────────────────────────────────────
function getGuildSettings(guildId) {
  return get('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]) || {};
}

function setGuildSettings(guildId, fields) {
  const allowed = ['prefix','welcome_channel','welcome_message','log_channel','log_color'];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (!keys.length) return;
  const existing = get('SELECT 1 FROM guild_settings WHERE guild_id = ?', [guildId]);
  if (existing) {
    const set = keys.map(k => `${k} = ?`).join(', ');
    run(`UPDATE guild_settings SET ${set} WHERE guild_id = ?`, [...keys.map(k => fields[k]), guildId]);
  } else {
    run(`INSERT INTO guild_settings (guild_id, ${keys.join(',')}) VALUES (?, ${keys.map(() => '?').join(',')})`, [guildId, ...keys.map(k => fields[k])]);
  }
}

function getModHistory(guildId, limit = 20) {
  return all('SELECT * FROM mod_history WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?', [guildId, limit]);
}

function getWarnings(guildId) {
  return all('SELECT * FROM warnings WHERE guild_id = ? ORDER BY created_at DESC', [guildId]);
}

function getGiveaways(guildId) {
  return all('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY ends_at DESC', [guildId]);
}

function getGiveawayEntryCount(giveawayId) {
  return get('SELECT count(*) as c FROM giveaway_entries WHERE giveaway_id = ?', [giveawayId])?.c || 0;
}

function getAutoresponders(guildId) {
  return all('SELECT * FROM autoresponders WHERE guild_id = ?', [guildId]);
}

function getAntiraid(guildId) {
  return get('SELECT * FROM antiraid WHERE guild_id = ?', [guildId]);
}

function setAntiraid(guildId, fields) {
  const existing = get('SELECT 1 FROM antiraid WHERE guild_id = ?', [guildId]);
  if (existing) {
    run('UPDATE antiraid SET enabled=?, mention_threshold=?, action=?, log_channel=? WHERE guild_id=?',
      [fields.enabled ? 1 : 0, fields.mention_threshold || 5, fields.action || 'timeout', fields.log_channel || null, guildId]);
  } else {
    run('INSERT INTO antiraid (guild_id, enabled, mention_threshold, action, log_channel) VALUES (?,?,?,?,?)',
      [guildId, fields.enabled ? 1 : 0, fields.mention_threshold || 5, fields.action || 'timeout', fields.log_channel || null]);
  }
}

function getTickets(guildId) {
  return all('SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50', [guildId]);
}

function getTicketConfig(guildId) {
  return get('SELECT * FROM ticket_config WHERE guild_id = ?', [guildId]);
}

function getMessageLeaderboard(guildId, limit = 10) {
  return all(`
    SELECT user_id, count(*) as total
    FROM message_stats
    WHERE guild_id = ? AND sent_at > strftime('%s','now','-30 days')
    GROUP BY user_id ORDER BY total DESC LIMIT ?
  `, [guildId, limit]);
}

// ── Owner queries ─────────────────────────────────────────────────────────────
function getGuildCount() {
  return get('SELECT count(DISTINCT guild_id) as c FROM guild_settings')?.c || 0;
}

function getTotalMessages() {
  return get('SELECT count(*) as c FROM message_stats')?.c || 0;
}

function getAllGuildIds() {
  return all('SELECT DISTINCT guild_id FROM guild_settings').map(r => r.guild_id);
}

module.exports = {
  getUserMessageStats, getUserVoiceStats, getUserRank,
  getGuildSettings, setGuildSettings,
  getModHistory, getWarnings, getGiveaways, getGiveawayEntryCount,
  getAutoresponders, getAntiraid, setAntiraid,
  getTickets, getTicketConfig, getMessageLeaderboard,
  getGuildCount, getTotalMessages, getAllGuildIds,
  all, get, run,
};
