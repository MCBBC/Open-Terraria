// IIIII49 一次性诊断（CELEB 收官）：#59 尾超掷收口仪。
// 在 reseed 标签窗 [UndergroundHousesAndBuriedChests → SurfaceChests) 内记录
// internalSample 主实例样本流 + __swHouseEv 小屋事件流 + 四计数快照。
// 用法：cd game && SW_I49=1 npx vitest run tools/_i49house.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG, UnifiedRandom } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';

// store 引用捕获：pass 窗口内任一 idx() 调用即登记实例
const StoreP = TileStore.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
const oIdx = StoreP.idx;
let storeRef: unknown = null;
StoreP.idx = function (this: unknown, ...a: unknown[]) {
  if (!storeRef) storeRef = this;
  return (oIdx as unknown as (...a: unknown[]) => unknown).apply(this, a);
};

const RUN = process.env.SW_I49 === '1';
const SEED = process.env.SW_I49_SEED ?? '1999040562';

(RUN ? it : it.skip)('I49 house window exporter', async () => {
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const URp = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const oInternal = URp.internalSample as (this: unknown) => number;
  if (!oInternal) throw new Error('internalSample 不可访问');

  let recording = false;
  let winInst: unknown = null;
  let xtra = 0;               // 窗内异实例样本计数
  const out: string[] = [];   // idx|value|tag
  const evs: string[] = [];   // sampleIdx|phase|x|y
  let idx = 0;
  let closed = false;
  // 槽末快照（bundle 尾≈slot59 出口）：墙/型两通道
  let snap: null | { w: string; t: string; W: number; H: number } = null;

  // ---- __swHouseEv 钩（vanilla/CaveHousePass.ts 已埋 dorm）----
  (globalThis as { __swHouseEv?: unknown }).__swHouseEv = (phase: string, x: number, y: number) => {
    if (!recording || closed) return;
    evs.push(`${idx}|${phase}|${x}|${y}`);
  };
  // JJJJ 门级归因：每失败一次的 gate 名
  const evg: string[] = [];
  (globalThis as { __swHouseGate?: unknown }).__swHouseGate = (gate: string, x: number, y: number) => {
    if (!recording || closed) return;
    evg.push(`${idx}|${gate}|${x}|${y}`);
  };
  // 阶段探针（bld/er/st/ch/bt…）
  const evs_: string[] = [];
  (globalThis as { __swHouseStage?: unknown }).__swHouseStage =
    (tag: string, a: number, b: number, c: number, d: number) => {
      if (!recording || closed) return;
      evs_.push(`${idx}|${tag}|${a}|${b}|${c}|${d}`);
    };
  void evs_;
  void evg;
  (globalThis as { __i49Stages?: unknown }).__i49Stages = evs_;

  const TAGS: Array<[RegExp, string]> = [
    [/runCaveHousesPass/, 'CH.main'],
    [/placeHouse/, 'CH.place'],
    [/createRooms/, 'CH.rooms'],
    [/runBuriedChestsPass/, 'BC.loop1'],
    [/runUnderworldChestsPass/, 'UW.loop2'],
    [/rollHouseChestCounts/, 'counts'],
    [/findRoom/, 'CH.findRoom'],
    [/genBiggerAbandonedHouses/, 'bigger'],
  ];
  const tagOf = (): string => {
    const stack = new Error().stack ?? '';
    for (const line of stack.split('\n')) {
      for (const [re, name] of TAGS) if (re.test(line)) return name;
      const m = line.match(/src\/world\/gen\/([\w./]+\.ts):\d+/);
      if (m) return m[1];
    }
    return '?';
  };

  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let lab = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_i49')) { lab = labelOf(m[1], Number(m[2])); break; }
    }
    if (recording && !closed && lab === 'SurfaceChests') {
      writeFileSync('/tmp/iii50-out/js-p59.txt', out.join('\n'));
      writeFileSync('/tmp/iii50-out/js-house.txt', evs.join('\n'));
      writeFileSync('/tmp/iii50-out/js-house-gates.txt', evg.join('\n'));
      const stages = (globalThis as { __i49Stages?: string[] }).__i49Stages ?? [];
      writeFileSync('/tmp/iii50-out/js-house-stages.txt', stages.join('\n'));
      // ★此刻=pass 59 出口（下一子槽 reseed 前）：store 现场快照（若已捕获）
      const s = storeRef as { wall: Uint16Array; type: Uint16Array; paint: Uint8Array;
        flags: Uint8Array; liquid: Uint8Array; liquidType: Uint8Array; w: number; h: number } | null;
      if (s) {
        const cp = (a: Uint8Array | Uint16Array) =>
          Buffer.from(a.buffer, a.byteOffset, a.byteLength);
        writeFileSync('/tmp/iii50-out/js-snap-wall.bin', cp(s.wall));
        writeFileSync('/tmp/iii50-out/js-snap-type.bin', cp(s.type));
        writeFileSync('/tmp/iii50-out/js-snap-paint.bin', Buffer.from(s.paint));
        writeFileSync('/tmp/iii50-out/js-snap-flags.bin', Buffer.from(s.flags));
        writeFileSync('/tmp/iii50-out/js-snap-liq.bin', Buffer.from(s.liquid));
        writeFileSync('/tmp/iii50-out/js-snap-lt.bin', Buffer.from(s.liquidType));
        console.log(`[i49] snapshot @close ${s.w}x${s.h}`);
      }
      console.log(`[i49] closed @${lab} samples=${out.length} xtra=${xtra} events=${evs.length} gates=${evg.length}`);
      closed = true; recording = false;
      (globalThis as { __swHouseEv?: unknown }).__swHouseEv = undefined;
      (globalThis as { __swHouseGate?: unknown }).__swHouseGate = undefined;
    }
    if (!recording && lab === 'UndergroundHousesAndBuriedChests') {
      recording = true; idx = 0; xtra = 0; closed = false;
      // gs 常量快照（离线重放 harness 用）：经 storeRef 拿不到 gs，改由 ctxGs 模块内共享态？
      console.log(`[i49] opened @${lab}`);
    }
    return oReseed.call(this, s);
  };

  URp.internalSample = function (this: unknown): number {
    const v = oInternal.call(this);
    if (recording && !closed) {
      if (winInst === null) winInst = this;
      if ((this as unknown) !== winInst) { xtra++; return v; }
      out.push(`${idx}|${v}|${tagOf()}`);
      idx++;
    }
    return v;
  };

  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: 0,
    seedFlags: { tenthAnniversary: true },
  });
  StoreP.idx = oIdx as (...a: unknown[]) => unknown;
  void snap;
  console.log(`[i49] final samples=${out.length} xtra=${xtra}`);
  RNGp.reseed = oReseed;
  URp.internalSample = oInternal;
}, 900_000);

import { readFileSync } from 'node:fs';
function labelOf(file: string, line: number): string {
  const src = readFileSync(file, 'utf8').split('\n');
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return '';
}
