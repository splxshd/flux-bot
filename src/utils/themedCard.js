'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

// Reuse font registration from creditsCard
let FB = 'sans-serif', FN = 'sans-serif';
for (const fp of [
  path.join(__dirname, '../../node_modules/@fontsource/open-sans/files/open-sans-latin-700-normal.woff2'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]) {
  if (fs.existsSync(fp)) { try { GlobalFonts.registerFromPath(fp, 'CrBold'); FB = 'CrBold'; break; } catch {} }
}
for (const fp of [
  path.join(__dirname, '../../node_modules/@fontsource/open-sans/files/open-sans-latin-400-normal.woff2'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]) {
  if (fs.existsSync(fp)) { try { GlobalFonts.registerFromPath(fp, 'CrNorm'); FN = 'CrNorm'; break; } catch {} }
}

const W = 860, H = 260;

function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w)/2, Math.abs(h)/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

function hexRgb(hex) {
  const h = (hex||'#5865F2').replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function fmtBal(n) {
  if (n >= 1_000_000) return (n/1_000_000).toFixed(2)+'M';
  if (n >= 10_000)    return (n/1_000).toFixed(1)+'k';
  return Math.floor(n).toLocaleString('en-US');
}
function fmt(n) {
  if (n >= 1_000_000) return (n/1_000_000).toFixed(2)+'M';
  if (n >= 1_000)     return (n/1_000).toFixed(1)+'k';
  return String(Math.floor(n));
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme definitions
// ─────────────────────────────────────────────────────────────────────────────
const THEMES = {
  cyber: {
    label: 'CYBER',
    bg:          '#000000',
    accentColor: '#00FFFF',
    balanceColor:'#00FFFF',
    nameColor:   '#00FFFF',
    badgeBg:     'rgba(0,255,255,0.12)',
    badgeBorder: '#00FFFF',
    badgeText:   '#00FFFF',
    badgeLabel:  '✦ CYBER',
    balanceLabel:'BALANCE',
    ringColor:   '#00FFFF',
    ringGlow:    '#00FFFF',
    dividerColor:'rgba(0,255,255,0.2)',
    panelBg:     'rgba(0,255,255,0.03)',
    sectionLabel:'◈  SHOP ROLES',
    pillAfford:  (r,g,b) => `rgba(${r},${g},${b},0.14)`,
    pillBorder:  (r,g,b) => `rgba(${r},${g},${b},0.3)`,
    nameText:    '#ccffff',
    totalColor:  'rgba(0,255,255,0.4)',
    watermark:   'cyber',
    extras: (ctx) => {
      // grid lines
      ctx.save();
      ctx.strokeStyle = 'rgba(0,255,255,0.055)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < W; gx += 32) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,H); ctx.stroke(); }
      for (let gy = 0; gy < H; gy += 32) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(W,gy); ctx.stroke(); }
      ctx.restore();
      // right panel tint
      ctx.fillStyle = 'rgba(0,255,255,0.03)';
      ctx.fillRect(487, 0, W-487, H);
    },
  },

  royal: {
    label: 'ROYAL',
    bg:          '#0e0b1e',
    accentColor: '#c8972a',
    balanceColor:'#e8c860',
    nameColor:   '#e8c860',
    badgeBg:     'rgba(200,151,42,0.18)',
    badgeBorder: '#c8972a',
    badgeText:   '#c8a030',
    badgeLabel:  '⚜ ROYAL',
    balanceLabel:'TREASURY',
    ringColor:   '#c8972a',
    ringGlow:    '#c8972a',
    dividerColor:'rgba(200,151,42,0.25)',
    panelBg:     'rgba(200,151,42,0.04)',
    sectionLabel:'⚜  SHOP ROLES',
    pillAfford:  (r,g,b) => `rgba(${r},${g},${b},0.13)`,
    pillBorder:  (r,g,b) => `rgba(${r},${g},${b},0.35)`,
    nameText:    '#d4b060',
    totalColor:  'rgba(232,200,96,0.45)',
    watermark:   'royal',
    extras: (ctx) => {
      // bg gradient
      const bg2 = ctx.createLinearGradient(0,0,W,H);
      bg2.addColorStop(0,'#0e0b1e'); bg2.addColorStop(1,'#1c1030');
      ctx.fillStyle=bg2; ctx.fillRect(0,0,W,H);
      // outer gold border
      ctx.strokeStyle = '#b8892a'; ctx.lineWidth = 2;
      ctx.strokeRect(7,7,W-14,H-14);
      ctx.strokeStyle = 'rgba(184,137,42,0.32)'; ctx.lineWidth = 1;
      ctx.strokeRect(14,14,W-28,H-28);
      // corner dots
      [[16,16],[W-16,16],[16,H-16],[W-16,H-16]].forEach(([cx,cy]) => {
        ctx.fillStyle='#b8892a'; ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2); ctx.fill();
      });
      // crown emoji above avatar
      ctx.font='22px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      ctx.fillText('👑', 110, 52);
      ctx.textAlign='left';
    },
  },

  minimal: {
    label: 'MINIMAL',
    bg:          '#f5f5f5',
    accentColor: '#1a1a1a',
    balanceColor:'#1a1a1a',
    nameColor:   '#1a1a1a',
    badgeBg:     '#1a1a1a',
    badgeBorder: '#1a1a1a',
    badgeText:   '#f5f5f5',
    badgeLabel:  'MINIMAL',
    balanceLabel:'BALANCE',
    ringColor:   '#1a1a1a',
    ringGlow:    'transparent',
    dividerColor:'#ddd',
    panelBg:     'rgba(0,0,0,0)',
    sectionLabel:'SHOP ROLES',
    pillAfford:  () => 'rgba(0,0,0,0)',
    pillBorder:  () => '#e0e0e0',
    nameText:    '#444',
    totalColor:  '#aaa',
    watermark:   'minimal',
    extras: (ctx) => {
      // white bg + top black bar
      ctx.fillStyle='#f5f5f5'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#1a1a1a'; ctx.fillRect(0,0,W,4);
      // right panel separator
      ctx.strokeStyle='#e8e8e8'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(487,20); ctx.lineTo(487,H-20); ctx.stroke();
    },
  },

  flame: {
    label: 'FLAME',
    bg:          '#080808',
    accentColor: '#FF5500',
    balanceColor:'#FF9955',
    nameColor:   '#FF9966',
    badgeBg:     'rgba(255,68,0,0.18)',
    badgeBorder: '#FF4400',
    badgeText:   '#FF7744',
    badgeLabel:  '🔥 FLAME',
    balanceLabel:'BALANCE',
    ringColor:   '#FF5500',
    ringGlow:    '#FF4400',
    dividerColor:'rgba(255,68,0,0.25)',
    panelBg:     'rgba(255,50,0,0.03)',
    sectionLabel:'🔥  SHOP ROLES',
    pillAfford:  (r,g,b) => `rgba(${r},${g},${b},0.13)`,
    pillBorder:  (r,g,b) => `rgba(${r},${g},${b},0.28)`,
    nameText:    '#cc8866',
    totalColor:  'rgba(255,100,50,0.45)',
    watermark:   'flame',
    extras: (ctx) => {
      // radial orange glows
      const g1 = ctx.createRadialGradient(W*0.85, H, 10, W*0.85, H, W*0.8);
      g1.addColorStop(0,'rgba(255,60,0,0.2)'); g1.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g1; ctx.fillRect(0,0,W,H);
      const g2 = ctx.createRadialGradient(110, H+10, 10, 110, H+10, H*1.1);
      g2.addColorStop(0,'rgba(255,80,0,0.16)'); g2.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g2; ctx.fillRect(0,0,W,H);
      // fire emoji above avatar
      ctx.font='20px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='alphabetic';
      ctx.fillText('🔥', 110, 52);
      ctx.textAlign='left';
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
async function generateThemedCard({ username, avatarUrl, balance, totalEarned, shopItems = [], theme = 'cyber' }) {
  const T = THEMES[theme] || THEMES.cyber;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── 1. Base background ────────────────────────────────────────────────────
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);

  // Theme-specific extras (background layers, borders, emoji)
  if (T.extras) T.extras(ctx);

  // ── 2. Accent bar (left edge) ─────────────────────────────────────────────
  if (theme !== 'minimal') {
    const g = ctx.createLinearGradient(0,0,0,H);
    const [ar,ag,ab] = hexRgb(T.accentColor);
    g.addColorStop(0,  `rgba(${ar},${ag},${ab},0.1)`);
    g.addColorStop(0.4, T.accentColor);
    g.addColorStop(0.6, T.accentColor);
    g.addColorStop(1,  `rgba(${ar},${ag},${ab},0.1)`);
    ctx.fillStyle = g;
    rrect(ctx, 0, 18, 4, H-36, 2);
    ctx.fill();
  }

  // ── 3. Avatar ─────────────────────────────────────────────────────────────
  const AX = 110, AY = (theme === 'royal' || theme === 'flame') ? 135 : 130, AR = 66;

  // Glow ring
  ctx.save();
  if (T.ringGlow !== 'transparent') { ctx.shadowColor = T.ringGlow; ctx.shadowBlur = 20; }
  ctx.strokeStyle = T.ringColor;
  ctx.lineWidth   = theme === 'minimal' ? 2.5 : 2;
  ctx.beginPath(); ctx.arc(AX, AY, AR+6, 0, Math.PI*2); ctx.stroke();
  if (theme !== 'minimal') {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = T.ringColor.replace(')', ',0.35)').replace('rgb','rgba');
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(AX, AY, AR+1, 0, Math.PI*2); ctx.stroke();
  }
  ctx.restore();

  // Avatar image
  ctx.save();
  ctx.beginPath(); ctx.arc(AX, AY, AR, 0, Math.PI*2); ctx.clip();
  try {
    const img = await loadImage(avatarUrl);
    ctx.drawImage(img, AX-AR, AY-AR, AR*2, AR*2);
  } catch {
    ctx.fillStyle = theme === 'minimal' ? '#ddd' : '#111';
    ctx.fill();
  }
  ctx.restore();

  // ── 4. Left panel — username, badge, balance ──────────────────────────────
  const TX = 204;

  // Username
  ctx.font         = `bold 32px ${FB}`;
  ctx.fillStyle    = T.nameColor;
  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';
  if (T.ringGlow !== 'transparent' && theme !== 'minimal') {
    ctx.save(); ctx.shadowColor = T.ringGlow; ctx.shadowBlur = 8;
  }
  const uname = username.length > 22 ? username.slice(0,20)+'…' : username;
  ctx.fillText(uname, TX, 38);
  if (T.ringGlow !== 'transparent' && theme !== 'minimal') ctx.restore();

  // Theme badge pill
  ctx.font = `bold 11px ${FB}`;
  const bw = ctx.measureText(T.badgeLabel).width + 18;
  rrect(ctx, TX, 84, bw, 20, 4);
  ctx.fillStyle = T.badgeBg; ctx.fill();
  ctx.strokeStyle = T.badgeBorder; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = T.badgeText; ctx.textBaseline = 'middle';
  ctx.fillText(T.badgeLabel, TX+9, 84+10);
  ctx.textBaseline = 'top';

  // Balance label
  ctx.font      = `bold 11px ${FB}`;
  ctx.fillStyle = theme === 'minimal' ? '#999' : 'rgba(255,255,255,0.35)';
  ctx.fillText(T.balanceLabel, TX, 118);

  // Hero balance
  let balSize = 50;
  const balStr = fmtBal(balance);
  ctx.font = `bold ${balSize}px ${FB}`;
  while (ctx.measureText(balStr).width > 265 && balSize > 26) { balSize -= 2; ctx.font = `bold ${balSize}px ${FB}`; }
  ctx.fillStyle = T.balanceColor;
  ctx.textBaseline = 'top';
  if (T.ringGlow !== 'transparent' && theme !== 'minimal') {
    ctx.save(); ctx.shadowColor = T.ringGlow; ctx.shadowBlur = 12;
  }
  ctx.fillText(balStr, TX, 132);
  if (T.ringGlow !== 'transparent' && theme !== 'minimal') ctx.restore();

  // Divider line
  ctx.fillStyle = theme === 'minimal' ? '#e0e0e0' : '#1a1d2e';
  ctx.fillRect(TX, 196, 268, 1);

  // Total earned
  ctx.font = `13px ${FN}`; ctx.fillStyle = T.totalColor; ctx.textBaseline = 'top';
  ctx.fillText('TOTAL EARNED', TX, 206);
  const lw = ctx.measureText('TOTAL EARNED ').width;
  ctx.font = `bold 13px ${FB}`;
  ctx.fillStyle = theme === 'minimal' ? '#555' : '#9ba0b8';
  ctx.fillText(fmtBal(totalEarned)+' cr', TX+lw, 206);

  // ── 5. Panel divider ──────────────────────────────────────────────────────
  if (theme !== 'minimal') {
    const dg = ctx.createLinearGradient(0,30,0,H-30);
    dg.addColorStop(0,  'rgba(0,0,0,0)');
    dg.addColorStop(0.3, T.dividerColor);
    dg.addColorStop(0.7, T.dividerColor);
    dg.addColorStop(1,  'rgba(0,0,0,0)');
    ctx.fillStyle = dg; ctx.fillRect(487, 30, 1, H-60);
  }

  // ── 6. Right panel — shop roles ───────────────────────────────────────────
  const RX = 507, RW = W-RX-16;
  const PW  = (RW-8)/2, PH = 38;

  ctx.font         = `bold 11px ${FB}`;
  ctx.fillStyle    = T.accentColor === '#1a1a1a' ? '#888' : T.accentColor;
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.fillText(T.sectionLabel, RX, 30);

  const pills = shopItems.slice(0, 8);
  if (!pills.length) {
    ctx.font = `13px ${FN}`;
    ctx.fillStyle = theme === 'minimal' ? '#ccc' : '#2a2d3e';
    ctx.fillText('No items in shop yet', RX, 54);
  } else {
    for (let i = 0; i < pills.length; i++) {
      const item = pills[i];
      const col  = i % 2, row = Math.floor(i/2);
      const px   = RX + col*(PW+8);
      const py   = 52 + row*(PH+8);
      const can  = balance >= item.price;
      const clr  = /^#[0-9A-Fa-f]{6}$/.test(item.color||'') ? item.color : '#5865F2';
      const [r,g,b] = hexRgb(clr);

      rrect(ctx, px, py, PW, PH, 8);
      ctx.fillStyle = can ? T.pillAfford(r,g,b) : (theme==='minimal'?'rgba(0,0,0,0)':'#111320');
      ctx.fill();
      if (theme === 'minimal') { ctx.strokeStyle = T.pillBorder(r,g,b); ctx.lineWidth=1; ctx.stroke(); }

      rrect(ctx, px, py, 3, PH, 2);
      ctx.fillStyle = can ? `rgb(${r},${g},${b})` : (theme==='minimal'?'#ccc':'#2a2d3e');
      ctx.fill();

      const ns = item.name.length > 14 ? item.name.slice(0,12)+'…' : item.name;
      ctx.font      = `bold 13px ${FB}`;
      ctx.fillStyle = can ? (theme==='minimal'?'#222':'#e8eaf6') : (theme==='minimal'?'#aaa':'#3a3d52');
      ctx.textBaseline='top';
      ctx.fillText(ns, px+11, py+6);

      ctx.font      = `11px ${FN}`;
      ctx.fillStyle = can ? `rgba(${r},${g},${b},0.85)` : (theme==='minimal'?'#bbb':'#2e3149');
      ctx.fillText(fmt(item.price)+' cr', px+11, py+22);
    }
  }

  // ── 7. Watermark ─────────────────────────────────────────────────────────
  ctx.font         = `10px ${FN}`;
  ctx.fillStyle    = theme === 'minimal' ? '#ccc' : '#1e2035';
  ctx.textAlign    = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(`flux • ${T.watermark}`, W-14, H-8);

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// New theme set — v2 (glass, vaporwave, paper, galaxy, academia)
// ─────────────────────────────────────────────────────────────────────────────
const THEME_NAMES_V2 = ['glass', 'vaporwave', 'paper', 'galaxy', 'academia'];

async function generateThemedCard2({ username, avatarUrl, balance, totalEarned, shopItems = [], theme = 'glass' }) {
  const canvas = createCanvas(W, H);
  const x      = canvas.getContext('2d');

  const BALANCE = fmtBal(balance);
  const TOTAL   = fmtBal(totalEarned) + ' cr';
  const UNAME   = username.length > 22 ? username.slice(0, 20) + '…' : username;
  const ROLES   = shopItems.slice(0, 4);

  // ── GLASS ───────────────────────────────────────────────────────────────────
  if (theme === 'glass') {
    const bg = x.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#c8d8ff'); bg.addColorStop(0.5, '#d8c8ff'); bg.addColorStop(1, '#ffc8e8');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);

    const blob1 = x.createRadialGradient(200, 100, 0, 200, 100, 180);
    blob1.addColorStop(0, 'rgba(255,255,255,0.5)'); blob1.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = blob1; x.fillRect(0, 0, W, H);
    const blob2 = x.createRadialGradient(700, 200, 0, 700, 200, 160);
    blob2.addColorStop(0, 'rgba(180,150,255,0.4)'); blob2.addColorStop(1, 'rgba(180,150,255,0)');
    x.fillStyle = blob2; x.fillRect(0, 0, W, H);

    rrect(x, 12, 12, W-24, H-24, 20);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 1.5; x.stroke();

    const AX = 110, AY = 130, AR = 65;
    x.save(); x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 2.5;
    x.shadowColor = 'rgba(150,130,255,0.5)'; x.shadowBlur = 12;
    x.beginPath(); x.arc(AX, AY, AR+5, 0, Math.PI*2); x.stroke(); x.restore();
    x.save(); x.beginPath(); x.arc(AX, AY, AR, 0, Math.PI*2); x.clip();
    try { const img = await loadImage(avatarUrl); x.drawImage(img, AX-AR, AY-AR, AR*2, AR*2); }
    catch { x.fillStyle = 'rgba(200,210,255,0.6)'; x.fill(); }
    x.restore();

    x.font = `bold 30px ${FB}`; x.fillStyle = '#2a1a5e';
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.fillText(UNAME, 200, 85);

    rrect(x, 200, 92, 102, 22, 11);
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 1; x.stroke();
    x.fillStyle = '#5533aa'; x.font = `bold 11px ${FB}`; x.textBaseline = 'middle';
    x.fillText('✦ GLASS THEME', 209, 103);

    x.fillStyle = 'rgba(60,30,120,0.5)'; x.font = `11px ${FB}`; x.textBaseline = 'alphabetic';
    x.fillText('BALANCE', 200, 135);
    x.fillStyle = '#1a0a4e'; x.font = `bold 50px ${FB}`; x.fillText(BALANCE, 200, 192);
    x.fillStyle = 'rgba(60,30,120,0.4)'; x.font = `13px ${FN}`; x.fillText('credits', 200+x.measureText(BALANCE).width+6, 192);

    x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(200, 200, 268, 1);
    x.fillStyle = 'rgba(60,30,120,0.45)'; x.font = `13px ${FN}`; x.textBaseline = 'alphabetic';
    x.fillText('TOTAL EARNED', 200, 218);
    x.font = `bold 13px ${FB}`; x.fillStyle = 'rgba(40,20,100,0.7)';
    x.fillText(TOTAL, 200+x.measureText('TOTAL EARNED ').width, 218);

    rrect(x, 492, 22, W-504, H-44, 14);
    x.fillStyle = 'rgba(255,255,255,0.25)'; x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 1; x.stroke();
    x.fillStyle = 'rgba(80,50,160,0.7)'; x.font = `bold 11px ${FB}`; x.textBaseline = 'alphabetic';
    x.fillText('SHOP ROLES', 510, 48);
    ROLES.forEach(({ name, color, price }, i) => {
      const rx = 510+(i%2)*175, ry = 56+Math.floor(i/2)*52;
      rrect(x, rx, ry, 162, 40, 10);
      x.fillStyle = 'rgba(255,255,255,0.45)'; x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 1; x.stroke();
      const clr = /^#[0-9A-Fa-f]{6}$/.test(color||'') ? color : '#5865F2';
      x.fillStyle = clr; x.fillRect(rx, ry, 3, 40);
      x.fillStyle = '#2a1a5e'; x.font = `bold 12px ${FB}`; x.textBaseline = 'top';
      x.fillText((name||'Item').slice(0,14), rx+10, ry+7);
      x.fillStyle = 'rgba(80,50,160,0.6)'; x.font = `11px ${FN}`; x.fillText(fmt(price)+' cr', rx+10, ry+22);
    });
    if (!ROLES.length) { x.fillStyle='rgba(80,50,160,0.4)'; x.font=`13px ${FN}`; x.textBaseline='middle'; x.fillText('No items yet', 510, H/2); }
  }

  // ── VAPORWAVE ────────────────────────────────────────────────────────────────
  if (theme === 'vaporwave') {
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0020'); bg.addColorStop(0.6, '#1a0035'); bg.addColorStop(1, '#000');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);

    for (let sy = 0; sy < H; sy += 4) { x.fillStyle='rgba(0,0,0,0.18)'; x.fillRect(0, sy, W, 2); }

    x.save(); x.globalAlpha = 0.18; x.strokeStyle = '#ff44aa'; x.lineWidth = 1;
    const VP = { x: W/2, y: H*0.55 };
    for (let gy = H*0.55; gy <= H; gy += 18) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
    for (let gx = -W; gx <= W*2; gx += 60) {
      x.beginPath(); x.moveTo(VP.x+(gx-VP.x)*0.01, VP.y); x.lineTo(VP.x+(gx-VP.x), H); x.stroke();
    }
    x.restore();

    x.save();
    const sunGrad = x.createLinearGradient(W*0.7, 0, W*0.7, 150);
    sunGrad.addColorStop(0,'#ff6ec7'); sunGrad.addColorStop(0.4,'#ff6600'); sunGrad.addColorStop(1,'#ffcc00');
    x.fillStyle = sunGrad;
    x.beginPath(); x.arc(W*0.72, H*0.55, 80, Math.PI, 0); x.fill();
    x.fillStyle = '#0d0020';
    [0.3,0.42,0.52,0.59,0.64].forEach(t => { x.fillRect(W*0.72-82, H*0.55-80+t*160, 164, 6); });
    x.restore();

    const stripe = x.createLinearGradient(0,0,W,0);
    stripe.addColorStop(0,'#ff44aa'); stripe.addColorStop(0.5,'#44ffee'); stripe.addColorStop(1,'#ff44aa');
    x.fillStyle = stripe; x.fillRect(0,0,W,3); x.fillRect(0,H-3,W,3);

    const AX=110, AY=130, AR=65;
    x.save(); x.shadowColor='#ff44aa'; x.shadowBlur=25;
    x.strokeStyle='#ff44aa'; x.lineWidth=2;
    x.beginPath(); x.arc(AX,AY,AR+6,0,Math.PI*2); x.stroke();
    x.shadowColor='#44ffee'; x.shadowBlur=15;
    x.strokeStyle='rgba(68,255,238,0.5)'; x.lineWidth=5;
    x.beginPath(); x.arc(AX,AY,AR+1,0,Math.PI*2); x.stroke(); x.restore();
    x.save(); x.beginPath(); x.arc(AX,AY,AR,0,Math.PI*2); x.clip();
    try { const img = await loadImage(avatarUrl); x.drawImage(img, AX-AR, AY-AR, AR*2, AR*2); }
    catch { x.fillStyle='#200040'; x.fill(); }
    x.restore();

    x.save(); x.shadowColor='#ff44aa'; x.shadowBlur=12;
    x.fillStyle='#ff88dd'; x.font=`bold 28px ${FB}`; x.textAlign='left'; x.textBaseline='alphabetic';
    x.fillText(UNAME, 200, 80); x.restore();

    x.fillStyle='rgba(255,68,170,0.2)'; rrect(x,200,87,120,20,4); x.fill();
    x.strokeStyle='#ff44aa'; x.lineWidth=1; rrect(x,200,87,120,20,4); x.stroke();
    x.fillStyle='#ff88dd'; x.font=`bold 10px ${FB}`; x.textBaseline='middle';
    x.fillText('✦ VAPORWAVE THEME', 207, 97);

    x.fillStyle='rgba(255,100,200,0.45)'; x.font=`11px ${FB}`; x.textBaseline='alphabetic';
    x.fillText('BALANCE', 200, 130);
    x.save(); x.shadowColor='#ff44aa'; x.shadowBlur=10;
    x.fillStyle='#ff88ee'; x.font=`bold 48px ${FB}`; x.fillText(BALANCE, 200, 186); x.restore();
    x.fillStyle='rgba(68,255,238,0.5)'; x.font=`13px ${FN}`; x.fillText('credits', 200+x.measureText(BALANCE).width+6, 186);

    x.fillStyle='rgba(68,255,238,0.2)'; x.fillRect(200,194,268,1);
    x.fillStyle='rgba(255,100,200,0.4)'; x.font=`13px ${FN}`; x.fillText('TOTAL EARNED', 200, 212);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(68,255,238,0.7)';
    x.fillText(TOTAL, 200+x.measureText('TOTAL EARNED ').width, 212);

    const vd=x.createLinearGradient(0,0,0,H);
    vd.addColorStop(0,'rgba(255,68,170,0)'); vd.addColorStop(0.5,'rgba(255,68,170,0.35)'); vd.addColorStop(1,'rgba(255,68,170,0)');
    x.strokeStyle=vd; x.lineWidth=1; x.beginPath(); x.moveTo(487,20); x.lineTo(487,H-20); x.stroke();

    x.fillStyle='#ff88dd'; x.font=`bold 11px ${FB}`; x.textBaseline='top';
    x.fillText('✦  SHOP ROLES', 500, 28);
    ROLES.forEach(({ name, color, price }, i) => {
      const rx=500+(i%2)*178, ry=44+Math.floor(i/2)*44;
      x.fillStyle='rgba(255,68,170,0.08)'; rrect(x,rx,ry,165,35,6); x.fill();
      x.strokeStyle='rgba(255,68,170,0.3)'; x.lineWidth=1; rrect(x,rx,ry,165,35,6); x.stroke();
      const clr = /^#[0-9A-Fa-f]{6}$/.test(color||'') ? color : '#5865F2';
      x.fillStyle=clr; x.fillRect(rx,ry,3,35);
      x.fillStyle='#ff88dd'; x.font=`bold 12px ${FB}`; x.fillText((name||'Item').slice(0,14),rx+10,ry+6);
      x.fillStyle='rgba(68,255,238,0.6)'; x.font=`11px ${FN}`; x.fillText(fmt(price)+' cr',rx+10,ry+21);
    });
    if (!ROLES.length) { x.fillStyle='rgba(255,68,170,0.4)'; x.font=`13px ${FN}`; x.textBaseline='middle'; x.fillText('No items yet', 500, H/2); }
  }

  // ── PAPER ────────────────────────────────────────────────────────────────────
  if (theme === 'paper') {
    x.fillStyle = '#f0e6d0'; x.fillRect(0, 0, W, H);

    const vig = x.createRadialGradient(W/2,H/2,H*0.3,W/2,H/2,W*0.7);
    vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(80,50,20,0.15)');
    x.fillStyle=vig; x.fillRect(0,0,W,H);

    // paper grain
    const rng = (s) => { let v=s; return () => { v=(v*1664525+1013904223)&0xffffffff; return (v>>>0)/0xffffffff; }; };
    const rand = rng(77);
    for (let i=0; i<1800; i++) { x.fillStyle=`rgba(100,70,30,${rand()*0.06})`; x.fillRect(rand()*W,rand()*H,1,1); }

    x.fillStyle='#5c3d1e'; x.fillRect(0,0,6,H);
    x.fillStyle='rgba(92,61,30,0.35)'; x.fillRect(10,0,1,H);
    x.strokeStyle='rgba(92,61,30,0.25)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(50,110); x.lineTo(470,110); x.stroke();

    const AX=105, AY=130, AR=62;
    x.strokeStyle='#5c3d1e'; x.lineWidth=2; x.setLineDash([6,3]);
    x.beginPath(); x.arc(AX,AY,AR+8,0,Math.PI*2); x.stroke(); x.setLineDash([]);
    x.save(); x.beginPath(); x.arc(AX,AY,AR,0,Math.PI*2); x.clip();
    try { const img = await loadImage(avatarUrl); x.drawImage(img, AX-AR, AY-AR, AR*2, AR*2); }
    catch { x.fillStyle='#d4c4a0'; x.fill(); }
    x.restore();

    x.fillStyle='#2a1a08'; x.font=`bold 30px ${FB}`; x.textAlign='left'; x.textBaseline='alphabetic';
    x.fillText(UNAME, 192, 82);

    x.fillStyle='rgba(92,61,30,0.1)'; rrect(x,192,88,106,22,3); x.fill();
    x.strokeStyle='rgba(92,61,30,0.5)'; x.lineWidth=1.5; rrect(x,192,88,106,22,3); x.stroke();
    x.fillStyle='#5c3d1e'; x.font=`bold 10px ${FB}`; x.textBaseline='middle';
    x.fillText('✦ PAPER THEME', 200, 99);

    x.fillStyle='rgba(92,61,30,0.55)'; x.font=`11px ${FB}`; x.textBaseline='alphabetic';
    x.fillText('BALANCE', 192, 130);
    x.fillStyle='#1a0e04'; x.font=`bold 50px ${FB}`; x.fillText(BALANCE, 192, 188);
    x.fillStyle='rgba(92,61,30,0.4)'; x.font=`13px ${FN}`; x.fillText('credits', 192+x.measureText(BALANCE).width+6, 188);

    x.strokeStyle='rgba(92,61,30,0.2)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(192,198); x.lineTo(460,198); x.stroke();
    x.fillStyle='rgba(92,61,30,0.45)'; x.font=`13px ${FN}`;
    x.fillText('TOTAL EARNED', 192, 216);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(40,20,8,0.7)';
    x.fillText(TOTAL, 192+x.measureText('TOTAL EARNED ').width, 216);

    x.fillStyle='rgba(92,61,30,0.06)'; x.fillRect(488,14,W-502,H-28);
    x.strokeStyle='rgba(92,61,30,0.2)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(488,14); x.lineTo(488,H-14); x.stroke();
    x.fillStyle='#5c3d1e'; x.font=`bold 11px ${FB}`; x.textBaseline='alphabetic';
    x.fillText('SHOP ITEMS', 500, 42);
    ROLES.forEach(({ name, color, price }, i) => {
      const rx=500+(i%2)*176, ry=48+Math.floor(i/2)*46;
      x.fillStyle='rgba(92,61,30,0.06)'; rrect(x,rx,ry,163,36,4); x.fill();
      x.strokeStyle='rgba(92,61,30,0.2)'; x.lineWidth=1; rrect(x,rx,ry,163,36,4); x.stroke();
      const clr = /^#[0-9A-Fa-f]{6}$/.test(color||'') ? color : '#5865F2';
      x.fillStyle=clr; x.fillRect(rx,ry,4,36);
      x.fillStyle='#2a1a08'; x.font=`bold 12px ${FB}`; x.textBaseline='top';
      x.fillText((name||'Item').slice(0,14),rx+11,ry+6);
      x.fillStyle='rgba(92,61,30,0.55)'; x.font=`11px ${FN}`; x.fillText(fmt(price)+' cr',rx+11,ry+21);
    });
    if (!ROLES.length) { x.fillStyle='rgba(92,61,30,0.4)'; x.font=`13px ${FN}`; x.textBaseline='middle'; x.fillText('No items yet', 500, H/2); }
  }

  // ── GALAXY ───────────────────────────────────────────────────────────────────
  if (theme === 'galaxy') {
    const bg = x.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,'#04001a'); bg.addColorStop(0.5,'#0a0025'); bg.addColorStop(1,'#01040f');
    x.fillStyle=bg; x.fillRect(0,0,W,H);

    const rng2 = (s) => { let v=s; return () => { v=(v*1664525+1013904223)&0xffffffff; return (v>>>0)/0xffffffff; }; };
    const rand2 = rng2(42);
    for (let i=0; i<200; i++) {
      const sx=rand2()*W, sy=rand2()*H;
      const size=rand2()<0.95?1:rand2()*2+1;
      x.fillStyle=`rgba(255,255,255,${rand2()*0.7+0.3})`;
      x.beginPath(); x.arc(sx,sy,size*0.5,0,Math.PI*2); x.fill();
    }

    const neb1=x.createRadialGradient(110,130,0,110,130,160);
    neb1.addColorStop(0,'rgba(120,0,200,0.18)'); neb1.addColorStop(0.5,'rgba(60,0,120,0.08)'); neb1.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=neb1; x.fillRect(0,0,W,H);
    const neb2=x.createRadialGradient(W*0.75,H*0.3,0,W*0.75,H*0.3,200);
    neb2.addColorStop(0,'rgba(0,80,200,0.15)'); neb2.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=neb2; x.fillRect(0,0,W,H);

    const ab=x.createLinearGradient(0,0,0,H);
    ab.addColorStop(0,'rgba(120,0,200,0)'); ab.addColorStop(0.3,'#8800cc'); ab.addColorStop(0.7,'#0066ff'); ab.addColorStop(1,'rgba(0,102,255,0)');
    x.fillStyle=ab; x.fillRect(0,0,4,H);

    const AX=110,AY=130,AR=65;
    const ring=x.createLinearGradient(AX-AR,AY-AR,AX+AR,AY+AR);
    ring.addColorStop(0,'#8800cc'); ring.addColorStop(0.5,'#0066ff'); ring.addColorStop(1,'#00ccff');
    x.save(); x.shadowColor='#6600aa'; x.shadowBlur=20;
    x.strokeStyle=ring; x.lineWidth=2.5;
    x.beginPath(); x.arc(AX,AY,AR+6,0,Math.PI*2); x.stroke(); x.restore();
    x.save(); x.beginPath(); x.arc(AX,AY,AR,0,Math.PI*2); x.clip();
    try { const img = await loadImage(avatarUrl); x.drawImage(img, AX-AR, AY-AR, AR*2, AR*2); }
    catch { x.fillStyle='#050015'; x.fill(); }
    x.restore();

    const ug=x.createLinearGradient(200,0,400,0);
    ug.addColorStop(0,'#cc88ff'); ug.addColorStop(1,'#6699ff');
    x.save(); x.shadowColor='#8800cc'; x.shadowBlur=10;
    x.fillStyle=ug; x.font=`bold 30px ${FB}`; x.textAlign='left'; x.textBaseline='alphabetic';
    x.fillText(UNAME,200,82); x.restore();

    x.fillStyle='rgba(136,0,204,0.2)'; rrect(x,200,88,116,20,4); x.fill();
    x.strokeStyle='rgba(136,0,204,0.5)'; x.lineWidth=1; rrect(x,200,88,116,20,4); x.stroke();
    x.fillStyle='#cc88ff'; x.font=`bold 10px ${FB}`; x.textBaseline='middle';
    x.fillText('✦ GALAXY THEME', 207, 98);

    x.fillStyle='rgba(180,140,255,0.4)'; x.font=`11px ${FB}`; x.textBaseline='alphabetic';
    x.fillText('BALANCE',200,132);
    const bg2=x.createLinearGradient(200,0,400,0);
    bg2.addColorStop(0,'#cc88ff'); bg2.addColorStop(1,'#6699ff');
    x.save(); x.shadowColor='#8800cc'; x.shadowBlur=10;
    x.fillStyle=bg2; x.font=`bold 48px ${FB}`; x.fillText(BALANCE,200,188); x.restore();
    x.fillStyle='rgba(102,153,255,0.45)'; x.font=`13px ${FN}`; x.fillText('credits',200+x.measureText(BALANCE).width+6,188);

    x.fillStyle='rgba(136,0,204,0.25)'; x.fillRect(200,196,268,1);
    x.fillStyle='rgba(180,140,255,0.4)'; x.font=`13px ${FN}`; x.textBaseline='alphabetic';
    x.fillText('TOTAL EARNED',200,214);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(102,153,255,0.7)';
    x.fillText(TOTAL, 200+x.measureText('TOTAL EARNED ').width, 214);

    const vd=x.createLinearGradient(0,0,0,H);
    vd.addColorStop(0,'rgba(136,0,204,0)'); vd.addColorStop(0.5,'rgba(136,0,204,0.3)'); vd.addColorStop(1,'rgba(136,0,204,0)');
    x.strokeStyle=vd; x.lineWidth=1; x.beginPath(); x.moveTo(487,20); x.lineTo(487,H-20); x.stroke();

    x.fillStyle='#cc88ff'; x.font=`bold 11px ${FB}`; x.textBaseline='top';
    x.fillText('✦  SHOP ROLES',500,28);
    ROLES.forEach(({ name, color, price }, i) => {
      const rx=500+(i%2)*178, ry=44+Math.floor(i/2)*44;
      x.fillStyle='rgba(100,0,180,0.1)'; rrect(x,rx,ry,165,35,6); x.fill();
      x.strokeStyle='rgba(136,0,204,0.28)'; x.lineWidth=1; rrect(x,rx,ry,165,35,6); x.stroke();
      const clr = /^#[0-9A-Fa-f]{6}$/.test(color||'') ? color : '#5865F2';
      x.fillStyle=clr; x.fillRect(rx,ry,3,35);
      x.fillStyle='#cc88ff'; x.font=`bold 12px ${FB}`; x.fillText((name||'Item').slice(0,14),rx+10,ry+6);
      x.fillStyle='rgba(102,153,255,0.6)'; x.font=`11px ${FN}`; x.fillText(fmt(price)+' cr',rx+10,ry+21);
    });
    if (!ROLES.length) { x.fillStyle='rgba(136,0,204,0.4)'; x.font=`13px ${FN}`; x.textBaseline='middle'; x.fillText('No items yet', 500, H/2); }
  }

  // ── ACADEMIA ─────────────────────────────────────────────────────────────────
  if (theme === 'academia') {
    x.fillStyle='#1a1208'; x.fillRect(0,0,W,H);

    const bg2=x.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.6);
    bg2.addColorStop(0,'rgba(60,40,10,0.5)'); bg2.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=bg2; x.fillRect(0,0,W,H);

    const rng3 = (s) => { let v=s; return () => { v=(v*1664525+1013904223)&0xffffffff; return (v>>>0)/0xffffffff; }; };
    const rand3 = rng3(13);
    for (let i=0; i<1200; i++) { x.fillStyle=`rgba(200,160,80,${rand3()*0.04})`; x.fillRect(rand3()*W,rand3()*H,1,1); }

    const lb=x.createLinearGradient(0,0,0,H);
    lb.addColorStop(0,'rgba(180,140,60,0)'); lb.addColorStop(0.3,'#b48c3c'); lb.addColorStop(0.7,'#b48c3c'); lb.addColorStop(1,'rgba(180,140,60,0)');
    x.fillStyle=lb; x.fillRect(0,0,5,H);

    x.strokeStyle='rgba(180,140,60,0.25)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(30,105); x.lineTo(470,105); x.stroke();
    x.beginPath(); x.moveTo(30,108); x.lineTo(470,108); x.stroke();

    const AX=110,AY=130,AR=63;
    x.save(); x.shadowColor='#b48c3c'; x.shadowBlur=15;
    x.strokeStyle='#b48c3c'; x.lineWidth=2;
    x.beginPath(); x.arc(AX,AY,AR+7,0,Math.PI*2); x.stroke();
    x.strokeStyle='rgba(180,140,60,0.4)'; x.lineWidth=4;
    x.beginPath(); x.arc(AX,AY,AR+2,0,Math.PI*2); x.stroke(); x.restore();
    x.save(); x.beginPath(); x.arc(AX,AY,AR,0,Math.PI*2); x.clip();
    try { const img = await loadImage(avatarUrl); x.drawImage(img, AX-AR, AY-AR, AR*2, AR*2); }
    catch { x.fillStyle='#0d0a04'; x.fill(); }
    x.restore();

    x.fillStyle='#d4a84a'; x.font=`bold 28px ${FB}`; x.textAlign='left'; x.textBaseline='alphabetic';
    x.fillText(UNAME,200,80);

    x.fillStyle='rgba(180,140,60,0.15)'; rrect(x,200,87,120,20,3); x.fill();
    x.strokeStyle='rgba(180,140,60,0.45)'; x.lineWidth=1; rrect(x,200,87,120,20,3); x.stroke();
    x.fillStyle='#c49840'; x.font=`bold 10px ${FB}`; x.textBaseline='middle';
    x.fillText('✦ ACADEMIA THEME', 207,97);

    x.fillStyle='rgba(180,140,60,0.45)'; x.font=`11px ${FB}`; x.textBaseline='alphabetic';
    x.fillText('BALANCE',200,128);
    x.fillStyle='#d4a84a'; x.font=`bold 50px ${FB}`; x.fillText(BALANCE,200,186);
    x.fillStyle='rgba(180,140,60,0.4)'; x.font=`13px ${FN}`; x.fillText('credits',200+x.measureText(BALANCE).width+6,186);

    x.fillStyle='rgba(180,140,60,0.18)'; x.fillRect(200,194,268,1);
    x.fillStyle='rgba(180,140,60,0.4)'; x.font=`13px ${FN}`;
    x.fillText('TOTAL EARNED',200,212);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(210,170,80,0.65)';
    x.fillText(TOTAL, 200+x.measureText('TOTAL EARNED ').width, 212);

    const vd=x.createLinearGradient(0,0,0,H);
    vd.addColorStop(0,'rgba(180,140,60,0)'); vd.addColorStop(0.5,'rgba(180,140,60,0.22)'); vd.addColorStop(1,'rgba(180,140,60,0)');
    x.strokeStyle=vd; x.lineWidth=1; x.beginPath(); x.moveTo(487,15); x.lineTo(487,H-15); x.stroke();

    x.fillStyle='#d4a84a'; x.font=`bold 11px ${FB}`; x.textBaseline='top';
    x.fillText('✦  SHOP ROLES',500,28);
    ROLES.forEach(({ name, color, price }, i) => {
      const rx=500+(i%2)*178, ry=44+Math.floor(i/2)*44;
      x.fillStyle='rgba(180,140,60,0.07)'; rrect(x,rx,ry,165,35,5); x.fill();
      x.strokeStyle='rgba(180,140,60,0.25)'; x.lineWidth=1; rrect(x,rx,ry,165,35,5); x.stroke();
      const clr = /^#[0-9A-Fa-f]{6}$/.test(color||'') ? color : '#5865F2';
      x.fillStyle=clr; x.fillRect(rx,ry,3,35);
      x.fillStyle='#d4a84a'; x.font=`bold 12px ${FB}`; x.fillText((name||'Item').slice(0,14),rx+10,ry+6);
      x.fillStyle='rgba(180,140,60,0.55)'; x.font=`11px ${FN}`; x.fillText(fmt(price)+' cr',rx+10,ry+21);
    });
    if (!ROLES.length) { x.fillStyle='rgba(180,140,60,0.4)'; x.font=`13px ${FN}`; x.textBaseline='middle'; x.fillText('No items yet', 500, H/2); }
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateThemedCard, THEME_NAMES: Object.keys(THEMES), generateThemedCard2, THEME_NAMES_V2 };
