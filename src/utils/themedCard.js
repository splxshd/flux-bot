'use strict';

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

let FB = 'sans-serif', FN = 'sans-serif';
for (const fp of [
  path.join(__dirname, '../../node_modules/@fontsource/open-sans/files/open-sans-latin-700-normal.woff2'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]) { if (fs.existsSync(fp)) { try { GlobalFonts.registerFromPath(fp, 'CrBold'); FB = 'CrBold'; break; } catch {} } }
for (const fp of [
  path.join(__dirname, '../../node_modules/@fontsource/open-sans/files/open-sans-latin-400-normal.woff2'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]) { if (fs.existsSync(fp)) { try { GlobalFonts.registerFromPath(fp, 'CrNorm'); FN = 'CrNorm'; break; } catch {} } }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w)/2, Math.abs(h)/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}
function mkRng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s,1664525)+1013904223)>>>0; return s/0x100000000; };
}
function drawCrack(ctx, sx, sy, len, angle, depth, rng) {
  if (depth<=0||len<5) return;
  const ex=sx+Math.cos(angle)*len, ey=sy+Math.sin(angle)*len;
  const mx=(sx+ex)/2+(rng()-0.5)*len*0.35, my=(sy+ey)/2+(rng()-0.5)*len*0.25;
  ctx.save();
  ctx.shadowColor='#ff5500'; ctx.shadowBlur=18;
  ctx.strokeStyle=`rgba(255,${80+depth*22},0,${0.45+depth*0.08})`; ctx.lineWidth=depth*0.9;
  ctx.beginPath(); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(mx,my,ex,ey); ctx.stroke();
  ctx.shadowBlur=4; ctx.strokeStyle=`rgba(255,${210+depth*5},70,0.92)`; ctx.lineWidth=depth*0.2;
  ctx.beginPath(); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(mx,my,ex,ey); ctx.stroke();
  ctx.restore();
  drawCrack(ctx,ex,ey,len*(0.52+rng()*0.3),angle+(rng()-0.5)*(0.6+rng()*0.5),depth-1,rng);
  if (rng()>0.38) drawCrack(ctx,ex,ey,len*(0.36+rng()*0.22),angle+(rng()-0.5)*(0.9+rng()*0.7),depth-2,rng);
}
function sakuraTree(ctx, tx, baseY) {
  ctx.save(); ctx.strokeStyle='rgba(110,50,70,0.22)'; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.lineWidth=11; ctx.beginPath(); ctx.moveTo(tx,baseY); ctx.quadraticCurveTo(tx+4,baseY-80,tx,baseY-165); ctx.stroke();
  const branches=[
    {sx:tx,sy:baseY-70, ex:tx-55,ey:baseY-130,w:6},{sx:tx,sy:baseY-70, ex:tx+50,ey:baseY-125,w:6},
    {sx:tx,sy:baseY-110,ex:tx-48,ey:baseY-170,w:5},{sx:tx,sy:baseY-110,ex:tx+45,ey:baseY-165,w:4},
    {sx:tx,sy:baseY-145,ex:tx-38,ey:baseY-205,w:4},{sx:tx,sy:baseY-145,ex:tx+35,ey:baseY-200,w:3},
    {sx:tx,sy:baseY-165,ex:tx-22,ey:baseY-225,w:3},{sx:tx,sy:baseY-165,ex:tx+20,ey:baseY-220,w:2},
  ];
  branches.forEach(b=>{
    ctx.lineWidth=b.w; ctx.beginPath(); ctx.moveTo(b.sx,b.sy); ctx.lineTo(b.ex,b.ey); ctx.stroke();
    const ang=Math.atan2(b.ey-b.sy,b.ex-b.sx), len=Math.hypot(b.ex-b.sx,b.ey-b.sy);
    ctx.lineWidth=b.w*0.5;
    ctx.beginPath(); ctx.moveTo(b.ex,b.ey); ctx.lineTo(b.ex+Math.cos(ang-0.55)*len*0.42,b.ey+Math.sin(ang-0.55)*len*0.42); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.ex,b.ey); ctx.lineTo(b.ex+Math.cos(ang+0.45)*len*0.38,b.ey+Math.sin(ang+0.45)*len*0.38); ctx.stroke();
  });
  ctx.restore();
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

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 860, H = 260;
const THEME_NAMES = ['holographic','city','sakura','royal','glass','galaxy','academia','paper'];

// ─── Main renderer ────────────────────────────────────────────────────────────
async function generateThemedCard({ username, avatarUrl, balance, totalEarned, shopItems = [], theme = 'holographic' }) {
  const canvas = createCanvas(W, H);
  const x      = canvas.getContext('2d');

  const BAL   = fmtBal(balance);
  const TOT   = fmtBal(totalEarned) + ' cr';
  const UNAME = username.length > 22 ? username.slice(0,20)+'…' : username;
  const ROLES = shopItems.slice(0,4);

  async function drawAvatar(ax, ay, ar, fallbackFill) {
    x.save(); x.beginPath(); x.arc(ax,ay,ar,0,Math.PI*2); x.clip();
    try {
      const img = await loadImage(avatarUrl);
      x.drawImage(img, ax-ar, ay-ar, ar*2, ar*2);
    } catch {
      x.fillStyle = fallbackFill; x.fill();
    }
    x.restore();
  }

  // ── HOLOGRAPHIC ──────────────────────────────────────────────────────────────
  if (theme === 'holographic') {
    x.fillStyle='#06060e'; x.fillRect(0,0,W,H);
    x.save(); x.globalAlpha=0.15;
    const r1=x.createLinearGradient(0,0,W,H);
    ['#ff0066','#ff6600','#ffee00','#00ff88','#0088ff','#9900ff','#ff00aa','#ff0066'].forEach((c,i,a)=>r1.addColorStop(i/(a.length-1),c));
    x.fillStyle=r1; x.fillRect(0,0,W,H); x.restore();
    x.save(); x.globalAlpha=0.1; x.translate(W/2,H/2); x.rotate(Math.PI/3);
    const r2=x.createLinearGradient(-W,0,W,0);
    r2.addColorStop(0,'#00ffee'); r2.addColorStop(0.33,'#ff00cc'); r2.addColorStop(0.66,'#aaff00'); r2.addColorStop(1,'#00ffee');
    x.fillStyle=r2; x.fillRect(-W,-H,W*2,H*2); x.restore();
    const sr=mkRng(12);
    for(let i=0;i<55;i++){
      const sx=sr()*W,sy=sr()*H,ss=sr()*1.8+0.4;
      x.save(); x.shadowColor=`hsl(${sr()*360},100%,70%)`; x.shadowBlur=6;
      x.fillStyle=`rgba(255,255,255,${sr()*0.5+0.3})`; x.beginPath(); x.arc(sx,sy,ss,0,Math.PI*2); x.fill(); x.restore();
    }
    const pearl=x.createRadialGradient(W*0.38,H*0.38,0,W*0.38,H*0.38,W*0.5);
    pearl.addColorStop(0,'rgba(255,255,255,0.16)'); pearl.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=pearl; x.fillRect(0,0,W,H);
    rrect(x,5,5,W-10,H-10,16);
    const bord=x.createLinearGradient(0,0,W,H);
    ['#ff0066','#ff9900','#00ffcc','#9900ff','#0088ff','#ff0066'].forEach((c,i,a)=>bord.addColorStop(i/(a.length-1),c));
    x.strokeStyle=bord; x.lineWidth=2.5; x.stroke();
    rrect(x,9,9,W-18,H-18,13); x.strokeStyle='rgba(255,255,255,0.08)'; x.lineWidth=1; x.stroke();

    const AX=110,AY=130,AR=65;
    [0,50,100,160,210,270,320].forEach((h,i,a)=>{
      const s=(i/a.length)*Math.PI*2-Math.PI/2,e=((i+1)/a.length)*Math.PI*2-Math.PI/2,col=`hsl(${h},100%,62%)`;
      x.save(); x.shadowColor=col; x.shadowBlur=22; x.strokeStyle=col; x.lineWidth=3.5;
      x.beginPath(); x.arc(AX,AY,AR+7,s,e); x.stroke(); x.restore();
    });
    x.save(); x.strokeStyle='rgba(255,255,255,0.1)'; x.lineWidth=10; x.beginPath(); x.arc(AX,AY,AR+1,0,Math.PI*2); x.stroke(); x.restore();
    await drawAvatar(AX,AY,AR,'#0a0a18');

    x.fillStyle='#fff'; x.font=`bold 30px ${FB}`; x.textAlign='left'; x.textBaseline='top'; x.fillText(UNAME,200,36);
    rrect(x,200,80,138,22,11);
    const bb=x.createLinearGradient(200,0,338,0);
    bb.addColorStop(0,'rgba(255,0,102,0.22)'); bb.addColorStop(0.5,'rgba(0,200,255,0.18)'); bb.addColorStop(1,'rgba(150,0,255,0.22)');
    x.fillStyle=bb; x.fill();
    const bbd=x.createLinearGradient(200,0,338,0);
    bbd.addColorStop(0,'#ff0066'); bbd.addColorStop(0.5,'#00ccff'); bbd.addColorStop(1,'#aa00ff');
    x.strokeStyle=bbd; x.lineWidth=1; x.stroke();
    x.fillStyle='#fff'; x.font=`bold 11px ${FB}`; x.textBaseline='middle'; x.fillText('✦ HOLOGRAPHIC',210,91);

    x.fillStyle='rgba(255,255,255,0.38)'; x.font=`11px ${FB}`; x.textBaseline='top'; x.fillText('BALANCE',200,116);
    const bg2=x.createLinearGradient(200,0,420,0);
    bg2.addColorStop(0,'#ff88cc'); bg2.addColorStop(0.5,'#88ffee'); bg2.addColorStop(1,'#aaaaff');
    x.save(); x.shadowColor='rgba(150,150,255,0.6)'; x.shadowBlur=18;
    x.fillStyle=bg2; x.font=`bold 50px ${FB}`; x.textBaseline='top'; x.fillText(BAL,200,130); x.restore();
    x.fillStyle='rgba(255,255,255,0.28)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('credits',200+x.measureText(BAL).width+8,163);
    x.fillStyle='rgba(255,255,255,0.1)'; x.fillRect(200,196,268,1);
    x.fillStyle='rgba(255,255,255,0.33)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('TOTAL EARNED',200,202);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(180,210,255,0.65)'; x.fillText(TOT,200+x.measureText('TOTAL EARNED ').width,202);

    rrect(x,490,18,W-504,H-36,12);
    const pBg=x.createLinearGradient(490,0,W,0);
    pBg.addColorStop(0,'rgba(255,255,255,0.07)'); pBg.addColorStop(1,'rgba(255,255,255,0.02)');
    x.fillStyle=pBg; x.fill(); x.strokeStyle='rgba(255,255,255,0.13)'; x.lineWidth=1; x.stroke();
    x.fillStyle='rgba(255,255,255,0.75)'; x.font=`bold 11px ${FB}`; x.textBaseline='top'; x.fillText('✦  SHOP ROLES',506,30);
    if (!ROLES.length) { x.fillStyle='rgba(255,255,255,0.28)'; x.font=`12px ${FN}`; x.fillText('No items yet',506,52); }
    ROLES.forEach(({name,color,price},i)=>{
      const rx=506+(i%2)*174,ry=46+Math.floor(i/2)*50; const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      rrect(x,rx,ry,162,42,8);
      const p2=x.createLinearGradient(rx,0,rx+162,0); p2.addColorStop(0,'rgba(255,255,255,0.09)'); p2.addColorStop(1,'rgba(255,255,255,0.03)');
      x.fillStyle=p2; x.fill(); x.strokeStyle='rgba(255,255,255,0.17)'; x.lineWidth=1; x.stroke();
      x.fillStyle=clr; x.fillRect(rx,ry,3,42);
      x.fillStyle='#eee'; x.font=`bold 12px ${FB}`; x.textBaseline='top'; x.fillText((name||'Item').slice(0,14),rx+10,ry+8);
      x.fillStyle='rgba(255,255,255,0.38)'; x.font=`11px ${FN}`; x.fillText(fmt(price||0)+' cr',rx+10,ry+24);
    });
  }

  // ── NEON CITY ─────────────────────────────────────────────────────────────────
  if (theme === 'city') {
    const sky=x.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#000810'); sky.addColorStop(0.6,'#020e20'); sky.addColorStop(1,'#050118');
    x.fillStyle=sky; x.fillRect(0,0,W,H);
    x.save(); x.shadowColor='rgba(220,240,255,0.5)'; x.shadowBlur=20;
    x.fillStyle='rgba(200,230,255,0.85)'; x.beginPath(); x.arc(760,38,18,0,Math.PI*2); x.fill();
    x.fillStyle='rgba(5,10,20,0.92)'; x.beginPath(); x.arc(768,35,16,0,Math.PI*2); x.fill(); x.restore();
    const mg=x.createRadialGradient(760,38,18,760,38,55);
    mg.addColorStop(0,'rgba(200,220,255,0.12)'); mg.addColorStop(1,'rgba(200,220,255,0)');
    x.fillStyle=mg; x.fillRect(700,0,160,100);
    const r=mkRng(99); let bx=0;
    while(bx<W){
      const bw=r()*36+12,bh=r()*140+30;
      x.fillStyle=`rgba(8,18,40,${0.7+r()*0.25})`; x.fillRect(bx,H-bh,bw,bh);
      for(let wy=H-bh+4;wy<H-4;wy+=9){
        for(let wx2=bx+3;wx2<bx+bw-3;wx2+=6){
          if(r()>0.42){ x.fillStyle=r()>0.5?`rgba(255,240,110,${r()*0.55+0.3})`:`rgba(140,215,255,${r()*0.45+0.2})`; x.fillRect(wx2,wy,4,5); }
        }
      }
      bx+=bw+r()*4;
    }
    const gh=x.createLinearGradient(0,H*0.65,0,H);
    gh.addColorStop(0,'rgba(0,0,0,0)'); gh.addColorStop(1,'rgba(0,100,200,0.12)');
    x.fillStyle=gh; x.fillRect(0,0,W,H);
    [{sx:300,sy:85,sw:52,sh:7,col:'#ff2288'},{sx:585,sy:66,sw:40,sh:7,col:'#00ffcc'},{sx:700,sy:106,sw:30,sh:6,col:'#ffcc00'},{sx:425,sy:54,sw:22,sh:6,col:'#44aaff'},{sx:510,sy:98,sw:16,sh:5,col:'#ff6600'},{sx:660,sy:78,sw:28,sh:6,col:'#dd44ff'}].forEach(s=>{
      x.save(); x.shadowColor=s.col; x.shadowBlur=25; x.globalAlpha=0.78; x.fillStyle=s.col; x.fillRect(s.sx,s.sy,s.sw,s.sh); x.restore();
    });
    const rr=mkRng(55); x.save(); x.globalAlpha=0.055; x.strokeStyle='#88ccff'; x.lineWidth=1;
    for(let i=0;i<70;i++){ const rx2=rr()*W,ry2=rr()*H,rl=rr()*18+5; x.beginPath(); x.moveTo(rx2,ry2); x.lineTo(rx2+2,ry2+rl); x.stroke(); }
    x.restore();
    const ts=x.createLinearGradient(0,0,W,0);
    ts.addColorStop(0,'#ff2288'); ts.addColorStop(0.5,'#00ffcc'); ts.addColorStop(1,'#ff2288');
    x.fillStyle=ts; x.fillRect(0,0,W,2); x.fillRect(0,H-2,W,2);

    const AX=110,AY=130,AR=65;
    x.save(); x.shadowColor='#00ffcc'; x.shadowBlur=35; x.strokeStyle='#00ffcc'; x.lineWidth=2.5;
    x.beginPath(); x.arc(AX,AY,AR+7,0,Math.PI*2); x.stroke();
    x.shadowColor='#ff2288'; x.shadowBlur=20; x.strokeStyle='rgba(255,34,136,0.35)'; x.lineWidth=7;
    x.beginPath(); x.arc(AX,AY,AR+1,0,Math.PI*2); x.stroke(); x.restore();
    await drawAvatar(AX,AY,AR,'#040c18');

    x.save(); x.shadowColor='#ff2288'; x.shadowBlur=18;
    x.fillStyle='#ffe066'; x.font=`bold 28px ${FB}`; x.textAlign='left'; x.textBaseline='top'; x.fillText(UNAME,200,34); x.restore();
    x.fillStyle='rgba(255,34,136,0.2)'; rrect(x,200,75,130,21,4); x.fill();
    x.strokeStyle='#ff2288'; x.lineWidth=1; rrect(x,200,75,130,21,4); x.stroke();
    x.fillStyle='#ff88bb'; x.font=`bold 10px ${FB}`; x.textBaseline='middle'; x.fillText('✦ NEON CITY THEME',207,85);

    x.fillStyle='rgba(0,255,200,0.42)'; x.font=`11px ${FB}`; x.textBaseline='top'; x.fillText('BALANCE',200,110);
    x.save(); x.shadowColor='#00ffcc'; x.shadowBlur=14;
    x.fillStyle='#ffe066'; x.font=`bold 48px ${FB}`; x.textBaseline='top'; x.fillText(BAL,200,124); x.restore();
    x.fillStyle='rgba(0,255,200,0.42)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('credits',200+x.measureText(BAL).width+8,158);
    x.fillStyle='rgba(0,200,255,0.2)'; x.fillRect(200,192,268,1);
    x.fillStyle='rgba(0,255,200,0.4)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('TOTAL EARNED',200,198);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(255,220,80,0.72)'; x.fillText(TOT,200+x.measureText('TOTAL EARNED ').width,198);

    const vd=x.createLinearGradient(0,0,0,H);
    vd.addColorStop(0,'rgba(0,255,200,0)'); vd.addColorStop(0.5,'rgba(0,255,200,0.28)'); vd.addColorStop(1,'rgba(0,255,200,0)');
    x.strokeStyle=vd; x.lineWidth=1; x.beginPath(); x.moveTo(487,20); x.lineTo(487,H-20); x.stroke();
    x.save(); x.shadowColor='#00ffcc'; x.shadowBlur=8; x.fillStyle='#00ffcc'; x.font=`bold 11px ${FB}`; x.textBaseline='top'; x.fillText('✦  SHOP ROLES',500,26); x.restore();
    if (!ROLES.length) { x.fillStyle='rgba(0,255,200,0.35)'; x.font=`12px ${FN}`; x.fillText('No items yet',500,48); }
    ROLES.forEach(({name,color,price},i)=>{
      const rx=500+(i%2)*178,ry=42+Math.floor(i/2)*46; const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle='rgba(0,200,255,0.07)'; rrect(x,rx,ry,165,38,6); x.fill();
      x.strokeStyle='rgba(0,200,255,0.22)'; x.lineWidth=1; rrect(x,rx,ry,165,38,6); x.stroke();
      x.fillStyle=clr; x.fillRect(rx,ry,3,38);
      x.fillStyle='#ffe066'; x.font=`bold 12px ${FB}`; x.textBaseline='top'; x.fillText((name||'Item').slice(0,14),rx+10,ry+8);
      x.fillStyle='rgba(0,255,200,0.55)'; x.font=`11px ${FN}`; x.fillText(fmt(price||0)+' cr',rx+10,ry+24);
    });
  }

  // ── SAKURA ────────────────────────────────────────────────────────────────────
  if (theme === 'sakura') {
    const bg=x.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,'#fff5f8'); bg.addColorStop(0.5,'#ffe6f2'); bg.addColorStop(1,'#fccde2');
    x.fillStyle=bg; x.fillRect(0,0,W,H);
    const bloom=x.createRadialGradient(W*0.45,H*0.45,0,W*0.45,H*0.45,W*0.52);
    bloom.addColorStop(0,'rgba(255,190,215,0.35)'); bloom.addColorStop(1,'rgba(255,200,220,0)');
    x.fillStyle=bloom; x.fillRect(0,0,W,H);
    sakuraTree(x,792,H+20);
    const pr=mkRng(88);
    for(let i=0;i<90;i++){
      x.save(); const zone=pr(); let px,py;
      if(zone<0.35){px=680+pr()*180;py=pr()*H;}
      else if(zone<0.55){px=60+pr()*220;py=pr()*H;}
      else{px=pr()*W;py=pr()*H;}
      const ps=pr()*14+3,pa=pr()*Math.PI*2;
      x.translate(px,py); x.rotate(pa); x.beginPath(); x.ellipse(0,0,ps,ps*0.42,0,0,Math.PI*2);
      x.fillStyle=`rgba(255,${142+pr()*65},${160+pr()*50},${pr()*0.45+0.08})`; x.fill(); x.restore();
    }
    const br=mkRng(34);
    [[792,60],[760,95],[820,90],[745,140],[835,135],[775,180],[815,170]].forEach(([bx2,by2])=>{
      for(let i=0;i<6;i++){
        x.save(); x.shadowColor='rgba(255,150,185,0.5)'; x.shadowBlur=6;
        x.fillStyle=`rgba(255,${160+br()*60},${175+br()*45},${br()*0.4+0.35})`;
        x.beginPath(); x.arc(bx2+(br()-0.5)*18,by2+(br()-0.5)*16,br()*5+2,0,Math.PI*2); x.fill(); x.restore();
      }
    });
    const lb=x.createLinearGradient(0,0,0,H);
    lb.addColorStop(0,'rgba(215,135,160,0)'); lb.addColorStop(0.3,'#cc96ae'); lb.addColorStop(0.7,'#cc96ae'); lb.addColorStop(1,'rgba(215,135,160,0)');
    x.fillStyle=lb; x.fillRect(0,0,5,H);
    const tb2=x.createLinearGradient(0,0,W,0);
    tb2.addColorStop(0,'rgba(215,140,170,0)'); tb2.addColorStop(0.35,'rgba(215,140,170,0.55)'); tb2.addColorStop(0.65,'rgba(215,140,170,0.55)'); tb2.addColorStop(1,'rgba(215,140,170,0)');
    x.fillStyle=tb2; x.fillRect(0,0,W,2); x.fillRect(0,H-2,W,2);

    const AX=110,AY=130,AR=65;
    x.save(); x.shadowColor='#cc96ae'; x.shadowBlur=24; x.strokeStyle='#e0b0c8'; x.lineWidth=2.5;
    x.beginPath(); x.arc(AX,AY,AR+9,0,Math.PI*2); x.stroke();
    x.shadowBlur=0; x.strokeStyle='rgba(215,140,175,0.26)'; x.lineWidth=7;
    x.beginPath(); x.arc(AX,AY,AR+2,0,Math.PI*2); x.stroke(); x.restore();
    for(let a=0;a<10;a++){
      const ang=(a/10)*Math.PI*2;
      x.save(); x.translate(AX+Math.cos(ang)*(AR+17),AY+Math.sin(ang)*(AR+17)); x.rotate(ang);
      x.fillStyle='rgba(240,165,192,0.68)'; x.beginPath(); x.ellipse(0,0,6,3,0,0,Math.PI*2); x.fill(); x.restore();
    }
    await drawAvatar(AX,AY,AR,'#ffe6f2');

    x.fillStyle='#6a1832'; x.font=`bold 28px ${FB}`; x.textAlign='left'; x.textBaseline='top'; x.fillText(UNAME,200,34);
    rrect(x,200,74,118,22,11); x.fillStyle='rgba(215,140,175,0.22)'; x.fill(); x.strokeStyle='rgba(195,115,150,0.52)'; x.lineWidth=1; x.stroke();
    x.fillStyle='#8a2c4a'; x.font=`bold 10px ${FB}`; x.textBaseline='middle'; x.fillText('✿  SAKURA THEME',208,85);

    x.fillStyle='rgba(135,50,80,0.44)'; x.font=`11px ${FB}`; x.textBaseline='top'; x.fillText('BALANCE',200,110);
    x.fillStyle='#480c24'; x.font=`bold 50px ${FB}`; x.textBaseline='top'; x.fillText(BAL,200,124);
    x.fillStyle='rgba(155,65,95,0.4)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('credits',200+x.measureText(BAL).width+8,160);
    x.strokeStyle='rgba(195,115,155,0.25)'; x.lineWidth=1; x.beginPath(); x.moveTo(200,194); x.lineTo(470,194); x.stroke();
    x.fillStyle='rgba(135,50,80,0.4)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('TOTAL EARNED',200,200);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(70,10,36,0.65)'; x.fillText(TOT,200+x.measureText('TOTAL EARNED ').width,200);

    rrect(x,490,16,W-504,H-32,12); x.fillStyle='rgba(255,175,205,0.16)'; x.fill(); x.strokeStyle='rgba(195,115,150,0.25)'; x.lineWidth=1; x.stroke();
    x.fillStyle='#7a2640'; x.font=`bold 11px ${FB}`; x.textBaseline='top'; x.fillText('✿  SHOP ROLES',502,30);
    if (!ROLES.length) { x.fillStyle='rgba(135,50,80,0.35)'; x.font=`12px ${FN}`; x.fillText('No items yet',502,52); }
    ROLES.forEach(({name,color,price},i)=>{
      const rx=502+(i%2)*172,ry=46+Math.floor(i/2)*50; const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle='rgba(255,175,205,0.22)'; rrect(x,rx,ry,160,40,8); x.fill(); x.strokeStyle='rgba(195,115,150,0.28)'; x.lineWidth=1; rrect(x,rx,ry,160,40,8); x.stroke();
      x.fillStyle=clr; x.fillRect(rx,ry,3,40);
      x.fillStyle='#480c24'; x.font=`bold 12px ${FB}`; x.textBaseline='top'; x.fillText((name||'Item').slice(0,14),rx+10,ry+8);
      x.fillStyle='rgba(135,50,80,0.55)'; x.font=`11px ${FN}`; x.fillText(fmt(price||0)+' cr',rx+10,ry+24);
    });
  }

  // ── ROYAL ─────────────────────────────────────────────────────────────────────
  if (theme === 'royal') {
    const bg=x.createLinearGradient(0,0,W,H); bg.addColorStop(0,'#0c0920'); bg.addColorStop(1,'#1a1032');
    x.fillStyle=bg; x.fillRect(0,0,W,H);
    const cr1=x.createRadialGradient(0,0,0,0,0,H*1.2); cr1.addColorStop(0,'rgba(200,151,42,0.08)'); cr1.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=cr1; x.fillRect(0,0,W,H);
    x.strokeStyle='#b8882a'; x.lineWidth=2; x.strokeRect(7,7,W-14,H-14);
    x.strokeStyle='rgba(184,136,42,0.3)'; x.lineWidth=1; x.strokeRect(13,13,W-26,H-26);
    [[16,16],[W-16,16],[16,H-16],[W-16,H-16]].forEach(([cx,cy])=>{
      x.fillStyle='#b8882a'; x.beginPath(); x.arc(cx,cy,4,0,Math.PI*2); x.fill();
      x.strokeStyle='rgba(184,136,42,0.4)'; x.lineWidth=1;
      [[8,0],[22,0],[-8,0],[-22,0],[0,8],[0,22],[0,-8],[0,-22]].forEach(([dx,dy])=>{
        if(Math.abs(dx)+Math.abs(dy)===8){ x.beginPath(); x.moveTo(cx+dx*0.5,cy+dy*0.5); x.lineTo(cx+dx,cy+dy); x.stroke(); }
        else { x.beginPath(); x.moveTo(cx+(dx>0?8:dx<0?-8:0),cy+(dy>0?8:dy<0?-8:0)); x.lineTo(cx+dx,cy+dy); x.stroke(); }
      });
    });
    x.save(); x.fillStyle='#d4a030'; x.font=`bold 22px ${FB}`; x.textAlign='center'; x.textBaseline='alphabetic';
    x.shadowColor='#c8972a'; x.shadowBlur=10; x.fillText('♛',110,52); x.restore();
    const gab=x.createLinearGradient(0,0,0,H);
    gab.addColorStop(0,'rgba(200,151,42,0)'); gab.addColorStop(0.35,'#c8972a'); gab.addColorStop(0.65,'#c8972a'); gab.addColorStop(1,'rgba(200,151,42,0)');
    x.fillStyle=gab; x.fillRect(0,18,4,H-36);

    const AX=110,AY=135,AR=63;
    x.save(); x.shadowColor='#c8972a'; x.shadowBlur=22; x.strokeStyle='#c8972a'; x.lineWidth=2.5;
    x.beginPath(); x.arc(AX,AY,AR+7,0,Math.PI*2); x.stroke();
    x.shadowBlur=0; x.strokeStyle='rgba(200,151,42,0.3)'; x.lineWidth=5;
    x.beginPath(); x.arc(AX,AY,AR+1,0,Math.PI*2); x.stroke(); x.restore();
    await drawAvatar(AX,AY,AR,'#0c0920');

    x.fillStyle='#e8c860'; x.font=`bold 30px ${FB}`; x.textAlign='left'; x.textBaseline='top'; x.fillText(UNAME,204,36);
    rrect(x,204,80,96,22,4); x.fillStyle='rgba(200,151,42,0.2)'; x.fill(); x.strokeStyle='#c8972a'; x.lineWidth=1; x.stroke();
    x.fillStyle='#c8a030'; x.font=`bold 11px ${FB}`; x.textBaseline='middle'; x.fillText('⚜  ROYAL',212,91);

    x.fillStyle='rgba(200,160,60,0.45)'; x.font=`11px ${FB}`; x.textBaseline='top'; x.fillText('TREASURY',204,116);
    x.save(); x.shadowColor='#c8972a'; x.shadowBlur=12;
    x.fillStyle='#e8c860'; x.font=`bold 50px ${FB}`; x.textBaseline='top'; x.fillText(BAL,204,130); x.restore();
    x.fillStyle='rgba(200,160,60,0.42)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('credits',204+x.measureText(BAL).width+8,165);
    x.fillStyle='rgba(200,151,42,0.28)'; x.fillRect(204,196,268,1);
    x.fillStyle='rgba(200,160,60,0.42)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('TOTAL EARNED',204,202);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(232,200,96,0.65)'; x.fillText(TOT,204+x.measureText('TOTAL EARNED ').width,202);

    const vd=x.createLinearGradient(0,0,0,H);
    vd.addColorStop(0,'rgba(200,151,42,0)'); vd.addColorStop(0.5,'rgba(200,151,42,0.3)'); vd.addColorStop(1,'rgba(200,151,42,0)');
    x.strokeStyle=vd; x.lineWidth=1; x.beginPath(); x.moveTo(487,22); x.lineTo(487,H-22); x.stroke();
    x.fillStyle='#c8a030'; x.font=`bold 11px ${FB}`; x.textBaseline='top'; x.fillText('⚜  SHOP ROLES',500,30);
    if (!ROLES.length) { x.fillStyle='rgba(200,151,42,0.35)'; x.font=`12px ${FN}`; x.fillText('No items yet',500,50); }
    ROLES.forEach(({name,color,price},i)=>{
      const rx=500+(i%2)*178,ry=46+Math.floor(i/2)*48; const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle='rgba(200,151,42,0.07)'; rrect(x,rx,ry,165,38,6); x.fill();
      x.strokeStyle='rgba(200,151,42,0.28)'; x.lineWidth=1; rrect(x,rx,ry,165,38,6); x.stroke();
      x.fillStyle=clr; x.fillRect(rx,ry,3,38);
      x.fillStyle='#d4b060'; x.font=`bold 12px ${FB}`; x.textBaseline='top'; x.fillText((name||'Item').slice(0,14),rx+10,ry+8);
      x.fillStyle='rgba(200,160,60,0.55)'; x.font=`11px ${FN}`; x.fillText(fmt(price||0)+' cr',rx+10,ry+24);
    });
  }

  // ── GLASS ─────────────────────────────────────────────────────────────────────
  if (theme === 'glass') {
    const bg=x.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,'#c4d6ff'); bg.addColorStop(0.5,'#d5c4ff'); bg.addColorStop(1,'#ffbfe6');
    x.fillStyle=bg; x.fillRect(0,0,W,H);
    [{cx:180,cy:90,r:200,c:'rgba(255,255,255,0.55)'},{cx:680,cy:185,r:170,c:'rgba(175,145,255,0.42)'},{cx:50,cy:220,r:120,c:'rgba(255,200,240,0.38)'}].forEach(b=>{
      const g2=x.createRadialGradient(b.cx,b.cy,0,b.cx,b.cy,b.r);
      g2.addColorStop(0,b.c); g2.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g2; x.fillRect(0,0,W,H);
    });
    rrect(x,12,12,W-24,H-24,20); x.fillStyle='rgba(255,255,255,0.42)'; x.fill();
    x.strokeStyle='rgba(255,255,255,0.8)'; x.lineWidth=1.5; x.stroke();
    rrect(x,16,16,W-32,H-32,17); x.strokeStyle='rgba(255,255,255,0.35)'; x.lineWidth=1; x.stroke();

    const AX=110,AY=130,AR=65;
    x.save(); x.shadowColor='rgba(140,110,255,0.6)'; x.shadowBlur=18; x.strokeStyle='rgba(255,255,255,0.95)'; x.lineWidth=3;
    x.beginPath(); x.arc(AX,AY,AR+6,0,Math.PI*2); x.stroke(); x.restore();
    await drawAvatar(AX,AY,AR,'rgba(195,210,255,0.65)');

    x.fillStyle='#221255'; x.font=`bold 30px ${FB}`; x.textAlign='left'; x.textBaseline='top'; x.fillText(UNAME,200,34);
    rrect(x,200,78,106,22,11); x.fillStyle='rgba(255,255,255,0.55)'; x.fill(); x.strokeStyle='rgba(255,255,255,0.85)'; x.lineWidth=1; x.stroke();
    x.fillStyle='#4422aa'; x.font=`bold 11px ${FB}`; x.textBaseline='middle'; x.fillText('✦ GLASS THEME',208,89);

    x.fillStyle='rgba(50,25,120,0.52)'; x.font=`11px ${FB}`; x.textBaseline='top'; x.fillText('BALANCE',200,114);
    x.fillStyle='#180840'; x.font=`bold 50px ${FB}`; x.textBaseline='top'; x.fillText(BAL,200,128);
    x.fillStyle='rgba(50,25,120,0.42)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('credits',200+x.measureText(BAL).width+8,163);
    x.fillStyle='rgba(255,255,255,0.65)'; x.fillRect(200,196,268,1);
    x.fillStyle='rgba(50,25,120,0.48)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('TOTAL EARNED',200,202);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(30,14,90,0.72)'; x.fillText(TOT,200+x.measureText('TOTAL EARNED ').width,202);

    rrect(x,490,22,W-504,H-44,14); x.fillStyle='rgba(255,255,255,0.3)'; x.fill(); x.strokeStyle='rgba(255,255,255,0.6)'; x.lineWidth=1; x.stroke();
    x.fillStyle='rgba(60,35,155,0.75)'; x.font=`bold 11px ${FB}`; x.textBaseline='top'; x.fillText('✦  SHOP ROLES',506,36);
    if (!ROLES.length) { x.fillStyle='rgba(50,25,120,0.4)'; x.font=`12px ${FN}`; x.fillText('No items yet',506,58); }
    ROLES.forEach(({name,color,price},i)=>{
      const rx=506+(i%2)*172,ry=52+Math.floor(i/2)*52; const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle='rgba(255,255,255,0.48)'; rrect(x,rx,ry,160,42,10); x.fill(); x.strokeStyle='rgba(255,255,255,0.75)'; x.lineWidth=1; rrect(x,rx,ry,160,42,10); x.stroke();
      x.fillStyle=clr; x.fillRect(rx,ry,3,42);
      x.fillStyle='#221255'; x.font=`bold 12px ${FB}`; x.textBaseline='top'; x.fillText((name||'Item').slice(0,14),rx+10,ry+8);
      x.fillStyle='rgba(60,35,155,0.62)'; x.font=`11px ${FN}`; x.fillText(fmt(price||0)+' cr',rx+10,ry+24);
    });
  }

  // ── GALAXY ────────────────────────────────────────────────────────────────────
  if (theme === 'galaxy') {
    const bg=x.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,'#03001a'); bg.addColorStop(0.5,'#080022'); bg.addColorStop(1,'#01030e');
    x.fillStyle=bg; x.fillRect(0,0,W,H);
    const sr=mkRng(42);
    for(let i=0;i<300;i++){
      const sx=sr()*W,sy=sr()*H,ss=sr()<0.92?0.6:sr()*1.8+0.8;
      x.fillStyle=`rgba(255,255,255,${sr()*0.65+0.25})`; x.beginPath(); x.arc(sx,sy,ss,0,Math.PI*2); x.fill();
    }
    const fr=mkRng(77);
    for(let i=0;i<8;i++){
      const fx=fr()*W,fy=fr()*H;
      x.save(); x.shadowColor='rgba(200,220,255,0.8)'; x.shadowBlur=8;
      x.fillStyle='rgba(255,255,255,0.9)'; x.beginPath(); x.arc(fx,fy,fr()*1.2+0.8,0,Math.PI*2); x.fill();
      x.strokeStyle='rgba(255,255,255,0.4)'; x.lineWidth=0.5;
      x.beginPath(); x.moveTo(fx-8,fy); x.lineTo(fx+8,fy); x.stroke();
      x.beginPath(); x.moveTo(fx,fy-8); x.lineTo(fx,fy+8); x.stroke(); x.restore();
    }
    [{cx:110,cy:130,r:175,c:'rgba(100,0,180,0.2)'},{cx:W*0.75,cy:H*0.3,r:210,c:'rgba(0,70,200,0.16)'},{cx:W*0.55,cy:H,r:200,c:'rgba(60,0,150,0.14)'}].forEach(n=>{
      const g2=x.createRadialGradient(n.cx,n.cy,0,n.cx,n.cy,n.r);
      g2.addColorStop(0,n.c); g2.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=g2; x.fillRect(0,0,W,H);
    });
    const ab=x.createLinearGradient(0,0,0,H);
    ab.addColorStop(0,'rgba(120,0,200,0)'); ab.addColorStop(0.3,'#8800cc'); ab.addColorStop(0.7,'#0066ff'); ab.addColorStop(1,'rgba(0,102,255,0)');
    x.fillStyle=ab; x.fillRect(0,0,4,H);

    const AX=110,AY=130,AR=65;
    const rg=x.createLinearGradient(AX-AR,AY-AR,AX+AR,AY+AR);
    rg.addColorStop(0,'#8800cc'); rg.addColorStop(0.5,'#0066ff'); rg.addColorStop(1,'#00ccff');
    x.save(); x.shadowColor='#6600aa'; x.shadowBlur=25; x.strokeStyle=rg; x.lineWidth=3;
    x.beginPath(); x.arc(AX,AY,AR+7,0,Math.PI*2); x.stroke();
    x.shadowBlur=0; x.strokeStyle='rgba(136,0,204,0.2)'; x.lineWidth=7;
    x.beginPath(); x.arc(AX,AY,AR+1,0,Math.PI*2); x.stroke(); x.restore();
    await drawAvatar(AX,AY,AR,'#040012');

    const ug=x.createLinearGradient(200,0,420,0);
    ug.addColorStop(0,'#cc88ff'); ug.addColorStop(1,'#6699ff');
    x.save(); x.shadowColor='#8800cc'; x.shadowBlur=12;
    x.fillStyle=ug; x.font=`bold 30px ${FB}`; x.textAlign='left'; x.textBaseline='top'; x.fillText(UNAME,200,34); x.restore();
    rrect(x,200,78,118,22,4); x.fillStyle='rgba(136,0,204,0.22)'; x.fill(); x.strokeStyle='rgba(136,0,204,0.52)'; x.lineWidth=1; x.stroke();
    x.fillStyle='#cc88ff'; x.font=`bold 10px ${FB}`; x.textBaseline='middle'; x.fillText('✦ GALAXY THEME',207,89);

    x.fillStyle='rgba(175,135,255,0.42)'; x.font=`11px ${FB}`; x.textBaseline='top'; x.fillText('BALANCE',200,116);
    const bg2=x.createLinearGradient(200,0,420,0);
    bg2.addColorStop(0,'#cc88ff'); bg2.addColorStop(1,'#6699ff');
    x.save(); x.shadowColor='#8800cc'; x.shadowBlur=14;
    x.fillStyle=bg2; x.font=`bold 50px ${FB}`; x.textBaseline='top'; x.fillText(BAL,200,130); x.restore();
    x.fillStyle='rgba(100,150,255,0.45)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('credits',200+x.measureText(BAL).width+8,166);
    x.fillStyle='rgba(136,0,204,0.25)'; x.fillRect(200,196,268,1);
    x.fillStyle='rgba(175,135,255,0.42)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('TOTAL EARNED',200,202);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(100,150,255,0.72)'; x.fillText(TOT,200+x.measureText('TOTAL EARNED ').width,202);

    const vd=x.createLinearGradient(0,0,0,H);
    vd.addColorStop(0,'rgba(136,0,204,0)'); vd.addColorStop(0.5,'rgba(136,0,204,0.3)'); vd.addColorStop(1,'rgba(136,0,204,0)');
    x.strokeStyle=vd; x.lineWidth=1; x.beginPath(); x.moveTo(487,20); x.lineTo(487,H-20); x.stroke();
    x.fillStyle='#cc88ff'; x.font=`bold 11px ${FB}`; x.textBaseline='top'; x.fillText('✦  SHOP ROLES',500,28);
    if (!ROLES.length) { x.fillStyle='rgba(136,0,204,0.4)'; x.font=`12px ${FN}`; x.fillText('No items yet',500,48); }
    ROLES.forEach(({name,color,price},i)=>{
      const rx=500+(i%2)*178,ry=44+Math.floor(i/2)*46; const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle='rgba(100,0,180,0.12)'; rrect(x,rx,ry,165,37,6); x.fill(); x.strokeStyle='rgba(136,0,204,0.28)'; x.lineWidth=1; rrect(x,rx,ry,165,37,6); x.stroke();
      x.fillStyle=clr; x.fillRect(rx,ry,3,37);
      x.fillStyle='#cc88ff'; x.font=`bold 12px ${FB}`; x.textBaseline='top'; x.fillText((name||'Item').slice(0,14),rx+10,ry+6);
      x.fillStyle='rgba(100,150,255,0.62)'; x.font=`11px ${FN}`; x.fillText(fmt(price||0)+' cr',rx+10,ry+22);
    });
  }

  // ── ACADEMIA ──────────────────────────────────────────────────────────────────
  if (theme === 'academia') {
    x.fillStyle='#18100a'; x.fillRect(0,0,W,H);
    const bg2=x.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.65);
    bg2.addColorStop(0,'rgba(58,36,12,0.55)'); bg2.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=bg2; x.fillRect(0,0,W,H);
    const nr=mkRng(13);
    for(let i=0;i<1400;i++){ x.fillStyle=`rgba(200,155,75,${nr()*0.042})`; x.fillRect(nr()*W,nr()*H,1,1); }
    const lb=x.createLinearGradient(0,0,0,H);
    lb.addColorStop(0,'rgba(180,138,55,0)'); lb.addColorStop(0.3,'#b08830'); lb.addColorStop(0.7,'#b08830'); lb.addColorStop(1,'rgba(180,138,55,0)');
    x.fillStyle=lb; x.fillRect(0,0,5,H);
    x.strokeStyle='rgba(176,136,48,0.3)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(28,100); x.lineTo(475,100); x.stroke();
    x.beginPath(); x.moveTo(28,104); x.lineTo(475,104); x.stroke();
    [[250,102],[350,102]].forEach(([ox,oy])=>{
      x.fillStyle='rgba(176,136,48,0.4)'; x.save(); x.translate(ox,oy); x.rotate(Math.PI/4); x.fillRect(-3,-3,6,6); x.restore();
    });

    const AX=110,AY=130,AR=63;
    x.save(); x.shadowColor='#b08830'; x.shadowBlur=18; x.strokeStyle='#b08830'; x.lineWidth=2.5;
    x.beginPath(); x.arc(AX,AY,AR+8,0,Math.PI*2); x.stroke();
    x.shadowBlur=0; x.strokeStyle='rgba(176,136,48,0.38)'; x.lineWidth=5;
    x.beginPath(); x.arc(AX,AY,AR+2,0,Math.PI*2); x.stroke(); x.restore();
    await drawAvatar(AX,AY,AR,'#0c0a05');

    x.fillStyle='#d0a040'; x.font=`bold 28px ${FB}`; x.textAlign='left'; x.textBaseline='top'; x.fillText(UNAME,200,34);
    rrect(x,200,78,122,22,3); x.fillStyle='rgba(176,136,48,0.16)'; x.fill(); x.strokeStyle='rgba(176,136,48,0.48)'; x.lineWidth=1; x.stroke();
    x.fillStyle='#c09436'; x.font=`bold 10px ${FB}`; x.textBaseline='middle'; x.fillText('✦ ACADEMIA THEME',207,89);

    x.fillStyle='rgba(176,136,48,0.48)'; x.font=`11px ${FB}`; x.textBaseline='top'; x.fillText('BALANCE',200,116);
    x.fillStyle='#d0a040'; x.font=`bold 50px ${FB}`; x.textBaseline='top'; x.fillText(BAL,200,130);
    x.fillStyle='rgba(176,136,48,0.42)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('credits',200+x.measureText(BAL).width+8,166);
    x.fillStyle='rgba(176,136,48,0.2)'; x.fillRect(200,196,268,1);
    x.fillStyle='rgba(176,136,48,0.42)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('TOTAL EARNED',200,202);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(210,165,70,0.68)'; x.fillText(TOT,200+x.measureText('TOTAL EARNED ').width,202);

    const vd=x.createLinearGradient(0,0,0,H);
    vd.addColorStop(0,'rgba(176,136,48,0)'); vd.addColorStop(0.5,'rgba(176,136,48,0.24)'); vd.addColorStop(1,'rgba(176,136,48,0)');
    x.strokeStyle=vd; x.lineWidth=1; x.beginPath(); x.moveTo(487,16); x.lineTo(487,H-16); x.stroke();
    x.fillStyle='#d0a040'; x.font=`bold 11px ${FB}`; x.textBaseline='top'; x.fillText('✦  SHOP ROLES',500,28);
    if (!ROLES.length) { x.fillStyle='rgba(176,136,48,0.4)'; x.font=`12px ${FN}`; x.fillText('No items yet',500,48); }
    ROLES.forEach(({name,color,price},i)=>{
      const rx=500+(i%2)*178,ry=44+Math.floor(i/2)*46; const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle='rgba(176,136,48,0.08)'; rrect(x,rx,ry,165,37,5); x.fill(); x.strokeStyle='rgba(176,136,48,0.26)'; x.lineWidth=1; rrect(x,rx,ry,165,37,5); x.stroke();
      x.fillStyle=clr; x.fillRect(rx,ry,3,37);
      x.fillStyle='#d0a040'; x.font=`bold 12px ${FB}`; x.textBaseline='top'; x.fillText((name||'Item').slice(0,14),rx+10,ry+6);
      x.fillStyle='rgba(176,136,48,0.58)'; x.font=`11px ${FN}`; x.fillText(fmt(price||0)+' cr',rx+10,ry+22);
    });
  }

  // ── PAPER ─────────────────────────────────────────────────────────────────────
  if (theme === 'paper') {
    x.fillStyle='#efe5ce'; x.fillRect(0,0,W,H);
    const vig=x.createRadialGradient(W/2,H/2,H*0.25,W/2,H/2,W*0.72);
    vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(75,45,15,0.18)');
    x.fillStyle=vig; x.fillRect(0,0,W,H);
    const gr=mkRng(77);
    for(let i=0;i<2200;i++){ x.fillStyle=`rgba(90,58,22,${gr()*0.065})`; x.fillRect(gr()*W,gr()*H,1,1); }
    x.fillStyle='#5a3a1a'; x.fillRect(0,0,7,H);
    x.fillStyle='rgba(90,58,26,0.32)'; x.fillRect(11,0,1,H);
    x.strokeStyle='rgba(90,58,26,0.22)'; x.lineWidth=1;
    x.beginPath(); x.moveTo(48,106); x.lineTo(472,106); x.stroke();
    x.save(); x.shadowColor='rgba(140,40,40,0.3)'; x.shadowBlur=6;
    x.fillStyle='rgba(160,48,48,0.75)'; x.beginPath(); x.arc(455,235,14,0,Math.PI*2); x.fill();
    x.fillStyle='rgba(200,80,80,0.55)'; x.beginPath(); x.arc(455,235,10,0,Math.PI*2); x.fill();
    x.fillStyle='rgba(255,220,200,0.6)'; x.font=`bold 12px ${FB}`; x.textAlign='center'; x.textBaseline='middle'; x.fillText('N',455,235);
    x.restore(); x.textAlign='left';

    const AX=107,AY=130,AR=62;
    x.strokeStyle='#5a3a1a'; x.lineWidth=2; x.setLineDash([7,3]);
    x.beginPath(); x.arc(AX,AY,AR+9,0,Math.PI*2); x.stroke(); x.setLineDash([]);
    await drawAvatar(AX,AY,AR,'#d2c09e');

    x.fillStyle='#281408'; x.font=`bold 30px ${FB}`; x.textAlign='left'; x.textBaseline='top'; x.fillText(UNAME,192,34);
    rrect(x,192,78,106,22,3); x.fillStyle='rgba(90,58,26,0.1)'; x.fill(); x.strokeStyle='rgba(90,58,26,0.52)'; x.lineWidth=1.5; x.stroke();
    x.fillStyle='#5a3a1a'; x.font=`bold 10px ${FB}`; x.textBaseline='middle'; x.fillText('✦ PAPER THEME',199,89);

    x.fillStyle='rgba(90,58,26,0.55)'; x.font=`11px ${FB}`; x.textBaseline='top'; x.fillText('BALANCE',192,116);
    x.fillStyle='#180c04'; x.font=`bold 50px ${FB}`; x.textBaseline='top'; x.fillText(BAL,192,130);
    x.fillStyle='rgba(90,58,26,0.42)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('credits',192+x.measureText(BAL).width+8,164);
    x.strokeStyle='rgba(90,58,26,0.2)'; x.lineWidth=1; x.beginPath(); x.moveTo(192,196); x.lineTo(462,196); x.stroke();
    x.fillStyle='rgba(90,58,26,0.48)'; x.font=`13px ${FN}`; x.textBaseline='top'; x.fillText('TOTAL EARNED',192,202);
    x.font=`bold 13px ${FB}`; x.fillStyle='rgba(38,20,8,0.68)'; x.fillText(TOT,192+x.measureText('TOTAL EARNED ').width,202);

    x.fillStyle='rgba(90,58,26,0.07)'; x.fillRect(488,14,W-502,H-28);
    x.strokeStyle='rgba(90,58,26,0.2)'; x.lineWidth=1; x.beginPath(); x.moveTo(488,14); x.lineTo(488,H-14); x.stroke();
    x.fillStyle='#5a3a1a'; x.font=`bold 11px ${FB}`; x.textBaseline='top'; x.fillText('✦  SHOP ITEMS',500,28);
    if (!ROLES.length) { x.fillStyle='rgba(90,58,26,0.4)'; x.font=`12px ${FN}`; x.fillText('No items yet',500,48); }
    ROLES.forEach(({name,color,price},i)=>{
      const rx=500+(i%2)*176,ry=44+Math.floor(i/2)*50; const clr=/^#[0-9A-Fa-f]{6}$/.test(color||'')?color:'#5865F2';
      x.fillStyle='rgba(90,58,26,0.07)'; rrect(x,rx,ry,163,40,4); x.fill(); x.strokeStyle='rgba(90,58,26,0.2)'; x.lineWidth=1; rrect(x,rx,ry,163,40,4); x.stroke();
      x.fillStyle=clr; x.fillRect(rx,ry,4,40);
      x.fillStyle='#281408'; x.font=`bold 12px ${FB}`; x.textBaseline='top'; x.fillText((name||'Item').slice(0,14),rx+11,ry+8);
      x.fillStyle='rgba(90,58,26,0.58)'; x.font=`11px ${FN}`; x.fillText(fmt(price||0)+' cr',rx+11,ry+24);
    });
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateThemedCard, THEME_NAMES };
