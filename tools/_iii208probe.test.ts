// IIII208 一次性诊断 v5：(660,448)/(1912,486)/(71,490) 洪水定数 + 活空格路径检查。
//   cd game && SW_MB_1457=1 npx vitest run tools/_iii208probe.test.ts
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I208PROBE=1 npx vitest run tools/_iii208probe.test.ts
//   ★机器态硬依赖单列（212 章 M3）:本件读本机会话产物（/tmp/iii207-out）,他机/产物清理后必红——仅门内运行。
const RUN = process.env.SW_I208PROBE === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { countTiles, countWires } from '../src/world/gen/vanilla/MicroBiomesPass';
import { NOT_CLEARABLE } from '../src/world/gen/vanilla/TileRunner';

const OUT = '/tmp/iii207-out';
const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;

it('flood counts for the three disputed anchors', () => {
  const hdr = JSON.parse(readFileSync(`${OUT}/base98/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${OUT}/base98/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  for (const [x, y] of [[660, 448], [1912, 486], [71, 490], [4036, 833]] as const) {
    const i = st.idx(x, y);
    const below = st.idx(x, y + 2);
    console.log(`(${x},${y}): cnt=${countTiles(st, x, y)} wires=${countWires(st, x, y, 20)} nc=${NOT_CLEARABLE.has(st.type[below]!) ? 1 : 0} belowType=${st.type[below]} chestFrame=${st.frameX[i]} actAirNearby=??`);
  }
  // count active-air (flags bit0=1 & type=0) cells in the 41x41 around (660,448) and (1912,486)
  for (const [cx, cy] of [[660, 448], [1912, 486]] as const) {
    let n = 0;
    for (let yy = cy - 20; yy <= cy + 20; yy++) for (let xx = cx - 20; xx <= cx + 20; xx++) {
      const i2 = st.idx(xx, yy);
      if ((st.flags[i2]! & 1) === 1 && st.type[i2] === 0) n++;
    }
    console.log(`active-air cells in 41x41 around (${cx},${cy}): ${n}`);
  }
}, 600_000);
