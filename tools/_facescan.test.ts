// 一次性（II 批 #98 根因）：JS 判「无面」的 8 个命中列——原版语义下逐 y 评估面门
// 与水盒，找出 JS 漏掉的面。vanilla: 15 hit×cost2（全部找到面+水盒超限+棕榈骰）。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const W = 4200, H = 1200;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const load = (e: string) => readFileSync(`/tmp/sw-num4/van_x86_g/097_Settle_Liquids_Again.${e}`);

const st = new TileStore(W, H);
{
  const t = new Uint16Array(load('typ').buffer.slice(0));
  const a = load('act');
  const w = new Uint16Array(load('wal').buffer.slice(0));
  const l = load('liq');
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = l[i]! > 0 ? 1 : 0;
  }
}
const SAND_GATE = new Set([53, 112, 234]);

(RUN ? it : it.skip)('face scan eval on no-face hit columns', () => {
  for (const x of [2802, 2805, 2813, 2817, 2820, 2875, 2890, 2901, 2797, 2806]) {
    const faces: string[] = [];
    for (let y = 1; y < 336; y++) {
      const ti = st.idx(x, y);
      if (!st.flags[ti] || !SAND_GATE.has(SHEET[st.type[ti]]!)) continue;
      const ai = st.idx(x, y - 1);
      if (st.flags[ai] || st.wall[ai] !== 0) continue;
      // 面门全过:水盒
      let sum = 0;
      for (let k = x - 50; k < x + 50; k++)
        for (let m = y - 25; m < y + 25; m++)
          if (st.inBounds(k, m)) sum += st.liquid[st.idx(k, m)];
      faces.push(`y=${y} sheet=${SHEET[st.type[ti]]} box=${Math.trunc(sum / 255)}`);
      break;
    }
    // 同时列出被拒的近 misses(y 本身是沙但上格被占/有墙)——前几个
    const rejects: string[] = [];
    for (let y = 1; y < 336 && rejects.length < 4; y++) {
      const ti = st.idx(x, y);
      if (!st.flags[ti] || !SAND_GATE.has(SHEET[st.type[ti]]!)) continue;
      const ai = st.idx(x, y - 1);
      if (st.flags[ai]) rejects.push(`y=${y} aboveActive(sheet=${SHEET[st.type[ai]]})`);
      else if (st.wall[ai] !== 0) rejects.push(`y=${y} aboveWall=${st.wall[ai]}`);
    }
    console.log(`x=${x}: face=${faces[0] ?? 'NONE'} | sandRejects: ${rejects.join('; ') || '-'}`);
  }
}, 120000);
