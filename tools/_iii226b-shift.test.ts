// IIII226b 批 Δ 扫描仪 v2:定位 vanilla LTRK#1 PlacePath 的掷耗差 d = C'_van - C'_js。
// S0=attempts#1..#18 后流位;JS: +2 draws(origin) + C'_js(place) → P_js。
// vanilla: S0 + 2 + C'_js + d 处继续 LTRK 循环 → 其后首个 ox 命中 vanilla 轨端点集者
// 经 G2 列预检(ox 列 ±8 内有 314)后真 place() 验证 314 面 ⊆ G2。
// 用法: cd game && SW_I226S=1 SW_MB_1457=1 npx vitest run tools/_iii226b-shift.test.ts
import { it } from 'vitest';
import { writeFileSync, appendFileSync, rmSync, readFileSync } from 'node:fs';

const RUN = process.env.SW_I226S === '1';
const OUT = process.env.SW_I226S_OUT ?? '/tmp/iii226b-out';
const SEED = process.env.SW_I226S_SEED ?? 'nightofthelivingdead|20260903';
const DMIN = Number(process.env.SW_I226S_DMIN ?? -9000);
const DMAX = Number(process.env.SW_I226S_DMAX ?? 9000);

(RUN ? it : it.skip)('iii226b delta sweep v2', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { TrackGenerator } = await import('../src/world/gen/vanilla/TrackPass');
  const { RNG } = await import('../src/core/rng');

  const W = 4200, H = 1200, N = W * H;
  rmSync(`${OUT}/shift.log`, { force: true });
  const slog = (s: string) => appendFileSync(`${OUT}/shift.log`, s + '\n');

  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const TRACK_JS = (() => { for (let i = 0; i < TILE_DEFS.length; i++) if (SHEET[i] === 314) return i; return -1; })();

  let cap: Record<string, unknown> | null = null;
  g.__swSeg = (name: unknown, detail?: unknown) => {
    if (name !== 'mbTrack' || cap) return;
    const d = detail as { st: InstanceType<typeof TileStore>; rng: RNG; gs: Record<string, unknown>; chests: unknown };
    if (!d?.st) return;
    const s = d.st;
    const cp = (a: Uint8Array | Uint16Array) => new (a.constructor as typeof Uint8Array)(a);
    const stCopy: Record<string, unknown> = { w: s.w, h: s.h };
    for (const k of ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
      stCopy[k] = cp((s as unknown as Record<string, Uint8Array | Uint16Array>)[k]!);
    }
    const ur = (d.rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    const chCopy = ((d.chests as Array<Record<string, unknown> | null>) ?? []).map((ch) => ch ? {
      x: ch.x as number, y: ch.y as number,
      items: ((ch.items as Array<{ id: number; stack: number } | null>) ?? []).map((it) => (it ? { id: it.id, stack: it.stack } : null)),
    } : null);
    cap = { st: stCopy, seedArray: new Int32Array(ur.seedArray), inext: ur.inext, gs: d.gs, chests: chCopy };
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
      seedFlags: { graveyardBloodmoonStart: true },
    });
  } finally { g.__swSeg = undefined; }
  if (!cap) { slog('CAPTURE-FAILED'); return; }
  const c = cap as never as {
    st: Record<string, Uint8Array | Uint16Array | number>;
    seedArray: Int32Array; inext: number;
    gs: Record<string, unknown>; chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> } | null>;
  };

  const g2buf = readFileSync(`${process.env.HOME}/GoldenChains/golden-grvfix/097_Micro_Biomes.typ`);
  const g2typ = new Uint16Array(g2buf.buffer, g2buf.byteOffset, N);
  const g2Track = new Uint8Array(N);
  for (let i = 0; i < N; i++) g2Track[i] = g2typ[i] === 314 ? 1 : 0;
  // G2 每列 314 的 y 列表
  const g2ColY: Array<Array<number>> = Array.from({ length: W }, () => []);
  for (let i = 0; i < N; i++) if (g2typ[i] === 314) g2ColY[i % W]!.push((i / W) | 0);

  const mkStore = () => {
    const st = new TileStore(W, H);
    for (const k of ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
      const src = c.st[k] as Uint8Array | Uint16Array;
      (st as unknown as Record<string, unknown>)[k] = new (src.constructor as typeof Uint8Array)(src);
    }
    return st;
  };
  const mkRng = () => {
    const rng = new RNG(1);
    const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    ur.seedArray.set(c.seedArray); ur.inext = c.inext;
    return rng;
  };
  const gsReplay = c.gs as never;

  // S0 = longTrackCount 掷后流位;S1 = #18 次失败尝试后流位
  const rngA = mkRng();
  const trackCount = rngA.int(1, 2);
  const urA0 = (rngA as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
  const S0 = { seedArray: new Int32Array(urA0.seedArray), inext: urA0.inext };
  slog(`longTrackCount=${trackCount} (S0 inext=${S0.inext})`);
  const trackGenA = new TrackGenerator(mkStore(), gsReplay, c.chests);
  let tDone = 0, tFail = 0;
  for (let i = 0; i < 18; i++) {
    const ox = rngA.int(10, W - 11);
    const oy = rngA.int(Math.floor(c.gs.worldSurface as number), H - 201);
    const ok = trackGenA.place(ox, oy, 400, 1000, rngA);
    if (ok) { tDone++; tFail = 0; } else { tFail++; if (tFail > Math.floor(W / 2)) { tDone++; tFail = 0; } }
  }
  const urA = (rngA as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
  const S1 = { seedArray: new Int32Array(urA.seedArray), inext: urA.inext };
  slog(`S1 captured (inext=${S1.inext})`);

  // C_js:从 S0 起,attempt#19 draws + place 全部 raw draws
  const rngC = mkRng();
  {
    const ur = (rngC as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    ur.seedArray.set(S1.seedArray); ur.inext = S1.inext;
  }
  let drawsC = 0;
  const urC = (rngC as unknown as { ur: { seedArray: Int32Array; inext: number; internalSample: () => number } }).ur;
  const origSample = urC.internalSample;
  urC.internalSample = function (this: unknown) { drawsC++; return origSample.call(this); };
  const stC = mkStore();
  const trackGenC = new TrackGenerator(stC, gsReplay, c.chests);
  const c19x = rngC.int(10, W - 11), c19y = rngC.int(Math.floor(c.gs.worldSurface as number), H - 201);
  const ok19 = trackGenC.place(c19x, c19y, 400, 1000, rngC);
  urC.internalSample = origSample;
  slog(`attempt#19 = (${c19x},${c19y}) ok=${ok19 ? 1 : 0}; C_js total draws = ${drawsC}`);

  const TARGET_X = new Set<number>();
  for (const [a0, a1] of [[3370, 3480], [2425, 2440], [3060, 3075], [2940, 2955], [2500, 2510], [1395, 1410], [1465, 1480]] as Array<[number, number]>) {
    for (let x = a0; x <= a1; x++) TARGET_X.add(x);
  }
  const colHas = (x: number, pred: (y: number) => boolean): number => {
    for (const yy of g2ColY[x] ?? []) if (pred(yy)) return yy;
    return -9999;
  };
  const rawAdvance = (rng: RNG, n: number) => {
    const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
    for (let i = 0; i < n; i++) ur.internalSample();
  };
  let verifs = 0;
  const seenOrigin = new Set<string>();
  let matched = 0;
  for (let d = DMIN; d <= DMAX; d++) {
    const rng = mkRng();
    rawAdvance(rng, drawsC + d);
    for (let a = 0; a < 1200; a++) {
      const ox = rng.int(10, W - 11);
      const oy = rng.int(Math.floor(c.gs.worldSurface as number), H - 201);
      if (!TARGET_X.has(ox)) continue;
      // 结构预检:G2 列 ox 有 314 ∈ [oy-2..oy+80],且向巷道方向连续两列 ±1
      const y0 = colHas(ox, (yy) => yy >= oy - 2 && yy <= oy + 80);
      if (y0 === -9999) continue;
      const back = ox > 2100 ? ox - 1 : ox + 1;
      const y1 = colHas(back, (yy) => Math.abs(yy - y0) <= 1);
      if (y1 === -9999) continue;
      const back2 = ox > 2100 ? ox - 2 : ox + 2;
      const y2 = colHas(back2, (yy) => Math.abs(yy - y1) <= 1);
      if (y2 === -9999) continue;
      const okey = `${ox},${oy}`;
      if (seenOrigin.has(okey)) continue;
      seenOrigin.add(okey);
      verifs++;
      const st = mkStore();
      const trackGen = new TrackGenerator(st, gsReplay, c.chests);
      const ok = trackGen.place(ox, oy, 400, 1000, rng);
      if (!ok) { slog(`d=${d} a=${a} (${ox},${oy}) prehit place-FAILED`); continue; }
      // 列匹配率:每铺设列 my y ∈ G2 y-set(x)
      let colTot = 0, colHit = 0, tot = 0, inG2 = 0;
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) {
          const i = y * W + x;
          if (st.type[i] !== TRACK_JS) continue;
          tot++; if (g2Track[i]) inG2++;
        }
      }
      for (const yy of g2ColY) void yy;
      for (let x = 0; x < W; x++) {
        let mine = -1;
        for (let y = 300; y < 1050; y++) if (st.type[y * W + x] === TRACK_JS) { mine = y; break; }
        if (mine < 0) continue;
        colTot++;
        if (g2ColY[x]!.some((yy) => Math.abs(yy - mine) <= 2)) colHit++;
      }
      const pct = colTot ? Math.round((colHit / colTot) * 100) : 0;
      slog(`d=${d} a=${a} origin=(${ox},${oy}) cells=${tot} inG2=${tot ? Math.round((inG2 / tot) * 100) : 0}% colMatch=${pct}%`);
      if (pct >= 90) { slog(`*** MATCH d=${d} origin=(${ox},${oy}) colMatch=${pct}% ***`); matched++; }
      if (verifs > 400 || matched > 0) { break; }
    }
    if (verifs > 400 || matched > 0) break;
  }
  slog(`sweep done verifs=${verifs} matched=${matched}`);
});
