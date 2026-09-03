// ★IIIII107 一次性分析器②：pass99 反演对拍（纯 node，无游戏代码）。
//  1) 基座自检：b_*.bin ≡ dump098（八通道逐位）
//  2) 复现：a_* vs dump099 mile8 口径（期望 A=1909/T=1975/W=0/L=0/Hf=1/Sl=103 @(3477,204)）
//  3) 写面对拍：V=dump098→dump099（x86 pass99 写面） vs J=b→a（JS 写面），
//     按 pass 扫描序（n0: x∈[5,380) → n1: [400,3800) → n2: [w-380,w-5)）定位首分叉列。
// 用法：node tools/_iii130ana.mjs [--col 3477] [--y0 0 --y1 1200]
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

const OUT = process.env.I130_OUT ?? '/tmp/iii130-out';
const G2 = process.env.I130_G2 ?? `${homedir()}/GoldenChains/golden-remix/dumps`;
const W = 4200, H = 1200, N = W * H;
const D98 = `${G2}/098_Settle_Liquids_Again`;
const D99 = `${G2}/099_Cactus__Palm_Trees____Coral`;

const le16 = (p) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const u8 = (p) => new Uint8Array(readFileSync(p).buffer, readFileSync(p).byteOffset);
const loadDump = (pre) => ({
  a: u8(`${pre}.act`), t: le16(`${pre}.typ`), w: le16(`${pre}.wal`), l: u8(`${pre}.liq`),
  hf: u8(`${pre}.half`), sl: u8(`${pre}.slope`), lt: u8(`${pre}.lty`), ia: u8(`${pre}.inact`),
});
const loadBin = (pfx) => ({
  flags: u8(`${OUT}/${pfx}_flags.bin`), type: le16(`${OUT}/${pfx}_type.bin`),
  wall: le16(`${OUT}/${pfx}_wall.bin`), liquid: u8(`${OUT}/${pfx}_liquid.bin`),
  liquidType: u8(`${OUT}/${pfx}_liquidType.bin`), half: u8(`${OUT}/${pfx}_half.bin`),
  slope: u8(`${OUT}/${pfx}_slope.bin`), wire: u8(`${OUT}/${pfx}_wire.bin`),
  frameX: le16(`${OUT}/${pfx}_frameX.bin`), frameY: le16(`${OUT}/${pfx}_frameY.bin`),
});

const d98 = loadDump(D98), d99 = loadDump(D99);
const B = loadBin('b'), A = loadBin('a');
// JS 内部 type → vanilla sheet（mile8 同款换算；-1→9999 哨兵）
// ★Buffer 池坑：小文件(<8KB)的 readFileSync buffer 带池偏移，必须按 byteOffset 起视图
{
  const sb = readFileSync(`${OUT}/sheet.bin`);
  var SHEET = new Int32Array(sb.buffer.slice(sb.byteOffset, sb.byteOffset + sb.byteLength));
}
const jsSheet = (t) => (SHEET[t] >= 0 ? SHEET[t] : 9999);
const meta = JSON.parse(readFileSync(`${OUT}/meta-base.json`, 'utf8'));
console.log(`meta-base: rcBase=${meta.rcBase} rng.rolls=${meta.rng.rolls} worldSurface=${meta.gsPick.worldSurface} numOasis=${JSON.stringify(meta.gsPick.numOasis)}`);

// ---- 1) 基座自检 b ≡ dump098 ----
{
  let bad = 0, fI = -1;
  for (let i = 0; i < N; i++) {
    if (d98.a[i] !== (B.flags[i] & 1)) { bad++; if (fI < 0) fI = i; continue; }
    const vt = d98.a[i] ? d98.t[i] : 0;
    const jt = (B.flags[i] & 1) ? jsSheet(B.type[i]) : 0;
    if (vt !== jt) { bad++; if (fI < 0) fI = i; }
    if (d98.w[i] !== B.wall[i] || d98.l[i] !== B.liquid[i] || d98.hf[i] !== B.half[i]
      || d98.sl[i] !== B.slope[i] || (d98.ia[i] ? 1 : 0) !== ((B.wire[i] >>> 5) & 1)) { bad++; if (fI < 0) fI = i; }
  }
  console.log(`基座自检 b vs dump098: ${bad === 0 ? '逐位全等 ✓' : `差 ${bad} 格 首@(${fI % W},${(fI / W) | 0}) ✗`}`);
}

// ---- 2) 复现 a vs dump099（mile8 口径） ----
{
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa = 0, fI = -1;
  const pairs = new Map();
  for (let i = 0; i < N; i++) {
    const va = d99.a[i], ja = A.flags[i] & 1;
    if (va !== ja) { dA++; if (fI < 0) fI = i; }
    const vt = va ? d99.t[i] : 0, jt = ja ? jsSheet(A.type[i]) : 0;
    if (vt !== jt) { dT++; if (fI < 0) fI = i; const k = `T${vt}>${jt}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
    if (d99.w[i] !== A.wall[i]) { dW++; if (fI < 0) fI = i; }
    if (d99.l[i] !== A.liquid[i]) { dL++; if (fI < 0) fI = i; }
    if (d99.hf[i] !== A.half[i]) { dHf++; if (fI < 0) fI = i; const k = `H${d99.hf[i]}>${A.half[i]}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
    if (d99.sl[i] !== A.slope[i]) { dSl++; if (fI < 0) fI = i; const k = `S${d99.sl[i]}>${A.slope[i]}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); }
    const vl = d99.l[i] > 0 ? d99.lt[i] + 1 : 0, jl = A.liquid[i] > 0 ? A.liquidType[i] : 0;
    if (vl !== jl) { dLt++; if (fI < 0) fI = i; }
    const via = d99.ia[i] ? 1 : 0, jia = (A.wire[i] >>> 5) & 1;
    if (via !== jia) { dIa++; if (fI < 0) fI = i; }
  }
  console.log(`复现 a vs dump099: A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa} @(${fI % W},${(fI / W) | 0})`);
  console.log(`  pairs: ${[...pairs.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' ')}`);
}

// ---- 3) 写面 V vs J ----
// 写面=与基座逐格差（任一通道）——V: dump098→dump099；J: b→a（JS 通道域）
const chanDiff = (x1, x2) => (i) =>
  x1.a !== undefined ? (
    x1.a[i] !== x2.a[i] || x1.t[i] !== x2.t[i] || x1.w[i] !== x2.w[i] || x1.l[i] !== x2.l[i]
    || x1.hf[i] !== x2.hf[i] || x1.sl[i] !== x2.sl[i] || (x1.l[i] > 0 ? x1.lt[i] + 1 : 0) !== (x2.l[i] > 0 ? x2.lt[i] + 1 : 0)
    || (x1.ia[i] ? 1 : 0) !== (x2.ia[i] ? 1 : 0))
    : (x1.flags[i] !== x2.flags[i] || x1.type[i] !== x2.type[i] || x1.wall[i] !== x2.wall[i]
      || x1.liquid[i] !== x2.liquid[i] || x1.half[i] !== x2.half[i] || x1.slope[i] !== x2.slope[i]
      || ((x2.wire[i] >>> 5) & 1) !== 0 || x1.frameX[i] !== x2.frameX[i] || x1.frameY[i] !== x2.frameY[i]);

// V 格集（dump 域）：写面格
const Vset = new Int32Array(N); // 0/1
{
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (d98.a[i] !== d99.a[i] || (d98.a[i] ? d98.t[i] : 0) !== (d99.a[i] ? d99.t[i] : 0)
      || d98.w[i] !== d99.w[i] || d98.l[i] !== d99.l[i] || d98.hf[i] !== d99.hf[i] || d98.sl[i] !== d99.sl[i]
      || (d98.l[i] > 0 ? d98.lt[i] + 1 : 0) !== (d99.l[i] > 0 ? d99.lt[i] + 1 : 0)
      || (d98.ia[i] ? 1 : 0) !== (d99.ia[i] ? 1 : 0)) { Vset[i] = 1; n++; }
  }
  console.log(`V(x86 pass99 写面)=${n} 格`);
}
// J 格集（JS 通道域）：b→a
const Jset = new Int32Array(N);
{
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (B.flags[i] !== A.flags[i] || B.type[i] !== A.type[i] || B.wall[i] !== A.wall[i]
      || B.liquid[i] !== A.liquid[i] || B.half[i] !== A.half[i] || B.slope[i] !== A.slope[i]
      || B.frameX[i] !== A.frameX[i] || B.frameY[i] !== A.frameY[i]
      || ((A.wire[i] >>> 5) & 1) !== 0 || B.liquidType[i] !== A.liquidType[i]) { Jset[i] = 1; n++; }
  }
  console.log(`J(JS  pass99 写面)=${n} 格`);
}

// 列序对拍：pass 扫描序（n0/n1/n2），逐列比较写面格集
const segs = [[5, 380], [400, W - 400], [W - 380, W - 5]];
let firstBad = null;
const colStat = [];
for (const [x0, x1] of segs) {
  for (let x = x0; x < x1; x++) {
    let vOnly = 0, jOnly = 0, both = 0;
    const vList = [], jList = [];
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (Vset[i] && Jset[i]) { both++; vList.push(i); jList.push(i); }
      else if (Vset[i]) { vOnly++; vList.push(i); }
      else if (Jset[i]) { jOnly++; jList.push(i); }
    }
    if (vOnly || jOnly) {
      colStat.push({ x, vOnly, jOnly, both });
      if (!firstBad) firstBad = { x, vOnly, jOnly, both, vList, jList };
    }
  }
}
console.log(`列序对拍：分叉列数=${colStat.length} 首分叉列=${firstBad ? `x=${firstBad.x} (V独占${firstBad.vOnly}/J独占${firstBad.jOnly}/共有${firstBad.both})` : '无（写面同库）'}`);
if (firstBad) {
  const show = (i) => `(${i % W},${(i / W) | 0})`;
  const dumpDesc = (i) => `act${d98.a[i]}>${d99.a[i]} t${d98.a[i] ? d98.t[i] : 0}>${d99.a[i] ? d99.t[i] : 0} liq${d98.l[i]}>${d99.l[i]} hf${d98.hf[i]}>${d99.hf[i]} sl${d98.sl[i]}>${d99.sl[i]} wal${d98.w[i]}>${d99.w[i]}`;
  const jsDesc = (i) => `act${(B.flags[i] & 1)}>${(A.flags[i] & 1)} t${(B.flags[i] & 1) ? jsSheet(B.type[i]) : 0}>${(A.flags[i] & 1) ? jsSheet(A.type[i]) : 0} liq${B.liquid[i]}>${A.liquid[i]} hf${B.half[i]}>${A.half[i]} sl${B.slope[i]}>${A.slope[i]} fx${B.frameX[i]}>${A.frameX[i]}`;
  console.log(`  首分叉列 x=${firstBad.x} 详情（前 24 格）:`);
  const merged = [...new Set([...firstBad.vList, ...firstBad.jList])].sort((p, q) => p - q).slice(0, 24);
  for (const i of merged) {
    const inV = Vset[i], inJ = Jset[i];
    console.log(`   ${show(i)} ${inV && inJ ? 'V&J' : inV ? 'V  ' : '  J'} | x86 ${inV ? dumpDesc(i) : '-'} | js ${inJ ? jsDesc(i) : '-'}`);
  }
}
// 全列分布摘要
{
  const bySeg = [0, 0, 0];
  for (const c of colStat) bySeg[c.x < 380 ? 0 : c.x < 3800 ? 1 : 2]++;
  console.log(`分叉列按段 n0/n1/n2 = ${bySeg.join('/')}`);
  // 分叉列里 x 的分位
  const xs = colStat.map((c) => c.x);
  console.log(`分叉列 x: min=${xs[0] ?? '-'} p25=${xs[Math.floor(xs.length * 0.25)] ?? '-'} med=${xs[Math.floor(xs.length / 2)] ?? '-'} p75=${xs[Math.floor(xs.length * 0.75)] ?? '-'} max=${xs[xs.length - 1] ?? '-'}`);
}
// 指定列详情
const colArg = process.argv.indexOf('--col');
if (colArg > 0) {
  const x = Number(process.argv[colArg + 1]);
  const out = [];
  for (let y = 0; y < H; y++) {
    const i = y * W + x;
    if (Vset[i] || Jset[i]) out.push(`(${x},${y}) ${Vset[i] ? 'V' : ' '}${Jset[i] ? 'J' : ' '} | x86 act${d98.a[i]}>${d99.a[i]} t${d98.a[i] ? d98.t[i] : 0}>${d99.a[i] ? d99.t[i] : 0} liq${d98.l[i]}>${d99.l[i]} hf${d98.hf[i]}>${d99.hf[i]} sl${d98.sl[i]}>${d99.sl[i]} wal${d98.w[i]}>${d99.w[i]} | js act${(B.flags[i] & 1)}>${(A.flags[i] & 1)} t${(B.flags[i] & 1) ? jsSheet(B.type[i]) : 0}>${(A.flags[i] & 1) ? jsSheet(A.type[i]) : 0} liq${B.liquid[i]}>${A.liquid[i]} hf${B.half[i]}>${A.half[i]} sl${B.slope[i]}>${A.slope[i]} fx${B.frameX[i]}>${A.frameX[i]}`);
  }
  console.log(`列 x=${x} 差格 ${out.length} 行:`);
  console.log(out.slice(0, 80).join('\n'));
}
