// #49 残差 10（仙人掌族 484/485）瞬态追查（VVV 批）：dump48 重放 settle，
// 监听 10 差格的液体瞬态（quickWater 段每格 settleWaterAt 后 + waterCheck 前后）。
// 用法：cd game && SW_M49C=1 npx vitest run tools/_m49c.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { settleWorldLiquids } from '../src/world/liquid/settle';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { World } from '../src/world/World';

const RUN = process.env.SW_M49C === '1';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gp = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (idx: number, ext: string) => new Uint8Array(readFileSync(gp(idx, ext)).buffer.slice(0));
const rd16 = (idx: number, ext: string) => new Uint16Array(readFileSync(gp(idx, ext)).buffer.slice(0));

(RUN ? it : it.skip)('cactus residual transient', async () => {
  // 10 差格 + 上/下邻
  const cells: Array<[number, number]> = [
    [2756, 661], [2757, 661], [2512, 725], [2513, 725], [2531, 855], [2532, 855],
    [2708, 855], [2709, 855], [2700, 857], [2701, 857],
  ];
  // golden 48 输入 + 期望（vanilla 49 已杀）
  const t48 = rd16(48, 'typ'), a48 = rd8(48, 'act'), l48 = rd8(48, 'liq'), lt48 = rd8(48, 'lty');
  const hf48 = rd8(48, 'half'), sl48 = rd8(48, 'slope');
  const w48 = rd16(48, 'wal');
  // JS 帧用 golden typ 反推不了——杀链只看 liquid/active/sheet，帧无关（d:[1,0] 无 style 分档），置 0
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.flags[i] = a48[i] ? 1 : 0;
    st.type[i] = REV.get(t48[i]) ?? 0;
    st.liquid[i] = l48[i]; st.liquidType[i] = l48[i] > 0 ? lt48[i] + 1 : 0;
    st.half[i] = hf48[i]; st.slope[i] = sl48[i]; st.wall[i] = w48[i];
  }
  // 事件监听：liquid 直接写不经钩子——改为打点快照：quickWater 后 / 每次 waterCheck 后
  const log: string[] = [];
  const snap = (tag: string) => {
    const parts: string[] = [];
    for (const [x, y] of cells) {
      const i = y * W + x;
      parts.push(`(${x},${y})a${st.flags[i]}t${SHEET[st.type[i]]}l${st.liquid[i]}/${st.liquid[i] > 0 ? st.liquidType[i] : 0}`);
    }
    log.push(`${tag}: ${parts.join(' ')}`);
  };
  const simApi = (await import('../src/world/liquid/LiquidSim')).LiquidSim.prototype as unknown as Record<string, unknown>;
  const oQW = simApi.quickWater as (this: unknown, a?: number, b?: number) => void;
  const oWC = simApi.waterCheck as (this: unknown) => void;
  let wcN = 0;
  let stBox = { st };
  (simApi as { quickWater: unknown }).quickWater = function (this: unknown, a?: number, b?: number) {
    oQW.call(this, a, b);
    snap('post-quickWater');
  };
  (simApi as { waterCheck: unknown }).waterCheck = function (this: unknown) {
    oWC.call(this);
    wcN++;
    if (wcN <= 3) snap(`post-WC#${wcN}`);
  };
  void stBox; stBox = { st };
  const solid = snapshotGenSolid();
  restoreGenSolid(solid);
  const world = new World(W, H, 9293480, 'm49c', true);
  world.store = st;
  world.shimmerX = 3966; world.shimmerY = 724;
  world.genWaterLine = 867;
  world.genDungeonExempt = { x0: 210, y0: 347, x1: 1890, y1: 990 };
  try {
    await settleWorldLiquids(world, 'gen', undefined, new RNG(9293480));
  } finally {
    (simApi as { quickWater: unknown }).quickWater = oQW;
    (simApi as { waterCheck: unknown }).waterCheck = oWC;
  }
  snap('final');
  for (const line of log) console.log(line);
  // 邻域环境：golden48 这些格上下左右
  for (const [x, y] of [[2756, 661], [2512, 725], [2531, 855], [2708, 855], [2700, 857]]) {
    const row: string[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      const r: string[] = [];
      for (let dx = -1; dx <= 2; dx++) {
        const i = (y + dy) * W + (x + dx);
        r.push(`${a48[i] ? t48[i] : '·'}/${l48[i]}${l48[i] ? lt48[i] : ''}`);
      }
      row.push(r.join(' '));
    }
    console.log(`(${x},${y}) golden48 邻域(x-1..x+2, y-2..y+2):\n  ${row.join('\n  ')}`);
  }
}, 580_000);
