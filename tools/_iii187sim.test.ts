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
            placeCornerBlock(st, rng as never, i, j, mat); actLog(`T ${i},${j} m${SHEET_OF[mat]}`);
            if (rng.int(0, 1) === 0) { if (slopeX(i, j, 2)) actLog(`FILL1 ${i},${j}`); }
            else { poundTile(st, i, j); actLog(`FILL1P ${i},${j}`); }
          }
          if (sh(i - 1, j) !== 190 && sh(i - 1, j) !== 48 && sh(i - 1, j) !== 232
            && solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j)
            && !fl(i + 1, j) && !fl(i - 1, j - 1)) {                    // :16621 左臂
            const mat = sh(i - 1, j) === 495 ? st.type[st.idx(i - 1, j)] : st.type[st.idx(i, j + 1)];
            placeCornerBlock(st, rng as never, i, j, mat); actLog(`T ${i},${j} m${SHEET_OF[mat]}`);
            if (rng.int(0, 1) === 0) { if (slopeX(i, j, 1)) actLog(`FILL2 ${i},${j}`); }
            else { poundTile(st, i, j); actLog(`FILL2P ${i},${j}`); }
          }
        }
      } else if (!fl(i, j + 1)) {                                    // :16638 悬顶
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
      mark(k, l);
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
        const jn = last ? (x + 1 < W - 20 ? jsRaw[(x + 1) * W + 20]! : js0) : jsRaw[i + W]!;
        const sn = last ? (x + 1 < W - 20 ? cellCnt[(x + 1) * W + 20]! : stream.count) : cellCnt[i + W]!;
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
  // ══ GenSolid 还原（防跨测试污染）══
  resetGenSolid();
  setKillTileGetGood(false);
});
