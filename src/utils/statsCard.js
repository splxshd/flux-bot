'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ── Font loading ──────────────────────────────────────────────────────────────
// Strategy 1: build-time copy at /app/fonts/ (nixpacks)
// Strategy 2: download from jsDelivr at runtime and cache to /app/fonts/

const FONT_DIR   = '/app/fonts';
const REGULAR    = path.join(FONT_DIR, 'DejaVuSans.ttf');
const BOLD       = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

// CDN URLs for DejaVu Sans — jsDelivr (no tag = latest commit), GitHub raw as fallback
const CDN_REGULAR = 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts/fonts/DejaVuSans.ttf';
const CDN_BOLD    = 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts/fonts/DejaVuSans-Bold.ttf';
const CDN_REGULAR_FB = 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/fonts/DejaVuSans.ttf';
const CDN_BOLD_FB    = 'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/fonts/DejaVuSans-Bold.ttf';

let fontReady = false; // set to true once at least regular is registered

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    https.get(url, { headers: { 'User-Agent': 'nightsbot/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow one redirect
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadFont(urls, dest) {
  for (const url of urls) {
    try {
      console.log(`[statsCard] downloading font from ${url} …`);
      const buf = await httpsGet(url);
      fs.mkdirSync(FONT_DIR, { recursive: true });
      fs.writeFileSync(dest, buf);
      return buf;
    } catch (e) {
      console.warn(`[statsCard] failed (${url}): ${e.message} — trying next …`);
    }
  }
  throw new Error('All font download URLs failed');
}

async function ensureFont() {
  if (fontReady) return;

  try {
    // ── Regular ──────────────────────────────────────────────────────────────
    let regularBuf;
    if (fs.existsSync(REGULAR)) {
      regularBuf = fs.readFileSync(REGULAR);
      console.log('[statsCard] loaded regular font from', REGULAR);
    } else {
      regularBuf = await downloadFont([CDN_REGULAR, CDN_REGULAR_FB], REGULAR);
      console.log('[statsCard] downloaded & cached regular font');
    }
    GlobalFonts.register(regularBuf, 'DejaVu Sans');

    // ── Bold ─────────────────────────────────────────────────────────────────
    let boldBuf;
    if (fs.existsSync(BOLD)) {
      boldBuf = fs.readFileSync(BOLD);
    } else {
      boldBuf = await downloadFont([CDN_BOLD, CDN_BOLD_FB], BOLD);
    }
    GlobalFonts.register(boldBuf, 'DejaVu Sans');

    fontReady = true;
    console.log('[statsCard] fonts ready');
  } catch (e) {
    console.warn('[statsCard] font load failed — text may be invisible:', e.message);
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const W       = 900, H = 520;
const BG      = '#1a1a1a';
const CARD_BG = '#242424';
const ROW_BG  = '#2e2e2e';
const WHITE   = '#ffffff';
const MUTED   = '#888888';
const F       = (size, bold = false) => `${bold ? 'bold ' : ''}${size}px "DejaVu Sans", sans-serif`;

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

  // ── Cards ───────────────────────────────────────────────────────────────────
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

      ctx.font = F(14);
      const unitW = ctx.measureText(unit).width;

      ctx.fillStyle = WHITE;
      ctx.font = F(14, true);
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

  // ── Footer ───────────────────────────────────────────────────────────────────
  ctx.fillStyle = MUTED;
  ctx.font = F(13);
  ctx.fillText('Period:  1d / 7d / 30d  ·  UTC', 34, tcY + tcH + 14);

  return canvas.toBuffer('image/png');
}

module.exports = { generateStatsCard };
