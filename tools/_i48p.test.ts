// IIII48 仪P：bound 变体严格互证——两独立流 + 逐段哈希，判定 (7,25)/(7,26) 是否真同流。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';

const RUN = process.env.SW_I48P === '1';

it.skipIf(!RUN)('i48p strict bound verification', async () => {
  const W = 4200, H = 1200;
  const SEED = 1138154190;
  const gs = {
    seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    beachDistance: 380,
    undergroundDesert: null,
  } as never;

  function run(boundHiExcl: number): Int32Array {
    const st = new TileStore(W, H);
    const rng = new RNG(SEED);
    const vals: number[] = [];
    const g = globalThis as { __swOnRoll?: (v: number) => void };
    g.__swOnRoll = (v) => vals.push(v);
    let num = Math.trunc(Math.trunc(W * H * 0.00013) * 1.1);
    for (let i = 0; i < num; i++) {
      const type = rng.nextInt(10) === 0 ? -2 : -1;
      const s2 = Math.trunc(rng.nextIntRange(6, 20) * 0.7);
      const s3 = Math.trunc(rng.nextIntRange(50, 300) * 0.7);
      const x = rng.nextIntRange(0, W);
      const y = rng.nextIntRange(769, H);
      tileRunner(st, rng, gs, x, y, { strength: s2, steps: s3, type });
    }
    num = Math.trunc(W * H * 0.00013 * 0.4);
    for (let j = 0; j < num; j++) {
      const c0 = vals.length;
      const type2 = rng.nextInt(10) === 0 ? -2 : -1;
      const q = rng.nextIntRange(7, boundHiExcl);
      const stp = rng.nextIntRange(50, 200);
      const spX = rng.nextIntRange(100, 221) * 0.1;
      const spY = rng.nextIntRange(-10, 11) * 0.02;
      const x2 = rng.nextIntRange(0, W);
      const y2 = rng.nextIntRange(769, H);
      tileRunner(st, rng, gs, x2, y2, { strength: q, steps: stp, type: type2, speedX: spX, speedY: spY, noYChange: true });
      const r1 = vals.length - c0 - 7;
      tileRunner(st, rng, gs, x2, y2, { strength: q, steps: stp, type: type2, speedX: -spX, speedY: -spY, noYChange: true });
      const r2 = vals.length - c0 - 7 - r1;
      if (j < 12) console.log(`[${boundHiExcl}] E${j}: q=${q} stp=${stp} spX=${spX.toFixed(1)} xy=(${x2},${y2}) r1=${r1} r2=${r2}`);
    }
    delete g.__swOnRoll;
    return Int32Array.from(vals);
  }

  const costLedger: Array<{ t: string; j?: number; cost: number }> = [];
  void costLedger;

  const A = run(26); // C# Next(7,26)
  const B = run(25); // 现行 JS nextIntRange(7,25)
  console.log(`A(len)=${A.length} B(len)=${B.length}`);
  {
    let k = 0; const kk = Math.min(A.length, B.length);
    while (k < kk && A[k] === B[k]) k++;
    console.log(`A/B mutual first-divergence at ${k} (of ${kk})`);
    // 抽查三处固定索引直值
    for (const probe of [2502411, 2502420, 2502430, 2502440, 2600000]) {
      console.log(`probe[${probe}]: A=${A[probe]} B=${B[probe]}`);
    }
    // 从分歧探测：向后扫首个差异（若存在）
    let d0 = 2502411;
    const kend = Math.min(A.length, B.length);
    while (d0 < kend && A[d0] === B[d0]) d0++;
    console.log(`scan-from-mainEnd first diff at ${d0}`);
    require('node:fs').writeFileSync('/tmp/iii51-out/pA.txt', A.join('\n'));
    require('node:fs').writeFileSync('/tmp/iii51-out/pB.txt', B.join('\n'));
    // 同对象判别
    const orig = A[12345];
    A[12345] = -7;
    const alias = B[12345] === -7;
    A[12345] = orig;
    console.log(`alias check: B mirrors A write => ${alias}`);
    for (let z = Math.max(0, k - 3); z < Math.min(kk, k + 5); z++) console.log(`  ${z}: A=${A[z]} B=${B[z]}${A[z] === B[z] ? '' : ' <=='}`);
  }
  const blockHash = (arr: Int32Array, lo: number, hi: number) =>
    createHash('md5').update(Buffer.from(arr.buffer, arr.byteOffset + lo * 4, (hi - lo) * 4)).digest('hex').slice(0, 8);
  const blk = 500_000;
  for (let z = 0; z < Math.min(A.length, B.length); z += blk) {
    const hi = Math.min(z + blk, A.length, B.length);
    const ha = blockHash(A, z, hi), hb = blockHash(B, z, hi);
    console.log(`[${String(z).padStart(8)},${hi}) A=${ha} B=${hb} ${ha === hb ? '' : '<== DIFFER'}`);
    if (ha !== hb) {
      let k = z;
      while (k < hi && A[k] === B[k]) k++;
      console.log(`first diff within block at ${k}: A=${A[k]} B=${B[k]}`);
      break;
    }
  }
}, 600_000);
