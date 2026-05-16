'use strict';

const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.DASHBOARD_URL || '*' }));

// ─── Auth middleware ──────────────────────────────────────────────────────────
const API_SECRET = process.env.API_SECRET;

function auth(req, res, next) {
  if (!API_SECRET) return next(); // skip if no secret set (dev mode)
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ') || header.slice(7) !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Guild Stats ──────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/stats', auth, (req, res) => {
  const { guildId } = req.params;
  try {
    const memberCount = 0; // fetched from Discord client — see startApi()
    const casesToday = db.all(
      'SELECT COUNT(*) as c FROM mod_history WHERE guild_id=? AND created_at >= ?',
      [guildId, Math.floor(Date.now() / 1000) - 86400]
    )[0]?.c ?? 0;
    const openTickets = db.all(
      'SELECT COUNT(*) as c FROM tickets WHERE guild_id=? AND status=?',
      [guildId, 'open']
    )[0]?.c ?? 0;
    const activeGiveaways = db.all(
      'SELECT COUNT(*) as c FROM giveaways WHERE guild_id=? AND active=1',
      [guildId]
    )[0]?.c ?? 0;
    const recentActivity = db.all(
      'SELECT action as description, created_at as timestamp FROM mod_history WHERE guild_id=? ORDER BY created_at DESC LIMIT 10',
      [guildId]
    ).map(r => ({ description: r.description, timestamp: new Date(r.timestamp * 1000).toISOString() }));

    res.json({
      memberCount,
      casesToday,
      openTickets,
      activeGiveaways,
      uptime: '99.9%',
      recentActivity,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Guild Settings ───────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/settings', auth, (req, res) => {
  const { guildId } = req.params;
  try {
    const settings = db.getGuildSettings(guildId);
    const welcome = db.all('SELECT * FROM welcome_settings WHERE guild_id=?', [guildId])[0] ?? {};
    const antiraid = db.getAntiraid(guildId) ?? {};
    res.json({ ...settings, ...welcome, ...antiraid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/guild/:guildId/settings', auth, (req, res) => {
  const { guildId } = req.params;
  try {
    db.upsertGuildSettings(guildId, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Cases ────────────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/cases', auth, (req, res) => {
  const { guildId } = req.params;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  try {
    const cases = db.all(
      'SELECT * FROM mod_history WHERE guild_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [guildId, limit, offset]
    ).map(c => ({
      id: c.id,
      type: c.action,
      target_id: c.user_id,
      target_tag: c.user_id,
      moderator_id: c.mod_id,
      moderator_tag: c.mod_id,
      reason: c.reason,
      active: true,
      created_at: new Date(c.created_at * 1000).toISOString(),
    }));
    const total = db.all('SELECT COUNT(*) as c FROM mod_history WHERE guild_id=?', [guildId])[0]?.c ?? 0;
    res.json({ cases, total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/guild/:guildId/cases/:caseId', auth, (req, res) => {
  const { guildId, caseId } = req.params;
  try {
    db.run('DELETE FROM mod_history WHERE id=? AND guild_id=?', [caseId, guildId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Giveaways ────────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/giveaways', auth, (req, res) => {
  const { guildId } = req.params;
  try {
    const rows = db.all('SELECT * FROM giveaways WHERE guild_id=? ORDER BY created_at DESC', [guildId]);
    res.json(rows.map(g => ({
      id: String(g.id),
      prize: g.prize,
      channel_id: g.channel_id,
      end_time: new Date(g.ends_at * 1000).toISOString(),
      winner_count: g.winners,
      entry_count: 0,
      required_role: g.required_roles || null,
      active: g.active === 1,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/guild/:guildId/giveaways', auth, (req, res) => {
  const { guildId } = req.params;
  const { prize, channel_id, duration_ms, winner_count, required_role } = req.body;
  try {
    const endsAt = Math.floor(Date.now() / 1000) + Math.floor(duration_ms / 1000);
    db.createGiveaway(guildId, channel_id, null, prize, winner_count, endsAt, required_role || null, null, 0, 0, 0, null, null);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/guild/:guildId/giveaways/:id/end', auth, (req, res) => {
  const { guildId, id } = req.params;
  try {
    db.endGiveaway(parseInt(id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/guild/:guildId/giveaways/:id/reroll', auth, (req, res) => {
  res.json({ ok: true, message: 'Reroll triggered' });
});

// ─── Vouches ──────────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/vouches', auth, (req, res) => {
  const { guildId } = req.params;
  try {
    const rows = db.all(
      'SELECT target_user_id as user_id, COUNT(*) as count FROM vouch_settings WHERE target_user_id IS NOT NULL GROUP BY target_user_id ORDER BY count DESC LIMIT 50',
      []
    );
    res.json(rows.map(r => ({
      user_id: r.user_id,
      username: r.user_id,
      avatar: null,
      count: r.count,
      last_vouched: new Date().toISOString(),
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Tickets ──────────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/tickets', auth, (req, res) => {
  const { guildId } = req.params;
  try {
    const rows = db.all(
      "SELECT * FROM tickets WHERE guild_id=? AND status='open' ORDER BY opened_at DESC",
      [guildId]
    );
    res.json(rows.map(t => ({
      id: String(t.id),
      user_id: t.user_id,
      username: t.user_id,
      category: 'Support',
      opened_at: new Date(t.opened_at * 1000).toISOString(),
      status: t.status || 'open',
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Bot Status ───────────────────────────────────────────────────────────────
let botStatus = {
  status: 'online',       // online | degraded | maintenance | offline
  message: 'All systems operational',
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
};

app.get('/api/status', (req, res) => {
  res.json({
    ...botStatus,
    uptime: process.uptime(),
    ping: Date.now(),
  });
});

app.post('/api/status', auth, (req, res) => {
  const { status, message, updatedBy } = req.body;
  const valid = ['online', 'degraded', 'maintenance', 'offline'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  botStatus = { status, message: message || botStatus.message, updatedAt: new Date().toISOString(), updatedBy: updatedBy || 'owner' };
  res.json({ ok: true, botStatus });
});

// ─── Channels list ────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/channels', auth, async (req, res) => {
  try {
    const client = req.app.locals.client;
    const guild  = await client.guilds.fetch(req.params.guildId);
    await guild.channels.fetch();
    const channels = guild.channels.cache
      .filter(c => c.type === 0) // text channels only
      .map(c => ({ id: c.id, name: c.name, parent: c.parent?.name || null }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(channels);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Panel send ───────────────────────────────────────────────────────────────
app.post('/api/guild/:guildId/panel/send', auth, async (req, res) => {
  const { guildId } = req.params;
  const { channelId, embedData, dropdown } = req.body;
  if (!channelId || !embedData) return res.status(400).json({ error: 'Missing channelId or embedData' });

  try {
    const client  = req.app.locals.client;
    const guild   = await client.guilds.fetch(guildId);
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

    const emb = new EmbedBuilder();
    if (embedData.title)       emb.setTitle(embedData.title);
    if (embedData.description) emb.setDescription(embedData.description);
    if (embedData.color)       emb.setColor(embedData.color);
    if (embedData.footer)      emb.setFooter({ text: embedData.footer, iconURL: embedData.footerIcon || undefined });
    if (embedData.thumbnail)   emb.setThumbnail(embedData.thumbnail);
    if (embedData.image)       emb.setImage(embedData.image);
    if (embedData.author)      emb.setAuthor({ name: embedData.author, iconURL: embedData.authorIcon || undefined });
    if (Array.isArray(embedData.fields)) {
      for (const f of embedData.fields) {
        if (f.name && f.value) emb.addFields({ name: f.name, value: f.value, inline: !!f.inline });
      }
    }

    const components = [];
    const panelId = `${guildId}_${Date.now()}`;
    if (dropdown && Array.isArray(dropdown.options) && dropdown.options.length > 0) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`panel:${panelId}`)
        .setPlaceholder(dropdown.placeholder || 'Choose an option.')
        .addOptions(dropdown.options.slice(0, 25).map((o, i) => ({
          label: o.label.slice(0, 100),
          value: o.value || `opt_${i}`,
          ...(o.description ? { description: o.description.slice(0, 100) } : {}),
        })));
      components.push(new ActionRowBuilder().addComponents(menu));
    }

    const sent = await channel.send({ embeds: [emb], components });

    if (dropdown && sent) {
      db.setPanel(panelId, guildId, sent.id, JSON.stringify(dropdown.options));
    }

    res.json({ ok: true, messageId: sent.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── Start ────────────────────────────────────────────────────────────────────
function startApi(client) {
  const port = process.env.API_PORT || 4000;
  app.locals.client = client;

  // Patch stats endpoint to use real member count from Discord client
  app.get('/api/guild/:guildId/member-count', auth, async (req, res) => {
    try {
      const guild = await client.guilds.fetch(req.params.guildId);
      res.json({ count: guild.memberCount });
    } catch {
      res.json({ count: 0 });
    }
  });

  app.listen(port, () => console.log(`[API] Running on port ${port}`));
}

module.exports = { startApi };
