'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

// ── Font registration ────────────────────────────────────────────────────────
let FB = 'sans-serif', FN = 'sans-serif';

for (const fp of [
  path.join(__dirname, '../../node_modules/@fontsource/open-sans/files/open-sans-latin-700-normal.woff2'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]) {
  if (fs.existsSync(fp)) {
    try { GlobalFonts.registerFromPath(fp, 'CrBold'); FB = 'CrBold'; break; } catch {}
  }
}

for (const fp of [
  path.join(__dirname, '../../node_modules/@fontsource/open-sans/files/open-sans-latin-400-normal.woff2'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans.ttf',
]) {
  if (fs.existsSync(fp)) {
    try { GlobalFonts.registerFromPath(fp, 'CrNorm'); FN = 'CrNorm'; break; } catch {}
  }
}

const W = 860, H = 260;

// ── Helpers ──────────────────────────────────────────────────────────────────
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
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

function hexRgb(hex) {
  const h = (hex || '#5865F2').replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(Math.floor(n));
}

// For the hero balance — uses comma-formatting for sub-10k, k/M above
function fmtBal(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 10_000)    return (n / 1_000).toFixed(1) + 'k';
  return Math.floor(n).toLocaleString('en-US');
}

/**
 * Generates a credits card PNG buffer.
 *
 * @param {object}   opts
 * @param {string}   opts.username
 * @param {string}   opts.avatarUrl
 * @param {number}   opts.balance
 * @param {number}   opts.totalEarned
 * @param {Array<{name:string, price:number, color?:string}>} opts.shopItems
 */
async function generateCreditsCard({ username, avatarUrl, balance, totalEarned, shopItems = [] }) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── 1. Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = '#080910';
  ctx.fillRect(0, 0, W, H);

  // Warm gold radial glow behind avatar
  {
    const g = ctx.createRadialGradient(110, 118, 0, 110, 118, 200);
    g.addColorStop(0, 'rgba(241,196,15,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Cool blue-purple glow on right side
  {
    const g = ctx.createLinearGradient(560, 0, W, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(88,101,242,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ── 2. Gold accent bar (left edge) ────────────────────────────────────────
  {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0,   'rgba(241,196,15,0.18)');
    g.addColorStop(0.5, '#F1C40F');
    g.addColorStop(1,   'rgba(241,196,15,0.18)');
    ctx.fillStyle = g;
    rrect(ctx, 0, 18, 4, H - 36, 2);
    ctx.fill();
  }

  // ── 3. Avatar ──────────────────────────────────────────────────────────────
  const AX = 110, AY = 118, AR = 70;

  // Outer glow ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(AX, AY, AR + 5, 0, Math.PI * 2);
  ctx.strokeStyle = '#F1C40F';
  ctx.lineWidth   = 2.5;
  ctx.shadowColor = '#F1C40F';
  ctx.shadowBlur  = 20;
  ctx.stroke();
  ctx.restore();

  // Avatar image, clipped to circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(AX, AY, AR, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(avatarUrl);
    ctx.drawImage(img, AX - AR, AY - AR, AR * 2, AR * 2);
  } catch {
    ctx.fillStyle = '#1a1c2c';
    ctx.fill();
  }
  ctx.restore();

  // ── 4. Left panel — name, badge, balance, total earned ────────────────────
  const TX = 204;

  // Username
  ctx.font         = `bold 34px ${FB}`;
  ctx.fillStyle    = '#ffffff';
  ctx.textBaseline = 'top';
  const uname = username.length > 22 ? username.slice(0, 20) + '…' : username;
  ctx.fillText(uname, TX, 36);

  // "FLUX CREDITS" pill badge
  ctx.font = `bold 11px ${FB}`;
  const BADGE = 'FLUX CREDITS';
  const bw    = ctx.measureText(BADGE).width + 16;
  rrect(ctx, TX, 82, bw, 20, 4);
  ctx.fillStyle = '#161824';
  ctx.fill();
  ctx.fillStyle    = '#555875';
  ctx.textBaseline = 'middle';
  ctx.fillText(BADGE, TX + 8, 82 + 10);
  ctx.textBaseline = 'top';

  // "BALANCE" label
  ctx.font      = `bold 11px ${FB}`;
  ctx.fillStyle = '#6b6e87';
  ctx.fillText('BALANCE', TX, 116);

  // Hero balance number — auto-size so it never overflows
  let balSize = 52;
  const balStr = fmtBal(balance);
  ctx.font = `bold ${balSize}px ${FB}`;
  while (ctx.measureText(balStr).width > 268 && balSize > 26) {
    balSize -= 2;
    ctx.font = `bold ${balSize}px ${FB}`;
  }
  ctx.fillStyle   = '#F1C40F';
  ctx.shadowColor = 'rgba(241,196,15,0.35)';
  ctx.shadowBlur  = 16;
  ctx.textBaseline = 'top';
  ctx.fillText(balStr, TX, 130);
  ctx.shadowBlur  = 0;

  // Thin horizontal rule
  ctx.fillStyle = '#1a1d2e';
  ctx.fillRect(TX, 196, 266, 1);

  // "TOTAL EARNED  X cr" on one line
  ctx.font         = `13px ${FN}`;
  ctx.fillStyle    = '#555875';
  ctx.textBaseline = 'top';
  ctx.fillText('TOTAL EARNED', TX, 205);
  const lw = ctx.measureText('TOTAL EARNED ').width;

  ctx.font      = `bold 13px ${FB}`;
  ctx.fillStyle = '#9ba0b8';
  ctx.fillText(fmtBal(totalEarned) + ' cr', TX + lw, 205);

  // ── 5. Panel divider (vertical, fading top/bottom) ────────────────────────
  {
    const g = ctx.createLinearGradient(0, 30, 0, H - 30);
    g.addColorStop(0,   'rgba(30,32,53,0)');
    g.addColorStop(0.2, '#1e2035');
    g.addColorStop(0.8, '#1e2035');
    g.addColorStop(1,   'rgba(30,32,53,0)');
    ctx.fillStyle = g;
    ctx.fillRect(487, 30, 1, H - 60);
  }

  // ── 6. Right panel — shop roles ───────────────────────────────────────────
  const RX  = 507;
  const RW  = W - RX - 16;             // 337 px
  const PW  = (RW - 8) / 2;            // pill width ≈ 164 px
  const PH  = 38;

  ctx.font         = `bold 11px ${FB}`;
  ctx.fillStyle    = '#555875';
  ctx.textBaseline = 'top';
  ctx.fillText('SHOP ROLES', RX, 30);

  const pills = shopItems.slice(0, 8); // 4 rows × 2 cols

  if (!pills.length) {
    ctx.font      = `13px ${FN}`;
    ctx.fillStyle = '#2a2d3e';
    ctx.fillText('No items in shop yet', RX, 54);
  } else {
    for (let i = 0; i < pills.length; i++) {
      const item = pills[i];
      const col  = i % 2;
      const row  = Math.floor(i / 2);
      const px   = RX + col * (PW + 8);
      const py   = 52 + row * (PH + 8);
      const can  = balance >= item.price;
      const clr  = /^#[0-9A-Fa-f]{6}$/.test(item.color || '') ? item.color : '#5865F2';
      const [r, g, b] = hexRgb(clr);

      // Pill background
      rrect(ctx, px, py, PW, PH, 8);
      ctx.fillStyle = can ? `rgba(${r},${g},${b},0.15)` : '#111320';
      ctx.fill();

      // Colored left accent bar
      rrect(ctx, px, py, 3, PH, 2);
      ctx.fillStyle = can ? `rgb(${r},${g},${b})` : '#2a2d3e';
      ctx.fill();

      // Role name
      const ns = item.name.length > 14 ? item.name.slice(0, 12) + '…' : item.name;
      ctx.font         = `bold 13px ${FB}`;
      ctx.fillStyle    = can ? '#e8eaf6' : '#3a3d52';
      ctx.textBaseline = 'top';
      ctx.fillText(ns, px + 11, py + 6);

      // Price
      ctx.font      = `11px ${FN}`;
      ctx.fillStyle = can ? `rgba(${r},${g},${b},0.85)` : '#2e3149';
      ctx.fillText(fmt(item.price) + ' cr', px + 11, py + 22);
    }
  }

  // ── 7. Subtle brand watermark ─────────────────────────────────────────────
  ctx.font         = `10px ${FN}`;
  ctx.fillStyle    = '#1e2035';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('flux • credits', W - 14, H - 8);
  ctx.textAlign    = 'left';

  return canvas.toBuffer('image/png');
}

module.exports = { generateCreditsCard };
