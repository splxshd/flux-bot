'use strict';
const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { getGuild } = require('../lib/discord');
const db = require('../lib/db');

const router = express.Router();

// Guard every route that uses :guildId
router.param('guildId', requireAdmin);

// Helper: resolve guild data (tries Discord API, falls back to session data)
async function resolveGuild(req) {
  try { return await getGuild(req.params.guildId); } catch {}
  return req.guild || { id: req.params.guildId, name: 'Unknown Server' };
}

// ── Overview ──────────────────────────────────────────────────────────────────
router.get('/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const guild = await resolveGuild(req);

  const recentMod      = db.getModHistory(guildId, 10);
  const warnings       = db.getWarnings(guildId);
  const giveaways      = db.getGiveaways(guildId);
  const tickets        = db.getTickets(guildId);
  const activeGiveaways = giveaways.filter(g => !g.ended && !g.cancelled);
  const openTickets    = tickets.filter(t => t.status === 'open').length;
  const modCount       = db.all(
    `SELECT count(*) as c FROM mod_history WHERE guild_id=? AND created_at > strftime('%s','now','-30 days')`,
    [guildId]
  )[0]?.c || 0;

  res.render('admin/overview', {
    guild,
    recentMod,
    warnCount: warnings.length,
    openTickets,
    modCount,
    activeGiveaways,
  });
});

// ── Moderation ────────────────────────────────────────────────────────────────
router.get('/:guildId/moderation', async (req, res) => {
  const { guildId } = req.params;
  const guild   = await resolveGuild(req);
  const history  = db.getModHistory(guildId, 100);
  const warnings = db.getWarnings(guildId);
  res.render('admin/moderation', { guild, history, warnings });
});

// ── Anti-Raid ─────────────────────────────────────────────────────────────────
router.get('/:guildId/antiraid', async (req, res) => {
  const { guildId } = req.params;
  const guild  = await resolveGuild(req);
  const config = db.getAntiraid(guildId);
  res.render('admin/antiraid', { guild, config, flash: req.session.flash && (delete req.session.flash, req.session._flash) });
});

router.post('/:guildId/antiraid', async (req, res) => {
  const { guildId } = req.params;
  const { enabled, mention_threshold, action, log_channel } = req.body;
  db.setAntiraid(guildId, {
    enabled:           !!enabled,
    mention_threshold: parseInt(mention_threshold) || 5,
    action:            action || 'timeout',
    log_channel:       log_channel || null,
  });
  req.session.flash = { type: 'success', msg: 'Anti-raid settings saved.' };
  res.redirect(`/dashboard/admin/${guildId}/antiraid`);
});

// ── Giveaways ─────────────────────────────────────────────────────────────────
router.get('/:guildId/giveaways', async (req, res) => {
  const { guildId } = req.params;
  const guild     = await resolveGuild(req);
  const giveaways = db.getGiveaways(guildId);
  const entryCounts = {};
  giveaways.forEach(g => { entryCounts[g.id] = db.getGiveawayEntryCount(g.id); });
  res.render('admin/giveaways', { guild, giveaways, entryCounts });
});

// ── Tickets ───────────────────────────────────────────────────────────────────
router.get('/:guildId/tickets', async (req, res) => {
  const { guildId } = req.params;
  const guild   = await resolveGuild(req);
  const tickets = db.getTickets(guildId);
  const config  = db.getTicketConfig(guildId);
  res.render('admin/tickets', { guild, tickets, config });
});

// ── Autoresponder ─────────────────────────────────────────────────────────────
router.get('/:guildId/autoresponder', async (req, res) => {
  const { guildId } = req.params;
  const guild   = await resolveGuild(req);
  const entries = db.getAutoresponders(guildId);
  const flash   = req.session.flash || null;
  delete req.session.flash;
  res.render('admin/autoresponder', { guild, entries, flash });
});

router.post('/:guildId/autoresponder/add', async (req, res) => {
  const { guildId } = req.params;
  const { trigger, response } = req.body;
  if (trigger && response) {
    db.run('INSERT OR REPLACE INTO autoresponder (guild_id, trigger, response) VALUES (?,?,?)',
      [guildId, trigger.trim(), response.trim()]);
    req.session.flash = { type: 'success', msg: `Autoresponder for "${trigger}" added.` };
  }
  res.redirect(`/dashboard/admin/${guildId}/autoresponder`);
});

router.post('/:guildId/autoresponder/delete', async (req, res) => {
  const { guildId } = req.params;
  const { trigger } = req.body;
  if (trigger) {
    db.run('DELETE FROM autoresponder WHERE guild_id=? AND trigger=?', [guildId, trigger]);
    req.session.flash = { type: 'success', msg: `Autoresponder deleted.` };
  }
  res.redirect(`/dashboard/admin/${guildId}/autoresponder`);
});

// ── Settings ──────────────────────────────────────────────────────────────────
router.get('/:guildId/settings', async (req, res) => {
  const { guildId } = req.params;
  const guild    = await resolveGuild(req);
  const settings = db.getGuildSettings(guildId);
  const flash    = req.session.flash || null;
  delete req.session.flash;
  res.render('admin/settings', { guild, settings, flash });
});

router.post('/:guildId/settings', async (req, res) => {
  const { guildId } = req.params;
  const { prefix, log_channel, log_color, welcome_channel, welcome_message } = req.body;
  db.setGuildSettings(guildId, { prefix, log_channel, log_color, welcome_channel, welcome_message });
  req.session.flash = { type: 'success', msg: 'Settings saved successfully.' };
  res.redirect(`/dashboard/admin/${guildId}/settings`);
});

module.exports = router;
