// IIII48 仪L：判定性实验——①verbatim 复制 REAL 源(含 (7,25))产流 vs rig；
// ②对照组 (7,26)。首分歧索引直接定罪。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';

const RUN = process.env.SW_I48L === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const SEED = 1138154190;

function rd16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1);
}
const rd8 = (p: string) => new Uint8Array(readFileSync(p));

(RUN ? it : it.skip)('i48l bound verdict', async () => {
  const BYSHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !BYSHEET.has(s)) BYSHEET.set(s, i);
  }
  const loadStream = (p: string): Int32Array => {
    const out: number[] = [];
    for (const l of readFileSync(p, 'utf8').split('\n')) {
      const s2 = l.trim(); if (!s2 || s2.startsWith('-')) continue;
      out.push(Number(s2));
    }
    return Int32Array.from(out);
  };
  const rigS = loadStream('/tmp/iii45-out/rollwin-rig-p12.txt');

  function segmentRun(boundLo: number, boundHi: number): Int32Array {
    const st = new TileStore(W, H);
    const t0 = rd16(`${G2}/010_Small_Holes.typ`);
    const a0 = rd8(`${G2}/010_Small_Holes.act`);
    void t0; void a0; // 流与状态无反馈（原子已证）——纯流跑即可
    const gs = {
      seedFlags: { remix: true },
      worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
      rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
      waterLine: 929, lavaLine: 418,
      genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
      beachDistance: 380,
      undergroundDesert: null,
    } as never;
    const rng = new RNG(SEED);
    const vals: number[] = [];
    const g = globalThis as { __swOnRoll?: (v: number) => void };
    g.__swOnRoll = (v) => vals.push(v);
    // 主循环
    let num = Math.trunc(Math.trunc(N * 0.00013) * 1.1);
    for (let i = 0; i < num; i++) {
      const type = rng.nextInt(10) === 0 ? -2 : -1;
      const s2 = Math.trunc(rng.nextIntRange(6, 20) * 0.7);
      const s3 = Math.trunc(rng.nextIntRange(50, 300) * 0.7);
      const x = rng.nextIntRange(0, W);
      const y = rng.nextIntRange(769, H);
      tileRunner(st, rng, gs, x, y, { strength: s2, steps: s3, type });
    }
    num = Math.trunc(N * 0.00013 * 0.4);
    let firstExtraCut = -1;
    for (let j = 0; j < num; j++) {
      const type2 = rng.nextInt(10) === 0 ? -2 : -1;
      const q = rng.nextIntRange(boundLo, boundHi);   // ★被试变量
      const stp = rng.nextIntRange(50, 200);
      const spX = rng.nextIntRange(100, 221) * 0.1;
      const spY = rng.nextIntRange(-10, 11) * 0.02;
      const x2 = rng.nextIntRange(0, W);
      const y2 = rng.nextIntRange(769, H);
      tileRunner(st, rng, gs, x2, y2, { strength: q, steps: stp, type: type2, speedX: spX, speedY: spY, noYChange: true });
      tileRunner(st, rng, gs, x2, y2, { strength: q, steps: stp, type: type2, speedX: -spX, speedY: -spY, noYChange: true });
      if (vals.length >= rigS.length && firstExtraCut < 0) firstExtraCut = j;
    }
    delete g.__swOnRoll;
    return Int32Array.from(vals.slice(0, Math.min(vals.length, rigS.length)));
  }

  const pref = (a: Int32Array, b: Int32Array) => {
    let k = 0; const kk = Math.min(a.length, b.length);
    while (k < kk && a[k] === b[k]) k++;
    return k;
  };

  const sA = segmentRun(7, 25);
  console.log(`bound Next(7,25): segTotal=${sA.length} prefixVsRig=${pref(sA, rigS)} (rig=${rigS.length})`);
  const sB = segmentRun(7, 26);
  console.log(`bound Next(7,26): segTotal=${sB.length} prefixVsRig=${pref(sB, rigS)} (rig=${rigS.length})`);
  // 两流互比
  let kv = 0; const kvm = Math.min(sA.length, sB.length);
  while (kv < kvm && sA[kv] === sB[kv]) kv++;
  console.log(`variant mutual divergence at ${kv}`);
  let nDiff = 0;
  const step = Math.max(1, Math.floor(kvm / 10));
  const marks: string[] = [];
  for (let z = 0; z < kvm; z += step) {
    nDiff = 0;
    for (let w2 = z; w2 < Math.min(kvm, z + step); w2++) if (sA[w2] !== sB[w2]) nDiff++;
    marks.push(`[${z},${z + step})Δ${nDiff}`);
  }
  console.log('mutual diff density:', marks.join(' '));
}, 900_000);
