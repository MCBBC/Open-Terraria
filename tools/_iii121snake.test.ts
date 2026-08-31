// IIII121 批一次性诊断：ddual #32 DitherSnake 槽反演重放。
// 基座=x86 031_Slush 真值 hydrate，只跑 JS runDualDungeonsDitherSnakePass，对拍 032 真值。
// 用法：cd game && SW_I121S=1 npx vitest run tools/_iii121snake.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDualDungeonsDitherSnakePass, snkRollCounter } from '../src/world/gen/vanilla/DitherSnakePass';
import { dualDungeonState } from '../src/world/gen/vanilla/DungeonStyles1457';

const RUN = process.env.SW_I121S === '1';
const G2 = '/tmp/iii84-out/x86-i78-ddual';
const W = 4200, H = 1200;
function le16(p: string): Uint16Array {
  const b = readFileSync(p);
  const u = new Uint8Array(b.length); u.set(b);
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
  if (typeof s === 'number') {
    SHEET[i] = s;
    if (s >= 0 && s < 1024 && BYSHEET[s] < 0) BYSHEET[s] = i;
  }
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
  const lty = u8(`${p}.lty`);
  const lt = rec.liquidType as Uint8Array;
  for (let i = 0; i < lty.length; i++) lt[i] = lty[i]! > 0 ? lty[i]! + 1 : 0;
  return st;
}

(RUN ? it : it.skip)('IIII121 snake-slot inversion replay vs G2', () => {
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
  const mkGs = (): GenState => ({
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
  } as unknown as GenState);

  // ★几何仪接收（x86 DR|SNK 镜像）
  const snkLines: string[] = [];
  (globalThis as { __swI121?: (l: string) => void }).__swI121 = (l) => snkLines.push(l);
  const rngRaw = new RNG(seedNum);
  snkRollCounter.v = 0;
  // wrap 掷骰（计数器累加,镜像 JJHook.RollCount 口径）
  {
    const self = rngRaw as unknown as Record<string, (...a: never[]) => number>;
    for (const m of ['next', 'int', 'nextInt', 'nextIntRange'] as const) {
      const orig = self[m]!.bind(rngRaw);
      self[m] = ((...a: never[]) => { const v = orig(...a); snkRollCounter.v++; return v; }) as never;
    }
  }
  const st = hydrate(31, 'Slush');
  runDualDungeonsDitherSnakePass(st, rngRaw, mkGs());
  delete (globalThis as { __swI121?: unknown }).__swI121;
  writeFileSync('/tmp/iii121-out/js-snk.txt', snkLines.join('\n') + '\n');
  console.log(`[i121s] js snk lines=${snkLines.length}`);

  // ★IIIII101c-b：八通道全量对拍（typ/wal/act/inact/half/slope/liq/lty）
  const recx = st as unknown as Record<string, Uint8Array | Uint16Array>;
  let allZero = true;
  const cmpCh = (name: string, xvArr: ArrayLike<number>, jvArr: ArrayLike<number>, gate?: Uint8Array): number => {
    let n = 0;
    const samples: string[] = [];
    for (let i = 0; i < W * H; i++) {
      const xv = xvArr[i]!, jv = jvArr[i]!;
      if ((gate === undefined || gate[i] !== 0) && xv !== jv) {
        n++;
        if (samples.length < 6) samples.push(`(${i % W},${(i / W) | 0}) v${xv} j${jv}`);
      }
    }
    if (n > 0) {
      allZero = false;
      console.log(`[i121s] ${name}: diff=${n}`);
      console.log(`   samples: ${samples.join(' | ')}`);
    } else {
      console.log(`[i121s] ${name}: diff=0`);
    }
    return n;
  };
  const mkAct = (): Uint8Array => {
    const v = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) v[i] = st.flags[i]! & 1;
    return v;
  };
  // typ：x86 vanilla-id → 与 JS sheet 映射对拍；非 act 格按 0 处理（与旧口径一致）
  {
    const xv16 = le16(`${pre(32, 'Dual_Dungeons_Dither_Snake')}.typ`);
    const xa8 = u8(`${pre(32, 'Dual_Dungeons_Dither_Snake')}.act`);
    let n = 0; const samples: string[] = [];
    for (let i = 0; i < W * H; i++) {
      const vv = xa8[i]! ? xv16[i]! : 0;
      const sh = SHEET[st.type[i]!];
      const jj = (st.flags[i]! & 1) ? (sh >= 0 ? sh! : 9999) : 0;
      if (vv !== jj) { n++; if (samples.length < 6) samples.push(`(${i % W},${(i / W) | 0}) v${vv} j${jj}`); }
    }
    allZero &&= n === 0;
    console.log(`[i121s] typ: diff=${n}`);
    if (n > 0) console.log(`   samples: ${samples.join(' | ')}`);
  }
  cmpCh('wal', le16(`${pre(32, 'Dual_Dungeons_Dither_Snake')}.wal`), st.wall);
  cmpCh('act', u8(`${pre(32, 'Dual_Dungeons_Dither_Snake')}.act`), mkAct());
  cmpCh('inact', u8(`${pre(32, 'Dual_Dungeons_Dither_Snake')}.inact`),
    (() => { const v = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) v[i] = (st.wire[i]! >>> 5) & 1; return v; })());
  cmpCh('half', u8(`${pre(32, 'Dual_Dungeons_Dither_Snake')}.half`), recx.half);
  cmpCh('slope', u8(`${pre(32, 'Dual_Dungeons_Dither_Snake')}.slope`), recx.slope);
  cmpCh('liq', u8(`${pre(32, 'Dual_Dungeons_Dither_Snake')}.liq`), recx.liquid);
  cmpCh('lty', u8(`${pre(32, 'Dual_Dungeons_Dither_Snake')}.lty`),
    (() => { const sv = recx.liquidType; const v = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) v[i] = sv[i]! > 0 ? sv[i]! - 1 : 0; return v; })());
  console.log(`[i121s] eight-channel ${allZero ? 'ALL-ZERO ✓✓✓' : 'RESIDUAL PRESENT'}`);
}, 600_000);
