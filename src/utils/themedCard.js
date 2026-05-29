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

// ─────────────────────────────────────────────────────────────────────────────
// New theme set — v3 (holographic, city, frozen, sakura, magma)
// ─────────────────────────────────────────────────────────────────────────────
const THEME_NAMES_V3 = ['holographic', 'city', 'frozen', 'sakura', 'magma'];

function mkRng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}
function drawCrack(ctx, sx, sy, len, angle, depth, rng) {
  if (depth <= 0 || len < 5) return;
  const ex = sx + Math.cos(angle) * len;
  const ey = sy + Math.sin(angle) * len;
  const mx = (sx+ex)/2 + (rng()-0.5)*len*0.35;
  const my = (sy+ey)/2 + (rng()-0.5)*len*0.25;
  ctx.save();
  ctx.shadowColor = '#ff5500'; ctx.shadowBlur = 18;
  ctx.strokeStyle = `rgba(255,${80+depth*22},0,${0.45+depth*0.08})`;
  ctx.lineWidth = depth * 0.9;
  ctx.beginPath(); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(mx,my,ex,ey); ctx.stroke();
  ctx.shadowBlur = 5;
  ctx.strokeStyle = `rgba(255,${200+depth*6},60,0.95)`;
  ctx.lineWidth = depth * 0.22;
  ctx.beginPath(); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(mx,my,ex,ey); ctx.stroke();
  ctx.restore();
  drawCrack(ctx, ex, ey, len*(0.52+rng()*0.32), angle+(rng()-0.5)*(0.6+rng()*0.5), depth-1, rng);
  if (rng() > 0.38) drawCrack(ctx, ex, ey, len*(0.38+rng()*0.22), angle+(rng()-0.5)*(0.9+rng()*0.7), depth-2, rng);
}

async function generateThemedCard3({ username, avatarUrl, balance, totalEarned, shopItems = [], theme = 'holographic' }) {
  const canvas = createCanvas(W, H);
  const x      = canvas.getContext('2d');

  const BALANCE = fmtBal(balance);
  const TOTAL   = fmtBal(totalEarned) + ' cr';
  const UNAME   = username.length > 22 ? username.slice(0, 20) + '…' : username;
  const ROLES   = shopItems.slice(0, 4);

  // ── HOLOGRAPHIC ──────────────────────────────────────────────────────────────
  if (theme === 'holographic') {
    x.fillStyle = '#06060e'; x.fillRect(0,0,W,H);
    x.save(); x.globalAlpha = 0.14;
    const r1 = x.createLinearGradient(0,0,W,H);
    r1.addColorStop(0,'#ff0066'); r1.addColorStop(0.14,'#ff6600'); r1.addColorStop(0.28,'#ffee00');
    r1.addColorStop(0.43,'#00ff88'); r1.addColorStop(0.57,'#0088ff'); r1.addColorStop(0.71,'#9900ff');
    r1.addColorStop(0.85,'#ff00aa'); r1.addColorStop(1,'#ff0066');
    x.fillStyle=r1; x.fillRect(0,0,W,H); x.restore();
    x.save(); x.globalAlpha=0.09; x.translate(W/2,H/2); x.rotate(Math.PI/3);
    const r2=x.createLinearGradient(-W,0,W,0);
    r2.addColorStop(0,'#00ffee'); r2.addColorStop(0.33,'#ff00cc'); r2.addColorStop(0.66,'#aaff00'); r2.addColorStop(1,'#00ffee');
    x.fillStyle=r2; x.fillRect(-W,-H,W*2,H*2); x.restore();
    const pearl=x.createRadialGradient(W*0.38,H*0.38,0,W*0.38,H*0.38,W*0.5);
    pearl.addColorStop(0,'rgba(255,255,255,0.14)'); pearl.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=pearl; x.fillRect(0,0,W,H);
    rrect(x,5,5,W-10,H-10,16);
    const bord=x.createLinearGradient(0,0,W,H);
    bord.addColorStop(0,'#ff0066'); bord.addColorStop(0.2,'#ff9900'); bord.addColorStop(0.4,'#00ffcc');
    bord.addColorStop(0.6,'#9900ff'); bord.addColorStop(0.8,'#0088ff'); bord.addColorStop(1,'#ff0066');
    x.strokeStyle=bord; x.lineWidth=2.5; x.stroke();
    rrect(x,9,9,W-18,H-18,13); x.strokeStyle='rgba(255,255,255,0.07)'; x.lineWidth=1; x.stroke();

    const AX=110,AY=130,AR=65;
    [0,50,100,160,210,270,320].forEach((h,i,a)=>{
      const s=(i/a.length)*Math.PI*2-Math.PI/2, e=((i+1)/a.length)*Math.PI*2-Math.PI/2;
      x.save(); const col=`hsl(${h},100%,62%)`;
      x.shadowColor=col; x.shadowBlur=20; x.strokeStyle=col; x.lineWidth=3.5;
      x.beginPath(); x.arc(AX,AY,AR+7,s,e); x.stroke(); x.restore();
    });
    x.save(); x.strokeStyle='rgba(255,255,255,0.12)'; x.lineWidth=9;
    x.beginPath(); x.arc(AX,AY,AR+1,0,Math.PI*2); x.stroke(); x.restore();
    x.save(); x.beginPath(); x.arc(AX,AY,AR,0,Math.PI*2); x.clip();
    try { const img=await loadImage(avatarUrl); x.drawImage(img,AX-AR,AY-AR,AR*2,AR*2); }
    catch { x.fillStyle='#0a0a18'; x.fill(); } x.restore();

    x.fillStyle='#ffffff'; x.font=`bold 30px ${FB}`; x.textAlign='left'; x.textBaseline='alphabetic';
    x.fillText(UNAME,200,84);
    rrect(x,200,91,138,22,11);
    const bBg=x.createLinearGradient(200,0,338,0);
    bBg.addColorStop(0,'rgba(255,0,102,0.22)'); bBg.addColorStop(0.5,'rgba(0,200,255,0.18)'); bBg.addColorStop(1,'rgba(150,0,255,0.22)');
    x.fillStyle=bBg; x.fill();
    const bBrd=x.createLinearGradient(200,0,338,0);
    bBrd.addColorStop(0,'#ff0066'); bBrd.addColorStop(0.5,'#00ccff'); bBrd.addColorStop(1,'#aa00ff');
    x.strokeStyle=bBrd; x.lineWidth=1; x.stroke();
    x.fillStyle='#fff'; x.font=`bold 11px ${FB}`; x.textBaseline='middle'; x.fillText('✦ HOLOGRAPHIC',210,102);

    x.fillStyle='rgba(255,255,255,0.38)'; x.font=`11px ${FB}`; x.textBaseline='alphabetic'; x.fillText('BALANCE',200,132);
    const balG=x.createLinearGradient(200,0,420,0);
    balG.addColorStop(0,'#ff88cc'); balG.addColorStop(0.5,'#88ffee'); balG.addColorStop(1,'#aaaaff');
    x.save(); x.shadowColor='rgba(150,150,255,0.6)'; x.shadowBlur=18;
    x.fillStyle=balG; x.font=`bold 50px ${FB}`; x.fillText(BALANCE,200,190); x.restore();
    x.fillStyle='rgba(255,255,255,0.28)'; x.font=`13px ${FN}`; x.fillText('credits',200+x.measureText(BALANCE).width+8,190);
    x.fillStyle='rgba(255,255,255,0.1)'; x.fillRect(200,198,270,1);
    x.fillStyle='rgba(255,255,255,0.33)'; x.font=`13px ${FN}`; x.textBaseline='alphabetic'; x.fillText('TOTAL EARNED',200,215);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(180,210,255,0.65)'; x.fillText(TOTAL,200+x.measureText('TOTAL EARNED ').width,215);

    rrect(x,490,18,W-504,H-36,12);
    const pBg=x.createLinearGradient(490,0,W,0);
    pBg.addColorStop(0,'rgba(255,255,255,0.07)'); pBg.addColorStop(1,'rgba(255,255,255,0.02)');
    x.fillStyle=pBg; x.fill(); x.strokeStyle='rgba(255,255,255,0.13)'; x.lineWidth=1; x.stroke();
    x.fillStyle='rgba(255,255,255,0.75)'; x.font=`bold 11px ${FB}`; x.textBaseline='alphabetic'; x.fillText('✦  SHOP ROLES',506,44);
    ROLES.forEach(({name,color,price},i)=>{
      const rx=506+(i%2)*174,ry=50+Math.floor(i/2)*50;
      rrect(x,rx,ry,162,40,8);
      const p2=x.createLinearGradient(rx,0,rx+162,0);
      p2.addColorStop(0,'rgba(255,255,255,0.08)'); p2.addColorStop(1,'rgba(255,255,255,0.03)');
      x.fillStyle=p2; x.fill(); x.strokeStyle='rgba(255,255,255,0.16)'; x.lineWidth=1; x.stroke();
      const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle=clr; x.fillRect(rx,ry,3,40);
      x.fillStyle='#eee'; x.font=`bold 12px ${FB}`; x.textBaseline='top'; x.fillText((name||'Item').slice(0,14),rx+10,ry+7);
      x.fillStyle='rgba(255,255,255,0.38)'; x.font=`11px ${FN}`; x.fillText(fmt(price)+' cr',rx+10,ry+22);
    });
    if (!ROLES.length) { x.fillStyle='rgba(255,255,255,0.3)'; x.font=`13px ${FN}`; x.textBaseline='middle'; x.fillText('No items yet',506,H/2); }
  }

  // ── NEON CITY ─────────────────────────────────────────────────────────────────
  if (theme === 'city') {
    const sky=x.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#000608'); sky.addColorStop(0.55,'#020e1c'); sky.addColorStop(1,'#040112');
    x.fillStyle=sky; x.fillRect(0,0,W,H);
    const r=mkRng(99); let bx=0;
    while(bx<W){
      const bw=r()*38+12,bh=r()*140+30;
      x.fillStyle=`rgba(8,18,38,${0.7+r()*0.25})`; x.fillRect(bx,H-bh,bw,bh);
      for(let wy=H-bh+4;wy<H-4;wy+=9){
        for(let wx2=bx+3;wx2<bx+bw-3;wx2+=6){
          if(r()>0.42){ x.fillStyle=r()>0.5?`rgba(255,240,110,${r()*0.55+0.3})`:`rgba(140,210,255,${r()*0.45+0.2})`; x.fillRect(wx2,wy,4,5); }
        }
      }
      bx+=bw+r()*4;
    }
    const gh=x.createLinearGradient(0,H*0.7,0,H);
    gh.addColorStop(0,'rgba(0,0,0,0)'); gh.addColorStop(1,'rgba(0,120,220,0.1)');
    x.fillStyle=gh; x.fillRect(0,0,W,H);
    [{sx:310,sy:88,sw:54,sh:7,col:'#ff2288'},{sx:590,sy:68,sw:42,sh:7,col:'#00ffcc'},{sx:710,sy:108,sw:32,sh:6,col:'#ffcc00'},{sx:430,sy:56,sw:22,sh:6,col:'#44aaff'},{sx:520,sy:100,sw:18,sh:5,col:'#ff6600'}].forEach(s=>{
      x.save(); x.shadowColor=s.col; x.shadowBlur=22; x.globalAlpha=0.75; x.fillStyle=s.col; x.fillRect(s.sx,s.sy,s.sw,s.sh); x.restore();
    });
    const rr=mkRng(55); x.save(); x.globalAlpha=0.055; x.strokeStyle='#88ccff'; x.lineWidth=1;
    for(let i=0;i<70;i++){ const rx2=rr()*W,ry2=rr()*H,rl=rr()*18+5; x.beginPath(); x.moveTo(rx2,ry2); x.lineTo(rx2+2,ry2+rl); x.stroke(); }
    x.restore();
    const ts=x.createLinearGradient(0,0,W,0);
    ts.addColorStop(0,'#ff2288'); ts.addColorStop(0.5,'#00ffcc'); ts.addColorStop(1,'#ff2288');
    x.fillStyle=ts; x.fillRect(0,0,W,2); x.fillRect(0,H-2,W,2);

    const AX=110,AY=130,AR=65;
    x.save(); x.shadowColor='#00ffcc'; x.shadowBlur=32; x.strokeStyle='#00ffcc'; x.lineWidth=2.5;
    x.beginPath(); x.arc(AX,AY,AR+7,0,Math.PI*2); x.stroke();
    x.shadowColor='#ff2288'; x.shadowBlur=18; x.strokeStyle='rgba(255,34,136,0.38)'; x.lineWidth=7;
    x.beginPath(); x.arc(AX,AY,AR+1,0,Math.PI*2); x.stroke(); x.restore();
    x.save(); x.beginPath(); x.arc(AX,AY,AR,0,Math.PI*2); x.clip();
    try { const img=await loadImage(avatarUrl); x.drawImage(img,AX-AR,AY-AR,AR*2,AR*2); }
    catch { x.fillStyle='#040c16'; x.fill(); } x.restore();

    x.save(); x.shadowColor='#ff2288'; x.shadowBlur=18; x.fillStyle='#ffe066'; x.font=`bold 28px ${FB}`; x.textAlign='left'; x.textBaseline='alphabetic'; x.fillText(UNAME,200,80); x.restore();
    x.fillStyle='rgba(255,34,136,0.2)'; rrect(x,200,87,128,21,4); x.fill();
    x.strokeStyle='#ff2288'; x.lineWidth=1; rrect(x,200,87,128,21,4); x.stroke();
    x.fillStyle='#ff88bb'; x.font=`bold 10px ${FB}`; x.textBaseline='middle'; x.fillText('✦ NEON CITY THEME',207,98);

    x.fillStyle='rgba(0,255,200,0.4)'; x.font=`11px ${FB}`; x.textBaseline='alphabetic'; x.fillText('BALANCE',200,130);
    x.save(); x.shadowColor='#00ffcc'; x.shadowBlur=14; x.fillStyle='#ffe066'; x.font=`bold 48px ${FB}`; x.fillText(BALANCE,200,186); x.restore();
    x.fillStyle='rgba(0,255,200,0.42)'; x.font=`13px ${FN}`; x.fillText('credits',200+x.measureText(BALANCE).width+8,186);
    x.fillStyle='rgba(0,200,255,0.18)'; x.fillRect(200,194,268,1);
    x.fillStyle='rgba(0,255,200,0.38)'; x.font=`13px ${FN}`; x.textBaseline='alphabetic'; x.fillText('TOTAL EARNED',200,212);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(255,220,80,0.7)'; x.fillText(TOTAL,200+x.measureText('TOTAL EARNED ').width,212);

    const vd=x.createLinearGradient(0,0,0,H);
    vd.addColorStop(0,'rgba(0,255,200,0)'); vd.addColorStop(0.5,'rgba(0,255,200,0.28)'); vd.addColorStop(1,'rgba(0,255,200,0)');
    x.strokeStyle=vd; x.lineWidth=1; x.beginPath(); x.moveTo(487,20); x.lineTo(487,H-20); x.stroke();
    x.save(); x.shadowColor='#00ffcc'; x.shadowBlur=8; x.fillStyle='#00ffcc'; x.font=`bold 11px ${FB}`; x.textBaseline='top'; x.fillText('✦  SHOP ROLES',500,28); x.restore();
    ROLES.forEach(({name,color,price},i)=>{
      const rx=500+(i%2)*178,ry=44+Math.floor(i/2)*44;
      x.fillStyle='rgba(0,200,255,0.07)'; rrect(x,rx,ry,165,35,6); x.fill();
      x.strokeStyle='rgba(0,200,255,0.22)'; x.lineWidth=1; rrect(x,rx,ry,165,35,6); x.stroke();
      const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle=clr; x.fillRect(rx,ry,3,35);
      x.fillStyle='#ffe066'; x.font=`bold 12px ${FB}`; x.fillText((name||'Item').slice(0,14),rx+10,ry+6);
      x.fillStyle='rgba(0,255,200,0.52)'; x.font=`11px ${FN}`; x.fillText(fmt(price)+' cr',rx+10,ry+21);
    });
    if (!ROLES.length) { x.fillStyle='rgba(0,255,200,0.4)'; x.font=`13px ${FN}`; x.textBaseline='middle'; x.fillText('No items yet',500,H/2); }
  }

  // ── FROZEN ────────────────────────────────────────────────────────────────────
  if (theme === 'frozen') {
    const bg=x.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,'#e8f4ff'); bg.addColorStop(0.5,'#d0eaff'); bg.addColorStop(1,'#beddff');
    x.fillStyle=bg; x.fillRect(0,0,W,H);
    const sr=mkRng(33);
    [{cx:670,cy:45,sz:90},{cx:770,cy:185,sz:65},{cx:595,cy:228,sz:55},{cx:90,cy:18,sz:48},{cx:40,cy:205,sz:42},{cx:415,cy:22,sz:38},{cx:800,cy:80,sz:50},{cx:250,cy:240,sz:35}].forEach(s=>{
      const sides=Math.floor(sr()*3)+3,pts=[];
      for(let i=0;i<sides;i++){ const a=(i/sides)*Math.PI*2+sr()*0.6,d=s.sz*(0.45+sr()*0.55); pts.push([s.cx+Math.cos(a)*d,s.cy+Math.sin(a)*d]); }
      x.beginPath(); x.moveTo(pts[0][0],pts[0][1]); pts.slice(1).forEach(p=>x.lineTo(p[0],p[1])); x.closePath();
      x.fillStyle=`rgba(180,225,255,${sr()*0.18+0.06})`; x.fill();
      x.strokeStyle=`rgba(100,180,240,${sr()*0.35+0.15})`; x.lineWidth=1; x.stroke();
    });
    x.strokeStyle='rgba(100,170,220,0.28)'; x.lineWidth=1;
    [[0,0,1,1],[W,0,-1,1],[0,H,1,-1],[W,H,-1,-1]].forEach(([cx,cy,dx,dy])=>{
      for(let i=0;i<5;i++){ const d=(i+1)*18; x.beginPath(); x.moveTo(cx,cy); x.lineTo(cx+dx*d,cy); x.stroke(); x.beginPath(); x.moveTo(cx,cy); x.lineTo(cx,cy+dy*d); x.stroke(); x.beginPath(); x.moveTo(cx,cy); x.lineTo(cx+dx*d*0.6,cy+dy*d*0.6); x.stroke(); }
    });
    const tb=x.createLinearGradient(0,0,W,0);
    tb.addColorStop(0,'rgba(100,180,255,0)'); tb.addColorStop(0.3,'#88ccff'); tb.addColorStop(0.7,'#88ccff'); tb.addColorStop(1,'rgba(100,180,255,0)');
    x.fillStyle=tb; x.fillRect(0,0,W,3); x.fillRect(0,H-3,W,3);

    const AX=110,AY=130,AR=65;
    x.save(); x.strokeStyle='rgba(80,160,230,0.5)'; x.lineWidth=1.2;
    for(let a=0;a<16;a++){ const ang=(a/16)*Math.PI*2,len=a%2===0?AR+22:AR+12; x.beginPath(); x.arc(AX,AY,AR+6,ang-0.1,ang+0.1); x.lineTo(AX+Math.cos(ang)*len,AY+Math.sin(ang)*len); x.stroke(); }
    x.restore();
    x.save(); x.shadowColor='rgba(100,180,255,0.8)'; x.shadowBlur=18; x.strokeStyle='rgba(80,160,240,0.75)'; x.lineWidth=2.5;
    x.beginPath(); x.arc(AX,AY,AR+6,0,Math.PI*2); x.stroke(); x.restore();
    x.save(); x.beginPath(); x.arc(AX,AY,AR,0,Math.PI*2); x.clip();
    try { const img=await loadImage(avatarUrl); x.drawImage(img,AX-AR,AY-AR,AR*2,AR*2); }
    catch { x.fillStyle='#cce4f8'; x.fill(); } x.restore();

    x.fillStyle='#082840'; x.font=`bold 30px ${FB}`; x.textAlign='left'; x.textBaseline='alphabetic'; x.fillText(UNAME,200,84);
    rrect(x,200,91,114,22,11); x.fillStyle='rgba(100,170,220,0.22)'; x.fill(); x.strokeStyle='rgba(80,150,215,0.5)'; x.lineWidth=1; x.stroke();
    x.fillStyle='#1a4880'; x.font=`bold 11px ${FB}`; x.textBaseline='middle'; x.fillText('❄ FROZEN THEME',208,102);

    x.fillStyle='rgba(20,70,130,0.45)'; x.font=`11px ${FB}`; x.textBaseline='alphabetic'; x.fillText('BALANCE',200,133);
    x.fillStyle='#081e3c'; x.font=`bold 50px ${FB}`; x.fillText(BALANCE,200,190);
    x.fillStyle='rgba(40,100,180,0.42)'; x.font=`13px ${FN}`; x.fillText('credits',200+x.measureText(BALANCE).width+8,190);
    x.strokeStyle='rgba(80,150,210,0.25)'; x.lineWidth=1; x.beginPath(); x.moveTo(200,198); x.lineTo(470,198); x.stroke();
    x.fillStyle='rgba(20,70,130,0.38)'; x.font=`13px ${FN}`; x.textBaseline='alphabetic'; x.fillText('TOTAL EARNED',200,216);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(10,40,100,0.62)'; x.fillText(TOTAL,200+x.measureText('TOTAL EARNED ').width,216);

    x.fillStyle='rgba(150,210,255,0.18)'; x.fillRect(490,14,W-504,H-28);
    x.strokeStyle='rgba(100,170,220,0.28)'; x.lineWidth=1; x.beginPath(); x.moveTo(490,14); x.lineTo(490,H-14); x.stroke();
    x.fillStyle='#164468'; x.font=`bold 11px ${FB}`; x.textBaseline='alphabetic'; x.fillText('❄  SHOP ROLES',502,44);
    ROLES.forEach(({name,color,price},i)=>{
      const rx=502+(i%2)*174,ry=50+Math.floor(i/2)*48;
      x.fillStyle='rgba(150,210,255,0.22)'; rrect(x,rx,ry,162,38,8); x.fill();
      x.strokeStyle='rgba(100,170,220,0.32)'; x.lineWidth=1; rrect(x,rx,ry,162,38,8); x.stroke();
      const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle=clr; x.fillRect(rx,ry,3,38);
      x.fillStyle='#082840'; x.font=`bold 12px ${FB}`; x.textBaseline='top'; x.fillText((name||'Item').slice(0,14),rx+10,ry+7);
      x.fillStyle='rgba(20,70,160,0.52)'; x.font=`11px ${FN}`; x.fillText(fmt(price)+' cr',rx+10,ry+22);
    });
    if (!ROLES.length) { x.fillStyle='rgba(20,70,130,0.4)'; x.font=`13px ${FN}`; x.textBaseline='middle'; x.fillText('No items yet',502,H/2); }
  }

  // ── SAKURA ────────────────────────────────────────────────────────────────────
  if (theme === 'sakura') {
    const bg=x.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,'#fff5f8'); bg.addColorStop(0.5,'#ffe8f2'); bg.addColorStop(1,'#fdd0e4');
    x.fillStyle=bg; x.fillRect(0,0,W,H);
    const bloom=x.createRadialGradient(W*0.45,H*0.4,0,W*0.45,H*0.4,W*0.5);
    bloom.addColorStop(0,'rgba(255,195,215,0.32)'); bloom.addColorStop(1,'rgba(255,200,220,0)');
    x.fillStyle=bloom; x.fillRect(0,0,W,H);
    const pr=mkRng(88);
    for(let i=0;i<45;i++){
      x.save(); const px=pr()*W,py=pr()*H,ps=pr()*13+4,pa=pr()*Math.PI*2;
      x.translate(px,py); x.rotate(pa); x.beginPath(); x.ellipse(0,0,ps,ps*0.45,0,0,Math.PI*2);
      x.fillStyle=`rgba(255,${148+pr()*60},${168+pr()*45},${pr()*0.38+0.08})`; x.fill(); x.restore();
    }
    const lb=x.createLinearGradient(0,0,0,H);
    lb.addColorStop(0,'rgba(220,140,165,0)'); lb.addColorStop(0.3,'#d4a0b8'); lb.addColorStop(0.7,'#d4a0b8'); lb.addColorStop(1,'rgba(220,140,165,0)');
    x.fillStyle=lb; x.fillRect(0,0,5,H);
    const tbg=x.createLinearGradient(0,0,W,0);
    tbg.addColorStop(0,'rgba(220,150,180,0)'); tbg.addColorStop(0.3,'rgba(220,150,180,0.5)'); tbg.addColorStop(0.7,'rgba(220,150,180,0.5)'); tbg.addColorStop(1,'rgba(220,150,180,0)');
    x.fillStyle=tbg; x.fillRect(0,0,W,2); x.fillRect(0,H-2,W,2);

    const AX=110,AY=130,AR=65;
    x.save(); x.shadowColor='#d4a0b8'; x.shadowBlur=22; x.strokeStyle='#e8b4cc'; x.lineWidth=2.5;
    x.beginPath(); x.arc(AX,AY,AR+9,0,Math.PI*2); x.stroke();
    x.shadowBlur=0; x.strokeStyle='rgba(220,150,180,0.28)'; x.lineWidth=6;
    x.beginPath(); x.arc(AX,AY,AR+2,0,Math.PI*2); x.stroke(); x.restore();
    for(let a=0;a<8;a++){ const ang=(a/8)*Math.PI*2; x.save(); x.translate(AX+Math.cos(ang)*(AR+16),AY+Math.sin(ang)*(AR+16)); x.rotate(ang); x.fillStyle='rgba(240,170,195,0.65)'; x.beginPath(); x.ellipse(0,0,6,3,0,0,Math.PI*2); x.fill(); x.restore(); }
    x.save(); x.beginPath(); x.arc(AX,AY,AR,0,Math.PI*2); x.clip();
    try { const img=await loadImage(avatarUrl); x.drawImage(img,AX-AR,AY-AR,AR*2,AR*2); }
    catch { x.fillStyle='#ffe8f2'; x.fill(); } x.restore();

    x.fillStyle='#6e1a38'; x.font=`bold 28px ${FB}`; x.textAlign='left'; x.textBaseline='alphabetic'; x.fillText(UNAME,200,82);
    rrect(x,200,88,114,22,11); x.fillStyle='rgba(220,150,180,0.22)'; x.fill(); x.strokeStyle='rgba(200,120,155,0.5)'; x.lineWidth=1; x.stroke();
    x.fillStyle='#8c3050'; x.font=`bold 10px ${FB}`; x.textBaseline='middle'; x.fillText('✿  SAKURA THEME',208,99);

    x.fillStyle='rgba(140,55,85,0.42)'; x.font=`11px ${FB}`; x.textBaseline='alphabetic'; x.fillText('BALANCE',200,130);
    x.fillStyle='#4a0e28'; x.font=`bold 50px ${FB}`; x.fillText(BALANCE,200,188);
    x.fillStyle='rgba(160,70,100,0.38)'; x.font=`13px ${FN}`; x.fillText('credits',200+x.measureText(BALANCE).width+8,188);
    x.strokeStyle='rgba(200,120,160,0.25)'; x.lineWidth=1; x.beginPath(); x.moveTo(200,196); x.lineTo(470,196); x.stroke();
    x.fillStyle='rgba(140,55,85,0.38)'; x.font=`13px ${FN}`; x.textBaseline='alphabetic'; x.fillText('TOTAL EARNED',200,214);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(74,14,40,0.62)'; x.fillText(TOTAL,200+x.measureText('TOTAL EARNED ').width,214);

    x.fillStyle='rgba(255,180,210,0.18)'; x.fillRect(490,16,W-504,H-32);
    x.strokeStyle='rgba(200,140,170,0.28)'; x.lineWidth=1; x.beginPath(); x.moveTo(490,16); x.lineTo(490,H-16); x.stroke();
    x.fillStyle='#7a2842'; x.font=`bold 11px ${FB}`; x.textBaseline='alphabetic'; x.fillText('✿  SHOP ROLES',502,44);
    ROLES.forEach(({name,color,price},i)=>{
      const rx=502+(i%2)*174,ry=50+Math.floor(i/2)*48;
      x.fillStyle='rgba(255,180,210,0.22)'; rrect(x,rx,ry,162,38,8); x.fill();
      x.strokeStyle='rgba(200,140,170,0.28)'; x.lineWidth=1; rrect(x,rx,ry,162,38,8); x.stroke();
      const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle=clr; x.fillRect(rx,ry,3,38);
      x.fillStyle='#4a0e28'; x.font=`bold 12px ${FB}`; x.textBaseline='top'; x.fillText((name||'Item').slice(0,14),rx+10,ry+7);
      x.fillStyle='rgba(140,55,85,0.52)'; x.font=`11px ${FN}`; x.fillText(fmt(price)+' cr',rx+10,ry+22);
    });
    if (!ROLES.length) { x.fillStyle='rgba(140,55,85,0.4)'; x.font=`13px ${FN}`; x.textBaseline='middle'; x.fillText('No items yet',502,H/2); }
  }

  // ── MAGMA ─────────────────────────────────────────────────────────────────────
  if (theme === 'magma') {
    x.fillStyle='#090604'; x.fillRect(0,0,W,H);
    const lv1=x.createRadialGradient(W/2,H+80,20,W/2,H+80,W*0.85);
    lv1.addColorStop(0,'rgba(255,45,0,0.45)'); lv1.addColorStop(0.5,'rgba(180,20,0,0.14)'); lv1.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=lv1; x.fillRect(0,0,W,H);
    const lv2=x.createRadialGradient(0,H,10,0,H,H*1.3);
    lv2.addColorStop(0,'rgba(255,80,0,0.28)'); lv2.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=lv2; x.fillRect(0,0,W,H);
    const lv3=x.createRadialGradient(W,H*0.6,10,W,H*0.6,H);
    lv3.addColorStop(0,'rgba(200,50,0,0.2)'); lv3.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=lv3; x.fillRect(0,0,W,H);
    const rk=mkRng(17); for(let i=0;i<1600;i++){ x.fillStyle=`rgba(60,28,8,${rk()*0.065})`; x.fillRect(rk()*W,rk()*H,1,1); }

    const crk=mkRng(42);
    [{sx:200,sy:H,ang:-Math.PI*0.38,depth:5,len:72},{sx:410,sy:H,ang:-Math.PI*0.5,depth:4,len:58},{sx:620,sy:H,ang:-Math.PI*0.58,depth:5,len:68},{sx:55,sy:H*0.72,ang:-Math.PI*0.12,depth:4,len:52},{sx:W-55,sy:H*0.62,ang:Math.PI*1.08,depth:4,len:52},{sx:360,sy:0,ang:Math.PI*0.42,depth:3,len:42},{sx:720,sy:0,ang:Math.PI*0.55,depth:3,len:38}].forEach(o=>drawCrack(x,o.sx,o.sy,o.len,o.ang,o.depth,crk));

    const ab=x.createLinearGradient(0,0,0,H);
    ab.addColorStop(0,'rgba(255,80,0,0)'); ab.addColorStop(0.3,'#ff5500'); ab.addColorStop(0.7,'#ff8800'); ab.addColorStop(1,'rgba(255,80,0,0)');
    x.fillStyle=ab; x.fillRect(0,0,4,H);

    const AX=110,AY=130,AR=65;
    const rg=x.createLinearGradient(AX-AR,AY,AX+AR,AY);
    rg.addColorStop(0,'#ff2200'); rg.addColorStop(0.5,'#ff8800'); rg.addColorStop(1,'#ffcc00');
    x.save(); x.shadowColor='#ff5500'; x.shadowBlur=35; x.strokeStyle=rg; x.lineWidth=3.5;
    x.beginPath(); x.arc(AX,AY,AR+8,0,Math.PI*2); x.stroke();
    x.shadowBlur=12; x.strokeStyle='rgba(255,80,0,0.28)'; x.lineWidth=8;
    x.beginPath(); x.arc(AX,AY,AR+1,0,Math.PI*2); x.stroke(); x.restore();
    x.save(); x.beginPath(); x.arc(AX,AY,AR,0,Math.PI*2); x.clip();
    try { const img=await loadImage(avatarUrl); x.drawImage(img,AX-AR,AY-AR,AR*2,AR*2); }
    catch { x.fillStyle='#0e0804'; x.fill(); } x.restore();

    x.save(); x.shadowColor='#ff4400'; x.shadowBlur=18; x.fillStyle='#ff9944'; x.font=`bold 28px ${FB}`; x.textAlign='left'; x.textBaseline='alphabetic'; x.fillText(UNAME,200,80); x.restore();
    x.fillStyle='rgba(255,68,0,0.2)'; rrect(x,200,87,112,21,4); x.fill(); x.strokeStyle='rgba(255,90,0,0.5)'; x.lineWidth=1; rrect(x,200,87,112,21,4); x.stroke();
    x.fillStyle='#ff8844'; x.font=`bold 10px ${FB}`; x.textBaseline='middle'; x.fillText('🌋  MAGMA THEME',207,98);

    x.fillStyle='rgba(255,100,30,0.45)'; x.font=`11px ${FB}`; x.textBaseline='alphabetic'; x.fillText('BALANCE',200,130);
    const bg2=x.createLinearGradient(200,0,420,0);
    bg2.addColorStop(0,'#ff6600'); bg2.addColorStop(1,'#ffcc00');
    x.save(); x.shadowColor='#ff5500'; x.shadowBlur=14; x.fillStyle=bg2; x.font=`bold 48px ${FB}`; x.fillText(BALANCE,200,186); x.restore();
    x.fillStyle='rgba(255,160,50,0.42)'; x.font=`13px ${FN}`; x.fillText('credits',200+x.measureText(BALANCE).width+8,186);
    x.fillStyle='rgba(255,80,0,0.2)'; x.fillRect(200,194,268,1);
    x.fillStyle='rgba(255,100,30,0.38)'; x.font=`13px ${FN}`; x.textBaseline='alphabetic'; x.fillText('TOTAL EARNED',200,212);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(255,185,60,0.65)'; x.fillText(TOTAL,200+x.measureText('TOTAL EARNED ').width,212);

    const vd=x.createLinearGradient(0,0,0,H);
    vd.addColorStop(0,'rgba(255,80,0,0)'); vd.addColorStop(0.5,'rgba(255,80,0,0.28)'); vd.addColorStop(1,'rgba(255,80,0,0)');
    x.strokeStyle=vd; x.lineWidth=1; x.beginPath(); x.moveTo(487,20); x.lineTo(487,H-20); x.stroke();
    x.save(); x.shadowColor='#ff6600'; x.shadowBlur=10; x.fillStyle='#ff8844'; x.font=`bold 11px ${FB}`; x.textBaseline='top'; x.fillText('🌋  SHOP ROLES',500,28); x.restore();
    ROLES.forEach(({name,color,price},i)=>{
      const rx=500+(i%2)*178,ry=44+Math.floor(i/2)*44;
      x.fillStyle='rgba(255,60,0,0.09)'; rrect(x,rx,ry,165,35,6); x.fill();
      x.strokeStyle='rgba(255,80,0,0.26)'; x.lineWidth=1; rrect(x,rx,ry,165,35,6); x.stroke();
      const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle=clr; x.fillRect(rx,ry,3,35);
      x.fillStyle='#ff9944'; x.font=`bold 12px ${FB}`; x.fillText((name||'Item').slice(0,14),rx+10,ry+6);
      x.fillStyle='rgba(255,185,60,0.55)'; x.font=`11px ${FN}`; x.fillText(fmt(price)+' cr',rx+10,ry+21);
    });
    if (!ROLES.length) { x.fillStyle='rgba(255,80,0,0.4)'; x.font=`13px ${FN}`; x.textBaseline='middle'; x.fillText('No items yet',500,H/2); }
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateThemedCard, THEME_NAMES: Object.keys(THEMES), generateThemedCard2, THEME_NAMES_V2, generateThemedCard3, THEME_NAMES_V3 };
