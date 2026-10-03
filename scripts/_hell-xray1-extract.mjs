// 地狱直通车 trace 提取缓存:主线程 X 事件 + ProfileChunk(全部 id)+ 合成器帧
// 一次性 parse 249MB,产出紧凑缓存 /tmp/hell-xray-cache.json
import fs from 'node:fs';
import zlib from 'node:zlib';
const path = '/Users/vinlic/Downloads/Trace-20261003T164745.json';
console.time('parse');
const t = JSON.parse(fs.readFileSync(path, 'utf8'));
console.timeEnd('parse');
const evs = t.traceEvents || [];
const MAIN = '97833:25363119';
const MAIN_PID = 97833, MAIN_TID = 25363119;

// name 字典化
const dict = []; const dictId = new Map();
const nid = (s) => { let v = dictId.get(s); if (v === undefined) { v = dict.length; dict.push(s); dictId.set(s, v); } return v; };

const mainX = []; // [nameId, ts, dur]
const drawFrames = []; // 合成器 DrawFrame/present
const chunks = []; // ProfileChunk
const tidNames = new Map();
const meta = { span0: Infinity, span1: 0 };

for (const e of evs) {
  if (e.ts) { if (e.ts < meta.span0) meta.span0 = e.ts; if (e.ts > meta.span1) meta.span1 = e.ts; }
  if (e.ph === 'M' && e.name === 'thread_name') tidNames.set(e.pid + ':' + e.tid, e.args?.name || '');
  const isMain = e.pid === MAIN_PID && e.tid === MAIN_TID;
  if (isMain && e.ph === 'X') {
    mainX.push([nid(e.name), e.ts, Math.round(e.dur || 0)]);
    continue;
  }
  if (e.pid === MAIN_PID && e.name === 'ProfileChunk') {
    const d = e.args?.data;
    if (!d) continue;
    const cp = d.cpuProfile || {};
    chunks.push({
      id: e.id, tid: e.tid, ts: e.ts,
      nodes: (cp.nodes || []).map(n => ({
        id: n.id,
        f: nid((n.callFrame?.functionName || '(anon)') + '@' + String(n.callFrame?.url || '').split('/').pop() + ':' + (n.callFrame?.lineNumber ?? '?') + (n.callFrame?.url ? '' : '|native')),
        parent: n.parent ? (typeof n.parent === 'object' ? n.parent.id : n.parent) : undefined,
      })),
      s: cp.samples || [], td: d.timeDeltas || [],
    });
    continue;
  }
  // 合成器帧(任意线程的 DrawFrame / SubmitCompositorFrameToPresentationCompositorFrame)
  if (e.ph === 'X' && (e.name === 'DrawFrame')) {
    drawFrames.push([e.pid, e.tid, e.ts, Math.round(e.dur || 0)]);
  }
}
fs.writeFileSync('/tmp/hell-xray-cache.json', JSON.stringify({
  dict, mainX, drawFrames, chunks, tidNames: [...tidNames.entries()], meta,
}));
console.log('mainX:', mainX.length, 'chunks:', chunks.length, 'drawFrames:', drawFrames.length);
console.log('dict size:', dict.length);
console.log('span:', ((meta.span1 - meta.span0) / 1e6).toFixed(1) + 's');
// chunk id/tid 分布
const cd = new Map();
for (const c of chunks) { const k = c.id + '/tid' + c.tid; cd.set(k, (cd.get(k) || 0) + 1); }
console.log('chunk id/tid:', [...cd.entries()]);
const gz = zlib.gzipSync(fs.readFileSync('/tmp/hell-xray-cache.json'));
fs.writeFileSync('/tmp/hell-xray-cache.json.gz', gz);
console.log('cache size:', (fs.statSync('/tmp/hell-xray-cache.json').size / 1e6).toFixed(1), 'MB gz:', (gz.length / 1e6).toFixed(1), 'MB');
