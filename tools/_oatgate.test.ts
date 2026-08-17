// 一次性（II 批 #98）：81 个燕麦候选格的 JS 门序逐门评估。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { solidTile as _solidTileHB } from '../src/world/gen/vanilla/HalfBrickPass';

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
  const half = new Uint8Array(readFileSync('/tmp/sw-mb-hs97.half').buffer.slice(0));
  const slope = new Uint8Array(readFileSync('/tmp/sw-mb-hs97.slope').buffer.slice(0));
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = l[i]! > 0 ? 1 : 0;
  }
  st.slope.set(slope);
  st.half.set(half);
}
const SAND_FAMILY = new Set([53, 112, 116, 234]);
const beachDistance = 380;

(RUN ? it : it.skip)('oat gate chain', () => {
  let shown = 0;
  let solidOK = 0, waterOK = 0;
  for (let x = 2790; x <= 2940 && shown < 10; x++) {
    for (let y = 1; y < 336; y++) {
      const i = st.idx(x, y);
      if (st.flags[i] || st.wall[i] || st.liquid[i]) continue;
      const bi = st.idx(x, y + 1);
      if (!st.flags[bi] || !SAND_FAMILY.has(SHEET[st.type[bi]]!)) continue;
      const bi2 = st.idx(x, y + 1);
      const slopeBad = st.slope[bi2] === 1 || st.slope[bi2] === 2 || st.half[bi2] !== 0;
      let sum = 0;
      for (let k = x - 45; k <= x + 45; k++)
        for (let m = y - 20; m <= y + 20; m++)
          if (st.inBounds(k, m) && !_solidTileHB(st, k, m) && st.liquid[st.idx(k, m)] > 0)
            sum += st.liquid[st.idx(k, m)];
      const wok = Math.trunc(sum / 255) >= 20;
      if (!slopeBad) solidOK++;
      if (wok) waterOK++;
      if (shown < 8) {
        console.log(`(${x},${y}) belowSheet=${SHEET[st.type[bi2]]} slope=${st.slope[bi2]} half=${st.half[bi2]} → solidGateOk=${!slopeBad} waterSum=${Math.trunc(sum / 255)} waterOk=${wok} => plant=${!slopeBad && wok}`);
      }
      shown++;
      break;
    }
  }
  console.log(`candidates shown=${shown} solidOK=${solidOK} waterOK=${waterOK}`);
}, 120000);
