// IIII220 批取证仪④：成对车道逐格对账 + y(x) 剖面 + 清空带差。
import { readFileSync } from 'node:fs';
const OUT = process.env.SW_I220_OUT ?? '/tmp/iii220-out';
const G2 = process.env.SW_I220_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = 4200, H = 1200, N = W * H;
const le16 = (p) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const u8b = (p) => { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.length); };
const vT = le16(`${G2}/097_Micro_Biomes.typ`), vA = u8b(`${G2}/097_Micro_Biomes.act`);
const jT = le16(`${OUT}/js097/typ`), jA = u8b(`${OUT}/js097/act`);
const vT96 = le16(`${G2}/096_Larva.typ`), vA96 = u8b(`${G2}/096_Larva.act`);
const jT96 = le16(`${OUT}/js096/typ`), jA96 = u8b(`${OUT}/js096/act`);
const isTrack = (T, A, T96, A96, i) => A[i] === 1 && T[i] === 314 && !(A96[i] === 1 && T96[i] === 314);

function clusters(T, A, T96, A96) {
  const seen = new Uint8Array(N); const out = [];
  for (let i = 0; i < N; i++) {
    if (!isTrack(T, A, T96, A96, i) || seen[i]) continue;
    const comp = []; const st = [i]; seen[i] = 1;
    while (st.length) {
      const k = st.pop(); comp.push(k);
      const x = k % W, y = (k / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (!seen[ni] && isTrack(T, A, T96, A96, ni)) { seen[ni] = 1; st.push(ni); }
      }
    }
    comp.sort((a, b) => a - b);
    out.push(comp);
  }
  return out;
}
const vc = clusters(vT, vA, vT96, vA96), jc = clusters(jT, jA, jT96, jA96);
// 配对（头距 ≤6）
const vp = vc.map((c) => ({ c, head: c[0] })).sort((a, b) => a.head - b.head);
const jp = jc.map((c) => ({ c, head: c[0] })).sort((a, b) => a.head - b.head);
for (const v of vp) {
  let best = null, bd = 1e9;
  for (const j of jp) {
    const d = Math.abs((v.head % W) - (j.head % W)) + Math.abs(((v.head / W) | 0) - ((j.head / W) | 0));
    if (d < bd) { bd = d; best = j; }
  }
  const vset = new Set(v.c), jset = best ? new Set(best.c) : new Set();
  let same = 0, vOnly = [], jOnly = [];
  for (const i of v.c) { if (jset.has(i)) same++; else vOnly.push(i); }
  for (const i of (best ? best.c : [])) if (!vset.has(i)) jOnly.push(i);
  const fmt = (arr) => arr.slice(0, 10).map((i) => `(${i % W},${(i / W) | 0})`).join(' ');
  console.log(`V#${v.head % W},${(v.head / W) | 0} n=${v.c.length} ↔ J${best ? `#${best.head % W},${(best.head / W) | 0}` : '(none)'} n=${best ? best.c.length : '-'} headΔ=${bd} same=${same} vOnly=${vOnly.length} jOnly=${jOnly.length}`);
  if (vOnly.length) console.log(`   vOnly: ${fmt(vOnly)}`);
  if (jOnly.length) console.log(`   jOnly: ${fmt(jOnly)}`);
  // y(x) 剖面前 12 x 与后 6 x
  const prof = (set) => {
    const m = new Map();
    for (const i of set) { const x = i % W, y = (i / W) | 0; if (!m.has(x)) m.set(x, []); m.get(x).push(y); }
    return m;
  };
  const pm = prof(v.c), qm = prof(best ? best.c : []);
  const xs = [...new Set([...pm.keys(), ...qm.keys()])].sort((a, b) => a - b);
  const slice = xs.filter((x) => x >= 800 && x <= 830).length > 0 ? xs.filter((x) => x >= 800 && x <= 830) : xs.slice(0, 14);
  console.log(`   y(x): ${slice.map((x) => `${x}:v${(pm.get(x) ?? ['-']).join('/')}j${(qm.get(x) ?? ['-']).join('/')}`).join(' ')}`);
}
for (const j of jp) {
  const matched = vp.some((v) => Math.abs((v.head % W) - (j.head % W)) + Math.abs(((v.head / W) | 0) - ((j.head / W) | 0)) <= 6);
  if (!matched) console.log(`J-UNMATCHED #${j.head % W},${(j.head / W) | 0} n=${j.c.length}`);
}
