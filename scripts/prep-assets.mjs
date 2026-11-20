// Trims transparent margins from the Figma exports and writes them to src/assets.
// Usage: node scripts/prep-assets.mjs <figma-export-dir>
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/prep-assets.mjs <dir with raw_*.png>');
  process.exit(1);
}
const out = join(process.cwd(), 'src', 'assets');
mkdirSync(out, { recursive: true });

const jobs = [
  { from: 'raw_1.png', to: 'bg-nebula.png', trim: false },
  { from: 'raw_5.png', to: 'cloud.png', trim: true },
  { from: 'raw_6.png', to: 'plane.png', trim: true },
];

for (const j of jobs) {
  let img = sharp(join(src, j.from));
  const meta = await img.metadata();
  if (j.trim) img = img.trim({ threshold: 10 });
  const info = await img.png().toFile(join(out, j.to));
  console.log(`${j.from} ${meta.width}x${meta.height} alpha=${meta.hasAlpha} -> ${j.to} ${info.width}x${info.height}`);
}
