import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');
const svg = readFileSync(join(iconsDir, 'icon.svg'), 'utf8');

mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'transparent',
  });
  const png = resvg.render().asPng();
  writeFileSync(join(iconsDir, `icon${size}.png`), png);
  console.log(`Wrote icon${size}.png (${png.length} bytes)`);
}
