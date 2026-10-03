// wasmflag xray6: A/B 基线 — 161320(早于 lightwasm?)的 LightWorker blur 面对照 + equipStats 调用方
// run: node --max-old-space-size=8192 scripts/_wasmflag-xray6-ab-baseline.mjs [baselineTrace]
import fs from 'node:fs';
const BASE = process.argv[2] || '/Users/vinlic/Downloads/Trace-20261003T161320.json';

if (process.argv[2] || true) {
  const t = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  const evs = t.traceEvents || [];
  // Profile pid:id→tid
  const profTid = new Map(); const profStart = new Map();
  for (const e of evs) if (e.name === 'Profile') { const k = e.pid + ':' + e.id; profTid.set(k, e.tid); profStart.set(k, e.args?.data?.startTime ?? e.ts); }
  const chunks = new Map(); const nodes = new Map(); const parents = new Map();
  for (const e of evs) {
    if (e.name !== 'ProfileChunk') continue;
    const d = e.args?.data; if (!d) continue;
    const k = e.pid + ':' + e.id;
    if (!chunks.has(k)) chunks.set(k, []);
    chunks.get(k).push({ ts: e.ts, s: d.cpuProfile?.samples || [], td: d.timeDeltas || [] });
    if (!nodes.has(k)) { nodes.set(k, new Map()); parents.set(k, new Map()); }
    const nn = nodes.get(k), pp = parents.get(k);
    for (const n of d.cpuProfile?.nodes || []) if (!nn.has(n.id)) {
      const cf = n.callFrame || {};
      nn.set(n.id, [cf.functionName || '(anon)', cf.url || '', cf.lineNumber ?? -1]);
      if (n.parent != null) pp.set(n.id, typeof n.parent === 'object' ? n.parent.id : n.parent);
    }
  }
  console.log('profiles:', [...profTid.entries()].map(([k, tid]) => k + '@' + tid).join(', '));
  for (const [k, tid] of profTid) {
    const nn = nodes.get(k); if (!nn) continue;
    // LightWorker 识别:节点 url 含 LightWorker
    let isLight = false, isWave = false;
    for (const [, a] of nn) { if (/LightWorker/.test(a[1])) isLight = true; if (/WaveWorker/.test(a[1])) isWave = true; }
    if (!isLight && !isWave) continue;
    const cs = (chunks.get(k) || []).sort((a, b) => a.ts - b.ts);
    let clk = profStart.get(k) ?? cs[0].ts;
    const agg = new Map(); let busy = 0, span = 0, onmsg = 0, wasmUs = 0;
    for (const c of cs) for (let i = 0; i < c.s.length; i++) {
      const d = c.td[i] ?? 0; clk += d; span = clk - (profStart.get(k) ?? cs[0].ts);
      const n = nn.get(c.s[i]); if (!n || d <= 0) continue;
      if (n[0] === '(idle)') continue;
      busy += d;
      if (n[0] === 'self.onmessage') onmsg++;
      if (n[1].startsWith('wasm:')) wasmUs += d;
      const key = n[0] + '@' + String(n[1]).split('/').slice(-1)[0].replace('.js', '') + ':' + n[2];
      agg.set(key, (agg.get(key) || 0) + d);
    }
    console.log(`\n== 基线 ${BASE.split('/').pop()} ${isLight ? 'LightWorker' : 'WaveWorker'} (${k} tid=${tid}) ==`);
    console.log(`span=${(span / 1e6).toFixed(1)}s busy=${(busy / 1000).toFixed(0)}ms onmessage≈${onmsg} wasmFrames=${(wasmUs / 1000).toFixed(1)}ms`);
    for (const [key, v] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14))
      console.log(`   ${(v / 1000).toFixed(0).padStart(7)}ms  ${key.slice(0, 120)}`);
    // blur 三账
    for (const want of ['blurLine', 'blurPass', 'lightWasmBlur', 'blur@']) {
      let us = 0, n = 0;
      for (const [key, v] of agg) if (key.startsWith(want)) { us += v; n++; }
      if (n) console.log(`   [${want}] 合计=${(us / 1000).toFixed(0)}ms (${n}个节点)`);
    }
  }
}

// ---- equipStats 调用方(主 trace) ----
const x = JSON.parse(fs.readFileSync('/tmp/wasmflag-xray/extract.json', 'utf8'));
const P = x.profs['8560:0x1'];
const nodes = new Map(P.nodes.map(([nid, a]) => [nid, a]));
const parentOf = new Map(P.parents.map(([nid, par]) => [nid, par]));
const agg = new Map();
for (let i = 0; i < P.S.length; i++) {
  const d = P.D[i] || 0; if (d <= 0) continue;
  const n = nodes.get(P.S[i]); if (!n || !/equipStats/.test(n[0])) continue;
  const chain = []; let cur = P.S[i], g = 0;
  while (cur != null && g++ < 5) {
    const c = nodes.get(cur) || {};
    chain.push((c[0] || '?') + '@' + String(c[1] || '?').split('/').slice(-1)[0].replace('.js', '') + ':' + c[2]);
    cur = parentOf.get(cur);
  }
  const key = chain.join(' ← ');
  agg.set(key, (agg.get(key) || 0) + d);
}
console.log('\n== 主 trace: equipStats 自耗时按链 top ==');
for (const [k, v] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5))
  console.log('  ' + (v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 230));
