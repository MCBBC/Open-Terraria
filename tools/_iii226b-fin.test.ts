import { it } from 'vitest';
import { appendFileSync, rmSync } from 'node:fs';
const RUN = process.env.SW_I226Z === '1';
const TILE_DEFS_CACHE = 0;
(RUN ? it : it.skip)('fin', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { TrackGenerator } = await import('../src/world/gen/vanilla/TrackPass');
  const { RNG } = await import('../src/core/rng');
  const W = 4200, H = 1200;
  rmSync('/tmp/iii226b-out/fin.log', { force: true });
  const log = (s: string) => appendFileSync('/tmp/iii226b-out/fin.log', s + '\n');
  let cap: Record<string, unknown> | null = null;
  g.__swSeg = (name: unknown, detail?: unknown) => {
    if (name !== 'mbTrack' || cap) return;
    const d = detail as { st: InstanceType<typeof TileStore>; rng: RNG; gs: Record<string, unknown>; chests: unknown };
    const ur = (d.rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    cap = { seedArray: new Int32Array(ur.seedArray), inext: ur.inext, gs: d.gs, chests: d.chests, st: d.st };
  };
  try { await generateWorld({ width: W, height: H, seedText: 'nightofthelivingdead|20260903', evil: 0 as -1|0|1, seedFlags: { graveyardBloodmoonStart: true } }); }
  finally { g.__swSeg = undefined; }
  const c = cap as never as { seedArray: Int32Array; inext: number; gs: Record<string, unknown>; chests: unknown };
  const mkRng = () => { const rng = new RNG(1); { const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur; ur.seedArray.set(c.seedArray); ur.inext = c.inext; } return rng; };
  const raw = (rng: RNG, n: number) => { const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur; for (let i = 0; i < n; i++) ur.internalSample(); };
  // 直接扫:vanilla STRK-count 抽位 = captured + 5954 + 2 + C2_van;C2_van = 2560 + e (e=L2 的规则增掷 0..9)
  // 而 C2_js 未知——改扫绝对位 pos ∈ [5956+2550 .. 5956+2620]
  for (let pos = 5956 + 2540; pos <= 5956 + 2640; pos += 1) {
    const rng = mkRng();
    raw(rng, pos);
    const areaScale = (W * H) / 5040000;
    const sc = rng.int(Math.max(1, Math.trunc(areaScale * 4)), Math.max(1, Math.trunc(areaScale * 7)));
    const pairs: string[] = [];
    for (let a = 1; a <= 260; a++) {
      const sx = rng.int(10, 4189), sy = rng.int(337, 999);
      pairs.push(`${sx},${sy}`);
    }
    // 检查前 40 对里是否出现端点 ox 集
    const T = new Set<number>();
    for (const b of [2506, 3069, 3478, 1401, 2948, 1473]) for (let dx = -1; dx <= 1; dx++) T.add(b + dx);
    const early = pairs.slice(0, 60).findIndex((p) => T.has(Number(p.split(',')[0])));
    if (early >= 0 && early <= 40) log(`pos=${pos} sc=${sc} firstHit a=${early + 1} pair=(${pairs[early]})`);
  }
  log('fin done');
});
