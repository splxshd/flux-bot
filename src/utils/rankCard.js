'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

// Register fonts
const FONT_CANDIDATES = [
  path.join(__dirname, '../../node_modules/@fontsource/open-sans/files/open-sans-latin-700-normal.woff2'),
  path.join(__dirname, '../../node_modules/@fontsource/open-sans/files/open-sans-latin-400-normal.woff2'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
];

let FONT = 'sans-serif';
for (const fp of FONT_CANDIDATES) {
  if (fs.existsSync(fp)) {
    try { GlobalFonts.registerFromPath(fp, 'Card'); FONT = 'Card'; break; } catch {}
  }
}

const W = 800;
const H = 200;
const PAD = 20;
const AVR = (H - PAD * 2) / 2; // avatar radius fills card height
const AVX = PAD + AVR;
const AVY = H / 2;

function levelColor(level) {
  if (level >= 50) return '#FF6B6B';
  if (level >= 30) return '#FFD700';
  if (level >= 20) return '#E040FB';
  if (level >= 10) return '#00E5FF';
  if (level >= 5)  return '#69F0AE';
  return '#5865F2';
}

async function generateRankCard({ username, avatarUrl, level, xp, xpIntoLevel, xpNeeded, rank }) {
  const accent = levelColor(level);
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#0d0f17';
  ctx.fillRect(0, 0, W, H);

  // Right diagonal teal accent
  ctx.save();
  const accentGrad = ctx.createLinearGradient(W - 220, 0, W, 0);
  accentGrad.addColorStop(0, 'rgba(0,0,0,0)');
  accentGrad.addColorStop(1, hexAlpha(accent, 0.25));
  ctx.fillStyle = accentGrad;
  ctx.beginPath();
  ctx.moveTo(W - 220, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H);
  ctx.lineTo(W - 280, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── Avatar ──────────────────────────────────────────────────────────────────
  // Colored ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(AVX, AVY, AVR + 3, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.restore();

  // Clip & draw avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(AVX, AVY, AVR, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(avatarUrl);
    // Draw centered square within circle
    ctx.drawImage(img, AVX - AVR, AVY - AVR, AVR * 2, AVR * 2);
  } catch {
    ctx.fillStyle = '#2b2d31';
    ctx.fill();
  }
  ctx.restore();

  // ── Text ────────────────────────────────────────────────────────────────────
  const TX = AVX + AVR + 28;
  const barW = W - TX - PAD;
  const barH = 18;
  const barY = H - PAD - barH;

  // Username
  ctx.font      = `bold 40px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  const name = username.length > 20 ? username.slice(0, 18) + '…' : username;
  ctx.fillText(`@${name}`, TX, 38);

  // Stats line: Level · XP · Rank
  ctx.font      = `22px ${FONT}`;
  ctx.fillStyle = '#8b8fa8';
  ctx.textBaseline = 'top';
  const statsY = 92;

  // "Level: " label
  ctx.fillStyle = '#8b8fa8';
  ctx.fillText('Level: ', TX, statsY);
  let cx = TX + ctx.measureText('Level: ').width;

  ctx.font      = `bold 22px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${level}`, cx, statsY);
  cx += ctx.measureText(`${level}`).width + 28;

  ctx.font      = `22px ${FONT}`;
  ctx.fillStyle = '#8b8fa8';
  ctx.fillText('XP: ', cx, statsY);
  cx += ctx.measureText('XP: ').width;

  ctx.font      = `bold 22px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  const xpStr = `${fmt(xpIntoLevel)} / ${fmt(xpNeeded)}`;
  ctx.fillText(xpStr, cx, statsY);
  cx += ctx.measureText(xpStr).width + 28;

  ctx.font      = `22px ${FONT}`;
  ctx.fillStyle = '#8b8fa8';
  ctx.fillText('Rank: ', cx, statsY);
  cx += ctx.measureText('Rank: ').width;

  ctx.font      = `bold 22px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.fillText(rank ? `#${rank}` : '—', cx, statsY);

  // ── Progress bar ─────────────────────────────────────────────────────────────
  const pct = xpNeeded > 0 ? Math.min(xpIntoLevel / xpNeeded, 1) : 0;

  // Track
  ctx.beginPath();
  roundRect(ctx, TX, barY, barW, barH, barH / 2);
  ctx.fillStyle = '#1e2030';
  ctx.fill();

  // Fill
  if (pct > 0) {
    const fillW = Math.max(barH, barW * pct);
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 12;
    const barGrad = ctx.createLinearGradient(TX, 0, TX + barW, 0);
    barGrad.addColorStop(0, hexAlpha(accent, 0.6));
    barGrad.addColorStop(1, accent);
    ctx.fillStyle = barGrad;
    roundRect(ctx, TX, barY, fillW, barH, barH / 2);
    ctx.fill();
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

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

function fmt(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

module.exports = { generateRankCard };
