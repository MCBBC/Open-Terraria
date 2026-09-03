// IIII226b H1 端到端验证:Δ1=0 假设下,vanilla 的 LTRK#2 = attempt #1745(S1+2464+2×1745=S1+5954)。
// 重放:LTRK#1 place → 强制续跑 attempts(跳过 #35 (2124,690) 的 success)→ 验证 #1745=(3391,421)
// 且其 place 面对拍 G2 [2432..3391] 带。
import { it } from 'vitest';
import { appendFileSync, rmSync, readFileSync } from 'node:fs';
const RUN = process.env.SW_I226H === '1';
(RUN ? it : it.skip)('iii226b H1 ledger replay', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { TrackGenerator } = await import('../src/world/gen/vanilla/TrackPass');
  const { RNG } = await import('../src/core/rng');
  const W = 4200, H = 1200, N = W * H;
  rmSync('/tmp/iii226b-out/h1.log', { force: true });
  const log = (s: string) => appendFileSync('/tmp/iii226b-out/h1.log', s + '\n');
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
  const st = mkStore();
  const rng = new RNG(1);
  { const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur; ur.seedArray.set(c.seedArray); ur.inext = c.inext; }
  const tg = new TrackGenerator(st, c.gs as never, c.chests as never);
  const tc = rng.int(1, 2);
  log(`longTrackCount=${tc}`);
  // attempts 1..18 (fail) → 19 (LTRK#1 ok)
  for (let a = 1; a <= 18; a++) { const ox = rng.int(10, W - 11), oy = rng.int(Math.floor(c.gs.worldSurface as number), H - 201); const ok = tg.place(ox, oy, 400, 1000, rng); log(`#${a} ${ox},${oy} ok=${ok?1:0}`); if (ok) { log('EARLY SUCCESS — ABORT'); return; } }
  const o19x = rng.int(10, W - 11), o19y = rng.int(Math.floor(c.gs.worldSurface as number), H - 201);
  const ok19 = tg.place(o19x, o19y, 400, 1000, rng);
  log(`#19 ${o19x},${o19y} ok=${ok19?1:0} (expect 180,461 ok=1)`);
  if (!ok19) { log('ABORT'); return; }
  // 强制续跑到 #1745(跳过一切 success,含 #35)
  for (let a = 20; a <= 1764; a++) {
    const ox = rng.int(10, W - 11), oy = rng.int(Math.floor(c.gs.worldSurface as number), H - 201);
    if (a <= 52 || a % 200 === 0 || a === 1745 || a === 1764) log(`#${a} ${ox},${oy}`);
    if (a === 1764) {
      const ok2 = tg.place(ox, oy, 400, 1000, rng);
      let tot = 0, inG2 = 0;
      for (let i = 0; i < N; i++) if (st.type[i] === TRACK_JS) { tot++; if (g2typ[i] === 314) inG2++; }
      log(`#1764 ${ox},${oy} ok=${ok2?1:0} totalCells=${tot} inG2=${tot?Math.round(inG2/tot*100):0}%`);
      // 新增轨段(本次 place 的 314)范围
      const g2before = new Set<number>();
      void g2before;
      log(`expect origin=(3391,421) at #1764`);
    } else {
      tg.place(ox, oy, 400, 1000, rng); // 结果不计(vanilla 侧这些须 ok=0——JS 若 ok 会写轨!须检查)
    }
  }
  log('done');
});
