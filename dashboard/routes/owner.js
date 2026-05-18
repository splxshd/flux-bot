'use strict';
const express = require('express');
const { requireOwner } = require('../middleware/auth');
const { getBotGuilds, getGuild } = require('../lib/discord');
const db = require('../lib/db');

const router = express.Router();

router.use(requireOwner);

router.get('/', async (req, res) => {
  const guildCount    = db.getGuildCount();
  const totalMessages = db.getTotalMessages();

  let guilds = [];
  try { guilds = await getBotGuilds(); } catch (e) {
    console.error('[Owner] Failed to fetch bot guilds:', e.message);
  }

  const uptimeMs = process.uptime() * 1000;
  const uptimeFmt = formatUptime(uptimeMs);

  res.render('owner/index', { guildCount, totalMessages, guilds, uptime: uptimeFmt });
});

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

module.exports = router;
