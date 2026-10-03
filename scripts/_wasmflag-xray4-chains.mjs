// wasmflag xray4: 热点深调用链 / sm2wasm 验证 / LightWorker 深链 / 10862 身份 / 曲线
// run: node scripts/_wasmflag-xray4-chains.mjs
import fs from 'node:fs';
const x = JSON.parse(fs.readFileSync('/tmp/wasmflag-xray/extract.json', 'utf8'));

function loadProf(key) {
  const P = x.profs[key];
  if (!P) return null;
  const nodes = new Map(P.nodes.map(([nid, a]) => [nid, { fn: a[0], url: a[1], line: a[2] }]));
  const parentOf = new Map(P.parents.map(([nid, par]) => [nid, par]));
  return { P, nodes, parentOf };
}
const cfOf = nodes => nid => {
  const c = nodes.get(nid) || {};
  return (c.fn || '?') + '@' + (c.url || '?').split('/').slice(-1)[0].replace('.js', '') + ':' + (c.line ?? '?');
};

// ---- 1. 主线程: 指定热点关键词的样本深链 ----
const M = loadProf('8560:0x1');
const cfM = cfOf(M.nodes);
const HOT = ['stampShineCell', 'mmHudBlit', 'drawVanillaLiquids', 'drawWindSwayTiles', 'drawVanillaDustPass', 'shineChunkFingerprint', 'drawMinimap', 'compositeLight', 'drawChainPipe', 'drawHead', 'hairDyeRenderColor', 'readPixel', 'drawDirectMouseText', 'internalSample'];
// 关键词 → 自耗时样本聚合的深链
const chainAgg = new Map();   // keyword → Map(chain → us)
const kwSelf = new Map();     // keyword → us
for (let i = 0; i < M.P.S.length; i++) {
  const d = M.P.D[i] || 0; if (d <= 0) continue;
  const nid = M.P.S[i]; if (!M.nodes.has(nid)) continue;
  const c = M.nodes.get(nid);
  const hit = HOT.find(k => (c.fn || '').includes(k));
  if (!hit) continue;
  kwSelf.set(hit, (kwSelf.get(hit) || 0) + d);
  const chain = []; let cur = nid, g = 0;
  while (cur != null && g++ < 8) { chain.push(cfM(cur)); cur = M.parentOf.get(cur); }
  const m = chainAgg.get(hit) || (chainAgg.set(hit, new Map()), chainAgg.get(hit));
  const key = chain.join(' ← ');
  m.set(key, (m.get(key) || 0) + d);
}
console.log('== 主线程热点深链(自耗时样本, 深6) ==');
for (const k of HOT) {
  const self = kwSelf.get(k) || 0;
  if (self < 30000) continue;
  console.log(`\n  [${k}] self=${(self / 1000).toFixed(0)}ms`);
  for (const [ch, us] of [...(chainAgg.get(k)?.entries() || [])].sort((a, b) => b[1] - a[1]).slice(0, 2))
    console.log('    ' + (us / 1000).toFixed(0).padStart(6) + 'ms  ' + ch.slice(0, 260));
}

// rAF 三循环身份
const rafAgg = new Map();
for (let i = 0; i < M.P.S.length; i++) {
  const d = M.P.D[i] || 0; if (d <= 0) continue;
  const nid = M.P.S[i]; if (!M.nodes.has(nid)) continue;
  const c = M.nodes.get(nid);
  if ((c.fn || '') !== 'requestAnimationFrame') continue;
  const chain = []; let cur = nid, g = 0;
  while (cur != null && g++ < 8) { chain.push(cfM(cur)); cur = M.parentOf.get(cur); }
  const key = chain.slice(1).join(' ← ');
  rafAgg.set(key, (rafAgg.get(key) || 0) + d);
}
console.log('\n== requestAnimationFrame 自耗时按调用链(三循环身份) ==');
for (const [ch, us] of [...rafAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5))
  console.log('  ' + (us / 1000).toFixed(0).padStart(6) + 'ms  ' + ch.slice(0, 240));

// ---- 2. 主线程 sm2 / ForceField / lightWasm 面 ----
const sm2 = new Map();
for (let i = 0; i < M.P.S.length; i++) {
  const d = M.P.D[i] || 0; if (d <= 0) continue;
  const nid = M.P.S[i]; if (!M.nodes.has(nid)) continue;
  const c = M.nodes.get(nid);
  if (/sm2|Sm2|SM2|ForceField|forceField|lightWasm|wasmRunPass|runPassOnImage/i.test((c.fn || '') + ' ' + (c.url || ''))) {
    const k = cfM(nid);
    sm2.set(k, (sm2.get(k) || 0) + d);
  }
}
console.log('\n== 主线程 sm2/ForceField/lightWasm 相关样本 ==');
for (const [k, v] of [...sm2.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log('  ' + (v / 1000).toFixed(1) + 'ms  ' + k);
// mainFunc 层面(入口级, 哪怕没被采样命中)
const mfHits = new Map();
for (const f of x.mainFunc) {
  if (/sm2|Sm2|ForceField|lightWasm|wasmRunPass|runPassOnImage|drawForceField/i.test(f[0])) {
    const k = f[0] + '@' + String(f[1]).split('/').slice(-1)[0] + ':' + f[2];
    const a = mfHits.get(k) || (mfHits.set(k, { n: 0, dur: 0 }), mfHits.get(k));
    a.n++; a.dur += f[4];
  }
}
console.log('  -- FunctionCall 入口层 --');
for (const [k, a] of [...mfHits.entries()].sort((p, q) => q[1].dur - p[1].dur).slice(0, 10)) console.log(`   ${(a.dur / 1000).toFixed(1)}ms n=${a.n}  ${k}`);

// ---- 3. LightWorker(8560:0x3) 深链 ----
const L = loadProf('8560:0x3');
const cfL = cfOf(L.nodes);
for (const KW of ['exportTo', 'postMessage', 'decode', 'runSnapshotOnEngine', 'surfaceSky', 'lightWasmBlur', 'self.onmessage', 'wasm-function', 'js-to-wasm']) {
  const agg = new Map(); let tot = 0;
  for (let i = 0; i < L.P.S.length; i++) {
    const d = L.P.D[i] || 0; if (d <= 0) continue;
    const nid = L.P.S[i]; if (!L.nodes.has(nid)) continue;
    const c = L.nodes.get(nid);
    if (!(c.fn || '').includes(KW)) continue;
    tot += d;
    const chain = []; let cur = nid, g = 0;
    while (cur != null && g++ < 7) { chain.push(cfL(cur)); cur = L.parentOf.get(cur); }
    const key = chain.slice(0, 5).join(' ← ');
    agg.set(key, (agg.get(key) || 0) + d);
  }
  if (tot < 20000) continue;
  console.log(`\n== LightWorker [${KW}] self=${(tot / 1000).toFixed(0)}ms ==`);
  for (const [ch, us] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3))
    console.log('  ' + (us / 1000).toFixed(0).padStart(6) + 'ms  ' + ch.slice(0, 240));
}

// ---- 4. WaveWorker(8560:0x4) 深链 ----
const W = loadProf('8560:0x4');
const cfW = cfOf(W.nodes);
for (const KW of ['_step', 'postMessage']) {
  const agg = new Map(); let tot = 0;
  for (let i = 0; i < W.P.S.length; i++) {
    const d = W.P.D[i] || 0; if (d <= 0) continue;
    const nid = W.P.S[i]; if (!W.nodes.has(nid)) continue;
    const c = W.nodes.get(nid);
    if (!(c.fn || '').includes(KW)) continue;
    tot += d;
    const chain = []; let cur = nid, g = 0;
    while (cur != null && g++ < 7) { chain.push(cfW(cur)); cur = W.parentOf.get(cur); }
    const key = chain.slice(0, 5).join(' ← ');
    agg.set(key, (agg.get(key) || 0) + d);
  }
  if (tot < 20000) continue;
  console.log(`\n== WaveWorker [${KW}] self=${(tot / 1000).toFixed(0)}ms ==`);
  for (const [ch, us] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3))
    console.log('  ' + (us / 1000).toFixed(0).padStart(6) + 'ms  ' + ch.slice(0, 240));
}

// ---- 5. 主线程 worker 相关面深链: postMessage/frame@602110, send@656881, compute@657254, worker.onmessage ----
for (const KW of ['buildSlice', 'worker.onmessage', '_ww.onmessage', 'takeSnapshot', 'encode', 'drawMinimap']) {
  const agg = new Map(); let tot = 0;
  for (let i = 0; i < M.P.S.length; i++) {
    const d = M.P.D[i] || 0; if (d <= 0) continue;
    const nid = M.P.S[i]; if (!M.nodes.has(nid)) continue;
    const c = M.nodes.get(nid);
    if (!(c.fn || '').includes(KW)) continue;
    tot += d;
    const chain = []; let cur = nid, g = 0;
    while (cur != null && g++ < 7) { chain.push(cfM(cur)); cur = M.parentOf.get(cur); }
    const key = chain.slice(0, 5).join(' ← ');
    agg.set(key, (agg.get(key) || 0) + d);
  }
  if (tot < 20000) continue;
  console.log(`\n== 主线程 [${KW}] self=${(tot / 1000).toFixed(0)}ms ==`);
  for (const [ch, us] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3))
    console.log('  ' + (us / 1000).toFixed(0).padStart(6) + 'ms  ' + ch.slice(0, 240));
}

// ---- 6. 10862 身份 ----
const O = loadProf('10862:0x1');
if (O) {
  const cfO = cfOf(O.nodes);
  const fns = new Map();
  for (let i = 0; i < O.P.S.length; i++) {
    const d = O.P.D[i] || 0; if (d <= 0) continue;
    const nid = O.P.S[i]; if (!O.nodes.has(nid)) continue;
    const k = cfO(nid);
    fns.set(k, (fns.get(k) || 0) + d);
  }
  console.log('\n== 10862 renderer 主线程 top10(身份鉴定) ==');
  for (const [k, v] of [...fns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log('  ' + (v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 140));
}
