// EoL trace 结构探针:事件普查/线程表/ProfileChunk 存在性/时间跨度
// run: node --max-old-space-size=8192 scripts/_eol-xray0.mjs
import fs from 'node:fs';
const PATH = process.argv[2] || '/Users/vinlic/Downloads/Trace-20261003T161320.json';
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];
console.log('total events:', evs.length);

// 线程表
const tidName = new Map();
for (const e of evs) if (e.ph === 'M' && e.name === 'thread_name') tidName.set(e.pid + ':' + e.tid, e.args?.name || '');
const procName = new Map();
for (const e of evs) if (e.ph === 'M' && e.name === 'process_name') procName.set(e.pid, e.args?.name || '');
const byTid = new Map();
for (const e of evs) {
  if (e.ph !== 'X') continue;
  const k = e.pid + ':' + e.tid;
  let a = byTid.get(k); if (!a) byTid.set(k, a = { n: 0, dur: 0 });
  a.n++; a.dur += e.dur || 0;
}
console.log('== 线程表(X 事件数 top 15) ==');
for (const [k, a] of [...byTid.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 15))
  console.log(String(a.n).padStart(7), (a.dur / 1000).toFixed(0).padStart(7) + 'ms', k, '<' + (tidName.get(k) || '?') + '> proc<' + (procName.get(k.split(':')[0]) || '?') + '>');

// 事件名普查(全部线程)
const nameAgg = new Map();
for (const e of evs) {
  let a = nameAgg.get(e.name);
  if (!a) { a = { n: 0, dur: 0, ph: e.ph, cat: e.cat || '' }; nameAgg.set(e.name, a); }
  a.n++; a.dur += e.dur || 0;
}
console.log('== 事件名 top 40(按总 dur) ==');
for (const [n, a] of [...nameAgg.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 40))
  console.log((a.dur / 1000).toFixed(0).padStart(7) + 'ms n=' + String(a.n).padStart(7), 'ph=' + a.ph, a.cat.slice(0, 40).padEnd(40), n.slice(0, 60));

// 关键存在性
for (const key of ['Profile', 'ProfileChunk', 'FrameBeat', 'DroppedFrame', 'RequestAnimationFrame', 'FireAnimationFrame', 'DrawFrame', 'Commit', 'RasterTask', 'GPUTask', 'JobTask']) {
  const hits = [...nameAgg.entries()].filter(([n]) => n === key);
  console.log('KEY', key, hits.length ? hits.map(([n, a]) => `n=${a.n} dur=${(a.dur / 1000).toFixed(0)}ms`).join(' ') : 'ABSENT');
}

// ProfileChunk 明细
const chunks = evs.filter(e => e.name === 'ProfileChunk');
const byId = new Map();
for (const c of chunks) {
  const k = c.pid + ' ' + (c.id || c.args?.id || '?');
  let a = byId.get(k);
  if (!a) { a = { n: 0, samples: 0 }; byId.set(k, a); }
  a.n++; a.samples += c.args?.data?.cpuProfile?.samples?.length || 0;
}
for (const [k, a] of byId) console.log('ProfileChunk', k, 'chunks=' + a.n, 'samples=' + a.samples);

// 时间跨度
let tmin = Infinity, tmax = 0;
for (const e of evs) if (typeof e.ts === 'number' && e.ts > 0) { if (e.ts < tmin) tmin = e.ts; if (e.ts > tmax) tmax = e.ts; }
console.log('span:', ((tmax - tmin) / 1e6).toFixed(2) + 's', ' t0=' + tmin);
