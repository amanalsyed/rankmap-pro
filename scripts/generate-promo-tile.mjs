import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const storeDir = join(root, 'public', 'store');

const tiles = [
  { svg: 'promo-tile-440x280.svg', png: 'promo-tile-440x280.png', width: 440 },
  { svg: 'promo-marquee-1400x560.svg', png: 'promo-marquee-1400x560.png', width: 1400 },
];

mkdirSync(storeDir, { recursive: true });

for (const tile of tiles) {
  const svgPath = join(storeDir, tile.svg);
  const pngPath = join(storeDir, tile.png);
  const svg = readFileSync(svgPath, 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: tile.width },
    background: '#312e81',
  });
  const png = resvg.render().asPng();
  writeFileSync(pngPath, png);
  console.log(`Wrote ${pngPath} (${png.length} bytes, ${tile.width}px wide)`);
}

// Regenerate 1200×630 social images (X/Twitter recommended ratio)
await import('./generate-og-social.mjs');
