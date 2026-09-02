// 一次性诊断（hm-probe 2026-09-02）：initializeHardMode（肉后条带布局）x86 对拍
// 【JS 侧驱动件】。x86 侧 = /tmp/hm1458-rig（独立编译目录，基座 Terarria1458 反编译
// 树全量拷贝 + HardmodeProbeHook）：生成完成世界 → Main.rand=new UnifiedRandom(SW_HM_SEED)
// → initializeHardMode()（反射调私有）→ pre/post 全图 dump。
// 本文件 = 同 seed 同输入驱动 JS：generateWorld 全图 → dump pre →
// HardmodePass.initializeHardMode(world, new RNG(world.seed)) → dump post。
// dump 布局 = JJHook 认证格式（row-major y 外 x 内；typ u16LE 原版 sheet、wal u16LE、
// liq u8、lty u8 原版 0 基、half/slope/inact u8）。
// RNG 面近似（备案）：两侧都用同种子新流（x86 UnifiedRandom(seed) / JS new RNG(seed)），
// 原版运行时消费的是活流（逐位不可复现）——HardmodePass.ts 头注 verdict#1b 同口径。
//
// 用法：cd game && SW_HM=1 SW_HM_OUT=/tmp/hm1458-rig/out/g/js npx vitest run tools/_hmprobe.test.ts
// 对照：node tools/_hmprobe-compare.mjs /tmp/hm1458-rig/out/g/hm /tmp/hm1458-rig/out/g/js
process.env.SW_MB_1457 = '1'; // ★VVVVVV 双态门：JS 侧走 1457 形认证线（与七链金标同口径）
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateWorld } from '../src/world/gen/WorldGen';
import { initializeHardMode } from '../src/world/gen/vanilla/HardmodePass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';

const RUN = process.env.SW_HM === '1';
const OUT = process.env.SW_HM_OUT ?? '/tmp/hm1458-rig/out/g/js';
const SEED = process.env.SW_HM_SEED ?? '9293480';
// evil：0/1=强制（缺省 0，与 x86 run-hm-probe.sh 的 SW_EVIL 同口径）；-1=自然掷
// （Reset cs:11321 crimson=genRand.Next(2)==0 原样生效）——crimson-roll 读取位判定实验用
const EVIL = Number(process.env.SW_HM_EVIL ?? 0) as -1 | 0 | 1;
const W = Number(process.env.SW_HM_W ?? 4200);
const H = Number(process.env.SW_HM_H ?? 1200);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const SENTINEL = 9999; // 未注册 sheet 哨兵（mile8 同款；仅信息位）

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
      // 活性格=sheet；非活性 ghost：空气记 0、残留 type 映射 sheet、未注册=9999
      // （mile8 Gh 口径——不参与裁决，仅供信息位对账）
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

(RUN ? it : it.skip)('hm-probe: JS generateWorld → pre → initializeHardMode → post', async () => {
  mkdirSync(OUT, { recursive: true });
  // 掷流对拍仪：观察钩记前 500 个 InternalSample 原始值 + 实例序号（观测不消费，
  // x86 SW_ROLLLOG 同口径；实例序号用于区分 worldgen 主实例与杂散实例）
  const rollLog: Array<[number, number]> = [];
  const instIds = new Map<object, number>();
  const g = globalThis as { __swOnRoll?: (value: number, inst: object) => void };
  const prevHook = g.__swOnRoll;
  g.__swOnRoll = (value: number, inst: object) => {
    if (rollLog.length >= 500) return;
    let id = instIds.get(inst);
    if (id === undefined) {
      id = instIds.size + 1;
      instIds.set(inst, id);
    }
    rollLog.push([value, id]);
  };
  // API 级日志：RNG 门面调用（nextInt/nextIntRange/next）前 60 次，含 API 名+入参+
  // 当时样本序号——用于定位 crimson roll 在样本流中的确切位次
  const apiLog: string[] = [];
  const rngMod = await import('../src/core/rng');
  const proto = (rngMod.RNG as unknown as { prototype: Record<string, (...a: unknown[]) => unknown> }).prototype;
  const origNextInt = proto.nextInt, origNextIntRange = proto.nextIntRange, origNext = proto.next;
  const apiPatch = (name: 'nextInt' | 'nextIntRange' | 'next', orig: (...a: unknown[]) => unknown) => {
    proto[name] = function (this: unknown, ...a: unknown[]) {
      const r = orig.apply(this, a);
      if (apiLog.length < 60) {
        apiLog.push(`#${rollLog.length}|${name}(${a.join(',')})=${String(r)}`);
      }
      return r;
    };
  };
  apiPatch('nextInt', origNextInt);
  apiPatch('nextIntRange', origNextIntRange);
  apiPatch('next', origNext);
  let world: World;
  try {
    world = await generateWorld({ width: W, height: H, seedText: SEED, evil: EVIL });
  } finally {
    g.__swOnRoll = prevHook;
  }
  writeFileSync(
    join(OUT, 'roll-js.txt'),
    rollLog.map(([v, id], i) => `${i + 1}|${v}|inst${id}`).join('\n') + '\n',
  );
  writeFileSync(join(OUT, 'api-js.txt'), apiLog.join('\n') + '\n');
  proto.nextInt = origNextInt;
  proto.nextIntRange = origNextIntRange;
  proto.next = origNext;
  writeFileSync(
    join(OUT, 'meta.json'),
    JSON.stringify(
      {
        seedText: SEED,
        seed: world.seed,
        dungeonX: world.dungeonX,
        dungeonY: world.dungeonY,
        groundLevel: world.groundLevel,
        crimson: world.crimson,
        seedFlags: world.seedFlags ?? {},
        skyblockLowTiles: !!world.skyblockLowTiles,
        w: world.store.w,
        h: world.store.h,
      },
      null,
      1,
    ),
  );
  dumpStore(world.store, OUT, 'pre');
  // hardmode 段全量掷流捕获（x86 roll-x86-hm.txt 同口径对齐）
  const hmLog: number[] = [];
  g.__swOnRoll = (value: number) => {
    hmLog.push(value);
  };
  // ★NB-A2：段界掷数表（IIII177 的 __swSeg 标记位记录 hmLog 长度）→ phases.txt
  const segMarks: string[] = [];
  (g as { __swSeg?: (tag: string) => void }).__swSeg = (tag: string) => {
    segMarks.push(`${tag}|${hmLog.length}`);
  };
  console.log(
    `[hm-probe-js] pre dumped seed=${world.seed} dungeonX=${world.dungeonX} ` +
      `groundLevel=${world.groundLevel} crimson=${world.crimson} ` +
      `dualDungeons=${!!world.seedFlags?.dualDungeons} remix=${!!world.seedFlags?.remix}`,
  );
  initializeHardMode(world, new RNG(world.seed));
  g.__swOnRoll = prevHook;
  (g as { __swSeg?: (tag: string) => void }).__swSeg = undefined;
  writeFileSync(join(OUT, 'roll-js-hm.txt'), hmLog.join('\n') + '\n');
  writeFileSync(join(OUT, 'phases-js.txt'), segMarks.join('\n') + '\n');
  dumpStore(world.store, OUT, 'post');
  console.log('[hm-probe-js] post dumped -> ' + OUT);
}, 600000);
