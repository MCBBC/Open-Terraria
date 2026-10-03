// 地狱直通车 trace 侦察:结构/主线程识别/ProfileChunk 存在性
import fs from 'node:fs';
const path = '/Users/vinlic/Downloads/Trace-20261003T164745.json';
const t = JSON.parse(fs.readFileSync(path, 'utf8'));
const evs = t.traceEvents || [];
console.log('events:', evs.length);
// pid/tid 线程名
const tidName = new Map();
for (const e of evs) {
  if (e.ph === 'M' && e.name === 'thread_name') tidName.set(e.pid + ':' + e.tid, e.args?.name || '');
}
const procName = new Map();
for (const e of evs) {
  if (e.ph === 'M' && e.name === 'process_name') procName.set(e.pid, e.args?.name || '');
}
// 主线程:找 CrRendererMain;若多个 renderer,按事件量与 RunTask/RAF 数排序
const cand = new Map();
for (const e of evs) {
  if (e.ph !== 'X') continue;
  const k = e.pid + ':' + e.tid;
  const a = cand.get(k) || (cand.set(k, { n: 0, dur: 0, raf: 0, fc: 0 }), cand.get(k));
  a.n++; a.dur += e.dur || 0;
  if (/FireAnimationFrame/.test(e.name)) a.raf++;
  if (e.name === 'FunctionCall') a.fc++;
}
const rows = [];
for (const [k, a] of cand) {
  const nm = tidName.get(k) || '';
  if (!/CrRendererMain/.test(nm)) continue;
  rows.push({ k, nm, proc: procName.get(k.split(':')[0]) || '', ...a });
}
rows.sort((a, b) => b.raf - a.raf);
for (const r of rows.slice(0, 8)) console.log('rendererMain', r.k, r.proc, 'X:', r.n, 'raf:', r.raf, 'fc:', r.fc, 'dur:', (r.dur / 1e6).toFixed(1) + 's');
// ProfileChunk 普查
const chunkIds = new Map();
for (const e of evs) {
  if (e.name === 'ProfileChunk') {
    const k = e.pid + '|' + (e.id || '');
    chunkIds.set(k, (chunkIds.get(k) || 0) + 1);
  }
}
console.log('ProfileChunk pid|id:', [...chunkIds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
// trace 时间跨度
let t0 = Infinity, t1 = 0;
for (const e of evs) { if (!e.ts) continue; if (e.ts < t0) t0 = e.ts; if (e.ts > t1) t1 = e.ts; }
console.log('trace span:', ((t1 - t0) / 1e6).toFixed(1) + 's');
// 事件名 census top30
const names = new Map();
for (const e of evs) names.set(e.name, (names.get(e.name) || 0) + 1);
console.log('== event name top30 ==');
for (const [n, c] of [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(String(c).padStart(8), n);
// 关键搜索:雪签名相关事件名
for (const [n, c] of names) {
  if (/tint|precip|weather|biome|bake|chunk|light|minimap|draw/i.test(n)) console.log('  sig:', n, c);
}
