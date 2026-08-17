// 一次性（II 批 #98 根因定位）：P(2789) 窗口内两处棕榈骰命中列（2832/2840）
// 的 growPalmTree 门序逐项评估——JS 哪个门先拒、vanilla 是否会放行。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { emptyTileCheck } from '../src/world/gen/vanilla/TreePass';

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

function buildStore(): TileStore {
  const t = new Uint16Array(load('typ').buffer.slice(0));
  const a = load('act');
  const w = new Uint16Array(load('wal').buffer.slice(0));
  const l = load('liq');
  const half = new Uint8Array(readFileSync('/tmp/sw-mb-hs97.half').buffer.slice(0));
  const slope = new Uint8Array(readFileSync('/tmp/sw-mb-hs97.slope').buffer.slice(0));
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t[i]!) ?? 0;
    st.flags[i] = a[i] ? 1 : 0;
    st.wall[i] = w[i]!;
    st.liquid[i] = l[i]!;
    st.liquidType[i] = l[i]! > 0 ? 1 : 0;
  }
  st.slope.set(slope);
  st.half.set(half);
  return st;
}

(RUN ? it : it.skip)('palm gate eval @2832/2840', () => {
  const st = buildStore();
  const SAND = new Set([53, 112, 116, 234]);
  const PLANTS = new Set([SHEET.indexOf(20) === -1 ? 999999 : SHEET.indexOf(20)]);
  // 找 PLANTS 内部 id(TILE_BY_KEY 更稳)
  let plant20 = -1;
  for (let i = 0; i < TILE_DEFS.length; i++) if (SHEET[i] === 20) { plant20 = i; break; }
  const PALM_GROUND = new Set<number>();
  for (let i = 0; i < TILE_DEFS.length; i++) if ([53, 234, 116, 112].includes(SHEET[i]!)) PALM_GROUND.add(i);

  for (const col of [2832, 2840]) {
    console.log(`=== column ${col}`);
    for (let y = 1; y < 336; y++) {
      const i = st.idx(col, y);
      if (!st.flags[i] || !SAND.has(SHEET[st.type[i]]!)) continue;
      const ai = st.idx(col, y - 1);
      if (st.flags[ai] || st.wall[ai] !== 0) continue;
      // 命中面——水盒
      let sum = 0;
      for (let k = col - 50; k < col + 50; k++)
        for (let m = y - 25; m < y + 25; m++)
          if (st.inBounds(k, m)) sum += st.liquid[st.idx(k, m)];
      const over = Math.trunc(sum / 255) > 25;
      console.log(`  face y=${y} sheet=${SHEET[st.type[i]]} waterBox=${Math.trunc(sum / 255)} over=${over}`);
      if (!over) { console.log('  → PlantCactus 列(非棕榈)'); continue; }
      // GrowPalmTree 门序评估(基座自 y 下扫 plants 20)
      let num = y;
      while (st.inBounds(col, num) && st.flags[st.idx(col, num)] && st.type[st.idx(col, num)] === plant20) num++;
      console.log(`  base scan: y→num=${num} (plants20=${plant20})`);
      const gi = st.idx(col, num);
      console.log(`  gate1 InWorld+active=${!!st.flags[gi]} half=${st.half[gi]} slope=${st.slope[gi]}`);
      const wi = st.idx(col, num - 1);
      console.log(`  gate2 wall(num-1)=${st.wall[wi]} liquid(num-1)=${st.liquid[wi]}`);
      console.log(`  gate3 ground sheet=${SHEET[st.type[gi]]} inPalmGround=${PALM_GROUND.has(st.type[gi])}`);
      console.log(`  gate4 empty(mid)=${emptyTileCheck(st, col, col, num - 2, num - 1, 20)} empty(side)=${emptyTileCheck(st, col - 1, col + 1, num - 20, num - 3, 20)}`);
      // vanilla EmptyTileCheck 细节:侧柱扫描找首个活动格
      outer:
      for (let yy = num - 20; yy <= num - 3; yy++) {
        for (let xx = col - 1; xx <= col + 1; xx++) {
          const k = st.idx(xx, yy);
          if (!st.flags[k]) continue;
          if (SHEET[st.type[k]] === 20) continue;
          console.log(`  side-box blocker @(${xx},${yy}) sheet=${SHEET[st.type[k]]}`);
          break outer;
        }
      }
      break;
    }
  }
}, 120000);
