// 一次性（II 批 #98）：湖上干沙带的燕麦候选格——用 JS 门序逐步定位失败门。
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
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]! > 0 ? 1 : 0;
    st.liquidType[i] = l[i]! > 0 ? 1 : 0;
  }
}
const SAND_FAMILY = new Set([53, 112, 116, 234]);
const beachDistance = 380;

(RUN ? it : it.skip)('oat candidates above lake', () => {
  let total = 0;
  for (let x = 2790; x <= 2850 && total < 14; x++) {
    for (let y = 1; y < 250; y++) {
      const i = st.idx(x, y);
      if (st.wall[i] > 0 || st.flags[i] || st.liquid[i] > 0) continue;
      const bi = st.idx(x, y + 1);
      if (!st.flags[bi] || !SAND_FAMILY.has(SHEET[st.type[bi]]!)) continue;
      // 候选:wall/act/liq/sand 都过——查 slope/half 与水检
      const slopeOk = st.slope[bi] !== 1 && st.slope[bi] !== 2 && !st.half[bi];
      let sum = 0;
      for (let k = x - 45; k <= x + 45; k++)
        for (let m = y - 20; m <= y + 20; m++)
          if (st.inBounds(k, m) && !_solidTileHB(st, k, m) && st.liquid[st.idx(k, m)] > 0)
            sum += st.liquid[st.idx(k, m)];
      const waterOk = Math.trunc(sum / 255) >= 20;
      console.log(`(${x},${y}) slopeOk=${slopeOk} slope=${st.slope[bi]} half=${st.half[bi]} waterSum=${Math.trunc(sum / 255)} plantable=${slopeOk && waterOk}`);
      total++;
      break;
    }
  }
}, 120000);
