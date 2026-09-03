// ★IIIII209 轨路线骨架扫描 v2：JS 经 SHEET 映射后与 x86 对拍
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
const RUN = process.env.SW_I209RT === '1';
const JS_DIR = '/tmp/iii203-out/pipeslot-97';
const GOLD = '/Users/vinlic/GoldenChains/golden-remix/dumps/097_Micro_Biomes';
const W = 4200, H = 1200;
function le16(p: string): Uint16Array { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
(RUN ? it : it.skip)('iii209 route skeleton v2', () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } } | undefined)?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const jT = le16(`${JS_DIR}/base_type.bin`), gT = le16(`${GOLD}.typ`);
  const scan = (get: (i: number) => number, name: string) => {
    console.log(`--- ${name} ---`);
    const runs: string[] = [];
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (get(y * W + x) === 314) {
          const x0 = x;
          while (x < W && get(y * W + x) === 314) x++;
          runs.push(`y${y}:${x0}-${x - 1}(${x - x0})`);
        } else x++;
      }
    }
    console.log(runs.join(' '));
  };
  scan((i) => gT[i], 'x86 rails');
  scan((i) => (jT[i] >= 0 && jT[i] < SHEET.length ? SHEET[jT[i]] : 9999), 'JS rails(mapped)');
});
