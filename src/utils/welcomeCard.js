'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

// ── Font registration ─────────────────────────────────────────────────────────
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
    try { GlobalFonts.registerFromPath(fp, 'WCard'); FONT = 'WCard'; break; } catch {}
  }
}

const W = 800;
const H = 300;

/**
 * @param {object} opts
 * @param {string}      opts.username
 * @param {string}      opts.avatarUrl
 * @param {string|null} opts.bannerUrl    — guild.bannerURL(...)
 * @param {number}      opts.memberCount
 * @param {string}      opts.guildName
 * @param {string}      [opts.accent]     — hex accent color
 */
async function generateWelcomeCard({ username, avatarUrl, bannerUrl, memberCount, guildName, accent = '#5865F2' }) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── 1. Background — server banner or dark fallback ────────────────────────
  if (bannerUrl) {
    try {
      const banner = await loadImage(bannerUrl);
      // Cover-fit: scale to fill W×H, crop center
      const scale  = Math.max(W / banner.width, H / banner.height);
      const bw     = banner.width  * scale;
      const bh     = banner.height * scale;
      const bx     = (W - bw) / 2;
      const by     = (H - bh) / 2;
      ctx.drawImage(banner, bx, by, bw, bh);
    } catch {
      // fallback to dark
      ctx.fillStyle = '#111216';
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = '#111216';
    ctx.fillRect(0, 0, W, H);
  }

  // ── 2. Dark gradient overlay so text is readable ──────────────────────────
  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  overlay.addColorStop(0,   'rgba(0,0,0,0.25)');
  overlay.addColorStop(0.4, 'rgba(0,0,0,0.45)');
  overlay.addColorStop(1,   'rgba(0,0,0,0.72)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);

  // ── 3. Avatar — circular, centered, upper-center area ────────────────────
  const AVR = 64;          // avatar radius
  const AVX = W / 2;
  const AVY = H / 2 - 14; // slightly above center

  // Accent glow ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(AVX, AVY, AVR + 5, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth   = 4;
  ctx.shadowColor = accent;
  ctx.shadowBlur  = 22;
  ctx.stroke();
  ctx.restore();

  // White border ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(AVX, AVY, AVR + 3, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth   = 3;
  ctx.stroke();
  ctx.restore();

  // Clip & draw avatar
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

  // ── 4. "WELCOME" text ─────────────────────────────────────────────────────
  const textY = AVY + AVR + 28;

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';

  // Shadow pass for WELCOME
  ctx.save();
  ctx.font        = `bold 44px ${FONT}`;
  ctx.fillStyle   = 'rgba(0,0,0,0.55)';
  ctx.fillText('WELCOME', AVX + 2, textY + 2);
  ctx.restore();

  // Main WELCOME text
  ctx.font      = `bold 44px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor  = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur   = 10;
  ctx.fillText('WELCOME', AVX, textY);
  ctx.shadowBlur = 0;

  // ── 5. Username ───────────────────────────────────────────────────────────
  const rawName = username.length > 24 ? username.slice(0, 22) + '…' : username;

  ctx.font      = `bold 22px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur  = 8;
  ctx.fillText(rawName.toUpperCase(), AVX, textY + 52);
  ctx.shadowBlur = 0;

  return canvas.toBuffer('image/png');
}

module.exports = { generateWelcomeCard };
