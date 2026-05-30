'use strict';

const path = require('path');
const fs = require('fs');

// Owner bypass — always has everything
const OWNER_ID = '1467527738091896986';

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const { Database } = require('node-sqlite3-wasm');
const dbPath = path.join(dataDir, 'nights4.db');
let db;

// ─── WAL → DELETE mode conversion ────────────────────────────────────────────
// Railway persistent volumes don't support the mmap() calls SQLite uses for
// WAL-mode shared memory (.db-shm). Any database file whose header bytes 18-19
// equal 0x02 will fail to open with SQLITE_BUSY — even with zero other processes
// running — because SQLite recreates and tries to mmap the -shm file every open.
//
// Fix: read the 100-byte SQLite header, check bytes 18/19, and if they're 0x02
// (WAL) overwrite them with 0x01 (DELETE/rollback mode) before we ever call
// new Database(). Also delete any leftover -wal/-shm files. This runs once,
// synchronously, at module-load time.
function _convertFromWAL(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  let fd;
  try {
    const stat = fs.statSync(targetPath);
    if (stat.size < 100) return;
    fd = fs.openSync(targetPath, 'r+');
    const hdr = Buffer.alloc(100);
    if (fs.readSync(fd, hdr, 0, 100, 0) < 100) return;
    if (hdr.slice(0, 15).toString('ascii') !== 'SQLite format 3') return;
    const wv = hdr[18], rv = hdr[19];
    if (wv === 2 || rv === 2) {
      console.warn(`[DB] WAL-mode detected in ${path.basename(targetPath)} — converting to DELETE mode`);
      for (const suf of ['-wal', '-shm']) {
        try { fs.unlinkSync(targetPath + suf); } catch (_) {}
      }
      hdr[18] = 1; hdr[19] = 1;
      fs.writeSync(fd, hdr, 0, 100, 0);
    }
  } catch (e) {
    console.warn('[DB] WAL conversion error:', e.message);
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
  }
}

const oldDbPath   = path.join(dataDir, 'nights.db');
const prev2DbPath = path.join(dataDir, 'nights3.db');

// ─── Pre-open restore: raw file copy before ANY SQLite connection opens ───────
// Uses a marker file so this runs exactly once even if nights4.db already has
// schema tables (which makes it >8KB even when empty of real user data).
(function _restoreIfEmpty() {
  const marker = path.join(dataDir, '.restored5');
  if (fs.existsSync(marker)) return; // already ran once, skip

  // Log everything in the data dir so we can see what's available
  try {
    const dirContents = fs.readdirSync(dataDir);
    console.log('[DB] data dir contents:', dirContents);
  } catch (_) {}

  try {
    // Priority: nights4.db.bak.* → nights3.db.bak.* → nights3.db → nights2.db.bak.* → nights2.db → nights.db.bak.* → nights.db
    let src = null;
    try {
      const baks = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('nights4.db.bak.') || f.startsWith('nights3.db.bak.') || f.startsWith('nights2.db.bak.') || f.startsWith('nights.db.bak.'))
        .sort().reverse();
      for (const b of baks) {
        const p = path.join(dataDir, b);
        if (fs.statSync(p).size > 8192) { src = p; break; }
      }
    } catch (_) {}
    if (!src) {
      try {
        if (fs.existsSync(prev2DbPath) && fs.statSync(prev2DbPath).size > 8192) src = prev2DbPath;
      } catch (_) {}
    }
    if (!src) {
      try {
        if (fs.existsSync(oldDbPath) && fs.statSync(oldDbPath).size > 8192) src = oldDbPath;
      } catch (_) {}
    }

    if (!src) {
      console.log('[DB] No restore source found — starting fresh.');
      fs.writeFileSync(marker, '1');
      return;
    }

    _convertFromWAL(src);
    fs.copyFileSync(src, dbPath);
    _convertFromWAL(dbPath);
    fs.writeFileSync(marker, '1');
    console.log(`[DB] Restored data from ${path.basename(src)} → nights4.db`);
  } catch (e) {
    console.warn('[DB] Restore error:', e.message);
  }
})();

// Convert nights4.db from WAL if needed (in case restore wasn't needed but file is WAL)
_convertFromWAL(dbPath);

// ─── Non-blocking async DB init ───────────────────────────────────────────────
function _tryOpenDb(resolve, reject, attempt) {
  // Only on the very first attempt: clean up leftover files from a previous
  // crashed process. Do NOT do this on retries — if the old instance is still
  // running those files are live and deleting them corrupts the database.
  if (attempt === 0) {
    for (const suf of ['-journal', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suf); } catch (_) {}
    }
  }

  let conn;
  try {
    conn = new Database(dbPath);
    conn.run('PRAGMA busy_timeout = 15000');
    conn.run('PRAGMA foreign_keys = ON');
    db = conn;

    const _rawGet = db.get.bind(db);
    const _rawAll = db.all.bind(db);
    db.get = (...a) => _normalizeRow(_rawGet(...a));
    db.all = (...a) => { const r = _rawAll(...a); return Array.isArray(r) ? r.map(_normalizeRow) : r; };

    _runSchema();
    resolve();
  } catch (e) {
    if (conn) { try { conn.close(); } catch (_) {} db = null; }
    if (attempt >= 150) { reject(e); return; }
    // Railway sends SIGTERM to the old instance which closes the DB via closeDb().
    // Just wait — the lock will release within ~10-30s without touching the file.
    if (attempt % 10 === 0) console.warn(`[DB] Waiting for lock… retry ${attempt + 1}/150`);
    setTimeout(() => _tryOpenDb(resolve, reject, attempt + 1), 2000);
  }
}

const _dbReady = new Promise((resolve, reject) => _tryOpenDb(resolve, reject, 0))
  .then(() => {
    setInterval(pruneOldData, 86400 * 1000);
    pruneOldData();
  })
  .catch(err => {
    console.error('[DB] Fatal: could not open database after 150 retries:', err.message);
    process.exit(1);
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

// node-sqlite3-wasm returns large INTEGER columns as BigInt.
// Convert every BigInt back to Number so math/comparisons never throw.
function _normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === 'bigint' ? Number(v) : v;
  }
  return out;
}

function get(sql, params = []) {
  return _normalizeRow(db.get(sql, params));
}

function all(sql, params = []) {
  const rows = db.all(sql, params);
  return Array.isArray(rows) ? rows.map(_normalizeRow) : rows;
}

function run(sql, params = []) {
  return db.run(sql, params);
}

// guild_settings
// ── AutoMod ───────────────────────────────────────────────────────────────────
function getAutomodSettings(guildId) {
  let row = db.get('SELECT * FROM automod_settings WHERE guild_id=?', [guildId]);
  if (!row) {
    db.run('INSERT OR IGNORE INTO automod_settings (guild_id) VALUES (?)', [guildId]);
    row = db.get('SELECT * FROM automod_settings WHERE guild_id=?', [guildId]);
  }
  return row;
}
function setAutomodSettings(guildId, fields) {
  getAutomodSettings(guildId); // ensure row exists
  for (const [k, v] of Object.entries(fields)) {
    db.run(`UPDATE automod_settings SET ${k}=? WHERE guild_id=?`, [v, guildId]);
  }
}
function getAutomodStrikes(guildId, userId) {
  const row = db.get('SELECT * FROM automod_strikes WHERE guild_id=? AND user_id=?', [guildId, userId]);
  return row ? row.count : 0;
}
function addAutomodStrike(guildId, userId, decayHours = 24) {
  const now = Math.floor(Date.now() / 1000);
  const decaySec = decayHours * 3600;
  const row = db.get('SELECT * FROM automod_strikes WHERE guild_id=? AND user_id=?', [guildId, userId]);
  let count = 1;
  if (row) {
    // Decay: if last strike was more than decayHours ago, reset
    count = (now - row.last_at > decaySec) ? 1 : row.count + 1;
    db.run('UPDATE automod_strikes SET count=?, last_at=? WHERE guild_id=? AND user_id=?', [count, now, guildId, userId]);
  } else {
    db.run('INSERT INTO automod_strikes (guild_id, user_id, count, last_at) VALUES (?,?,?,?)', [guildId, userId, 1, now]);
  }
  return count;
}
function clearAutomodStrikes(guildId, userId) {
  db.run('DELETE FROM automod_strikes WHERE guild_id=? AND user_id=?', [guildId, userId]);
}
function getAutomodWords(guildId) {
  const s = getAutomodSettings(guildId);
  try { return JSON.parse(s.words_list || '[]'); } catch { return []; }
}
function addAutomodWord(guildId, word) {
  const words = getAutomodWords(guildId);
  const w = word.toLowerCase().trim();
  if (words.includes(w)) return false;
  words.push(w);
  setAutomodSettings(guildId, { words_list: JSON.stringify(words) });
  return true;
}
function removeAutomodWord(guildId, word) {
  const words = getAutomodWords(guildId);
  const w = word.toLowerCase().trim();
  const idx = words.indexOf(w);
  if (idx === -1) return false;
  words.splice(idx, 1);
  setAutomodSettings(guildId, { words_list: JSON.stringify(words) });
  return true;
}

// guild_settings
function getGuildSettings(guildId) {
  return get('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);
}

function upsertGuildSettings(guildId, fields) {
  const existing = getGuildSettings(guildId);
  if (!existing) {
    run('INSERT INTO guild_settings (guild_id) VALUES (?)', [guildId]);
  }
  for (const [key, val] of Object.entries(fields)) {
    run(`UPDATE guild_settings SET ${key} = ? WHERE guild_id = ?`, [val, guildId]);
  }
}

// warnings
function addWarning(guildId, userId, modId, reason) {
  return run('INSERT INTO warnings (guild_id, user_id, mod_id, reason) VALUES (?, ?, ?, ?)', [guildId, userId, modId, reason]);
}

function getWarnings(guildId, userId) {
  return all('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC', [guildId, userId]);
}

function clearWarnings(guildId, userId) {
  return run('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

// mutes
function addMute(guildId, userId, expiresAt, reason) {
  return run('INSERT OR REPLACE INTO mutes (guild_id, user_id, expires_at, reason) VALUES (?, ?, ?, ?)', [guildId, userId, expiresAt, reason]);
}

function getMute(guildId, userId) {
  return get('SELECT * FROM mutes WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

function removeMute(guildId, userId) {
  return run('DELETE FROM mutes WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

function getExpiredMutes() {
  return all('SELECT * FROM mutes WHERE expires_at IS NOT NULL AND expires_at <= ?', [Math.floor(Date.now() / 1000)]);
}

function getAllMutes(guildId) {
  return all('SELECT * FROM mutes WHERE guild_id = ?', [guildId]);
}

// bans
function addBan(guildId, userId, modId, reason, expiresAt) {
  return run('INSERT OR REPLACE INTO bans (guild_id, user_id, mod_id, reason, expires_at) VALUES (?, ?, ?, ?, ?)', [guildId, userId, modId, reason, expiresAt]);
}

function removeBan(guildId, userId) {
  return run('DELETE FROM bans WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

function getExpiredBans() {
  return all('SELECT * FROM bans WHERE expires_at IS NOT NULL AND expires_at <= ?', [Math.floor(Date.now() / 1000)]);
}

function getAllBans(guildId) {
  return all('SELECT * FROM bans WHERE guild_id = ?', [guildId]);
}

// notes
function addNote(guildId, userId, modId, content) {
  return run('INSERT INTO notes (guild_id, user_id, mod_id, content) VALUES (?, ?, ?, ?)', [guildId, userId, modId, content]);
}

function getNotes(guildId, userId) {
  return all('SELECT * FROM notes WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC', [guildId, userId]);
}

// mod_history
function addHistory(guildId, userId, modId, action, reason, extra) {
  return run('INSERT INTO mod_history (guild_id, user_id, mod_id, action, reason, extra) VALUES (?, ?, ?, ?, ?, ?)', [guildId, userId, modId, action, reason, extra || null]);
}

function getHistory(guildId, userId) {
  return all('SELECT * FROM mod_history WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC', [guildId, userId]);
}

function getModStats(guildId, modId) {
  return all('SELECT action, COUNT(*) as count FROM mod_history WHERE guild_id = ? AND mod_id = ? GROUP BY action', [guildId, modId]);
}

// role_persist
function saveRoles(guildId, userId, roles) {
  return run('INSERT OR REPLACE INTO role_persist (guild_id, user_id, roles) VALUES (?, ?, ?)', [guildId, userId, JSON.stringify(roles)]);
}

function getSavedRoles(guildId, userId) {
  return get('SELECT roles FROM role_persist WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

// temp_roles
function addTempRole(guildId, userId, roleId, expiresAt) {
  return run('INSERT INTO temp_roles (guild_id, user_id, role_id, expires_at) VALUES (?, ?, ?, ?)', [guildId, userId, roleId, expiresAt]);
}

function getExpiredTempRoles() {
  return all('SELECT * FROM temp_roles WHERE expires_at <= ?', [Math.floor(Date.now() / 1000)]);
}

function removeTempRole(id) {
  return run('DELETE FROM temp_roles WHERE id = ?', [id]);
}

function getTempRoles(guildId, userId) {
  return all('SELECT * FROM temp_roles WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

function getAllTempRoles(guildId) {
  return all('SELECT * FROM temp_roles WHERE guild_id = ?', [guildId]);
}

// forced_nicknames
function setForcedNickname(guildId, userId, nickname) {
  return run('INSERT OR REPLACE INTO forced_nicknames (guild_id, user_id, nickname) VALUES (?, ?, ?)', [guildId, userId, nickname]);
}

function getForcedNickname(guildId, userId) {
  return get('SELECT nickname FROM forced_nicknames WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

function removeForcedNickname(guildId, userId) {
  return run('DELETE FROM forced_nicknames WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

function getAllForcedNicknames(guildId) {
  return all('SELECT * FROM forced_nicknames WHERE guild_id = ?', [guildId]);
}

// fake_permissions
function grantFakePerm(guildId, roleId, permission) {
  return run('INSERT OR IGNORE INTO fake_permissions (guild_id, role_id, permission) VALUES (?, ?, ?)', [guildId, roleId, permission]);
}

function removeFakePerm(guildId, roleId, permission) {
  return run('DELETE FROM fake_permissions WHERE guild_id = ? AND role_id = ? AND permission = ?', [guildId, roleId, permission]);
}

function resetFakePerms(guildId, roleId) {
  return run('DELETE FROM fake_permissions WHERE guild_id = ? AND role_id = ?', [guildId, roleId]);
}

function getFakePerms(guildId, roleId) {
  return all('SELECT permission FROM fake_permissions WHERE guild_id = ? AND role_id = ?', [guildId, roleId]);
}

// invoke_mods
function setInvokeMod(guildId, action, message, dmMessage) {
  return run('INSERT OR REPLACE INTO invoke_mods (guild_id, action, message, dm_message) VALUES (?, ?, ?, ?)', [guildId, action, message, dmMessage]);
}

function getInvokeMod(guildId, action) {
  return get('SELECT * FROM invoke_mods WHERE guild_id = ? AND action = ?', [guildId, action]);
}

function removeInvokeMod(guildId, action) {
  return run('DELETE FROM invoke_mods WHERE guild_id = ? AND action = ?', [guildId, action]);
}

// nuke_schedules
function addNukeSchedule(guildId, channelId, intervalMs, nextAt) {
  return run('INSERT INTO nuke_schedules (guild_id, channel_id, interval_ms, next_at) VALUES (?, ?, ?, ?)', [guildId, channelId, intervalMs, nextAt]);
}

function getNukeSchedules(guildId) {
  return all('SELECT * FROM nuke_schedules WHERE guild_id = ?', [guildId]);
}

function removeNukeSchedule(id) {
  return run('DELETE FROM nuke_schedules WHERE id = ?', [id]);
}

// autoresponder
function addAutoresponder(guildId, trigger, response) {
  return run('INSERT OR REPLACE INTO autoresponder (guild_id, trigger, response) VALUES (?, ?, ?)', [guildId, trigger, response]);
}

function removeAutoresponder(guildId, trigger) {
  return run('DELETE FROM autoresponder WHERE guild_id = ? AND trigger = ?', [guildId, trigger]);
}

function getAutoresponders(guildId) {
  return all('SELECT * FROM autoresponder WHERE guild_id = ?', [guildId]);
}

function clearAutoresponders(guildId) {
  return run('DELETE FROM autoresponder WHERE guild_id = ?', [guildId]);
}

// reactions
function addReaction(guildId, trigger, emoji) {
  return run('INSERT OR IGNORE INTO reactions (guild_id, trigger, emoji) VALUES (?, ?, ?)', [guildId, trigger, emoji]);
}

function removeReaction(guildId, trigger, emoji) {
  return run('DELETE FROM reactions WHERE guild_id = ? AND trigger = ? AND emoji = ?', [guildId, trigger, emoji]);
}

function deleteAllReactions(guildId) {
  return run('DELETE FROM reactions WHERE guild_id = ?', [guildId]);
}

function getReactions(guildId) {
  return all('SELECT * FROM reactions WHERE guild_id = ?', [guildId]);
}

// channel_autoreact
function addChannelAutoreact(guildId, channelId, emoji) {
  return run('INSERT OR IGNORE INTO channel_autoreact (guild_id, channel_id, emoji) VALUES (?, ?, ?)', [guildId, channelId, emoji]);
}

function removeChannelAutoreact(guildId, channelId, emoji) {
  if (emoji) return run('DELETE FROM channel_autoreact WHERE guild_id = ? AND channel_id = ? AND emoji = ?', [guildId, channelId, emoji]);
  return run('DELETE FROM channel_autoreact WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

function getChannelAutoreacts(guildId, channelId) {
  return all('SELECT * FROM channel_autoreact WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

function getAllChannelAutoreacts(guildId) {
  return all('SELECT * FROM channel_autoreact WHERE guild_id = ?', [guildId]);
}

// giveaway_rigged
function setRiggedWinners(giveawayId, userIds) {
  return run('INSERT OR REPLACE INTO giveaway_rigged (giveaway_id, user_ids) VALUES (?, ?)', [giveawayId, JSON.stringify(userIds)]);
}
function getRiggedWinners(giveawayId) {
  const row = get('SELECT user_ids FROM giveaway_rigged WHERE giveaway_id = ?', [giveawayId]);
  return row ? JSON.parse(row.user_ids) : [];
}
function clearRiggedWinners(giveawayId) {
  return run('DELETE FROM giveaway_rigged WHERE giveaway_id = ?', [giveawayId]);
}

// reaction_messages
function addReactionMessage(guildId, messageId, emoji, roleId) {
  return run('INSERT OR REPLACE INTO reaction_messages (guild_id, message_id, emoji, role_id) VALUES (?, ?, ?, ?)', [guildId, messageId, emoji, roleId]);
}

function removeReactionMessage(guildId, messageId, emoji) {
  return run('DELETE FROM reaction_messages WHERE guild_id = ? AND message_id = ? AND emoji = ?', [guildId, messageId, emoji]);
}

function getReactionMessage(guildId, messageId, emoji) {
  return get('SELECT * FROM reaction_messages WHERE guild_id = ? AND message_id = ? AND emoji = ?', [guildId, messageId, emoji]);
}

function getReactionMessages(guildId) {
  return all('SELECT * FROM reaction_messages WHERE guild_id = ?', [guildId]);
}

// giveaways
function createGiveaway(data) {
  return run(
    'INSERT INTO giveaways (guild_id, channel_id, host_id, prize, winners, ends_at, required_roles, blacklisted_roles, min_level, max_level, stay_in_server, color, voice_channel, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [data.guild_id, data.channel_id, data.host_id, data.prize, data.winners, data.ends_at, data.required_roles || '[]', data.blacklisted_roles || '[]', data.min_level || 0, data.max_level || null, data.stay_in_server || 0, data.color || '#FFD700', data.voice_channel || null, data.image_url || null]
  );
}

// giveaway entries
function addEntry(giveawayId, userId) {
  return run('INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)', [giveawayId, userId]);
}

function removeEntry(giveawayId, userId) {
  return run('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?', [giveawayId, userId]);
}

function hasEntry(giveawayId, userId) {
  return !!get('SELECT 1 FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?', [giveawayId, userId]);
}

function getEntries(giveawayId) {
  return all('SELECT * FROM giveaway_entries WHERE giveaway_id = ?', [giveawayId]);
}

function getEntryCount(giveawayId) {
  const row = get('SELECT COUNT(*) AS cnt FROM giveaway_entries WHERE giveaway_id = ?', [giveawayId]);
  return row?.cnt ?? 0;
}

function updateGiveawayMessageId(id, messageId) {
  return run('UPDATE giveaways SET message_id = ? WHERE id = ?', [messageId, id]);
}

function getGiveaway(id) {
  return get('SELECT * FROM giveaways WHERE id = ?', [id]);
}

function getGiveawayByMessage(messageId) {
  return get('SELECT * FROM giveaways WHERE message_id = ?', [messageId]);
}

function getActiveGiveaways(guildId) {
  return all('SELECT * FROM giveaways WHERE guild_id = ? AND ended = 0 AND cancelled = 0', [guildId]);
}

function getExpiredGiveaways() {
  return all('SELECT * FROM giveaways WHERE ended = 0 AND cancelled = 0 AND ends_at <= ?', [Math.floor(Date.now() / 1000)]);
}
function getEndedGiveaways(guildId, limit = 10) {
  return all('SELECT * FROM giveaways WHERE guild_id = ? AND ended = 1 ORDER BY ends_at DESC LIMIT ?', [guildId, limit]);
}

function endGiveaway(id) {
  return run('UPDATE giveaways SET ended = 1 WHERE id = ?', [id]);
}

function cancelGiveaway(id) {
  return run('UPDATE giveaways SET cancelled = 1 WHERE id = ?', [id]);
}

function updateGiveaway(id, fields) {
  for (const [key, val] of Object.entries(fields)) {
    run(`UPDATE giveaways SET ${key} = ? WHERE id = ?`, [val, id]);
  }
}

// sticky_messages
function setStickyMessage(guildId, channelId, content, name = null, interval = 25) {
  return run('INSERT INTO sticky_messages (guild_id, channel_id, content, name, interval) VALUES (?, ?, ?, ?, ?)', [guildId, channelId, content, name, interval]);
}

function updateStickyLastMessage(id, msgId) {
  return run('UPDATE sticky_messages SET last_message_id = ? WHERE id = ?', [msgId, id]);
}

function getStickiesForChannel(guildId, channelId) {
  return all('SELECT * FROM sticky_messages WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

function getStickyMessage(guildId, channelId) {
  return get('SELECT * FROM sticky_messages WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

function removeStickyMessage(guildId, channelId, name = null) {
  if (name) return run('DELETE FROM sticky_messages WHERE guild_id = ? AND channel_id = ? AND name = ?', [guildId, channelId, name]);
  return run('DELETE FROM sticky_messages WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

function removeStickyById(id) {
  return run('DELETE FROM sticky_messages WHERE id = ?', [id]);
}

function getAllStickyMessages(guildId) {
  return all('SELECT * FROM sticky_messages WHERE guild_id = ?', [guildId]);
}

// snipes
function setSnipe(guildId, channelId, content, authorId, authorTag, authorAvatar, type) {
  return run('INSERT OR REPLACE INTO snipes (guild_id, channel_id, content, author_id, author_tag, author_avatar, deleted_at, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [guildId, channelId, content, authorId, authorTag, authorAvatar, Math.floor(Date.now() / 1000), type]);
}

function getSnipe(guildId, channelId, type) {
  return get('SELECT * FROM snipes WHERE guild_id = ? AND channel_id = ? AND type = ?', [guildId, channelId, type]);
}

function clearSnipe(guildId, channelId) {
  return run('DELETE FROM snipes WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

// aliases
function addAlias(guildId, alias, command) {
  return run('INSERT OR REPLACE INTO aliases (guild_id, alias, command) VALUES (?, ?, ?)', [guildId, alias, command]);
}

function removeAlias(guildId, alias) {
  return run('DELETE FROM aliases WHERE guild_id = ? AND alias = ?', [guildId, alias]);
}

function getAlias(guildId, alias) {
  return get('SELECT * FROM aliases WHERE guild_id = ? AND alias = ?', [guildId, alias]);
}

function getAllAliases(guildId) {
  return all('SELECT * FROM aliases WHERE guild_id = ?', [guildId]);
}

function removeAllAliases(guildId) {
  return run('DELETE FROM aliases WHERE guild_id = ?', [guildId]);
}

// webhooks
function addWebhook(id, guildId, channelId, webhookUrl, name) {
  return run('INSERT OR REPLACE INTO webhooks (id, guild_id, channel_id, webhook_url, name) VALUES (?, ?, ?, ?, ?)', [id, guildId, channelId, webhookUrl, name]);
}

function removeWebhook(id) {
  return run('DELETE FROM webhooks WHERE id = ?', [id]);
}

function getWebhooks(guildId) {
  return all('SELECT * FROM webhooks WHERE guild_id = ?', [guildId]);
}

function getWebhooksByChannel(guildId, channelId) {
  return all('SELECT * FROM webhooks WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

// afk
function setAfk(guildId, userId, reason) {
  return run('INSERT OR REPLACE INTO afk (guild_id, user_id, reason) VALUES (?, ?, ?)', [guildId, userId, reason]);
}

function getAfk(guildId, userId) {
  return get('SELECT * FROM afk WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

function removeAfk(guildId, userId) {
  return run('DELETE FROM afk WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

// wallets
function getWallet(userId) {
  return get('SELECT * FROM wallets WHERE user_id = ?', [userId]);
}

function createWallet(userId, address, keyHash, wifEncrypted, publicKey) {
  return run('INSERT INTO wallets (user_id, address, key_hash, wif_encrypted, public_key) VALUES (?, ?, ?, ?, ?)', [userId, address, keyHash, wifEncrypted, publicKey]);
}

function updateWalletKey(userId, keyHash) {
  return run('UPDATE wallets SET key_hash = ? WHERE user_id = ?', [keyHash, userId]);
}

// wallet_tos
function hasTos(userId) {
  return get('SELECT * FROM wallet_tos WHERE user_id = ?', [userId]);
}

function acceptTos(userId) {
  return run('INSERT OR REPLACE INTO wallet_tos (user_id) VALUES (?)', [userId]);
}

// wallet_transactions
function addWalletTx(userId, type, amount, address, txid, status) {
  return run('INSERT INTO wallet_transactions (user_id, type, amount, address, txid, status) VALUES (?, ?, ?, ?, ?, ?)', [userId, type, amount, address, txid, status]);
}

function getWalletTxs(userId) {
  return all('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', [userId]);
}

// wallet_ratelimits
function getWalletRateLimit(userId) {
  return get('SELECT last_send FROM wallet_ratelimits WHERE user_id = ?', [userId]);
}

function setWalletRateLimit(userId) {
  return run('INSERT OR REPLACE INTO wallet_ratelimits (user_id, last_send) VALUES (?, ?)', [userId, Math.floor(Date.now() / 1000)]);
}

// stock_watchlist
function addStock(guildId, userId, symbol) {
  return run('INSERT OR IGNORE INTO stock_watchlist (guild_id, user_id, symbol) VALUES (?, ?, ?)', [guildId, userId, symbol]);
}

function removeStock(guildId, userId, symbol) {
  return run('DELETE FROM stock_watchlist WHERE guild_id = ? AND user_id = ? AND symbol = ?', [guildId, userId, symbol]);
}

function getStocks(guildId, userId) {
  return all('SELECT symbol FROM stock_watchlist WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

// stock_options
function addStockOption(guildId, userId, symbol, type, strike, expiry, quantity) {
  return run('INSERT INTO stock_options (guild_id, user_id, symbol, type, strike, expiry, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)', [guildId, userId, symbol, type, strike, expiry, quantity]);
}

function getStockOptions(guildId, userId) {
  return all('SELECT * FROM stock_options WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

// payment_addresses
function setPaymentAddress(userId, coin, address) {
  return run('INSERT OR REPLACE INTO payment_addresses (user_id, coin, address) VALUES (?, ?, ?)', [userId, coin, address]);
}

function getPaymentAddress(userId, coin) {
  return get('SELECT address FROM payment_addresses WHERE user_id = ? AND coin = ?', [userId, coin]);
}

function getPaymentAddresses(userId) {
  return all('SELECT * FROM payment_addresses WHERE user_id = ?', [userId]);
}

// paypal_settings
function setPaypal(userId, email, embedTitle, embedDescription, embedColor) {
  return run('INSERT OR REPLACE INTO paypal_settings (user_id, email, embed_title, embed_description, embed_color) VALUES (?, ?, ?, ?, ?)', [userId, email, embedTitle, embedDescription, embedColor]);
}

function getPaypal(userId) {
  return get('SELECT * FROM paypal_settings WHERE user_id = ?', [userId]);
}

// sellauth_settings
function setSellAuth(userId, apiKey, shopId, productId, variantId) {
  return run('INSERT OR REPLACE INTO sellauth_settings (user_id, api_key, shop_id, product_id, variant_id) VALUES (?, ?, ?, ?, ?)', [userId, apiKey, shopId, productId, variantId]);
}

function getSellAuth(userId) {
  return get('SELECT * FROM sellauth_settings WHERE user_id = ?', [userId]);
}

function updateSellAuth(userId, fields) {
  const existing = getSellAuth(userId);
  if (!existing) return;
  for (const [key, val] of Object.entries(fields)) {
    run(`UPDATE sellauth_settings SET ${key} = ? WHERE user_id = ?`, [val, userId]);
  }
}

// vouch_settings
function setVouch(userId, targetUserId) {
  const e = get('SELECT * FROM vouch_settings WHERE user_id = ?', [userId]);
  if (e) run('UPDATE vouch_settings SET target_user_id = ? WHERE user_id = ?', [targetUserId, userId]);
  else run('INSERT INTO vouch_settings (user_id, target_user_id) VALUES (?, ?)', [userId, targetUserId]);
}

function setVouchExch(userId, exchangeUserId) {
  const e = get('SELECT * FROM vouch_settings WHERE user_id = ?', [userId]);
  if (e) run('UPDATE vouch_settings SET exchange_user_id = ? WHERE user_id = ?', [exchangeUserId, userId]);
  else run('INSERT INTO vouch_settings (user_id, exchange_user_id) VALUES (?, ?)', [userId, exchangeUserId]);
}

function getVouch(userId) {
  return get('SELECT * FROM vouch_settings WHERE user_id = ?', [userId]);
}

// ticket_settings
function getTicketSettings(guildId) {
  return get('SELECT * FROM ticket_settings WHERE guild_id = ?', [guildId]);
}

function upsertTicketSettings(guildId, fields) {
  const existing = getTicketSettings(guildId);
  if (!existing) run('INSERT INTO ticket_settings (guild_id) VALUES (?)', [guildId]);
  for (const [key, val] of Object.entries(fields)) {
    run(`UPDATE ticket_settings SET ${key} = ? WHERE guild_id = ?`, [val, guildId]);
  }
}

function incrementTicketCount(guildId) {
  run('UPDATE ticket_settings SET ticket_count = ticket_count + 1 WHERE guild_id = ?', [guildId]);
}

// tickets
function createTicket(guildId, channelId, userId, ticketNumber) {
  return run('INSERT INTO tickets (guild_id, channel_id, user_id, ticket_number) VALUES (?, ?, ?, ?)', [guildId, channelId, userId, ticketNumber]);
}

function getTicketByChannel(channelId) {
  return get('SELECT * FROM tickets WHERE channel_id = ?', [channelId]);
}

function closeTicket(channelId) {
  return run('UPDATE tickets SET status = ?, closed_at = ? WHERE channel_id = ?', ['closed', Math.floor(Date.now() / 1000), channelId]);
}

function createTicketFull(guildId, channelId, userId, ticketNumber, categoryName) {
  return run(
    'INSERT INTO tickets (guild_id, channel_id, user_id, ticket_number, category_name) VALUES (?, ?, ?, ?, ?)',
    [guildId, channelId, userId, ticketNumber, categoryName || null]
  );
}

function claimTicket(channelId, userId) {
  return run('UPDATE tickets SET claimed_by = ? WHERE channel_id = ?', [userId, channelId]);
}

function updateTicketOpenMessage(channelId, messageId) {
  return run('UPDATE tickets SET open_message_id = ? WHERE channel_id = ?', [messageId, channelId]);
}

function closeTicketWithDetails(channelId, closeReason) {
  return run(
    'UPDATE tickets SET status = ?, closed_at = ?, close_reason = ? WHERE channel_id = ?',
    ['closed', Math.floor(Date.now() / 1000), closeReason || null, channelId]
  );
}

// ticket_categories
function getTicketCategories(guildId) {
  return all('SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY id ASC', [guildId]);
}

function getTicketCategory(guildId, name) {
  return get('SELECT * FROM ticket_categories WHERE guild_id = ? AND name = ?', [guildId, name]);
}

function addTicketCategory(guildId, name, description, emoji, discordCategoryId) {
  return run(
    'INSERT INTO ticket_categories (guild_id, name, description, emoji, discord_category_id) VALUES (?, ?, ?, ?, ?)',
    [guildId, name, description || null, emoji || null, discordCategoryId]
  );
}

function removeTicketCategory(guildId, name) {
  return run('DELETE FROM ticket_categories WHERE guild_id = ? AND name = ?', [guildId, name]);
}

// ticket_transcripts
function saveTranscript(token, guildId, channelId, ticketNumber, content) {
  return run(
    'INSERT INTO ticket_transcripts (token, guild_id, channel_id, ticket_number, content) VALUES (?, ?, ?, ?, ?)',
    [token, guildId, channelId, ticketNumber, content]
  );
}

function getTranscript(token) {
  return get('SELECT * FROM ticket_transcripts WHERE token = ?', [token]);
}

// ticket_watcher
function setTicketWatcher(guildId, categoryId, type, data) {
  return run('INSERT OR REPLACE INTO ticket_watcher (guild_id, category_id, type, title, description, color, button_label, button_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [guildId, categoryId, type, data.title, data.description, data.color, data.button_label, data.button_url]);
}

function removeTicketWatcher(guildId, categoryId, type) {
  if (type) return run('DELETE FROM ticket_watcher WHERE guild_id = ? AND category_id = ? AND type = ?', [guildId, categoryId, type]);
  return run('DELETE FROM ticket_watcher WHERE guild_id = ? AND category_id = ?', [guildId, categoryId]);
}

function getTicketWatchers(guildId) {
  return all('SELECT * FROM ticket_watcher WHERE guild_id = ?', [guildId]);
}

function getTicketWatcher(guildId, categoryId, type) {
  return get('SELECT * FROM ticket_watcher WHERE guild_id = ? AND category_id = ? AND type = ?', [guildId, categoryId, type]);
}

function getTicketWatchersByCategory(guildId, categoryId) {
  return all('SELECT * FROM ticket_watcher WHERE guild_id = ? AND category_id = ?', [guildId, categoryId]);
}

// antiraid_settings
function getAntiraid(guildId) {
  return get('SELECT * FROM antiraid_settings WHERE guild_id = ?', [guildId]);
}

function upsertAntiraid(guildId, fields) {
  const existing = getAntiraid(guildId);
  if (!existing) run('INSERT INTO antiraid_settings (guild_id) VALUES (?)', [guildId]);
  for (const [key, val] of Object.entries(fields)) {
    run(`UPDATE antiraid_settings SET ${key} = ? WHERE guild_id = ?`, [val, guildId]);
  }
}

// autoping
function addAutoping(guildId, channelId, deleteAfter) {
  return run('INSERT OR REPLACE INTO autoping (guild_id, channel_id, delete_after, enabled) VALUES (?, ?, ?, 1)', [guildId, channelId, deleteAfter]);
}

function removeAutoping(guildId, channelId) {
  return run('DELETE FROM autoping WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
}

function getAutopings(guildId) {
  return all('SELECT * FROM autoping WHERE guild_id = ?', [guildId]);
}

function toggleAutoping(guildId, channelId) {
  const row = get('SELECT enabled FROM autoping WHERE guild_id = ? AND channel_id = ?', [guildId, channelId]);
  if (!row) return null;
  run('UPDATE autoping SET enabled = ? WHERE guild_id = ? AND channel_id = ?', [row.enabled ? 0 : 1, guildId, channelId]);
  return !row.enabled;
}

function clearAutopings(guildId) {
  return run('DELETE FROM autoping WHERE guild_id = ?', [guildId]);
}

// deposit_monitors
function addDepositMonitor(userId, address, coin, channelId, expiresAt) {
  return run('INSERT INTO deposit_monitors (user_id, address, coin, channel_id, expires_at) VALUES (?, ?, ?, ?, ?)', [userId, address, coin, channelId, expiresAt]);
}

function getActiveDepositMonitors() {
  return all('SELECT * FROM deposit_monitors WHERE notified = 0 AND expires_at > ?', [Math.floor(Date.now() / 1000)]);
}

function updateDepositMonitor(id, lastBalance) {
  return run('UPDATE deposit_monitors SET last_balance = ? WHERE id = ?', [lastBalance, id]);
}

function markDepositNotified(id) {
  return run('UPDATE deposit_monitors SET notified = 1 WHERE id = ?', [id]);
}

// message_stats
function trackMessage(guildId, userId, channelId, channelName) {
  run('INSERT INTO message_stats (guild_id, user_id, channel_id, sent_at) VALUES (?, ?, ?, ?)',
    [guildId, userId, channelId, Math.floor(Date.now() / 1000)]);
  if (channelName) {
    run('INSERT OR REPLACE INTO channel_name_cache (channel_id, name) VALUES (?, ?)',
      [channelId, channelName]);
  }
}

function getCachedChannelName(channelId) {
  return get('SELECT name FROM channel_name_cache WHERE channel_id = ?', [channelId])?.name ?? null;
}

function getMessageStats(guildId, userId) {
  const now = Math.floor(Date.now() / 1000);
  const d1  = now - 86400;
  const d7  = now - 86400 * 7;
  const d30 = now - 86400 * 30;
  return {
    d1:  (get('SELECT COUNT(*) as c FROM message_stats WHERE guild_id=? AND user_id=? AND sent_at>=?', [guildId, userId, d1])?.c  || 0),
    d7:  (get('SELECT COUNT(*) as c FROM message_stats WHERE guild_id=? AND user_id=? AND sent_at>=?', [guildId, userId, d7])?.c  || 0),
    d30: (get('SELECT COUNT(*) as c FROM message_stats WHERE guild_id=? AND user_id=? AND sent_at>=?', [guildId, userId, d30])?.c || 0),
    topChannels: all(
      'SELECT channel_id, COUNT(*) as cnt FROM message_stats WHERE guild_id=? AND user_id=? AND sent_at>=? GROUP BY channel_id ORDER BY cnt DESC LIMIT 3',
      [guildId, userId, d30]
    ),
  };
}

function getMessageRank(guildId, userId) {
  const d30 = Math.floor(Date.now() / 1000) - 86400 * 30;
  const rows = all(
    'SELECT user_id, COUNT(*) as cnt FROM message_stats WHERE guild_id=? AND sent_at>=? GROUP BY user_id ORDER BY cnt DESC',
    [guildId, d30]
  );
  const idx = rows.findIndex(r => r.user_id === userId);
  return idx === -1 ? null : idx + 1;
}

function getMessageLeaderboard(guildId, period = '30d', limit = 10) {
  const periods = { '1d': 86400, '7d': 86400 * 7, '30d': 86400 * 30 };
  const secs = periods[period] ?? periods['30d'];
  const since = Math.floor(Date.now() / 1000) - secs;
  return all(
    'SELECT user_id, COUNT(*) as cnt FROM message_stats WHERE guild_id=? AND sent_at>=? GROUP BY user_id ORDER BY cnt DESC LIMIT ?',
    [guildId, since, limit]
  );
}

// voice_stats
function trackVoiceJoin(guildId, userId) {
  return run('INSERT INTO voice_stats (guild_id, user_id, joined_at) VALUES (?, ?, ?)',
    [guildId, userId, Math.floor(Date.now() / 1000)]);
}

function trackVoiceLeave(guildId, userId) {
  const row = get('SELECT rowid FROM voice_stats WHERE guild_id=? AND user_id=? AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1', [guildId, userId]);
  if (row) run('UPDATE voice_stats SET left_at=? WHERE rowid=?', [Math.floor(Date.now() / 1000), row.rowid]);
}

function getVoiceStats(guildId, userId) {
  const now = Math.floor(Date.now() / 1000);
  function hoursIn(since) {
    const rows = all(
      'SELECT joined_at, left_at FROM voice_stats WHERE guild_id=? AND user_id=? AND joined_at>=?',
      [guildId, userId, since]
    );
    let secs = 0;
    for (const r of rows) secs += (r.left_at || now) - r.joined_at;
    return secs / 3600;
  }
  return {
    d1:  hoursIn(now - 86400),
    d7:  hoursIn(now - 86400 * 7),
    d30: hoursIn(now - 86400 * 30),
  };
}

// prefix
function getPrefix(guildId) {
  const row = get('SELECT prefix FROM guild_settings WHERE guild_id = ?', [guildId]);
  return row?.prefix || ',';
}

function setPrefix(guildId, prefix) {
  upsertGuildSettings(guildId, { prefix });
}

// welcome_settings
function getWelcomeSettings(guildId) {
  return get('SELECT * FROM welcome_settings WHERE guild_id = ?', [guildId]);
}

function upsertWelcomeSettings(guildId, fields) {
  const existing = getWelcomeSettings(guildId);
  if (!existing) run('INSERT INTO welcome_settings (guild_id) VALUES (?)', [guildId]);
  for (const [key, val] of Object.entries(fields)) {
    run(`UPDATE welcome_settings SET ${key} = ? WHERE guild_id = ?`, [val, guildId]);
  }
}

// ── panels ────────────────────────────────────────────────────────────────────
function setPanel(id, guildId, messageId, optionsJson) {
  run('INSERT OR REPLACE INTO panels (id, guild_id, message_id, options_json) VALUES (?, ?, ?, ?)',
    [id, guildId, messageId, optionsJson]);
}

function getPanel(id) {
  return get('SELECT * FROM panels WHERE id = ?', [id]);
}

function deletePanel(id) {
  run('DELETE FROM panels WHERE id = ?', [id]);
}

// Auto-cleanup old stats to prevent disk bloat (runs every 24h)
function pruneOldData() {
  const cutoff30 = Math.floor(Date.now() / 1000) - 86400 * 30;
  const cutoff7  = Math.floor(Date.now() / 1000) - 86400 * 7;
  try {
    run('DELETE FROM message_stats WHERE sent_at < ?', [cutoff30]);
    run('DELETE FROM voice_stats WHERE joined_at < ?', [cutoff30]);
    run('DELETE FROM mod_history WHERE created_at < ?', [cutoff30]);
    run('DELETE FROM snipes WHERE deleted_at < ?', [cutoff7]);
    run('DELETE FROM deposit_monitors WHERE expires_at < ?', [Math.floor(Date.now() / 1000)]);
    db.run('VACUUM');
  } catch (e) {
    console.error('[DB] Prune error:', e.message);
  }
}

// ─── Tags ─────────────────────────────────────────────────────────────────────
function createTag(guildId, name, content, createdBy) {
  return run('INSERT INTO tags (guild_id, name, content, created_by) VALUES (?, ?, ?, ?)', [guildId, name.toLowerCase(), content, createdBy]);
}
function getTag(guildId, name) {
  return get('SELECT * FROM tags WHERE guild_id=? AND name=?', [guildId, name.toLowerCase()]);
}
function deleteTag(guildId, name) {
  return run('DELETE FROM tags WHERE guild_id=? AND name=?', [guildId, name.toLowerCase()]);
}
function listTags(guildId) {
  return all('SELECT * FROM tags WHERE guild_id=? ORDER BY uses DESC', [guildId]);
}
function incrementTagUses(guildId, name) {
  return run('UPDATE tags SET uses=uses+1 WHERE guild_id=? AND name=?', [guildId, name.toLowerCase()]);
}
function editTag(guildId, name, content) {
  return run('UPDATE tags SET content=? WHERE guild_id=? AND name=?', [content, guildId, name.toLowerCase()]);
}

// ─── Levels / XP ─────────────────────────────────────────────────────────────
function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

function cumulativeXpForLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpForLevel(i);
  return total;
}

function levelFromXp(totalXp) {
  let level = 0;
  while (totalXp >= cumulativeXpForLevel(level + 1)) level++;
  return level;
}

function getUserLevel(guildId, userId) {
  return get('SELECT * FROM user_levels WHERE guild_id=? AND user_id=?', [guildId, userId]);
}

function getLevelRank(guildId, userId) {
  const rows = all('SELECT user_id FROM user_levels WHERE guild_id=? ORDER BY xp DESC', [guildId]);
  const idx = rows.findIndex(r => r.user_id === userId);
  return { rank: idx === -1 ? null : idx + 1, total: rows.length };
}

function getLevelLeaderboard(guildId, limit = 10) {
  return all('SELECT * FROM user_levels WHERE guild_id=? ORDER BY xp DESC LIMIT ?', [guildId, limit]);
}

function addXp(guildId, userId, amount) {
  const XP_COOLDOWN = 60;
  const now = Math.floor(Date.now() / 1000);
  let row = get('SELECT * FROM user_levels WHERE guild_id=? AND user_id=?', [guildId, userId]);
  if (!row) {
    run('INSERT INTO user_levels (guild_id, user_id, xp, level, last_xp_at) VALUES (?, ?, 0, 0, 0)', [guildId, userId]);
    row = { guild_id: guildId, user_id: userId, xp: 0, level: 0, last_xp_at: 0 };
  }
  if (now - row.last_xp_at < XP_COOLDOWN) return { leveled: false, newLevel: row.level };

  const newXp = row.xp + amount;
  const oldLevel = row.level;
  const newLevel = levelFromXp(newXp);
  const leveled = newLevel > oldLevel;

  run('UPDATE user_levels SET xp=?, level=?, last_xp_at=? WHERE guild_id=? AND user_id=?',
    [newXp, newLevel, now, guildId, userId]);

  return { leveled, newLevel, newXp };
}

function setUserXp(guildId, userId, xp) {
  const level = levelFromXp(xp);
  run('INSERT OR REPLACE INTO user_levels (guild_id, user_id, xp, level, last_xp_at) VALUES (?, ?, ?, ?, ?)',
    [guildId, userId, xp, level, 0]);
}

function resetUserLevel(guildId, userId) {
  run('DELETE FROM user_levels WHERE guild_id=? AND user_id=?', [guildId, userId]);
}

function getLevelSettings(guildId) {
  return get('SELECT * FROM level_settings WHERE guild_id=?', [guildId]);
}

function upsertLevelSettings(guildId, patch) {
  const cols = Object.keys(patch).map(k => `${k}=excluded.${k}`).join(', ');
  const keys = ['guild_id', ...Object.keys(patch)];
  const vals = [guildId, ...Object.values(patch)];
  run(`INSERT INTO level_settings (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})
       ON CONFLICT(guild_id) DO UPDATE SET ${cols}`, vals);
}

// ─── Economy ──────────────────────────────────────────────────────────────────
function ensureEco(guildId, userId) {
  const row = db.get('SELECT 1 FROM economy WHERE guild_id=? AND user_id=?', [guildId, userId]);
  if (!row) db.run('INSERT INTO economy (guild_id, user_id) VALUES (?, ?)', [guildId, userId]);
}
function getEco(guildId, userId) {
  ensureEco(guildId, userId);
  return db.get('SELECT * FROM economy WHERE guild_id=? AND user_id=?', [guildId, userId]);
}
function addWallet(guildId, userId, amount) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET wallet=MAX(0,wallet+?), total_earned=total_earned+MAX(0,?) WHERE guild_id=? AND user_id=?',
    [amount, amount, guildId, userId]);
}
function setWallet(guildId, userId, amount) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET wallet=MAX(0,?) WHERE guild_id=? AND user_id=?', [amount, guildId, userId]);
}
function deposit(guildId, userId, amount) {
  const eco = getEco(guildId, userId);
  const amt = Math.min(amount, eco.wallet);
  db.run('UPDATE economy SET wallet=wallet-?, bank=bank+? WHERE guild_id=? AND user_id=?', [amt, amt, guildId, userId]);
  return amt;
}
function withdraw(guildId, userId, amount) {
  const eco = getEco(guildId, userId);
  const amt = Math.min(amount, eco.bank);
  db.run('UPDATE economy SET bank=bank-?, wallet=wallet+? WHERE guild_id=? AND user_id=?', [amt, amt, guildId, userId]);
  return amt;
}
function transfer(guildId, fromId, toId, amount) {
  const from = getEco(guildId, fromId);
  if (from.wallet < amount) return false;
  db.run('UPDATE economy SET wallet=wallet-? WHERE guild_id=? AND user_id=?', [amount, guildId, fromId]);
  addWallet(guildId, toId, amount);
  return true;
}
function getEcoLeaderboard(guildId, limit = 10) {
  return db.all('SELECT user_id, wallet+bank AS total, wallet, bank FROM economy WHERE guild_id=? ORDER BY total DESC LIMIT ?', [guildId, limit]);
}
function setDailyAt(guildId, userId, ts) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET daily_at=? WHERE guild_id=? AND user_id=?', [ts, guildId, userId]);
}
function setWorkAt(guildId, userId, ts) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET work_at=? WHERE guild_id=? AND user_id=?', [ts, guildId, userId]);
}
function setRobAt(guildId, userId, ts) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET rob_at=? WHERE guild_id=? AND user_id=?', [ts, guildId, userId]);
}
function setCrimeAt(guildId, userId, ts) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET crime_at=? WHERE guild_id=? AND user_id=?', [ts, guildId, userId]);
}
function setBegAt(guildId, userId, ts) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET beg_at=? WHERE guild_id=? AND user_id=?', [ts, guildId, userId]);
}
function setInvestAt(guildId, userId, ts) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET invest_at=? WHERE guild_id=? AND user_id=?', [ts, guildId, userId]);
}
function setFishAt(guildId, userId, ts) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET fish_at=? WHERE guild_id=? AND user_id=?', [ts, guildId, userId]);
}
function setHuntAt(guildId, userId, ts) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET hunt_at=? WHERE guild_id=? AND user_id=?', [ts, guildId, userId]);
}
function setMineAt(guildId, userId, ts) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET mine_at=? WHERE guild_id=? AND user_id=?', [ts, guildId, userId]);
}
function setScratchAt(guildId, userId, ts) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET scratch_at=? WHERE guild_id=? AND user_id=?', [ts, guildId, userId]);
}
function setCfAt(guildId, userId, ts) {
  ensureEco(guildId, userId);
  db.run('UPDATE economy SET cf_at=? WHERE guild_id=? AND user_id=?', [ts, guildId, userId]);
}
function getEcoSettings(guildId) {
  return db.get('SELECT * FROM economy_settings WHERE guild_id=?', [guildId])
    ?? { guild_id: guildId, currency_name: 'coins', currency_emoji: '🪙', daily_amount: 500, work_min: 150, work_max: 450 };
}
function upsertEcoSettings(guildId, fields) {
  const ex = db.get('SELECT 1 FROM economy_settings WHERE guild_id=?', [guildId]);
  if (!ex) db.run('INSERT INTO economy_settings (guild_id) VALUES (?)', [guildId]);
  for (const [k, v] of Object.entries(fields))
    db.run(`UPDATE economy_settings SET ${k}=? WHERE guild_id=?`, [v, guildId]);
}

// ─── Auto-role ────────────────────────────────────────────────────────────────
function getAutoroles(guildId) {
  return all('SELECT role_id FROM autorole WHERE guild_id=?', [guildId]);
}
function addAutorole(guildId, roleId) {
  return run('INSERT OR IGNORE INTO autorole (guild_id, role_id) VALUES (?, ?)', [guildId, roleId]);
}
function removeAutorole(guildId, roleId) {
  return run('DELETE FROM autorole WHERE guild_id=? AND role_id=?', [guildId, roleId]);
}
function clearAutoroles(guildId) {
  return run('DELETE FROM autorole WHERE guild_id=?', [guildId]);
}

function getLevelRewards(guildId) {
  return all('SELECT * FROM level_rewards WHERE guild_id=? ORDER BY level ASC', [guildId]);
}

function setLevelReward(guildId, level, roleId) {
  run('INSERT OR REPLACE INTO level_rewards (guild_id, level, role_id) VALUES (?, ?, ?)', [guildId, level, roleId]);
}

function removeLevelReward(guildId, level) {
  run('DELETE FROM level_rewards WHERE guild_id=? AND level=?', [guildId, level]);
}

// ── invite_tracking ───────────────────────────────────────────────────────────
function incrementInvites(guildId, userId, amount = 1) {
  run('INSERT OR IGNORE INTO invite_tracking (guild_id, user_id, invites) VALUES (?, ?, 0)', [guildId, userId]);
  run('UPDATE invite_tracking SET invites = invites + ? WHERE guild_id = ? AND user_id = ?', [amount, guildId, userId]);
}
function setInvites(guildId, userId, amount) {
  run('INSERT OR IGNORE INTO invite_tracking (guild_id, user_id, invites) VALUES (?, ?, 0)', [guildId, userId]);
  run('UPDATE invite_tracking SET invites = ? WHERE guild_id = ? AND user_id = ?', [amount, guildId, userId]);
}
function getInvites(guildId, userId) {
  return get('SELECT invites FROM invite_tracking WHERE guild_id = ? AND user_id = ?', [guildId, userId])?.invites ?? 0;
}
function getInviteLeaderboard(guildId, limit = 10) {
  return all('SELECT user_id, invites FROM invite_tracking WHERE guild_id = ? ORDER BY invites DESC LIMIT ?', [guildId, limit]);
}
function resetInvites(guildId, userId) {
  run('DELETE FROM invite_tracking WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

// ─── Boost Roles ─────────────────────────────────────────────────────────────
function setBoostRole(guildId, userId, roleId) {
  return run('INSERT OR REPLACE INTO boost_roles (guild_id, user_id, role_id) VALUES (?, ?, ?)', [guildId, userId, roleId]);
}
function getBoostRole(guildId, userId) {
  return get('SELECT * FROM boost_roles WHERE guild_id=? AND user_id=?', [guildId, userId]);
}
function removeBoostRole(guildId, userId) {
  return run('DELETE FROM boost_roles WHERE guild_id=? AND user_id=?', [guildId, userId]);
}
function getAllBoostRoles(guildId) {
  return all('SELECT * FROM boost_roles WHERE guild_id=?', [guildId]);
}

// ─── Honeypot ─────────────────────────────────────────────────────────────────
function setHoneypot(guildId, channelId, action, messageId) {
  const existing = get('SELECT count FROM honeypot_channels WHERE guild_id=? AND channel_id=?', [guildId, channelId]);
  return run('INSERT OR REPLACE INTO honeypot_channels (guild_id, channel_id, action, message_id, count) VALUES (?, ?, ?, ?, ?)',
    [guildId, channelId, action, messageId, existing?.count ?? 0]);
}
function getHoneypot(guildId, channelId) {
  return get('SELECT * FROM honeypot_channels WHERE guild_id=? AND channel_id=?', [guildId, channelId]);
}
function removeHoneypot(guildId, channelId) {
  return run('DELETE FROM honeypot_channels WHERE guild_id=? AND channel_id=?', [guildId, channelId]);
}
function incrementHoneypotCount(guildId, channelId) {
  return run('UPDATE honeypot_channels SET count = count + 1 WHERE guild_id=? AND channel_id=?', [guildId, channelId]);
}
function getAllHoneypots(guildId) {
  return all('SELECT * FROM honeypot_channels WHERE guild_id=?', [guildId]);
}

// ─── Bets ─────────────────────────────────────────────────────────────────────
function createBet(guildId, creatorId, question, options) {
  const r = run('INSERT INTO bets (guild_id, creator_id, question, options_json) VALUES (?, ?, ?, ?)',
    [guildId, creatorId, question, JSON.stringify(options)]);
  return r.lastInsertRowid;
}
function getBet(id) {
  return get('SELECT * FROM bets WHERE id=?', [id]);
}
function getActiveBets(guildId) {
  return all("SELECT * FROM bets WHERE guild_id=? AND status='open' ORDER BY created_at DESC", [guildId]);
}
function updateBetStatus(id, status) {
  return run('UPDATE bets SET status=? WHERE id=?', [status, id]);
}
function updateBetMessage(id, channelId, messageId) {
  return run('UPDATE bets SET channel_id=?, message_id=? WHERE id=?', [channelId, messageId, id]);
}
function setBetWinner(id, winnerOption) {
  return run("UPDATE bets SET status='resolved', winner_option=? WHERE id=?", [winnerOption, id]);
}
function addBetEntry(betId, userId, optionIndex, amount) {
  return run('INSERT OR REPLACE INTO bet_entries (bet_id, user_id, option_index, amount) VALUES (?, ?, ?, ?)',
    [betId, userId, optionIndex, amount]);
}
function removeBetEntry(betId, userId) {
  return run('DELETE FROM bet_entries WHERE bet_id=? AND user_id=?', [betId, userId]);
}
function getBetEntries(betId) {
  return all('SELECT * FROM bet_entries WHERE bet_id=?', [betId]);
}
function getUserBetEntry(betId, userId) {
  return get('SELECT * FROM bet_entries WHERE bet_id=? AND user_id=?', [betId, userId]);
}
function getBetTotals(betId) {
  const rows = all('SELECT option_index, SUM(amount) as total FROM bet_entries WHERE bet_id=? GROUP BY option_index', [betId]);
  const out = {};
  for (const r of rows) out[r.option_index] = r.total;
  return out;
}
function getBetBettorCounts(betId) {
  const rows = all('SELECT option_index, COUNT(*) as cnt FROM bet_entries WHERE bet_id=? GROUP BY option_index', [betId]);
  const out = {};
  for (const r of rows) out[r.option_index] = r.cnt;
  return out;
}

// ─── Schema (run after DB opens) ─────────────────────────────────────────────
function _runSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS automod_settings (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  log_channel TEXT,
  spam_enabled INTEGER DEFAULT 0,
  spam_limit INTEGER DEFAULT 5,
  spam_interval INTEGER DEFAULT 5,
  spam_action TEXT DEFAULT 'delete',
  spam_timeout_dur INTEGER DEFAULT 300,
  caps_enabled INTEGER DEFAULT 0,
  caps_min_length INTEGER DEFAULT 8,
  caps_percent INTEGER DEFAULT 70,
  caps_action TEXT DEFAULT 'delete',
  links_enabled INTEGER DEFAULT 0,
  links_invites INTEGER DEFAULT 1,
  links_action TEXT DEFAULT 'delete',
  links_whitelist TEXT DEFAULT '[]',
  words_enabled INTEGER DEFAULT 0,
  words_action TEXT DEFAULT 'delete',
  words_list TEXT DEFAULT '[]',
  mentions_enabled INTEGER DEFAULT 0,
  mentions_limit INTEGER DEFAULT 5,
  mentions_action TEXT DEFAULT 'delete',
  emojis_enabled INTEGER DEFAULT 0,
  emojis_limit INTEGER DEFAULT 10,
  emojis_action TEXT DEFAULT 'delete',
  dupes_enabled INTEGER DEFAULT 0,
  dupes_limit INTEGER DEFAULT 3,
  dupes_interval INTEGER DEFAULT 30,
  dupes_action TEXT DEFAULT 'delete',
  newaccts_enabled INTEGER DEFAULT 0,
  newaccts_min_days INTEGER DEFAULT 7,
  newaccts_action TEXT DEFAULT 'kick',
  zalgo_enabled INTEGER DEFAULT 0,
  zalgo_action TEXT DEFAULT 'delete',
  strikes_enabled INTEGER DEFAULT 1,
  strikes_timeout_at INTEGER DEFAULT 3,
  strikes_timeout_dur INTEGER DEFAULT 300,
  strikes_kick_at INTEGER DEFAULT 5,
  strikes_ban_at INTEGER DEFAULT 7,
  strikes_decay_hours INTEGER DEFAULT 24,
  exempt_roles TEXT DEFAULT '[]',
  exempt_channels TEXT DEFAULT '[]'
)`);

  db.run(`CREATE TABLE IF NOT EXISTS automod_strikes (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  last_at INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  prefix TEXT DEFAULT '!',
  log_channel TEXT,
  log_events TEXT,
  log_color TEXT DEFAULT '#5865F2',
  log_ignored TEXT
)`);

  db.run(`CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
)`);

  db.run(`CREATE TABLE IF NOT EXISTS mutes (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER,
  reason TEXT,
  PRIMARY KEY (guild_id, user_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS bans (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  reason TEXT,
  expires_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (guild_id, user_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  content TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
)`);

  db.run(`CREATE TABLE IF NOT EXISTS mod_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  extra TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
)`);

  db.run(`CREATE TABLE IF NOT EXISTS role_persist (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  roles TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS temp_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
)`);

  db.run(`CREATE TABLE IF NOT EXISTS forced_nicknames (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS fake_permissions (
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (guild_id, role_id, permission)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS invoke_mods (
  guild_id TEXT NOT NULL,
  action TEXT NOT NULL,
  message TEXT,
  dm_message TEXT,
  PRIMARY KEY (guild_id, action)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS nuke_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  interval_ms INTEGER NOT NULL,
  next_at INTEGER NOT NULL
)`);

  db.run(`CREATE TABLE IF NOT EXISTS autoresponder (
  guild_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  response TEXT NOT NULL,
  PRIMARY KEY (guild_id, trigger)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS reactions (
  guild_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  emoji TEXT NOT NULL,
  PRIMARY KEY (guild_id, trigger, emoji)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS reaction_messages (
  guild_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, message_id, emoji)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS channel_autoreact (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  PRIMARY KEY (guild_id, channel_id, emoji)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  host_id TEXT NOT NULL,
  prize TEXT NOT NULL,
  winners INTEGER NOT NULL DEFAULT 1,
  ends_at INTEGER NOT NULL,
  ended INTEGER NOT NULL DEFAULT 0,
  cancelled INTEGER NOT NULL DEFAULT 0,
  required_roles TEXT DEFAULT '[]',
  blacklisted_roles TEXT DEFAULT '[]',
  min_level INTEGER DEFAULT 0,
  max_level INTEGER,
  stay_in_server INTEGER DEFAULT 0,
  color TEXT DEFAULT '#FFD700',
  voice_channel TEXT,
  image_url TEXT
)`);

  try { db.run(`ALTER TABLE giveaways ADD COLUMN image_url TEXT`); } catch (_) {}

  db.run(`CREATE TABLE IF NOT EXISTS giveaway_rigged (
  giveaway_id INTEGER PRIMARY KEY,
  user_ids TEXT NOT NULL DEFAULT '[]'
)`);

  db.run(`CREATE TABLE IF NOT EXISTS invite_tracking (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  invites  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
)`);

  try { db.run(`ALTER TABLE giveaways ADD COLUMN min_invites INTEGER DEFAULT 0`); } catch (_) {}

  db.run(`CREATE TABLE IF NOT EXISTS boost_roles (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  role_id  TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS honeypot_channels (
  guild_id   TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  action     TEXT NOT NULL DEFAULT 'kick',
  message_id TEXT,
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, channel_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS bets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT    NOT NULL,
  creator_id  TEXT    NOT NULL,
  question    TEXT    NOT NULL,
  options_json TEXT   NOT NULL DEFAULT '[]',
  status      TEXT    NOT NULL DEFAULT 'open',
  winner_option INTEGER DEFAULT NULL,
  channel_id  TEXT,
  message_id  TEXT,
  created_at  INTEGER DEFAULT (strftime('%s','now'))
)`);

  db.run(`CREATE TABLE IF NOT EXISTS bet_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  bet_id       INTEGER NOT NULL,
  user_id      TEXT    NOT NULL,
  option_index INTEGER NOT NULL,
  amount       INTEGER NOT NULL,
  UNIQUE(bet_id, user_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS giveaway_entries (
  giveaway_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  entered_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (giveaway_id, user_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS sticky_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  content TEXT NOT NULL,
  name TEXT,
  interval INTEGER DEFAULT 25,
  last_message_id TEXT
)`);

  try { db.run(`ALTER TABLE sticky_messages ADD COLUMN id INTEGER`); } catch {}
  try { db.run(`ALTER TABLE sticky_messages ADD COLUMN name TEXT`); } catch {}
  try { db.run(`ALTER TABLE sticky_messages ADD COLUMN interval INTEGER DEFAULT 25`); } catch {}

  db.run(`CREATE TABLE IF NOT EXISTS snipes (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  content TEXT,
  author_id TEXT,
  author_tag TEXT,
  author_avatar TEXT,
  deleted_at INTEGER,
  type TEXT NOT NULL DEFAULT 'delete',
  PRIMARY KEY (guild_id, channel_id, type)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS aliases (
  guild_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  command TEXT NOT NULL,
  PRIMARY KEY (guild_id, alias)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  name TEXT,
  locked INTEGER DEFAULT 0
)`);

  db.run(`CREATE TABLE IF NOT EXISTS afk (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT,
  set_at INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (guild_id, user_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  wif_encrypted TEXT NOT NULL,
  public_key TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
)`);

  db.run(`CREATE TABLE IF NOT EXISTS wallet_tos (
  user_id TEXT PRIMARY KEY,
  accepted_at INTEGER DEFAULT (strftime('%s','now'))
)`);

  db.run(`CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  address TEXT NOT NULL,
  txid TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER DEFAULT (strftime('%s','now'))
)`);

  db.run(`CREATE TABLE IF NOT EXISTS stock_watchlist (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id, symbol)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS stock_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL,
  strike REAL NOT NULL,
  expiry TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now'))
)`);

  db.run(`CREATE TABLE IF NOT EXISTS payment_addresses (
  user_id TEXT NOT NULL,
  coin TEXT NOT NULL,
  address TEXT NOT NULL,
  PRIMARY KEY (user_id, coin)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS paypal_settings (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  embed_title TEXT,
  embed_description TEXT,
  embed_color TEXT DEFAULT '#003087'
)`);

  db.run(`CREATE TABLE IF NOT EXISTS sellauth_settings (
  user_id TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  shop_id TEXT,
  product_id TEXT,
  variant_id TEXT
)`);

  db.run(`CREATE TABLE IF NOT EXISTS vouch_settings (
  user_id TEXT PRIMARY KEY,
  target_user_id TEXT,
  exchange_user_id TEXT
)`);

  db.run(`CREATE TABLE IF NOT EXISTS ticket_settings (
  guild_id TEXT PRIMARY KEY,
  category_id TEXT,
  log_channel TEXT,
  support_role TEXT,
  ticket_count INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  open_message TEXT,
  form_enabled INTEGER DEFAULT 0,
  form_title TEXT,
  form_color TEXT DEFAULT '#5865F2',
  form_fields TEXT DEFAULT '[]',
  form_footer TEXT
)`);

  db.run(`CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ticket_number INTEGER NOT NULL,
  status TEXT DEFAULT 'open',
  created_at INTEGER DEFAULT (strftime('%s','now')),
  closed_at INTEGER
)`);

  db.run(`CREATE TABLE IF NOT EXISTS ticket_watcher (
  guild_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  color TEXT DEFAULT '#5865F2',
  button_label TEXT,
  button_url TEXT,
  PRIMARY KEY (guild_id, category_id, type)
)`);

  // Migrations: tickets table extra columns
  for (const col of [
    'ALTER TABLE tickets ADD COLUMN claimed_by TEXT',
    'ALTER TABLE tickets ADD COLUMN close_reason TEXT',
    'ALTER TABLE tickets ADD COLUMN category_name TEXT',
    'ALTER TABLE tickets ADD COLUMN open_message_id TEXT',
  ]) { try { db.run(col); } catch (_) {} }

  // Migrations: ticket_settings extra columns
  for (const col of [
    'ALTER TABLE ticket_settings ADD COLUMN panel_image TEXT',
    'ALTER TABLE ticket_settings ADD COLUMN panel_thumbnail TEXT',
    "ALTER TABLE ticket_settings ADD COLUMN panel_title TEXT",
    'ALTER TABLE ticket_settings ADD COLUMN panel_description TEXT',
    'ALTER TABLE ticket_settings ADD COLUMN panel_footer TEXT',
    "ALTER TABLE ticket_settings ADD COLUMN support_roles TEXT DEFAULT '[]'",
  ]) { try { db.run(col); } catch (_) {} }

  db.run(`CREATE TABLE IF NOT EXISTS ticket_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT,
    discord_category_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(guild_id, name)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ticket_transcripts (
    token TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT,
    ticket_number INTEGER,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS antiraid_settings (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  join_threshold INTEGER DEFAULT 10,
  join_window INTEGER DEFAULT 10,
  action TEXT DEFAULT 'kick',
  mention_threshold INTEGER DEFAULT 10,
  log_channel TEXT
)`);

  db.run(`CREATE TABLE IF NOT EXISTS autoping (
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  delete_after INTEGER DEFAULT 5,
  enabled INTEGER DEFAULT 1,
  PRIMARY KEY (guild_id, channel_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS deposit_monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  address TEXT NOT NULL,
  coin TEXT NOT NULL DEFAULT 'LTC',
  last_balance REAL DEFAULT 0,
  channel_id TEXT,
  expires_at INTEGER NOT NULL,
  notified INTEGER DEFAULT 0
)`);

  db.run(`CREATE TABLE IF NOT EXISTS wallet_ratelimits (
  user_id TEXT PRIMARY KEY,
  last_send INTEGER NOT NULL
)`);

  db.run(`CREATE TABLE IF NOT EXISTS message_stats (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL
)`);

  db.run(`CREATE TABLE IF NOT EXISTS channel_name_cache (
  channel_id TEXT PRIMARY KEY,
  name TEXT NOT NULL
)`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_msgstats ON message_stats (guild_id, user_id, sent_at)`);

  db.run(`CREATE TABLE IF NOT EXISTS voice_stats (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  left_at INTEGER
)`);

  db.run(`CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  uses INTEGER DEFAULT 0,
  UNIQUE(guild_id, name)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS user_levels (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 0,
  last_xp_at INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS level_settings (
  guild_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 1,
  levelup_channel TEXT,
  levelup_message TEXT
)`);

  db.run(`CREATE TABLE IF NOT EXISTS level_rewards (
  guild_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, level)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS welcome_settings (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  enabled INTEGER DEFAULT 0,
  title TEXT DEFAULT 'Welcome!',
  description TEXT DEFAULT 'Welcome {mention} to {server}!',
  color TEXT DEFAULT '#5865F2',
  footer TEXT,
  image_url TEXT,
  thumbnail INTEGER DEFAULT 1
)`);

  db.run(`CREATE TABLE IF NOT EXISTS autorole (
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, role_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS economy (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  wallet INTEGER DEFAULT 0,
  bank INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0,
  daily_at INTEGER DEFAULT 0,
  work_at INTEGER DEFAULT 0,
  rob_at INTEGER DEFAULT 0,
  crime_at INTEGER DEFAULT 0,
  beg_at INTEGER DEFAULT 0,
  invest_at INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
)`);

  try { db.run('ALTER TABLE economy ADD COLUMN crime_at INTEGER DEFAULT 0');   } catch {}
  try { db.run('ALTER TABLE economy ADD COLUMN beg_at INTEGER DEFAULT 0');     } catch {}
  try { db.run('ALTER TABLE economy ADD COLUMN invest_at INTEGER DEFAULT 0');  } catch {}
  try { db.run('ALTER TABLE economy ADD COLUMN fish_at INTEGER DEFAULT 0');    } catch {}
  try { db.run('ALTER TABLE economy ADD COLUMN hunt_at INTEGER DEFAULT 0');    } catch {}
  try { db.run('ALTER TABLE economy ADD COLUMN mine_at INTEGER DEFAULT 0');    } catch {}
  try { db.run('ALTER TABLE economy ADD COLUMN scratch_at INTEGER DEFAULT 0'); } catch {}
  try { db.run('ALTER TABLE economy ADD COLUMN cf_at INTEGER DEFAULT 0');      } catch {}

  db.run(`CREATE TABLE IF NOT EXISTS economy_settings (
  guild_id TEXT PRIMARY KEY,
  currency_name TEXT DEFAULT 'coins',
  currency_emoji TEXT DEFAULT '🪙',
  daily_amount INTEGER DEFAULT 500,
  work_min INTEGER DEFAULT 150,
  work_max INTEGER DEFAULT 450
)`);

  db.run(`CREATE TABLE IF NOT EXISTS panels (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  message_id TEXT,
  options_json TEXT NOT NULL
)`);

  db.run(`CREATE TABLE IF NOT EXISTS credits (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
)`);

  // Theme & profile migrations
  try { db.run("ALTER TABLE credits ADD COLUMN owned_themes TEXT DEFAULT ''"); } catch(_) {}
  try { db.run("ALTER TABLE credits ADD COLUMN equipped_theme TEXT DEFAULT ''"); } catch(_) {}
  try { db.run("ALTER TABLE credits ADD COLUMN quote TEXT DEFAULT ''"); } catch(_) {}

  db.run(`CREATE TABLE IF NOT EXISTS card_theme_prices (
  guild_id TEXT NOT NULL,
  theme TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 5000,
  PRIMARY KEY (guild_id, theme)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS shop_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price INTEGER NOT NULL DEFAULT 100,
  type TEXT NOT NULL DEFAULT 'color_role',
  color TEXT DEFAULT '#5865F2',
  role_name TEXT,
  role_id TEXT,
  channel_id TEXT,
  stock INTEGER DEFAULT -1,
  sold INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  rarity TEXT DEFAULT 'common',
  theme_name TEXT
)`);

  // Shop item new columns
  try { db.run("ALTER TABLE shop_items ADD COLUMN rarity TEXT DEFAULT 'common'"); } catch(_) {}
  try { db.run("ALTER TABLE shop_items ADD COLUMN theme_name TEXT"); } catch(_) {}

  // Per-user personalised daily shop cache
  db.run(`CREATE TABLE IF NOT EXISTS user_daily_shops (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  item_ids TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (guild_id, user_id, date)
)`);

  // Per-user personalised weekly shop cache
  db.run(`CREATE TABLE IF NOT EXISTS user_weekly_shops (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  week TEXT NOT NULL,
  item_ids TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (guild_id, user_id, week)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS credit_settings (
  guild_id TEXT PRIMARY KEY,
  credits_per_msg INTEGER DEFAULT 1,
  cooldown_sec INTEGER DEFAULT 30,
  enabled INTEGER DEFAULT 1
)`);

  db.run(`CREATE TABLE IF NOT EXISTS user_shop_purchases (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  bought_at INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (guild_id, user_id, item_id)
)`);

  db.run(`CREATE TABLE IF NOT EXISTS user_custom_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  slot INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now'))
)`);

  db.run(`CREATE TABLE IF NOT EXISTS user_owned_quotes (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  quote_id INTEGER NOT NULL,
  bought_at INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (guild_id, user_id, quote_id)
)`);

  // Migrate: add new columns to credit_settings if they don't exist yet
  try { db.run('ALTER TABLE credit_settings ADD COLUMN invite_credits INTEGER DEFAULT 0');        } catch (_) {}
  try { db.run('ALTER TABLE credit_settings ADD COLUMN voice_credits INTEGER DEFAULT 0');          } catch (_) {}
  try { db.run('ALTER TABLE credit_settings ADD COLUMN custom_role_cost INTEGER DEFAULT 800000');   } catch (_) {}
  try { db.run('UPDATE credit_settings SET custom_role_cost = 800000 WHERE custom_role_cost = 500'); } catch (_) {}
  try { db.run('ALTER TABLE credit_settings ADD COLUMN custom_role_update_cost INTEGER DEFAULT 0'); } catch (_) {}
  try { db.run('ALTER TABLE credit_settings ADD COLUMN max_custom_roles INTEGER DEFAULT 1');       } catch (_) {}
  try { db.run('ALTER TABLE credit_settings ADD COLUMN custom_quote_cost INTEGER DEFAULT 15000');  } catch (_) {}
  try { db.run('UPDATE credit_settings SET custom_quote_cost = 15000 WHERE custom_quote_cost = 2500'); } catch (_) {}
  try { db.run("ALTER TABLE shop_items ADD COLUMN quote_text TEXT DEFAULT ''");                     } catch (_) {}
  try { db.run('ALTER TABLE credits ADD COLUMN free_role_claims INTEGER DEFAULT 0');                } catch (_) {}

  db.run(`CREATE TABLE IF NOT EXISTS staff_checkin_settings (
  guild_id TEXT PRIMARY KEY,
  staff_role_id TEXT,
  alert_role_id TEXT,
  staff_channel_id TEXT,
  alert_channel_id TEXT,
  checkin_hour INTEGER DEFAULT 9,
  checkin_minute INTEGER DEFAULT 0,
  deadline_hours INTEGER DEFAULT 4,
  enabled INTEGER DEFAULT 0,
  last_checkin_date TEXT DEFAULT '',
  last_alert_date TEXT DEFAULT ''
)`);

  db.run(`CREATE TABLE IF NOT EXISTS staff_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  date TEXT NOT NULL,
  user_id TEXT NOT NULL,
  checked_in_at TEXT NOT NULL,
  UNIQUE(guild_id, date, user_id)
)`);

  try { db.run(`ALTER TABLE staff_checkin_settings ADD COLUMN timezone TEXT DEFAULT 'UTC'`); } catch (_) {}
  try { db.run(`ALTER TABLE staff_checkin_settings ADD COLUMN last_message_id TEXT DEFAULT NULL`); } catch (_) {}

  db.run(`CREATE TABLE IF NOT EXISTS auctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT DEFAULT NULL,
  item TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  starting_bid INTEGER NOT NULL,
  current_bid INTEGER NOT NULL,
  current_bidder TEXT DEFAULT NULL,
  min_increment INTEGER DEFAULT 1,
  ends_at INTEGER NOT NULL,
  ended INTEGER DEFAULT 0,
  cancelled INTEGER DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
)`);

  db.run(`CREATE TABLE IF NOT EXISTS auction_bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  bid_at INTEGER DEFAULT (strftime('%s','now'))
)`);
}

// ── User Custom Roles ─────────────────────────────────────────────────────────
function getUserCustomRoles(guildId, userId) {
  return db.all('SELECT * FROM user_custom_roles WHERE guild_id=? AND user_id=? ORDER BY slot ASC', [guildId, userId]);
}
function getUserCustomRole(guildId, userId, slot) {
  return db.get('SELECT * FROM user_custom_roles WHERE guild_id=? AND user_id=? AND slot=?', [guildId, userId, slot]);
}
function addUserCustomRole(guildId, userId, roleId, name, color, slot) {
  db.run('INSERT INTO user_custom_roles (guild_id, user_id, role_id, name, color, slot) VALUES (?, ?, ?, ?, ?, ?)', [guildId, userId, roleId, name, color, slot]);
}
function updateUserCustomRole(guildId, userId, slot, fields) {
  const sets = Object.keys(fields).map(k => `${k}=?`).join(', ');
  db.run(`UPDATE user_custom_roles SET ${sets} WHERE guild_id=? AND user_id=? AND slot=?`, [...Object.values(fields), guildId, userId, slot]);
}
function deleteUserCustomRole(guildId, userId, slot) {
  db.run('DELETE FROM user_custom_roles WHERE guild_id=? AND user_id=? AND slot=?', [guildId, userId, slot]);
}

// ── Credits ───────────────────────────────────────────────────────────────────
function getCredits(guildId, userId) {
  db.run('INSERT OR IGNORE INTO credits (guild_id, user_id, amount, total_earned) VALUES (?, ?, 0, 0)', [guildId, userId]);
  return db.get('SELECT * FROM credits WHERE guild_id=? AND user_id=?', [guildId, userId]) || { amount: 0, total_earned: 0 };
}
function addCredits(guildId, userId, amount) {
  db.run('INSERT OR IGNORE INTO credits (guild_id, user_id, amount, total_earned) VALUES (?, ?, 0, 0)', [guildId, userId]);
  if (amount > 0) {
    db.run('UPDATE credits SET amount=amount+?, total_earned=total_earned+? WHERE guild_id=? AND user_id=?', [amount, amount, guildId, userId]);
  } else {
    db.run('UPDATE credits SET amount=MAX(0, amount+?) WHERE guild_id=? AND user_id=?', [amount, guildId, userId]);
  }
}
function spendCredits(guildId, userId, amount) {
  db.run('INSERT OR IGNORE INTO credits (guild_id, user_id, amount, total_earned) VALUES (?, ?, 0, 0)', [guildId, userId]);
  db.run('UPDATE credits SET amount=MAX(0, amount-?) WHERE guild_id=? AND user_id=?', [amount, guildId, userId]);
}
function refundCredits(guildId, userId, amount) {
  db.run('INSERT OR IGNORE INTO credits (guild_id, user_id, amount, total_earned) VALUES (?, ?, 0, 0)', [guildId, userId]);
  db.run('UPDATE credits SET amount=amount+? WHERE guild_id=? AND user_id=?', [amount, guildId, userId]);
}
function setCreditsAmount(guildId, userId, amount) {
  db.run('INSERT OR IGNORE INTO credits (guild_id, user_id, amount, total_earned) VALUES (?, ?, 0, 0)', [guildId, userId]);
  db.run('UPDATE credits SET amount=? WHERE guild_id=? AND user_id=?', [amount, guildId, userId]);
}
function resetCredits(guildId, userId) {
  db.run('UPDATE credits SET amount=0, total_earned=0 WHERE guild_id=? AND user_id=?', [guildId, userId]);
}
function getCreditLeaderboard(guildId, limit = 10) {
  return db.all('SELECT * FROM credits WHERE guild_id=? ORDER BY amount DESC LIMIT ?', [guildId, limit]);
}

// ── Shop Items ────────────────────────────────────────────────────────────────
function getShopItems(guildId) {
  return db.all('SELECT * FROM shop_items WHERE guild_id=? AND active=1 ORDER BY price ASC', [guildId]);
}
function getShopItem(id) {
  return db.get('SELECT * FROM shop_items WHERE id=?', [id]);
}
function getShopItemByName(guildId, name) {
  return db.get('SELECT * FROM shop_items WHERE guild_id=? AND active=1 AND LOWER(name)=LOWER(?)', [guildId, name]);
}
function addShopItem(data) {
  db.run(
    'INSERT INTO shop_items (guild_id, name, description, price, type, color, role_name, role_id, channel_id, stock, sold, active, rarity, theme_name, quote_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)',
    [data.guild_id, data.name, data.description || '', data.price, data.type, data.color || null, data.role_name || null, data.role_id || null, data.channel_id || null, data.stock ?? -1, data.rarity || 'common', data.theme_name || null, data.quote_text || null],
  );
  return db.get('SELECT last_insert_rowid() as id').id;
}
function removeShopItem(id) {
  db.run('UPDATE shop_items SET active=0 WHERE id=?', [id]);
}
function setShopItemRoleId(itemId, roleId) {
  db.run('UPDATE shop_items SET role_id=? WHERE id=?', [roleId, itemId]);
}
function incrementItemSold(id) {
  db.run('UPDATE shop_items SET sold=sold+1 WHERE id=?', [id]);
}

// ── Credit Settings ───────────────────────────────────────────────────────────
function getCreditSettings(guildId) {
  return db.get('SELECT * FROM credit_settings WHERE guild_id=?', [guildId])
    || { credits_per_msg: 1, cooldown_sec: 30, enabled: 1 };
}
function upsertCreditSettings(guildId, data) {
  const fields = Object.keys(data).map(k => `${k}=excluded.${k}`).join(', ');
  const cols   = ['guild_id', ...Object.keys(data)].join(', ');
  const vals   = [guildId, ...Object.values(data)];
  const placeholders = vals.map(() => '?').join(', ');
  db.run(`INSERT INTO credit_settings (${cols}) VALUES (${placeholders}) ON CONFLICT(guild_id) DO UPDATE SET ${fields}`, vals);
}

// ── User Purchases ────────────────────────────────────────────────────────────
function getUserPurchase(guildId, userId, itemId) {
  if (userId === OWNER_ID) return { guild_id: guildId, user_id: userId, item_id: itemId };
  return db.get('SELECT * FROM user_shop_purchases WHERE guild_id=? AND user_id=? AND item_id=?', [guildId, userId, itemId]);
}
function addUserPurchase(guildId, userId, itemId) {
  db.run('INSERT OR IGNORE INTO user_shop_purchases (guild_id, user_id, item_id) VALUES (?, ?, ?)', [guildId, userId, itemId]);
}
function getUserPurchases(guildId, userId) {
  return db.all(
    'SELECT p.*, s.name, s.type, s.color, s.price, s.quote_text FROM user_shop_purchases p JOIN shop_items s ON p.item_id=s.id WHERE p.guild_id=? AND p.user_id=? ORDER BY p.bought_at DESC',
    [guildId, userId],
  );
}

// ── Staff Check-in ────────────────────────────────────────────────────────────
function getStaffCheckinSettings(guildId) {
  return db.get('SELECT * FROM staff_checkin_settings WHERE guild_id=?', [guildId]);
}

function upsertStaffCheckinSettings(guildId, fields) {
  const existing = getStaffCheckinSettings(guildId);
  if (!existing) {
    db.run('INSERT INTO staff_checkin_settings (guild_id) VALUES (?)', [guildId]);
  }
  for (const [key, val] of Object.entries(fields)) {
    db.run(`UPDATE staff_checkin_settings SET ${key}=? WHERE guild_id=?`, [val, guildId]);
  }
}

function getAllEnabledStaffCheckin() {
  return db.all('SELECT * FROM staff_checkin_settings WHERE enabled=1', []);
}

function recordStaffCheckin(guildId, date, userId) {
  db.run(
    'INSERT OR IGNORE INTO staff_checkins (guild_id, date, user_id, checked_in_at) VALUES (?, ?, ?, ?)',
    [guildId, date, userId, new Date().toISOString()],
  );
}

function getStaffCheckins(guildId, date) {
  return db.all('SELECT * FROM staff_checkins WHERE guild_id=? AND date=?', [guildId, date]);
}

function hasStaffCheckedIn(guildId, date, userId) {
  return !!db.get('SELECT 1 FROM staff_checkins WHERE guild_id=? AND date=? AND user_id=?', [guildId, date, userId]);
}

// ── Auctions ──────────────────────────────────────────────────────────────────
function createAuction(guildId, channelId, item, description, imageUrl, startingBid, minIncrement, endsAt, createdBy) {
  const r = db.run(
    `INSERT INTO auctions (guild_id, channel_id, item, description, image_url, starting_bid, current_bid, min_increment, ends_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [guildId, channelId, item, description || '', imageUrl || '', startingBid, startingBid, minIncrement, endsAt, createdBy],
  );
  return db.get('SELECT * FROM auctions WHERE rowid=last_insert_rowid()');
}
function getAuction(id) {
  return db.get('SELECT * FROM auctions WHERE id=?', [id]);
}
function getActiveAuctions(guildId) {
  const now = Math.floor(Date.now() / 1000);
  return db.all('SELECT * FROM auctions WHERE guild_id=? AND ended=0 AND cancelled=0 AND ends_at>? ORDER BY ends_at ASC', [guildId, now]);
}
function getExpiredAuctions() {
  const now = Math.floor(Date.now() / 1000);
  return db.all('SELECT * FROM auctions WHERE ended=0 AND cancelled=0 AND ends_at<=?', [now]);
}
function setAuctionMessageId(id, messageId) {
  db.run('UPDATE auctions SET message_id=? WHERE id=?', [messageId, id]);
}
function placeBid(auctionId, guildId, userId, amount) {
  // Returns the previous highest bidder info for refund
  const auction = getAuction(auctionId);
  const prev = auction.current_bidder ? { userId: auction.current_bidder, amount: auction.current_bid } : null;
  db.run('UPDATE auctions SET current_bid=?, current_bidder=? WHERE id=?', [amount, userId, auctionId]);
  db.run('INSERT INTO auction_bids (auction_id, guild_id, user_id, amount) VALUES (?, ?, ?, ?)', [auctionId, guildId, userId, amount]);
  return prev;
}
function extendAuction(id, newEndsAt) {
  db.run('UPDATE auctions SET ends_at=? WHERE id=?', [newEndsAt, id]);
}
function endAuction(id) {
  db.run('UPDATE auctions SET ended=1 WHERE id=?', [id]);
}
function cancelAuction(id) {
  db.run('UPDATE auctions SET cancelled=1, ended=1 WHERE id=?', [id]);
}
function getAuctionBids(auctionId, limit = 5) {
  return db.all('SELECT * FROM auction_bids WHERE auction_id=? ORDER BY bid_at DESC LIMIT ?', [auctionId, limit]);
}
function getUserActiveBids(guildId, userId) {
  const now = Math.floor(Date.now() / 1000);
  return db.all(
    `SELECT a.*, ab.amount AS my_bid FROM auctions a
     JOIN auction_bids ab ON ab.auction_id=a.id AND ab.guild_id=? AND ab.user_id=?
     WHERE a.guild_id=? AND a.ended=0 AND a.cancelled=0 AND a.ends_at>?
     GROUP BY a.id ORDER BY a.ends_at ASC`,
    [guildId, userId, guildId, now],
  );
}

// ── Daily / Weekly Shop Generation ───────────────────────────────────────────
const _RARITY_WEIGHTS = { common: 50, uncommon: 28, rare: 14, epic: 6, legendary: 2 };

function _hashStr(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) >>> 0;
  return h || 1;
}

function _shopRng(seed) {
  let s = _hashStr(seed);
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xFFFFFFFF; };
}

function _weightedSelect(items, seed, count) {
  if (!items.length) return [];
  const rng = _shopRng(seed);
  const pool = [...items];
  const out  = [];
  count = Math.min(count, pool.length);
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((s, i) => s + (_RARITY_WEIGHTS[i.rarity] || 50), 0);
    let roll = rng() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      roll -= (_RARITY_WEIGHTS[pool[i].rarity] || 50);
      if (roll <= 0) { idx = i; break; }
    }
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

// Like _weightedSelect but caps how many items of the same type can appear.
function _typeLimitedSelect(items, seed, count, maxPerType) {
  if (!items.length) return [];
  const rng = _shopRng(seed);
  const pool = [...items];
  const out  = [];
  const typeCounts = {};
  count = Math.min(count, pool.length);
  while (out.length < count && pool.length > 0) {
    // Only consider items whose type is still under the cap
    const available = pool.filter(i => (typeCounts[i.type] || 0) < maxPerType);
    if (!available.length) break;
    const total = available.reduce((s, i) => s + (_RARITY_WEIGHTS[i.rarity] || 50), 0);
    let roll = rng() * total;
    let chosen = available[available.length - 1];
    for (let i = 0; i < available.length; i++) {
      roll -= (_RARITY_WEIGHTS[available[i].rarity] || 50);
      if (roll <= 0) { chosen = available[i]; break; }
    }
    out.push(chosen);
    typeCounts[chosen.type] = (typeCounts[chosen.type] || 0) + 1;
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}

function _todayStr() { return new Date().toISOString().slice(0, 10); }

function _weekStr() {
  const d = new Date();
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function generateUserDailyShop(guildId, userId) {
  const date   = _todayStr();
  const cached = db.get('SELECT item_ids FROM user_daily_shops WHERE guild_id=? AND user_id=? AND date=?', [guildId, userId, date]);
  if (cached) {
    const ids = JSON.parse(cached.item_ids);
    // Don't trust a cached empty list — item pool may have grown since then
    if (ids.length > 0) return ids;
  }
  const items    = db.all('SELECT * FROM shop_items WHERE guild_id=? AND active=1', [guildId]);
  // Max 2 items of the same type so the daily shop is always a mix
  const selected = _typeLimitedSelect(items, `${userId}:daily:${date}`, 4, 2);
  const ids      = selected.map(i => i.id);
  if (ids.length > 0) {
    db.run('INSERT OR REPLACE INTO user_daily_shops (guild_id, user_id, date, item_ids) VALUES (?, ?, ?, ?)',
      [guildId, userId, date, JSON.stringify(ids)]);
  }
  return ids;
}

function generateUserWeeklyShop(guildId, userId) {
  const week   = _weekStr();
  const cached = db.get('SELECT item_ids FROM user_weekly_shops WHERE guild_id=? AND user_id=? AND week=?', [guildId, userId, week]);
  if (cached) {
    const ids = JSON.parse(cached.item_ids);
    if (ids.length > 0) return ids;
  }
  const items    = db.all('SELECT * FROM shop_items WHERE guild_id=? AND active=1', [guildId]);
  // Max 2 items of the same type so the weekly shop is always a mix
  const selected = _typeLimitedSelect(items, `${userId}:weekly:${week}`, 6, 2);
  const ids      = selected.map(i => i.id);
  if (ids.length > 0) {
    db.run('INSERT OR REPLACE INTO user_weekly_shops (guild_id, user_id, week, item_ids) VALUES (?, ?, ?, ?)',
      [guildId, userId, week, JSON.stringify(ids)]);
  }
  return ids;
}

function getShopItemsByIds(ids) {
  if (!ids.length) return [];
  return ids.map(id => db.get('SELECT * FROM shop_items WHERE id=?', [id])).filter(Boolean);
}

// ── Card Themes ───────────────────────────────────────────────────────────────
function getUserTheme(guildId, userId) {
  const row = db.get('SELECT equipped_theme FROM credits WHERE guild_id=? AND user_id=?', [guildId, userId]);
  return row?.equipped_theme || null;
}

function getUserOwnedThemes(guildId, userId) {
  const row = db.get('SELECT owned_themes FROM credits WHERE guild_id=? AND user_id=?', [guildId, userId]);
  if (!row || !row.owned_themes) return [];
  return row.owned_themes.split(',').filter(Boolean);
}

function hasTheme(guildId, userId, theme) {
  if (userId === OWNER_ID) return true;
  return getUserOwnedThemes(guildId, userId).includes(theme);
}

function addOwnedTheme(guildId, userId, theme) {
  db.run('INSERT OR IGNORE INTO credits (guild_id, user_id, amount, total_earned) VALUES (?, ?, 0, 0)', [guildId, userId]);
  const owned = getUserOwnedThemes(guildId, userId);
  if (!owned.includes(theme)) {
    owned.push(theme);
    db.run("UPDATE credits SET owned_themes=? WHERE guild_id=? AND user_id=?", [owned.join(','), guildId, userId]);
  }
}

function setEquippedTheme(guildId, userId, theme) {
  db.run('INSERT OR IGNORE INTO credits (guild_id, user_id, amount, total_earned) VALUES (?, ?, 0, 0)', [guildId, userId]);
  db.run("UPDATE credits SET equipped_theme=? WHERE guild_id=? AND user_id=?", [theme || '', guildId, userId]);
}

function getThemePrice(guildId, theme) {
  const row = db.get('SELECT price FROM card_theme_prices WHERE guild_id=? AND theme=?', [guildId, theme]);
  return row?.price ?? 5000;
}

function setThemePrice(guildId, theme, price) {
  db.run('INSERT OR REPLACE INTO card_theme_prices (guild_id, theme, price) VALUES (?, ?, ?)', [guildId, theme, price]);
}

function getAllThemePrices(guildId) {
  return db.all('SELECT theme, price FROM card_theme_prices WHERE guild_id=?', [guildId]);
}

// ── Card Quote ────────────────────────────────────────────────────────────────
function getUserQuote(guildId, userId) {
  const row = db.get('SELECT quote FROM credits WHERE guild_id=? AND user_id=?', [guildId, userId]);
  return (row && row.quote) || '';
}
function setUserQuote(guildId, userId, text) {
  db.run('INSERT INTO credits (guild_id, user_id, amount, total_earned, quote) VALUES (?, ?, 0, 0, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET quote=excluded.quote',
    [guildId, userId, text]);
}

// ── Owned Quotes (catalog) ────────────────────────────────────────────────────
function getUserOwnedQuoteIds(guildId, userId) {
  return db.all('SELECT quote_id FROM user_owned_quotes WHERE guild_id=? AND user_id=?', [guildId, userId])
    .map(r => r.quote_id);
}
function addUserOwnedQuote(guildId, userId, quoteId) {
  db.run('INSERT OR IGNORE INTO user_owned_quotes (guild_id, user_id, quote_id) VALUES (?, ?, ?)',
    [guildId, userId, quoteId]);
}
function hasUserOwnedQuote(guildId, userId, quoteId) {
  return !!db.get('SELECT 1 FROM user_owned_quotes WHERE guild_id=? AND user_id=? AND quote_id=?',
    [guildId, userId, quoteId]);
}

// ── Free Role Claims (custom_role shop purchases) ──────────────────────────────
function getFreeRoleClaims(guildId, userId) {
  const row = db.get('SELECT free_role_claims FROM credits WHERE guild_id=? AND user_id=?', [guildId, userId]);
  return (row && typeof row.free_role_claims === 'number') ? row.free_role_claims : 0;
}
function addFreeRoleClaim(guildId, userId, count) {
  count = count ?? 1;
  db.run('INSERT OR IGNORE INTO credits (guild_id, user_id, amount, total_earned) VALUES (?, ?, 0, 0)', [guildId, userId]);
  db.run('UPDATE credits SET free_role_claims = free_role_claims + ? WHERE guild_id=? AND user_id=?', [count, guildId, userId]);
}
function useFreeRoleClaim(guildId, userId) {
  if (getFreeRoleClaims(guildId, userId) <= 0) return false;
  db.run('UPDATE credits SET free_role_claims = MAX(0, free_role_claims - 1) WHERE guild_id=? AND user_id=?', [guildId, userId]);
  return true;
}

// Gracefully close the database. Called on SIGTERM so Railway's zero-downtime
// deploy releases the file lock before the new instance tries to open it.
function closeDb() {
  if (db) {
    try { db.close(); console.log('[DB] Database closed cleanly.'); } catch (_) {}
    db = null;
  }
}

module.exports = {
  _dbReady,
  get, all, run,
  getAutomodSettings, setAutomodSettings,
  getAutomodStrikes, addAutomodStrike, clearAutomodStrikes,
  getAutomodWords, addAutomodWord, removeAutomodWord,
  getGuildSettings, upsertGuildSettings,
  addWarning, getWarnings, clearWarnings,
  addMute, getMute, removeMute, getExpiredMutes, getAllMutes,
  addBan, removeBan, getExpiredBans, getAllBans,
  addNote, getNotes,
  addHistory, getHistory, getModStats,
  saveRoles, getSavedRoles,
  addTempRole, getExpiredTempRoles, removeTempRole, getTempRoles, getAllTempRoles,
  setForcedNickname, getForcedNickname, removeForcedNickname, getAllForcedNicknames,
  grantFakePerm, removeFakePerm, resetFakePerms, getFakePerms,
  setInvokeMod, getInvokeMod, removeInvokeMod,
  addNukeSchedule, getNukeSchedules, removeNukeSchedule,
  addAutoresponder, removeAutoresponder, getAutoresponders, clearAutoresponders,
  addReaction, removeReaction, deleteAllReactions, getReactions,
  addChannelAutoreact, removeChannelAutoreact, getChannelAutoreacts, getAllChannelAutoreacts,
  addReactionMessage, removeReactionMessage, getReactionMessage, getReactionMessages,
  createGiveaway, updateGiveawayMessageId, getGiveaway, getGiveawayByMessage,
  getActiveGiveaways, getExpiredGiveaways, endGiveaway, cancelGiveaway, updateGiveaway,
  addEntry, removeEntry, hasEntry, getEntries, getEntryCount,
  setRiggedWinners, getRiggedWinners, clearRiggedWinners,
  getEndedGiveaways,
  incrementInvites, setInvites, getInvites, getInviteLeaderboard, resetInvites,
  setStickyMessage, updateStickyLastMessage, getStickiesForChannel, getStickyMessage, removeStickyMessage, removeStickyById, getAllStickyMessages,
  setSnipe, getSnipe, clearSnipe,
  addAlias, removeAlias, getAlias, getAllAliases, removeAllAliases,
  addWebhook, removeWebhook, getWebhooks, getWebhooksByChannel,
  setAfk, getAfk, removeAfk,
  getWallet, createWallet, updateWalletKey,
  hasTos, acceptTos,
  addWalletTx, getWalletTxs,
  getWalletRateLimit, setWalletRateLimit,
  addStock, removeStock, getStocks,
  addStockOption, getStockOptions,
  setPaymentAddress, getPaymentAddress, getPaymentAddresses,
  setPaypal, getPaypal,
  setSellAuth, getSellAuth, updateSellAuth,
  trackMessage, getMessageStats, getMessageRank, getMessageLeaderboard, getCachedChannelName,
  trackVoiceJoin, trackVoiceLeave, getVoiceStats,
  getPrefix, setPrefix,
  setVouch, setVouchExch, getVouch,
  getTicketSettings, upsertTicketSettings, incrementTicketCount,
  createTicket, getTicketByChannel, closeTicket,
  createTicketFull, claimTicket, updateTicketOpenMessage, closeTicketWithDetails,
  getTicketCategories, getTicketCategory, addTicketCategory, removeTicketCategory,
  saveTranscript, getTranscript,
  setTicketWatcher, removeTicketWatcher, getTicketWatchers, getTicketWatcher, getTicketWatchersByCategory,
  getAntiraid, upsertAntiraid,
  addAutoping, removeAutoping, getAutopings, toggleAutoping, clearAutopings,
  addDepositMonitor, getActiveDepositMonitors, updateDepositMonitor, markDepositNotified,
  getWelcomeSettings, upsertWelcomeSettings,
  setPanel, getPanel, deletePanel,
  createTag, getTag, deleteTag, listTags, incrementTagUses, editTag,
  xpForLevel, cumulativeXpForLevel, getUserLevel, getLevelRank, getLevelLeaderboard, addXp, setUserXp, resetUserLevel,
  getLevelSettings, upsertLevelSettings, getLevelRewards, setLevelReward, removeLevelReward,
  getAutoroles, addAutorole, removeAutorole, clearAutoroles,
  getEco, addWallet, setWallet, deposit, withdraw, transfer,
  getEcoLeaderboard, setDailyAt, setWorkAt, setRobAt, setCrimeAt, setBegAt, setInvestAt, setFishAt, setHuntAt, setMineAt, setScratchAt, setCfAt,
  getEcoSettings, upsertEcoSettings,
  setBoostRole, getBoostRole, removeBoostRole, getAllBoostRoles,
  createBet, getBet, getActiveBets, updateBetStatus, updateBetMessage, setBetWinner,
  addBetEntry, removeBetEntry, getBetEntries, getUserBetEntry, getBetTotals, getBetBettorCounts,
  setHoneypot, getHoneypot, removeHoneypot, incrementHoneypotCount, getAllHoneypots,
  getUserCustomRoles, getUserCustomRole, addUserCustomRole, updateUserCustomRole, deleteUserCustomRole,
  getCredits, addCredits, spendCredits, refundCredits, setCreditsAmount, resetCredits, getCreditLeaderboard,
  getUserTheme, getUserOwnedThemes, hasTheme, addOwnedTheme, setEquippedTheme,
  getThemePrice, setThemePrice, getAllThemePrices,
  getUserQuote, setUserQuote,
  getUserOwnedQuoteIds, addUserOwnedQuote, hasUserOwnedQuote,
  getFreeRoleClaims, addFreeRoleClaim, useFreeRoleClaim,
  getShopItems, getShopItem, getShopItemByName, addShopItem, removeShopItem, setShopItemRoleId, incrementItemSold,
  generateUserDailyShop, generateUserWeeklyShop, getShopItemsByIds,
  getCreditSettings, upsertCreditSettings,
  getUserPurchase, addUserPurchase, getUserPurchases,
  getStaffCheckinSettings, upsertStaffCheckinSettings, getAllEnabledStaffCheckin,
  recordStaffCheckin, getStaffCheckins, hasStaffCheckedIn,
  createAuction, getAuction, getActiveAuctions, getExpiredAuctions,
  setAuctionMessageId, placeBid, extendAuction, endAuction, cancelAuction,
  getAuctionBids, getUserActiveBids,
  closeDb,
};
