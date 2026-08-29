// IIII48 仪J：隔离 runCavesPass 的 RockLayer 段全流捕获 → 与 rig/v0 流对位分解。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runCavesPass } from '../src/world/gen/vanilla/CavesPass';

const RUN = process.env.SW_I48J === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const SEED = 1138154190;

function rd16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1);
}
const rd8 = (p: string) => new Uint8Array(readFileSync(p));

(RUN ? it : it.skip)('i48j rocklayer full stream', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  const BYSHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') {
      SHEET[i] = s;
      if (!BYSHEET.has(s)) BYSHEET.set(s, i);
    }
  }
  const st = new TileStore(W, H);
  const t0 = rd16(`${G2}/010_Small_Holes.typ`);
  const a0 = rd8(`${G2}/010_Small_Holes.act`);
  for (let i = 0; i < N; i++) { st.type[i] = BYSHEET.get(t0[i]) ?? 0; st.flags[i] = a0[i] ? 1 : 0; }

  const rng = new RNG(SEED);
  const gs = {
    seed: SEED, seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    remixSurfaceLayerLow: 700, remixSurfaceLayerHigh: 850,
    beachDistance: 380, beachLeftEnd: 376, beachRightStart: 3873,
    undergroundDesert: null,
  } as never as Parameters<typeof runCavesPass>[2];

  // 全程捕获
  const cap: number[] = [];
  const g = globalThis as { __swOnRoll?: (v: number) => void };
  g.__swOnRoll = (v) => cap.push(v);

  // 分段标记：reseed 钩记录位置
  const marks: Array<{ name: string; at: number }> = [];
  const oReseed = (RNG.prototype as unknown as Record<string, unknown>).reseed as (this: unknown, s: number) => void;
  let seq = 0;
  (RNG.prototype as unknown as Record<string, unknown>).reseed = function (this: unknown, s: number) {
    seq++;
    marks.push({ name: ['pre(pass-head)', 'postDirtLayer/RockLayerHead', 'RockLayerEnd/SurfaceHead'][seq - 1] ?? `r${seq}`, at: cap.length });
    return oReseed.call(this, s);
  };

  runCavesPass(st, rng, gs);
  delete g.__swOnRoll;
  console.log(`captured=${cap.length}`);
  for (const m of marks) console.log(`mark ${m.name} @${m.at}`);

  const loadStream = (p: string): Int32Array => {
    const out: number[] = [];
    for (const l of readFileSync(p, 'utf8').split('\n')) {
      const s2 = l.trim(); if (!s2 || s2.startsWith('-')) continue;
      out.push(Number(s2));
    }
    return Int32Array.from(out);
  };
  const rigS = loadStream('/tmp/iii45-out/rollwin-rig-p12.txt');
  const p12seg = cap.slice(marks[1].at, marks[2].at);  // RockLayer 段
  console.log(`p12 seg len=${p12seg.length} (rig ${rigS.length})`);
  let k = 0;
  const kk = Math.min(p12seg.length, rigS.length);
  while (k < kk && p12seg[k] === rigS[k]) k++;
  console.log(`JS-p12 ∩ rig prefix=${k}`);
  // 在切点处的上下文
  console.log('--- JS cut context (rig side continues) ---');
  for (let i = Math.max(0, k - 3); i < Math.min(rigS.length, k + 10); i++) {
    const a = i < p12seg.length ? String(p12seg[i]) : '—';
    const b = String(rigS[i]);
    console.log(String(i).padStart(9), a.padEnd(11), b.padEnd(11), Number(a) === Number(b) ? '' : '<==');
  }
  writeFileSync('/tmp/iii51-out/js-p12-isolated.txt', p12seg.join('\n'));
}, 900_000);
