'use strict';
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { hasManageGuild, getGuild } = require('../lib/discord');
const db = require('../lib/db');

const router = express.Router();

router.use(requireAuth);

// Guild selection page
router.get('/', (req, res) => {
  const guilds     = req.session.guilds || [];
  const allGuilds  = req.session.allGuilds || [];

  const adminGuilds  = guilds.filter(g => hasManageGuild(g.permissions || '0'));
  const memberGuilds = guilds.filter(g => !hasManageGuild(g.permissions || '0'));

  res.render('user/guilds', { adminGuilds, memberGuilds });
});

// User stats for a specific guild
router.get('/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const userId = req.session.user.id;

  const guilds = req.session.guilds || [];
  const guild = guilds.find(g => g.id === guildId);
  if (!guild) return res.status(403).render('error', { code: 403, message: 'You are not in this server.' });

  let discordGuild = null;
  try { discordGuild = await getGuild(guildId); } catch {}
  const guildData = discordGuild || guild;

  const stats    = db.getUserMessageStats(guildId, userId);
  const rank     = db.getUserRank(guildId, userId);
  const warnings = db.all('SELECT * FROM warnings WHERE guild_id=? AND user_id=? ORDER BY created_at DESC', [guildId, userId]);

  res.render('user/dashboard', {
    guild: guildData,
    stats: { d1: stats.d1 || 0, d7: stats.d7 || 0, d30: stats.d30 || 0 },
    rank,
    warnings,
  });
});

module.exports = router;
