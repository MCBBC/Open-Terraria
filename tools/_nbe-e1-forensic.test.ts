// 一次性诊断（NB-E 事件批 2026-09-03）：E1 祭坛矿脉位级分歧定位。
// 方法：x86 roll-x86-ev.txt 的 E1_1 span 裸样本流（49004 个 InternalSample 原始值）作为
// 确定性骰源，分别喂：
//   A. vanilla SmashAltar(:49603)+OreRunner(:49494) 语义转写（sheet 域直写,x86 post dump
//      为底图）→ 与 x86 e1_1 dump 的钴掩码对比（验证转写正确性）
//   B. 生产 oreRunner（TileRunner.ts 认证件）+ 本仓 smashAltar 镜像公式（同骰源、同底图）
//      → 与 A 对比出首个分歧掷位/分歧格
//   C. B 产物 vs js e1_1 dump（镜像端到端自洽验证）
// UnifiedRandom 语义（rng.ts 认证）：Sample()=raw×4.656612875245797e-10；
//   Next(a,b)=trunc(Sample()×(b−a))+a（小 range 单掷）；Next(max)=trunc(Sample()×max)。
// 用法：cd game && npx vitest run tools/_nbe-e1-forensic.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { oreRunner } from '../src/world/gen/vanilla/TileRunner';
import { TileStore } from '../src/world/TileStore';
import { TILE_INTERNAL_BY_SHEET, TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_NBE_FORENSIC === '1';
const EV_DIR = '/tmp/hm1458-rig/out/ev';
const W = 4200, H = 1200, N = W * H;

function span(path: string, tag: string): number[] {
  const out: number[] = [];
  let cur = false;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.startsWith('MARK ')) {
      cur = line === `MARK ${tag}_BEGIN`;
      continue;
    }
    if (cur && line !== '' && !line.startsWith('X ')) out.push(parseInt(line, 10));
  }
  return out;
}
const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer, readFileSync(p).byteOffset);

class FakeRng {
  i = 0;
  constructor(private vals: number[]) {}
  sample(): number {
    if (this.i >= this.vals.length) {
      this.i++;
      return 0; // 越界软垫（诊断仪表：只统计消耗位,不再掷真值）
    }
    return this.vals[this.i++]! * 4.656612875245797e-10;
  }
  // Next(minValue, maxValue) 小 range 分支（≤int.MaxValue）
  range(min: number, max: number): number {
    return Math.trunc(this.sample() * (max - min)) + min;
  }
  // Next(int maxValue)
  max(m: number): number {
    return Math.trunc(this.sample() * m);
  }
  // RNG.int(a,b) = NextIntRange(a, b+1) = Next(a, b+1)（闭区间）
  int(a: number, b: number): number {
    return Math.trunc(this.sample() * (b + 1 - a)) + a;
  }
  // 相位实验：跳过（负=回退）n 个样本
  skip(n: number): void {
    if (n > 0) this.i += n;
    else this.i = Math.max(0, this.i + n);
  }
}

// vanilla OreRunner（rig :49494-49599）sheet 域转写——只做 tile 面,不触 frame/net
const MOSS = new Set([179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627]);
const WHITELIST = new Set([
  0, 1, 23, 25, 40, 53, 57, 59, 60, 70, 109, 112, 116, 117, 147, 161, 163, 164,
  199, 200, 203, 234, 396, 397, 398, 399, 400, 401, 402, 403,
]);
const okType = (t: number) => WHITELIST.has(t) || MOSS.has(t);

interface SW { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; }

// 运行时框选掷模型（★E1 分歧定罪,2026-09-03）：OreRunner 在 !generatingWorld 下对每个
// 转换格调 SquareTileFrame(k,l)=9×TileFrame(i,j,resetFrame:true)——TileFrame 块面分支
// （rig tileframe.txt:382）在 resetFrame 时掷 genRand.Next(0,3) 选帧变体（纯帧数据掷,
// JS 引擎帧虚拟化不消费）。TileFrame 早退链：出界(≤5)|失活|FrameImportant|非实心支
// ⇒ 不掷。本模型按此门逐邻格补掷。
// FrameImportant / solid 表：从 TILE_DEFS（本仓认证 tile 表）按 vanilla.sheet 导出
const FRAME_IMPORTANT = new Set<number>();
const SOLID_SHEETS = new Set<number>();
for (const d of TILE_DEFS as unknown as Array<{ vanilla?: { sheet: number }; framed?: boolean; solid?: boolean } | undefined>) {
  if (!d?.vanilla || d.vanilla.sheet === undefined) continue;
  if (d.framed) FRAME_IMPORTANT.add(d.vanilla.sheet);
  if (d.solid) SOLID_SHEETS.add(d.vanilla.sheet);
}

// 单次 TileFrame 的掷门：可框（不出界|活跃|非 FrameImportant|实心块路径）⇒ 消费 Next(0,3)
function tileFrameRolls(sw: SW, x: number, y: number): number {
  if (x <= 5 || y <= 5 || x >= W - 5 || y >= H - 5) return 0;
  const idx = y * W + x;
  if (!sw.act[idx]) return 0;
  const t = sw.typ[idx]!;
  if (FRAME_IMPORTANT.has(t)) return 0;
  if (!SOLID_SHEETS.has(t)) return 0; // 非实心支（藤/仙人掌等）不进块面分支
  return 1;
}

function squareTileFrameModel(sw: SW, rng: FakeRng, x: number, y: number, mode: 'full' | 'one'): void {
  if (mode === 'one') {
    rng.range(0, 3); // 每转换格 1 掷的简化模型
    return;
  }
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const r = tileFrameRolls(sw, x + dx, y + dy);
      for (let k = 0; k < r; k++) rng.range(0, 3); // genRand.Next(0,3) 帧变体掷
    }
  }
}

function oreRunnerVanilla(sw: SW, rng: FakeRng, i: number, j: number, strength: number, steps: number, tileType: number, trace: string[], collect?: number[], frameModel: 'off' | 'full' | 'one' = 'off'): void {
  let num = strength;
  let num2 = steps;
  let vx = rng.range(-10, 11) * 0.1;
  const vy = rng.range(-10, 11) * 0.1;
  let px = i, py = j;
  let step = 0;
  while (num > 0 && num2 > 0) {
    if (py < 0 && num2 > 0 && tileType === 59) num2 = 0;
    num = strength * (num2 / steps);
    num2--;
    let x0 = Math.trunc(px - num * 0.5), x1 = Math.trunc(px + num * 0.5);
    let y0 = Math.trunc(py - num * 0.5), y1 = Math.trunc(py + num * 0.5);
    if (x0 < 0) x0 = 0;
    if (x1 > W) x1 = W;
    if (y0 < 0) y0 = 0;
    if (y1 > H) y1 = H;
    let cells = 0, hits = 0;
    for (let k = x0; k < x1; k++) {
      for (let l = y0; l < y1; l++) {
        cells++;
        const distRoll = rng.range(-10, 11); // dist 掷（全盒格恒掷,短路链首段）
        if (!(Math.abs(k - px) + Math.abs(l - py) < strength * 0.5 * (1 + distRoll * 0.015))) continue;
        const idx = l * W + k;
        if (!sw.act[idx]) continue;
        if (!okType(sw.typ[idx]!)) continue;
        sw.typ[idx] = tileType;
        hits++;
        collect?.push(idx);
        if (frameModel !== 'off') squareTileFrameModel(sw, rng, k, l, frameModel); // ★!generatingWorld 运行时框选掷
      }
    }
    px += vx; py += vy;
    vx += rng.range(-10, 11) * 0.05;
    if (vx > 1) vx = 1;
    if (vx < -1) vx = -1;
    trace.push(`step${step++} box=${x1 - x0}x${y1 - y0}@${Math.round(px)},${Math.round(py)} cells=${cells} hits=${hits}`);
  }
}

function smashAltarVanilla(sw: SW, rng: FakeRng, worldSurface: number, rockLayer: number, veinsLog: string[], skipLock = false, perVeinCells?: number[][], skipToVein = 0, delta = 0, frameModel: 'off' | 'full' | 'one' = 'off'): void {
  const saved = { cobalt: -1, mythril: -1, adamantite: -1 };
  for (let n = 0; n < 1; n++) {
    const tier = n % 3;
    const wave = Math.floor(n / 3) + 1;
    let num3 = (W / 4200) * 310 - 85 * tier;
    num3 *= 0.85;
    num3 /= wave;
    const bases = [107, 108, 111], alts = [221, 222, 223];
    const keys = ['cobalt', 'mythril', 'adamantite'] as const;
    let ore = saved[keys[tier]!];
    if (ore === -1) {
      ore = skipLock ? bases[tier]! : (rng.max(2) === 0 ? alts[tier]! : bases[tier]!);
      saved[keys[tier]!] = ore;
    }
    if (tier === 0) {
      if (ore === alts[0]) num3 *= 0.8999999761581421;
      num3 *= 1.0499999523162842;
    } else if (ore === alts[tier]) {
      num3 *= 0.8999999761581421;
    }
    const band = tier === 0 ? worldSurface : tier === 1 ? rockLayer : (rockLayer + rockLayer + H) / 3;
    for (let k = 0; k < num3; k++) {
      const x = rng.range(100, W - 100);
      const y = rng.range(Math.trunc(band), H - 150);
      const s = rng.range(5, 10);
      const st = rng.range(5, 10);
      if (k >= skipToVein && delta !== 0) rng.skip(delta); // δ 相位实验
      veinsLog.push(`vein${k} @${x},${y} s${s} t${st}`);
      const collect = perVeinCells ? [] : undefined;
      if (collect) perVeinCells!.push(collect);
      oreRunnerVanilla(sw, rng, x, y, s, st, ore, [], collect, frameModel);
    }
    rng.max(2); // Main.rand.Next(2)（wraith 数）
    // SpawnOnPlayer 的 wraith 搜索掷：真实 span 含之——本转写只追到 num10,
    // 剩余样本数=span 尾差（与记账层 filler 同源）
  }
}

(RUN ? it : it.skip)('e1 forensic: replay x86 span through vanilla transcription vs real oreRunner', async () => {
  const rollPath = `${EV_DIR}/roll-x86-ev.txt`;
  if (!existsSync(rollPath)) throw new Error('missing ev roll log');
  const samples = span(rollPath, 'E1_1');
  console.log(`[forensic] E1_1 span samples=${samples.length}`);

  // 底图：x86 post dump（sheet 域）
  const typ = le16(`${EV_DIR}/hm/post.typ`) as unknown as Uint16Array;
  const actBuf = readFileSync(`${EV_DIR}/hm/post.act`);
  const act = new Uint8Array(actBuf.buffer, actBuf.byteOffset);
  const walBuf = readFileSync(`${EV_DIR}/hm/post.wal`);
  const wal = new Uint16Array(walBuf.buffer, walBuf.byteOffset, walBuf.length >> 1);
  const sw: SW = { typ: new Uint16Array(typ), act: new Uint8Array(act), wal };

  // x86 e1_1 实况钴掩码
  const e1typ = le16(`${EV_DIR}/hm/e1_1.typ`) as unknown as Uint16Array;
  const x86Cobalt = new Set<number>();
  const e1act = new Uint8Array(readFileSync(`${EV_DIR}/hm/e1_1.act`).buffer, readFileSync(`${EV_DIR}/hm/e1_1.act`).byteOffset);
  for (let i = 0; i < N; i++) if (e1act[i] && e1typ[i] === 107) x86Cobalt.add(i);

  // A2. ★帧变体掷模型：x86 运行时链（!generatingWorld）每转换格 SquareTileFrame→
  //     9×TileFrame→每实心活跃邻格消费 Next(0,3)——JS 帧虚拟化不消费。模型开启后
  //     应复现 x86 实况（逐脉命中率回升=定罪）。
  for (const mode of ['one', 'full'] as const) {
    const swF: SW = { typ: new Uint16Array(typ), act: new Uint8Array(act), wal };
    const rngF = new FakeRng(samples.concat(new Array(400000).fill(0)));
    const fCells: number[][] = [];
    const fVeins: string[] = [];
    smashAltarVanilla(swF, rngF, 337, 571, fVeins, false, fCells, 0, 0, mode);
    let hit = 0, tot = 0, good = 0, bad = 0;
    const ratesF: string[] = [];
    for (let k = 0; k < fCells.length; k++) {
      let h = 0;
      for (const i of fCells[k]!) if (x86Cobalt.has(i)) h++;
      hit += h; tot += fCells[k]!.length;
      if (fCells[k]!.length && h / fCells[k]!.length >= 0.5) good++; else if (fCells[k]!.length) bad++;
      if (k < 8) ratesF.push(`v${k}(n${fCells[k]!.length},h${h})`);
    }
    console.log(`[forensic] A2(帧掷模型 mode=${mode}) vs x86: 命中=${hit}/${tot} 脉命中≥50%: ${good}/${good + bad} consumed=${rngF.i} head=[${ratesF.join(' ')}]`);
    const fCobalt = new Set<number>();
    for (let i = 0; i < N; i++) if (swF.act[i] && swF.typ[i] === 107) fCobalt.add(i);
    let fMiss = 0, fExtra = 0;
    for (const i of x86Cobalt) if (!fCobalt.has(i)) fMiss++;
    for (const i of fCobalt) if (!x86Cobalt.has(i)) fExtra++;
    console.log(`[forensic] A2 集合差: miss=${fMiss} extra=${fExtra} (0/0=位级复现)`);
  }

  // A. vanilla 转写重放（+相位扫描：span 头部 ±少量样本的相位差实验——锁骰跳过/
  //    额外预掷等相位错位假设检验）
  for (const phase of [-2, -1, 0, 1, 2]) {
    const rngP = new FakeRng(samples.slice(Math.max(0, phase)));
    const swP: SW = { typ: new Uint16Array(typ), act: new Uint8Array(act), wal };
    const veinsP: string[] = [];
    smashAltarVanilla(swP, rngP, 337, 571, veinsP, phase === -1); // phase=-1: 跳过锁骰
    const pCobalt = new Set<number>();
    for (let i = 0; i < N; i++) if (swP.act[i] && swP.typ[i] === 107) pCobalt.add(i);
    let miss = 0, extra = 0;
    for (const i of x86Cobalt) if (!pCobalt.has(i)) miss++;
    for (const i of pCobalt) if (!x86Cobalt.has(i)) extra++;
    console.log(`[forensic] phase=${phase}: miss=${miss} extra=${extra} consumed=${rngP.i} vein0=${veinsP[0]}`);
    if (miss + extra === 0) console.log(`[forensic] *** phase=${phase} 完全复现 x86 实况 ***`);
  }
  const rngA = new FakeRng(samples);
  const veinsA: string[] = [];
  smashAltarVanilla(sw, rngA, 337, 571, veinsA);
  const aCobalt = new Set<number>();
  for (let i = 0; i < N; i++) if (sw.act[i] && sw.typ[i] === 107) aCobalt.add(i);
  let aMiss = 0, aExtra = 0, aFirst = -1;
  for (const i of x86Cobalt) if (!aCobalt.has(i)) { aMiss++; if (aFirst < 0) aFirst = i; }
  for (const i of aCobalt) if (!x86Cobalt.has(i)) aExtra++;
  console.log(`[forensic] A(vanilla重放) vs x86 dump: miss=${aMiss} extra=${aExtra} first=${aFirst >= 0 ? `(${aFirst % W},${Math.floor(aFirst / W)})` : '-'} consumed=${rngA.i}/${samples.length}`);
  console.log(`[forensic] A veins head: ${veinsA.slice(0, 4).join(' | ')}`);
  // 逐脉命中率曲线：定位首个分歧脉（命中率崩塌点=额外消费发生处）
  {
    const perVeinCells: number[][] = [];
    const sw2: SW = { typ: new Uint16Array(typ), act: new Uint8Array(act), wal };
    const rng2 = new FakeRng(samples);
    const trace: string[] = [];
    smashAltarVanilla(sw2, rng2, 337, 571, trace, false, perVeinCells);
    const rates: string[] = [];
    let firstBad = -1;
    for (let k = 0; k < perVeinCells.length; k++) {
      const cells = perVeinCells[k]!;
      let hit = 0;
      for (const i of cells) if (x86Cobalt.has(i)) hit++;
      const rate = cells.length ? hit / cells.length : 1;
      if (rate < 0.5 && firstBad < 0) firstBad = k;
      if (k < 6 || (k >= firstBad - 1 && k <= firstBad + 2) || k === perVeinCells.length - 1) {
        rates.push(`v${k}(n${cells.length},h${hit},${(rate * 100).toFixed(0)}%)`);
      }
    }
    console.log(`[forensic] 逐脉命中率: 首崩脉=${firstBad} 采样=[${rates.join(' ')}]`);
    console.log(`[forensic] A 消耗到 vein0 末尾样本位=首分歧细查线索 vein0 cells=${perVeinCells[0]?.length}`);
    // δ 重同步扫描：v4 起的流若因 v2/v3 内多/少消费 δ 个样本而错位,找到 δ 应使命中率回升
    for (let delta = -8; delta <= 24; delta++) {
      const rngD = new FakeRng(samples);
      const swD: SW = { typ: new Uint16Array(typ), act: new Uint8Array(act), wal };
      const dCells: number[][] = [];
      smashAltarVanilla(swD, rngD, 337, 571, [], false, dCells, 4, delta);
      let hit = 0, tot = 0;
      for (const cs of dCells) for (const i of cs) { tot++; if (x86Cobalt.has(i)) hit++; }
      if (hit > 20) console.log(`[forensic] δ=${delta}: v4+ 重放命中 ${hit}/${tot}`);
    }
  }

  // B. 生产 oreRunner（同骰源、同底图）
  const store = new TileStore(W, H);
  store.type.fill(0);
  const sheetToInternal = new Map<number, number>();
  let unregistered = 0;
  for (let i = 0; i < N; i++) {
    const s = typ[i]!;
    let id = sheetToInternal.get(s);
    if (id === undefined) { id = TILE_INTERNAL_BY_SHEET.get(s) ?? -2; sheetToInternal.set(s, id); }
    if (id === -2) unregistered++;
    store.type[i] = id === -2 ? 0 : id!; // 未注册 sheet→0（空气,非白名单,转换面等价）
    store.flags[i] = act[i]! ? 1 : 0;
    store.wall[i] = wal[i]!;
  }
  console.log(`[forensic] unregistered sheets cells=${unregistered}`);
  const rngB = new FakeRng(samples);
  const tier = 0;
  let num3 = (W / 4200) * 310 - 85 * tier;
  num3 *= 0.85;
  num3 /= 1;
  num3 *= 1.0499999523162842; // 修正：钴档恒 ×1.05（与 A 对齐）
  // E1_1 锁矿=107（两侧日志一致）——不重掷锁骰,直接消费锁骰 1 个保持骰序
  const lockRoll = rngB.max(2);
  if (lockRoll !== 1) console.log(`[forensic] WARN lockRoll=${lockRoll} (x86 实况锁 107→roll 应=1)`);
  const oreB = TILE_INTERNAL_BY_SHEET.get(107)!;
  const veinsB: string[] = [];
  for (let k = 0; k < num3; k++) {
    const x = rngB.range(100, W - 100);
    const y = rngB.range(337, H - 150);
    const s = rngB.range(5, 10);
    const st = rngB.range(5, 10);
    veinsB.push(`vein${k} @${x},${y} s${s} t${st}`);
    oreRunner(store, rngB as unknown as import('../src/core/rng').RNG, x, y, { strength: s, steps: st, type: oreB, ntb: false });
  }
  console.log(`[forensic] B veins head: ${veinsB.slice(0, 4).join(' | ')}`);
  // A/B 脉锚首个分歧
  let firstVeinDiff = -1;
  for (let k = 0; k < veinsA.length && k < veinsB.length; k++) {
    if (veinsA[k] !== veinsB[k]) { firstVeinDiff = k; break; }
  }
  console.log(`[forensic] A/B 脉锚首分歧=${firstVeinDiff}${firstVeinDiff >= 0 ? `\n    A=${veinsA[firstVeinDiff]}\n    B=${veinsB[firstVeinDiff]}` : '（无）'}`);
  console.log(`[forensic] consumed A=${rngA.i} B=${rngB.i} (span=${samples.length})`);
});
