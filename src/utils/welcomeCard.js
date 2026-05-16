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

// Local background image (save your banner as welcome_bg.png in src/assets/)
const LOCAL_BG = path.join(__dirname, '../assets/welcome_bg.png');

const W = 1000;
const H = 300;

/**
 * @param {object} opts
 * @param {string}      opts.username
 * @param {string}      opts.avatarUrl
 * @param {number}      opts.memberCount
 * @param {string}      opts.guildName
 */
async function generateWelcomeCard({ username, avatarUrl, memberCount, guildName }) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── 1. Background ─────────────────────────────────────────────────────────
  let bgLoaded = false;

  // Try local file first
  if (fs.existsSync(LOCAL_BG)) {
    try {
      const bg = await loadImage(LOCAL_BG);
      // Draw at exactly canvas size — no upscaling, no interpolation blur
      ctx.drawImage(bg, 0, 0, W, H);
      bgLoaded = true;
    } catch {}
  }

  if (!bgLoaded) {
    // Fallback: dark background with red side accents
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
    const lg = ctx.createLinearGradient(0, 0, W * 0.35, H);
    lg.addColorStop(0, 'rgba(180,0,0,0.5)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    const rg = ctx.createLinearGradient(W, 0, W * 0.65, H);
    rg.addColorStop(0, 'rgba(180,0,0,0.5)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }


  // ── 2. Avatar — perfectly centred ─────────────────────────────────────────
  const AVR = 72;        // radius
  const AVX = W / 2;    // horizontal center
  const AVY = H / 2 - 10; // slightly above mid so text fits below

  const RED = '#FF0000';

  // Thin black outline ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(AVX, AVY, AVR + 2, 0, Math.PI * 2);
  ctx.strokeStyle = '#000000';
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
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
  }
  ctx.restore();

  // ── 3. Text — centred below avatar ────────────────────────────────────────
  const textY = AVY + AVR + 16;

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';

  // "WELCOME" drop shadow
  ctx.save();
  ctx.font      = `bold 38px ${FONT}`;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillText('WELCOME', AVX + 2, textY + 2);
  ctx.restore();

  // "WELCOME" main
  ctx.font         = `bold 38px ${FONT}`;
  ctx.fillStyle    = '#ffffff';
  ctx.shadowColor  = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur   = 12;
  ctx.fillText('WELCOME', AVX, textY);
  ctx.shadowBlur   = 0;

  // Username in red
  const rawName = username.length > 26 ? username.slice(0, 24) + '…' : username;
  ctx.font      = `bold 20px ${FONT}`;
  ctx.fillStyle = RED;
  ctx.shadowColor = 'rgba(0,0,0,1)';
  ctx.shadowBlur  = 10;
  ctx.fillText(rawName.toUpperCase(), AVX, textY + 46);
  ctx.shadowBlur  = 0;

  return canvas.toBuffer('image/png');
}

module.exports = { generateWelcomeCard };
