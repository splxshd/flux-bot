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

module.exports = { generateThemedCard, THEME_NAMES: Object.keys(THEMES) };
