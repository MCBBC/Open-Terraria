// IIII226b STRK 段判定:在 δ+2a*=3451 框架下,于 S1+5915+2+C2_van 抽 STRK-count 与
// STRK origin 序,扫 C2_van−C2_js ∈ [0..80] 使首个 origin ox 命中 vanilla STRK 端点集。
import { it } from 'vitest';
import { appendFileSync, rmSync, readFileSync } from 'node:fs';
const RUN = process.env.SW_I226T === '1';
(RUN ? it : it.skip)('iii226b strk anchor', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { TrackGenerator } = await import('../src/world/gen/vanilla/TrackPass');
  const { RNG } = await import('../src/core/rng');
  const W = 4200, H = 1200, N = W * H;
  rmSync('/tmp/iii226b-out/strk.log', { force: true });
  const log = (s: string) => appendFileSync('/tmp/iii226b-out/strk.log', s + '\n');
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  const TRACK_JS = (() => { for (let i = 0; i < TILE_DEFS.length; i++) if (SHEET[i] === 314) return i; return -1; })();
  let cap: Record<string, unknown> | null = null;
  g.__swSeg = (name: unknown, detail?: unknown) => {
    if (name !== 'mbTrack' || cap) return;
    const d = detail as { st: InstanceType<typeof TileStore>; rng: RNG; gs: Record<string, unknown>; chests: unknown };
    const s = d.st;
    const cp = (a: Uint8Array | Uint16Array) => new (a.constructor as typeof Uint8Array)(a);
    const stCopy: Record<string, unknown> = { w: s.w, h: s.h };
    for (const k of ['type','flags','frameX','frameY','wall','liquid','liquidType','half','slope','wire','paint','paintWall','coat'] as const) stCopy[k] = cp((s as unknown as Record<string, Uint8Array | Uint16Array>)[k]!);
    const ur = (d.rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    cap = { st: stCopy, seedArray: new Int32Array(ur.seedArray), inext: ur.inext, gs: d.gs, chests: d.chests };
  };
  try { await generateWorld({ width: W, height: H, seedText: 'nightofthelivingdead|20260903', evil: 0 as -1|0|1, seedFlags: { graveyardBloodmoonStart: true } }); }
  finally { g.__swSeg = undefined; }
  const c = cap as never as { st: Record<string, Uint16Array | Uint8Array | number>; seedArray: Int32Array; inext: number; gs: Record<string, unknown>; chests: unknown };
  const g2buf = readFileSync(`${process.env.HOME}/GoldenChains/golden-grvfix/097_Micro_Biomes.typ`);
  const g2typ = new Uint16Array(g2buf.buffer, g2buf.byteOffset, N);
  const mkStore = () => { const st = new TileStore(W, H); for (const k of ['type','flags','frameX','frameY','wall','liquid','liquidType','half','slope','wire','paint','paintWall','coat'] as const) { const src = c.st[k] as Uint8Array | Uint16Array; (st as unknown as Record<string, unknown>)[k] = new (src.constructor as typeof Uint8Array)(src); } return st; };
  const mkRng = () => { const rng = new RNG(1); { const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur; ur.seedArray.set(c.seedArray); ur.inext = c.inext; } return rng; };
  const rawAdvance = (rng: RNG, n: number) => { const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur; for (let i = 0; i < n; i++) ur.internalSample(); };
  // C2_js:重放 #19 与 LTRK#2(3391,421),测 LTRK#2 place 的掷耗(从其 origin 两掷后起)
  const rngC = mkRng();
  rawAdvance(rngC, 5915);
  const o2x = rngC.int(10, 4189), o2y = rngC.int(337, 999);
  log(`draw@5915 = (${o2x},${o2y}) expect (3391,421)`);
  const tgC = new TrackGenerator(mkStore(), c.gs as never, c.chests as never);
  // LTRK#1 先铺(独立 store)
  const rngD = mkRng(); rawAdvance(rngD, 0);
  { const tD = rngD.int(1, 2); void tD; for (let a = 1; a <= 18; a++) { const ox = rngD.int(10, 4189), oy = rngD.int(337, 999); void ox; void oy; } const ox = rngD.int(10, 4189), oy = rngD.int(337, 999); tgC && 0; }
  // 直接在 stC 上:place LTRK#1(180,461) → place LTRK#2(3391,421) 计耗
  const stC = mkStore();
  const tgE = new TrackGenerator(stC, c.gs as never, c.chests as never);
  const e1 = tgE.place(180, 461, 400, 1000, new RNG(1));
  log(`place(180,461) ok=${e1 ? 1 : 0}`);
  let C2 = 0;
  { const ur = (rngC as unknown as { ur: { seedArray: Int32Array; inext: number; internalSample: () => number } }).ur; const os = ur.internalSample; ur.internalSample = function (this: unknown) { C2++; return os.call(this); };
    const ok2 = tgE.place(o2x, o2y, 400, 1000, rngC);
    ur.internalSample = os; log(`place(3391,421) ok=${ok2 ? 1 : 0} C2=${C2}`); }
  // 扫 dC2 = C2_van − C2_js ∈ [0..120]:流位 = 5915+2+C2+dC2 → STRK-count + attempts
  const TARGET = new Set<number>();
  for (const b of [2506, 3069, 3478, 1401, 2948, 1473]) for (let dx = -3; dx <= 3; dx++) TARGET.add(b + dx);
  const g2ColY: Array<Array<number>> = Array.from({ length: W }, () => []);
  for (let i = 0; i < N; i++) if (g2typ[i] === 314) g2ColY[i % W]!.push((i / W) | 0);
  for (let dC = 0; dC <= 120; dC++) {
    const rng = mkRng();
    rawAdvance(rng, 5915 + 2 + C2 + dC);
    const areaScale = (W * H) / 5040000;
    const sc = rng.int(Math.max(1, Math.trunc(areaScale * 4)), Math.max(1, Math.trunc(areaScale * 7)));
    const oks: string[] = [];
    for (let a = 1; a <= 400; a++) {
      const sx = rng.int(10, 4189), sy = rng.int(337, 999);
      if (!TARGET.has(sx)) continue;
      const ys = g2ColY[sx]!;
      if (!ys.some((yy) => yy >= sy - 2 && yy <= sy + 80)) continue;
      oks.push(`a=${a}(${sx},${sy})`);
      if (oks.length >= 3) break;
    }
    if (dC % 10 === 0 || oks.length) log(`dC=${dC} sc=${sc} cands=[${oks.join(' ')}]`);
  }
  log('strk scan done');
});
