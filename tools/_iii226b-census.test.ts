import { it } from 'vitest';
import { writeFileSync, appendFileSync, rmSync } from 'node:fs';
const RUN = process.env.SW_I226C === '1';
const OUT = '/tmp/iii226b-out';
(RUN ? it : it.skip)('iii226b lane census', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { TrackGenerator, __setTrackStepProbe } = await import('../src/world/gen/vanilla/TrackPass');
  const { RNG } = await import('../src/core/rng');
  const W = 4200, H = 1200, N = W * H;
  rmSync(`${OUT}/census.log`, { force: true });
  const log = (s: string) => appendFileSync(`${OUT}/census.log`, s + '\n');
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
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
  try {
    await generateWorld({ width: W, height: H, seedText: 'nightofthelivingdead|20260903', evil: 0 as -1|0|1, seedFlags: { graveyardBloodmoonStart: true } });
  } finally { g.__swSeg = undefined; }
  const c = cap as never as { st: Record<string, Uint16Array | Uint8Array | number>; seedArray: Int32Array; inext: number; gs: Record<string, unknown>; chests: unknown };
  const st = new TileStore(W, H);
  for (const k of ['type','flags','frameX','frameY','wall','liquid','liquidType','half','slope','wire','paint','paintWall','coat'] as const) {
    const src = c.st[k] as Uint8Array | Uint16Array;
    (st as unknown as Record<string, unknown>)[k] = new (src.constructor as typeof Uint8Array)(src);
  }
  const rng = new RNG(1);
  { const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur; ur.seedArray.set(c.seedArray); ur.inext = c.inext; }
  // 巷内格普查:用 step probe(loop1)记录每列的 playerHeight 与 y,然后读原 store
  const lanes: Array<{ x: number; y: number; ph: number }> = [];
  __setTrackStepProbe((loop, k, x, y, ph) => { if (loop === 1) lanes[k] = { x, y, ph }; });
  const trackGen = new TrackGenerator(st, c.gs as never, c.chests as never);
  const tc = rng.int(1, 2);
  let done = 0, fail = 0;
  while (done < tc) {
    const ox = rng.int(10, W - 11); const oy = rng.int(Math.floor((c.gs.worldSurface as number)), H - 201);
    const ok = trackGen.place(ox, oy, 400, 1000, rng);
    if (ok) { done++; fail = 0; } else { fail++; if (fail > W / 2) { done++; fail = 0; } }
    if (done >= 1) break;
  }
  __setTrackStepProbe(undefined);
  const tally = new Map<number, number>();
  const wallTally = new Map<number, number>();
  for (const l of lanes) {
    if (!l) continue;
    for (let j = 0; j < l.ph; j++) {
      const i = (l.y - j) * W + l.x;
      if (i < 0 || i >= N) continue;
      if (!(c.st.flags[i] as number)) continue;   // 原本就空=KillTile早退
      const sh = SHEET[c.st.type[i] as number] ?? -1;
      tally.set(sh, (tally.get(sh) ?? 0) + 1);
      const wl = c.st.wall[i] as number;
      wallTally.set(wl, (wallTally.get(wl) ?? 0) + 1);
    }
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  log(`lane killed-cells census (sheet,count): ${sorted.map(([s, n]) => `${s}x${n}`).join(' ')}`);
  log(`walls: ${[...wallTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, n]) => `${s}x${n}`).join(' ')}`);
  log(`total=${sorted.reduce((a, b) => a + b[1], 0)} (target gap=1092)`);
});
