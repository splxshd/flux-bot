'use strict';

const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const { Database } = require('node-sqlite3-wasm');
const db = new Database(path.join(dataDir, 'nights.db'));

db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────
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
  voice_channel TEXT
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

// Migrate old single-sticky schema (PRIMARY KEY was guild_id+channel_id, no id column)
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

// Stores the last-known name of every channel we've seen a message in
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
// Migrations: add columns to existing rows
try { db.run('ALTER TABLE economy ADD COLUMN crime_at INTEGER DEFAULT 0');  } catch { /* exists */ }
try { db.run('ALTER TABLE economy ADD COLUMN beg_at INTEGER DEFAULT 0');    } catch { /* exists */ }
try { db.run('ALTER TABLE economy ADD COLUMN invest_at INTEGER DEFAULT 0'); } catch { /* exists */ }
try { db.run('ALTER TABLE economy ADD COLUMN fish_at INTEGER DEFAULT 0');   } catch { /* exists */ }

db.run(`CREATE TABLE IF NOT EXISTS economy_settings (
  guild_id TEXT PRIMARY KEY,
  currency_name TEXT DEFAULT 'coins',
  currency_emoji TEXT DEFAULT '🪙',
  daily_amount INTEGER DEFAULT 500,
  work_min INTEGER DEFAULT 150,
  work_max INTEGER DEFAULT 450
)`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function get(sql, params = []) {
  return db.get(sql, params);
}

function all(sql, params = []) {
  return db.all(sql, params);
}

function run(sql, params = []) {
  return db.run(sql, params);
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
    'INSERT INTO giveaways (guild_id, channel_id, host_id, prize, winners, ends_at, required_roles, blacklisted_roles, min_level, max_level, stay_in_server, color, voice_channel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [data.guild_id, data.channel_id, data.host_id, data.prize, data.winners, data.ends_at, data.required_roles || '[]', data.blacklisted_roles || '[]', data.min_level || 0, data.max_level || null, data.stay_in_server || 0, data.color || '#FFD700', data.voice_channel || null]
  );
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
  // Cache the channel name so deleted channels still show a readable name
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
db.run(`CREATE TABLE IF NOT EXISTS panels (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  message_id TEXT,
  options_json TEXT NOT NULL
)`);

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
setInterval(pruneOldData, 86400 * 1000);
pruneOldData(); // run once on startup

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
// XP needed to go from level n → level n+1
function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

// Total cumulative XP required to reach `level` from 0
function cumulativeXpForLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpForLevel(i);
  return total;
}

// Derive level from total cumulative XP
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

// Returns { leveled: bool, newLevel: number } — handles XP gain + level-up check
function addXp(guildId, userId, amount) {
  const XP_COOLDOWN = 60; // seconds
  const now = Math.floor(Date.now() / 1000);
  let row = get('SELECT * FROM user_levels WHERE guild_id=? AND user_id=?', [guildId, userId]);
  if (!row) {
    run('INSERT INTO user_levels (guild_id, user_id, xp, level, last_xp_at) VALUES (?, ?, 0, 0, 0)', [guildId, userId]);
    row = { guild_id: guildId, user_id: userId, xp: 0, level: 0, last_xp_at: 0 };
  }
  // Cooldown check
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

module.exports = {
  db,
  get, all, run,
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
  addReactionMessage, removeReactionMessage, getReactionMessage, getReactionMessages,
  createGiveaway, updateGiveawayMessageId, getGiveaway, getGiveawayByMessage,
  getActiveGiveaways, getExpiredGiveaways, endGiveaway, cancelGiveaway, updateGiveaway,
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
  getEcoLeaderboard, setDailyAt, setWorkAt, setRobAt, setCrimeAt, setBegAt, setInvestAt, setFishAt,
  getEcoSettings, upsertEcoSettings,
};
