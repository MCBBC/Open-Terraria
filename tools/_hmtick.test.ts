// 一次性诊断（NBF 2026-09-02）：世界蔓延 N-tick 对拍【JS 侧驱动件】。
// 前置 = _hmprobe.test.ts 同链（generateWorld 全图 → pre dump → HardmodePass.
// initializeHardMode → post dump），本件追加：游戏 Update（=WorldEvolution.update()，
// 原版 WorldGen.UpdateWorld 1:1 采样骨架）推进 N=100/500/1000/3000 tick，
// 每里程碑全 8 通道 dump（tag=t<n>，与 x86 rig SW_HM_TICK_N 产物同名同布局）。
//
// ★RNG 选型（F4，实测定案见 _hmtick-compare.mjs 报告）：原版 spread 消费的不是会话
//   活流——Main.Update(:17992) 每帧 `using(SwapRandom("UpdateWorldGen"))` 把
//   WorldGen.UpdateWorld 包在 keyed 持久实例 Main.SwapRandom("UpdateWorldGen")
//   （Main.cs:3300-3311，_rngs 每会话一建、跨 tick 续流、种子=世界种子）里。
//   本件同口径复刻：Math.random 桥接到 new UnifiedRandom(world.seed)（持久、跨 tick
//   续流、tick 期唯一消费方=演化链）——不触 WorldEvolution.ts 生产代码（只读审计，
//   Math.random 活流偏差已交 finding）。
// 比较口径：两侧同种子 keyed 流 + 调用形状若 1:1 则可逐位 lockstep；实际 JS 演化链
//   存在登记近似（CanHitLine/PlayerLOS/装饰帧等），故比较器以【统计口径】裁决
//   （蔓延面积/类型直方图/方向），逐位差仅作分歧定位信息。
//
// 用法：cd game && SW_HM=1 SW_HM_OUT=/tmp/nbf-out/js npx vitest run tools/_hmtick.test.ts
// 对照：node tools/_hmtick-compare.mjs /tmp/hm1458-rig/out/<NAME>/hm /tmp/nbf-out/js
process.env.SW_MB_1457 = '1'; // ★VVVVVV 双态门：JS 侧走 1457 形认证线（与金标同口径）
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateWorld } from '../src/world/gen/WorldGen';
import { initializeHardMode } from '../src/world/gen/vanilla/HardmodePass';
import { UnifiedRandom, RNG } from '../src/core/rng';
import { WorldEvolution } from '../src/world/evolution/WorldEvolution';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';

const RUN = process.env.SW_HM === '1';
const OUT = process.env.SW_HM_OUT ?? '/tmp/nbf-out/js';
const SEED = process.env.SW_HM_SEED ?? '9293480';
const EVIL = Number(process.env.SW_HM_EVIL ?? 0) as -1 | 0 | 1;
const W = Number(process.env.SW_HM_W ?? 4200);
const H = Number(process.env.SW_HM_H ?? 1200);
const TICK_N = Number(process.env.SW_HM_TICK_N ?? 3000);
const MILESTONES = [100, 500, 1000, 3000].filter((n) => n <= TICK_N);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const SENTINEL = 9999; // 未注册 sheet 哨兵（mile8 同款；仅信息位）

// dump 布局 = JJHook 认证格式（与 x86 HardmodeProbeHook.Dump / _hmprobe.test.ts 同款）
function dumpStore(st: TileStore, dir: string, tag: string): void {
  const n = st.w * st.h;
  const typ = Buffer.alloc(n * 2);
  const wal = Buffer.alloc(n * 2);
  const act = Buffer.alloc(n);
  const liq = Buffer.alloc(n);
  const lt = Buffer.alloc(n);
  const hf = Buffer.alloc(n);
  const sl = Buffer.alloc(n);
  const ia = Buffer.alloc(n);
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = y * st.w + x;
      const a = st.flags[i]! & 1;
      act[i] = a;
      const t0 = st.type[i]!;
      const sh = t0 === 0 ? 0 : SHEET[t0]!;
      const v = sh >= 0 ? sh : SENTINEL;
      typ[i * 2] = v & 0xff;
      typ[i * 2 + 1] = (v >> 8) & 0xff;
      wal[i * 2] = st.wall[i]! & 0xff;
      wal[i * 2 + 1] = (st.wall[i]! >> 8) & 0xff;
      liq[i] = st.liquid[i]!;
      lt[i] = st.liquid[i]! > 0 ? st.liquidType[i]! - 1 : 0; // JS +1 基 → 原版 0 基
      hf[i] = st.half[i]!;
      sl[i] = st.slope[i]!;
      ia[i] = (st.wire[i]! >>> 5) & 1;
    }
  }
  writeFileSync(join(dir, `${tag}.typ`), typ);
  writeFileSync(join(dir, `${tag}.wal`), wal);
  writeFileSync(join(dir, `${tag}.act`), act);
  writeFileSync(join(dir, `${tag}.liq`), liq);
  writeFileSync(join(dir, `${tag}.lty`), lt);
  writeFileSync(join(dir, `${tag}.half`), hf);
  writeFileSync(join(dir, `${tag}.slope`), sl);
  writeFileSync(join(dir, `${tag}.inact`), ia);
}

(RUN ? it : it.skip)('hm-tick: JS generateWorld → initializeHardMode → N-tick evolution milestones', async () => {
  mkdirSync(OUT, { recursive: true });
  const marks: string[] = [];
  const mark = (s: string) => {
    marks.push(s);
    console.log('[hm-tick-js] ' + s);
  };
  let world: World;
  world = await generateWorld({ width: W, height: H, seedText: SEED, evil: EVIL });
  dumpStore(world.store, OUT, 'pre');
  mark(`pre dumped seed=${world.seed} groundLevel=${world.groundLevel} rockLevel=${world.rockLevel} crimson=${world.crimson} dungeonX=${world.dungeonX}`);
  // 肉后变换（x86 同口径：fresh RNG(world.seed)；x86 initializeHardMode 内部置
  // Main.hardMode=true(:32180)，JS 侧旗标写在 startHardmode —— 此处补齐同语义）
  initializeHardMode(world, new RNG(world.seed));
  world.flags.hardMode = true;
  dumpStore(world.store, OUT, 'post');
  mark('post dumped (HM transform complete)');

  // ---- tick 段掷流观察钩（观测不消费，x86 SW_ROLLLOG MARK TICK_BEGIN/END 同口径）----
  const tickRoll: number[] = [];
  const g = globalThis as { __swOnRoll?: (value: number, inst: object) => void };
  const prevHook = g.__swOnRoll;
  g.__swOnRoll = (value: number) => {
    if (tickRoll.length < 2000) tickRoll.push(value);
  };
  // ---- RNG 桥：Math.random → keyed UnifiedRandom(world.seed)（SwapRandom
  //      "UpdateWorldGen" 复刻：持久、跨 tick 续流、tick 期唯一消费方=演化链）----
  const keyed = new UnifiedRandom(world.seed);
  const origRandom = Math.random;
  Math.random = () => keyed.nextDouble();
  const t0 = Date.now();
  try {
    const evolution = new WorldEvolution({
      store: world.store,
      worldSurface: world.groundLevel,
      rockLevel: world.rockLevel,
      dungeonX: world.dungeonX,
      difficulty: world.difficulty ?? 0,
      flags: world.flags,
      crimson: world.crimson,
      isDay: true,
      raining: false,
      maxRaining: 0,
      windSpeedCurrent: 0,
      playerTile: () => null, // 裸世界无玩家：LOS 门恒 false（原版空玩家循环同语义）
      worldUpdateRate: 1,
      journeyStopBiomeSpread: false,
    });
    mark(`tick begin maxTick=${TICK_N} tickSeed=${world.seed} milestones=[${MILESTONES.join(',')}]`);
    let msIdx = 0;
    for (let tick = 1; tick <= TICK_N; tick++) {
      evolution.update();
      if (msIdx < MILESTONES.length && tick === MILESTONES[msIdx]) {
        dumpStore(world.store, OUT, `t${MILESTONES[msIdx]}`);
        mark(`tick t=${tick} dumped elapsed=${Date.now() - t0}ms`);
        msIdx++;
      }
    }
  } finally {
    Math.random = origRandom;
    g.__swOnRoll = prevHook;
  }
  mark(`tick end elapsed=${Date.now() - t0}ms`);
  writeFileSync(join(OUT, 'roll-js-tick.txt'), tickRoll.join('\n') + '\n');
  writeFileSync(join(OUT, 'phases-js-tick.txt'), marks.join('\n') + '\n');
  writeFileSync(
    join(OUT, 'meta.json'),
    JSON.stringify(
      {
        seedText: SEED,
        seed: world.seed,
        dungeonX: world.dungeonX,
        dungeonY: world.dungeonY,
        groundLevel: world.groundLevel,
        rockLevel: world.rockLevel,
        crimson: world.crimson,
        w: world.store.w,
        h: world.store.h,
        tickN: TICK_N,
        milestones: MILESTONES,
      },
      null,
      1,
    ),
  );
  console.log('[hm-tick-js] all milestones dumped -> ' + OUT);
}, 600000);
