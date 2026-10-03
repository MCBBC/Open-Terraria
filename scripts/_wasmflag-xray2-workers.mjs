// wasmflag xray2: worker 身份鉴定 + busy 画像 + WASM 接管验证(LightWorker blur 面)
// run: node scripts/_wasmflag-xray2-workers.mjs
import fs from 'node:fs';
const x = JSON.parse(fs.readFileSync('/tmp/wasmflag-xray/extract.json', 'utf8'));

const nodesOf = {}, parentsOf = {};
for (const [id, p] of Object.entries(x.profs)) {
  nodesOf[id] = new Map(p.nodes.map(([nid, arr]) => [nid, { fn: arr[0], url: arr[1], line: arr[2] }]));
  parentsOf[id] = new Map(p.parents.map(([nid, par]) => [nid, par]));
}
const cf = (id, nid) => {
  const c = nodesOf[id].get(nid) || {};
  return (c.fn || '?') + '@' + (c.url || '?').split('/').slice(-2).join('/') + ':' + (c.line ?? '?');
};

for (const [id, p] of Object.entries(x.profs)) {
  const tid = p.tid;
  const workerEvents = x.censusWorker[tid];
  const isWorker = !!workerEvents;
  // 0x1 是另一 renderer 主线程(10862),跳过详细画像
  if (tid === 21941320) { console.log(`\n##### prof ${id} tid=${tid}: pid10862 另一 renderer 主线程, span=${((p.TS[p.TS.length-1]-p.TS[0])/1e6).toFixed(1)}s (后文单独看)`); continue; }
  console.log(`\n##### prof ${id} tid=${tid} ${isWorker ? '(DedicatedWorker)' : ''} samples=${p.S.length} span=${((p.TS[p.TS.length-1]-p.TS[0])/1e6).toFixed(1)}s`);

  // busy 总量 + idle 分离
  let busy = 0, idle = 0;
  const selfFn = new Map();      // fn → us
  const roots = new Map();       // 栈根 fn → us
  for (let i = 0; i < p.S.length; i++) {
    const d = p.D[i] || 0;
    if (d <= 0) continue;
    const nid = p.S[i];
    const c = nodesOf[id].get(nid);
    if (!c) continue;
    if (c.fn === '(idle)' || (c.fn === '(program)' && d > 100000)) { idle += d; continue; }
    if (c.fn === '(program)' || c.fn === '(garbage collector)' || c.fn === '(idle)') { /* native */ }
    busy += d;
    selfFn.set(c.fn + '@' + (c.url || '').split('/').slice(-1)[0] + ':' + c.line, (selfFn.get(c.fn + '@' + (c.url || '').split('/').slice(-1)[0] + ':' + c.line) || 0) + d);
    let cur = nid, g = 0;
    while (parentsOf[id].get(cur) != null && g++ < 50) cur = parentsOf[id].get(cur);
    const rf = cf(id, cur);
    roots.set(rf, (roots.get(rf) || 0) + d);
  }
  console.log(`busy=${(busy / 1000).toFixed(0)}ms idle≈${(idle / 1000).toFixed(0)}ms  busy率=${(100 * busy / (p.TS[p.TS.length - 1] - p.TS[0])).toFixed(1)}%`);
  console.log(' -- 栈根 top5 --');
  for (const [k, v] of [...roots.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5))
    console.log(`   ${(v / 1000).toFixed(0).padStart(7)}ms  ${k.slice(0, 120)}`);
  console.log(' -- 自耗时 top14 --');
  for (const [k, v] of [...selfFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14))
    console.log(`   ${(v / 1000).toFixed(0).padStart(7)}ms  ${k.slice(0, 120)}`);
  console.log(' -- WASM 帧面 --');
  if (p.wasmUs > 0) {
    console.log(`   wasm 帧自耗时合计=${(p.wasmUs / 1000).toFixed(1)}ms (${(100 * p.wasmUs / busy).toFixed(1)}% of busy)`);
    for (const [k, v] of p.wasmFn.sort((a, b) => b[1] - a[1]).slice(0, 8))
      console.log(`     ${(v / 1000).toFixed(1).padStart(8)}ms  ${k}`);
  } else console.log('   (无 wasm 帧)');

  // LightWorker 特写: blur 面三账(JS blurLine/blurPass vs wasm lightWasmBlur vs 其他)
  const blurKeys = [...selfFn.entries()].filter(([k]) => /blur|light/i.test(k));
  if (blurKeys.length) {
    console.log(' -- blur/light 相关函数 --');
    for (const [k, v] of blurKeys.sort((a, b) => b[1] - a[1]).slice(0, 12))
      console.log(`   ${(v / 1000).toFixed(1).padStart(8)}ms  ${k.slice(0, 120)}`);
  }
}
