// IIII100f 仪④：全域 C* 扫描(v3)——金标长计数=2 假设:计数掷≠2 秒拒;
// 长轨双巷集合=={1754..2353/558..600(600), 1383..1861/772..897(479)} 才全尾+8通道对拍。
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG, UnifiedRandom } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { TrackGenerator } from '../src/world/gen/vanilla/TrackPass';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_I100FS === '1';
const OUT = '/tmp/iii225b-out';
const G2 = `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = 4200, H = 1200, N = W * H;
const CMIN = Number(process.env.SW_I100FS_CMIN ?? -17887);
const CMAX = Number(process.env.SW_I100FS_CMAX ?? 600);
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const u8 = (p: string): Uint8Array => { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.length); };
const GT = le16(`${G2}/097_Micro_Biomes.typ`), GA = u8(`${G2}/097_Micro_Biomes.act`);
const GW = le16(`${G2}/097_Micro_Biomes.wal`), GL = u8(`${G2}/097_Micro_Biomes.liq`);
const GHF = u8(`${G2}/097_Micro_Biomes.half`), GSL = u8(`${G2}/097_Micro_Biomes.slope`);
const GLT = u8(`${G2}/097_Micro_Biomes.lty`), GIA = u8(`${G2}/097_Micro_Biomes.inact`);

function cmp(st: TileStore): number {
  let d = 0;
  for (let i = 0; i < N; i++) {
    const va = GA[i]!, ja = st.flags[i]! & 1;
    if (va !== ja) { d++; continue; }
    const vt = va ? GT[i]! : 0;
    const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
    if (vt !== jt) { d++; continue; }
    if (GW[i]! !== st.wall[i]!) { d++; continue; }
    if (GL[i]! !== st.liquid[i]!) { d++; continue; }
    if (GHF[i]! !== st.half[i]! || GSL[i]! !== st.slope[i]!) { d++; continue; }
    const vl = GL[i]! > 0 ? GLT[i]! + 1 : 0;
    const jl = st.liquid[i]! > 0 ? st.liquidType[i]! : 0;
    if (vl !== jl) { d++; continue; }
    const via = GIA[i]! ? 1 : 0;
    if (via !== ((st.wire[i]! >>> 5) & 1)) d++;
  }
  return d;
}

type TA = Uint16Array | Uint8Array;
const ARRAYS = ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
const GOLD_LONG = new Set(['1754..2353/558..600', '1383..1861/772..897']);

(RUN ? it : it.skip)('iii100f v3 full-range scan (long-count=2 gate)', { timeout: 7_200_000 }, async () => {
  const g = globalThis as { __swSeg?: (name: string, detail?: unknown) => void; __swOnRoll?: (v: number, inst: object) => void };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: RNG, s: number) => void;
  let activeUr: UnifiedRandom | null = null; let activeCount = 0;
  RNGp.reseed = function (this: RNG, s: number) { const r = oReseed.call(this, s); activeUr = (this as unknown as { ur: UnifiedRandom }).ur; activeCount = 0; return r; };
  const oRoll = g.__swOnRoll;
  g.__swOnRoll = (v: number, inst: object) => { if (activeUr && inst === (activeUr as unknown as object)) activeCount++; oRoll?.(v, inst); };
  let cap: { st: TileStore; gs: GenState; chests: unknown[]; seed97: number; a0: number; snap: Record<string, TA> } | null = null;
  g.__swSeg = (name, detail) => {
    if (name !== 'mbTrack' || cap) return;
    const d = detail as { st: TileStore; rng: RNG; gs: GenState; chests?: unknown[] };
    const s: Record<string, TA> = {};
    for (const k of ARRAYS) s[k] = (d.st[k] as TA).slice();
    cap = { st: d.st, gs: d.gs, chests: d.chests ?? [], seed97: 9293480, a0: activeCount, snap: s };
    throw new Error('__ABORT__');
  };
  try {
    await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 as -1 | 0 | 1,
      seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true } } as Parameters<typeof generateWorld>[0]);
  } catch (e) { if (!(e instanceof Error) || e.message !== '__ABORT__') throw e; }
  g.__swSeg = undefined; g.__swOnRoll = oRoll; RNGp.reseed = oReseed;
  if (!cap) throw new Error('no cap');
  const S = cap;

  const lanesNow = (): string[] => {
    const st = S.st; const seen = new Uint8Array(N); const out: string[] = [];
    for (let i = 0; i < N; i++) {
      if (seen[i] || !(st.flags[i] & 1) || SHEET[st.type[i]!] !== 314) continue;
      const q = [i]; seen[i] = 1; let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, cnt = 0;
      while (q.length) { const j = q.pop()!; cnt++; const x = j % W, y = (j / W) | 0;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const k2 = ny * W + nx;
          if (!seen[k2] && (st.flags[k2] & 1) && SHEET[st.type[k2]!] === 314) { seen[k2] = 1; q.push(k2); } } }
      out.push(`${minx}..${maxx}/${miny}..${maxy}`);
    }
    return out;
  };

  const AMIN = Math.max(0, S.a0 + CMIN), AMAX = S.a0 + CMAX;
  const u = new UnifiedRandom(S.seed97);
  for (let i = 0; i < AMIN; i++) u.next();
  const base = { sa: (u as unknown as { seedArray: Int32Array }).seedArray.slice(), ix: (u as unknown as { inext: number }).inext };
  const setSt = (ur: UnifiedRandom, sa: Int32Array, ix: number): void => { (ur as unknown as { seedArray: Int32Array }).seedArray.set(sa); (ur as unknown as { inext: number }).inext = ix; };
  const rng = new RNG(1);
  (rng as unknown as { ur: UnifiedRandom }).ur = u;

  const lines: string[] = [];
  lines.push(`v3 scan C ∈ [${CMIN}..${CMAX}] A0=${S.a0}`);
  let verdict = 'NO-MATCH';
  let tested = 0;
  for (let c = CMIN; c <= CMAX; c++) {
    setSt(u, base.sa, base.ix);
    for (let i = 0; i < c - CMIN; i++) u.next();
    // 计数掷(1 样本)
    const w = S.st.w, h = S.st.h;
    const scW = (v: number): number => Math.trunc((w / 4200) * v);
    const areaScale = (w * h) / 5040000;
    const lc = rng.int(scW(1), scW(2));
    if (lc !== 2) continue;   // 计数门:金标长轨=2 假设
    tested++;
    for (const k of ARRAYS) (S.st[k] as TA).set(S.snap[k]);
    // 全量重放到本候选(计数掷已耗1)——直接跑长轨段
    const gs = S.gs;
    const trackGen = new TrackGenerator(S.st, gs, S.chests as never);
    const trackFailLimit = Math.floor(w / 2);
    let tDone = 0, tFail = 0;
    while (tDone < 2) {
      const ox = rng.int(10, w - 11);
      const oy = rng.int(Math.floor(gs.worldSurface), h - 201);
      const okL = trackGen.place(ox, oy, scW(400), scW(1000), rng);
      if (okL) { tDone++; tFail = 0; } else { tFail++; if (tFail > trackFailLimit) { tDone++; tFail = 0; } }
    }
    const ln = lanesNow();
    const okSet = ln.length === 2 && GOLD_LONG.has(ln[0]!) && GOLD_LONG.has(ln[1]!);
    if (okSet) {
      lines.push(`★ C=${c} long lanes match: ${ln.join(' ')} — 全尾验证…`);
      // 续跑 std 段+lava+flip
      let trackCount = rng.int(Math.max(1, Math.trunc(areaScale * 4)), Math.max(1, Math.trunc(areaScale * 7)));
      let sDone = 0, sFail = 0;
      while (sDone < trackCount) {
        const ox = rng.int(10, w - 11);
        const oy = rng.int(Math.floor(gs.worldSurface), h - 201);
        const okS = trackGen.place(ox, oy, scW(150), scW(300), rng);
        if (okS) { sDone++; sFail = 0; } else { sFail++; if (sFail > trackFailLimit) { sDone++; sFail = 0; } }
      }
      if (gs.seedFlags.getGoodWorld) flipGenSolid([56], false);
      const d = cmp(S.st);
      lines.push(`   full-tail diff=${d}`);
      if (d === 0) { verdict = `MATCH-AT-C=${c}`; break; }
    }
    if (tested % 500 === 0) lines.push(`… progress C=${c} tested=${tested}`);
  }
  lines.push(`VERDICT: ${verdict} tested(L2)=${tested}`);
  writeFileSync(`${OUT}/scan2-100f.txt`, lines.join('\n') + '\n');
});
