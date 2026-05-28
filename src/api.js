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
      'SELECT COUNT(*) as c FROM giveaways WHERE guild_id=? AND ended=0 AND cancelled=0',
      [guildId]
    )[0]?.c ?? 0;
    const vouchesTotal = db.all(
      'SELECT COUNT(*) as c FROM vouch_settings WHERE target_user_id IS NOT NULL'
    )[0]?.c ?? 0;
    const serverCount = client?.guilds?.cache?.size ?? 0;

    const recentCasesRaw = db.all(
      'SELECT id, action, user_id, mod_id, reason, created_at FROM mod_history WHERE guild_id=? ORDER BY created_at DESC LIMIT 5',
      [guildId]
    );
    const recentCases = recentCasesRaw.map(c => ({
      id: c.id,
      type: c.action,
      targetTag: c.user_id,
      moderatorTag: c.mod_id,
      reason: c.reason,
      createdAt: new Date(c.created_at * 1000).toISOString(),
    }));

    const recentActivity = db.all(
      'SELECT action, user_id, created_at FROM mod_history WHERE guild_id=? ORDER BY created_at DESC LIMIT 10',
      [guildId]
    ).map(r => ({
      type: r.action,
      description: `${r.action} issued on ${r.user_id}`,
      timestamp: new Date(r.created_at * 1000).toISOString(),
    }));

    res.json({
      memberCount,
      casesToday,
      openTickets,
      activeGiveaways,
      vouchesWeek: vouchesTotal,
      serverCount,
      recentCases,
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
    const settings  = db.getGuildSettings(guildId) ?? {};
    const welcome   = db.all('SELECT * FROM welcome_settings WHERE guild_id=?', [guildId])[0] ?? {};
    const antiraid  = db.getAntiraid(guildId) ?? {};
    const lvl       = db.getLevelSettings(guildId) ?? {};

    // Map level_settings column names → dashboard field names
    const levelMapped = {
      levels_enabled: lvl.enabled === undefined ? true : Boolean(lvl.enabled),
      levels_channel: lvl.levelup_channel ?? '',
      levels_message: lvl.levelup_message ?? 'GG {user}, you just reached level {level}!',
    };

    res.json({ ...settings, ...welcome, ...antiraid, ...levelMapped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/guild/:guildId/settings', auth, (req, res) => {
  const { guildId } = req.params;
  try {
    const { levels_enabled, levels_channel, levels_message, xp_rate, xp_cooldown, language, ...guildFields } = req.body;

    // Save core guild settings (only known columns)
    const knownGuildCols = ['prefix', 'log_channel', 'log_events', 'log_color', 'log_ignored'];
    const guildPatch = Object.fromEntries(
      Object.entries(guildFields).filter(([k]) => knownGuildCols.includes(k))
    );
    if (Object.keys(guildPatch).length) db.upsertGuildSettings(guildId, guildPatch);

    // Save level settings (map dashboard names → DB column names)
    const levelPatch = {};
    if (levels_enabled !== undefined) levelPatch.enabled = levels_enabled ? 1 : 0;
    if (levels_channel !== undefined) levelPatch.levelup_channel = levels_channel;
    if (levels_message !== undefined) levelPatch.levelup_message = levels_message;
    if (Object.keys(levelPatch).length) db.upsertLevelSettings(guildId, levelPatch);

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
  const status = req.query.status; // 'active' | 'ended' | undefined (all)
  try {
    let sql = 'SELECT * FROM giveaways WHERE guild_id=?';
    if (status === 'active') sql += ' AND ended=0 AND cancelled=0';
    else if (status === 'ended') sql += ' AND ended=1';
    sql += ' ORDER BY ends_at DESC';

    const rows = db.all(sql, [guildId]);
    res.json(rows.map(g => ({
      id: String(g.id),
      prize: g.prize,
      channel_id: g.channel_id,
      message_id: g.message_id || null,
      end_time: new Date(g.ends_at * 1000).toISOString(),
      winner_count: g.winners,
      entry_count: db.getEntryCount(g.id),
      required_role: g.required_roles && g.required_roles !== '[]' ? g.required_roles : null,
      active: g.ended === 0 && g.cancelled === 0,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/guild/:guildId/giveaways', auth, async (req, res) => {
  const { guildId } = req.params;
  const { prize, channel_id, duration_ms, winner_count, required_role, host_id } = req.body;
  if (!prize || !channel_id || !duration_ms) return res.status(400).json({ error: 'prize, channel_id, duration_ms required' });
  try {
    const endsAt = Math.floor(Date.now() / 1000) + Math.floor(duration_ms / 1000);
    const result = db.createGiveaway({
      guild_id: guildId,
      channel_id,
      host_id: host_id || 'dashboard',
      prize,
      winners: winner_count || 1,
      ends_at: endsAt,
      required_roles: required_role ? JSON.stringify([required_role]) : '[]',
    });
    const newId = result?.lastInsertRowid ?? result;

    // Post embed to Discord
    try {
      const client = req.app.locals.client;
      const { EmbedBuilder } = require('discord.js');
      const guild = await client.guilds.fetch(guildId);
      const channel = guild.channels.cache.get(channel_id) || await guild.channels.fetch(channel_id);
      if (channel) {
        const endsDate = new Date(endsAt * 1000);
        const emb = new EmbedBuilder()
          .setTitle('🎉 ' + prize)
          .setDescription(`React with 🎉 to enter!\n\nEnds: <t:${endsAt}:R>\nWinners: **${winner_count || 1}**`)
          .setColor('#FFD700')
          .setFooter({ text: `${winner_count || 1} winner(s) • Ends` })
          .setTimestamp(endsDate);
        const msg = await channel.send({ embeds: [emb] });
        await msg.react('🎉').catch(() => {});
        if (newId) db.updateGiveawayMessageId(newId, msg.id);
      }
    } catch {}

    res.json({ ok: true, id: newId ? String(newId) : undefined });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/guild/:guildId/giveaways/:id/end', auth, async (req, res) => {
  const { guildId, id } = req.params;
  try {
    const giveaway = db.getGiveaway(parseInt(id));
    if (!giveaway) return res.status(404).json({ error: 'Giveaway not found' });

    const entries = db.getEntries(parseInt(id));
    db.endGiveaway(parseInt(id));

    // Pick winners and announce
    const winnerCount = giveaway.winners || 1;
    const winners = [];
    if (entries.length > 0) {
      const shuffled = [...entries].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(winnerCount, shuffled.length); i++) {
        winners.push(shuffled[i].user_id);
      }
    }

    try {
      const client = req.app.locals.client;
      const guild = await client.guilds.fetch(guildId);
      const channel = guild.channels.cache.get(giveaway.channel_id) || await guild.channels.fetch(giveaway.channel_id);
      if (channel) {
        const winnersText = winners.length ? winners.map(w => `<@${w}>`).join(', ') : 'No valid entries';
        await channel.send({ content: `🎉 **${giveaway.prize}** ended! Winners: ${winnersText}` });
      }
    } catch {}

    res.json({ ok: true, winners });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/guild/:guildId/giveaways/:id/reroll', auth, async (req, res) => {
  const { guildId, id } = req.params;
  try {
    const giveaway = db.getGiveaway(parseInt(id));
    if (!giveaway) return res.status(404).json({ error: 'Giveaway not found' });

    const entries = db.getEntries(parseInt(id));
    if (entries.length === 0) return res.status(400).json({ error: 'No entries to reroll' });

    const winner = entries[Math.floor(Math.random() * entries.length)].user_id;

    try {
      const client = req.app.locals.client;
      const guild = await client.guilds.fetch(guildId);
      const channel = guild.channels.cache.get(giveaway.channel_id) || await guild.channels.fetch(giveaway.channel_id);
      if (channel) {
        await channel.send({ content: `🎉 **${giveaway.prize}** rerolled! New winner: <@${winner}>` });
      }
    } catch {}

    res.json({ ok: true, winner });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// ─── Transcript viewer (public, no auth) ─────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

app.get('/transcript/:token', (req, res) => {
  try {
    const row = db.getTranscript(req.params.token);
    if (!row) return res.status(404).send('<!DOCTYPE html><html><body style="background:#313338;color:#dbdee1;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><h2>Transcript not found.</h2></body></html>');

    let messages = [];
    try { messages = JSON.parse(row.content); } catch {}

    const ticketNum = String(row.ticket_number || 0).padStart(4, '0');
    const created   = new Date((row.created_at || 0) * 1000).toUTCString();

    const rows = messages.map(m => {
      const time    = new Date(m.time).toLocaleString('en-GB', { hour12: false });
      const content = m.content ? `<div class="content">${escapeHtml(m.content)}</div>` : '';
      const embed   = m.hasEmbed ? `<div class="note">[embed]</div>` : '';
      const atts    = (m.attachments || []).map(a =>
        `<div class="att">📎 <a href="${escapeHtml(a.url)}" target="_blank">${escapeHtml(a.name)}</a></div>`
      ).join('');
      return `
        <div class="msg">
          <img class="av" src="${escapeHtml(m.authorAvatar)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" alt="">
          <div class="body">
            <span class="tag">${escapeHtml(m.authorTag)}</span>
            <span class="ts">${escapeHtml(time)}</span>
            ${content}${embed}${atts}
          </div>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ticket #${escapeHtml(ticketNum)} — Transcript</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#313338;color:#dbdee1;font-family:'Segoe UI','Noto Sans',sans-serif;font-size:14px;line-height:1.4}
    .top{background:#1e1f22;padding:14px 20px;border-bottom:1px solid #3f4147;display:flex;align-items:center;gap:14px}
    .top .icon{font-size:28px}
    .top h1{color:#fff;font-size:17px;font-weight:700}
    .top .sub{color:#949ba4;font-size:12px;margin-top:2px}
    .wrap{max-width:900px;margin:0 auto;padding:16px 20px}
    .msg{display:flex;gap:14px;padding:6px 4px;border-radius:4px}
    .msg:hover{background:rgba(0,0,0,.08)}
    .av{width:40px;height:40px;border-radius:50%;flex-shrink:0;margin-top:2px;object-fit:cover}
    .body{flex:1;min-width:0}
    .tag{font-weight:600;color:#e3e5e8}
    .ts{color:#72767d;font-size:11px;margin-left:8px}
    .content{color:#dbdee1;margin-top:2px;white-space:pre-wrap;word-break:break-word}
    .note{color:#949ba4;font-style:italic;font-size:12px;margin-top:2px}
    .att{color:#00aaff;font-size:12px;margin-top:2px}
    .att a{color:#00aaff;text-decoration:none}
    .att a:hover{text-decoration:underline}
    .foot{text-align:center;color:#72767d;font-size:12px;padding:24px}
  </style>
</head>
<body>
  <div class="top">
    <div class="icon">🎫</div>
    <div>
      <h1>Ticket #${escapeHtml(ticketNum)}</h1>
      <div class="sub">Generated ${escapeHtml(created)} &bull; ${messages.length} message${messages.length !== 1 ? 's' : ''}</div>
    </div>
  </div>
  <div class="wrap">${rows}</div>
  <div class="foot">nights bot &bull; Transcript #${escapeHtml(ticketNum)}</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(500).send('<!DOCTYPE html><html><body style="background:#313338;color:#dbdee1;font-family:sans-serif;padding:40px;"><h2>Error loading transcript</h2><pre>' + escapeHtml(e.message) + '</pre></body></html>');
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

// ─── Wallet stats (global — wallets have no guild_id) ─────────────────────────
app.get('/api/wallet/stats', auth, (req, res) => {
  try {
    const activeWallets = db.all('SELECT COUNT(*) as c FROM wallets')[0]?.c ?? 0;
    const totalDeposited = db.all(
      "SELECT COALESCE(SUM(amount),0) as s FROM wallet_transactions WHERE type='deposit' AND status='confirmed'"
    )[0]?.s ?? 0;
    const totalWithdrawn = db.all(
      "SELECT COALESCE(SUM(amount),0) as s FROM wallet_transactions WHERE type='withdrawal' AND status='confirmed'"
    )[0]?.s ?? 0;
    const pendingCount = db.all(
      "SELECT COUNT(*) as c FROM wallet_transactions WHERE status='pending'"
    )[0]?.c ?? 0;
    res.json({ activeWallets, totalDeposited, totalWithdrawn, pendingCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/wallet/transactions', auth, (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const coin   = req.query.coin   || null;
  const type   = req.query.type   || null;
  const status = req.query.status || null;
  try {
    let where = 'WHERE 1=1';
    const params = [];
    if (coin)   { where += ' AND address LIKE ?'; params.push(`%${coin.toLowerCase()}%`); }
    if (type)   { where += ' AND type=?';   params.push(type); }
    if (status) { where += ' AND status=?'; params.push(status); }

    const rows = db.all(
      `SELECT * FROM wallet_transactions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const total = db.all(`SELECT COUNT(*) as c FROM wallet_transactions ${where}`, params)[0]?.c ?? 0;
    res.json({
      transactions: rows.map(t => ({
        id: t.id,
        user_id: t.user_id,
        type: t.type,
        amount: t.amount,
        address: t.address,
        txid: t.txid || null,
        status: t.status,
        created_at: new Date(t.created_at * 1000).toISOString(),
      })),
      total,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Wallet guild config (per-guild coin settings) ────────────────────────────
app.get('/api/guild/:guildId/wallet/config', auth, (req, res) => {
  try {
    const row = db.all(
      'SELECT config FROM dashboard_wallet_config WHERE guild_id=?',
      [req.params.guildId]
    )[0];
    res.json(row ? JSON.parse(row.config) : {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/guild/:guildId/wallet/config', auth, (req, res) => {
  try {
    db.run(
      'INSERT INTO dashboard_wallet_config (guild_id, config) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET config=excluded.config',
      [req.params.guildId, JSON.stringify(req.body)]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Guild list (which guilds the bot is in) ──────────────────────────────────
app.get('/api/guilds', auth, (req, res) => {
  try {
    const client = req.app.locals.client;
    const ids = client?.guilds?.cache?.map(g => g.id) ?? [];
    res.json(ids);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── Start ────────────────────────────────────────────────────────────────────

// Phase 1: bind the port immediately so Railway's health check gets a response
// even while the DB is still retrying to open. No DB needed here.
function startServer() {
  const port = process.env.PORT || process.env.API_PORT || 4000;
  app.listen(port, () => console.log(`[API] Running on port ${port}`));
}

// Phase 2: wire up DB-dependent routes and set client reference.
// Called AFTER _dbReady resolves.
function startApi(client) {
  app.locals.client = client;

  // Ensure keyword_pings table exists
  db.run(`CREATE TABLE IF NOT EXISTS keyword_pings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    keyword TEXT NOT NULL
  )`);

  // Per-guild wallet coin config for dashboard
  db.run(`CREATE TABLE IF NOT EXISTS dashboard_wallet_config (
    guild_id TEXT PRIMARY KEY,
    config TEXT NOT NULL DEFAULT '{}'
  )`);

  // Member count endpoint
  app.get('/api/guild/:guildId/member-count', auth, async (req, res) => {
    try {
      const guild = await client.guilds.fetch(req.params.guildId);
      res.json({ count: guild.memberCount });
    } catch {
      res.json({ count: 0 });
    }
  });
}

module.exports = { startServer, startApi };
