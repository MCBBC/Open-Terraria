// 分析 natural 探针 cap.json:雨条色线命中计数 vs lightning 值,找消失帧并导图
import fs from 'node:fs';
const cap = JSON.parse(fs.readFileSync('/tmp/rainlv3/cap.json', 'utf8'));
console.log('frames:', cap.length);
// 雨条色线:Rain.png strip0 avg rgb(116,146,219) × t/255,t∈[0,217]
// 检测:投影 t = dot(p, u),u=归一(116,146,219);正交距 < 42 且 t ∈ [60,217]
const u = (() => { const l = Math.hypot(116, 146, 219); return [116 / l, 146 / l, 219 / l]; })();
const TMAX = 217;
const rows = [];
for (let i = 0; i < cap.length; i++) {
  const f = cap[i];
  if (!f.px) { rows.push({ i, err: 'nopx' }); continue; }
  let rainN = 0, sum = 0, sumR = 0, sumG = 0, sumB = 0, n = f.px.length / 4;
  for (let p = 0; p < n; p++) {
    const r = f.px[p * 4], g = f.px[p * 4 + 1], b = f.px[p * 4 + 2];
    sumR += r; sumG += g; sumB += b;
    const dot = r * u[0] + g * u[1] + b * u[2];
    const d2 = r * r + g * g + b * b - dot * dot;
    if (d2 < 42 * 42 && dot > 60 && dot < TMAX + 12) rainN++;
  }
  rows.push({ i, lightning: f.lightning, boltDraws: f.boltDraws, drops: f.drops, built: f.built,
    emitQ: f.emitQ, emitRet: f.emitRet, bq: f.bq, paused: f.paused,
    rainN, mean: [Math.round(sumR / n), Math.round(sumG / n), Math.round(sumB / n)] });
}
// 摘要:lightning 高(>0.5)帧 vs 低(<0.1)帧的 rainN 分布
const hi = rows.filter((r) => r.lightning > 0.5);
const lo = rows.filter((r) => r.lightning < 0.1 && r.rainN !== undefined);
const stat = (a) => a.length ? `n=${a.length} min=${Math.min(...a)} med=${a.slice().sort((x, y) => x - y)[a.length >> 1]} max=${Math.max(...a)}` : 'n=0';
console.log('lightning>0.5 rainN:', stat(hi.map((r) => r.rainN)));
console.log('lightning<0.1 rainN:', stat(lo.map((r) => r.rainN)));
// 打印 lightning 走势(每帧压一行,10 帧一行)
let line = '';
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  line += r.rainN === undefined ? '?' : (r.lightning > 0.5 ? 'F' : r.lightning > 0.05 ? 'r' : '.');
  if (line.length >= 80) { console.log(line); line = ''; }
}
if (line) console.log(line);
// 雷帧明细(前 12 个 bolt 帧或 flash 帧)
console.log('\n-- flash/bolt 帧 --');
let shown = 0;
for (const r of rows) {
  if (r.lightning === undefined) continue;
  if (r.lightning > 0.3 || r.boltDraws > 0) {
    console.log(`#${r.i} L=${r.lightning} bolts=${r.boltDraws} drops=${r.drops} built=${r.built} emit=${r.emitQ}/${r.emitRet} rainN=${r.rainN} mean=${r.mean}`);
    if (++shown >= 40) break;
  }
}
// 消失候选:lightning>0.5 且 rainN 低于 hi 组中位 1/3
const med = hi.length ? hi.map((r) => r.rainN).sort((a, b) => a - b)[hi.length >> 1] : 0;
const vanish = hi.filter((r) => r.rainN < med / 3);
console.log(`\n消失候选(med=${med}):`, vanish.map((r) => `#${r.i}(L=${r.lightning},rainN=${r.rainN},built=${r.built},emit=${r.emitQ},bolts=${r.boltDraws})`).join(' ') || '无');
// 导出:首个 flash 前后各 2 帧
if (hi.length) {
  const k = hi[Math.floor(hi.length / 2)].i;
  const png = new PNG({ width: cap[k].w, height: cap[k].h });
  for (let j = Math.max(0, k - 2); j <= Math.min(cap.length - 1, k + 2); j++) {
    const f = cap[j];
    if (!f.px) continue;
    png.data.set(f.px);
    fs.writeFileSync(`/tmp/rainlv3/frame-${j}.png`, PNG.sync.write(png));
  }
  console.log('exported frames', Math.max(0, k - 2), '..', Math.min(cap.length - 1, k + 2));
}
