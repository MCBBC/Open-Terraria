// wasmflag xray5: per-second 曲线 / 慢帧归因 / blurLine 零样本复核 / wasm 模块普查 / 帧交付质量
// run: node scripts/_wasmflag-xray5-curves.mjs
import fs from 'node:fs';
const x = JSON.parse(fs.readFileSync('/tmp/wasmflag-xray/extract.json', 'utf8'));

function loadProf(key) {
  const P = x.profs[key];
  const nodes = new Map(P.nodes.map(([nid, a]) => [nid, { fn: a[0], url: a[1], line: a[2] }]));
  const parentOf = new Map(P.parents.map(([nid, par]) => [nid, par]));
  return { P, nodes, parentOf };
}
const cfOf = nodes => nid => {
  const c = nodes.get(nid) || {};
  return (c.fn || '?') + '@' + (c.url || '?').split('/').slice(-1)[0].replace('.js', '') + ':' + (c.line ?? '?');
};
// 节点→「谁调用它」第一个 JS 父(用于 drawImage 归因分组)
function jsCaller(nodes, parentOf, nid) {
  let cur = parentOf.get(nid), g = 0;
  while (cur != null && g++ < 24) {
    const c = nodes.get(cur) || {};
    if (c.url) return cfOf(nodes)(cur);
    if (c.fn === '(garbage collector)') return '(GC)';
    cur = parentOf.get(cur);
  }
  return '(root)';
}

// ---- 1. 主线程: drawImage/postMessage/rAF 按调用方分桶的 per-second 曲线 ----
const M = loadProf('8560:0x1');
const t0 = M.P.TS[0];
const targets = new Map();  // 归因名 → Map(sec → us)
function bucket(fnName, callerKey, sec, us) {
  const k = fnName + ' ⟵ ' + callerKey;
  let m = targets.get(k); if (!m) targets.set(k, m = new Map());
  m.set(sec, (m.get(sec) || 0) + us);
}
for (let i = 0; i < M.P.S.length; i++) {
  const d = M.P.D[i] || 0; if (d <= 0) continue;
  const nid = M.P.S[i]; if (!M.nodes.has(nid)) continue;
  const fn = M.nodes.get(nid).fn;
  if (fn === 'drawImage' || fn === 'postMessage' || fn === 'requestAnimationFrame' || fn === 'texImage2D' || fn === 'clearRect' || fn === 'readPixels' || fn === 'putImageData' || fn === 'fillText') {
    const caller = jsCaller(M.nodes, M.parentOf, nid);
    const sec = Math.floor((M.P.TS[i] - t0) / 1e6);
    bucket(fn, caller, sec, d);
  }
}
console.log('== 主线程原生调用按调用方: total + 稳态(每秒>1ms的秒数) + 峰值秒 ==');
for (const [k, m] of [...targets.entries()].sort((a, b) => b[1] && 0).sort((a, b) => {
  const sa = [...a[1].values()].reduce((p, q) => p + q, 0), sb = [...b[1].values()].reduce((p, q) => p + q, 0);
  return sb - sa;
}).slice(0, 14)) {
  const total = [...m.values()].reduce((p, q) => p + q, 0);
  const hot = [...m.entries()].filter(([, v]) => v > 1000).sort((p, q) => q[1] - p[1]);
  const peak = [...m.entries()].sort((p, q) => q[1] - p[1])[0];
  console.log(`  ${(total / 1000).toFixed(0).padStart(6)}ms  热秒=${String(hot.length).padStart(3)}  峰值 ${peak[0]}s=${(peak[1] / 1000).toFixed(0)}ms  ${k.slice(0, 100)}`);
  if (total > 400000) console.log('      曲线: ' + [...m.entries()].sort((p, q) => p[0] - q[0]).filter(([, v]) => v > 2000).slice(0, 24).map(([s, v]) => s + 's:' + (v / 1000).toFixed(0)).join(' '));
}

// ---- 2. LightWorker: exportTo/wasm/postMessage/decode per-second 曲线 ----
const L = loadProf('8560:0x3');
const lt0 = L.P.TS[0];
const lw = new Map();
for (let i = 0; i < L.P.S.length; i++) {
  const d = L.P.D[i] || 0; if (d <= 0) continue;
  const nid = L.P.S[i]; if (!L.nodes.has(nid)) continue;
  const c = L.nodes.get(nid);
  let k = null;
  if (c.url?.startsWith('wasm:')) k = 'wasm-kernel';
  else if ((c.fn || '') === 'exportTo') k = 'exportTo';
  else if ((c.fn || '') === 'postMessage') k = 'postMessage';
  else if ((c.fn || '') === 'decode') k = 'decode';
  else if ((c.fn || '') === 'lightWasmBlur') k = 'lightWasmBlur(glue)';
  else if ((c.fn || '') === 'self.onmessage') k = 'onmessage-glue';
  else if ((c.fn || '') === 'runSnapshotOnEngine') k = 'scan(runSnapshotOnEngine)';
  if (!k) continue;
  const sec = Math.floor((L.P.TS[i] - lt0) / 1e6);
  let m = lw.get(k); if (!m) lw.set(k, m = new Map());
  m.set(sec, (m.get(sec) || 0) + d);
}
console.log('\n== LightWorker 分项 per-second(>3ms 的秒; 全程稳态=空白跳过) ==');
for (const [k, m] of lw) {
  const total = [...m.values()].reduce((p, q) => p + q, 0);
  const secs = [...m.entries()].sort((p, q) => p[0] - q[0]);
  const over3 = secs.filter(([, v]) => v > 3000);
  console.log(`  ${k}: total=${(total / 1000).toFixed(0)}ms 热秒(>3ms)=${over3.length}/${secs.length} 均值=${(total / 1000 / Math.max(1, secs.length)).toFixed(1)}ms/s`);
  if (over3.length && over3.length < 40) console.log('     ' + over3.map(([s, v]) => s + 's:' + (v / 1000).toFixed(0)).join(' '));
  else console.log('     分布均匀(无事件性峰)');
}

// ---- 3. blurLine/blurPass 零样本复核 + wasm 模块普查(全部 profile) ----
console.log('\n== JS blur 残留复核(所有 profile 中 blurLine/blurPass 样本) ==');
for (const [key, P] of Object.entries(x.profs)) {
  const nodes = new Map(P.nodes.map(([nid, a]) => [nid, a]));
  let hits = 0, us = 0;
  for (let i = 0; i < P.S.length; i++) {
    const n = nodes.get(P.S[i]);
    if (!n) continue;
    if (/^(blurLine|blurPass)$/.test(n[0])) { hits++; us += P.D[i] || 0; }
  }
  console.log(`  ${key}: blurLine/blurPass 样本=${hits} (${(us / 1000).toFixed(1)}ms)`);
}
console.log('\n== wasm 模块普查(全部 profile 的 wasm url) ==');
const wasmUrls = new Map();
for (const [key, P] of Object.entries(x.profs)) {
  for (const [nid, a] of P.nodes) {
    if (a[1] && a[1].startsWith('wasm:')) {
      const k = key + ' → ' + a[1].slice(0, 40) + ' (' + a[0] + ')';
      wasmUrls.set(k, (wasmUrls.get(k) || 0) + 1);
    }
  }
}
for (const [k, n] of wasmUrls) console.log(`  ${k} 样本n=${n}`);

// ---- 4. 慢帧 vs 内容: 慢帧秒 × 关键函数秒曲线对照 ----
const frames = x.mainEvents.filter(e => e[0] === 'PageAnimator::serviceScriptedAnimations').map(e => e[1]).sort((a, b) => a - b);
const f0 = frames[0];
const slowSec = new Map();
for (let i = 1; i < frames.length; i++) {
  const gap = (frames[i] - frames[i - 1]) / 1000;
  if (gap > 12.5) {
    const s = Math.floor((frames[i - 1] - f0) / 1e6);
    slowSec.set(s, (slowSec.get(s) || 0) + 1);
  }
}
console.log('\n== 慢帧数(>12.5ms) 按秒 × 关键函数该秒耗时(ms) ==');
const probeFns = [
  ['drawVanillaLiquids', /drawVanillaLiquids/],
  ['mmHudBlit', /mmHudBlit/],
  ['sweep(windsway)', /sweep@/],
  ['each(dust)', /each@/],
  ['drawImage-all', /drawImage/],
];
const M2 = M;
const perSec = new Map();
for (let i = 0; i < M2.P.S.length; i++) {
  const d = M2.P.D[i] || 0; if (d <= 0) continue;
  const nid = M2.P.S[i]; if (!M2.nodes.has(nid)) continue;
  const c = M2.nodes.get(nid);
  const sec = Math.floor((M2.P.TS[i] - lt0) / 1e6);
  let m = perSec.get(sec); if (!m) perSec.set(sec, m = {});
  if (c.fn === 'drawImage') m.drawImage = (m.drawImage || 0) + d;
  if (c.fn === 'drawVanillaLiquids') m.liquids = (m.liquids || 0) + d;
  if (c.fn === 'mmHudBlit') m.mm = (m.mm || 0) + d;
  if ((c.fn || '') === 'sweep') m.sweep = (m.sweep || 0) + d;
  if ((c.fn || '') === 'each') m.each = (m.each || 0) + d;
  if (c.fn === '(garbage collector)') m.gc = (m.gc || 0) + d;
}
const hotSlowSecs = [...slowSec.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log('  慢帧top秒: ' + hotSlowSecs.map(([s, n]) => s + 's×' + n).join(' '));
for (const [s] of hotSlowSecs) {
  const m = perSec.get(s) || {};
  const avg = perSec.get(s - 2) || {};
  console.log(`  ${String(s).padStart(3)}s 慢帧${slowSec.get(s)} | drawImage=${((m.drawImage || 0) / 1000).toFixed(1)}(邻均值${((avg.drawImage || 0) / 1000).toFixed(1)}) liquids=${((m.liquids || 0) / 1000).toFixed(1)}(${((avg.liquids || 0) / 1000).toFixed(1)}) mm=${((m.mm || 0) / 1000).toFixed(1)} sweep=${((m.sweep || 0) / 1000).toFixed(1)} each=${((m.each || 0) / 1000).toFixed(1)} gc=${((m.gc || 0) / 1000).toFixed(1)}`);
}

// ---- 5. 帧交付质量: PageAnimator dur>8.33 的帧占比 / 实际 FPS 每秒 ----
console.log('\n== 每秒实际帧数(120Hz 基准) ==');
const fpsSec = new Map();
for (const ts of frames) {
  const s = Math.floor((ts - f0) / 1e6);
  fpsSec.set(s, (fpsSec.get(s) || 0) + 1);
}
let under110 = 0, totalSecs = 0;
const lowSecs = [];
for (const [s, n] of [...fpsSec.entries()].sort((a, b) => a[0] - b[0])) {
  totalSecs++;
  if (n < 110) { under110++; lowSecs.push(s + 's:' + n); }
}
console.log(`  <110fps 的秒: ${under110}/${totalSecs}  明细: ${lowSecs.join(' ')}`);

// ---- 6. benchmark/DroppedFrame/其他进程帧事件 ----
console.log('\n== otherX 中帧/丢帧/演示相关 ==');
for (const [n, a] of Object.entries(x.otherX)) {
  if (/Dropped|dropped|Frame|frame|BeginFrame|Animation|Swap|Pipeline/i.test(n) && !/RunTask|FunctionCall|callFunction|AsyncTask/i.test(n))
    console.log(`  n=${a[0]} dur=${(a[1] / 1000).toFixed(0)}ms  ${n}`);
}
