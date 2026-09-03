// IIII220 批取证仪③：#97 轨道 314 车道聚类对账（vanilla 097 vs JS 097）。
// 连通分量（8 邻）聚类全部 314 格 → 每车道 bbox/格数/起点/斜率指纹 → 双侧车道配对。
import { readFileSync, writeFileSync } from 'node:fs';
const OUT = process.env.SW_I220_OUT ?? '/tmp/iii220-out';
const G2 = process.env.SW_I220_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const W = 4200, H = 1200, N = W * H;
const le16 = (p) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const u8b = (p) => { const b = readFileSync(p); return new Uint8Array(b.buffer, b.byteOffset, b.length); };

const vT = le16(`${G2}/097_Micro_Biomes.typ`), vA = u8b(`${G2}/097_Micro_Biomes.act`);
const jT = le16(`${OUT}/js097/typ`), jA = u8b(`${OUT}/js097/act`);
const vT96 = le16(`${G2}/096_Larva.typ`), vA96 = u8b(`${G2}/096_Larva.act`);
const jT96 = le16(`${OUT}/js096/typ`), jA96 = u8b(`${OUT}/js096/act`);

// 096 已存在的 314（早前 pass 置的轨）不属本 pass 写面 → 排除
const isTrack = (T, A, T96, A96, i) => A[i] === 1 && T[i] === 314 && !(A96[i] === 1 && T96[i] === 314);

function clusters(T, A, T96, A96) {
  const seen = new Uint8Array(N);
  const out = [];
  for (let i = 0; i < N; i++) {
    if (!isTrack(T, A, T96, A96, i) || seen[i]) continue;
    const comp = [];
    const st = [i]; seen[i] = 1;
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
const summarize = (comps, label) => {
  const rows = comps.map((c) => {
    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (const i of c) { const x = i % W, y = (i / W) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    return { n: c.length, minX, maxX, minY, maxY, head: c[0], headXY: `(${c[0] % W},${(c[0] / W) | 0})` };
  }).sort((a, b) => a.head - b.head);
  console.log(`${label} 车道数=${rows.length} 总格=${rows.reduce((s, r) => s + r.n, 0)}`);
  for (const r of rows) console.log(`  ${label} n=${String(r.n).padStart(4)} bbox=(${r.minX},${r.minY})..(${r.maxX},${r.maxY}) head=${r.headXY}`);
  return rows;
};
const vc = clusters(vT, vA, vT96, vA96), jc = clusters(jT, jA, jT96, jA96);
const vr = summarize(vc, 'V97'), jr = summarize(jc, 'J97');
// 配对：起点 ≤6 格距离 视为同车道
const pairs = [], vUsed = new Set(), jUsed = new Set();
for (let a = 0; a < vr.length; a++) {
  let best = -1, bd = 1e9;
  for (let b = 0; b < jr.length; b++) {
    if (jUsed.has(b)) continue;
    const d = Math.hypot((vr[a].head % W) - (jr[b].head % W), ((vr[a].head / W) | 0) - ((jr[b].head / W) | 0));
    if (d < bd) { bd = d; best = b; }
  }
  if (best >= 0 && bd <= 6) { pairs.push([a, best, bd]); vUsed.add(a); jUsed.add(best); }
}
console.log(`\n配对成功=${pairs.length}  V 孤儿=${vr.length - vUsed.size}  J 孤儿=${jr.length - jUsed.size}`);
for (const [a, b, d] of pairs) console.log(`  PAIR V#${a}(${vr[a].headXY},n=${vr[a].n}) ↔ J#${b}(${jr[b].headXY},n=${jr[b].n}) headΔ=${d.toFixed(0)} 格数Δ=${jr[b].n - vr[a].n}`);
const lines = [`V lanes=${vr.length} J lanes=${jr.length} pairs=${pairs.length}`];
for (const r of vr) lines.push(`V n=${r.n} bbox=(${r.minX},${r.minY})..(${r.maxX},${r.maxY}) head=${r.headXY}`);
for (const r of jr) lines.push(`J n=${r.n} bbox=(${r.minX},${r.minY})..(${r.maxX},${r.maxY}) head=${r.headXY}`);
writeFileSync(`${OUT}/lanes.txt`, lines.join('\n') + '\n');
