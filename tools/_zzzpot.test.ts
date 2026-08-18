// ZZZ 探针 6b：陶罐击杀原因定位（在 vanilla 终态上跑 CheckPot 逻辑+诊断）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}

it('diagnose pot kills', () => {
  const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s111.wld')));
  const w = wld.tilesWide, h = wld.tilesHigh;
  const solid2 = (x: number, y: number): boolean => {
    const i = y * w + x;
    if (!wld.tiles.active[i]) return false;
    const id = REV.get(wld.tiles.type[i]!) ?? -1;
    return id >= 0 && !!TILE_DEFS[id]?.solid && wld.tiles.slope[i] === 0 && !wld.tiles.half[i];
  };
  const t = wld.tiles;
  let bad = 0, badSup = 0;
  const samples: string[] = [];
  for (let y = 6; y < h - 6; y++) {
    for (let x = 6; x < w - 6; x++) {
      const i = y * w + x;
      if (!t.active[i] || t.type[i] !== 28) continue;
      // 只在原点格判定（fx/18 偶 且 fy%2==0）
      const fx = t.frameX[i]!, fy = t.frameY[i]!;
      let num = Math.floor(fx / 18); while (num > 1) num -= 2;
      const x0 = x - num;
      let num3 = Math.floor(fy / 18); let num4 = 0;
      while (num3 > 1) { num3 -= 2; num4++; }
      const y0 = y - num3;
      if (num !== 0 || num3 !== 0) continue;   // 原点格
      let ok = true;
      for (let k = x0; k < x0 + 2 && ok; k++) {
        for (let l = y0; l < y0 + 2; l++) {
          const ki = l * w + k;
          let fx18 = Math.floor(t.frameX[ki]! / 18); while (fx18 > 1) fx18 -= 2;
          if (!t.active[ki] || t.type[ki] !== 28 || fx18 !== k - x0
            || t.frameY[ki] !== (l - y0) * 18 + num4 * 36) ok = false;
        }
      }
      if (ok) for (let k = x0; k < x0 + 2; k++) if (!solid2(k, y0 + 2)) ok = false;
      if (!ok) {
        bad++;
        const below0 = t.type[(y0 + 2) * w + x0]!, below1 = t.type[(y0 + 2) * w + x0 + 1]!;
        const sl0 = t.slope[(y0 + 2) * w + x0], hf0 = t.half[(y0 + 2) * w + x0];
        if (samples.length < 6) samples.push(`(${x},${y}) fy=${fy} below=(${below0}/${below1}) sl=${sl0} hf=${hf0} bAct=(${t.active[(y0+2)*w+x0]}/${t.active[(y0+2)*w+x0+1]})`);
      }
    }
  }
  console.log(`bad pots(at origin cells)=${bad} samples:`);
  for (const s of samples) console.log('  ', s);
});
