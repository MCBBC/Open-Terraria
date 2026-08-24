// KKKKKKK：post-Dungeon 全格 diff（js32.{typ,act} vs x86 032_Dungeon）——mile8 cmp 同口径
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_K2 === '1';
const W = 4200, H = 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
(RUN ? it : it.skip)('grid diff', () => {
  const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer, readFileSync(p).byteOffset, readFileSync(p).length >> 1);
  const b8 = (p: string) => readFileSync(p);
  const xt = le16('/tmp/jjj-out/g1457-const/032_Dungeon.typ');
  const xa = b8('/tmp/jjj-out/g1457-const/032_Dungeon.act');
  const jt = le16('/tmp/kkk-out/js32.typ');
  const ja = b8('/tmp/kkk-out/js32.act');
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    const va = xa[i]!, jaa = ja[i]! & 1;
    const vt = va ? xt[i]! : 0;
    const jsh = jaa ? (SHEET[jt[i]!] >= 0 ? SHEET[jt[i]!]! : 9999) : 0;
    if (va !== jaa || vt !== jsh) {
      if (n < 40) console.log(`(${i % W},${(i / W) | 0}) v=${vt}/${va} j=${jsh}/${jaa}`);
      n++;
    }
  }
  console.log('total diff cells:', n);
});
