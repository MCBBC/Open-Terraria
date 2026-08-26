// 一次性诊断（UUUUUUU 批）：液体域回放基座——从 _uuu-liq FULL resume dump
// （迭代 K 末完整 sim 状态）恢复 LiquidSim，逐次 updateLiquid 续跑并按 rig
// JJHook.OnUpdateLiquid 同布局发 FNV 指纹行。用于快速验证修复假设：
// 行序与 x86 /tmp/uuu-out/liqlog-*-win98.txt 第 K+1.. 行对齐即该窗全绿。
// 用法：cd game && SW_UUU_REPLAY=1 npx vitest run tools/_uuu-replay.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { UnifiedRandom, RNG } from '../src/core/rng';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import type { World } from '../src/world/World';

const RUN = process.env.SW_UUU_REPLAY === '1';
const DIR = process.env.SW_UUU_SRC ?? '/tmp/uuu-out/liqdump-js-k7';
const NITER = Number(process.env.SW_UUU_N ?? 40);
const OUT = process.env.SW_UUU_REPLAY_OUT ?? '/tmp/uuu-out/replay-lines.txt';

(RUN ? it : it.skip)('liquid replay from k-dump', async () => {
  const meta = JSON.parse(readFileSync(`${DIR}/meta.json`, 'utf8'));
  const rd = (n: string) => {
    const b = readFileSync(`${DIR}/${n}`);
    // 拷出独立 ArrayBuffer（Buffer 可能偏移共享池）
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  const bufs = {
    type: rd('type.bin'), flags: rd('flags.bin'), frameX: rd('frameX.bin'), frameY: rd('frameY.bin'),
    wall: rd('wall.bin'), liquid: rd('liquid.bin'), liquidType: rd('liquidType.bin'),
    half: rd('half.bin'), slope: rd('slope.bin'), wire: rd('wire.bin'),
  };
  const store = new (await import('../src/world/TileStore')).TileStore(meta.w, meta.h, bufs as never);
  const world = { store } as unknown as World;

  const sim = new LiquidSim(world);
  const s = sim as unknown as Record<string, unknown>;
  s.numLiquid = meta.numLiquid;
  s.bufCount = meta.bufCount;
  s.liquids = meta.liquids.map((e: number[]) => ({ x: e[0], y: e[1], kill: e[2], delay: e[3] }));
  s.checking = new Uint8Array(rd('checking.bin'));
  s.skip = new Uint8Array(rd('skip.bin'));
  (sim as unknown as { bufX: Int32Array; bufY: Int32Array }).bufX.set(meta.bufSliceX);
  (sim as unknown as { bufX: Int32Array; bufY: Int32Array }).bufY.set(meta.bufSliceY);
  s.cycles = meta.cycles;
  s.curMaxLiquid = meta.curMaxLiquid;
  s.wetCounter = meta.wetCounter;
  s.quickSettle = meta.quickSettle;
  s.quickFall = meta.quickFall;
  s.stuckCount = meta.stuckCount;
  s.stuckAmount = meta.stuckAmount;
  s.stuck = meta.stuck;
  s.solidNP = new Uint8Array(meta.solidNP);
  if (meta.rngSnap) {
    const ur = new UnifiedRandom(1);
    (ur as unknown as { seedArray: Int32Array }).seedArray = Int32Array.from(meta.rngSnap.seedArray);
    (ur as unknown as { inext: number }).inext = meta.rngSnap.inext;
    const rng = new RNG(1);
    (rng as unknown as { ur: UnifiedRandom }).ur = ur;
    s.passRng = rng;
    s.passRand = (max: number) => rng.nextInt(max);
  }
  sim.isGeneratingOrLoadingWorld = true;
  sim.generatingWorld = meta.generatingWorld ?? true;

  // 与探针同款 FNV（重新实现一份静态的）
  const fbuf = new ArrayBuffer(25000 * 14);
  const fdv = new DataView(fbuf);
  const fu8 = new Uint8Array(fbuf);
  const liqs = () => s.liquids as Array<{ x: number; y: number; delay: number; kill: number }>;
  function hash(): string {
    const nl = sim.numLiquid;
    const st = world.store;
    for (let k = 0; k < nl; k++) {
      const e = liqs()[k]!;
      const o = k * 14;
      fdv.setInt16(o, e.x, true);
      fdv.setInt16(o + 2, e.y, true);
      fdv.setInt32(o + 4, e.delay | 0, true);
      fdv.setInt32(o + 8, e.kill | 0, true);
      const ti = e.y * st.w + e.x;
      fu8[o + 12] = st.liquid[ti]!;
      fu8[o + 13] = st.liquidType[ti]! - 1;
    }
    let h = 2166136261;
    for (let b = 0; b < nl * 14; b++) {
      h ^= fu8[b]!;
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  const lines: string[] = [];
  // R30 触点记录（与 rig SW_R30LOG 同构：<n> <x> <y> <val>）
  const r30lines: string[] = [];
  (sim as unknown as { r30Trace: unknown }).r30Trace = (x: number, y: number, v: number, n1: number, lq: number, rq: number, slf: number) => {
    r30lines.push(`${r30lines.length + 1} ${x} ${y} ${v}`);
    void n1; void lq; void rq; void slf;
  };
  // RNG 调用记录 + 可选强制（SW_UUU_FORCE="idx:val,..."）——在 ret 记录已耗样本；
  // FORCE 在指定调用序号（1 基）覆写返回值
  const rngCalls: Array<{ idx: number; max: number; ret: number }> = [];
  const forceMap = new Map<number, number>();
  for (const kv of (process.env.SW_UUU_FORCE ?? '').split(',').filter(Boolean)) {
    const [a, b] = kv.split(':').map(Number);
    forceMap.set(a!, b!);
  }
  {
    const prng = s.passRng as RNG | undefined | null;
    if (prng) {
      const oNI = prng.nextInt.bind(prng);
      prng.nextInt = (max: number) => {
        let r = oNI(max);
        const callNo = rngCalls.length + 1;
        const f = forceMap.get(callNo);
        if (f !== undefined && max === 30) r = f;
        rngCalls.push({ idx: callNo, max, ret: r });
        return r;
      };
    }
  }
  // 可选：写迹窗（SW_UUU_TRACE_BOX="x0,x1,y0,y1[,iterFrom,iterTo]"）——世界 liquid/
  // type 字节每次变更记一行（before→after），限定盒与迭代区间。ctx=x,y;cur 来自 update 包裹
  const traceBox = process.env.SW_UUU_TRACE_BOX;
  const traceLines: string[] = [];
  let box: number[] | null = null;
  let trFrom = 1, trTo = NITER;
  // 写迹：update() 粒度，盒内 liquid/liquidType 前后差分（attr=e.x,y）
  const snapBox = () => {
    if (!box) return null;
    const out: Array<[number, number]> = [];
    for (let y = box[2]; y <= box[3]; y++) for (let x = box[0]; x <= box[1]; x++) {
      const i = y * meta.w + x;
      out.push([store.liquid[i]!, store.liquidType[i]!]);
    }
    return out;
  };
  if (traceBox) {
    const p = traceBox.split(',').map(Number);
    box = [p[0], p[1], p[2], p[3]];
    if (p.length >= 6) { trFrom = p[4]; trTo = p[5]; }
    const proto = Object.getPrototypeOf(sim) as unknown as Record<string, unknown>;
    const opu = proto.update as (this: LiquidSim, e: { x: number; y: number }) => void;
    proto.update = function (this: LiquidSim, e: { x: number; y: number }) {
      const activeNow = box !== null;
      if (!activeNow) return opu.call(this, e);
      const before = snapBox()!;
      const r = opu.call(this, e);
      const after = snapBox()!;
      const bw = box![1] - box![0] + 1;
      for (let k = 0; k < after.length; k++) {
        if (before[k]![0] !== after[k][0] || before[k]![1] !== after[k][1]) {
          const x = box![0] + (k % bw), y = box![2] + Math.floor(k / bw);
          traceLines.push(`it${meta.iter + itersDone} (${x},${y}) L${before[k]![0]}->${after[k][0]} T${before[k]![1]}->${after[k][1]} @(${e.x},${e.y})`);
        }
      }
      return r;
    };
  }
  let itersDone = 0;
  for (let i = 1; i <= NITER; i++) {
    sim.updateLiquid();
    itersDone++;
    lines.push(`I ${meta.iter + i} ${sim.numLiquid} ${(s.bufCount as number)} ${hash()}`);
  }
  if (box) writeFileSync((OUT ?? '/tmp/uuu-out/replay-lines.txt').replace(/\.txt$/, '-trace.txt'), traceLines.join('\n'));
  writeFileSync(OUT, lines.join('\n') + '\n');
  const r30 = rngCalls.filter((c) => c.max === 30);
  console.log(`[replay] ${NITER} iters from k=${meta.iter}: nl7=${meta.numLiquid} -> nl=${sim.numLiquid}; lines -> ${OUT}${box ? ` (+${traceLines.length} trace)` : ''}; calls=${rngCalls.length} r30=${r30.length}${r30.length ? ' firstR30@call' + r30[0]!.idx : ''}`);
  const trOut = (OUT ?? '/tmp/uuu-out/replay-lines.txt').replace(/\.txt$/, '-calls.txt');
  writeFileSync(trOut, rngCalls.map((c) => `${c.idx}\t${c.max}\t${c.ret}`).join('\n'));
  writeFileSync((OUT ?? '/tmp/uuu-out/replay-lines.txt').replace(/\.txt$/, '-r30.txt'), r30lines.join('\n'));
}, 300_000);
void readdirSync;
