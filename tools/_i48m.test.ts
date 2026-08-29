// IIII48 仪N：状态通道二分——real runCavesPass 在「满 dump 状态」vs「空状态」vs
// 「去某通道」下的 pass12 段长与 rig 前缀。找出驱动 -476k 成本差的状态面。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runCavesPass } from '../src/world/gen/vanilla/CavesPass';

const RUN = process.env.SW_I48N === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const SEED = 1138154190;

function rd16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1);
}
const rd8 = (p: string) => new Uint8Array(readFileSync(p));

(RUN ? it : it.skip)('i48n state bisection', async () => {
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

  const gsMaker = () => ({
    seed: SEED, seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    remixSurfaceLayerLow: 700, remixSurfaceLayerHigh: 850,
    beachDistance: 380, beachLeftEnd: 376, beachRightStart: 3873,
    undergroundDesert: null,
  } as never);

  function runVariant(kind: string): Int32Array {
    const st = new TileStore(W, H);
    if (kind !== 'empty') {
      const t0 = rd16(`${G2}/010_Small_Holes.typ`);
      const a0 = rd8(`${G2}/010_Small_Holes.act`);
      for (let i = 0; i < N; i++) {
        st.type[i] = kind === 'noType' ? 0 : (BYSHEET.get(t0[i]) ?? 0);
        // act 通道：full/half 位；0 已保证 flags 仅 act
        st.flags[i] = (kind === 'noAct') ? 0 : (a0[i] ? 1 : 0);
        // 液体面：把非零 liquid 抹平（混合对照用）
      }
    }
    const rng = new RNG(SEED);
    const vals: number[] = [];
    const g = globalThis as { __swOnRoll?: (v: number) => void };
    g.__swOnRoll = (v) => vals.push(v);
    const marks: number[] = [];
    const oReseed = (RNG.prototype as unknown as Record<string, unknown>).reseed as (this: unknown, s: number) => void;
    let seq = 0;
    (RNG.prototype as unknown as Record<string, unknown>).reseed = function (this: unknown, s: number) {
      seq++;
      marks.push(vals.length);
      return oReseed.call(this, s);
    };
    runCavesPass(st, rng, gsMaker());
    delete g.__swOnRoll;
    (RNG.prototype as unknown as Record<string, unknown>).reseed = oReseed;
    console.log(`${kind.padEnd(9)} total=${vals.length} p12span=${marks.length >= 3 ? marks[2] - marks[1] : '?'}`);
    if (marks.length >= 3) {
      const seg = vals.slice(marks[1], marks[2]);
      let k = 0; const kk = Math.min(seg.length, rigS.length);
      while (k < kk && seg[k] === rigS[k]) k++;
      console.log(`   p12∩rig prefix=${k}`);
    }
    return Int32Array.from(marks[1] !== undefined ? vals.slice(marks[1], marks.length >= 3 ? marks[2] : vals.length) : []);
  }

  runVariant('empty');
  runVariant('full');
}, 900_000);
