'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// ── Font bootstrap ────────────────────────────────────────────────────────────
// Download DejaVu Sans from GitHub and register it in memory.
// This is the only approach guaranteed to work on any host (no system fonts needed).
const FONT_FAMILY = 'DejaVu Sans';
let fontReady = false;

async function ensureFont() {
  if (fontReady) return;
  const urls = [
    // Regular
    'https://github.com/dejavu-fonts/dejavu-fonts/raw/main/ttf/DejaVuSans.ttf',
    // Bold (registering both so bold weight renders correctly)
    'https://github.com/dejavu-fonts/dejavu-fonts/raw/main/ttf/DejaVuSans-Bold.ttf',
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      GlobalFonts.register(buf, FONT_FAMILY);
    } catch (e) {
      console.warn('[statsCard] font fetch failed:', url, e.message);
    }
  }
  fontReady = true;
}

// ── Canvas constants ──────────────────────────────────────────────────────────
const W       = 900, H = 520;
const BG      = '#1a1a1a';
const CARD_BG = '#242424';
const ROW_BG  = '#2e2e2e';
const WHITE   = '#ffffff';
const MUTED   = '#888888';
const F       = (size, bold = false) => `${bold ? 'bold ' : ''}${size}px "${FONT_FAMILY}", sans-serif`;

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

async function generateStatsCard({ username, avatarUrl, rank, msgStats, voiceStats, topChannels }) {
  await ensureFont();

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ── Header ──────────────────────────────────────────────────────────────────
  const sz = 56, ax = 32, ay = 28;

  if (avatarUrl) {
    try {
      const img = await loadImage(avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax + sz / 2, ay + sz / 2, sz / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, ax, ay, sz, sz);
      ctx.restore();
    } catch {}
  }

  ctx.fillStyle = WHITE;
  ctx.font = F(28, true);
  ctx.fillText(username, ax + sz + 14, ay + 22);

  ctx.fillStyle = MUTED;
  ctx.font = F(15);
  const rankText = rank ? `Rank #${rank} this month` : 'Unranked this month';
  ctx.fillText(`${rankText}  ·  message stats`, ax + sz + 14, ay + 44);

  // ── Stat cards ───────────────────────────────────────────────────────────────
  const cardY = 104, cardH = 168, gap = 16;
  const col1X = 24, col2X = W / 2 + gap / 2;
  const colW  = W / 2 - gap / 2 - 24;

  function drawCard(x, title, rows) {
    ctx.fillStyle = CARD_BG;
    roundRect(ctx, x, cardY, colW, cardH, 10);
    ctx.fill();

    ctx.fillStyle = WHITE;
    ctx.font = F(16, true);
    ctx.fillText(title, x + 16, cardY + 26);

    rows.forEach(([label, value, unit], i) => {
      const ry = cardY + 46 + i * 42;
      ctx.fillStyle = ROW_BG;
      roundRect(ctx, x + 10, ry, colW - 20, 32, 6);
      ctx.fill();

      ctx.fillStyle = MUTED;
      ctx.font = F(14, true);
      ctx.fillText(label, x + 22, ry + 21);

      const valStr = String(value);
      ctx.font = F(14, true);
      const valW  = ctx.measureText(valStr).width;
      const unitW = ctx.measureText(unit).width;

      ctx.fillStyle = WHITE;
      ctx.fillText(valStr, x + colW - 20 - unitW - valW - 6, ry + 21);

      ctx.fillStyle = MUTED;
      ctx.font = F(14);
      ctx.fillText(unit, x + colW - 20 - unitW, ry + 21);
    });
  }

  drawCard(col1X, 'Messages', [
    ['1d',  msgStats.d1,              ' messages'],
    ['7d',  msgStats.d7,              ' messages'],
    ['30d', msgStats.d30,             ' messages'],
  ]);

  drawCard(col2X, 'Voice Activity', [
    ['1d',  voiceStats.d1.toFixed(1),  ' hours'],
    ['7d',  voiceStats.d7.toFixed(1),  ' hours'],
    ['30d', voiceStats.d30.toFixed(1), ' hours'],
  ]);

  // ── Top Channels ─────────────────────────────────────────────────────────────
  const tcY = cardY + cardH + gap;
  const tcH = 46 + topChannels.length * 42 + 10;

  ctx.fillStyle = CARD_BG;
  roundRect(ctx, 24, tcY, W - 48, tcH, 10);
  ctx.fill();

  ctx.fillStyle = WHITE;
  ctx.font = F(16, true);
  ctx.fillText('Top Channels', 40, tcY + 26);

  const medals = ['#1', '#2', '#3'];
  topChannels.forEach((ch, i) => {
    const ry = tcY + 46 + i * 42;
    ctx.fillStyle = ROW_BG;
    roundRect(ctx, 34, ry, W - 68, 32, 6);
    ctx.fill();

    ctx.fillStyle = MUTED;
    ctx.font = F(13, true);
    ctx.fillText(medals[i] || `#${i + 1}`, 48, ry + 21);

    ctx.fillStyle = WHITE;
    ctx.font = F(14, true);
    ctx.fillText(`#${ch.name}`, 90, ry + 21);

    const cntStr = String(ch.count);
    ctx.fillText(cntStr, W - 68 - ctx.measureText(cntStr).width, ry + 21);
  });

  // ── Footer ────────────────────────────────────────────────────────────────────
  ctx.fillStyle = MUTED;
  ctx.font = F(13);
  ctx.fillText('Period:  1d / 7d / 30d  ·  UTC', 34, tcY + tcH + 14);

  return canvas.toBuffer('image/png');
}

module.exports = { generateStatsCard };
