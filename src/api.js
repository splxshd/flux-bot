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
app.get('/api/guild/:guildId/stats', auth, async (req, res) => {
  const { guildId } = req.params;
  try {
    const client = req.app.locals.client;
    let memberCount = 0;
    try {
      const guild = client?.guilds?.cache?.get(guildId) || await client?.guilds?.fetch(guildId).catch(() => null);
      if (guild) memberCount = guild.memberCount;
    } catch {}

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

// ─── Welcome settings ──────────────────────────────────────────────────────
app.get('/api/guild/:guildId/welcome', auth, (req, res) => {
  try { res.json(db.getWelcomeSettings(req.params.guildId) || {}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/guild/:guildId/welcome', auth, (req, res) => {
  try { db.upsertWelcomeSettings(req.params.guildId, req.body); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Autoroles ─────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/autoroles', auth, (req, res) => {
  try { res.json(db.getAutoroles(req.params.guildId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/guild/:guildId/autoroles', auth, (req, res) => {
  const { role_id } = req.body;
  if (!role_id) return res.status(400).json({ error: 'role_id required' });
  try { db.addAutorole(req.params.guildId, role_id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/guild/:guildId/autoroles/:roleId', auth, (req, res) => {
  try { db.removeAutorole(req.params.guildId, req.params.roleId); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Autoresponders ────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/autoresponders', auth, (req, res) => {
  try { res.json(db.getAutoresponders(req.params.guildId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/guild/:guildId/autoresponders', auth, (req, res) => {
  const { trigger, response } = req.body;
  if (!trigger || !response) return res.status(400).json({ error: 'trigger and response required' });
  try { db.addAutoresponder(req.params.guildId, trigger, response); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/guild/:guildId/autoresponders/:trigger', auth, (req, res) => {
  try { db.removeAutoresponder(req.params.guildId, decodeURIComponent(req.params.trigger)); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Reaction roles ────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/reaction-roles', auth, (req, res) => {
  try { res.json(db.getReactionMessages(req.params.guildId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/guild/:guildId/reaction-roles', auth, (req, res) => {
  const { message_id, emoji, role_id } = req.body;
  if (!message_id || !emoji || !role_id) return res.status(400).json({ error: 'message_id, emoji, role_id required' });
  try { db.addReactionMessage(req.params.guildId, message_id, emoji, role_id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/guild/:guildId/reaction-roles/:messageId/:emoji', auth, (req, res) => {
  try {
    db.removeReactionMessage(req.params.guildId, req.params.messageId, decodeURIComponent(req.params.emoji));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Fake permissions ──────────────────────────────────────────────────────
app.get('/api/guild/:guildId/permissions', auth, (req, res) => {
  try { res.json(db.all('SELECT * FROM fake_permissions WHERE guild_id=?', [req.params.guildId])); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/guild/:guildId/permissions', auth, (req, res) => {
  const { role_id, permission } = req.body;
  if (!role_id || !permission) return res.status(400).json({ error: 'role_id and permission required' });
  try { db.grantFakePerm(req.params.guildId, role_id, permission); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/guild/:guildId/permissions/:roleId/:permission', auth, (req, res) => {
  try { db.removeFakePerm(req.params.guildId, req.params.roleId, req.params.permission); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Keyword pings (auto-ping by keyword) ─────────────────────────────────
app.get('/api/guild/:guildId/keyword-pings', auth, (req, res) => {
  try { res.json(db.all('SELECT * FROM keyword_pings WHERE guild_id=?', [req.params.guildId])); }
  catch (e) { res.json([]); }
});
app.post('/api/guild/:guildId/keyword-pings', auth, (req, res) => {
  const { channel_id, role_id, keyword } = req.body;
  if (!channel_id || !role_id || !keyword) return res.status(400).json({ error: 'channel_id, role_id, keyword required' });
  try {
    db.run('INSERT INTO keyword_pings (guild_id, channel_id, role_id, keyword) VALUES (?,?,?,?)',
      [req.params.guildId, channel_id, role_id, keyword]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/guild/:guildId/keyword-pings/:id', auth, (req, res) => {
  try {
    db.run('DELETE FROM keyword_pings WHERE id=? AND guild_id=?', [req.params.id, req.params.guildId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Roles list ────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/roles', auth, async (req, res) => {
  try {
    const client = req.app.locals.client;
    const guild = client?.guilds?.cache?.get(req.params.guildId)
      || await client?.guilds?.fetch(req.params.guildId).catch(() => null);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });
    await guild.roles.fetch().catch(() => {});
    const roles = guild.roles.cache
      .filter(r => r.id !== guild.id && !r.managed)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
      .sort((a, b) => b.position - a.position);
    res.json(roles);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Analytics ─────────────────────────────────────────────────────────────
app.get('/api/guild/:guildId/analytics', auth, (req, res) => {
  const { guildId } = req.params;
  try {
    const now = Math.floor(Date.now() / 1000);
    const since = now - 7 * 86400;
    const msgRows = db.all(
      `SELECT strftime('%Y-%m-%d', sent_at, 'unixepoch') as day, COUNT(*) as messages
       FROM message_stats WHERE guild_id=? AND sent_at>=? GROUP BY day ORDER BY day`,
      [guildId, since]
    );
    const modRows = db.all(
      `SELECT strftime('%Y-%m-%d', created_at, 'unixepoch') as day, COUNT(*) as actions
       FROM mod_history WHERE guild_id=? AND created_at>=? GROUP BY day ORDER BY day`,
      [guildId, since]
    );
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date((now - (6 - i) * 86400) * 1000);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en', { weekday: 'short' });
      return {
        day: label,
        messages: msgRows.find(r => r.day === key)?.messages || 0,
        modActions: modRows.find(r => r.day === key)?.actions || 0,
      };
    });
    res.json({
      days,
      totalMessages: days.reduce((s, d) => s + d.messages, 0),
      totalMod: days.reduce((s, d) => s + d.modActions, 0),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Panel send ───────────────────────────────────────────────────────────────────
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
        .addOptions(dropdown.options.slice(0, 25).map((o, i) => {
          const opt = {
            label: (o.label || `Option ${i + 1}`).slice(0, 100),
            value: (o.value || `opt_${i}`).slice(0, 100),
          };
          if (o.description) opt.description = o.description.slice(0, 100);
          if (o.emoji) {
            opt.emoji = /^\d+$/.test(o.emoji.trim())
              ? { id: o.emoji.trim() }
              : { name: o.emoji.trim() };
          }
          return opt;
        }));
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

  // Ensure keyword_pings table exists
  db.run(`CREATE TABLE IF NOT EXISTS keyword_pings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    keyword TEXT NOT NULL
  )`);

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
