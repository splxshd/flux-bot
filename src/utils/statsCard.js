'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ── Font loading — try every known strategy until one works ──────────────────
(function loadFont() {
  const FAMILY = 'DejaVu Sans';

  // Strategy 1: fc-match (fontconfig is installed via nixpacks.toml)
  try {
    const p = execSync(`fc-match "${FAMILY}" --format="%{file}"`, {
      encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (p && fs.existsSync(p)) {
      GlobalFonts.registerFromPath(p, FAMILY);
      return;
    }
  } catch {}

  // Strategy 2: fc-list — find any DejaVuSans.ttf
  try {
    const p = execSync(`fc-list : file | grep -i "DejaVuSans.ttf" | head -1`, {
      encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'],
    }).trim().split(':')[0].trim();
    if (p && fs.existsSync(p)) {
      GlobalFonts.registerFromPath(p, FAMILY);
      return;
    }
  } catch {}

  // Strategy 3: find in nix store
  try {
    const p = execSync(`find /nix -name "DejaVuSans.ttf" 2>/dev/null | head -1`, {
      encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (p && fs.existsSync(p)) {
      GlobalFonts.registerFromPath(p, FAMILY);
      return;
    }
  } catch {}

  // Strategy 4: check hard-coded common paths
  const PATHS = [
    '/nix/var/nix/profiles/default/share/fonts/truetype/DejaVuSans.ttf',
    '/run/current-system/sw/share/fonts/truetype/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/DejaVuSans.ttf',
  ];
  for (const p of PATHS) {
    if (fs.existsSync(p)) {
      GlobalFonts.registerFromPath(p, FAMILY);
      return;
    }
  }

  // Strategy 5: loadSystemFonts broad sweep
  try { GlobalFonts.loadSystemFonts(); } catch {}
  for (const dir of ['/usr/share/fonts', '/nix/var/nix/profiles/default/share/fonts']) {
    try { GlobalFonts.loadFontsFromDir(dir); } catch {}
  }
})();

// ── Canvas constants ──────────────────────────────────────────────────────────
const W       = 900, H = 520;
const BG      = '#1a1a1a';
const CARD_BG = '#242424';
const ROW_BG  = '#2e2e2e';
const WHITE   = '#ffffff';
const MUTED   = '#888888';
const ACCENT  = '#5865F2';
const FONT    = '"DejaVu Sans", sans-serif';

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
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ── Header ─────────────────────────────────────────────────────────────────
  const avatarSize = 56, avatarX = 32, avatarY = 28;

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

  ctx.fillStyle = WHITE;
  ctx.font = `bold 28px ${FONT}`;
  ctx.fillText(username, avatarX + avatarSize + 14, avatarY + 22);

  ctx.fillStyle = MUTED;
  ctx.font = `15px ${FONT}`;
  const rankText = rank ? `Rank #${rank} this month` : 'Unranked this month';
  ctx.fillText(`${rankText}  ·  message stats`, avatarX + avatarSize + 14, avatarY + 44);

  // ── Cards (messages + voice) ───────────────────────────────────────────────
  const cardY = 104, cardH = 168, gap = 16;
  const col1X = 24, col2X = W / 2 + gap / 2;
  const colW  = W / 2 - gap / 2 - 24;

  function drawCard(x, title, rows) {
    ctx.fillStyle = CARD_BG;
    roundRect(ctx, x, cardY, colW, cardH, 10);
    ctx.fill();

    ctx.fillStyle = WHITE;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(title, x + 16, cardY + 26);

    rows.forEach(([label, value, unit], i) => {
      const ry = cardY + 46 + i * 42;
      ctx.fillStyle = ROW_BG;
      roundRect(ctx, x + 10, ry, colW - 20, 32, 6);
      ctx.fill();

      ctx.fillStyle = MUTED;
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText(label, x + 22, ry + 21);

      const valStr = String(value);
      ctx.font = `bold 14px ${FONT}`;
      const valW   = ctx.measureText(valStr).width;
      const unitW  = ctx.measureText(unit).width;
      ctx.fillStyle = WHITE;
      ctx.fillText(valStr, x + colW - 20 - unitW - valW - 6, ry + 21);
      ctx.fillStyle = MUTED;
      ctx.font = `14px ${FONT}`;
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

  // ── Top Channels ───────────────────────────────────────────────────────────
  const tcY = cardY + cardH + gap;
  const tcH = 46 + topChannels.length * 42 + 10;

  ctx.fillStyle = CARD_BG;
  roundRect(ctx, 24, tcY, W - 48, tcH, 10);
  ctx.fill();

  ctx.fillStyle = WHITE;
  ctx.font = `bold 16px ${FONT}`;
  ctx.fillText('Top Channels', 40, tcY + 26);

  const medals = ['#1', '#2', '#3'];
  topChannels.forEach((ch, i) => {
    const ry = tcY + 46 + i * 42;
    ctx.fillStyle = ROW_BG;
    roundRect(ctx, 34, ry, W - 68, 32, 6);
    ctx.fill();

    ctx.fillStyle = MUTED;
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(medals[i] || `#${i + 1}`, 48, ry + 21);

    ctx.fillStyle = WHITE;
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText(`#${ch.name}`, 90, ry + 21);

    const cntStr = String(ch.count);
    ctx.fillText(cntStr, W - 68 - ctx.measureText(cntStr).width, ry + 21);
  });

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerY = tcY + tcH + 14;
  ctx.fillStyle = MUTED;
  ctx.font = `13px ${FONT}`;
  ctx.fillText('Period:  1d / 7d / 30d  ·  UTC', 34, footerY);

  return canvas.toBuffer('image/png');
}

module.exports = { generateStatsCard };
