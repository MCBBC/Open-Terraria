// IIII101c-b 一次性取证：旋转中间量转储（复算 C17 Y 分裂的成因）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';
import * as snk from '../src/world/gen/vanilla/DitherSnakePass';

const RUN = process.env.SW_I127ROT === '1';
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

(RUN ? it : it.skip)('IIII101c-b rotation dump', () => {
  const dump: Array<Record<string, number>> = [];
  (globalThis as unknown as { __swI127DUMP?: unknown[] }).__swI127DUMP = dump;

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

  const f64hex = (v: number): string => {
    const b = new ArrayBuffer(8); new DataView(b).setFloat64(0, v);
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  };
  const lines = dump.map((d) =>
    `px=${f64hex(d.p!)},py=${f64hex(d.q!)} cx=${f64hex(d.cx!)} cy=${f64hex(d.cy!)} ang=${f64hex(d.angle!)} c=${f64hex(d.c!)} s=${f64hex(d.s!)} rx=${f64hex(d.rx!)} ry=${f64hex(d.ry!)}`);
  writeFileSync('/tmp/iii127-out/rot-dump.txt', lines.join('\n') + '\n');
  console.log(`[i127r] rotations=${lines.length}`);
}, 600_000);
