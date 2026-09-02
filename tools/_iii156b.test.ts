// IIII156 批一次性诊断：base(cap-pre) 态指定窗口 vanilla-sheet 视图（判读房间雕前地形）
// 用法: cd game && SW_I156B=1 SW_I156B_WIN=813,885,420,490 npx vitest run tools/_iii156b.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I156B === '1';
const OUT = process.env.SW_I89_OUT ?? '/tmp/iii149-out/cap-pre';

(RUN ? it : it.skip)('i156 base window dump', () => {
  const hdr = JSON.parse(readFileSync(`${OUT}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const [x0, x1, y0, y1] = (process.env.SW_I156B_WIN ?? '813,885,420,490').split(',').map(Number);
  for (let y = y0; y <= y1; y++) {
    let r = String(y).padStart(4) + ' ';
    for (let x = x0; x <= x1; x++) {
      const i = st.idx(x, y);
      const sh = TILE_DEFS[st.type[i]!]?.vanilla?.sheet;
      r += st.flags[i] ? (sh === 38 ? 'g' : sh === 41 ? 'B' : sh === 48 ? 'S' : sh === 123 ? 's' : sh === 25 ? 'E' : sh === 59 ? 'm' : '#') : '.';
    }
    console.log(r);
  }
});
