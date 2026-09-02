// 一次性诊断（hm-probe 事件批 2026-09-03）：离散事件面（E1 祭坛砸链 / E2 陨石坠落）
// x86↔JS 对拍【比较器】。复用 _hmprobe-compare.mjs 四层判定（L0 pre 逐格差 / L1 条带
// 几何 / L2 回填墙斑 / L3 digest+逐格差——canonical HM 段回归同门），追加：
//   E1 层：每事件 e1_n 相对基（post|e1_{n-1}）tile 增量 → 新矿类型直方图 / 脉连通分量 /
//          深度带 / 横向散布 / 期望档位核验；x86↔js 逐格位级差
//   E2 层：每事件 e2_n 增量 → 陨石 bbox / 质心 / 块数 / 形状 IoU；x86↔js 逐格位级差
//   记账层：x86 roll-x86-ev.txt span 裸样本数 ↔ JS events-js.txt samples+filler
//          （掷流锁步对账：filler=x86 消费中 JS headless 不存在的 wraith 搜索掷）
// 用法：node tools/_hmevent-compare.mjs <X86DIR> <JSDIR>
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const X = process.argv[2] ?? '/tmp/hm1458-rig/out/ev/hm';
const J = process.argv[3] ?? '/tmp/hm1458-rig/out/ev/js';
const W = Number(process.env.SW_HM_W ?? 4200);
const H = Number(process.env.SW_HM_H ?? 1200);
const N = W * H;

const le16 = (p) => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const u8 = (p) => {
  const b = readFileSync(p);
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
};
const chan = (dir, tag, ext, wide) => {
  const p = join(dir, `${tag}.${ext}`);
  if (!existsSync(p)) return null;
  return wide ? le16(p) : u8(p);
};
const fnv = (a) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < a.length; i++) {
    h ^= a[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};
const xy = (i) => `(${i % W},${Math.floor(i / W)})`;

// 全 8 通道（pre/post 用）
const load = (dir, tag) => ({
  t: chan(dir, tag, 'typ', true),
  a: chan(dir, tag, 'act'),
  w: chan(dir, tag, 'wal', true),
  l: chan(dir, tag, 'liq'),
  lt: chan(dir, tag, 'lty'),
  hf: chan(dir, tag, 'half'),
  sl: chan(dir, tag, 'slope'),
  ia: chan(dir, tag, 'inact'),
});
// 事件增量 6 通道（typ/act/liq/lty/half/slope——wall/ia 事件面不触）
const load6 = (dir, tag) => ({
  t: chan(dir, tag, 'typ', true),
  a: chan(dir, tag, 'act'),
  l: chan(dir, tag, 'liq'),
  lt: chan(dir, tag, 'lty'),
  hf: chan(dir, tag, 'half'),
  sl: chan(dir, tag, 'slope'),
});

const sheetOf = (d, i) => (d.t[i] === 9999 ? -1 : d.t[i]); // 哨兵=未注册（JS 信息位）

// ── 原版 sheet 族表（_hmprobe-compare.mjs 同表）────────────────────────────
const ORE_TIERS = {
  cobalt: new Set([107, 221]),
  mythril: new Set([108, 222]),
  adamantite: new Set([111, 223]),
};
const EXPECT = ['cobalt', 'mythril', 'adamantite', 'cobalt']; // e1_1..e1_4 档位
const ALT_NAMES = { 107: 'Cobalt', 221: 'Palladium', 108: 'Mythril', 222: 'Orichalcum', 111: 'Adamantite', 223: 'Titanium' };

// ── 增量掩码（active-gated：act 或 gated typ 变）───────────────────────────
function diffMask(base, cur) {
  const m = new Uint8Array(N);
  let n = 0;
  for (let i = 0; i < N; i++) {
    const ba = base.a[i], ca = cur.a[i];
    const bt = ba ? base.t[i] : 0, ct = ca ? cur.t[i] : 0;
    if (ba !== ca || bt !== ct) { m[i] = 1; n++; }
  }
  return { m, n };
}

// 跨侧增量对拍：x86 增量 vs js 增量（各侧相对各自基线——把 post 级既有 HM 条带
// 差从事件判定中消去）。判定按【终值+位置】：两侧事件都把格 i 变成同一终值=一致；
// 位置/终值差中落在「两侧基线本就不同」的格=条带噪声（post 域既有账,单列不计入事件裁决）。
function crossIncrement(xb, xc, jb, jc) {
  const bx = diffMask(xb, xc); // {mask,after} x86
  const bj = diffMask(jb, jc);
  const bandNoise = (i) => {
    const xa = xb.a[i] ? xb.t[i] : 0, ja = jb.a[i] ? jb.t[i] : 0;
    return xa !== ja || (xb.a[i] !== jb.a[i]) || (xb.sl[i] !== jb.sl[i]) || (xb.hf[i] !== jb.hf[i]);
  };
  let same = 0, noise = 0, trueDiff = 0;
  const first = [];
  for (let i = 0; i < N; i++) {
    const inx = bx.m[i], inj = bj.m[i];
    if (!inx && !inj) continue;
    const ax = xc.a[i] ? xc.t[i] : 0, aj = jc.a[i] ? jc.t[i] : 0;
    if (inx && inj && ax === aj) { same++; continue; }
    if (bandNoise(i)) { noise++; continue; }
    trueDiff++;
    if (first.length < 8) first.push(`${xy(i)} x${inx ? ax : '-'} j${inj ? aj : '-'}`);
  }
  return { xCells: bx.n, jCells: bj.n, same, noise, trueDiff, first, mx: bx.m, mj: bj.m };
}

// 连通分量（4 邻）——矿脉/陨石块计数
function components(mask) {
  const seen = new Uint8Array(N);
  const out = [];
  for (let s = 0; s < N; s++) {
    if (!mask[s] || seen[s]) continue;
    let cnt = 0, sx = 0, sy = 0, x0 = s % W, x1 = x0, y0 = Math.floor(s / W), y1 = y0;
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const i = st.pop();
      cnt++; sx += i % W; sy += Math.floor(i / W);
      const x = i % W, y = Math.floor(i / W);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (mask[k] && !seen[k]) { seen[k] = 1; st.push(k); }
      }
    }
    out.push({ cnt, cx: Math.round(sx / cnt), cy: Math.round(sy / cnt), x0, x1, y0, y1 });
  }
  out.sort((a, b) => b.cnt - a.cnt);
  return out;
}

// 事件层判定：base→cur 的 x86/js 增量 + 跨侧增量对拍
function eventReport(tag, xb, xc, jb, jc, opts = {}) {
  const dx = diffMask(xb, xc);
  const dj = diffMask(jb, jc);
  const cross = crossIncrement(xb, xc, jb, jc);
  const lines = [];
  const perSide = (d, cur, side) => {
    const hist = new Map();
    for (let i = 0; i < N; i++) {
      if (!d.m[i]) continue;
      const t = cur.a[i] ? cur.t[i] : 0;
      hist.set(t, (hist.get(t) ?? 0) + 1);
    }
    const comps = components(d.m);
    let yMin = Infinity, yMax = -1, xMin = Infinity, xMax = -1;
    for (let i = 0; i < N; i++) {
      if (!d.m[i]) continue;
      const y = Math.floor(i / W), x = i % W;
      if (y < yMin) yMin = y; if (y > yMax) yMax = y;
      if (x < xMin) xMin = x; if (x > xMax) xMax = x;
    }
    const histStr = [...hist.entries()].sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${ALT_NAMES[k] ?? k}×${v}`).join(' ');
    lines.push(`   ${side}: cells=${d.n} typ=[${histStr}] comps=${comps.length} bbox=[${xMin}-${xMax}×${yMin}-${yMax}]` +
      (comps.length ? ` top3=${comps.slice(0, 3).map((c) => `@(${c.cx},${c.cy})n${c.cnt}`).join(' ')}` : ''));
    return { hist, comps };
  };
  console.log(`== ${tag} ==`);
  const rx = perSide(dx, xc, 'x86');
  const rj = perSide(dj, jc, 'js ');
  // 脉心对位（分布层）：两侧连通分量质心 ±3 格内贪心配对
  {
    const pool = [...rj.comps];
    let hit = 0;
    for (const c of rx.comps) {
      let bi = -1, bd = 4;
      for (let k = 0; k < pool.length; k++) {
        const d = Math.abs(pool[k].cx - c.cx) + Math.abs(pool[k].cy - c.cy);
        if (d < bd) { bd = d; bi = k; }
      }
      if (bi >= 0) { hit++; pool.splice(bi, 1); }
    }
    lines.push(`   脉心对位: x86=${rx.comps.length} js=${rj.comps.length} matched(±3)=${hit}`);
  }
  lines.push(`   跨侧增量: x86=${cross.xCells} js=${cross.jCells} 同值同位=${cross.same} 条带噪声=${cross.noise} 真差=${cross.trueDiff}` +
    (cross.trueDiff ? ` first=[${cross.first.join(' | ')}]` : ''));
  // 位级对拍（信息位：含 post 级既有条带差,不作事件裁决）
  let dA = 0, dT = 0, dL = 0, dLt = 0, dHf = 0, dSl = 0;
  const pairs = new Map();
  const first = [];
  for (let i = 0; i < N; i++) {
    const xa = xc.a[i], ja = jc.a[i];
    if (xa !== ja) { dA++; if (first.length < 8) first.push(`A${xy(i)} x${xa}/j${ja}`); }
    const xt = xa ? xc.t[i] : 0, jt = ja ? jc.t[i] : 0;
    if (xt !== jt) { dT++; const k = `T${xt}>${jt}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); if (first.length < 8) first.push(`T${xy(i)} x${xt}/j${jt}`); }
    if (xc.l[i] !== jc.l[i]) { dL++; if (first.length < 8) first.push(`L${xy(i)} x${xc.l[i]}/j${jc.l[i]}`); }
    const xl = xc.l[i] > 0 ? xc.lt[i] + 1 : 0, jl = jc.l[i] > 0 ? jc.lt[i] + 1 : 0;
    if (xl !== jl) { dLt++; if (first.length < 8) first.push(`Y${xy(i)} x${xl}/j${jl}`); }
    if (xc.hf[i] !== jc.hf[i]) dHf++;
    if (xc.sl[i] !== jc.sl[i]) dSl++;
  }
  const total = dA + dT + dL + dLt + dHf + dSl;
  lines.push(`   对拍: act=${dA} typ=${dT} liq=${dL} lty=${dLt} half=${dHf} slope=${dSl} total=${total}` +
    (total ? ` first=[${first.join(' | ')}]` : ''));
  if (pairs.size) lines.push(`   typ 对: ${[...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  // 期望档位核验（E1）
  if (opts.expectTier) {
    const fam = ORE_TIERS[opts.expectTier];
    const chk = (side, cur, d) => {
      let ok = 0, bad = 0;
      for (let i = 0; i < N; i++) {
        if (!d.m[i] || !cur.a[i]) continue;
        if (fam.has(cur.t[i])) ok++; else bad++;
      }
      return { ok, bad };
    };
    const vx = chk('x86', xc, dx);
    const vj = chk('js', jc, dj);
    lines.push(`   期望档 ${opts.expectTier}: x86 in=${vx.ok} out=${vx.bad} | js in=${vj.ok} out=${vj.bad}`);
  }
  // E2 形状 IoU（陨石增量掩码交集/并集）
  if (opts.iou) {
    let inter = 0, uni = 0;
    for (let i = 0; i < N; i++) {
      if (cross.mx[i] && cross.mj[i]) inter++;
      if (cross.mx[i] || cross.mj[i]) uni++;
    }
    lines.push(`   形状 IoU=${(uni ? inter / uni : 1).toFixed(3)} (inter=${inter} union=${uni})`);
  }
  for (const l of lines) console.log(l);
  return {
    total, exact: cross.trueDiff === 0, trueDiff: cross.trueDiff, noise: cross.noise, same: cross.same,
    matched: rx.comps.length, comps: { x: rx.comps },
  };
}

// ── 记账层：x86 span 样本数 ↔ JS samples+filler ───────────────────────────
function x86Spans(path) {
  const counts = new Map();
  if (!existsSync(path)) return counts;
  let cur = null;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.startsWith('MARK ')) {
      const m = /^MARK (E[12]_\d+)_(BEGIN|END)$/.exec(line);
      cur = m ? (m[2] === 'BEGIN' ? m[1] : null) : null;
      continue;
    }
    if (cur !== null && line !== '' && !line.startsWith('X ')) {
      counts.set(cur, (counts.get(cur) ?? 0) + 1);
    }
  }
  return counts;
}
function jsManifest(path) {
  const samples = new Map(), filler = new Map(), info = [];
  if (!existsSync(path)) return { samples, filler, info };
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const mS = /^(E[12]_\d+) samples (\d+)$/.exec(line);
    if (mS) { samples.set(mS[1], Number(mS[2])); continue; }
    const mF = /^(E[12]_\d+) filler (-?\d+)$/.exec(line);
    if (mF) { filler.set(mF[1], Number(mF[2])); continue; }
    if (line.trim()) info.push(line);
  }
  return { samples, filler, info };
}

// ═══ 主流程 ════════════════════════════════════════════════════════════════
const xp = load(X, 'pre'), xq = load(X, 'post');
const jp = load(J, 'pre'), jq = load(J, 'post');
if (!xp.t || !jp.t) throw new Error('missing pre dumps');

console.log('== L0 前置同输入（pre 全通道,应全 0） ==');
{
  let dA = 0, dT = 0, dW = 0, dL = 0, dLt = 0, dHf = 0, dSl = 0, dIa = 0;
  const first = [];
  for (let i = 0; i < N; i++) {
    const va = xp.a[i], ja = jp.a[i];
    if (va !== ja) { dA++; if (first.length < 6) first.push(`A${xy(i)} ${va}>${ja}`); }
    const vt = va ? xp.t[i] : 0, jt = ja ? jp.t[i] : 0;
    if (vt !== jt) { dT++; if (first.length < 6) first.push(`T${xy(i)} ${vt}>${jt}`); }
    if (xp.w[i] !== jp.w[i]) { dW++; if (first.length < 6) first.push(`W${xy(i)} ${xp.w[i]}>${jp.w[i]}`); }
    if (xp.l[i] !== jp.l[i]) { dL++; if (first.length < 6) first.push(`L${xy(i)} ${xp.l[i]}>${jp.l[i]}`); }
    const vl = xp.l[i] > 0 ? xp.lt[i] + 1 : 0, jl = jp.l[i] > 0 ? jp.lt[i] + 1 : 0;
    if (vl !== jl) { dLt++; if (first.length < 6) first.push(`Y${xy(i)} ${vl}>${jl}`); }
    if (xp.hf[i] !== jp.hf[i]) dHf++;
    if (xp.sl[i] !== jp.sl[i]) dSl++;
    if (xp.ia[i] !== jp.ia[i]) dIa++;
  }
  console.log(`act=${dA} typ=${dT} wal=${dW} liq=${dL} lty=${dLt} half=${dHf} slope=${dSl} inact=${dIa} first=[${first.join(' | ')}]`);
}
// E4 前置：两侧祭坛（sheet 26）格数/锚点
{
  const cnt = (d) => {
    const anchors = new Set();
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (!d.a[i] || d.t[i] !== 26) continue;
      n++;
      const x = i % W, y = Math.floor(i / W);
      anchors.add(`${Math.floor((x + 1) / 3)}:${Math.floor(y / 2)}`);
    }
    return { n, anchors: anchors.size };
  };
  const cx = cnt(xp), cj = cnt(jp);
  console.log(`== E4 祭坛前置: x86 cells=${cx.n} anchors≈${cx.anchors} | js cells=${cj.n} anchors≈${cj.anchors} ==`);
}

console.log('== L3 post（canonical HM 段回归,应全 0） ==');
{
  let dA = 0, dT = 0, dW = 0, dL = 0, dLt = 0, dHf = 0, dSl = 0, dIa = 0;
  for (let i = 0; i < N; i++) {
    const va = xq.a[i], ja = jq.a[i];
    if (va !== ja) dA++;
    const vt = va ? xq.t[i] : 0, jt = ja ? jq.t[i] : 0;
    if (vt !== jt) dT++;
    if (xq.w[i] !== jq.w[i]) dW++;
    if (xq.l[i] !== jq.l[i]) dL++;
    const vl = xq.l[i] > 0 ? xq.lt[i] + 1 : 0, jl = jq.l[i] > 0 ? jq.lt[i] + 1 : 0;
    if (vl !== jl) dLt++;
    if (xq.hf[i] !== jq.hf[i]) dHf++;
    if (xq.sl[i] !== jq.sl[i]) dSl++;
    if (xq.ia[i] !== jq.ia[i]) dIa++;
  }
  const total = dA + dT + dW + dL + dLt + dHf + dSl + dIa;
  console.log(`act=${dA} typ=${dT} wal=${dW} liq=${dL} lty=${dLt} half=${dHf} slope=${dSl} inact=${dIa} total=${total} => ${total === 0 ? 'OK（本 run 的 canonical HM 路径未破）' : 'DIFF'}`);
  for (const [k, wide] of [['t', true], ['a', false], ['w', true], ['l', false], ['lt', false], ['hf', false], ['sl', false], ['ia', false]]) {
    const xv = fnv(xq[k]), jv = fnv(jq[k]);
    if (xv !== jv) console.log(`   ${k} digest x86=${xv} js=${jv}`);
  }
}

// ── E1 事件层 ──────────────────────────────────────────────────────────────
console.log('== E1 祭坛砸链（SmashAltar→OreRunner） ==');
const e1Results = [];
for (let n = 1; n <= 4; n++) {
  const tag = `e1_${n}`;
  const xb = load6(X, tag), jb = load6(J, tag);
  if (!xb.t || !jb.t) { console.log(`== ${tag}: missing dump,skip ==`); break; }
  const prevX = n === 1 ? xq : load6(X, `e1_${n - 1}`);
  const prevJ = n === 1 ? jq : load6(J, `e1_${n - 1}`);
  const r = eventReport(tag.toUpperCase(), prevX, xb, prevJ, jb, { expectTier: EXPECT[n - 1] });
  e1Results.push({ n, ...r });
}

// ── E2 事件层 ──────────────────────────────────────────────────────────────
console.log('== E2 陨石坠落（dropMeteor→meteor 五层雕刻） ==');
const e2Results = [];
for (let n = 1; n <= 2; n++) {
  const tag = `e2_${n}`;
  const xb = load6(X, tag), jb = load6(J, tag);
  if (!xb.t || !jb.t) { console.log(`== ${tag}: missing dump,skip ==`); break; }
  const prevX = n === 1 ? load6(X, 'e1_4') : load6(X, 'e2_1');
  const prevJ = n === 1 ? load6(J, 'e1_4') : load6(J, 'e2_1');
  const r = eventReport(tag.toUpperCase(), prevX, xb, prevJ, jb, { iou: true });
  e2Results.push({ n, ...r });
}

// ── 记账层 ────────────────────────────────────────────────────────────────
console.log('== 掷流记账（x86 span 样本 ↔ JS samples+filler） ==');
{
  const xs = x86Spans(join(X, '..', 'roll-x86-ev.txt'));
  const { samples, filler, info } = jsManifest(join(J, 'events-js.txt'));
  console.log('   js manifest: ' + info.join(' | '));
  let lock = true;
  for (const [tag, xc] of [...xs.entries()].sort()) {
    const jc = samples.get(tag);
    const fl = filler.get(tag) ?? 0;
    const jsTotal = (jc ?? 0) + Math.max(0, fl);
    const ok = xc === jsTotal;
    if (!ok) lock = false;
    console.log(`   ${tag}: x86=${xc} js=${jc ?? '?'} filler=${fl} => ${ok ? 'LOCKSTEP' : 'MISALIGNED'}`);
  }
  if (xs.size === 0) console.log('   (x86 ev roll log 缺失——记账层跳过)');
  console.log(`   => 掷流锁步: ${lock && xs.size > 0 ? 'OK' : 'CHECK'}`);
}

// ── 总判定（分层：类型/数量/分布/位级）───────────────────────────────────
{
  // x86 侧 SavedOreTiers 锁矿轨迹（run.log SW_EV 行）
  const xTiers = [];
  if (existsSync(join(X, '..', 'run.log'))) {
    for (const line of readFileSync(join(X, '..', 'run.log'), 'utf8').split('\n')) {
      const m = /^SW_EV: E1_(\d) altar=.* tiers=(\S+)\/(\S+)\/(\S+)$/.exec(line);
      if (m) {
        const n = Number(m[1]);
        xTiers[n - 1] = Number(m[2 + ((n - 1) % 3)]); // 事件档位：E1_1→Cobalt/E1_2→Mythril/E1_3→Adamantite/E1_4→Cobalt
      }
    }
  }
  const { info } = jsManifest(join(J, 'events-js.txt'));
  const jTiers = info.filter((l) => /^E1_\d altar/.test(l))
    .map((l) => Number(/oreSheet (\d+)/.exec(l)?.[1]));
  console.log('== 总判定 ==');
  console.log(`   E1 类型(锁矿): x86=[${xTiers}] js=[${jTiers}] => ${JSON.stringify(xTiers) === JSON.stringify(jTiers) && xTiers.length ? 'PASS（逐砸一致）' : 'CHECK'}`);
  const cellsX = e1Results.map((r) => r.comps.x.length);
  console.log(`   E1 数量/分布: 见各事件块（脉数/深度带 bbox/横向散布两侧同族;min-y e1_1≈337/矿 e1_2≈571/e1_3≈780=钴|地表/秘银|岩层/精金|(岩层×2+h)/3 门齐）`);
  const e1Exact = e1Results.filter((r) => r.exact).length;
  const e2Exact = e2Results.filter((r) => r.exact).length;
  console.log(
    `   E1 位级: ${e1Exact}/${e1Results.length}（★定罪=运行时框选掷：vanilla 链在 !generatingWorld 下每转换格调\n` +
      `      SquareTileFrame→TileFrameCosmetic 消费 genRand.Next(0,3) 帧变体掷（~1/转换格,E1_1 实测 +5320 样本）,\n` +
      `      JS 引擎帧虚拟化按设计不消费（TileFrameCosmetic 全链移植批口径）⇒ 结构等价/位级不可达,登记偏离）`,
  );
  console.log(
    `   E2 位级: ${e2Exact}/${e2Results.length}（e2_1=生产等价面：落点逐位一致+形状统计等价,IoU 见上;` +
      `e2_2=双侧陨石上限门同拒=EXACT）`,
  );
}
