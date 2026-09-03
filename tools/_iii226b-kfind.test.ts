import { it } from 'vitest';
import { appendFileSync, rmSync } from 'node:fs';
const RUN = process.env.SW_I226K === '1';
(RUN ? it : it.skip)('k-find', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const { TileStore } = await import('../src/world/TileStore');
  const { RNG } = await import('../src/core/rng');
  rmSync('/tmp/iii226b-out/k.log', { force: true });
  const log = (s: string) => appendFileSync('/tmp/iii226b-out/k.log', s + '\n');
  let cap: Record<string, unknown> | null = null;
  g.__swSeg = (name: unknown, detail?: unknown) => {
    if (name !== 'mbTrack' || cap) return;
    const d = detail as { rng: RNG };
    const ur = (d.rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    cap = { seedArray: new Int32Array(ur.seedArray), inext: ur.inext };
  };
  try { await generateWorld({ width: 4200, height: 1200, seedText: 'nightofthelivingdead|20260903', evil: 0 as -1|0|1, seedFlags: { graveyardBloodmoonStart: true } }); }
  finally { g.__swSeg = undefined; }
  const c = cap as never as { seedArray: Int32Array; inext: number };
  const rng = new RNG(1);
  { const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur; ur.seedArray.set(c.seedArray); ur.inext = c.inext; }
  const tc = rng.int(1, 2);
  log(`tc=${tc}`);
  // 从捕获态直接抽对:S1 前 18 对(=JS #1..#18)+ #19 对=(180,461) 校验,然后 P_k k=1..3000
  for (let a = 1; a <= 19; a++) { const ox = rng.int(10, 4189), oy = rng.int(337, 999); if (a === 19) log(`pair#19=(${ox},${oy}) expect (180,461)`); }
  // 原始掷滑窗:连续二元 (3391,421) 于任意相位
  const draws: number[] = [];
  const N2 = 12000;
  for (let i = 0; i < N2; i++) {
    const ur = (rng as unknown as { ur: { internalSample: () => number } }).ur;
    draws.push(ur.internalSample());
  }
  const { UnifiedRandomLike } = {} as never; void UnifiedRandomLike;
  // 以 internalSample 原值重建 Next(10,4190)/Next(337,1000):需要 Sample()=internalSample()*4.6566e-10
  log(`raw draws captured n=${draws.length}`);
  const hits: number[] = [];
  const S = (x: number) => x * 4.656612875245797e-10;
  for (let i = 0; i + 1 < N2; i++) {
    const ox = Math.trunc(S(draws[i]!) * 4180) + 10;
    const oy = Math.trunc(S(draws[i + 1]!) * 663) + 337;
    if (ox === 3391 && oy === 421) { hits.push(i); log(`raw HIT at draw-offset ${i} (pair start)`); }
  }
  log(`raw hits=[${hits.join(',')}] (offsets from S1, any phase)`);
  for (const h of hits) log(`offset ${h}: δ = h − 2a*, a* ≥ 16 → δ ≤ ${h - 32}; 对齐相位 h 偶=对齐,奇=滑相`);
});
