'use strict';
// Run:  node preview.js
// Generates preview_latest.png — all 8 themes with test data including quote + inventory
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const { generateThemedCard, THEME_NAMES } = require('./src/utils/themedCard');

const TEST_ITEMS = [
  { name: 'Crimson Aura',  color: '#DC143C', type: 'color_role' },
  { name: 'Sapphire',      color: '#4488FF', type: 'color_role' },
  { name: 'Galaxy Theme',  color: null,      type: 'theme'      },
  { name: 'Custom Role',   color: '#AA44FF', type: 'color_role' },
];
const TEST_QUOTE = 'Magnetic aura, cold energy.';

async function main() {
  const W = 860, H = 260, PAD = 12, LH = 22;
  const total = THEME_NAMES.length;
  const out   = createCanvas(W + 20, total * (H + LH + PAD) + PAD * 2);
  const ctx   = out.getContext('2d');
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, out.width, out.height);

  for (let i = 0; i < total; i++) {
    const theme = THEME_NAMES[i];
    const buf = await generateThemedCard({
      username:    'yourname',
      avatarUrl:   'https://cdn.discordapp.com/embed/avatars/0.png',
      balance:     42500,
      totalEarned: 42500,
      shopItems:   TEST_ITEMS,
      theme,
      quote:       TEST_QUOTE,
    });

    const img = await loadImage(buf);
    const y   = PAD + i * (H + LH + PAD);
    ctx.fillStyle    = '#666';
    ctx.font         = 'bold 12px sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(theme.toUpperCase(), 14, y + 15);
    ctx.drawImage(img, 10, y + LH);
  }

  const outPath = 'preview_latest.png';
  fs.writeFileSync(outPath, out.toBuffer('image/png'));
  console.log(`✅  ${outPath}  (${THEME_NAMES.length} themes)`);
}

main().catch(e => { console.error(e); process.exit(1); });
