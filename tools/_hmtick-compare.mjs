// 一次性诊断（NBF 2026-09-02）：世界蔓延 N-tick 对拍【比较器】。
// 输入 = x86 rig（HardmodeProbeHook.RunTickPhase，env SW_HM_TICK_N）与 JS 侧
// （tools/_hmtick.test.ts）的 dump 目录：各含 pre/post/t100/t500/t1000/t3000 全 8 通道。
// 判据分层：
//   L0 前置同输入：两侧 pre 逐格差（=0 才有对拍意义）；两侧 post 逐格差（HM 变换
//      终态，NB-A 口径应为 0；非 0 → 降级为纯统计比较并在报告标注）。
//   L1 增量段对拍：相邻里程碑（post→t100→t500→t1000→t3000）的 tile/wall 增量——
//      逐位 LOCKSTEP 指示（act/typ/wal 逐格差=0）+ 统计口径裁决（蔓延面积/类型
//      直方图/方向）。
//   L2 统计口径：增量按目的格族分类（corruption/crimson/hallow/thorn/other + 墙三族），
//      两侧计数 z 检验（Poisson 近似 σ=√(n1+n2)；空间自相关使 σ 偏小，z 为仪器值
//      非严格检验）+ bbox/质心/左右半场分裂（蔓延方向）。
// RNG 选型备案（F4）：两侧 tick 段均为【keyed 持久流】（x86=SwapRandom
//   "UpdateWorldGen" 复刻 UnifiedRandom(worldSeed)；JS=Math.random 桥
//   UnifiedRandom(world.seed)）——同种子同调用形状可逐位；演化链登记近似处即首差位。
// 用法：node tools/_hmtick-compare.mjs <X86DIR> <JSDIR>
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const X = process.argv[2] ?? '/tmp/hm1458-rig/out/tick/hm';
const J = process.argv[3] ?? '/tmp/nbf-out/js';
const W = Number(process.env.SW_HM_W ?? 4200);
const H = Number(process.env.SW_HM_H ?? 1200);
const N = W * H;
const MILESTONES = [100, 500, 1000, 3000];

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
const fnv = (a) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < a.length; i++) {
    h ^= a[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};
const xy = (i) => `(${i % W},${Math.floor(i / W)})`;

// ---- 族表（sheet id；= WorldEvolution.ts SPREADS_* / CONV_THORN / WALL_SPREADS_* 同源）----
const FAM_TILE = [
  ['corrupt', new Set([23, 661, 25, 112, 398, 400, 163, 32, 636, 24])],
  ['crimson', new Set([199, 662, 203, 234, 399, 401, 200, 352, 205, 201])],
  ['hallow', new Set([109, 492, 117, 116, 402, 403, 164, 115, 110, 113])],
  ['thorn', new Set([69, 655])],
  ['grass', new Set([2, 477, 60, 3, 53])],
];
const FAM_WALL = [
  ['w-corrupt', new Set([69, 217, 220, 3])],
  ['w-crimson', new Set([83, 81, 218, 221])],
  ['w-hallow', new Set([70, 219, 222, 28])],
];
const famOf = (fams, v) => {
  for (const [name, set] of fams) if (set.has(v)) return name;
  return 'other';
};

// ---- worldSurface / rockLevel（方向分裂用）：x86 run.log → JS meta.json 回退 ----
function surfaceOf() {
  try {
    const log = readFileSync(join(dirname(X), 'run.log'), 'utf8');
    const m = /worldSurface=([0-9.]+)/.exec(log);
    const r = /rockLayer=([0-9.]+)/.exec(log);
    if (m) return { ws: parseFloat(m[1]), rl: r ? parseFloat(r[1]) : NaN, src: 'x86 run.log' };
  } catch { /* fallthrough */ }
  try {
    const meta = JSON.parse(readFileSync(join(J, 'meta.json'), 'utf8'));
    return { ws: meta.groundLevel, rl: meta.rockLevel, src: 'js meta.json' };
  } catch { return { ws: NaN, rl: NaN, src: 'n/a' }; }
}
const SURF = surfaceOf();

const xp = load(X, 'pre'), jp = load(J, 'pre');
const xq = load(X, 'post'), jq = load(J, 'post');

// ---- L0：前置同输入 ----
function preDiff(p1, p2) {
  const out = { dA: 0, dT: 0, dW: 0, dL: 0, dHf: 0, dSl: 0, first: [] };
  for (let i = 0; i < N; i++) {
    const va = p1.a[i], ja = p2.a[i];
    if (va !== ja) { out.dA++; if (out.first.length < 6) out.first.push(`A${xy(i)} ${va}>${ja}`); }
    const vt = va ? p1.t[i] : 0, jt = ja ? p2.t[i] : 0;
    if (vt !== jt) { out.dT++; if (out.first.length < 6) out.first.push(`T${xy(i)} ${vt}>${jt}`); }
    if (p1.w[i] !== p2.w[i]) { out.dW++; if (out.first.length < 6) out.first.push(`W${xy(i)} ${p1.w[i]}>${p2.w[i]}`); }
    if (p1.l[i] !== p2.l[i]) { out.dL++; }
    if (p1.hf[i] !== p2.hf[i]) out.dHf++;
    if (p1.sl[i] !== p2.sl[i]) out.dSl++;
  }
  return out;
}
console.log('== L0 pre（前置同输入，应全 0） ==');
const l0 = preDiff(xp, jp);
console.log(`act=${l0.dA} typ=${l0.dT} wal=${l0.dW} liq=${l0.dL} half=${l0.dHf} slope=${l0.dSl} first=[${l0.first.join(' | ')}]`);
console.log('== L0 post（HM 变换终态，NB-A 口径应全 0） ==');
const l0p = preDiff(xq, jq);
console.log(`act=${l0p.dA} typ=${l0p.dT} wal=${l0p.dW} liq=${l0p.dL} half=${l0p.dHf} slope=${l0p.dSl} first=[${l0p.first.join(' | ')}]`);

// ---- L1/L2：相邻里程碑增量 ----
// 增量提取：from→to 的逐格差。tile 记 (fromAct,fromTyp)→(toAct,toTyp)，wall 记 wall 差。
function increment(from, to) {
  const tiles = [];   // {i, fa, ft, ta, tt}
  const walls = [];   // {i, fw, tw}
  const other = { liq: 0, lty: 0, half: 0, slope: 0, inact: 0 };
  for (let i = 0; i < N; i++) {
    const fa = from.a[i], ta = to.a[i];
    const ft = fa ? from.t[i] : 0, tt = ta ? to.t[i] : 0;
    if (fa !== ta || ft !== tt) tiles.push({ i, fa, ft, ta, tt });
    if (from.w[i] !== to.w[i]) walls.push({ i, fw: from.w[i], tw: to.w[i] });
    if (from.l[i] !== to.l[i]) other.liq++;
    if ((from.l[i] > 0 ? from.lt[i] + 1 : 0) !== (to.l[i] > 0 ? to.lt[i] + 1 : 0)) other.lty++;
    if (from.hf[i] !== to.hf[i]) other.half++;
    if (from.sl[i] !== to.sl[i]) other.slope++;
    if (from.ia[i] !== to.ia[i]) other.inact++;
  }
  return { tiles, walls, other };
}

// 增量统计：族直方图 + 空间（bbox/质心/左右/表深）
function stats(inc) {
  const fam = {}, tf = {}, wf = {};   // 目的族计数 / tile 转移 top / wall 转移 top
  for (const [name] of FAM_TILE) fam[name] = 0;
  fam.other = 0;
  for (const [name] of FAM_WALL) wf[name] = 0;
  wf.other = 0;
  let act0 = 0, act1 = 0;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, sx = 0, left = 0, right = 0, deep = 0;
  const trans = new Map();
  for (const c of inc.tiles) {
    const key = `${c.fa ? c.ft : -1}>${c.ta ? c.tt : -1}`;
    trans.set(key, (trans.get(key) ?? 0) + 1);
    if (!c.fa && c.ta) act1++;
    if (c.fa && !c.ta) act0++;
    const f = famOf(FAM_TILE, c.ta ? c.tt : -1);
    fam[f]++;
    const x = c.i % W, y = Math.floor(c.i / W);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    sx += x;
    if (x < W / 2) left++; else right++;
    if (y > SURF.ws) deep++;
  }
  const wtrans = new Map();
  for (const c of inc.walls) {
    const key = `${c.fw}>${c.tw}`;
    wtrans.set(key, (wtrans.get(key) ?? 0) + 1);
    wf[famOf(FAM_WALL, c.tw)]++;
  }
  const n = inc.tiles.length || 1;
  const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
  return {
    n: inc.tiles.length, act0, act1, fam,
    bbox: inc.tiles.length ? [minX, minY, maxX, maxY] : null,
    cx: inc.tiles.length ? +(sx / inc.tiles.length).toFixed(1) : null,
    left, right, deep,
    topTrans: top(trans, 10), walls: inc.walls.length, wallFam: wf, topWallTrans: top(wtrans, 8),
    other: inc.other,
  };
}

// 逐位 LOCKSTEP 指示 + 首差坐标
function lockstep(a, b) {
  let d = 0, dT = 0, dW = 0;
  const first = [];
  for (let i = 0; i < N; i++) {
    const va = a.a[i], ja = b.a[i];
    const vt = va ? a.t[i] : 0, jt = ja ? b.t[i] : 0;
    if (va !== ja || vt !== jt) {
      d++;
      if (first.length < 6) first.push(`${xy(i)} ${va ? vt : '-'}>${ja ? jt : '-'}${a.w[i] !== b.w[i] ? ' W' + a.w[i] + '>' + b.w[i] : ''}`);
    }
    if (a.w[i] !== b.w[i]) dW++;
  }
  return { d, dW, first };
}

// 跨侧统计裁决：z = (n2-n1)/√(n1+n2)（Poisson 近似；空间自相关 → 仪器值非严格检验）
function verdict(fx, fj, keys) {
  const rows = [];
  for (const k of keys) {
    const n1 = fx[k] ?? 0, n2 = fj[k] ?? 0;
    const z = n1 + n2 === 0 ? 0 : (n2 - n1) / Math.sqrt(n1 + n2);
    const rel = n1 === 0 && n2 === 0 ? 0 : (n2 - n1) / Math.max(1, Math.max(n1, n2));
    rows.push({ fam: k, x86: n1, js: n2, rel: +(rel * 100).toFixed(1), z: +z.toFixed(2), ok: Math.abs(z) <= 3 || Math.abs(rel) <= 0.05 });
  }
  return rows;
}

const xMile = MILESTONES.filter((m) => existsSync(join(X, `t${m}.typ`)));
const jMile = MILESTONES.filter((m) => existsSync(join(J, `t${m}.typ`)));
console.log(`\n== 里程碑在场 ==  x86=[${xMile.join(',')}] js=[${jMile.join(',')}]  ws=${SURF.ws} rl=${SURF.rl} (${SURF.src})`);

const summary = { L0pre: l0, L0post: l0p, milestones: {} };
let prevX = xq, prevJ = jq, prevTag = 'post';
const common = xMile.filter((m) => jMile.includes(m));
for (const m of common) {
  const cx = load(X, `t${m}`), cj = load(J, `t${m}`);
  const incX = increment(prevX, cx), incJ = increment(prevJ, cj);
  const stX = stats(incX), stJ = stats(incJ);
  const ls = lockstep(cx, cj);
  const fams = [...FAM_TILE.map((f) => f[0].trim()), 'other'];
  const wfams = [...FAM_WALL.map((f) => f[0].trim()), 'other'];
  const rows = verdict(stX.fam, stJ.fam, fams);
  const wrows = verdict(stX.wallFam, stJ.wallFam, wfams);
  const total = verdict({ n: stX.n }, { n: stJ.n }, ['n'])[0];
  console.log(`\n== 段 ${prevTag}→t${m}（增量） ==`);
  console.log(`  x86: tiles=${stX.n} act0=${stX.act0} act1=${stX.act1} walls=${stX.walls} bbox=${stX.bbox} cx=${stX.cx} L/R=${stX.left}/${stX.right} deep=${stX.deep} liq=${stX.other.liq} inact=${stX.other.inact}`);
  console.log(`  x86 fam: ${rows.map((r) => `${r.fam}=${stX.fam[r.fam] ?? 0}`).join(' ')}`);
  console.log(`  x86 trans: ${stX.topTrans.map(([k, v]) => `${k}×${v}`).join(' ')}`);
  console.log(`  x86 wall: ${stX.topWallTrans.map(([k, v]) => `${k}×${v}`).join(' ')}`);
  console.log(`  js : tiles=${stJ.n} act0=${stJ.act0} act1=${stJ.act1} walls=${stJ.walls} bbox=${stJ.bbox} cx=${stJ.cx} L/R=${stJ.left}/${stJ.right} deep=${stJ.deep} liq=${stJ.other.liq} inact=${stJ.other.inact}`);
  console.log(`  js  fam: ${rows.map((r) => `${r.fam}=${stJ.fam[r.fam] ?? 0}`).join(' ')}`);
  console.log(`  js  trans: ${stJ.topTrans.map(([k, v]) => `${k}×${v}`).join(' ')}`);
  console.log(`  js  wall: ${stJ.topWallTrans.map(([k, v]) => `${k}×${v}`).join(' ')}`);
  console.log(`  裁决 tiles ${total.x86} vs ${total.js} rel=${total.rel}% z=${total.z} -> ${total.ok ? 'GREEN(统计)' : 'FLAG'}`);
  for (const r of [...rows, ...wrows]) {
    if (!r.ok) console.log(`    FLAG ${r.fam}: x86=${r.x86} js=${r.js} rel=${r.rel}% z=${r.z}`);
  }
  console.log(`  逐位: typ差=${ls.d} wall差=${ls.dW} ${ls.d === 0 && ls.dW === 0 ? 'LOCKSTEP' : `首差=[${ls.first.join(' | ')}]`}`);
  console.log(`  digest typ: x86=${fnv(cx.t)} js=${fnv(cj.t)}${fnv(cx.t) === fnv(cj.t) ? ' (同)' : ''}`);
  summary.milestones[`t${m}`] = {
    from: prevTag,
    x86: stX, js: stJ,
    verdictRows: rows, wallRows: wrows, total,
    lockstep: { d: ls.d, dW: ls.dW, first: ls.first },
    digest: { x86: fnv(cx.t), js: fnv(cj.t) },
  };
  prevX = cx; prevJ = cj; prevTag = `t${m}`;
}
const onlyX = xMile.filter((m) => !jMile.includes(m));
const onlyJ = jMile.filter((m) => !xMile.includes(m));
if (onlyX.length || onlyJ.length) console.log(`\n(单侧里程碑，未对拍：x86=[${onlyX.join(',')}] js=[${onlyJ.join(',')}])`);

mkdirSync('/tmp/nbf-out', { recursive: true });
writeFileSync('/tmp/nbf-out/compare-tick.json', JSON.stringify(summary, null, 1));
console.log('\n[compare] summary -> /tmp/nbf-out/compare-tick.json');
