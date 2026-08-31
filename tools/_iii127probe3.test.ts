// IIII101c-b 取证：wall 残差带（band）判定复算——diff 格上重放 canPaint/band 数学
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import * as snk from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I127P3 === '1';
const G2 = '/tmp/iii84-out/x86-i78-ddual';
const W = 4200, H = 1200;
function le16(p: string): Uint16Array {
  const b = readFileSync(p); const u = new Uint8Array(b.length); u.set(b);
  return new Uint16Array(u.buffer, u.byteOffset, b.length / 2);
}
function u8(p: string): Uint8Array {
  const b = readFileSync(p);
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
}
const pre = (idx: number, nm: string) => `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
const BYSHEET = new Int32Array(1024).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (s >= 0 && s < 1024 && BYSHEET[s] < 0) BYSHEET[s] = i; }
}
function xToSw(v: number): number {
  const m = v >= 1024 ? v & 255 : v;
  const hit = m < 1024 ? BYSHEET[m] : -1;
  if (hit >= 0) return hit;
  return v & 255;
}
function hydrate(idx: number, nm: string): TileStore {
  const st = new TileStore(W, H);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  const p = pre(idx, nm);
  const xt = le16(`${p}.typ`);
  const t = rec.type as Uint16Array;
  for (let i = 0; i < xt.length; i++) t[i] = xToSw(xt[i]!);
  (rec.flags as Uint8Array).set(u8(`${p}.act`));
  (rec.wall as Uint16Array).set(le16(`${p}.wal`));
  (rec.half as Uint8Array).set(u8(`${p}.half`));
  (rec.slope as Uint8Array).set(u8(`${p}.slope`));
  (rec.liquid as Uint8Array).set(u8(`${p}.liq`));
  (rec.liquidType as Uint8Array).set(u8(`${p}.lty`));
  return st;
}

(RUN ? it : it.skip)('IIII101c-b band recomputation', () => {
  const gsj = JSON.parse(readFileSync('/tmp/iii99-out/cap-ddual/base_gs.json', 'utf8')) as Record<string, unknown>;
  const seedNum = Number(gsj.seed);
  const du = JSON.parse(readFileSync('/tmp/iii99-out/cap-ddual/base_dual.json', 'utf8')) as never as {
    enabled: boolean;
    dungeons: Array<{ side: number; location: number; theme: number; entA: number; entB: number; entSeed: number }>;
    ndsf?: number;
  };
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.dungeons = du.dungeons.map((d) => ({ ...d })) as never;
  dualDungeonState.normalizedDistanceSafeFromDither = du.ndsf ?? 1 - 0.075 * (H / 1200);
  const gs = {
    seedFlags: { dualDungeons: true },
    worldSurface: Number(gsj.worldSurface),
    rockLevelLow: Number(gsj.rockLevelLow),
    rockLevelHigh: Number(gsj.rockLevelHigh),
    rockLevel: Number(gsj.rockLevel),
    waterLine: Number(gsj.waterLine),
    lavaLine: Number(gsj.lavaLine),
    beachDistance: 380,
    genWorldSurfaceHigh: Number(gsj.genWorldSurfaceHigh ?? gsj.worldSurfaceHigh),
    crimson: false,
    seed: seedNum,
  } as unknown as GenState;

  const st = hydrate(31, 'Slush');
  snk.runDualDungeonsDitherSnakePass(st, new RNG(seedNum), gs);

  // 差格采样：来自 _iii121snake 的 wal buckets 样本
  const samples: Array<[number, number]> = [[657, 354], [658, 354], [2340, 349]];
  const f64hex = (v: number): string => {
    const b = new ArrayBuffer(8); new DataView(b).setFloat64(0, v);
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  };
  for (let k = 0; k <= 1; k++) {
    const snake = snk.dualSnakes[k];
    if (!snake) continue;
    console.log(`=== dungeon ${k} ===`);
    for (const [tx, ty] of samples) {
      for (const ln of snake.lines) {
        const cp = ln.canPaint(tx, ty);
        if (!cp.ok) continue;
        const rad = cp.nlp === 0 || cp.nlp === 1
          ? (cp.nlp === 0 ? ln.StartRadius : ln.EndRadius)
          : ln.StartRadius + (ln.EndRadius - ln.StartRadius) * cp.nlp;
        const num3 = Math.trunc(rad * dualDungeonState.normalizedDistanceSafeFromDither);
        const num4 = cp.distance - num3;
        if (Math.abs(num4) <= 6.0) {
          console.log(`cell(${tx},${ty}) L${ln.Index} nlp=${cp.nlp} d=${cp.distance}[${f64hex(cp.distance)}] rad=${rad}[${f64hex(rad)}] num3=${num3} num4=${f64hex(num4)}(${num4})`);
        }
      }
    }
  }
  console.log('[i127p3] done');
}, 600_000);
