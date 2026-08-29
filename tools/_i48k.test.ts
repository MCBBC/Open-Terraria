// IIII48 仪K：逐 attempt 掷耗表——把 CavesPass 的 RockLayer 块内联复制并逐调用记账，
// 对齐 rig 全窗分解；找出 8,541,215 落在哪个相位。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';

const RUN = process.env.SW_I48K === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const SEED = 1138154190;

function rd16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1);
}
const rd8 = (p: string) => new Uint8Array(readFileSync(p));

(RUN ? it : it.skip)('i48k attempt ledger', async () => {
  const BYSHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !BYSHEET.has(s)) BYSHEET.set(s, i);
  }
  const st = new TileStore(W, H);
  const t0 = rd16(`${G2}/010_Small_Holes.typ`);
  const a0 = rd8(`${G2}/010_Small_Holes.act`);
  for (let i = 0; i < N; i++) { st.type[i] = BYSHEET.get(t0[i]) ?? 0; st.flags[i] = a0[i] ? 1 : 0; }

  const rng = new RNG(SEED);
  const gs = {
    seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    beachDistance: 380,
    undergroundDesert: null,
  } as never;

  let cnt = 0;
  const g = globalThis as { __swOnRoll?: (v: number) => void };
  g.__swOnRoll = () => cnt++;

  // ==== DirtLayerCaves（照抄 src，只为对齐入口流位）====
  let num = Math.trunc(N * 0.00003);
  num = Math.trunc(num * 2);
  for (let i = 0; i < num; i++) {
    const type = rng.nextInt(6) === 0 ? -2 : -1;
    let num2b = rng.nextIntRange(0, W);
    let num3b = rng.nextIntRange(162, 770);
    while (((num2b < 340 || num2b > W - 340) && num3b < 312)
      || (num2b >= W * 0.45 && num2b <= W * 0.55 && num3b < 337)) {
      num2b = rng.nextIntRange(0, W);
      num3b = rng.nextIntRange(162, 770);
    }
    const s4 = rng.nextIntRange(5, 15);
    const s5 = rng.nextIntRange(30, 200);
    tileRunner(st, rng, gs, num2b, num3b, {
      strength: Math.trunc(s4 * 1.1), steps: Math.trunc(s5 * 1.9), type,
    });
  }
  const dirtEnd = cnt;

  rng.reseed(SEED);
  // ==== RockLayer 主循环 ====
  const rowsM: string[] = [];
  num = Math.trunc(Math.trunc(N * 0.00013) * 1.1);
  console.log(`main attempts=${num} dirtEnd=${dirtEnd}`);
  for (let i = 0; i < num; i++) {
    const type = rng.nextInt(10) === 0 ? -2 : -1;
    const s2 = Math.trunc(rng.nextIntRange(6, 20) * 0.7);
    const s3 = Math.trunc(rng.nextIntRange(50, 300) * 0.7);
    const x = rng.nextIntRange(0, W);
    const y = rng.nextIntRange(769, H);
    const b = cnt;
    tileRunner(st, rng, gs, x, y, { strength: s2, steps: s3, type });
    rowsM.push(`M${i} [${b},${cnt}) str=${s2} stp=${s3} t=${type} xy=(${x},${y})`);
  }
  const mainEnd = cnt;
  const rowsE: string[] = [];
  num = Math.trunc(N * 0.00013 * 0.4);
  for (let j = 0; j < num; j++) {
    const type2 = rng.nextInt(10) === 0 ? -2 : -1;
    const q = rng.nextIntRange(7, 26);
    const stp = rng.nextIntRange(50, 200);
    const spX = rng.nextIntRange(100, 221) * 0.1;
    const spY = rng.nextIntRange(-10, 11) * 0.02;
    const x2 = rng.nextIntRange(0, W);
    const y2 = rng.nextIntRange(769, H);
    const b = cnt;
    tileRunner(st, rng, gs, x2, y2, { strength: q, steps: stp, type: type2, speedX: spX, speedY: spY, noYChange: true });
    const m1 = cnt - b;
    tileRunner(st, rng, gs, x2, y2, { strength: q, steps: stp, type: type2, speedX: -spX, speedY: -spY, noYChange: true });
    rowsE.push(`E${j} [${b},${cnt}) r1=${m1} r2=${cnt - b - m1} str=${q} stp=${stp} spX=${spX.toFixed(1)} t=${type2} xy=(${x2},${y2})`);
  }
  delete g.__swOnRoll;
  const CUT = 8541215 - dirtEnd;   // 相对段内
  const segCut = mainEnd - dirtEnd + CUT - 0; // 直接比较绝对数
  void segCut;
  console.log(`mainEnd(abs)=${mainEnd} extraEnd(abs)=${cnt}`);
  console.log(`absolute cut=8541215 → relative-in-extra? search:`);
  const around = rowsE.filter((r) => {
    const m = /\[(\d+),(\d+)\)/.exec(r)!;
    const a = Number(m[1]), bb = Number(m[2]);
    return bb >= 8541215 - dirtEnd + mainEnd || (a <= 8541215 - dirtEnd + mainEnd && bb > 8541215 - dirtEnd + mainEnd);
  });
  void around;
  // 简单打印 cut±6 行
  const idxAt = (() => {
    let lo = 0, hi = rowsE.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const m = /\[(\d+),(\d+)\)/.exec(rowsE[mid])!;
      const a = Number(m[1]), b = Number(m[2]);
      const target = 11532828;
      if (b < target) lo = mid + 1; else if (a > target) hi = mid - 1; else return mid;
    }
    return -1;
  })();
  console.log(`E-index containing block-end(abs=${11532828}): ${idxAt}`);
  for (let z = Math.max(0, idxAt - 4); z < Math.min(rowsE.length, idxAt + 7); z++) {
    console.log(rowsE[z] + (z === idxAt ? '  <<<< cut inside' : ''));
  }
}, 900_000);
