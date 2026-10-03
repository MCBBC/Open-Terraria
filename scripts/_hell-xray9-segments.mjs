// 三段式慢帧归因(雪带/腐化带/石带地狱)+t0 敏感性
import fs from 'node:fs';
const c = JSON.parse(fs.readFileSync('/tmp/hell-xray-cache.json', 'utf8'));
const { mainX, dict, chunks } = c;
const nameId = new Map(); dict.forEach((n, i) => nameId.set(n, i));
const RAF = nameId.get('FireAnimationFrame');
const rafs = mainX.filter(e => e[0] === RAF).map(e => e[1]).sort((a, b) => a - b);
const frameStarts = [rafs[0]];
for (let i = 1; i < rafs.length; i++) if (rafs[i] - rafs[i - 1] > 2500) frameStarts.push(rafs[i]);
const t0 = frameStarts[0];
// 帧距×秒
const perSec = new Map();
for (let i = 1; i < frameStarts.length; i++) {
  const g = frameStarts[i] - frameStarts[i - 1];
  const sec = Math.floor((frameStarts[i - 1] - t0) / 1e6);
  let a = perSec.get(sec); if (!a) perSec.set(sec, a = { n: 0, slow: 0, sum: 0 });
  a.n++; a.sum += g; if (g > 12500) a.slow++;
}
// 段定义(秒):基于 t0↔tick 50145 对齐,vy=600px/s
// 雪带 378-620 → sec 0-5.8;腐化带 620-1150 → 5.8-20.4;石带 1150-1605 → 20.4-32.8;地狱 32.8-34.3;落地后 34.3+
const SEG = [['雪带(378-620)', 0, 5.8], ['腐化带(620-1150)', 5.8, 20.4], ['石带(1150-1605)', 20.4, 32.8], ['地狱(1605-1664)', 32.8, 34.3], ['落地静止', 34.3, 39.6]];
console.log('== 段×慢帧密度(基准对齐 t0↔tick50145) ==');
for (const [nm, a, b] of SEG) {
  let n = 0, slow = 0, sum = 0;
  for (const [sec, v] of perSec) if (sec >= a && sec < b) { n += v.n; slow += v.slow; sum += v.sum; }
  console.log(nm, '帧数', n, '慢帧', slow, '密度', (slow / (b - a)).toFixed(1) + '/s', '均帧距', n ? (sum / n / 1000).toFixed(2) + 'ms' : '-', '均fps', n ? (n / (b - a)).toFixed(0) : '-');
}
// t0 敏感性:平移 δ∈[-3,3]s 重新分段统计慢帧密度(帧时间戳平移=段边界不动改帧归属)
console.log('\n== t0 平移敏感性(δ=行为日志起点相对 trace t0 的偏移,雪带/腐化带慢帧密度) ==');
for (const d of [-3, -1.5, 0, 1.5, 3]) {
  const rows = SEG.map(([nm, a, b]) => {
    let n = 0, slow = 0;
    for (let i = 1; i < frameStarts.length; i++) {
      const sec = (frameStarts[i - 1] - t0) / 1e6 + d;
      const g = frameStarts[i] - frameStarts[i - 1];
      if (sec >= a && sec < b) { n++; if (g > 12500) slow++; }
    }
    return nm.slice(0, 3) + ':' + (slow / (b - a)).toFixed(1);
  });
  console.log('δ=' + d + '  ' + rows.join('  '));
}
// 三段慢帧窗函数归因
const main = chunks.filter(ch => ch.id === '0x7');
const nodes = new Map(); const parentOf = new Map();
for (const ch of main) for (const n of ch.nodes) {
  if (!nodes.has(n.id)) { nodes.set(n.id, n.f); if (n.parent != null) parentOf.set(n.id, n.parent); }
}
const short = (f) => { const s = dict[f] || '?'; const m = s.match(/^([$\w]+)@index-[\w.-]+:(\d+)/); return m ? m[1] + '@' + m[2] : s.slice(0, 44); };
const CAP = 25000;
const frames = [];
for (let i = 1; i < frameStarts.length; i++) frames.push({ t0: frameStarts[i - 1], t1: frameStarts[i], gap: frameStarts[i] - frameStarts[i - 1] });
const slowList = frames.filter(f => f.gap > 12500);
const SEG2 = [['雪带', 0, 5.8], ['腐化带', 5.8, 20.4], ['石带+地狱', 20.4, 39.6]];
const agg = SEG2.map(() => new Map());
const aggTot = [0, 0, 0];
for (const ch of main) {
  const ss = ch.s, tds = ch.td;
  const suf = new Array(ss.length + 1).fill(0);
  for (let i = ss.length - 1; i >= 0; i--) suf[i] = suf[i + 1] + (tds[i] ?? 0);
  for (let i = 0; i < ss.length; i++) {
    const d = tds[i] ?? 0; if (d <= 0) continue;
    const ts = ch.ts - suf[i + 1];
    // 慢帧窗归属
    let inSlow = false, fsec = -1;
    for (const f of slowList) {
      if (ts >= f.t0 && ts < f.t1) { inSlow = true; fsec = (f.t0 - t0) / 1e6; break; }
    }
    if (!inSlow) continue;
    const fs2 = short(nodes.get(ss[i]));
    const dC = Math.min(d, CAP);
    for (let p = 0; p < 3; p++) {
      if (fsec >= SEG2[p][1] && fsec < SEG2[p][2]) { agg[p].set(fs2, (agg[p].get(fs2) || 0) + dC); aggTot[p] += dC; break; }
    }
  }
}
for (let p = 0; p < 3; p++) {
  console.log('\n== 慢帧窗归因 [' + SEG2[p][0] + '] 采样 ' + (aggTot[p] / 1000).toFixed(0) + 'ms ==');
  for (const [k, v] of [...agg[p].entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)) console.log('  ' + (v / 1000).toFixed(0).padStart(5) + 'ms', (100 * v / aggTot[p]).toFixed(1) + '%', k);
}
