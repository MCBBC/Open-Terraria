// FFFFFF 批①（2026-08-21）：漂移带 6 名逐掷账（oracle↔JS dice-account，_dddd4 同族 harness）
// 用法：cd game && SW_F1=1 npx vitest run tools/_ffff1.test.ts
//   SW_F1_SEED（默认 1511931452）/ SW_F1_EVIL（默认 1）/ SW_F1_OUT（默认 /tmp/fff-js-rolls.txt）
// 机制：UnifiedRandom 原型三掷法（nextInt/nextIntRange/nextDouble）挂账本；追踪窗由
//   tests/caves-checkpoint.test.ts snap() 的 __cavesTrace 钩子在 quickcleanup 检查点点亮
//   （=beehives Replay 前），链尾 microbiomes 自然收口。行格式与 oracle ROLL_TRACE 同构：
//   `<n> N(<max>) -> <v>` / `<n> R(<a>,<b>) -> <v>` / `<n> D -> <v>` / `<n> RESEED`。
//   D 行两侧各自 round-trip 格式（C# R / JS toString）——对拍按 float 数值比，不比字面。
// 网格：__cavesGridExport 多名模式同跑落 /tmp/fff-js-<name>.{typ,act,wal,liq,slope,half}。
import { it } from 'vitest';
import { createWriteStream, writeFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
import { UnifiedRandom, RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_F1 === '1';
const OUT = process.env.SW_F1_OUT ?? '/tmp/fff-js-rolls.txt';
const SEED = process.env.SW_F1_SEED ?? '1511931452';
const EVIL = Number(process.env.SW_F1_EVIL ?? '1') as 0 | 1;

(RUN ? it : it.skip)('ffff1 drift-band roll account (beehives..microbiomes)', async () => {
  const w = createWriteStream(OUT);
  let n = 0;
  const on = () => (globalThis as { __fffTraceOn?: boolean }).__fffTraceOn === true;

  // JS→vanilla sheet 映射（网格对拍 id 空间归一；oracle 侧 dump 恒 vanilla id）
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  writeFileSync('/tmp/fff-js-sheet.json', JSON.stringify([...SHEET]));

  (globalThis as { __cavesTrace?: { onAt: string; flag: string } }).__cavesTrace =
    { onAt: 'quickcleanup', flag: '__fffTraceOn' };
  (globalThis as { __cavesGridExport?: { at: string; dir: string } }).__cavesGridExport = {
    at: 'altars,statues,cavewalls,undergroundjungletrees,quickcleanup,beehives,piles,trees,settle2,cactus,microbiomes',
    dir: '/tmp/fff-js',
  };

  const urp = UnifiedRandom.prototype as unknown as Record<string, (this: unknown, ...a: number[]) => number>;
  const oNext = urp.next!, oNextInt = urp.nextInt!, oNextIntRange = urp.nextIntRange!, oNextDouble = urp.nextDouble!;
  urp.next = function () { const v = oNext.call(this); if (on()) { w.write(`${n} N() -> ${v}\n`); n++; } return v; };   // 裸 Next()（campsite 位谓词族）
  urp.nextInt = function (max: number) { const v = oNextInt.call(this, max); if (on()) { w.write(`${n} N(${max}) -> ${v}\n`); n++; } return v; };
  urp.nextIntRange = function (a: number, b: number) { const v = oNextIntRange.call(this, a, b); if (on()) { w.write(`${n} R(${a},${b}) -> ${v}\n`); n++; } return v; };
  urp.nextDouble = function () { const v = oNextDouble.call(this); if (on()) { w.write(`${n} D -> ${v}\n`); n++; } return v; };
  const RNGp = RNG.prototype as unknown as { reseed: (this: RNG, s: number) => void };
  const oReseed = RNGp.reseed;
  RNGp.reseed = function (s: number) { const r = oReseed.call(this, s); if (on()) w.write(`${n} RESEED\n`); return r; };

  // ★FFFFFF：JS 侧逐杀账（killTileGen 的 __swKillCap 钩子；与 oracle KILL_TRACE 同构）
  const kw = createWriteStream('/tmp/fff-js-kills.txt');
  (globalThis as { __swKillCap?: (x: number, y: number, sheet: number) => void }).__swKillCap = (x, y, s) => {
    if (on()) kw.write(`K ${x} ${y} ${s}\n`);
  };

  const t0 = Date.now();
  try {
    const res = chainCheckpoints(SEED, EVIL);
    console.log(`beehives  ${res.grids.get('beehives')}`);
    console.log(`micro     ${res.grids.get('microbiomes')}`);
  } finally {
    (globalThis as { __fffTraceOn?: boolean }).__fffTraceOn = false;
    urp.next = oNext; urp.nextInt = oNextInt; urp.nextIntRange = oNextIntRange; urp.nextDouble = oNextDouble;
    RNGp.reseed = oReseed;
    (globalThis as { __cavesTrace?: unknown }).__cavesTrace = undefined;
    (globalThis as { __cavesGridExport?: unknown }).__cavesGridExport = undefined;
    (globalThis as { __swKillCap?: unknown }).__swKillCap = undefined;
    await new Promise<void>((res) => w.end(() => res()));
    await new Promise<void>((res) => kw.end(() => res()));
  }
  console.log(`rolls: ${n} -> ${OUT} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}, 900_000);
