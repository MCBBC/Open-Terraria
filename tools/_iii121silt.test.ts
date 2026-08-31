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
import { TILE_BY_KEY } from '../src/data/tiles';
import { canBeClearedDuringGenerationDual, dualDungeonState, setupDualDungeonTileProtection } from '../src/world/gen/vanilla/DungeonStyles1457';
import { tileRunner, FRAME_IMPORTANT_SKIP_SHEETS } from '../src/world/gen/vanilla/TileRunner';


const FRAME_IMP = new Set<number>(FRAME_IMPORTANT_SKIP_SHEETS);

/** 探针侧双地牢态装配（cap-ddual base_dual.json 同源——与全管线 Dunes 头等价） */
function setupProbeDualState(): void {
  const du = JSON.parse(readFileSync('/tmp/iii99-out/cap-ddual/base_dual.json', 'utf8')) as {
    enabled: boolean;
    potentialBounds: Array<{ l: number; t: number; r: number; b: number }>;
    dungeons: Array<{ theme: number }>;
  };
  dualDungeonState.enabled = du.enabled;
  dualDungeonState.potentialBounds = du.potentialBounds as never;
  if (!du.dungeons || du.dungeons.length < 2) return;
  setupDualDungeonTileProtection(du.dungeons[0]!.theme, du.dungeons[1]!.theme, false);
  void canBeClearedDuringGenerationDual;
}

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
  setupProbeDualState();
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


// ── V 波：真值步态驱动重放（最终定谳仪）──
// 真值事件（__swTrStep 每迭代 px/py/n1/rolled/skips，移动前快照——与引擎语义一致）
// + 原始骰流逐格配对 ⇒ 完整重建接受集合。与引擎写集（before/after 差）互证。
(RUN ? it : it.skip)('IIII121f truth-driven margin autopsy', () => {
  const gsj = JSON.parse(readFileSync('/tmp/iii99-out/cap-ddual/base_gs.json', 'utf8')) as Record<string, unknown>;
  const seedNum = Number(gsj.seed);
  const mkGs = (): GenState => ({ seedFlags: { dualDungeons: true }, worldSurface: Number(gsj.worldSurface), rockLevelLow: Number(gsj.rockLevelLow), rockLevelHigh: Number(gsj.rockLevelHigh), rockLevel: Number(gsj.rockLevel), waterLine: Number(gsj.waterLine), lavaLine: Number(gsj.lavaLine), beachDistance: 380, seed: seedNum } as unknown as GenState);
  // 差集
  const diffSet = new Set<number>();
  for (const l of readFileSync('/tmp/iii121-out/silt-diff-cells.txt', 'utf8').trim().split('\n')) {
    const q = l.split(',').map(Number);
    diffSet.add(q[1]! * W + q[0]!);
  }
  // 真值事件采集
  type Ev = { k: number; iter: number; px: number; py: number; num1: number; rolled: number; skips: number };
  const evAll: Array<Array<Ev>> = [];
  {
    const gs = mkGs();
    const stThrowaway = hydrate(24, 'Dirt_To_Mud');
    let kr = -1;
    const gg = globalThis as { __swTrCall?: unknown; __swTrStep?: unknown };
    gg.__swTrCall = () => { kr++; evAll.push([]); };
    gg.__swTrStep = (o0) => {
      const o = o0 as Record<string, number>;
      evAll[kr]!.push({ k: kr, iter: o.iter!, px: o.px!, py: o.py!, num1: o.num1!, rolled: o.rolled!, skips: o.skips! });
    };
    runSiltPass(stThrowaway, new RNG(seedNum), gs);
    delete gg.__swTrStep;
    delete gg.__swTrCall;
  }
  console.log(`[i121f2] runs=${evAll.length}`);
  const callsL = readFileSync('/tmp/iii121-out/silt-call-ledger.txt', 'utf8').trim().split('\n').map((l) => l.split('|').map(Number));
  const startsTxt = readFileSync('/tmp/iii121-out/silt-run-starts.txt', 'utf8').trim().split('\n');
  const traceR = readFileSync('/tmp/iii121-out/silt-roll-trace.txt', 'utf8').trim().split('\n').map((l) => Number(l.split('|')[3]));
  const starts = startsTxt.map((l) => Number(l.split('|')[1]));

  const SILT = TILE_BY_KEY['silt']!;
  const gs2 = mkGs();
  void gs2;
  const st = hydrate(24, 'Dirt_To_Mud');
  const beforeType = st.type.slice();
  const tf = st.flags, ty = st.type;

  type Rec = { k: number; iter: number; px: number; py: number; dist: number; thr: number; draw: number };
  const recMap = new Map<number, Rec[]>();      // 仅差集格的接受记录
  const acceptAll = new Set<number>();
  const acceptOwner = new Int32Array(W * H).fill(-1);   // 最后接受者 run
  let cursor = 0;
  let mismatchRuns = 0;
  for (let k = 0; k < callsL.length; k++) {
    const c = callsL[k]!;
    const ev = evAll[k]!;
    cursor = starts[k]!;
    let vx = traceR[starts[k]! - 3]! * 0.1;
    let vy = traceR[starts[k]! - 2]! * 0.1;
    const take = (): number => traceR[cursor++]!;
    for (const e of ev) {
      const num1 = e.num1;
      const px = e.px, py = e.py;
      const x0 = Math.max(1, Math.floor(px - num1 * 0.5));
      const x1 = Math.min(W - 1, Math.floor(px + num1 * 0.5));
      const y0 = Math.max(1, Math.floor(py - num1 * 0.5));
      const y1 = Math.min(H - 1, Math.floor(py + num1 * 0.5));
      let expectRolled = 0;
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const qi = y * W + x;
          if ((tf[qi] & 1)) {
            const sh = SHEET[ty[qi]];
            if (sh >= 0 && FRAME_IMP.has(sh)) continue;
          }
          expectRolled++;
          const dist = Math.abs(x - px) + Math.abs(y - py);
          const draw = take();
          const thr = num1 * 0.5 * (1 + draw * 0.015);
          if (dist >= thr) continue;
          acceptAll.add(qi);
          acceptOwner[qi] = k;
          if (diffSet.has(qi)) {
            const arr = recMap.get(qi) ?? [];
            arr.push({ k, iter: e.iter, px, py, dist, thr, draw });
            recMap.set(qi, arr);
          }
          ty[qi] = SILT;
        }
      }
      if (expectRolled !== e.rolled || ((x1 - x0) > 0 && (y1 - y0) > 0 && (x1 - x0) * (y1 - y0) - expectRolled !== e.skips)) {
        mismatchRuns++;
        if (mismatchRuns <= 6) console.log(`  [BAD] run#${k} iter${e.iter}: modeled=${expectRolled} real=${e.rolled} bbox=(${x0},${x1},${y0},${y1})`);
        cursor += e.rolled - expectRolled;
      }
      vx += take() * 0.05;
      if (vx > 1) vx = 1; else if (vx < -1) vx = -1;
      vy += take() * 0.05;
      if (vy > 1) vy = 1; else if (vy < -1) vy = -1;
    }
  }
  console.log(`[i121f2] done cursor=${cursor}/${traceR.length} mismatchRuns=${mismatchRuns} acceptAll=${acceptAll.size}`);

  // 逐格决策仪（run58 抽样对拍）
  {
    const TRGT2 = 58;
    const gg = globalThis as { __swTrCell?: (seq: number, o: Record<string, number>) => void; __swTrRunSeq?: { v: number }; __swTrCall?: unknown };
    const seq = { v: -1 };
    gg.__swTrRunSeq = seq;
    gg.__swTrCall = () => { seq.v++; };
    const cellsRec: Array<{ ti: number; x: number; y: number; px: number; py: number; n1: number; dist: number; draw: number }> = [];
    gg.__swTrCell = (r, o) => { if (r === TRGT2) cellsRec.push({ ti: Number(o.ti), x: Number(o.x), y: Number(o.y), px: Number(o.px), py: Number(o.py), n1: Number(o.num1), dist: Number(o.dist), draw: Number(o.draw) }); };
    // ★全 pass 计数模式：visited/accepted 引擎级总账
    let visAll = 0, accAll = 0;
    gg.__swTrRunSeq = seq;
    gg.__swTrCall = () => { seq.v++; };
    gg.__swTrCell = (r, o) => { void r; visAll++; if (!(Number(o.dist) >= Number(o.num1) * 0.5 * (1 + Number(o.draw) * 0.015))) accAll++; };
    const stC = hydrate(24, 'Dirt_To_Mud');
    runSiltPass(stC, new RNG(seedNum), mkGs());
    console.log(`[countAll] engine visited=${visAll} accepted=${accAll}`);
    gg.__swTrCell = (r, o) => { if (r === TRGT2) cellsRec.push({ ti: Number(o.ti), x: Number(o.x), y: Number(o.y), px: Number(o.px), py: Number(o.py), num1: Number(o.num1), dist: Number(o.dist), draw: Number(o.draw) }); };
    const stC2 = hydrate(24, 'Dirt_To_Mud');
    runSiltPass(stC2, new RNG(seedNum), mkGs());
    delete gg.__swTrCell;
    delete gg.__swTrCall;
    delete gg.__swTrRunSeq;
    console.log(`[cellRun58] engine visited=${cellsRec.length}`);
    // 引擎接受集（type 变化含 slope/half 不变类型——仅用 type）
    const accE = new Set<number>();
    {
      // 用事件盒重演可精确恢复：此处直接以「本 runner 视角内容演化」重算接受与真实访问序一致
      // ——利用 cell 记录本身：visit 序即接受判定输入；draw 值已录。接受 ⇔ dist<thr
      for (const cr of cellsRec) {
        if (!(cr.dist >= cr.n1 * 0.5 * (1 + cr.draw * 0.015))) accE.add(cr.ti);
      }
    }
    console.log(`[cellRun58] engine accepts=${accE.size}`);
    // 写迹仪采集运行（同前）拿 writeRunner 映射，取该 runner 的引擎写集做对照
    void accE;
    const wrTallyLocal = new Map<number, number>();
    for (let ti = 0; ti < W * H; ti++) if (tC0[ti] !== stC.type[ti]) wrTallyLocal.set(ti, 58);
    let mismCell = 0;
    const sampleMis: string[] = [];
    for (const [ti] of wrTallyLocal) {
      if (!accE.has(ti)) { mismCell++; if (sampleMis.length < 8) sampleMis.push(`${ti % W},${(ti / W) | 0}`); }
    }
    console.log(`[cellRun58] engineWrites=${wrTallyLocal.size} notAcceptedButWritten=${mismCell}(${sampleMis.join(' ')})`);
  }

  // 写迹仪取证：runner 序号 → 每次真实写的格
  const writeRunner = new Int32Array(W * H).fill(-1);
  {
    const gg = globalThis as { __swTrWrite?: (seq: number, ti: number) => void; __swTrRunSeq?: { v: number }; __swTrCall?: unknown };
    const seq = { v: -1 };
    gg.__swTrRunSeq = seq;
    gg.__swTrCall = () => { seq.v++; };
    gg.__swTrWrite = (r, ti) => { writeRunner[ti] = r; };
    const stW = hydrate(24, 'Dirt_To_Mud');
    runSiltPass(stW, new RNG(seedNum), mkGs());
    delete gg.__swTrWrite;
    delete gg.__swTrCall;
    delete gg.__swTrRunSeq;
  }

  // 引擎写集
  const gsW = mkGs();
  const stEng = hydrate(24, 'Dirt_To_Mud');
  const tEng = stEng.type;
  runSiltPass(stEng, new RNG(seedNum), gsW);
  const engAcc = new Set<number>();
  for (let i = 0; i < W * H; i++) if (tEng[i] !== beforeType[i]) engAcc.add(i);

  const engOnly: number[] = [];
  for (const qi of engAcc) if (!acceptAll.has(qi)) engOnly.push(qi);
  const simOnly: number[] = [];
  for (const qi of acceptAll) if (!engAcc.has(qi)) simOnly.push(qi);
  console.log(`[i121f2] engWritten=${engAcc.size} simAccepted=${acceptAll.size} engOnly=${engOnly.length} simOnly=${simOnly.length}`);
  {
    const wrTally = new Map<number, number>();
    for (const qi of engOnly.slice(0, 20000)) wrTally.set(writeRunner[qi], (wrTally.get(writeRunner[qi]) ?? 0) + 1);
    const top = [...wrTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log(`[i121f2] engOnly writer-run top: ${JSON.stringify(top)} distinct=${wrTally.size}`);
    // 抽一个 top runner 与其步态对照
    const kk = top[0]?.[0];
    if (kk !== undefined && kk >= 0) {
      const cE = callsL[kk]!;
      console.log(`[i121f2] sample run#${kk}: i=${cE[1]} j=${cE[2]} st=${cE[3]} sp=${cE[4]} steps=${evAll[kk]?.length}`);
      for (const e of (evAll[kk] ?? []).slice(0, 6)) {
        console.log(`   ev it${e.iter} px=${e.px.toFixed(3)} py=${e.py.toFixed(3)} n1=${e.num1.toFixed(3)} rolled=${e.rolled} skips=${e.skips}`);
      }
    }
  }
  writeFileSync('/tmp/iii121-out/eng-only.txt', engOnly.map((i) => `${i % W},${(i / W) | 0}`).join('\n') + '\n');
  // engOnly 底物类型 + 归属（查事件扩展盒覆盖）
  const preT = le16(`${pre(24, 'Dirt_To_Mud')}.typ`);
  const pt = new Map<number, number>();
  for (const qi of engOnly.slice(0, 5000)) pt.set(preT[qi]!, (pt.get(preT[qi]!) ?? 0) + 1);
  console.log(`[i121f2] engOnly substrate top: ${JSON.stringify([...pt.entries()].sort((a, b) => b[1]! - b[1]! || (a[1]! > b[1]! ? -1 : 1)).slice(0, 6))}`);
  // 裕度直方图（差集 ∩ 接受集）
  const unowned = [...diffSet].filter((i) => !recMap.has(i));
  console.log(`[i121f2] accepted diff-cells=${recMap.size}/992 unowned=${unowned.length}`);
  // ★owner census：真值事件盒覆盖下的 owner 分布（含空隙案复核）
  {
    const ownersOf = new Map<number, Set<number>>();
    for (const qi of unowned) ownersOf.set(qi, new Set());
    const cand: number[] = [];
    // 只扫描 loop2 小跑者（k>=504）——大跑者的盒大、事件少，先粗扫全部但限定了格数
    for (let k = 0; k < evAll.length; k++) {
      for (const e of evAll[k] ?? []) {
        const x0 = Math.max(1, Math.floor(e.px - e.num1 * 0.5));
        const x1 = Math.min(W - 1, Math.floor(e.px + e.num1 * 0.5));
        const y0 = Math.max(1, Math.floor(e.py - e.num1 * 0.5));
        const y1 = Math.min(H - 1, Math.floor(e.py + e.num1 * 0.5));
        void x0; void x1; void y0; void y1;
      }
    }
    // 对每个 unowned 格扫其附近 ±6 的所有步态盒
    const xyOf = new Map<number, string>();
    for (let yy = 0; yy < H; yy++) { /* 惰性生成 */ }
    for (const qi of unowned) {
      const ex = qi % W, ey = (qi / W) | 0;
      const tally = new Map<number, number>();
      for (let k = 0; k < evAll.length; k++) {
        const evs = evAll[k];
        // 快速拒绝：runner 起点（i,j）远离则跳过
        const si = callsL[k]![1], sj = callsL[k]![2];
        if (Math.abs(si - ex) > 60 || Math.abs(sj - ey) > 60) continue;
        for (const e of evs ?? []) {
          const x0 = Math.max(1, Math.floor(e.px - e.num1 * 0.5) - 2);
          const x1 = Math.min(W - 1, Math.ceil(e.px + e.num1 * 0.5) + 2);
          const y0 = Math.max(1, Math.floor(e.py - e.num1 * 0.5) - 2);
          const y1 = Math.min(H - 1, Math.ceil(e.py + e.num1 * 0.5) + 2);
          if (ex >= x0 && ex <= x1 && ey >= y0 && ey <= y1) { tally.set(k, (tally.get(k) ?? 0) + 1); break; }
        }
      }
      for (const kk of tally.keys()) ownersOf.get(qi)!.add(kk);
    }
    let cov0 = 0, cov1p = 0;
    const runTally = new Map<number, number>();
    for (const [qi, oo] of ownersOf) {
      if (oo.size === 0) cov0++;
      else cov1p++;
      for (const kk of oo) runTally.set(kk, (runTally.get(kk) ?? 0) + 1);
    }
    const top = [...runTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
    console.log(`[i121f2] unowned ownership: noneBox=${cov0} boxed=${cov1p} topRuns=${JSON.stringify(top)} distinctRuns=${runTally.size}`);
    writeFileSync('/tmp/iii121-out/unowned-owners.txt', [...ownersOf].map(([qi, oo]) => `${qi % W},${(qi / W) | 0}|${[...oo].join(' ')}`).join('\n') + '\n');
    void cand; void xyOf;
  }
  const hist = new Map<string, number>();
  const samp = new Map<string, { xy: string; r: Rec }>();
  for (const [idx, arr] of recMap) {
    const r = arr[arr.length - 1]!;
    const m = r.thr - r.dist;
    const lg = m <= 0 ? '<=0' : m < 1e-9 ? '<1e-9' : m < 1e-6 ? '<1e-6' : m < 1e-3 ? '<1e-3' : m < 0.02 ? '<0.02' : m < 0.1 ? '<0.1' : '>=0.1';
    hist.set(lg, (hist.get(lg) ?? 0) + 1);
    if (!samp.has(lg)) samp.set(lg, { xy: `${idx % W},${(idx / W) | 0}`, r });
  }
  console.log(`[i121f2] final-writer margin hist=${JSON.stringify([...hist.entries()].sort())}`);
  for (const [kk, v] of samp) console.log(`   ${kk}: @${v.xy} run#${v.r.k} dist=${v.r.dist.toFixed(6)} thr=${v.r.thr.toFixed(12)} m=${(v.r.thr - v.r.dist).toExponential(3)} px=${v.r.px.toFixed(3)} py=${v.r.py.toFixed(3)}`);
}, 600_000);
