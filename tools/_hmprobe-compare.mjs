// 一次性诊断（hm-probe 2026-09-02）：initializeHardMode（肉后条带布局）x86↔JS 对拍
// 【比较器】。三层判据：
//   L0 前置同输入：两侧 pre 全通道逐格差（=0 才有对拍意义；x86 pre ↔ 认证链终态同源）
//   L1 条带几何：V 带两翼（神圣/邪恶）起点·方向·宽度·逐列顶沿；remix 边缘带同法
//   L2 回填墙斑：wall 增量按墙 id 直方图 + 斑块（连通分量）计数/质心清单
//   L3 全图 digest：post 逐通道 FNV-1a + 逐格差（mile8 判定口径：typ 活性格/wall/liq/
//      lty 仅 liquid>0/half/slope/inact）
// 用法：node tools/_hmprobe-compare.mjs <X86DIR> <JSDIR>
//   X86DIR = run-hm-probe.sh 产物目录（含 pre.*/post.*）
//   JSDIR  = _hmprobe.test.ts 产物目录（含 pre.*/post.* + meta.json）
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const X = process.argv[2] ?? '/tmp/hm1458-rig/out/g/hm';
const J = process.argv[3] ?? '/tmp/hm1458-rig/out/g/js';
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
  if (!existsSync(p)) throw new Error(`missing ${p}`);
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

const xp = load(X, 'pre'), xq = load(X, 'post');
const jp = load(J, 'pre'), jq = load(J, 'post');

// ── L0 前置同输入 ──────────────────────────────────────────────
function preDiff(p1, p2, tag) {
  const out = { tag, dA: 0, dT: 0, dW: 0, dL: 0, dLt: 0, dHf: 0, dSl: 0, dIa: 0, first: [] };
  for (let i = 0; i < N; i++) {
    const va = p1.a[i], ja = p2.a[i];
    if (va !== ja) { out.dA++; if (out.first.length < 6) out.first.push(`A${xy(i)} ${va}>${ja}`); }
    const vt = va ? p1.t[i] : 0, jt = ja ? p2.t[i] : 0;
    if (vt !== jt) { out.dT++; if (out.first.length < 6) out.first.push(`T${xy(i)} ${vt}>${jt}`); }
    if (p1.w[i] !== p2.w[i]) { out.dW++; if (out.first.length < 6) out.first.push(`W${xy(i)} ${p1.w[i]}>${p2.w[i]}`); }
    if (p1.l[i] !== p2.l[i]) { out.dL++; if (out.first.length < 6) out.first.push(`L${xy(i)} ${p1.l[i]}>${p2.l[i]}`); }
    const vl = p1.l[i] > 0 ? p1.lt[i] + 1 : 0, jl = p2.l[i] > 0 ? p2.lt[i] + 1 : 0;
    if (vl !== jl) { out.dLt++; if (out.first.length < 6) out.first.push(`Y${xy(i)} ${vl}>${jl}`); }
    if (p1.hf[i] !== p2.hf[i]) out.dHf++;
    if (p1.sl[i] !== p2.sl[i]) out.dSl++;
    if (p1.ia[i] !== p2.ia[i]) out.dIa++;
  }
  return out;
}
const l0x = preDiff(xp, jp, 'x86-pre vs js-pre');
console.log('== L0 前置同输入（应全 0） ==');
console.log(
  `act=${l0x.dA} typ=${l0x.dT} wal=${l0x.dW} liq=${l0x.dL} lty=${l0x.dLt} ` +
    `half=${l0x.dHf} slope=${l0x.dSl} inact=${l0x.dIa} first=[${l0x.first.join(' | ')}]`,
);
const preClean = l0x.dA + l0x.dT + l0x.dW + l0x.dL + l0x.dLt === 0;

// ── 条带/墙斑族表（原版 sheet） ────────────────────────────────
const HALLOW_T = new Set([109, 492, 117, 116, 164, 402, 403, 115]);
const CORRUPT_T = new Set([23, 661, 25, 112, 163, 398, 400, 636]);
const CRIMSON_T = new Set([199, 662, 203, 234, 200, 399, 401, 205]);
const BACKFILL_WALL = new Set([188, 189, 190, 191, 192, 193, 194, 195, 200, 201, 202, 203]);
const HALLOW_WALL = new Set([200, 201, 202, 203]);
const EVIL_WALL = new Set([188, 189, 190, 191, 192, 193, 194, 195]);

// diff mask：post 相对 pre 的 tile 面变化（type 或活性变）
function tileDiffMask(p, q) {
  const m = new Uint8Array(N);
  let n = 0;
  for (let i = 0; i < N; i++) {
    const va = p.a[i], qa = q.a[i];
    const vt = va ? p.t[i] : 0, qt = qa ? q.t[i] : 0;
    if (va !== qa || vt !== qt) { m[i] = 1; n++; }
  }
  return { m, n };
}

function bandReport(mask, post, tag, dungeonX) {
  // 条带归属：取 post 新 type 的群系族（GERunner 转化面）
  const cols = { hallow: new Map(), corrupt: new Map(), crimson: new Map() }; // x -> {top,bot,cnt}
  const counts = { hallow: 0, corrupt: 0, crimson: 0 };
  for (let i = 0; i < N; i++) {
    if (!mask[i]) continue;
    const t = post.a[i] ? post.t[i] : 0;
    let fam = null;
    if (HALLOW_T.has(t)) fam = 'hallow';
    else if (CORRUPT_T.has(t)) fam = 'corrupt';
    else if (CRIMSON_T.has(t)) fam = 'crimson';
    if (!fam) continue;
    counts[fam]++;
    const x = i % W, y = Math.floor(i / W);
    let c = cols[fam].get(x);
    if (!c) { c = { top: y, bot: y, cnt: 0 }; cols[fam].set(x, c); }
    if (y < c.top) c.top = y;
    if (y > c.bot) c.bot = y;
    c.cnt++;
  }
  const lines = [];
  for (const fam of ['hallow', 'corrupt', 'crimson']) {
    const xs = [...cols[fam].keys()].sort((a, b) => a - b);
    if (xs.length === 0) { lines.push(`${fam}: (none)`); continue; }
    let span = 0, topSum = 0, minTop = Infinity, maxTop = -1;
    for (const x of xs) { const c = cols[fam].get(x); span += c.bot - c.top + 1; topSum += c.top; if (c.top < minTop) minTop = c.top; if (c.top > maxTop) maxTop = c.top; }
    // 连续翼识别（x 间隔 >50 视为两翼断开）
    const wings = [];
    let s = xs[0], prev = xs[0];
    for (const x of xs.slice(1)) {
      if (x - prev > 50) { wings.push([s, prev]); s = x; }
      prev = x;
    }
    wings.push([s, prev]);
    lines.push(
      `${fam}: cells=${counts[fam]} cols=${xs.length} x=[${xs[0]}..${xs[xs.length - 1]}] ` +
        `top(min/avg/max)=${minTop}/${Math.round(topSum / xs.length)}/${maxTop} ` +
        `wings=${wings.map(([a, b]) => `${a}-${b}(${b - a + 1})`).join(' ')} ` +
        `vsDungeon=${dungeonX >= 0 && xs.length ? (xs[0] > dungeonX ? 'right' : 'left') : '?'}`,
    );
  }
  console.log(`-- ${tag} (dungeonX=${dungeonX}) --`);
  for (const l of lines) console.log('   ' + l);
  return { cols, counts, lines };
}

// 墙斑：wall 变化格，new wall ∈ 回填族；连通分量（4 邻）质心
function wallPatchReport(p, q, tag) {
  const hist = new Map();
  const cells = [];
  for (let i = 0; i < N; i++) {
    if (q.w[i] === p.w[i]) continue;
    const nw = q.w[i];
    if (!BACKFILL_WALL.has(nw)) continue;
    hist.set(nw, (hist.get(nw) ?? 0) + 1);
    cells.push(i);
  }
  const cellSet = new Set(cells);
  const seen = new Uint8Array(N);
  const patches = [];
  for (const s of cells) {
    if (seen[s]) continue;
    let cnt = 0, sx = 0, sy = 0, top = Infinity, left = Infinity, right = -1, bot = -1;
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const i = st.pop();
      cnt++; sx += i % W; sy += Math.floor(i / W);
      const x = i % W, y = Math.floor(i / W);
      if (x < left) left = x; if (x > right) right = x;
      if (y < top) top = y; if (y > bot) bot = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (cellSet.has(k) && !seen[k]) { seen[k] = 1; st.push(k); }
      }
    }
    patches.push({ cnt, cx: Math.round(sx / cnt), cy: Math.round(sy / cnt), top, bot, left, right });
  }
  patches.sort((a, b) => b.cnt - a.cnt);
  const histStr = [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}×${v}`).join(' ');
  console.log(`-- ${tag} --`);
  console.log(`   backfill wall cells=${cells.length} hist=[${histStr}] patches=${patches.length}`);
  console.log(
    '   top10 patches: ' +
      patches.slice(0, 10).map((p) => `@(${p.cx},${p.cy}) n${p.cnt} [${p.left}-${p.right}×${p.top}-${p.bot}]`).join('  '),
  );
  return { hist, patches, cells };
}

const mx = tileDiffMask(xp, xq);
const mj = tileDiffMask(jp, jq);
console.log('== L1 条带几何（V 带两翼/方向/宽度） ==');
console.log(`x86 tile-diff cells=${mx.n}  js tile-diff cells=${mj.n}`);
const meta = existsSync(join(J, 'meta.json')) ? JSON.parse(readFileSync(join(J, 'meta.json'), 'utf8')) : {};
const dX = meta.dungeonX ?? -1;
bandReport(mx.m, xq, 'x86', dX);
bandReport(mj.m, jq, 'js ', dX);
console.log('== L2 回填墙斑分布 ==');
wallPatchReport(xp, xq, 'x86');
wallPatchReport(jp, jq, 'js ');

// ── L3 全图 digest + 逐格差 ────────────────────────────────────
console.log('== L3 post 全图 digest（FNV-1a，逐通道） ==');
for (const [k, wide] of [['t', true], ['a', false], ['w', true], ['l', false], ['lt', false], ['hf', false], ['sl', false], ['ia', false]]) {
  console.log(`   ${k.padEnd(3)} x86=${fnv(xq[k])}  js=${fnv(jq[k])}  ${fnv(xq[k]) === fnv(jq[k]) ? 'OK' : 'DIFF'}`);
}
console.log('== L3 post 逐格差（mile8 判定口径） ==');
{
  let dA = 0, dT = 0, dW = 0, dL = 0, dLt = 0, dHf = 0, dSl = 0, dIa = 0;
  const pairs = new Map();
  const first = [];
  for (let i = 0; i < N; i++) {
    const va = xq.a[i], ja = jq.a[i];
    if (va !== ja) { dA++; if (first.length < 10) first.push(`A${xy(i)} x${va}/j${ja}`); }
    const vt = va ? xq.t[i] : 0, jt = ja ? jq.t[i] : 0;
    if (vt !== jt) { dT++; const k = `T${vt}>${jt}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); if (first.length < 10) first.push(`T${xy(i)} x${vt}/j${jt}`); }
    if (xq.w[i] !== jq.w[i]) { dW++; const k = `W${xq.w[i]}>${jq.w[i]}`; pairs.set(k, (pairs.get(k) ?? 0) + 1); if (first.length < 10) first.push(`W${xy(i)} x${xq.w[i]}/j${jq.w[i]}`); }
    if (xq.l[i] !== jq.l[i]) { dL++; if (first.length < 10) first.push(`L${xy(i)} x${xq.l[i]}/j${jq.l[i]}`); }
    const vl = xq.l[i] > 0 ? xq.lt[i] + 1 : 0, jl = jq.l[i] > 0 ? jq.lt[i] + 1 : 0;
    if (vl !== jl) { dLt++; if (first.length < 10) first.push(`Y${xy(i)} x${vl}/j${jl}`); }
    if (xq.hf[i] !== jq.hf[i]) dHf++;
    if (xq.sl[i] !== jq.sl[i]) dSl++;
    if (xq.ia[i] !== jq.ia[i]) dIa++;
  }
  console.log(
    `act=${dA} typ=${dT} wal=${dW} liq=${dL} lty=${dLt} half=${dHf} slope=${dSl} inact=${dIa}`,
  );
  console.log('   top pairs: ' + [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}×${n}`).join(' '));
  console.log('   first: ' + first.join(' | '));
  const total = dA + dT + dW + dL + dLt + dHf + dSl + dIa;
  console.log(`== 判定: L0 pre-clean=${preClean}  L3 post-diff-total=${total}  =>  ${preClean && total === 0 ? 'PASS（三层全绿）' : preClean ? 'DIFF（条带/回填面有差，见 L1/L2）' : 'INVALID（pre 不同源，先查 L0）'} ==`);
}
