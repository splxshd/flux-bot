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
    console.log('[statsCard] fonts ready');
  } catch (e) {
    console.warn('[statsCard] font load failed:', e.message);
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const W       = 900;
const BG      = '#080808';
const CARD_BG = '#121212';
const ROW_BG  = '#1a1a1a';
const WHITE   = '#ffffff';
const MUTED   = '#888888';
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

// Draws the # icon (used on Messages and Top Channels cards)
function drawHashIcon(ctx, cx, cy, size) {
  ctx.save();
  ctx.fillStyle   = MUTED;
  ctx.font        = `bold ${size}px "${FONT_NAME}", sans-serif`;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('#', cx, cy);
  ctx.restore();
}

// Microphone icon — pixel-faithful to the reference image:
// tall narrow pill, wide U-arc (flat horizontal ends from thick stroke),
// short stem, no base bar.
function drawMicIcon(ctx, cx, cy, size) {
  ctx.save();
  ctx.fillStyle   = MUTED;
  ctx.strokeStyle = MUTED;
  ctx.lineCap     = 'butt';   // flat ends = the "horizontal ears" in the reference
  ctx.lineJoin    = 'round';

  // ── Tall narrow pill ──────────────────────────────────────────────────────
  const br  = size * 0.17;          // half-width (narrow pill)
  const bh  = size * 0.50;          // tall
  const top = cy - size * 0.48;

  ctx.beginPath();
  ctx.arc(cx, top + br,      br, Math.PI, 0);
  ctx.lineTo(cx + br, top + bh - br);
  ctx.arc(cx, top + bh - br, br, 0,      Math.PI);
  ctx.closePath();
  ctx.fill();

  // ── Wide U-arc (2.5× the pill half-width on each side) ───────────────────
  const arcCY  = top + bh - br;     // pivot at pill bottom
  const arcR   = size * 0.42;       // 2.47× pill half-width → very wide arc
  ctx.lineWidth = size * 0.16;
  ctx.beginPath();
  ctx.arc(cx, arcCY, arcR, Math.PI, 0, false);
  ctx.stroke();

  // ── Stem ──────────────────────────────────────────────────────────────────
  ctx.lineCap = 'butt';
  const stemY = arcCY + arcR;
  ctx.beginPath();
  ctx.moveTo(cx, stemY);
  ctx.lineTo(cx, stemY + size * 0.13);
  ctx.stroke();

  ctx.restore();
}

// ── Main generator ────────────────────────────────────────────────────────────
async function generateStatsCard({ username, avatarUrl, rank, msgStats, voiceStats, topChannels }) {
  ensureFont();

  // ── Dynamic height ───────────────────────────────────────────────────────
  const PAD      = 24;
  const HEADER_H = 90;
  const CARD_H   = 176;
  const TC_H     = 50 + Math.max(topChannels.length, 1) * 44 + 12;
  const FOOTER_H = 36;
  const GAP      = 14;

  const H = HEADER_H + GAP + CARD_H + GAP + TC_H + FOOTER_H + PAD;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ── Header ───────────────────────────────────────────────────────────────
  const AVT = 52;
  const ax  = PAD + 8, ay = (HEADER_H - AVT) / 2;

  if (avatarUrl) {
    try {
      const img = await loadImage(avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax + AVT / 2, ay + AVT / 2, AVT / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, ax, ay, AVT, AVT);
      ctx.restore();
    } catch {}
  }

  const tx = ax + AVT + 14;
  ctx.fillStyle = WHITE;
  ctx.font = F(26, true);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(username, tx, ay + 28);

  ctx.fillStyle = MUTED;
  ctx.font = F(14);
  const rankText = rank ? `Rank #${rank} this month` : 'Unranked this month';
  ctx.fillText(`${rankText}  ·  message stats`, tx, ay + 48);

  // ── Two-column cards ──────────────────────────────────────────────────────
  const cardY  = HEADER_H + GAP;
  const colW   = (W - PAD * 2 - GAP) / 2;
  const col1X  = PAD;
  const col2X  = PAD + colW + GAP;
  const ICON_S = 26; // icon size
  const ICON_Y = cardY + 27; // icon vertical centre

  function drawCard(x, title, rows, iconType) {
    // card bg
    ctx.fillStyle = CARD_BG;
    roundRect(ctx, x, cardY, colW, CARD_H, 10);
    ctx.fill();

    // title
    ctx.fillStyle    = WHITE;
    ctx.font         = F(16, true);
    ctx.textBaseline = 'middle';
    ctx.fillText(title, x + 16, ICON_Y);

    // icon top-right
    if (iconType === 'hash') {
      drawHashIcon(ctx, x + colW - 24, ICON_Y, ICON_S);
    } else if (iconType === 'mic') {
      drawMicIcon(ctx,  x + colW - 28, ICON_Y, ICON_S);
    }

    // rows
    rows.forEach(([label, value, unit], i) => {
      const ry = cardY + 50 + i * 44;
      ctx.fillStyle = ROW_BG;
      roundRect(ctx, x + 10, ry, colW - 20, 34, 7);
      ctx.fill();

      // label (left)
      ctx.fillStyle    = MUTED;
      ctx.font         = F(14, true);
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 22, ry + 17);

      // value (bold white) + unit (muted) — right-aligned together
      const valStr  = String(value);
      ctx.font      = F(14, true);
      const valW    = ctx.measureText(valStr).width;
      ctx.font      = F(14);
      const unitW   = ctx.measureText(unit).width;
      const rightX  = x + colW - 18;

      ctx.fillStyle = MUTED;
      ctx.fillText(unit, rightX - unitW, ry + 17);

      ctx.fillStyle = WHITE;
      ctx.font      = F(14, true);
      ctx.fillText(valStr, rightX - unitW - valW - 4, ry + 17);
    });
  }

  drawCard(col1X, 'Messages', [
    ['1d',  msgStats.d1,               ' messages'],
    ['7d',  msgStats.d7,               ' messages'],
    ['30d', msgStats.d30,              ' messages'],
  ], 'hash');

  drawCard(col2X, 'Voice Activity', [
    ['1d',  voiceStats.d1.toFixed(1),  ' hours'],
    ['7d',  voiceStats.d7.toFixed(1),  ' hours'],
    ['30d', voiceStats.d30.toFixed(1), ' hours'],
  ], 'mic');

  // ── Top Channels ──────────────────────────────────────────────────────────
  const tcY    = cardY + CARD_H + GAP;
  const tcX    = PAD;
  const tcW    = W - PAD * 2;
  const tcIconY = tcY + 26;

  ctx.fillStyle = CARD_BG;
  roundRect(ctx, tcX, tcY, tcW, TC_H, 10);
  ctx.fill();

  ctx.fillStyle    = WHITE;
  ctx.font         = F(16, true);
  ctx.textBaseline = 'middle';
  ctx.fillText('Top Channels', tcX + 16, tcIconY);

  drawHashIcon(ctx, tcX + tcW - 24, tcIconY, ICON_S);

  const medals = ['#1', '#2', '#3'];
  topChannels.forEach((ch, i) => {
    const ry = tcY + 50 + i * 44;
    ctx.fillStyle = ROW_BG;
    roundRect(ctx, tcX + 10, ry, tcW - 20, 34, 7);
    ctx.fill();

    // rank badge
    ctx.fillStyle    = MUTED;
    ctx.font         = F(13, true);
    ctx.textBaseline = 'middle';
    ctx.fillText(medals[i] || `#${i + 1}`, tcX + 24, ry + 17);

    // channel name — deleted channels show <#id> instead of raw number
    const chLabel = ch.deleted ? `<#${ch.id}>` : `#${ch.name}`;
    ctx.fillStyle = ch.deleted ? MUTED : WHITE;
    ctx.font      = F(14, true);
    ctx.fillText(chLabel, tcX + 68, ry + 17);

    // message count (right)
    const cntStr = String(ch.count);
    ctx.font     = F(14, true);
    const cntW   = ctx.measureText(cntStr).width;
    ctx.fillText(cntStr, tcX + tcW - 20 - cntW, ry + 17);
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = tcY + TC_H + 10;
  ctx.fillStyle    = MUTED;
  ctx.font         = F(13);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Period:  1d / 7d / 30d  ·  UTC', tcX + 6, footerY);

  return canvas.toBuffer('image/png');
}

module.exports = { generateStatsCard };
