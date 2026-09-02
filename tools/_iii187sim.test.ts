// IIIII187：GFB #53 Smooth_World loop-A −747 源定谳模拟器（LXXIII 章）。
// spec（LXXII §⑥ 移交）：vanilla loop-A 逐格 roll 计数模拟器——
//   初态 = x86 052_Shell_Piles 十通道快照（含 ghost type/帧/致动/液体/墙,1:1 真态）,
//   掷流 = x86 rig181 rollwin.txt 原值流（普适流前缀定理 LXVII 章,首样本 2008227263）,
//   驱动 = vanilla SmoothWorld loop A+B 逐行 1:1（1457≡1458 cs:16519-16687,本文件自
//   cs 原文重抄,不经 src 的 runSmoothWorldPass——被测对象隔离）,共享杀链/级联/谓词
//   底座复用 HalfBrickPass 导出面（killTile/poundTile/canPoundTile/solidTile/
//   smoothSlope/placeCornerBlock/squareTileFrame——十五链绿考,非嫌疑面）。
// 判据三重：
//   ①自证:模拟器 loop A 总掷=243,792（x86 R 5,069,393−loop B 4,825,600−尾 1 解析式）,
//     loop B 总掷=4,825,600,终态 vs x86 053 typ/act/slope/half 差异≈0 → 模拟器可信;
//   ②对拍:模拟器逐格掷数 vs js-cntA.bin（IIIII181 仪）→ 首个「掷数差」格=JS 首 deviation;
//   ③定谳:该格 dump 双侧分支/谓词上下文。
// 用法：cd game && npx vitest run tools/_iii187sim.test.ts
//   （离线纯分析,零 worldgen;G2=/tmp 金标缺省 ~/GoldenChains/golden-gfb-c）
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { idsByVanillaSheet, NOT_CLEARABLE } from '../src/world/gen/vanilla/TileRunner';
import {
  resetGenSolid, flipGenSolid,
} from '../src/world/gen/vanilla/GenSolid';
import {
  solidTile, canPoundTile, poundTile, killTile, smoothSlope,
  placeCornerBlock, setKillTileGetGood,
} from '../src/world/gen/vanilla/HalfBrickPass';

const OUT = process.env.SW_I187_OUT ?? '/tmp/iii187-out';
const G2 = process.env.SW_I187_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const RIG = process.env.SW_I187_RIG ?? '/tmp/iii181-out/rig181/rollwin.txt';
const JSDIR = process.env.SW_I187_JS ?? '/tmp/iii181-out';
const W = 4200, H = 1200, N = W * H;

// ── 表（与本仓对拍口径一致,sheet 空间构建后转内部 id）─────────────────────────
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
const REV = new Int32Array(4096).fill(-1); // sheet → 首注册内部 id（canonical）
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s !== 'number' || s < 0) continue;
  SHEET_OF[i] = s;
  if (REV[s] < 0) REV[s] = i;
}
const PREVENTS_SLOPES = idsByVanillaSheet(48, 137, 232, 191, 151, 274, 135, 442, 428);
const LOOP_B_SKIP_SHEETS = new Set([137, 48, 232, 191, 151, 274, 75, 76]);
const SAND = idsByVanillaSheet(53, 112, 116, 234);
/** PlaceTile 草/苔安放门（cs:59400-59440）：目标格非活性时这些类型一律拒放（JS 同表） */
const PLACE_REFUSE = idsByVanillaSheet(
  2, 23, 60, 70, 109, 199, 633, 661, 662,
  179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627);

// ── x86 rollwin 原值流（UnifiedRandom(seed).internalSample 的原始非负 int31）──
class StreamRNG {
  private buf: Uint32Array;
  private p = 0;
  count = 0;
  constructor(path: string) {
    const lines: number[] = [];
    for (const ln of readFileSync(path, 'utf8').split('\n')) {
      const s = ln.trim();
      if (!s || s.charCodeAt(0) > 57 || s.charCodeAt(0) < 48) continue; // 跳 ---START/END
      lines.push(Number(s));
    }
    this.buf = new Uint32Array(lines);
  }
  get remaining(): number { return this.buf.length - this.p; }
  private raw(): number {
    const v = this.buf[this.p++]!;
    this.count++;
    if (globalThis.__i187trace !== undefined && this.count <= (globalThis.__i187trace as number) + 6 && this.count > (globalThis.__i187trace as number)) {
      const st = new Error().stack ?? '';
      console.log(`[i187-trace] roll#${this.count - 1} v=${v} @ ${st.split('\n').slice(3, 6).map((s) => s.trim().replace(/^at /, '')).join(' < ')}`);
    }
    return v;
  }
  /** C# Sample() = InternalSample()/MBIG */
  sample(): number { return this.raw() / 2147483647; }
  /** Next(maxValue) = (int)(Sample()*maxValue) —— 1 样本 */
  nextInt(maxValue: number): number { return Math.floor(this.sample() * maxValue); }
  /** Next(min,max) 小 range 支（num ≤ int.MaxValue）—— 1 样本 */
  nextIntRange(minValue: number, maxValue: number): number {
    const num = maxValue - minValue;
    if (num <= 2147483647) return (Math.floor(this.sample() * num) + minValue) | 0;
    return (Math.trunc(this.getSampleForLargeRange() * num) + minValue) | 0;
  }
  /** GetSampleForLargeRange —— 2 样本（cs:96-104 原序） */
  getSampleForLargeRange(): number {
    const num = this.raw();
    const n = this.raw() % 2 === 0 ? -num : num;
    return (n + 2147483646) / 4294967293;
  }
  next(): number { return this.sample(); }
}

// ── 模拟器用 RNG 适配（HalfBrickPass 杀链消费面）───────────────────────────────
class SimRNG {
  constructor(private s: StreamRNG) {}
  nextInt(maxValue: number): number { return this.s.nextInt(maxValue); }
  nextIntRange(minValue: number, maxValue: number): number { return this.s.nextIntRange(minValue, maxValue); }
  next(): number { return this.s.next(); }
  int(min: number, max: number): number { return this.s.nextIntRange(min, max + 1); }
}

it('IIIII187 vanilla loop-A roll-count simulator (offline)', { timeout: 300_000 }, () => {
  if (process.env.SW_I187 !== '1') { console.log('[i187] SW_I187!=1 skip'); return; }
  // ── 载入 x86 052 十通道 ──
  const le16 = (p: string) => new Uint16Array(readFileSync(p).buffer, readFileSync(p).byteOffset, readFileSync(p).byteLength >> 1);
  const u8 = (p: string) => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset, readFileSync(p).byteLength);
  const xT = le16(`${G2}/052_Shell_Piles.typ`), xA = u8(`${G2}/052_Shell_Piles.act`);
  const xFX = le16(`${G2}/052_Shell_Piles.frx`), xFY = le16(`${G2}/052_Shell_Piles.fry`);
  const xHF = u8(`${G2}/052_Shell_Piles.half`), xSL = u8(`${G2}/052_Shell_Piles.slope`);
  const xIA = u8(`${G2}/052_Shell_Piles.inact`), xLQ = u8(`${G2}/052_Shell_Piles.liq`);
  const xLT = u8(`${G2}/052_Shell_Piles.lty`), xWL = le16(`${G2}/052_Shell_Piles.wal`);
  const st = new TileStore(W, H);
  let unmapped = 0; const unmappedSheets = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    const sh = xT[i]!;
    // ★x86 typ=0 = 泥土（vanilla TileID 0=Dirt），非空气——空气格在 vanilla 数据模型
    //   里同样 type==0+inactive,映射到泥土内部 id 后 flags=0,谓词面与 vanilla 完全等价
    //   （SHEET_OF 同为 0）。不能特判 sh>0,否则活性泥土全变空气。
    let inner = REV[sh]!;
    if (inner < 0) { inner = 0; unmapped++; unmappedSheets.set(sh, (unmappedSheets.get(sh) ?? 0) + 1); }
    st.type[i] = inner;
    st.flags[i] = xA[i]! ? 1 : 0;
    st.frameX[i] = xFX[i]!;
    st.frameY[i] = xFY[i]!;
    st.half[i] = xHF[i]!;
    st.slope[i] = xSL[i]!;
    st.wire[i] = xIA[i]! ? 32 : 0;
    st.wall[i] = xWL[i]!;
    st.liquid[i] = xLQ[i]!;
    st.liquidType[i] = xLQ[i]! > 0 ? xLT[i]! + 1 : 0;
  }
  console.log(`[i187] 052 载入完成 unmapped sheet 格=${unmapped} ${[...unmappedSheets].slice(0, 6).map(([k, v]) => `${k}×${v}`).join(' ')}`);
  // ── GenSolid 时间线（pass 53 头时点,普通+GFB 面与 JS 管线等价）──
  resetGenSolid();
  flipGenSolid([137], false);      // cs:16212 JungleShrines 尾
  flipGenSolid([192], true);       // cs:16324 沙上清水
  flipGenSolid([10, 192, 191, 190], true); // cs:16303 SettleLiquids 尾(IIIII183 臂)
  flipGenSolid([484], false);      // cs:12537 DesertBiome 头
  flipGenSolid([481, 482, 483], true); // cs:16510 SetCrackedBrickSolidity(true)
  setKillTileGetGood(true);        // GFB getGoodWorld → 灰烬崩塌活性
  // ── 掷流 ──
  const stream = new StreamRNG(RIG);
  const rng = new SimRNG(stream);
  const tr = Number(process.env.SW_I187_TRACE ?? -1);
  if (tr >= 0) (globalThis as { __i187trace?: number }).__i187trace = tr;
  // ★击杀普查（K 事件按 sheet 计数;K 入口时本格仍活性可查型）——1457 尘表/230 臂账目验证
  const killCensus = new Map<number, number>();
  const actCensus = new Map<string, number>();
  let over = 0;
  const overBy = new Map<string, number>();
  const jsAmtC = (s: number): number => (s === 231 ? 6 : s === 541 ? 1 : s === 549 ? 2
    : [534, 536, 539, 625, 627].includes(s) ? 5 : 10);
  const jsPerC = (s: number, fx: number): number => {
    if ([23, 24, 661, 25, 27, 32, 2, 477, 109, 492, 204, 478, 58, 76, 77, 684,
      633, 641, 370, 171, 238, 231, 352, 583, 584, 585, 586, 587, 588, 589,
      595, 596, 615, 616, 385].includes(s)) return 1;
    if (s === 634) return 2;
    if (s === 31 || s === 696) return fx < 36 ? 1 : 0;
    if (s === 26 || s === 695) return fx < 54 ? 1 : 0;
    if (s === 35) return fx < 36 ? 1 : 0;
    if (s === 34 || s === 42) return 1;
    return 0;
  };
  const REMOVED_1457 = new Set([23, 24, 661, 25, 27, 32, 109, 492, 58, 76, 77, 684,
    238, 231, 352, 595, 596, 615, 616, 385, 31, 696, 26, 695, 35, 34, 42]);
  (globalThis as { __swSWAct?: (fn: string, x: number, y: number, e: number) => void }).__swSWAct = (fn, x, y) => {
    actCensus.set(fn, (actCensus.get(fn) ?? 0) + 1);
    if (fn === 'K') {
      const i2 = st.idx(x, y);
      const s2 = st.flags[i2] ? (SHEET_OF[st.type[i2]] ?? -1) : -1;
      killCensus.set(s2, (killCensus.get(s2) ?? 0) + 1);
      if (REMOVED_1457.has(s2)) {
        const o = jsAmtC(s2) * jsPerC(s2, st.frameX[i2] ?? 0);
        if (o > 0) {
          over += o;
          overBy.set(s2, (overBy.get(s2) ?? 0) + o);
        }
      }
    }
  };
  console.log(`[i187] rollwin 样本=${stream.remaining} 首=${(readFileSync(RIG, 'utf8').split('\n').find((l) => l && l[0] >= '0' && l[0] <= '9') ?? '')} (普适流首样本应=2008227263)`);
  // ── 逐格掷数账 ──
  const cellCnt = new Int32Array(N).fill(-1);
  const acts: string[] = [];
  const mark = (x: number, y: number) => { cellCnt[y * W + x] = stream.count; };
  const actLog = (s: string) => { if (acts.length < 400) acts.push(s); };
  // vanilla SlopeTile（cs:82045）生成期路径
  const slopeX = (x: number, y: number, dir: number): boolean => {
    if (!canPoundTile(st, x, y)) return false;
    const i = st.idx(x, y);
    st.half[i] = 0;
    st.slope[i] = dir;
    actLog(`S${dir} ${x},${y}`);
    return true;
  };
  const sh = (x: number, y: number): number => SHEET_OF[st.type[st.idx(x, y)]] ?? -1;
  const fl = (x: number, y: number): boolean => st.flags[st.idx(x, y)] !== 0;
  /** blockType()==0 门（cs:16520 `(!active || blockType()==0)`）：非活性短路通过 */
  const fullOrEmpty = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const i = st.idx(x, y);
    return !st.flags[i] || (st.half[i] === 0 && st.slope[i] === 0);
  };

  // ══ loop A（cs:16519-16652 逐行 1:1,1457≡1458）══
  for (let i = 20; i < W - 20; i++) {
    for (let j = 20; j < H - 20; j++) {
      mark(i, j);
      const okSl = (y: number): boolean => {
        const k = st.idx(i, y);
        return !st.flags[k] || !PREVENTS_SLOPES.has(st.type[k]);
      };
      if (!okSl(j) || !okSl(j - 1)) continue;                       // :16516
      if (process.env.SW_I187_PROBE === `${i},${j}`) {
        console.log(`[i187-probe] (${i},${j}) fl(above)=${fl(i, j - 1)} fl(L)=${fl(i - 1, j)} shL=${sh(i - 1, j)} fl(R)=${fl(i + 1, j)} shR=${sh(i + 1, j)} solidSelf=${solidTile(st, i, j)} solidBelow=${solidTile(st, i, j + 1)} cnt=${stream.count}`);
      }
      if (!fl(i, j - 1) && (!fl(i - 1, j) || sh(i - 1, j) !== 136)
        && (!fl(i + 1, j) || sh(i + 1, j) !== 136)) {                 // :16518（active 前置短路）
        if (solidTile(st, i, j) && !NOT_CLEARABLE.has(st.type[st.idx(i, j)])) {  // :16520
          if (fullOrEmpty(i - 1, j) && fullOrEmpty(i + 1, j)) {      // :16522
            if (solidTile(st, i, j + 1)) {                           // :16524
              if (!solidTile(st, i - 1, j) && st.half[st.idx(i - 1, j + 1)] === 0
                && solidTile(st, i - 1, j + 1) && solidTile(st, i + 1, j)
                && !fl(i + 1, j - 1)) {                              // :16526 模式A
                if (rng.int(0, 1) === 0) { if (slopeX(i, j, 2)) actLog(`A26 ${i},${j}`); }
                else { poundTile(st, i, j); actLog(`A26P ${i},${j}`); }
              } else if (!solidTile(st, i + 1, j) && st.half[st.idx(i + 1, j + 1)] === 0
                && solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j)
                && !fl(i - 1, j - 1)) {                              // :16537 模式B
                if (rng.int(0, 1) === 0) { if (slopeX(i, j, 1)) actLog(`B37 ${i},${j}`); }
                else { poundTile(st, i, j); actLog(`B37P ${i},${j}`); }
              } else if (solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j + 1)
                && !fl(i + 1, j) && !fl(i - 1, j)) {                 // :16548 孤立凸起
                poundTile(st, i, j); actLog(`ISO ${i},${j}`);
              }
              if (solidTile(st, i, j)) {                             // :16552
                if (solidTile(st, i - 1, j) && solidTile(st, i + 1, j + 2)
                  && !fl(i + 1, j) && !fl(i + 1, j + 1) && !fl(i - 1, j - 1)) {
                  killTile(st, rng as never, i, j); actLog(`K1 ${i},${j}`);
                } else if (solidTile(st, i + 1, j) && solidTile(st, i - 1, j + 2)
                  && !fl(i - 1, j) && !fl(i - 1, j + 1) && !fl(i + 1, j - 1)) {
                  killTile(st, rng as never, i, j); actLog(`K2 ${i},${j}`);
                } else if (!fl(i - 1, j + 1) && !fl(i - 1, j)
                  && solidTile(st, i + 1, j) && solidTile(st, i, j + 2)) {  // :16562 三路
                  const a = rng.int(0, 4);
                  if (a === 0) { killTile(st, rng as never, i, j); actLog(`T62 ${i},${j}`); }
                  else if (rng.int(0, 4) === 0) { poundTile(st, i, j); actLog(`T62b ${i},${j}`); }
                  else { if (slopeX(i, j, 2)) actLog(`T62S ${i},${j}`); }
                } else if (!fl(i + 1, j + 1) && !fl(i + 1, j)
                  && solidTile(st, i - 1, j) && solidTile(st, i, j + 2)) { // :16577 镜像三路
                  const a = rng.int(0, 4);
                  if (a === 0) { killTile(st, rng as never, i, j); actLog(`T77 ${i},${j}`); }
                  else if (rng.int(0, 4) === 0) { poundTile(st, i, j); actLog(`T77b ${i},${j}`); }
                  else { if (slopeX(i, j, 1)) actLog(`T77S ${i},${j}`); }
                }
              }
            }
            if (solidTile(st, i, j) && !fl(i - 1, j) && !fl(i + 1, j)) {   // :16594 顶柱
              killTile(st, rng as never, i, j); actLog(`PIL ${i},${j}`);
            }
          }
        } else if (!fl(i, j) && solidTile(st, i, j + 1)
          && sh(i, j + 1) !== 151 && sh(i, j + 1) !== 274) {             // :16600 补角
          if (sh(i + 1, j) !== 190 && sh(i + 1, j) !== 48 && sh(i + 1, j) !== 232
            && solidTile(st, i - 1, j + 1) && solidTile(st, i + 1, j)
            && !fl(i - 1, j) && !fl(i + 1, j - 1)) {                    // :16602 右臂
            const mat = sh(i + 1, j) === 495 ? st.type[st.idx(i + 1, j)] : st.type[st.idx(i, j + 1)];
            if (!PLACE_REFUSE.has(mat)) placeCornerBlock(st, rng as never, i, j, mat);
            actLog(`T ${i},${j} m${SHEET_OF[mat]}`);
            if (rng.int(0, 1) === 0) { if (slopeX(i, j, 2)) actLog(`FILL1 ${i},${j}`); }
            else { poundTile(st, i, j); actLog(`FILL1P ${i},${j}`); }
          }
          if (sh(i - 1, j) !== 190 && sh(i - 1, j) !== 48 && sh(i - 1, j) !== 232
            && solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j)
            && !fl(i + 1, j) && !fl(i - 1, j - 1)) {                    // :16621 左臂
            const mat = sh(i - 1, j) === 495 ? st.type[st.idx(i - 1, j)] : st.type[st.idx(i, j + 1)];
            if (!PLACE_REFUSE.has(mat)) placeCornerBlock(st, rng as never, i, j, mat);
            actLog(`T ${i},${j} m${SHEET_OF[mat]}`);
            if (rng.int(0, 1) === 0) { if (slopeX(i, j, 1)) actLog(`FILL2 ${i},${j}`); }
            else { poundTile(st, i, j); actLog(`FILL2P ${i},${j}`); }
          }
        }
      } else if (!fl(i, j + 1)) {                                    // :16638 悬顶
        if (process.env.SW_I187_HANGPROBE) console.log(`[i187-hang] HANG roll @(${i},${j}) cnt=${stream.count} above=${fl(i, j - 1)} shL=${sh(i - 1, j)} flL=${fl(i - 1, j)} shR=${sh(i + 1, j)} flR=${fl(i + 1, j)} okSlJ=${okSl(j)} okSlJm1=${okSl(j - 1)}`);
        const v = rng.int(0, 1);
        if (v === 0 && solidTile(st, i, j) && solidTile(st, i, j - 1)
          && fullOrEmpty(i + 1, j) && fullOrEmpty(i - 1, j)) {
          if (solidTile(st, i - 1, j) && !solidTile(st, i + 1, j) && solidTile(st, i - 1, j - 1)) {
            if (slopeX(i, j, 3)) actLog(`HANG3 ${i},${j}`);
          } else if (solidTile(st, i + 1, j) && !solidTile(st, i - 1, j) && solidTile(st, i + 1, j - 1)) {
            if (slopeX(i, j, 4)) actLog(`HANG4 ${i},${j}`);
          }
        }
      }
    }
  }
  const loopATotal = stream.count;
  console.log(`[i187] ①自证 loop A 总掷=${loopATotal} (x86 解析式=243792) ${loopATotal === 243792 ? '≡✓' : '≠✗'}`);
  writeFileSync(`${OUT}/sim-cntA.bin`, Buffer.from(cellCnt.buffer));
  writeFileSync(`${OUT}/sim-actsA.txt`, acts.join('\n'));

  // ══ loop B（cs:16656-16687）══
  for (let k = 20; k < W - 20; k++) {
    for (let l = 20; l < H - 20; l++) {
      // ★不 mark——cellCnt 是 loop A 逐格账,loop B 复写会毁 ②对拍
      const tk = st.type[st.idx(k, l)];
      if (rng.int(0, 1) === 0 && !fl(k, l - 1) && !LOOP_B_SKIP_SHEETS.has(sh(k, l))
        && solidTile(st, k, l)
        && (!fl(k - 1, l) || sh(k - 1, l) !== 137)
        && (fl(k + 1, l) || sh(k + 1, l) !== 137)) {                 // :16661
        if (solidTile(st, k, l + 1) && solidTile(st, k + 1, l) && !fl(k - 1, l)) {
          if (slopeX(k, l, 2)) actLog(`B-S2 ${k},${l}`);
        }
        if (solidTile(st, k, l + 1) && solidTile(st, k - 1, l) && !fl(k + 1, l)) {
          if (slopeX(k, l, 1)) actLog(`B-S1 ${k},${l}`);
        }
      }
      if (fl(k, l) && SAND.has(tk)) smoothSlope(st, k, l);           // :16672
      if (st.slope[st.idx(k, l)] === 1 && !solidTile(st, k - 1, l)) { slopeX(k, l, 0); poundTile(st, k, l); }
      if (st.slope[st.idx(k, l)] === 2 && !solidTile(st, k + 1, l)) { slopeX(k, l, 0); poundTile(st, k, l); }
    }
  }
  const loopBTotal = stream.count - loopATotal;
  console.log(`[i187] ①自证 loop B 总掷=${loopBTotal} (解析式=4,825,600) ${loopBTotal === 4825600 ? '≡✓' : '≠✗'}`);
  console.log(`[i187] pass 总掷=${stream.count} (x86 body=5,069,392+尾1) 剩余=${stream.remaining}`);

  // ══ ①自证：终态 vs x86 053 ══
  const gT = le16(`${G2}/053_Smooth_World.typ`), gA = u8(`${G2}/053_Smooth_World.act`);
  const gS = u8(`${G2}/053_Smooth_World.slope`), gH = u8(`${G2}/053_Smooth_World.half`);
  let dA = 0, dT = 0, dS = 0, dH = 0;
  const dTList: string[] = [];
  for (let i = 0; i < N; i++) {
    const sa = st.flags[i] !== 0 ? 1 : 0;
    const styp = sa ? (SHEET_OF[st.type[i]] ?? -1) : 0;
    const gt = gA[i] ? gT[i]! : 0;
    if (sa !== gA[i]) { dA++; continue; }
    if (styp !== gt) { dT++; if (dTList.length < 12) dTList.push(`(${i % W},${(i / W) | 0}) sim=${styp} x86=${gt}`); }
    if (st.slope[i] !== gS[i]) dS++;
    if (st.half[i] !== gH[i]) dH++;
  }
  console.log(`[i187] ①自证 终态 vs x86 053: dAct=${dA} dTyp=${dT} dSlope=${dS} dHalf=${dH}`);
  // ★IIIII187 细对齐示波器：liq/lty（230 臂岩浆灌写=Next(2) 值的函数）+ frx/fry 差
  const gL = u8(`${G2}/053_Smooth_World.liq`), gLT = u8(`${G2}/053_Smooth_World.lty`);
  const gFX = le16(`${G2}/053_Smooth_World.frx`), gFY = le16(`${G2}/053_Smooth_World.fry`);
  let dL = 0, dF = 0, dFA = 0, dFI = 0;
  const fSamplesA: string[] = [];
  const lcol = new Int32Array(W), fcol = new Int32Array(W);
  let firstL = -1, firstF = -1;
  for (let i = 0; i < N; i++) {
    const sl = st.liquid[i], slt = st.liquid[i] > 0 ? st.liquidType[i] - 1 : 0;
    const gl = gL[i]!, glt = gl > 0 ? gLT[i]! : 0;
    if (sl !== gl || (sl > 0 && slt !== glt)) {
      dL++;
      lcol[i % W]++;
      if (firstL < 0) firstL = i;
    }
    if (st.frameX[i] !== gFX[i]! || st.frameY[i] !== gFY[i]!) {
      dF++;
      fcol[i % W]++;
      if (firstF < 0) firstF = i;
      if (st.flags[i]) { dFA++; if (fSamplesA.length < 6) fSamplesA.push(`(${i % W},${(i / W) | 0}) sim fx${st.frameX[i]}/fy${st.frameY[i]} vs x86 fx${gFX[i]}/fy${gFY[i]} act typ${SHEET_OF[st.type[i]]}`); }
      else dFI++;
    }
  }
  console.log(`[i187] ①自证 liq 差=${dL} 首差=(${firstL >= 0 ? firstL % W : -1},${firstL >= 0 ? (firstL / W) | 0 : -1}) frx/fry 差=${dF} 首差=(${firstF >= 0 ? firstF % W : -1},${firstF >= 0 ? (firstF / W) | 0 : -1})`);
  const lc: string[] = [];
  let seen = 0;
  for (let x = 20; x < W - 20 && seen < 10; x++) if (lcol[x] > 0) { lc.push(`x${x}:${lcol[x]}`); seen++; }
  console.log(`[i187] ①自证 liq 差列前 10: ${lc.join(' ')}`);
  console.log(`[i187] ①自证 frx/fry 差分解: 活性格=${dFA} 非活性格=${dFI} ${fSamplesA.join(' | ')}`);
  // 残余 slope/half 差格明细（≤8 格 dump 邻域）
  if (dS + dH > 0) {
    const cells: Array<[number, number, number, number]> = [];
    for (let x = 20; x < W - 20 && cells.length < 8; x++) {
      for (let y = 20; y < H - 20; y++) {
        const i = y * W + x;
        if (st.slope[i] !== gS[i] || st.half[i] !== gH[i]) cells.push([x, y, st.slope[i], st.half[i]]);
        if (cells.length >= 8) break;
      }
    }
    for (const [cx, cy, cs, ch] of cells) {
      console.log(`[i187] 残余差 (${cx},${cy}) sim[s${cs}h${ch}] x86[s${gS[cy * W + cx]}h${gH[cy * W + cx]}] act=${st.flags[cy * W + cx]}/${gA[cy * W + cx]} typ=${SHEET_OF[st.type[cy * W + cx]]}/${gT[cy * W + cx]}`);
      for (let y = cy - 2; y <= cy + 2; y++) {
        let r = `    y=${y}: `;
        for (let x = cx - 2; x <= cx + 2; x++) {
          const i = y * W + x;
          r += `${x}:${fl(x, y) ? `${sh(x, y)}(s${st.slope[i]},h${st.half[i]})` : `.${sh(x, y)}`} `;
        }
        console.log(r);
      }
    }
  }
  if (dTList.length) console.log(`[i187]   typ 首差样本: ${dTList.join(' | ')}`);
  // 列序首差（act/typ/slope/half 四通道）
  let first = -1;
  outer:
  for (let x = 20; x < W - 20; x++) for (let y = 20; y < H - 20; y++) {
    const i = y * W + x;
    const sa = st.flags[i] ? 1 : 0;
    if (sa !== gA[i] || (sa ? (SHEET_OF[st.type[i]] ?? -1) : 0) !== (gA[i] ? gT[i]! : 0)
      || st.slope[i] !== gS[i] || st.half[i] !== gH[i]) { first = i; break outer; }
  }
  if (first >= 0) console.log(`[i187] ①自证 列序首差格=(${first % W},${(first / W) | 0})`);
  // act 首差（loop A 杀/补分歧定位;loop B 不改 act）
  let firstA = -1;
  outerA:
  for (let x = 20; x < W - 20; x++) for (let y = 20; y < H - 20; y++) {
    const i = y * W + x;
    const sa = st.flags[i] ? 1 : 0;
    if (sa !== gA[i]) { firstA = i; break outerA; }
  }
  if (firstA >= 0) {
    const fx = firstA % W, fy = (firstA / W) | 0;
    console.log(`[i187] ①自证 act 首差格=(${fx},${fy}) sim[act=${st.flags[firstA]} sh=${SHEET_OF[st.type[firstA]]} s${st.slope[firstA]}h${st.half[firstA]}] x86[act=${gA[firstA]} typ=${gT[firstA]} s${gS[firstA]}h${gH[firstA]}]`);
    for (let y = fy - 2; y <= fy + 2; y++) {
      let r = `  y=${y}: `;
      for (let x = fx - 3; x <= fx + 3; x++) {
        const i = y * W + x;
        const sv = `${fl(x, y) ? `${sh(x, y)}(s${st.slope[i]},h${st.half[i]})` : `.${sh(x, y)}`}`;
        const xv = `${gA[i] ? `${gT[i]}(s${gS[i]},h${gH[i]})` : `.${gT[i]}`}`;
        r += `${x}:${sv === xv ? sv : `${sv}|${xv}`} `;
      }
      console.log(r.replace(/\|x86mark/g, ''));
    }
  }

  // ══ ②对拍：sim 逐格掷数 vs js-cntA.bin ══
  if (existsSync(`${JSDIR}/js-cntA.bin`)) {
    const jsRaw = new Int32Array(readFileSync(`${JSDIR}/js-cntA.bin`).buffer,
      readFileSync(`${JSDIR}/js-cntA.bin`).byteOffset, N);
    const js0 = jsRaw[20 * W + 20]!;
    const sim0 = cellCnt[20 * W + 20]!;
    // 逐格掷数（列序 successor）
    const jsRoll = new Int32Array(N);
    const simRoll = new Int32Array(N);
    for (let x = 20; x < W - 20; x++) {
      for (let y = 20; y < H - 20; y++) {
        const i = y * W + x;
        const last = y + 1 >= H - 20;
        // ★idx(x,y)=y*W+x——下一列首行 = 20*W+(x+1),勿写成 (x+1)*W+20（转置,rollhist.mjs 同款坑）
        const jn = last ? (x + 1 < W - 20 ? jsRaw[20 * W + (x + 1)]! : js0) : jsRaw[i + W]!;
        const sn = last ? (x + 1 < W - 20 ? cellCnt[20 * W + (x + 1)]! : stream.count) : cellCnt[i + W]!;
        jsRoll[i] = jn - jsRaw[i]!;
        simRoll[i] = sn - cellCnt[i]!;
      }
    }
    let mism = 0;
    const msamples: string[] = [];
    let firstMism = -1;
    for (let x = 20; x < W - 20 && mism < 40; x++) {
      for (let y = 20; y < H - 20; y++) {
        const i = y * W + x;
        if (jsRoll[i] !== simRoll[i]) {
          mism++;
          if (firstMism < 0) firstMism = i;
          if (msamples.length < 25) msamples.push(`(${x},${y}) js=${jsRoll[i]} sim=${simRoll[i]}`);
        }
        if (mism >= 40) break;
      }
    }
    // 全量差格数 + 累计掷差剖面
    let totalDiff = 0;
    const cumByCol: number[] = [];
    let cum = 0;
    let seenAll = 0;
    for (let x = 20; x < W - 20; x++) {
      for (let y = 20; y < H - 20; y++) {
        const i = y * W + x;
        totalDiff += jsRoll[i] - simRoll[i];
        seenAll++;
      }
      cumByCol.push(totalDiff);
    }
    console.log(`[i187] ②对拍 首个掷数差格=${firstMism >= 0 ? `(${firstMism % W},${(firstMism / W) | 0})` : '无'} 前 25 差格: ${msamples.join(' ')}`);
    console.log(`[i187] ②对拍 loop A 掷差合计(js−sim)=${totalDiff} (期望 ≈ −747)`);
    const cp: string[] = [];
    for (const cx of [30, 60, 100, 200, 300, 400, 500, 617, 700, 1000, 2000, 3000, 4179]) {
      if (cx - 20 < cumByCol.length) cp.push(`x${cx}:${cumByCol[cx - 20 - 1] ?? 0}`);
    }
    console.log(`[i187] ②对拍 累计掷差剖面: ${cp.join(' ')}`);
    // 差格的 sim 动作上下文
    if (firstMism >= 0) {
      const fx = firstMism % W, fy = (firstMism / W) | 0;
      const near = acts.filter((a) => {
        const m = /(-?\d+),(-?\d+)/.exec(a);
        return m && Math.abs(Number(m[1]) - fx) <= 3 && Math.abs(Number(m[2]) - fy) <= 3;
      });
      console.log(`[i187] ③首差格 (${fx},${fy}) 邻域 sim 动作: ${near.join(' | ') || '(无)'}`);
      // 052 真态邻域
      for (let y = fy - 2; y <= fy + 2; y++) {
        let r = `  y=${y}: `;
        for (let x = fx - 3; x <= fx + 3; x++) {
          const i = y * W + x;
          r += `${x}:${fl(x, y) ? `${sh(x, y)}(${st.slope[i]},${st.half[i]})` : `.${sh(x, y)}`} `;
        }
        console.log(r);
      }
    }
    writeFileSync(`${OUT}/sim-roll.bin`, Buffer.from(simRoll.buffer));
  }
  // ══ 击杀普查 → 1457 尘表/230 臂账目闭合验证 ══
  (globalThis as { __swSWAct?: unknown }).__swSWAct = undefined;
  const under230 = killCensus.get(230) ?? 0;
  for (const [s, k] of [...killCensus].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
    console.log(`[i187] K 普查 sheet=${s} ×${k}`);
  }
  console.log(`[i187] 账目: 动作普查=${[...actCensus.entries()].map(([k2, v]) => `${k2}${v}`).join(' ')} 230击杀=${under230}`);
  console.log(`[i187] 账目: 1457 移除位超掷=${over} [${[...overBy].map(([k2, v]) => `${k2}=${v}`).join(' ')}] 230 臂缺掷=${under230} → 修后预测 loopA=${243045 - over + under230} (目标 243792)`);
  // ══ GenSolid 还原（防跨测试污染）══
  resetGenSolid();
  setKillTileGetGood(false);
});
