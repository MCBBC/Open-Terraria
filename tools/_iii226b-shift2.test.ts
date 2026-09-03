// IIII226b phase-2:在 d=1092 锚上重放 LTRK#2(origin (3391,421)),测其掷耗 C2_js,
// 再扫 Δ2 = C'_van(LTRK#2) - C2_js,使后续流位首个 STRK-origin 命中 vanilla STRK 端点集。
import { it } from 'vitest';
import { writeFileSync, appendFileSync, rmSync, readFileSync } from 'node:fs';
const RUN = process.env.SW_I226P2 === '1';
const OUT = '/tmp/iii226b-out';
(RUN ? it : it.skip)('iii226b delta2 sweep', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { TrackGenerator } = await import('../src/world/gen/vanilla/TrackPass');
  const { RNG } = await import('../src/core/rng');
  const W = 4200, H = 1200, N = W * H;
  rmSync(`${OUT}/shift2.log`, { force: true });
  const slog = (s: string) => appendFileSync(`${OUT}/shift2.log`, s + '\n');
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
  const g2ColY: Array<Array<number>> = Array.from({ length: W }, () => []);
  for (let i = 0; i < N; i++) if (g2typ[i] === 314) g2ColY[i % W]!.push((i / W) | 0);
  const mkStore = () => {
    const st = new TileStore(W, H);
    for (const k of ['type','flags','frameX','frameY','wall','liquid','liquidType','half','slope','wire','paint','paintWall','coat'] as const) {
      const src = c.st[k] as Uint8Array | Uint16Array;
      (st as unknown as Record<string, unknown>)[k] = new (src.constructor as typeof Uint8Array)(src);
    }
    return st;
  };
  const mkRng = () => { const rng = new RNG(1); const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur; ur.seedArray.set(c.seedArray); ur.inext = c.inext; return rng; };
  const gsReplay = c.gs as never;
  const rawAdvance = (rng: RNG, n: number) => { const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur; for (let i = 0; i < n; i++) ur.internalSample(); };
  // 基线:S0( trackCount 后) → 18 败笔 → #19 ok(测 C_js) → +d1092 → LTRK#2 (3391,421)
  const rngA = mkRng();
  const tc = rngA.int(1, 2);
  const tgA = new TrackGenerator(mkStore(), gsReplay, c.chests);
  let done = 0, fail = 0;
  for (let i = 0; i < 18; i++) {
    const ox = rngA.int(10, W - 11), oy = rngA.int(Math.floor(c.gs.worldSurface as number), H - 201);
    const ok = tgA.place(ox, oy, 400, 1000, rngA);
    if (ok) { done++; fail = 0; } else { fail++; if (fail > W / 2) { done++; fail = 0; } }
  }
  const urA = (rngA as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
  const S1 = { sa: new Int32Array(urA.seedArray), in: urA.inext };
  const rngB = mkRng();
  { const ur = (rngB as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur; ur.seedArray.set(S1.sa); ur.inext = S1.in; }
  let drawsC = 0;
  const urB = (rngB as unknown as { ur: { seedArray: Int32Array; inext: number; internalSample: () => number } }).ur;
  const os0 = urB.internalSample;
  urB.internalSample = function (this: unknown) { drawsC++; return os0.call(this); };
  const tgB = new TrackGenerator(mkStore(), gsReplay, c.chests);
  const o19x = rngB.int(10, W - 11), o19y = rngB.int(Math.floor(c.gs.worldSurface as number), H - 201);
  tgB.place(o19x, o19y, 400, 1000, rngB);
  urB.internalSample = os0;
  slog(`#19=(${o19x},${o19y}) C_js=${drawsC}`);
  // LTRK#2 at d=1092: 先真 place(3391,421) 测 C2_js(须 ok)
  const rngC = mkRng();
  rawAdvance(rngC, drawsC + 1092 + 1199 * 2);
  const o2x = rngC.int(10, W - 11), o2y = rngC.int(Math.floor(c.gs.worldSurface as number), H - 201);
  slog(`d=1092 a=1199 draw = (${o2x},${o2y}) (expect 3391,421)`);
  let C2 = 0;
  {
    const ur = (rngC as unknown as { ur: { seedArray: Int32Array; inext: number; internalSample: () => number } }).ur;
    const os = ur.internalSample;
    ur.internalSample = function (this: unknown) { C2++; return os.call(this); };
    // 注意:上一步 origin 两掷已耗,补测 place 全耗需从 origin 前快照——此处直接在当前流位 place
    const tgC = new TrackGenerator(mkStore(), gsReplay, c.chests);
    const ok2 = tgC.place(o2x, o2y, 400, 1000, rngC);
    ur.internalSample = os;
    slog(`place(${o2x},${o2y}) ok=${ok2 ? 1 : 0} C2_place=${C2}`);
    if (!ok2) { slog('ABORT: anchor place failed'); return; }
  }
  // Δ2 扫描:从 place#19+2 draws+1092 处(即 LTRK#2 origin 掷前)重演:origin 掷(2)+C2+Δ2 → STRK-count 掷 → STRK draws
  const TARGET = new Set<number>();
  for (const base of [2506, 3069, 3478, 1401, 2948, 1473]) for (let dx = -3; dx <= 3; dx++) TARGET.add(base + dx);
  let verifs = 0; const seen = new Set<string>();
  for (let d2 = 0; d2 <= 12000; d2++) {
    const rng = mkRng();
    rawAdvance(rng, drawsC + 1092 + 1199 * 2 + 2 + C2 + d2);
    // STRK-count 掷 + STRK draws
    // STRK-count 掷 + STRK attempts
    const areaScale = (W * H) / 5040000;
    const sc = rng.int(Math.max(1, Math.trunc(areaScale * 4)), Math.max(1, Math.trunc(areaScale * 7)));
    if (d2 % 500 === 0) slog(`d2=${d2} stdTrackCount=${sc}`);
    for (let a = 0; a < 400; a++) {
      const sx = rng.int(10, W - 11), sy = rng.int(Math.floor(c.gs.worldSurface as number), H - 201);
      if (!TARGET.has(sx)) continue;
      const ys = g2ColY[sx]!;
      if (!ys.some((yy) => yy >= sy - 2 && yy <= sy + 80)) continue;
      const okey = `${sx},${sy}`;
      if (seen.has(okey)) continue;
      seen.add(okey); verifs++;
      const st = mkStore();
      // 需要带 LTRK#1+#2 的世界——重放到该状态:在独立 store 上顺序 place
      const tg = new TrackGenerator(st, gsReplay, c.chests);
      const okL1 = tg.place(o19x, o19y, 400, 1000, new RNG(1));
      const okL2 = tg.place(o2x, o2y, 400, 1000, new RNG(1));
      void okL1; void okL2;
      const okS = tg.place(sx, sy, 150, 300, rng);
      let tot = 0, inG2 = 0;
      for (let i = 0; i < N; i++) if (st.type[i] === TRACK_JS) { tot++; if (g2typ[i] === 314) inG2++; }
      slog(`d2=${d2} a=${a} origin=(${sx},${sy}) ok=${okS ? 1 : 0} cells=${tot} inG2=${tot ? Math.round((inG2 / tot) * 100) : 0}%`);
      if (tot && inG2 / tot > 0.85) slog(`*** d2=${d2} STRK-HIT (${sx},${sy}) ***`);
      if (verifs > 200) break;
    }
    if (verifs > 200) break;
  }
  slog(`phase2 done verifs=${verifs}`);
});
