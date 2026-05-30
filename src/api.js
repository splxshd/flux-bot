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

function colorToHex(color) {
  if (!color) return '#1e1f22';
  return '#' + (color & 0xFFFFFF).toString(16).padStart(6, '0');
}

function renderContent(str) {
  if (!str) return '';
  let h = escapeHtml(str);
  // Code blocks
  h = h.replace(/```(?:\w+\n)?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  // Inline code
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold + italic
  h = h.replace(/\*\*\*(.+?)\*\*\*/gs, '<strong><em>$1</em></strong>');
  // Bold
  h = h.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
  // Italic
  h = h.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  // Strikethrough
  h = h.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  // Discord mentions (after HTML escape: &lt;@123&gt;)
  h = h.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@user</span>');
  h = h.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#channel</span>');
  h = h.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@role</span>');
  // Newlines
  h = h.replace(/\n/g, '<br>');
  return h;
}

function renderEmbed(e) {
  const border = colorToHex(e.color);
  const bodyParts = [];

  if (e.author) {
    const icon = e.author.iconURL ? `<img src="${escapeHtml(e.author.iconURL)}" onerror="this.style.display='none'" alt="">` : '';
    bodyParts.push(`<div class="e-author">${icon}<span>${escapeHtml(e.author.name)}</span></div>`);
  }
  if (e.title) {
    const t = e.url
      ? `<a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.title)}</a>`
      : escapeHtml(e.title);
    bodyParts.push(`<div class="e-title">${t}</div>`);
  }
  if (e.description) {
    bodyParts.push(`<div class="e-desc">${renderContent(e.description)}</div>`);
  }
  if (e.fields && e.fields.length > 0) {
    const fieldHtml = e.fields.map(f =>
      `<div class="e-field${f.inline ? ' inline' : ''}">` +
        `<div class="e-fname">${renderContent(f.name)}</div>` +
        `<div class="e-fval">${renderContent(f.value)}</div>` +
      `</div>`
    ).join('');
    bodyParts.push(`<div class="e-fields">${fieldHtml}</div>`);
  }
  if (e.image) {
    bodyParts.push(`<img class="e-image" src="${escapeHtml(e.image)}" onerror="this.style.display='none'" alt="">`);
  }
  if (e.footer) {
    const fIcon = e.footer.iconURL ? `<img src="${escapeHtml(e.footer.iconURL)}" onerror="this.style.display='none'" alt="">` : '';
    const fTs   = e.timestamp
      ? ` <span class="e-footer-sep">•</span> <span>${escapeHtml(new Date(e.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>`
      : '';
    bodyParts.push(`<div class="e-footer">${fIcon}<span>${escapeHtml(e.footer.text)}</span>${fTs}</div>`);
  }

  const thumb = e.thumbnail
    ? `<img class="e-thumb" src="${escapeHtml(e.thumbnail)}" onerror="this.style.display='none'" alt="">`
    : '';

  return `<div class="embed" style="border-left-color:${border}"><div class="e-body">${bodyParts.join('')}</div>${thumb}</div>`;
}

function renderComponents(components) {
  if (!components || !components.length) return '';
  const btns = [];
  const styleMap = { 1: 'btn-primary', 2: 'btn-secondary', 3: 'btn-success', 4: 'btn-danger', 5: 'btn-link' };
  for (const row of components) {
    for (const c of (row.components || [])) {
      if (c.type !== 2) continue; // buttons only
      const cls = `btn ${styleMap[c.style] || 'btn-secondary'}${c.disabled ? ' btn-disabled' : ''}`;
      const emoji = c.emoji ? `<span>${escapeHtml(c.emoji)}</span> ` : '';
      const label = c.label ? escapeHtml(c.label) : '';
      if (c.url) {
        btns.push(`<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" class="${cls}">${emoji}${label}</a>`);
      } else {
        btns.push(`<span class="${cls}">${emoji}${label}</span>`);
      }
    }
  }
  return btns.length ? `<div class="components-row">${btns.join('')}</div>` : '';
}

app.get('/transcript/:token', (req, res) => {
  try {
    const row = db.getTranscript(req.params.token);
    if (!row) return res.status(404).send('<!DOCTYPE html><html><body style="background:#313338;color:#dbdee1;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><h2>Transcript not found.</h2></body></html>');

    let meta     = null;
    let messages = [];
    try {
      const parsed = JSON.parse(row.content);
      if (Array.isArray(parsed)) {
        messages = parsed; // old format compatibility
      } else {
        meta     = parsed.meta;
        messages = parsed.messages || [];
      }
    } catch {}

    const ticketNum   = meta?.ticketNumber || String(row.ticket_number || 0).padStart(4, '0');
    const channelName = meta?.channelName  || `ticket-${ticketNum}`;
    const guildName   = meta?.guildName    || 'Discord Server';
    const guildIcon   = meta?.guildIcon    || '';
    const generatedAt = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

    // Group consecutive messages from the same author within 7 minutes
    const THRESHOLD = 7 * 60 * 1000;
    const groups = [];
    for (const m of messages) {
      const last = groups[groups.length - 1];
      if (last && last.authorId === m.authorId && m.time - last.lastTime < THRESHOLD) {
        last.msgs.push(m);
        last.lastTime = m.time;
      } else {
        groups.push({ authorId: m.authorId, authorTag: m.authorTag, authorAvatar: m.authorAvatar, isBot: m.isBot, firstTime: m.time, lastTime: m.time, msgs: [m] });
      }
    }

    function fmtTime(ts) {
      return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    function fmtDate(ts) {
      return new Date(ts).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    let lastDay = null;
    const msgHtml = groups.map(g => {
      const day = new Date(g.firstTime).toDateString();
      let divider = '';
      if (day !== lastDay) {
        lastDay = day;
        divider = `<div class="day-divider"><div class="line"></div><div class="date">${escapeHtml(fmtDate(g.firstTime))}</div><div class="line"></div></div>`;
      }

      const bodies = g.msgs.map((m, idx) => {
        const ts      = fmtTime(m.time);
        const text    = m.content   ? `<div class="msg-text">${renderContent(m.content)}</div>` : '';
        const embeds  = (m.embeds   || []).map(renderEmbed).join('');
        const comps   = renderComponents(m.components);
        const atts    = (m.attachments || []).map(a => {
          const isImg = (a.contentType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(a.name || '');
          return isImg
            ? `<div class="attachment"><img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.name)}" onerror="this.style.display='none'"></div>`
            : `<div class="attachment">📎 <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.name)}</a></div>`;
        }).join('');

        if (idx === 0) {
          const botTag = g.isBot ? ' <span class="bot-tag">APP</span>' : '';
          return `<div class="msg-group has-header">
            <div class="avatar-wrap"><img class="avatar" src="${escapeHtml(g.authorAvatar || '')}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" alt=""></div>
            <div class="msg-content">
              <div class="msg-header"><span class="username">${escapeHtml(g.authorTag)}</span>${botTag}<span class="timestamp">${escapeHtml(ts)}</span></div>
              ${text}${embeds}${atts}${comps}
            </div>
          </div>`;
        }
        return `<div class="msg-group">
            <div class="avatar-spacer"><span class="msg-ts">${escapeHtml(ts)}</span></div>
            <div class="msg-content">${text}${embeds}${atts}${comps}</div>
          </div>`;
      }).join('');

      return divider + bodies;
    }).join('');

    const guildBarHtml = guildIcon
      ? `<div class="guild-bar"><img class="guild-icon" src="${escapeHtml(guildIcon)}" onerror="this.style.display='none'" alt=""><span class="guild-name">${escapeHtml(guildName)}</span></div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>#${escapeHtml(channelName)} — Transcript</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#313338;color:#dbdee1;font-family:'gg sans','Noto Sans','Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.375}
    a{color:#00a8fc;text-decoration:none}
    a:hover{text-decoration:underline}
    strong{font-weight:700}
    em{font-style:italic}
    code{background:#1e1f22;font-family:Consolas,Monaco,'Courier New',monospace;font-size:.875em;padding:2px 6px;border-radius:3px}
    pre{background:#1e1f22;border-radius:4px;padding:12px;overflow-x:auto;margin:4px 0}
    pre code{padding:0;background:none}
    s{text-decoration:line-through}
    /* Guild bar */
    .guild-bar{background:#1e1f22;padding:10px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #111214}
    .guild-icon{width:28px;height:28px;border-radius:50%;object-fit:cover}
    .guild-name{font-size:14px;font-weight:700;color:#f2f3f5}
    /* Channel header */
    .channel-bar{background:#2b2d31;height:48px;display:flex;align-items:center;padding:0 16px;gap:8px;border-bottom:1px solid #1e1f22;position:sticky;top:0;z-index:100}
    .hash{color:#80848e;font-size:22px;font-weight:900;line-height:1;margin-right:2px}
    .ch-name{font-weight:700;font-size:16px;color:#f2f3f5}
    .ch-sep{width:1px;height:20px;background:#3f4147;margin:0 10px}
    .ch-label{color:#949ba4;font-size:14px}
    /* Messages */
    .msgs-wrap{padding-bottom:40px}
    /* Welcome */
    .welcome{padding:24px 16px 20px}
    .welcome-circle{width:68px;height:68px;border-radius:50%;background:#5865f2;display:flex;align-items:center;justify-content:center;font-size:34px;margin-bottom:16px}
    .welcome-title{font-size:24px;font-weight:700;color:#f2f3f5;margin-bottom:6px}
    .welcome-sub{color:#949ba4;font-size:15px}
    /* Day divider */
    .day-divider{display:flex;align-items:center;gap:8px;padding:16px 16px 4px}
    .day-divider .line{flex:1;height:1px;background:#3f4147}
    .day-divider .date{color:#949ba4;font-size:12px;font-weight:600;white-space:nowrap;padding:0 4px}
    /* Message groups */
    .msg-group{padding:2px 16px;display:flex;gap:16px}
    .msg-group:hover{background:rgba(0,0,0,.06)}
    .msg-group.has-header{padding-top:8px;margin-top:4px}
    .avatar-wrap{width:40px;flex-shrink:0;padding-top:2px}
    .avatar{width:40px;height:40px;border-radius:50%;object-fit:cover}
    .avatar-spacer{width:40px;flex-shrink:0;display:flex;align-items:flex-start;justify-content:flex-end;padding-top:5px}
    .msg-ts{color:#72767d;font-size:10px;opacity:0;transition:opacity .1s;white-space:nowrap}
    .msg-group:hover .msg-ts{opacity:1}
    .msg-content{flex:1;min-width:0;padding-bottom:2px}
    .msg-header{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;margin-bottom:2px}
    .username{font-weight:500;font-size:16px;color:#f2f3f5}
    .bot-tag{background:#5865f2;color:#fff;font-size:10px;font-weight:700;padding:2px 5px;border-radius:3px;letter-spacing:.2px;line-height:1;flex-shrink:0;align-self:center}
    .timestamp{color:#949ba4;font-size:12px}
    .msg-text{color:#dbdee1;font-size:16px;word-break:break-word;margin-bottom:2px}
    /* Embeds */
    .embed{background:#2b2d31;border-radius:4px;border-left:4px solid #1e1f22;max-width:520px;margin-top:4px;padding:8px 12px 12px 12px;display:flex;gap:16px;align-items:flex-start}
    .e-body{flex:1;min-width:0}
    .e-author{display:flex;align-items:center;gap:8px;margin-top:4px;margin-bottom:4px}
    .e-author img{width:24px;height:24px;border-radius:50%}
    .e-author span{font-size:14px;font-weight:600;color:#dbdee1}
    .e-title{font-size:15px;font-weight:700;color:#dbdee1;margin-top:6px;line-height:1.3}
    .e-title a{color:#00a8fc}
    .e-desc{font-size:14px;color:#dbdee1;margin-top:6px;word-break:break-word;line-height:1.5}
    .e-fields{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
    .e-field{flex:0 0 100%}
    .e-field.inline{flex:0 0 calc(33.333% - 6px);min-width:80px}
    .e-fname{font-size:13px;font-weight:700;color:#dbdee1;margin-bottom:2px}
    .e-fval{font-size:13px;color:#dbdee1;word-break:break-word}
    .e-image{max-width:100%;max-height:350px;border-radius:4px;margin-top:10px;display:block}
    .e-thumb{width:80px;height:80px;object-fit:cover;border-radius:4px;flex-shrink:0;margin-top:4px}
    .e-footer{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:8px}
    .e-footer img{width:20px;height:20px;border-radius:50%}
    .e-footer span,.e-footer-sep{font-size:12px;color:#949ba4}
    /* Attachments */
    .attachment{margin-top:4px}
    .attachment img{max-width:400px;max-height:280px;border-radius:4px;display:block;margin-top:2px}
    .attachment a{font-size:14px}
    /* Components */
    .components-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border-radius:3px;font-size:14px;font-weight:500;cursor:default;text-decoration:none!important;user-select:none}
    .btn-primary{background:#5865f2;color:#fff}
    .btn-secondary{background:#4e5058;color:#dbdee1}
    .btn-success{background:#248046;color:#fff}
    .btn-danger{background:#da373c;color:#fff}
    .btn-link{background:transparent;color:#dbdee1;border:1px solid #4e5058}
    .btn-disabled{opacity:.5}
    /* Mentions */
    .mention{background:rgba(88,101,242,.15);color:#c9cdfb;padding:0 3px;border-radius:3px;font-weight:500}
    /* Footer */
    .t-footer{text-align:center;color:#72767d;font-size:13px;padding:28px 16px;border-top:1px solid #3f4147;margin-top:8px}
    .t-footer strong{color:#949ba4}
  </style>
</head>
<body>
  ${guildBarHtml}
  <div class="channel-bar">
    <span class="hash">#</span>
    <span class="ch-name">${escapeHtml(channelName)}</span>
    <div class="ch-sep"></div>
    <span class="ch-label">Ticket #${escapeHtml(ticketNum)} — Transcript</span>
  </div>
  <div class="msgs-wrap">
    <div class="welcome">
      <div class="welcome-circle">🎫</div>
      <div class="welcome-title">Welcome to #${escapeHtml(channelName)}!</div>
      <div class="welcome-sub">This is the beginning of the <strong>#${escapeHtml(channelName)}</strong> channel.</div>
    </div>
    ${msgHtml}
  </div>
  <div class="t-footer">
    <strong>nights bot</strong> &bull; <strong>#${escapeHtml(channelName)}</strong> &bull; ${messages.length} message${messages.length !== 1 ? 's' : ''} &bull; Generated ${escapeHtml(generatedAt)}
  </div>
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

// ─── Internal Dashboard Bridge Endpoints ─────────────────────────────────────
// All POST /internal/* — used by nights-dashboard via bot-bridge.js
// Auth is the same Bearer API_SECRET as all other routes.

app.post('/internal/ban', auth, async (req, res) => {
  const { guildId, userId, reason, deleteMessageDays } = req.body;
  if (!guildId || !userId) return res.status(400).json({ error: 'guildId and userId required' });
  try {
    const client = req.app.locals.client;
    const guild  = await client.guilds.fetch(guildId);
    await guild.bans.create(userId, { reason: reason || 'Banned via dashboard', deleteMessageSeconds: (deleteMessageDays || 0) * 86400 });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/unban', auth, async (req, res) => {
  const { guildId, userId, reason } = req.body;
  if (!guildId || !userId) return res.status(400).json({ error: 'guildId and userId required' });
  try {
    const client = req.app.locals.client;
    const guild  = await client.guilds.fetch(guildId);
    await guild.bans.remove(userId, reason || 'Unbanned via dashboard');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/kick', auth, async (req, res) => {
  const { guildId, userId, reason } = req.body;
  if (!guildId || !userId) return res.status(400).json({ error: 'guildId and userId required' });
  try {
    const client = req.app.locals.client;
    const guild  = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.kick(reason || 'Kicked via dashboard');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/mute', auth, async (req, res) => {
  const { guildId, userId, reason, durationMs } = req.body;
  if (!guildId || !userId) return res.status(400).json({ error: 'guildId and userId required' });
  try {
    const client = req.app.locals.client;
    const guild  = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    // Use Discord timeout (max 28 days)
    const ms = Math.min(durationMs || 600_000, 28 * 24 * 60 * 60 * 1000);
    await member.timeout(ms, reason || 'Muted via dashboard');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/unmute', auth, async (req, res) => {
  const { guildId, userId, reason } = req.body;
  if (!guildId || !userId) return res.status(400).json({ error: 'guildId and userId required' });
  try {
    const client = req.app.locals.client;
    const guild  = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.timeout(null, reason || 'Unmuted via dashboard');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/send-message', auth, async (req, res) => {
  const { guildId, channelId, content } = req.body;
  if (!guildId || !channelId || !content) return res.status(400).json({ error: 'guildId, channelId, content required' });
  try {
    const client  = req.app.locals.client;
    const guild   = await client.guilds.fetch(guildId);
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const msg = await channel.send(content);
    res.json({ ok: true, messageId: msg.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/send-embed', auth, async (req, res) => {
  const { guildId, channelId, embed } = req.body;
  if (!guildId || !channelId || !embed) return res.status(400).json({ error: 'guildId, channelId, embed required' });
  try {
    const { EmbedBuilder } = require('discord.js');
    const client  = req.app.locals.client;
    const guild   = await client.guilds.fetch(guildId);
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const emb = new EmbedBuilder();
    if (embed.title)       emb.setTitle(embed.title);
    if (embed.description) emb.setDescription(embed.description);
    if (embed.color)       emb.setColor(embed.color);
    if (embed.footer)      emb.setFooter({ text: embed.footer });
    if (embed.author)      emb.setAuthor({ name: embed.author, iconURL: embed.authorIcon || undefined });
    if (embed.image)       emb.setImage(embed.image);
    if (embed.thumbnail)   emb.setThumbnail(embed.thumbnail);
    if (Array.isArray(embed.fields)) {
      for (const f of embed.fields) {
        if (f.name && f.value) emb.addFields({ name: f.name, value: f.value, inline: !!f.inline });
      }
    }
    const msg = await channel.send({ embeds: [emb] });
    res.json({ ok: true, messageId: msg.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/lock-server', auth, async (req, res) => {
  const { guildId, reason } = req.body;
  if (!guildId) return res.status(400).json({ error: 'guildId required' });
  try {
    const { PermissionFlagsBits } = require('discord.js');
    const client = req.app.locals.client;
    const guild  = await client.guilds.fetch(guildId);
    await guild.channels.fetch();
    const everyone = guild.roles.everyone;
    const failed = [];
    for (const [, ch] of guild.channels.cache) {
      if (ch.type !== 0) continue; // text channels only
      try {
        await ch.permissionOverwrites.edit(everyone, { SendMessages: false }, { reason: reason || 'Server lockdown via dashboard' });
      } catch { failed.push(ch.id); }
    }
    res.json({ ok: true, failed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/unlock-server', auth, async (req, res) => {
  const { guildId, reason } = req.body;
  if (!guildId) return res.status(400).json({ error: 'guildId required' });
  try {
    const client = req.app.locals.client;
    const guild  = await client.guilds.fetch(guildId);
    await guild.channels.fetch();
    const everyone = guild.roles.everyone;
    const failed = [];
    for (const [, ch] of guild.channels.cache) {
      if (ch.type !== 0) continue;
      try {
        await ch.permissionOverwrites.edit(everyone, { SendMessages: null }, { reason: reason || 'Server unlocked via dashboard' });
      } catch { failed.push(ch.id); }
    }
    res.json({ ok: true, failed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/end-giveaway', auth, async (req, res) => {
  const { guildId, giveawayId } = req.body;
  if (!guildId || !giveawayId) return res.status(400).json({ error: 'guildId and giveawayId required' });
  try {
    const giveaway = db.getGiveaway(parseInt(giveawayId));
    if (!giveaway) return res.status(404).json({ error: 'Giveaway not found' });
    const entries = db.getEntries(parseInt(giveawayId));
    db.endGiveaway(parseInt(giveawayId));
    const winnerCount = giveaway.winners || 1;
    const winners = [];
    if (entries.length > 0) {
      const shuffled = [...entries].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(winnerCount, shuffled.length); i++) winners.push(shuffled[i].user_id);
    }
    try {
      const client  = req.app.locals.client;
      const guild   = await client.guilds.fetch(guildId);
      const channel = guild.channels.cache.get(giveaway.channel_id) || await guild.channels.fetch(giveaway.channel_id);
      if (channel) {
        const text = winners.length ? winners.map(w => `<@${w}>`).join(', ') : 'No valid entries';
        await channel.send({ content: `🎉 **${giveaway.prize}** ended! Winners: ${text}` });
      }
    } catch {}
    res.json({ ok: true, winners });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/reroll-giveaway', auth, async (req, res) => {
  const { guildId, giveawayId } = req.body;
  if (!guildId || !giveawayId) return res.status(400).json({ error: 'guildId and giveawayId required' });
  try {
    const giveaway = db.getGiveaway(parseInt(giveawayId));
    if (!giveaway) return res.status(404).json({ error: 'Giveaway not found' });
    const entries = db.getEntries(parseInt(giveawayId));
    if (!entries.length) return res.status(400).json({ error: 'No entries' });
    const winner = entries[Math.floor(Math.random() * entries.length)].user_id;
    try {
      const client  = req.app.locals.client;
      const guild   = await client.guilds.fetch(guildId);
      const channel = guild.channels.cache.get(giveaway.channel_id) || await guild.channels.fetch(giveaway.channel_id);
      if (channel) await channel.send({ content: `🎉 **${giveaway.prize}** rerolled! New winner: <@${winner}>` });
    } catch {}
    res.json({ ok: true, winner });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/close-ticket', auth, async (req, res) => {
  const { guildId, ticketId, reason } = req.body;
  if (!guildId || !ticketId) return res.status(400).json({ error: 'guildId and ticketId required' });
  try {
    const ticket = db.all('SELECT * FROM tickets WHERE id=? AND guild_id=?', [ticketId, guildId])[0];
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    db.run("UPDATE tickets SET status='closed', closed_at=? WHERE id=?", [Math.floor(Date.now() / 1000), ticketId]);
    // Optionally delete or archive channel
    try {
      const client  = req.app.locals.client;
      const guild   = await client.guilds.fetch(guildId);
      const channel = ticket.channel_id ? (guild.channels.cache.get(ticket.channel_id) || await guild.channels.fetch(ticket.channel_id).catch(() => null)) : null;
      if (channel) await channel.send({ content: `🔒 Ticket closed${reason ? `: ${reason}` : ''} — by dashboard` }).catch(() => {});
    } catch {}
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/add-role', auth, async (req, res) => {
  const { guildId, userId, roleId, reason } = req.body;
  if (!guildId || !userId || !roleId) return res.status(400).json({ error: 'guildId, userId, roleId required' });
  try {
    const client = req.app.locals.client;
    const guild  = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.roles.add(roleId, reason || 'Added via dashboard');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/remove-role', auth, async (req, res) => {
  const { guildId, userId, roleId, reason } = req.body;
  if (!guildId || !userId || !roleId) return res.status(400).json({ error: 'guildId, userId, roleId required' });
  try {
    const client = req.app.locals.client;
    const guild  = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.roles.remove(roleId, reason || 'Removed via dashboard');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/set-bot-status', auth, async (req, res) => {
  const { status, activityType, activityText } = req.body;
  try {
    const client = req.app.locals.client;
    const presenceStatus = status || 'online'; // online | idle | dnd | invisible
    const { ActivityType } = require('discord.js');
    const typeMap = { PLAYING: ActivityType.Playing, WATCHING: ActivityType.Watching, LISTENING: ActivityType.Listening, COMPETING: ActivityType.Competing, STREAMING: ActivityType.Streaming };
    const activities = activityText
      ? [{ name: activityText, type: typeMap[activityType] ?? ActivityType.Playing }]
      : [];
    client.user.setPresence({ status: presenceStatus, activities });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/internal/post-panel', auth, async (req, res) => {
  // Re-use the existing /api/guild/:guildId/panel/send logic
  const { guildId, channelId, embedData, dropdown } = req.body;
  if (!guildId || !channelId) return res.status(400).json({ error: 'guildId and channelId required' });
  try {
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const client  = req.app.locals.client;
    const guild   = await client.guilds.fetch(guildId);
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const emb = new EmbedBuilder();
    if (embedData?.title)       emb.setTitle(embedData.title);
    if (embedData?.description) emb.setDescription(embedData.description);
    if (embedData?.color)       emb.setColor(embedData.color);
    if (embedData?.footer)      emb.setFooter({ text: embedData.footer });

    const components = [];
    if (dropdown?.buttonLabel) {
      const styleMap = { PRIMARY: ButtonStyle.Primary, SECONDARY: ButtonStyle.Secondary, SUCCESS: ButtonStyle.Success, DANGER: ButtonStyle.Danger };
      const btn = new ButtonBuilder()
        .setCustomId(`panel_open:${guildId}:${Date.now()}`)
        .setLabel(dropdown.buttonLabel)
        .setStyle(styleMap[dropdown.buttonStyle] ?? ButtonStyle.Primary);
      components.push(new ActionRowBuilder().addComponents(btn));
    }

    const msg = await channel.send({ embeds: embedData ? [emb] : [], components });
    res.json({ ok: true, messageId: msg.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
