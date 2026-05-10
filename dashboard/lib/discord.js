'use strict';
const fetch = require('node-fetch');

const API = 'https://discord.com/api/v10';

async function discordRequest(endpoint, token, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${endpoint}`, opts);
  if (!res.ok) throw new Error(`Discord API ${res.status}: ${endpoint}`);
  return res.json();
}

async function botRequest(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${endpoint}`, opts);
  if (!res.ok) return null;
  if (res.status === 204) return true;
  return res.json();
}

function getUser(token)   { return discordRequest('/users/@me', token); }
function getGuilds(token) { return discordRequest('/users/@me/guilds', token); }

async function getMutualGuilds(userGuilds) {
  const botGuildIds = new Set();
  let after = null;
  while (true) {
    const url = after ? `/users/@me/guilds?limit=200&after=${after}` : '/users/@me/guilds?limit=200';
    const batch = await botRequest(url).catch(() => []);
    if (!batch || !batch.length) break;
    batch.forEach(g => botGuildIds.add(g.id));
    if (batch.length < 200) break;
    after = batch[batch.length - 1].id;
  }
  return userGuilds.filter(g => botGuildIds.has(g.id));
}

async function getBotGuilds() {
  const guilds = [];
  let after = null;
  while (true) {
    const url = after ? `/users/@me/guilds?limit=200&after=${after}` : '/users/@me/guilds?limit=200';
    const batch = await botRequest(url).catch(() => []);
    if (!batch || !batch.length) break;
    guilds.push(...batch);
    if (batch.length < 200) break;
    after = batch[batch.length - 1].id;
  }
  return guilds;
}

async function getGuildMember(guildId, userId) {
  return botRequest(`/guilds/${guildId}/members/${userId}`);
}

async function getGuild(guildId) {
  return botRequest(`/guilds/${guildId}?with_counts=true`);
}

async function setActivity(type, text) {
  // Uses the bot token via Gateway — for REST we can update presence via /gateway/bot
  // This is a placeholder; real implementation needs Gateway connection
  return { type, text };
}

function avatarUrl(user, size = 128) {
  if (!user) return `https://cdn.discordapp.com/embed/avatars/0.png`;
  if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=${size}`;
}

function guildIconUrl(guild, size = 64) {
  if (!guild?.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=${size}`;
}

function hasManageGuild(permissions) {
  return (BigInt(permissions) & 0x20n) !== 0n || (BigInt(permissions) & 0x8n) !== 0n;
}

function exchangeCode(code) {
  return fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type:    'authorization_code',
      code,
      redirect_uri:  process.env.DISCORD_REDIRECT_URI,
    }),
  }).then(r => r.json());
}

module.exports = { getUser, getGuilds, getMutualGuilds, getBotGuilds, getGuildMember, getGuild, avatarUrl, guildIconUrl, hasManageGuild, exchangeCode, botRequest };
