// ★699b 帧考古:golden-calamity.wld 平台盒 frameX(真 40 放置位反演)
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
const w = parseWld(new Uint8Array(readFileSync('mods/calamity/golden-oracle/golden-calamity.wld')));
const t = w.tiles;
for (let y = 893; y <= 901; y++) {
  let row = '';
  for (let x = 4022; x <= 4038; x++) {
    const i = x * 1200 + y;
    row += t.active[i] ? String(Math.floor(t.frameX[i] / 18)) : '.';
  }
  console.log(`y${y} ${row}`);
}
