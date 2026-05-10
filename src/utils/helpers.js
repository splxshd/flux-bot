'use strict';

const ms = require('ms');

function parseDuration(str) {
  if (!str) return null;
  const parsed = ms(str);
  return typeof parsed === 'number' ? parsed : null;
}

function formatDuration(ms) {
  if (!ms) return 'Permanent';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function timestamp(unixSecs) {
  return `<t:${unixSecs}:R>`;
}

function truncate(str, max = 1024) {
  if (!str) return 'N/A';
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function isOwner(client, userId) {
  if (process.env.OWNER_ID && userId === process.env.OWNER_ID) return true;
  const app = client.application;
  if (!app || !app.owner) return false;
  if (app.owner.id) return app.owner.id === userId;
  if (app.owner.members) return app.owner.members.has(userId);
  return false;
}

function formatLtc(sats) {
  return (sats / 1e8).toFixed(8);
}

function safeParseJson(str, fallback = []) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = { parseDuration, formatDuration, timestamp, truncate, chunk, isOwner, formatLtc, safeParseJson };
