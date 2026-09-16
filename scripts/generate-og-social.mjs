import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = join(root, 'public', 'store', 'promo-marquee-1400x560.png');
const publicOg = join(root, 'website', 'public', 'og-image.png');
const appOg = join(root, 'website', 'app', 'opengraph-image.png');
const appTwitter = join(root, 'website', 'app', 'twitter-image.png');

const b64 = readFileSync(srcPath).toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#312e81"/>
  <image href="data:image/png;base64,${b64}" x="0" y="35" width="1200" height="560" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
writeFileSync(publicOg, png);
copyFileSync(publicOg, appOg);
copyFileSync(publicOg, appTwitter);
console.log(`Wrote ${publicOg} (${png.length} bytes, 1200x630)`);
console.log(`Copied to ${appOg} and ${appTwitter}`);
