// IIII100d 微观复演仪：基座 dump#27_Webs 装载 → 单跑 UW-body 的 QuickWater(-2)
//   段（仅此一段），观察液杀级联（KT）与三格 cave-deco 存活状态。
// 用法：cd game && SW_III118MICRO=1 npx vitest run tools/_iii118micro.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const RUN = process.env.SW_III118MICRO === '1';
const G2 = process.env.SW_III87_G2 ?? '/tmp/iii85-out/x86-gfb-c';
const SEED = Number(process.env.SW_III87_SEED ?? '9293480');
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}

(RUN ? it : it.skip)('IIII100d micro UW quickwater kill repro', async () => {
  const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer.slice(0));
  const rd = (p: string) => readFileSync(p);
  const pre = `${G2}/027_Webs`;
  const c = {
    t: le16(`${pre}.typ`), a: rd(`${pre}.act`), w: le16(`${pre}.wal`), l: rd(`${pre}.liq`),
    hf: rd(`${pre}.half`), sl: rd(`${pre}.slope`), lt: rd(`${pre}.lty`), ia: rd(`${pre}.inact`),
    frx: le16(`${pre}.frx`), fry: le16(`${pre}.fry`),
  };
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(c.t[i]) ?? 0;
    st.flags[i] = c.a[i] ? 1 : 0;
    st.wall[i] = c.w[i];
    st.liquid[i] = c.l[i];
    st.liquidType[i] = c.l[i] > 0 ? c.lt[i] + 1 : 0;
    st.half[i] = c.hf[i];
    st.slope[i] = c.sl[i];
    st.frameX[i] = c.frx[i];
    st.frameY[i] = c.fry[i];
    if (c.ia[i]) st.wire[i] |= 32;
  }
  const IO = (x: number, y: number) => {
    const i = st.idx(x, y);
    return `${x},${y}:t${SHEET[st.type[i]]}/a${st.flags[i] & 1} l${st.liquid[i]} ty${st.liquidType[i]} f${st.frameX[i]}/${st.frameY[i]}`;
  };
  console.log('[before]', [IO(1680, 732), IO(1681, 732), IO(1682, 732), IO(1681, 731), IO(1682, 730), IO(1682, 731)].join(' | '));

  // KT 探针：直接注册到生产钩（__swLqKill=gen 击杀；__sw118Kt 分发探针）
  const kills: string[] = [];
  (globalThis as unknown as { __swLqKill?: unknown }).__swLqKill =
    (x: number, y: number, sheet: number) => kills.push(`genKill ${x},${y} t${sheet}`);
  (globalThis as unknown as { __sw118Kt?: ((tag: string, x: number, y: number) => void) | undefined }).__sw118Kt =
    (tag, x, y) => { if (x >= 1650 && x <= 1710 && y >= 690 && y <= 770) kills.push(`dispatch ${tag} ${x},${y}`); };

  const sim = new LiquidSim({ store: st, seed: SEED } as never);
  // ★IIIII100d 复验臂：passRng 接线（与 settleWorldLiquids 同口径）——缺此=级联
  //   帧引擎 ctx.rng=null → TileFrameImportant case165（CheckStalactite）整支跳过
  const passRng118 = new RNG(Number(process.env.SW_III87_SEED ?? '9293480'));
  sim.passRand = (max: number) => passRng118.nextInt(max);
  sim.passRng = passRng118;
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = true;
  sim.genWaterLine = 254;
  // REMIX 分型带接线（与 UnderworldPass 内一致口径）
  sim.remixWaterRule = true;
  sim.remixLavaLine = 472;
  sim.remixRockLevel = 835;
  sim.remixOceanLevel = (361 + 835) / 2 + 40;
  sim.remixWorldGen = true;
  sim.dualDungeonsSeed = false;

  sim.quickWater();

  console.log('[after ]', [IO(1680, 732), IO(1681, 732), IO(1682, 732), IO(1681, 731), IO(1682, 730), IO(1682, 731)].join(' | '));
  console.log('[kills in box]', kills.length ? kills.join(' ; ') : '(none)');
}, 600_000);
