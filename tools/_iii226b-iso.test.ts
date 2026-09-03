import { it } from 'vitest';
import { readFileSync } from 'node:fs';
const RUN = process.env.SW_ISO === '1';
(RUN ? it : it.skip)('iso', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { TrackGenerator } = await import('../src/world/gen/vanilla/TrackPass');
  const { RNG } = await import('../src/core/rng');
  const W = 4200, H = 1200, N = W * H;
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
  const mk = () => { const st = new TileStore(W, H); for (const k of ['type','flags','frameX','frameY','wall','liquid','liquidType','half','slope','wire','paint','paintWall','coat'] as const) { const src = c.st[k] as Uint8Array | Uint16Array; (st as unknown as Record<string, unknown>)[k] = new (src.constructor as typeof Uint8Array)(src); } return st; };
  const g2buf = readFileSync(`${process.env.HOME}/GoldenChains/golden-grvfix/097_Micro_Biomes.typ`);
  const g2typ = new Uint16Array(g2buf.buffer, g2buf.byteOffset, N);
  const TRACK_JS = (() => { for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === 314) return i; return -1; })();
  const stat = (st: InstanceType<typeof TileStore>) => { let t = 0, ig = 0; for (let i = 0; i < N; i++) if (st.type[i] === TRACK_JS) { t++; if (g2typ[i] === 314) ig++; } return `${t}cells/inG2=${Math.round(ig / t * 100)}%`; };
  const A = mk(); const tgA = new TrackGenerator(A, c.gs as never, c.chests as never);
  console.log(`[A alone] (3391,421): ok=${tgA.place(3391, 421, 400, 1000, new RNG(1)) ? 1 : 0} ${stat(A)}`);
  const B = mk(); const tgB = new TrackGenerator(B, c.gs as never, c.chests as never);
  const ok1 = tgB.place(180, 461, 400, 1000, new RNG(1));
  console.log(`[B L1] (180,461): ok=${ok1 ? 1 : 0} ${stat(B)}`);
  console.log(`[B L1→L2] (3391,421): ok=${tgB.place(3391, 421, 400, 1000, new RNG(1)) ? 1 : 0} ${stat(B)}`);
});
