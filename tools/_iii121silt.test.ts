// IIII121 批一次性诊断：ddual #25 Silt 前沿反演重放。
// 基座=x86 真值（G2 /tmp/iii84-out/x86-i78-ddual 八通道 dump hydrate），只跑 JS 单窗：
//   A 窗（sanity）：hydrate 023_Floating_Islands → runDirtToMudPass → 对拍 024_Dirt_To_Mud
//   B 窗（主靶）：hydrate 024_Dirt_To_Mud      → runSiltPass       → 对拍 025_Silt
// mile8 全管线基线：B 窗差 T59>123×992（X 泥 / J 淤泥）且无反向对。反演重放把窗口隔离：
// 本地复现同一差集 ⇒ 凶手在 Silt 执行体；零差 ⇒ 上游不可见态。
// 用法：cd game && SW_I121=1 npx vitest run tools/_iii121silt.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runDirtToMudPass, runSiltPass } from '../src/world/gen/vanilla/DirtToMudPass';

const RUN = process.env.SW_I121 === '1';
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
const BYSHEET = new Int32Array(1024).fill(-1);   // vanilla sheet → SW id（首个声明者）
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') {
    SHEET[i] = s;
    if (s >= 0 && s < 1024 && BYSHEET[s] < 0) BYSHEET[s] = i;
  }
}
// dump.typ(raw type) → SW id（sheet 0=泥土也要走表）
function xToSw(v: number): number {
  const m = v >= 1024 ? v & 255 : v;
  const hit = m < 1024 ? BYSHEET[m] : -1;
  if (hit >= 0) return hit;
  return v & 255;   // 无注册表项时保留原值占位（仅空气格幽灵可能遇到）
}

/** x86 dump hydrate：act→flags(bit0)，typ(vanilla→SW 反演)/wal 直灌，half/slope/liq 灌 */
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
  // lty 是 vanilla 0 基，JS liquidType 内部 +1 基
  const lty = u8(`${p}.lty`);
  const lt = rec.liquidType as Uint8Array;
  for (let i = 0; i < lty.length; i++) lt[i] = lty[i]! > 0 ? lty[i]! + 1 : 0;
  return st;
}

(RUN ? it : it.skip)('IIII121 silt-window inversion replay vs G2', async () => {
  const gsj = JSON.parse(readFileSync('/tmp/iii99-out/cap-ddual/base_gs.json', 'utf8')) as Record<string, unknown>;
  const seedNum = Number(gsj.seed);
  const wsNum = Number(gsj.worldSurface);
  const rlLow = Number(gsj.rockLevelLow);
  const rlHigh = Number(gsj.rockLevelHigh);
  const rl = Number(gsj.rockLevel);
  const wl = Number(gsj.waterLine);
  const ll = Number(gsj.lavaLine);
  console.log(`[i121] seed=${seedNum} worldSurface=${wsNum} rockLow=${rlLow} rockHigh=${rlHigh} rock=${rl} water=${wl} lava=${ll}`);

  const mkGs = (): GenState => ({
    seedFlags: { dualDungeons: true },
    worldSurface: wsNum,
    rockLevelLow: rlLow,
    rockLevelHigh: rlHigh,
    rockLevel: rl,
    waterLine: wl,
    lavaLine: ll,
    beachDistance: 380,
    seed: seedNum,
  } as unknown as GenState);

  const diffStat = (name: string, st: TileStore, idx: number, nm: string) => {
    const xt = le16(`${pre(idx, nm)}.typ`);
    const xa = u8(`${pre(idx, nm)}.act`);
    const t = st.type, f = st.flags;
    let n = 0;
    const buckets = new Map<string, number>();
    const samples: string[] = [];
    for (let i = 0; i < W * H; i++) {
      const va = xa[i]!;
      const vt = va ? xt[i]! : 0;
      const ja = f[i]! & 1;
      const jt = ja ? (SHEET[t[i]!] >= 0 ? SHEET[t[i]!]! : 9999) : 0;
      if (vt !== jt) {
        n++;
        const k = `${vt}>${jt}`;
        buckets.set(k, (buckets.get(k) ?? 0) + 1);
        if (samples.length < 6) samples.push(`(${i % W},${(i / W) | 0}) v${vt} j${jt}`);
      }
    }
    console.log(`[i121] ${name}: diff=${n}`);
    for (const [k, v] of [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`      ${k} ×${v}`);
    }
    if (samples.length) console.log(`      samples: ${samples.join(' | ')}`);
    return n;
  };

  // ── A 窗（sanity）：hydrate 023_Floating_Islands → DirtToMud → 对拍 024 ──
  if (!process.env.SW_I121_SKIP_A) {
    const stA = hydrate(23, 'Floating_Islands');
    runDirtToMudPass(stA, new RNG(seedNum), mkGs());
    diffStat('A:DirtToMud(hydrate-023 vs x24)', stA, 24, 'Dirt_To_Mud');
  }
  // ── B 窗（主靶）：hydrate 024_Dirt_To_Mud → Silt → 对拍 025_Silt ──
  // ★种子敏感性实验：SW_I121_MULTI=N 时用 N 个伪种子各跑一遍，统计差异体量分布——
  //   稳定>0 ⇒ 结构性代码差；多数为 0 少数爆 ⇒ 概率性边界（浮点/谓词）效应。
  const multi = Number(process.env.SW_I121_MULTI ?? 0);
  if (multi > 0) {
    for (let t = 0; t < multi; t++) {
      const sn = Number(process.env.SW_I121_SEEDBASE ?? '100000007') + t * 7919;
      const stT = hydrate(24, 'Dirt_To_Mud');
      const n0 = new Map<string, number>();
      runSiltPass(stT, new RNG(sn), mkGs());
      const cnt = diffStat(`T${t}:silt(seed=${sn})`, stT, 25, 'Silt');
      void n0;
    }
    return;
  }
  const calls: string[] = [];
  (globalThis as { __swTrCall?: (o: Record<string, unknown>) => void }).__swTrCall = (o) => {
    calls.push(`${calls.length}|${Math.round(Number(o.i))}|${Math.round(Number(o.j))}|${Number(o.strength).toFixed(2)}|${Math.round(Number(o.steps))}`);
  };
  const stB = hydrate(24, 'Dirt_To_Mud');
  runSiltPass(stB, new RNG(seedNum), mkGs());
  delete (globalThis as { __swTrCall?: unknown }).__swTrCall;
  console.log(`[i121] runner ledger lines=${calls.length}`);
  writeFileSync('/tmp/iii121-out/silt-call-ledger.txt', calls.join('\n') + '\n');
  diffStat('B:Silt(hydrate-024 vs x25)', stB, 25, 'Silt');

  // ── 差集几何/归属解剖：导出 992 格集合供离线分析 ──
  {
    const xt = le16(`${pre(25, 'Silt')}.typ`);
    const xa = u8(`${pre(25, 'Silt')}.act`);
    const t = stB.type, f = stB.flags;
    const out: string[] = [];
    for (let i = 0; i < W * H; i++) {
      const va = xa[i]!;
      const vt = va ? xt[i]! : 0;
      const ja = f[i]! & 1;
      const jt = ja ? (SHEET[t[i]!] >= 0 ? SHEET[t[i]!]! : 9999) : 0;
      if (vt !== jt) out.push(`${i % W},${(i / W) | 0},${vt},${jt}`);
    }
    writeFileSync('/tmp/iii121-out/silt-diff-cells.txt', out.join('\n') + '\n');
    console.log(`[i121] diff cells exported=${out.length}`);
  }
}, 600_000);

// ── II 波：hydrator 自检（不加任何 pass）──
(RUN ? it : it.skip)('IIII121b hydrate self-check', () => {
  const gsj = JSON.parse(readFileSync('/tmp/iii99-out/cap-ddual/base_gs.json', 'utf8')) as Record<string, unknown>;
  const seedNum = Number(gsj.seed);
  const mkGs = (): GenState => ({ seedFlags: { dualDungeons: true }, worldSurface: Number(gsj.worldSurface), rockLevelLow: Number(gsj.rockLevelLow), rockLevelHigh: Number(gsj.rockLevelHigh), rockLevel: Number(gsj.rockLevel), waterLine: Number(gsj.waterLine), lavaLine: Number(gsj.lavaLine), beachDistance: 380, seed: seedNum } as unknown as GenState);
  const diffStat = (name: string, st: TileStore, idx: number, nm: string) => {
    const xt = le16(`${pre(idx, nm)}.typ`);
    const xa = u8(`${pre(idx, nm)}.act`);
    const t = st.type, f = st.flags;
    let n = 0, eqA = 0;
    const buckets = new Map<string, number>();
    for (let i = 0; i < W * H; i++) {
      const va = xa[i]!, ja = f[i]! & 1;
      if (va === ja) eqA++;
      const vt = va ? xt[i]! : 0;
      const jt = ja ? (SHEET[t[i]!] >= 0 ? SHEET[t[i]!]! : 9999) : 0;
      if (vt !== jt) { n++; const k = `${vt}>${jt}`; buckets.set(k, (buckets.get(k) ?? 0) + 1); }
    }
    console.log(`[i121b] ${name}: diff=${n} actEq=${eqA}/${W * H}`);
    for (const [k, v] of [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`      ${k} ×${v}`);
    return n;
  };
  // 基座自差（恒 0）
  diffStat('self:hydrate-024 vs 024', hydrate(24, 'Dirt_To_Mud'), 24, 'Dirt_To_Mud');
  // 邻窗过渡量（应 ≈ x86 已知 DTM 窗变化，仅作参考标定）
  diffStat('ref:hydrate-023 vs x24(no run)', hydrate(23, 'Floating_Islands'), 24, 'Dirt_To_Mud');
  void mkGs;
});

// ── III 波：runner 级归属解剖（把差集归到具体 runner 调用）──
(RUN ? it : it.skip)('IIII121c runner attribution', () => {
  const gsj = JSON.parse(readFileSync('/tmp/iii99-out/cap-ddual/base_gs.json', 'utf8')) as Record<string, unknown>;
  const seedNum = Number(gsj.seed);
  const mkGs = (): GenState => ({ seedFlags: { dualDungeons: true }, worldSurface: Number(gsj.worldSurface), rockLevelLow: Number(gsj.rockLevelLow), rockLevelHigh: Number(gsj.rockLevelHigh), rockLevel: Number(gsj.rockLevel), waterLine: Number(gsj.waterLine), lavaLine: Number(gsj.lavaLine), beachDistance: 380, seed: seedNum } as unknown as GenState);
  // 差集
  const diffLines = readFileSync('/tmp/iii121-out/silt-diff-cells.txt', 'utf8').trim().split('\n');
  const diffSet = new Set(diffLines.map((l) => { const [x, y] = l.split(',').map(Number); return y * W + x; }));
  console.log(`[i121c] diff cells=${diffSet.size}`);
  // 台账重放：逐 runner 单独执行于窗口隔离副本，收集其写集与差集交叠
  const calls: Array<Record<string, number | boolean>> = [];
  (globalThis as { __swTrCall?: (o: Record<string, unknown>) => void }).__swTrCall = (o) => {
    calls.push({ i: Number(o.i), j: Number(o.j), type: Number(o.type), strength: Number(o.strength), steps: Number(o.steps) });
  };
  const stB = hydrate(24, 'Dirt_To_Mud');
  const gs = mkGs();
  const rng = new RNG(seedNum);
  // 手动镜像 runSiltPass 循环以获得「第几个调用」相位（队列参数链与生产完全一致）
  const ownerCount = new Map<number, number>();
  let callIdx = 0;
  const hitRuns: string[] = [];
  const doRunner = (i: number, j: number, o: Record<string, unknown>) => {
    const tileRunnerMod = require('../src/world/gen/vanilla/TileRunner') as typeof import('../src/world/gen/vanilla/TileRunner');
    void tileRunnerMod;
    throw new Error('placeholder');
  };
  void doRunner;
  void ownerCount; void hitRuns; void callIdx; void rng; void gs; void stB; void diffSet; void calls;
});

import { FRAME_IMPORTANT_SKIP_SHEETS } from '../src/world/gen/vanilla/TileRunner';
const FRAMED_SKIP_LOCAL = new Uint8Array(TILE_DEFS.length);
for (let _i = 0; _i < TILE_DEFS.length; _i++) {
  const _s = TILE_DEFS[_i]?.vanilla?.sheet;
  if (typeof _s === 'number' && FRAME_IMPORTANT_SKIP_SHEETS.has(_s)) FRAMED_SKIP_LOCAL[_i] = 1;
}
// ── IV 波：真值步态仪对拍（__swTrStep 实测 vs 解析重放）──
(RUN ? it : it.skip)('IIII121d step-truth autopsy', () => {
  const gsj = JSON.parse(readFileSync('/tmp/iii99-out/cap-ddual/base_gs.json', 'utf8')) as Record<string, unknown>;
  const seedNum = Number(gsj.seed);
  const mkGs = (): GenState => ({ seedFlags: { dualDungeons: true }, worldSurface: Number(gsj.worldSurface), rockLevelLow: Number(gsj.rockLevelLow), rockLevelHigh: Number(gsj.rockLevelHigh), rockLevel: Number(gsj.rockLevel), waterLine: Number(gsj.waterLine), lavaLine: Number(gsj.lavaLine), beachDistance: 380, seed: seedNum } as unknown as GenState);

  // 实例级骰流记录
  type Tr = { op: string; a: number[]; r: number };
  const trace: Tr[] = [];
  const runStarts: number[] = [];
  const calls: Array<{ i: number; j: number; st: number; sp: number }> = [];
  const realSteps: Array<Array<{ iter: number; px: number; py: number; vx: number; vy: number; num1: number; rolled: number }>> = [];
  let curRun = -1;
  (globalThis as { __swTrCall?: (o: Record<string, unknown>) => void }).__swTrCall = (o) => {
    runStarts.push(trace.length);
    calls.push({ i: Math.round(Number(o.i)), j: Math.round(Number(o.j)), st: Number(o.strength), sp: Math.round(Number(o.steps)) });
    curRun++;
    realSteps.push([]);
  };
  (globalThis as { __swTrStep?: unknown }).__swTrStep = () => undefined;
  const mkLoggedRng = (): RNG => {
    const r = new RNG(seedNum);
    const self = r as unknown as { int: (a: number, b: number) => number };
    const oInt = self.int.bind(r);
    self.int = (a: number, b: number) => {
      const v = oInt(a, b);
      trace.push({ op: 'int', a: [a, b], r: v });
      if (curRun >= 0 && a[0] === -10 && a[1] === 10) void v;
      return v;
    };
    return r;
  };
  const stTruth = hydrate(24, 'Dirt_To_Mud');
  const stB2 = stTruth;
  void stB2;
  // 挂步态接收器（TileRunner 每迭代末上报）
  const g = globalThis as { __swI121Step?: (o: Record<string, unknown>) => void };
  g.__swI121Step = (o) => {
    realSteps[curRun]!.push({ iter: Number(o.iter), px: Number(o.px), py: Number(o.py), vx: Number(o.vx), vy: Number(o.vy), num1: Number(o.num1), rolled: Number(o.rolled) });
  };
  // 生产 TileRunner 的步态钩是 __swTrStep，此探针借 __swTrStep 转投：
  (globalThis as { __swTrStep?: unknown }).__swTrStep = (o) => { g.__swI121Step!(o as Record<string, unknown>); };

  runSiltPass(stTruth, mkLoggedRng(), mkGs());
  delete (globalThis as { __swTrStep?: unknown }).__swTrStep;
  delete g.__swI121Step;
  delete (globalThis as { __swTrCall?: unknown }).__swTrCall;
  runStarts.push(trace.length);
  console.log(`[i121d2] calls=${calls.length} trace=${trace.length} runsWithSteps=${realSteps.filter((r) => r.length > 0).length}`);

  // ── 解析重放对比：逐 runner、逐迭代 rolled 计数与轨迹 ──
  const N_RUNS = Math.min(calls.length, realSteps.length);
  let badRuns = 0;
  const firstBadSamples: string[] = [];
  for (let k = 0; k < N_RUNS; k++) {
    const c = calls[k]!;
    const s0 = runStarts[k]!;
    const s1 = runStarts[k + 1] ?? trace.length;
    let cursor = s0;
    const stSelf = stTruth!;
    let px = c.i, py = c.j;
    let vx = trace[s0 - 3]!.r * 0.1;
    let vy = trace[s0 - 2]!.r * 0.1;
    let num1 = c.st, num2 = c.sp;
    const rs = realSteps[k]!;
    let brokeAt = -1;
    let iterNo = 0;
    while (cursor < s1 && num2 > 0 && cursor < trace.length) {
      num1 = c.st * (num2 / c.sp);
      num2--;
      const x0 = Math.max(1, Math.floor(px - num1 * 0.5));
      const x1 = Math.min(W - 1, Math.floor(px + num1 * 0.5));
      const y0 = Math.max(1, Math.floor(py - num1 * 0.5));
      const y1 = Math.min(H - 1, Math.floor(py + num1 * 0.5));
      // ★III 波修正：pre-dice 跳格（FRAMED_SKIP 家族）不耗骰——必须按真实内容建模
      let expectRolled = 0;
      for (let xq = x0; xq < x1; xq++) {
        for (let yq = y0; yq < y1; yq++) {
          const qi = yq * W + xq;
          if ((stSelf.flags[qi] & 1) && FRAMED_SKIP_LOCAL[stSelf.type[qi]]) continue;
          if ((stSelf.flags[qi] & 1) && SHEET[stSelf.type[qi]] === 165) void qi;
          expectRolled++;
        }
      }
      iterNo++;
      const want = rs[iterNo - 1];
      if (!want || want.rolled !== expectRolled) {
        brokeAt = iterNo;
        if (firstBadSamples.length < 8) {
          firstBadSamples.push(`run${k}@(${c.i},${c.j})st${c.st}/sp${c.sp} iter${brokeAt}: simRolled=${expectRolled}(bbox ${x0},${x1},${y0},${y1}) real=${want ? `${want.rolled} px${want.px.toFixed(3)},py${want.py.toFixed(3)},n1${want.num1.toFixed(3)}` : '(none)'}`);
        }
        break;
      }
      for (let i2 = 0; i2 < expectRolled; i2++) cursor++;
      px += vx; py += vy;
      if (num1 > 50) {
        for (const thrL of [50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900]) {
          if (num1 > thrL) { px += vx; py += vy; num2--; vy += trace[cursor++]!.r * 0.05; vx += trace[cursor++]!.r * 0.05; } else break;
        }
      }
      vx += trace[cursor++]!.r * 0.05;
      if (vx > 1) vx = 1; else if (vx < -1) vx = -1;
      vy += trace[cursor++]!.r * 0.05;
      if (vy > 1) vy = 1; else if (vy < -1) vy = -1;
    }
    if (brokeAt >= 0 || cursor !== s1) badRuns++;
  }
  console.log(`[i121d2] sim-vs-real: badRuns=${badRuns}/${N_RUNS}`);
  for (const l of firstBadSamples) console.log(`   ${l}`);
}, 600_000);
