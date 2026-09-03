// IIII226b 移位轨账扫描仪:对偶数 Δ_m(mahogany 树尾类掷移位假说)重放 vanilla 视角
// 的 LTRK 段:流=捕获态+Δ_m raw draws;tc 须=2;首成功轨=[180..1179](G2 带一致),
// 次成功轨新增 314 全落 G2 [2432..3391] 带内 → 记候选 Δ_m。
import { it } from 'vitest';
import { appendFileSync, rmSync, readFileSync } from 'node:fs';
const RUN = process.env.SW_I226M === '1';
(RUN ? it : it.skip)('iii226b shifted ledger scan', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { TrackGenerator } = await import('../src/world/gen/vanilla/TrackPass');
  const { RNG } = await import('../src/core/rng');
  const W = 4200, H = 1200, N = W * H;
  rmSync('/tmp/iii226b-out/scan.log', { force: true });
  const log = (s: string) => appendFileSync('/tmp/iii226b-out/scan.log', s + '\n');
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
  const DMIN = Number(process.env.SW_I226M_MIN ?? -100);
  const DMAX = Number(process.env.SW_I226M_MAX ?? 400);
  const hits: number[] = [];
  for (let dm = DMIN; dm <= DMAX; dm += 2) {
    const rng = new RNG(1);
    { const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur; ur.seedArray.set(c.seedArray); ur.inext = c.inext; }
    { const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur; for (let i = 0; i < dm; i++) ur.internalSample(); }
    const tc = rng.int(1, 2);
    if (tc !== 2) { continue; }
    const st = mkStore();
    const tg = new TrackGenerator(st, c.gs as never, c.chests as never);
    let done = 0, fail = 0, a = 0;
    const faces: Array<{ ox: number; oy: number; newCells: number; inG2: number }> = [];
    let ok = true;
    while (done < 2 && a < 2200) {
      const ox = rng.int(10, W - 11), oy = rng.int(Math.floor(c.gs.worldSurface as number), H - 201);
      a++;
      const before = new Uint8Array(N);
      for (let i = 0; i < N; i++) before[i] = st.type[i] === TRACK_JS ? 1 : 0;
      const okp = tg.place(ox, oy, 400, 1000, rng);
      if (okp) {
        let nc = 0, ig = 0;
        for (let i = 0; i < N; i++) {
          const now = st.type[i] === TRACK_JS ? 1 : 0;
          if (now && !before[i]) { nc++; if (g2typ[i] === 314) ig++; }
        }
        faces.push({ ox, oy, newCells: nc, inG2: nc ? Math.round(ig / nc * 100) : 100 });
        done++; fail = 0;
      } else { fail++; if (fail > W / 2) { done++; fail = 0; } }
    }
    if (done < 2 || faces.length < 2) { continue; }
    const f1 = faces[0]!, f2 = faces[1]!;
    // L1 判据:新增 314 全在 G2(100%)且 newCells≈1000;L2 判据:新增全在 G2 且 newCells≈960
    if (f1.inG2 === 100 && f1.newCells >= 990 && f2.inG2 >= 97 && f2.newCells >= 900) {
      hits.push(dm);
      log(`*** CANDIDATE dm=${dm}: L1=(${f1.ox},${f1.oy})+${f1.newCells}cells L2=(${f2.ox},${f2.oy})+${f2.newCells}cells inG2=${f2.inG2}% ***`);
    }
  }
  log(`scan done hits=[${hits.join(',')}]`);
});
