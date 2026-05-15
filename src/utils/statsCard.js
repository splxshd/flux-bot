'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// Load system fonts (DejaVu available via nixpacks on Railway)
try {
  GlobalFonts.loadSystemFonts();
  // Also try common Linux font paths
  for (const dir of ['/usr/share/fonts', '/usr/share/fonts/truetype/dejavu', '/nix/var/nix/profiles/default/share/fonts']) {
    try { GlobalFonts.loadFontsFromDir(dir); } catch {}
  }
} catch {}

const W = 900, H = 520;
const BG       = '#1a1a1a';
const CARD_BG  = '#242424';
const ROW_BG   = '#2e2e2e';
const WHITE     = '#ffffff';
const MUTED    = '#888888';
const ACCENT   = '#5865F2';

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

async function generateStatsCard({ username, avatarUrl, rank, msgStats, voiceStats, topChannels, guild }) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ── Header ────────────────────────────────────────────────────────────────
  const avatarSize = 56;
  const avatarX = 32, avatarY = 28;

  // Avatar circle clip
  if (avatarUrl) {
    try {
      const img = await loadImage(avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } catch {}
  }

  // Username
  ctx.fillStyle = WHITE;
  ctx.font = 'bold 28px DejaVu Sans, sans-serif';
  ctx.fillText(username, avatarX + avatarSize + 14, avatarY + 22);

  // Subtitle
  ctx.fillStyle = MUTED;
  ctx.font = '15px DejaVu Sans, sans-serif';
  const rankText = rank ? `Rank #${rank} this month` : 'Unranked this month';
  ctx.fillText(`${rankText}  ·  message stats`, avatarX + avatarSize + 14, avatarY + 44);

  // ── Messages card ─────────────────────────────────────────────────────────
  const cardY = 104, cardH = 168, gap = 16;
  const col1X = 24, col2X = W / 2 + gap / 2;
  const colW  = W / 2 - gap / 2 - 24;

  function drawCard(x, title, icon, rows) {
    ctx.fillStyle = CARD_BG;
    roundRect(ctx, x, cardY, colW, cardH, 10);
    ctx.fill();

    // Card title
    ctx.fillStyle = WHITE;
    ctx.font = 'bold 16px DejaVu Sans, sans-serif';
    ctx.fillText(title, x + 16, cardY + 26);

    // Icon (text emoji substitute)
    ctx.fillStyle = MUTED;
    ctx.font = '16px DejaVu Sans, sans-serif';
    ctx.fillText(icon, x + colW - 32, cardY + 26);

    // Rows
    rows.forEach(([label, value, unit], i) => {
      const ry = cardY + 46 + i * 42;
      ctx.fillStyle = ROW_BG;
      roundRect(ctx, x + 10, ry, colW - 20, 32, 6);
      ctx.fill();

      ctx.fillStyle = MUTED;
      ctx.font = 'bold 14px DejaVu Sans, sans-serif';
      ctx.fillText(label, x + 22, ry + 21);

      // Value (bold) + unit (muted)
      const valStr = String(value);
      ctx.font = 'bold 14px DejaVu Sans, sans-serif';
      const valW = ctx.measureText(valStr).width;
      ctx.fillStyle = WHITE;
      ctx.fillText(valStr, x + colW - 20 - ctx.measureText(unit).width - valW - 6, ry + 21);
      ctx.fillStyle = MUTED;
      ctx.font = '14px DejaVu Sans, sans-serif';
      ctx.fillText(unit, x + colW - 20 - ctx.measureText(unit).width, ry + 21);
    });
  }

  drawCard(col1X, 'Messages', '#', [
    ['1d',  msgStats.d1,  ' messages'],
    ['7d',  msgStats.d7,  ' messages'],
    ['30d', msgStats.d30, ' messages'],
  ]);

  drawCard(col2X, 'Voice Activity', '🎙', [
    ['1d',  voiceStats.d1.toFixed(1),  ' hours'],
    ['7d',  voiceStats.d7.toFixed(1),  ' hours'],
    ['30d', voiceStats.d30.toFixed(1), ' hours'],
  ]);

  // ── Top Channels card ─────────────────────────────────────────────────────
  const tcY = cardY + cardH + gap;
  const tcH = 46 + topChannels.length * 42 + 10;

  ctx.fillStyle = CARD_BG;
  roundRect(ctx, 24, tcY, W - 48, tcH, 10);
  ctx.fill();

  ctx.fillStyle = WHITE;
  ctx.font = 'bold 16px DejaVu Sans, sans-serif';
  ctx.fillText('Top Channels', 40, tcY + 26);

  ctx.fillStyle = MUTED;
  ctx.font = '16px DejaVu Sans, sans-serif';
  ctx.fillText('#', W - 48, tcY + 26);

  const medals = ['#1', '#2', '#3'];
  topChannels.forEach((ch, i) => {
    const ry = tcY + 46 + i * 42;
    ctx.fillStyle = ROW_BG;
    roundRect(ctx, 34, ry, W - 68, 32, 6);
    ctx.fill();

    ctx.fillStyle = MUTED;
    ctx.font = 'bold 13px DejaVu Sans, sans-serif';
    ctx.fillText(medals[i] || `#${i + 1}`, 48, ry + 21);

    ctx.fillStyle = WHITE;
    ctx.font = 'bold 14px DejaVu Sans, sans-serif';
    ctx.fillText(`#${ch.name}`, 90, ry + 21);

    ctx.fillStyle = WHITE;
    ctx.font = 'bold 14px DejaVu Sans, sans-serif';
    const cntStr = String(ch.count);
    ctx.fillText(cntStr, W - 68 - ctx.measureText(cntStr).width, ry + 21);
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = tcY + tcH + 14;
  ctx.fillStyle = MUTED;
  ctx.font = '13px DejaVu Sans, sans-serif';
  ctx.fillText('Period:  1d / 7d / 30d  ·  UTC', 34, footerY);

  return canvas.toBuffer('image/png');
}

module.exports = { generateStatsCard };
