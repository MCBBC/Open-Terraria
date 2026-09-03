// IIII220 批取证仪②：GFB #97 写面对账（vanilla 096→097 vs JS 096→097）。
// 用法：node tools/_iii220face.mjs [family-filter]
// 产物：/tmp/iii220-out/face-report.txt
import { readFileSync, writeFileSync } from 'node:fs';
const OUT = process.env.SW_I220_OUT ?? '/tmp/iii220-out';
const G2 = process.env.SW_I220_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = Number(process.env.SW_I220_W ?? 4200), H = Number(process.env.SW_I220_H ?? 1200), N = W * H;

const le16 = (p) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const u8 = (p) => new Uint8Array(readFileSync(p).buffer, 0, readFileSync(p).length);
const u8b = (p) => { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.length); };

const CH = ['typ', 'act', 'wal', 'liq', 'lty', 'half', 'slope', 'inact'];
function loadSide(dir) {
  const out = {};
  for (const c of CH) {
    out[c] = (c === 'typ' || c === 'wal') ? le16(`${dir}/097x.typ`.replace('097x', c)) : u8b(`${dir}/${c}`);
  }
  return out;
}
// vanilla：G2 目录直接按槽名；JS：js096/js097 目录
function loadG2(idx, nm) {
  const pre = `${G2}/${String(idx).padStart(3, '0')}_${nm}`;
  const o = {};
  o.typ = le16(`${pre}.typ`); o.act = u8b(`${pre}.act`); o.wal = le16(`${pre}.wal`);
  o.liq = u8b(`${pre}.liq`); o.lty = u8b(`${pre}.lty`); o.half = u8b(`${pre}.half`);
  o.slope = u8b(`${pre}.slope`); o.inact = u8b(`${pre}.inact`);
  o.frx = le16(`${pre}.frx`); o.fry = le16(`${pre}.fry`);
  return o;
}
function loadJS(dir) {
  const o = {};
  o.typ = le16(`${dir}/typ`); o.act = u8b(`${dir}/act`); o.wal = le16(`${dir}/wal`);
  o.liq = u8b(`${dir}/liq`); o.lty = u8b(`${dir}/lty`); o.half = u8b(`${dir}/half`);
  o.slope = u8b(`${dir}/slope`); o.inact = u8b(`${dir}/inact`);
  o.frx = le16(`${dir}/frx`); o.fry = le16(`${dir}/fry`);
  return o;
}

const v96 = loadG2(96, 'Larva'), v97 = loadG2(97, 'Micro_Biomes');
const j96 = loadJS(`${OUT}/js096`), j97 = loadJS(`${OUT}/js097`);

const cellEq = (a, b, i) => a.typ[i] === b.typ[i] && a.act[i] === b.act[i] && a.wal[i] === b.wal[i] &&
  a.liq[i] === b.liq[i] && a.lty[i] === b.lty[i] && a.half[i] === b.half[i] &&
  a.slope[i] === b.slope[i] && a.inact[i] === b.inact[i];

const lines = [];
const P = (s) => { lines.push(s); };
P(`=== GFB #97 写面对账 seed=9293480 4200x1200 七旗 ===`);

const vFace = [], jFace = [], both = [];
for (let i = 0; i < N; i++) {
  const vW = !cellEq(v96, v97, i), jW = !cellEq(j96, j97, i);
  if (vW && jW) both.push(i);
  else if (vW) vFace.push(i);
  else if (jW) jFace.push(i);
}
P(`vanilla 写面=${vFace.length}  JS 写面=${jFace.length}  双侧同写=${both.length}`);
P(`V-only=${vFace.length - 0}(未含 both)  J-only=${jFace.length}`);

// 终态交叉对账（JS 097 vs vanilla 097 差异格，应=mile8 A+T+W+L+Hf+Sl+Lt+Ia 合计≈12k）
let cross = 0, firstCross = -1;
for (let i = 0; i < N; i++) { if (!cellEq(v97, j97, i)) { cross++; if (firstCross < 0) firstCross = i; } }
P(`JS097 vs v097 终态差=${cross} first=(${firstCross % W},${(firstCross / W) | 0})`);

// ——家族分桶：以「写后类型」为键（空=carve/delete）——
const famName = (t) => t === 0 ? 'air' : String(t);
function famBucket(faceCells, after, before, label) {
  const m = new Map();
  for (const i of faceCells) {
    // 家族键=before→after 活性类型（act 变化但 typ 同也算）
    const k = `${famName(before.act[i] ? before.typ[i] : 0)}>${famName(after.act[i] ? after.typ[i] : 0)}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(i);
  }
  const arr = [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  P(`\n## ${label} 写面家族 top20（${faceCells.length} 格）`);
  for (const [k, cells] of arr.slice(0, 20)) {
    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (const i of cells) { const x = i % W, y = (i / W) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    P(`  ${k} x${cells.length}  bbox=(${minX},${minY})..(${maxX},${maxY})  samples=${cells.slice(0, 6).map((i) => `(${i % W},${(i / W) | 0})`).join(' ')}`);
  }
  return m;
}
const vf = famBucket(vFace, v97, v96, 'vanilla(V-only)');
const jf = famBucket(jFace, j97, j96, 'JS(J-only)');
const bf = famBucket(both, v97, v96, 'both(双写,值取 vanilla 侧 before→after)');

// ——逐格明细（双侧 before→after 10 通道）——
const chs = [...CH, 'frx', 'fry'];
const det = (i) => {
  const x = i % W, y = (i / W) | 0;
  const f = (s) => chs.map((c) => `${c[0]}${s[c][i]}`).join(' ');
  return `  (${x},${y})\n    V96 ${f(v96)}\n    V97 ${f(v97)}\n    J96 ${f(j96)}\n    J97 ${f(j97)}`;
};
P(`\n## 明细样例（V-only 前 8）`);
for (const i of vFace.slice(0, 8)) P(det(i));
P(`\n## 明细样例（J-only 前 8）`);
for (const i of jFace.slice(0, 8)) P(det(i));
P(`\n## 明细样例（both 前 8）`);
for (const i of both.slice(0, 8)) P(det(i));

// ——终态差分格的家族桶（对照 mile8 pairs）——
const cm = new Map();
for (let i = 0; i < N; i++) {
  const vt = v97.act[i] ? v97.typ[i] : 0, jt = j97.act[i] ? j97.typ[i] : 0;
  if (vt !== jt) { const k = `T${vt}>${jt}`; cm.set(k, (cm.get(k) ?? 0) + 1); }
  if (v97.act[i] !== j97.act[i]) { const k = `A${v97.act[i]}>${j97.act[i]}`; cm.set(k, (cm.get(k) ?? 0) + 1); }
}
P(`\n## 终态差家族 top14`);
for (const [k, n] of [...cm.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) P(`  ${k} x${n}`);

// 命令行 family 过滤：node _iii220face.mjs dump 314 —— 打印该家族全部格明细
const arg = process.argv[2], argV = process.argv[3];
if (arg === 'dump') {
  const key = `>${famName(Number(argV))}`;
  const pool = [];
  for (const [k, cells] of [...vf.entries(), ...jf.entries(), ...bf.entries()]) {
    if (k.endsWith(key) || k === key) pool.push([k, cells]);
  }
  P(`\n## dump ${argV}（${key}）家族全明细`);
  for (const [k, cells] of pool) {
    P(`# ${k} x${cells.length}`);
    for (const i of cells.slice(0, 400)) P(det(i));
  }
}
writeFileSync(`${OUT}/face-report.txt`, lines.join('\n') + '\n');
console.log(lines.slice(0, 80).join('\n'));
console.log(`\n(full report → ${OUT}/face-report.txt)`);
