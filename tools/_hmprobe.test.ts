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
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateWorld } from '../src/world/gen/WorldGen';
import { initializeHardMode } from '../src/world/gen/vanilla/HardmodePass';
import { oreRunner } from '../src/world/gen/vanilla/TileRunner';
import { dropMeteor, type MeteorHost } from '../src/world/MeteorFall';
import { RNG } from '../src/core/rng';
import { TILE_DEFS, TILE_BY_KEY, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
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

/** ★NB-E：事件增量 dump 6 通道（typ/act/liq/lty/half/slope）——SmashAltar/OreRunner/
 *  meteor 不触 wall 与 actuator，与 x86 侧 HardmodeProbeHook.DumpTiles6 同口径。 */
function dumpStore6(st: TileStore, dir: string, tag: string): void {
  const n = st.w * st.h;
  const typ = Buffer.alloc(n * 2);
  const act = Buffer.alloc(n);
  const liq = Buffer.alloc(n);
  const lt = Buffer.alloc(n);
  const hf = Buffer.alloc(n);
  const sl = Buffer.alloc(n);
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = y * st.w + x;
      act[i] = st.flags[i]! & 1;
      const t0 = st.type[i]!;
      const sh = t0 === 0 ? 0 : SHEET[t0]!;
      const v = sh >= 0 ? sh : SENTINEL;
      typ[i * 2] = v & 0xff;
      typ[i * 2 + 1] = (v >> 8) & 0xff;
      liq[i] = st.liquid[i]!;
      lt[i] = st.liquid[i]! > 0 ? st.liquidType[i]! - 1 : 0;
      hf[i] = st.half[i]!;
      sl[i] = st.slope[i]!;
    }
  }
  writeFileSync(join(dir, `${tag}.typ`), typ);
  writeFileSync(join(dir, `${tag}.act`), act);
  writeFileSync(join(dir, `${tag}.liq`), liq);
  writeFileSync(join(dir, `${tag}.lty`), lt);
  writeFileSync(join(dir, `${tag}.half`), hf);
  writeFileSync(join(dir, `${tag}.slope`), sl);
}

// ═══ ★NB-E（2026-09-03）：离散事件面（E1 祭坛砸链 / E2 陨石坠落）══════════════
// 原版函数链（rig 1458 树行号；1457 同构）：
//   E1  KillTile case26 → WorldGen.SmashAltar(:49603)：SavedOreTiers 首砸锁矿
//       (genRand.Next(2)==0 → 替代矿) → 深度带选点 → 每脉 OreRunner(:49494)。
//   E2  WorldGen.dropMeteor(:6223) → WorldGen.meteor(:6345) 五层雕刻。
// JS 等价面：E1 = 本文件 headless 镜像（按 vanilla 掷流序直写，矿脉生成复用生产
//   oreRunner——TileRunner.ts 认证件）；E2_1 = 生产 MeteorFall.dropMeteor（等价面本体）；
//   E2_2 = vanilla 序镜像（x 外 y 内循环+逐格掷序,用于定罪生产 placeMeteor 的循环序
//   差异——见比较器输出）。
// RNG：E 窗 fresh RNG(world.seed)（与 x86 HardmodeProbeHook.RunEventsWindow 的
//   fresh UnifiedRandom(SW_HM_SEED) 同口径）。每事件后按 x86 roll log 的 span 样本数
//   补掷 filler（SpawnOnPlayer wraith 搜索掷等 JS headless 不存在的消费）→ 后续事件
//   保持流锁步（UnifiedRandom 定长序列⇒只补数量即同态）。
// E4 前置：hardMode/祭坛在图（pre dump 已证,比较器 L0+祭坛计数）；shadowOrbCount=3
//   仅备案（直调不经门）；假人玩家盒 = x86 Main.player[0] 同位（出生点）。

const EV = RUN && process.env.SW_HM_EVENTS === '1';
const X86_EV_LOG = process.env.SW_HM_X86_ROLL ?? '';

/** x86 ev roll log → 每个 E1_n/E2_n span 的裸样本数（"X " 前缀=外来实例,不计） */
function x86SpanCounts(path: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (!path || !existsSync(path)) return counts;
  let cur: string | null = null;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.startsWith('MARK ')) {
      const m = /^MARK (E[12]_\d+)_(BEGIN|END)$/.exec(line);
      cur = m ? (m[2] === 'BEGIN' ? m[1]! : null) : null;
      continue;
    }
    if (cur !== null && line !== '' && !line.startsWith('X ')) {
      counts.set(cur, (counts.get(cur) ?? 0) + 1);
    }
  }
  return counts;
}

const isSolidSheetAt = (st: TileStore, idx: number): boolean => {
  const d = TILE_DEFS[st.type[idx]!];
  return !!d && d.solid;
};
const sheetOf = (st: TileStore, idx: number): number => TILE_DEFS[st.type[idx]!]?.vanilla?.sheet ?? -1;

/** E2_2：vanilla 序 dropMeteor+meteor 镜像（x 外 y 内循环、逐格掷序 1:1）。
 *  返回落点（与 x86 SW_EV 日志对账）。非掷分支（保护盒/上限）与原版同序。 */
function dropMeteorVanillaMirror(
  world: World, rng: RNG, log: string[],
): { i: number; j: number } | null {
  const st = world.store;
  const MET = TILE_BY_KEY['ore_meteorite']!;
  const CLOUD = new Set([189, 196, 460, 717, 718, 719, 202]);
  const inWorld = (x: number, y: number, pad: number) =>
    x >= pad && x < st.w - pad && y >= pad && y < st.h - pad;
  const solidAt = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const idx = st.idx(x, y);
    return (st.flags[idx]! & 1) === 1 && isSolidSheetAt(st, idx);
  };
  // 上限扫描（:6243-6260,地表以上 37 块 > 400×w/4200 → 拒）
  let cnt = 0;
  for (let x = 5; x < st.w - 5; x++) {
    for (let y = 5; y < world.groundLevel; y++) {
      if (st.type[st.idx(x, y)] === MET) cnt++;
    }
  }
  if (cnt > Math.floor(400 * st.w / 4200)) return null;
  // 假人玩家门（:6233-6241）：x86 侧 Main.player[0].active=true @出生点 → 玩家门恒开。
  // NPC 盒保护（:6324-6334）：x86 wraith 全部落在出生点 ±66 格内,候选 ≥8%×w=336 格外
  // → 70×70 候选盒永不相交,JS 传空数组为等价备案。
  let threshold = 600.0;
  const startDepth = Math.trunc(world.groundLevel * 0.3);
  let attempts = 0;
  while (true) {
    const band = st.w * 0.08;
    let x = rng.int(150, st.w - 151); // Next(150, maxTilesX-150)
    while (x > world.spawnX - band && x < world.spawnX + band) {
      x = rng.int(150, st.w - 151); // 原版无 guard 上限（重掷至出带为止）
    }
    let placed: { i: number; j: number } | null = null;
    for (let y = startDepth; y < st.h; y++) {
      if (!inWorld(x, y, 2)) continue;
      const idx = st.idx(x, y);
      const d = TILE_DEFS[st.type[idx]!];
      if ((st.flags[idx]! & 1) !== 1 || !d || !d.solid || !!d.platform) continue;
      // 30×30 打分（:6281-6311,x/y 各 ±15 上开区间;实心+1 云-100 液-1）
      let score = 0;
      for (let m = x - 15; m < x + 15; m++) {
        for (let n = y - 15; n < y + 15; n++) {
          if (!inWorld(m, n, 2)) continue;
          const k = st.idx(m, n);
          if (solidAt(m, n)) {
            score++;
            if (CLOUD.has(sheetOf(st, k))) score -= 100;
          } else if (st.liquid[k]! > 0) {
            score--;
          }
        }
      }
      if (score >= threshold) {
        // 保护判定在 meteor() 内（:6324-6376）；拒绝=flag=false → break 出列扫,阈值不衰减
        placed = meteorVanillaMirror(world, rng, log, x, y);
      } else {
        threshold -= 0.5;
      }
      break; // 原版扫到首块实心即评估后 break（未找到则整列无掷直落 num5++）
    }
    if (placed) return placed;
    if (threshold < 100.0) return null;
    attempts++;
    if (attempts >= st.w * 5) return null;
  }
}

/** vanilla meteor()（:6345-6508）x 外 y 内镜像；返回是否落成（保护拒绝=false） */
function meteorVanillaMirror(
  world: World, rng: RNG, log: string[], i: number, j: number,
): { i: number; j: number } | null {
  const st = world.store;
  const MET = TILE_BY_KEY['ore_meteorite']!;
  const DESTROY = new Set([5, 32, 352, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
  const PROTECTED = new Set([21, 467, 41, 43, 44, 677, 26, 226, 470, 475, 488, 597]);
  const inWorld = (x: number, y: number, pad: number) =>
    x >= pad && x < st.w - pad && y >= pad && y < st.h - pad;
  const solidAt = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const idx = st.idx(x, y);
    return (st.flags[idx]! & 1) === 1 && isSolidSheetAt(st, idx);
  };
  let num = 35;
  if (!inWorld(i - num, j - num, 10) || !inWorld(i + num, j + num, 10)) return null;
  // 保护块扫描（:6358-6376,70×70）
  for (let m = i - num; m < i + num; m++) {
    for (let n = j - num; n < j + num; n++) {
      if (!st.inBounds(m, n)) continue;
      if (PROTECTED.has(sheetOf(st, st.idx(m, n)))) return null;
    }
  }
  const set37 = (x: number, y: number, wasSolid: boolean): void => {
    const idx = st.idx(x, y);
    if (!wasSolid) st.flags[idx] = 0;   // active(false)——非实心=幽灵格
    st.type[idx] = MET;                 // type=37 无条件写（幽灵 37 为原版真态）
    st.half[idx] = 0;                   // ClearSlope
    st.slope[idx] = 0;
    st.paint[idx] = 0;                  // paintTile/paintCoatTile(…,0)
  };
  // ① 主体（:6381-6404）r=Next(17,23)：x 外 y 内！顶切 Next(-2,3)-5 每格恒掷,
  //    距离掷 Next(-4,5) 仅过顶切格掷——掷序=原版位次
  num = rng.int(17, 22);
  for (let x = i - num; x < i + num; x++) {
    for (let y = j - num; y < j + num; y++) {
      if (y <= j + rng.int(-2, 2) - 5) continue;
      const dx = Math.abs(i - x), dy = Math.abs(j - y);
      if (Math.sqrt(dx * dx + dy * dy) >= num * 0.9 + rng.int(-4, 4)) continue;
      set37(x, y, isSolidSheetAt(st, st.idx(x, y)));
    }
  }
  // ② 空腔（:6405-6420）r=Next(8,14)：仅失活（type 残留=原版 active(false) 语义）
  num = rng.int(8, 13);
  for (let x = i - num; x < i + num; x++) {
    for (let y = j - num; y < j + num; y++) {
      if (y <= j + rng.int(-2, 2) - 4) continue;
      const dx = Math.abs(i - x), dy = Math.abs(j - y);
      if (Math.sqrt(dx * dx + dy * dy) >= num * 0.8 + rng.int(-3, 4)) continue;
      const idx = st.idx(x, y);
      st.flags[idx] = 0;
      st.half[idx] = 0;
      st.slope[idx] = 0;
    }
  }
  // ③ 清理环（:6421-6450）r=Next(25,35)：无掷层（毁灭表 KillTile+清液+浮空修剪）
  num = rng.int(25, 34);
  for (let x = i - num; x < i + num; x++) {
    for (let y = j - num; y < j + num; y++) {
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      const dx = Math.abs(i - x), dy = Math.abs(j - y);
      if (Math.sqrt(dx * dx + dy * dy) < num * 0.7) {
        if ((st.flags[idx]! & 1) === 1 && DESTROY.has(sheetOf(st, idx))) {
          st.flags[idx] = 0; st.half[idx] = 0; st.slope[idx] = 0; // KillTile(stopDrops)
        }
        st.liquid[idx] = 0;
      }
      if (st.type[idx] === MET) {   // 原版裸读 type（含幽灵 37）不查 active
        if (!solidAt(x - 1, y) && !solidAt(x + 1, y) && !solidAt(x, y - 1) && !solidAt(x, y + 1)) {
          st.flags[idx] = 0;
        } else if ((st.half[idx]! !== 0 || (st.inBounds(x - 1, y) && (st.slope[st.idx(x - 1, y)]! === 1 || st.slope[st.idx(x - 1, y)]! === 2)))
          && !solidAt(x, y + 1)) {
          st.flags[idx] = 0;
        }
      }
      // SquareTileFrame/SquareWallFrame（帧面,不入 dump,跳过）
    }
  }
  // ④ 散布内环（:6451-6471）r=Next(23,32)：顶切掷每格恒掷→active 门→1/10 掷
  num = rng.int(23, 31);
  for (let x = i - num; x < i + num; x++) {
    for (let y = j - num; y < j + num; y++) {
      if (y <= j + rng.int(-3, 3) - 3) continue;
      if (!st.inBounds(x, y) || (st.flags[st.idx(x, y)]! & 1) !== 1) continue;
      if (rng.int(0, 9) !== 0) continue;
      const dx = Math.abs(i - x), dy = Math.abs(j - y);
      if (Math.sqrt(dx * dx + dy * dy) >= num * 0.8) continue;
      const idx = st.idx(x, y);
      if (DESTROY.has(sheetOf(st, idx))) { st.flags[idx] = 0; st.half[idx] = 0; st.slope[idx] = 0; }
      set37(x, y, true);
    }
  }
  // ⑤ 散布外环（:6472-6492）r=Next(30,38)：顶切掷→active 门→1/20 掷
  num = rng.int(30, 37);
  for (let x = i - num; x < i + num; x++) {
    for (let y = j - num; y < j + num; y++) {
      if (y <= j + rng.int(-2, 2)) continue;
      if (!st.inBounds(x, y) || (st.flags[st.idx(x, y)]! & 1) !== 1) continue;
      if (rng.int(0, 19) !== 0) continue;
      const dx = Math.abs(i - x), dy = Math.abs(j - y);
      if (Math.sqrt(dx * dx + dy * dy) >= num * 0.85) continue;
      const idx = st.idx(x, y);
      if (DESTROY.has(sheetOf(st, idx))) { st.flags[idx] = 0; st.half[idx] = 0; st.slope[idx] = 0; }
      set37(x, y, true);
    }
  }
  log.push(`meteor @(${i},${j})`);
  return { i, j };
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
  // ═══ ★NB-E：离散事件窗（SW_HM_EVENTS=1 才启用,canonical 口径零变化）═════════
  if (EV) {
    const st = world.store;
    const manifest: string[] = [];
    const evLog: string[] = [];
    const evCounts = x86SpanCounts(X86_EV_LOG);
    const rng = new RNG(world.seed); // = x86 RunEventsWindow fresh UnifiedRandom(SW_HM_SEED)
    const evRoll: string[] = [];
    let curTag: string | null = null;
    let curCount = 0;
    g.__swOnRoll = (value: number) => {
      if (curTag !== null) {
        curCount++;
        evRoll.push(String(value));
      }
    };
    const mark = (t: string): void => {
      evRoll.push(`MARK ${t}`);
    };
    const begin = (t: string): void => {
      mark(`${t}_BEGIN`);
      curTag = t;
      curCount = 0;
    };
    const end = (t: string): void => {
      curTag = null;
      mark(`${t}_END`);
      manifest.push(`${t} samples ${curCount}`);
      const xc = evCounts.get(t);
      if (xc !== undefined) {
        // filler：x86 span 内存在 JS headless 不存在的消费（SpawnOnPlayer wraith 搜索
        // 掷等）——UnifiedRandom 定长序列⇒补掷数量即同态,后续事件流锁步保持
        const filler = xc - curCount;
        manifest.push(`${t} filler ${filler}`);
        for (let f = 0; f < Math.max(0, filler); f++) rng.next();
      }
      dumpStore6(st, OUT, t);
    };
    // ── E1：祭坛砸链（headless SmashAltar 镜像,vanilla :49603 掷流序）──
    mark('E1_BEGIN');
    const ALTAR = TILE_INTERNAL_BY_SHEET.get(26)!;
    const anchors: Array<{ x: number; y: number }> = [];
    for (let x = 1; x < st.w - 1 && anchors.length < 16; x++) {
      for (let y = 1; y < st.h - 1; y++) {
        const idx = st.idx(x, y);
        if ((st.flags[idx]! & 1) !== 1 || st.type[idx] !== ALTAR) continue;
        if (!anchors.some((a) => Math.abs(a.x - x) <= 4 && Math.abs(a.y - y) <= 4)) {
          anchors.push({ x, y });
        }
        break;
      }
    }
    const nSmash = Math.min(4, anchors.length);
    manifest.push(`altars ${anchors.length} smash ${nSmash}`);
    for (const a of anchors) manifest.push(`altar ${a.x},${a.y}`);
    const SLOTS = [
      ['cobalt', 107, 221],
      ['mythril', 108, 222],
      ['adamantite', 111, 223],
    ] as const;
    for (let n = 1; n <= nSmash; n++) {
      const a = anchors[n - 1]!;
      begin(`E1_${n}`);
      const tier = world.altarCount % 3;                    // :49608
      const wave = Math.floor(world.altarCount / 3) + 1;    // :49609
      let num3 = (st.w / 4200) * 310 - 85 * tier;           // :49610-49612
      num3 *= 0.85;                                         // :49614
      num3 /= wave;                                         // :49615
      const slotDef = SLOTS[tier]!;
      const oreSheetPrev = world.savedOreTiers[slotDef[0]];
      let oreSheet = oreSheetPrev;
      if (oreSheet === -1) {
        oreSheet = rng.nextInt(2) === 0 ? slotDef[2] : slotDef[1]; // :49640 Next(2)==0 → 替代矿
        world.savedOreTiers[slotDef[0]] = oreSheet;
      }
      if (tier === 0) {
        if (oreSheet === slotDef[2]) num3 *= 0.8999999761581421; // :49643
        num3 *= 1.0499999523162842;                              // :49647
      } else if (oreSheet === slotDef[2]) {
        num3 *= 0.8999999761581421;                              // :49676/:49699
      }
      const band = tier === 0
        ? world.groundLevel
        : tier === 1
          ? world.rockLevel
          : (world.rockLevel + world.rockLevel + st.h) / 3;      // :49629/49625/:49627
      const ore = TILE_INTERNAL_BY_SHEET.get(oreSheet) ?? TILE_BY_KEY['ore_cobalt']!;
      let veins = 0;
      for (let k = 0; k < num3; k++) {                       // :49660 (double)k<num3 → ceil 语义
        const x = rng.int(100, st.w - 101);                  // :49661 Next(100, maxTilesX-100)
        const y = rng.int(Math.trunc(band), st.h - 151);     // :49666 Next((int)num8, maxTilesY-150)
        const strength = rng.int(5, 9);                      // :49675 Next(5, 9+num4)
        const steps = rng.int(5, 9);
        // ★祭坛矿走生产 oreRunner（TileRunner.ts 认证件,R8-10:OreRunner 非 TileRunner）
        oreRunner(st, rng, x, y, { strength, steps, type: ore, ntb: !!world.seedFlags?.notTheBees });
        veins++;
      }
      rng.nextInt(2); // :49775 Main.rand.Next(2)+1（wraith 数;headless 不生成实体,掷位保留）
      world.altarCount++;
      end(`E1_${n}`);
      manifest.push(`E1_${n} altar ${a.x},${a.y} tier ${tier} oreSheet ${oreSheet} veins ${veins} altarCount ${world.altarCount}`);
    }
    mark('E1_END');
    // ── E2：陨石坠落 ──
    mark('E2_BEGIN');
    begin('E2_1');
    // E2_1 = 生产等价面 MeteorFall.dropMeteor（Game.ts:8055 同款 host,随机源换 E 窗流）
    const host: MeteorHost = {
      w: st.w,
      h: st.h,
      spawnX: world.spawnX,
      groundLevel: world.groundLevel,
      rockLevel: world.rockLevel,
      store: st,
      players: [{ x: world.spawnX * 16 - 2, y: (world.spawnY - 3) * 16, w: 20, h: 42 }],
      npcs: [],
      rand: () => rng.next(),
      int: (a, b) => rng.int(a, b),
      announce: () => {},
    };
    const landed = dropMeteor(host);
    end('E2_1');
    manifest.push(`E2_1 landed ${landed ? `${landed.i},${landed.j}` : 'null'}`);
    begin('E2_2');
    // E2_2 = vanilla 序镜像（x 外 y 内+逐格掷序 1:1）——用于定位生产 placeMeteor
    // 循环序差异（生产为 y 外 x 内,掷值分配错位⇒形状统计等价但非逐位）
    const landed2 = dropMeteorVanillaMirror(world, rng, evLog);
    end('E2_2');
    manifest.push(`E2_2 landed ${landed2 ? `${landed2.i},${landed2.j}` : 'null'}`);
    mark('E2_END');
    writeFileSync(join(OUT, 'roll-js-ev.txt'), evRoll.join('\n') + '\n');
    writeFileSync(join(OUT, 'events-js.txt'), manifest.join('\n') + '\n');
    for (const l of manifest) console.log('[hm-probe-js] ' + l);
    for (const l of evLog) console.log('[hm-probe-js] ' + l);
  }
  g.__swOnRoll = prevHook;
}, 600000);
