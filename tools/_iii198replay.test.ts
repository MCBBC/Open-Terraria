// IIII198: JS CheckPot 单点重放——js-slot104 快照 → TileStore → genTileFrameNeighbor
// 用法：npx vitest run tools/_iii198replay.test.ts  (SW_I198R='x,y;x,y' 指定格位)
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198R_J4=1 npx vitest run tools/_iii198replay.test.ts
const RUN = process.env.SW_I198R_J4 === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { genTileFrameNeighbor } from '../src/world/gen/vanilla/FinalCleanupPass';
import { TILE_DEFS } from '../src/data/tiles';

const JS4 = process.env.SW_I198R_J4 ?? '/tmp/iii198-out/js-slot104';
const W = 4200, H = 1200;
const CELLS = process.env.SW_I198R ?? '28,625;29,625;28,626;29,626';

it('iii198 checkpot replay', () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  const rd = (p: string) => readFileSync(`${JS4}/base_${p}.bin`);
  const st = new TileStore(W, H, {
    type: Uint16Array.from(new Uint16Array(rd('type').buffer).slice()).buffer,
    flags: Uint8Array.from(new Uint8Array(rd('flags').buffer).slice()).buffer,
    frameX: Uint16Array.from(new Uint16Array(rd('frameX').buffer).slice()).buffer,
    frameY: Uint16Array.from(new Uint16Array(rd('frameY').buffer).slice()).buffer,
    wall: Uint16Array.from(new Uint16Array(rd('wall').buffer).slice()).buffer,
    liquid: Uint8Array.from(new Uint8Array(rd('liquid').buffer).slice()).buffer,
    liquidType: Uint8Array.from(new Uint8Array(rd('liquidType').buffer).slice()).buffer,
    half: Uint8Array.from(new Uint8Array(rd('half').buffer).slice()).buffer,
    slope: Uint8Array.from(new Uint8Array(rd('slope').buffer).slice()).buffer,
    wire: Uint8Array.from(new Uint8Array(rd('wire').buffer).slice()).buffer,
    paint: Uint8Array.from(new Uint8Array(rd('paint').buffer).slice()).buffer,
    paintWall: Uint8Array.from(new Uint8Array(rd('paintWall').buffer).slice()).buffer,
    coat: Uint8Array.from(new Uint8Array(rd('coat').buffer).slice()).buffer,
  });
  const dump = (tag: string, x0: number, y0: number, x1: number, y1: number) => {
    console.log(`--- ${tag}`);
    for (let y = y0; y <= y1; y++) {
      let s = '';
      for (let x = x0; x <= x1; x++) {
        const i = st.idx(x, y);
        s += ` (${x},${y})a${st.flags[i] & 1}t${SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 'X'}`;
      }
      console.log(s);
    }
  };
  const cells = CELLS.split(';').map((c) => c.split(',').map(Number));
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  dump('before', Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3);
  // 支撑格语义取证
  const si = st.idx(29, 627);
  console.log(`(29,627) jsType=${st.type[si]} sheet=${SHEET[st.type[si]]} act=${st.flags[si] & 1} def=${TILE_DEFS[st.type[si]]?.key} solidDef=${TILE_DEFS[st.type[si]]?.solid}`);
  for (const [x, y] of cells) {
    genTileFrameNeighbor(st, undefined, x, y);
    console.log(`[replay] genTileFrameNeighbor(${x},${y}) done`);
  }
  dump('after', Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3);
}, 300_000);
