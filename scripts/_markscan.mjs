// 双存档稀有物件对比：解码 RLE → 全图扫出低频 tile 类型 → 打印每簇周边网格。
// 用法：BULB_MAP=x.json SW_MAP2=y.json node tools/run-diag.mjs scripts/_markscan.mjs
import { readFileSync } from 'node:fs';

const load = (PATH) => {
  const d = JSON.parse(readFileSync(PATH, 'utf8'));
  const W = d.header.width, H = d.header.height, N = W * H;
  const s = Buffer.from(d.tiles, 'base64').toString('binary');
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  const type = new Int32Array(N), fx = new Int32Array(N), fy = new Int32Array(N);
  let p = 0, i2 = 0;
  while (i2 < N && p < u8.length) {
    let run = 0, sh = 0;
    for (;;) { const b = u8[p++]; run |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
    let t = 0; sh = 0;
    for (;;) { const b = u8[p++]; t |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
    let fxx = 0, fyy = 0;
    if (t !== 0) {
      sh = 0;
      for (;;) { const b = u8[p++]; fxx |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
      sh = 0;
      for (;;) { const b = u8[p++]; fyy |= (b & 0x7f) << sh; if (!(b & 0x80)) break; sh += 7; }
    }
    const end = Math.min(i2 + run + 1, N);
    for (; i2 < end; i2++) { type[i2] = t; fx[i2] = fxx; fy[i2] = fyy; }
  }
  return { d, W, H, type, fx, fy };
};

const A = load(process.env.BULB_MAP);
const Bpath = process.env.SW_MAP2 ?? '';
const report = (tag, m) => {
  const counts = new Map();
  for (let k = 0; k < m.type.length; k++) { const t = m.type[k]; if (t) counts.set(t, (counts.get(t) ?? 0) + 1); }
  return counts;
};
const ca = report('A', A);
console.log(JSON.stringify({ A_header: { name: A.d.header.name, size: `${A.W}x${A.H}` },
  distinctTypesA: [...ca.entries()].sort((a, b) => a[1] - b[1]).slice(0, 40)
    .map(([t, n]) => [t, n]) }));
if (Bpath && Bpath.trim()) {
  const B = load(Bpath);
  const cb = report('B', B);
  // 对比差异集合：A 独有 / B 独有（按出现次数差）
  const keys = new Set([...ca.keys(), ...cb.keys()]);
  const diffs = [];
  for (const k of keys) {
    const na = ca.get(k) ?? 0, nb = cb.get(k) ?? 0;
    if ((na > 0) !== (nb > 0) || Math.abs(na - nb) >= 4) diffs.push([k, na, nb]);
  }
  console.log(JSON.stringify({
    B_header: { name: B.d.header.name, size: `${B.W}x${B.H}` },
    diffRows: diffs.sort((a, b) => (a[0] - b[0])),
  }, null, 2));
}
