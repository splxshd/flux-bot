'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs   = require('fs');
const path = require('path');

// ── Font loading ──────────────────────────────────────────────────────────────
const FONT_BASE = path.join(__dirname, '..', '..', 'node_modules', '@fontsource', 'open-sans', 'files');
const FONT_NAME = 'Open Sans';
let fontReady = false;

function ensureFont() {
  if (fontReady) return;
  try {
    const regular = path.join(FONT_BASE, 'open-sans-latin-400-normal.woff2');
    const bold    = path.join(FONT_BASE, 'open-sans-latin-700-normal.woff2');
    if (fs.existsSync(regular)) GlobalFonts.registerFromPath(regular, FONT_NAME);
    if (fs.existsSync(bold))    GlobalFonts.registerFromPath(bold,    FONT_NAME);
    fontReady = true;
  } catch (e) {
    console.warn('[leaderboardCard] font load failed:', e.message);
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const W      = 900;
const PAD    = 28;
const BG     = '#080808';
const CARD   = '#111111';
const ROW    = '#181818';
const WHITE  = '#ffffff';
const MUTED  = '#777777';
const ACCENT = '#5865F2';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']; // gold, silver, bronze

const F = (size, bold = false) =>
  `${bold ? 'bold ' : ''}${size}px "${FONT_NAME}", sans-serif`;

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

async function tryLoadImage(url) {
  try { return await loadImage(url); } catch { return null; }
}

// ── Main generator ────────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.guildName
 * @param {string|null} opts.guildIconUrl
 * @param {string} opts.period   — '1d' | '7d' | '30d'
 * @param {{ username: string, avatarUrl: string|null, count: number }[]} opts.entries
 */
async function generateLeaderboardCard({ guildName, guildIconUrl, period, entries }) {
  ensureFont();

  const ROW_H    = 64;
  const ROW_GAP  = 8;
  const HEADER_H = 88;
  const FOOTER_H = 40;
  const INNER_W  = W - PAD * 2;

  const H = HEADER_H + entries.length * (ROW_H + ROW_GAP) - ROW_GAP + FOOTER_H + PAD;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background ────────────────────────────────────────────────────────────
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ── Header card ───────────────────────────────────────────────────────────
  ctx.fillStyle = CARD;
  roundRect(ctx, PAD, PAD, INNER_W, HEADER_H - PAD, 12);
  ctx.fill();

  // Guild icon
  const ICON_R = 22;
  const iconCX = PAD + 20 + ICON_R;
  const iconCY = PAD + (HEADER_H - PAD) / 2;

  const guildImg = await tryLoadImage(guildIconUrl);
  if (guildImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(iconCX, iconCY, ICON_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(guildImg, iconCX - ICON_R, iconCY - ICON_R, ICON_R * 2, ICON_R * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(iconCX, iconCY, ICON_R, 0, Math.PI * 2);
    ctx.fill();
  }

  // Title text
  const textX = iconCX + ICON_R + 16;

  ctx.fillStyle    = WHITE;
  ctx.font         = F(22, true);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Message Leaderboard', textX, iconCY - 4);

  ctx.fillStyle = MUTED;
  ctx.font      = F(14);
  ctx.fillText(guildName, textX, iconCY + 16);

  // Period badge (top-right of header)
  const periodLabel = { '1d': 'Last 24h', '7d': 'Last 7 days', '30d': 'Last 30 days' }[period] ?? period;
  ctx.font = F(13, true);
  const badgeW = ctx.measureText(periodLabel).width + 20;
  const badgeX = PAD + INNER_W - badgeW - 10;
  const badgeY = iconCY - 13;

  ctx.fillStyle = ACCENT + '33'; // translucent
  roundRect(ctx, badgeX, badgeY, badgeW, 26, 6);
  ctx.fill();

  ctx.fillStyle    = ACCENT;
  ctx.textBaseline = 'middle';
  ctx.fillText(periodLabel, badgeX + 10, badgeY + 13);

  // ── Entries ───────────────────────────────────────────────────────────────
  const maxCount = entries[0]?.count ?? 1;

  for (let i = 0; i < entries.length; i++) {
    const { username, avatarUrl, count } = entries[i];
    const ry = HEADER_H + i * (ROW_H + ROW_GAP);

    // Row bg
    ctx.fillStyle = ROW;
    roundRect(ctx, PAD, ry, INNER_W, ROW_H, 10);
    ctx.fill();

    // Rank badge
    const isTop3     = i < 3;
    const medalColor = MEDAL_COLORS[i] ?? MUTED;
    const rankStr    = `#${i + 1}`;

    ctx.font         = F(15, true);
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = isTop3 ? medalColor : MUTED;
    ctx.fillText(rankStr, PAD + 18, ry + ROW_H / 2);

    // Avatar
    const AVT_R = 20;
    const avCX  = PAD + 72;
    const avCY  = ry + ROW_H / 2;

    const avImg = await tryLoadImage(avatarUrl);
    if (avImg) {
      ctx.save();
      // Glowing ring for top 3
      if (isTop3) {
        ctx.beginPath();
        ctx.arc(avCX, avCY, AVT_R + 3, 0, Math.PI * 2);
        ctx.strokeStyle = medalColor;
        ctx.lineWidth   = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(avCX, avCY, AVT_R, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avImg, avCX - AVT_R, avCY - AVT_R, AVT_R * 2, AVT_R * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(avCX, avCY, AVT_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle    = WHITE;
      ctx.font         = F(14, true);
      ctx.textBaseline = 'middle';
      ctx.textAlign    = 'center';
      ctx.fillText(username[0]?.toUpperCase() ?? '?', avCX, avCY);
      ctx.textAlign = 'left';
    }

    // Username
    const nameX = avCX + AVT_R + 16;
    ctx.fillStyle    = WHITE;
    ctx.font         = F(15, true);
    ctx.textBaseline = 'middle';
    // Truncate long names
    let displayName = username;
    while (displayName.length > 1 && ctx.measureText(displayName).width > 280) {
      displayName = displayName.slice(0, -1);
    }
    if (displayName !== username) displayName += '…';
    ctx.fillText(displayName, nameX, avCY);

    // Progress bar
    const BAR_X     = nameX + 300;
    const BAR_W     = INNER_W - (BAR_X - PAD) - 110;
    const BAR_H     = 6;
    const BAR_Y     = avCY - BAR_H / 2;
    const fillRatio = count / maxCount;

    // Track
    ctx.fillStyle = '#2a2a2a';
    roundRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, 3);
    ctx.fill();

    // Fill — gradient for #1, accent color for rest
    if (fillRatio > 0) {
      if (i === 0) {
        const grad = ctx.createLinearGradient(BAR_X, 0, BAR_X + BAR_W * fillRatio, 0);
        grad.addColorStop(0, '#5865F2');
        grad.addColorStop(1, '#a78bfa');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = isTop3 ? medalColor + 'cc' : ACCENT + '99';
      }
      roundRect(ctx, BAR_X, BAR_Y, Math.max(BAR_W * fillRatio, 6), BAR_H, 3);
      ctx.fill();
    }

    // Message count (right-aligned)
    const countStr = count.toLocaleString();
    ctx.font      = F(14, true);
    const countW  = ctx.measureText(countStr).width;
    ctx.fillStyle = WHITE;
    ctx.fillText(countStr, PAD + INNER_W - countW - 12, avCY - 8);

    ctx.fillStyle = MUTED;
    ctx.font      = F(11);
    const msgW    = ctx.measureText('messages').width;
    ctx.fillText('messages', PAD + INNER_W - msgW - 12, avCY + 8);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = HEADER_H + entries.length * (ROW_H + ROW_GAP) - ROW_GAP + 18;
  ctx.fillStyle    = MUTED;
  ctx.font         = F(12);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`flux  ·  ${periodLabel}  ·  UTC`, PAD + 4, footerY);

  return canvas.toBuffer('image/png');
}

module.exports = { generateLeaderboardCard };
