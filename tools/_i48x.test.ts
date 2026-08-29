// IIII48 仪X：Jungle 隔离重放（入口=dump016）vs G2 dump017。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runJunglePass } from '../src/world/gen/vanilla/JunglePass';

const RUN = process.env.SW_I48X === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const SEED = 1138154190;

(RUN ? it : it.skip)('i48x jungle', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  const BYSHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') { SHEET[i] = s; if (!BYSHEET.has(s)) BYSHEET.set(s, i); }
  }
  const rd16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1); };
  const rd8 = (p: string) => new Uint8Array(readFileSync(p));
  const st = new TileStore(W, H);
  const files = ['016_Grass'] as const;
  for (const f of files) {
    const t = rd16(`${G2}/${f}.typ`), a = rd8(`${G2}/${f}.act`), wv = rd16(`${G2}/${f}.wal`),
      lq = rd8(`${G2}/${f}.liq`), lt = rd8(`${G2}/${f}.lty`), hf = rd8(`${G2}/${f}.half`), sl = rd8(`${G2}/${f}.slope`);
    for (let i = 0; i < N; i++) {
      st.type[i] = BYSHEET.get(t[i]) ?? 0;
      st.flags[i] = a[i] ? 1 : 0;
      st.wall[i] = wv[i]; st.liquid[i] = lq[i]; st.liquidType[i] = lt[i];
      st.half[i] = hf[i]; st.slope[i] = sl[i];
    }
  }
  let cur: TileStore | null = null;
  void cur;

  const rng = new RNG(SEED);
  const gs = {
    seed: SEED, seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    beachDistance: 380,
    beachLeftEnd: 376, beachRightStart: 3873,
    dungeonSide: 1 as 1 | -1,
    dungeonX: 2733,
    snowOriginLeft: 2608, snowOriginRight: 2861,
    undergroundDesert: null,
    jungleX: 1008,
  } as never as Parameters<typeof runJunglePass>[2];

  runJunglePass(st, rng, gs);

  const rt = rd16(`${G2}/017_Jungle.typ`);
  const ra = rd8(`${G2}/017_Jungle.act`);
  let dA = 0, dT = 0, fx = -1;
  const buckets = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const va = st.flags[i] & 1;
    const vt = va ? Math.max(0, SHEET[st.type[i]]) : 0;
    const ja = ra[i];
    const jt = ja ? rt[i] : 0;
    if (va !== ja || vt !== jt) {
      dA += va !== ja ? 1 : 0; dT += vt !== jt ? 1 : 0;
      if (fx < 0) fx = i;
      buckets.set(`act${va}>${ja}|${vt}>${jt}`, (buckets.get(`act${va}>${ja}|${vt}>${jt}`) ?? 0) + 1);
    }
  }
  // 变更格 bbox 统计（我方写出的域 vs 真值域）
  const pre = (() => { let mn = [9, 9], mx = [-9, -9]; return null; })();
  void pre;
  let bMinX = 99999, bMaxX = -1, bMinY = 99999, bMaxY = -1;
  {
    // 用与 pass 前的输入对比：重新读一份 dump016 快照统计我方改写区域
    const t16 = rd16(`${G2}/016_Grass.typ`); const a16 = rd8(`${G2}/016_Grass.act`);
    for (let i = 0; i < N; i++) {
      const va = st.flags[i] & 1; const ja = a16[i];
      const vt = va ? Math.max(0, SHEET[st.type[i]]) : 0;
      const jt = ja ? t16[i] : 0;
      if (va !== ja || vt !== jt) { const x2c = i % W, y2c = (i / W) | 0; if (x2c < bMinX) bMinX = x2c; if (x2c > bMaxX) bMaxX = x2c; if (y2c < bMinY) bMinY = y2c; if (y2c > bMaxY) bMaxY = y2c; }
    }
  }
  console.log(`my writes bbox: x[${bMinX},${bMaxX}] y[${bMinY},${bMaxY}]`);
  writeFileSync('/tmp/iii51-out/mine-jungle.typ', Buffer.from((() => {
    const o = new Uint16Array(N);
    for (let i = 0; i < N; i++) o[i] = (st.flags[i] & 1) ? Math.max(0, SHEET[st.type[i]]) : 0;
    return o.buffer;
  })()));
  writeFileSync('/tmp/iii51-out/mine-jungle.act', Buffer.from(Uint8Array.from(st.flags, (v) => v & 1)));
  console.log(`jungle: dAct=${dA} dTyp=${dT}${fx >= 0 ? ` first@(${fx % W},${Math.floor(fx / W)})` : ''}`);
  for (const [k, v] of [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log('  ', k.padEnd(18), '×', v);
}, 900_000);
