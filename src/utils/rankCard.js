'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

// Register fonts — try @fontsource/open-sans woff2 files bundled in node_modules
const FONT_CANDIDATES = [
  // @fontsource/open-sans v5
  ['open-sans-latin-700-normal.woff2', 'OpenSans'],
  ['open-sans-latin-400-normal.woff2', 'OpenSans'],
  // fallback: common Linux system fonts on Railway
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'OpenSans'],
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'OpenSans'],
  ['/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 'OpenSans'],
];

let FONT = 'sans-serif';

for (const [file, family] of FONT_CANDIDATES) {
  const full = file.startsWith('/') ? file
    : path.join(__dirname, '../../node_modules/@fontsource/open-sans/files', file);
  if (fs.existsSync(full)) {
    try {
      GlobalFonts.registerFromPath(full, family);
      FONT = family;
      break;
    } catch {}
  }
}

const W = 934;
const H = 280;

function levelColor(level) {
  if (level >= 50) return '#FF6B6B';
  if (level >= 30) return '#FFD700';
  if (level >= 20) return '#E040FB';
  if (level >= 10) return '#00E5FF';
  if (level >= 5)  return '#69F0AE';
  return '#5865F2';
}

function fmt(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * Generate a rank card image buffer.
 * @param {object} opts
 * @param {string} opts.username
 * @param {string} opts.avatarUrl
 * @param {number} opts.level
 * @param {number} opts.xp          — total XP
 * @param {number} opts.xpIntoLevel — XP earned within current level
 * @param {number} opts.xpNeeded    — XP needed for next level
 * @param {number|null} opts.rank
 * @param {number} opts.totalUsers
 */
async function generateRankCard(opts) {
  const { username, avatarUrl, level, xp, xpIntoLevel, xpNeeded, rank, totalUsers } = opts;
  const accent = levelColor(level);

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0f1015';
  ctx.fillRect(0, 0, W, H);

  // Subtle card surface
  roundRect(ctx, 10, 10, W - 20, H - 20, 18);
  ctx.fillStyle = '#16181d';
  ctx.fill();

  // Right accent diagonal
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W - 230, 10);
  ctx.lineTo(W - 10, 10);
  ctx.lineTo(W - 10, H - 10);
  ctx.lineTo(W - 280, H - 10);
  ctx.closePath();
  const grad = ctx.createLinearGradient(W - 280, 0, W, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, hexAlpha(accent, 0.18));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // Left accent bar
  roundRect(ctx, 10, 10, 6, H - 20, 3);
  ctx.fillStyle = accent;
  ctx.fill();

  // ── Avatar ──────────────────────────────────────────────────────────────────
  const AVX = 70;
  const AVY = H / 2;
  const AVR = 80;

  // Glow ring
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur  = 24;
  ctx.beginPath();
  ctx.arc(AVX, AVY, AVR + 5, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth   = 4;
  ctx.stroke();
  ctx.restore();

  // Avatar circle clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(AVX, AVY, AVR, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(avatarUrl);
    ctx.drawImage(img, AVX - AVR, AVY - AVR, AVR * 2, AVR * 2);
  } catch {
    ctx.fillStyle = '#2b2d31';
    ctx.fill();
  }
  ctx.restore();

  // ── Text area ───────────────────────────────────────────────────────────────
  const TX = AVX + AVR + 32;

  // Username
  ctx.font        = `bold 38px ${FONT}`;
  ctx.fillStyle   = '#ffffff';
  ctx.textBaseline = 'top';
  const nameText  = username.length > 18 ? username.slice(0, 16) + '…' : username;
  ctx.fillText(nameText, TX, 52);

  // Level badge pill
  const lvlLabel = `LEVEL ${level}`;
  ctx.font = `bold 16px ${FONT}`;
  const pillW = ctx.measureText(lvlLabel).width + 24;
  const pillX = TX;
  const pillY = 100;
  roundRect(ctx, pillX, pillY, pillW, 28, 14);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold 14px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(lvlLabel, pillX + 12, pillY + 14);

  // XP text
  ctx.font      = `22px ${FONT}`;
  ctx.fillStyle = '#b5bac1';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${fmt(xpIntoLevel)} / ${fmt(xpNeeded)} XP`, TX + pillW + 16, pillY + 14);

  // Rank
  const rankText = rank ? `#${rank}` : '—';
  ctx.font      = `bold 28px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  const rankLabel = 'RANK ';
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = '#80848e';
  const rlW = ctx.measureText(rankLabel).width;
  ctx.fillText(rankLabel, TX, 152);
  ctx.font = `bold 28px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.fillText(rankText, TX + rlW, 148);

  // Total XP
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = '#4e5058';
  ctx.fillText(`Total XP: ${fmt(xp)}`, TX + rlW + ctx.measureText(rankText).width + 24, 152);

  // ── Progress bar ─────────────────────────────────────────────────────────────
  const BAR_X = TX;
  const BAR_Y = 188;
  const BAR_W = W - TX - 50;
  const BAR_H = 18;
  const pct   = xpNeeded > 0 ? Math.min(xpIntoLevel / xpNeeded, 1) : 0;

  // Track
  roundRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, BAR_H / 2);
  ctx.fillStyle = '#2b2d31';
  ctx.fill();

  // Fill with glow
  if (pct > 0) {
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur  = 10;
    roundRect(ctx, BAR_X, BAR_Y, Math.max(BAR_H, BAR_W * pct), BAR_H, BAR_H / 2);
    const barGrad = ctx.createLinearGradient(BAR_X, 0, BAR_X + BAR_W, 0);
    barGrad.addColorStop(0, hexAlpha(accent, 0.7));
    barGrad.addColorStop(1, accent);
    ctx.fillStyle = barGrad;
    ctx.fill();
    ctx.restore();
  }

  // Percentage label
  ctx.font      = `bold 13px ${FONT}`;
  ctx.fillStyle = '#80848e';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(pct * 100)}%`, BAR_X + BAR_W, BAR_Y + BAR_H + 6);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

module.exports = { generateRankCard };
