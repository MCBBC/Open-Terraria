// _exit-mem-xray2.mjs — CPU 画像分窗提取 + 慢帧窗 + worker 静默/身份鉴定
// run: node scripts/_exit-mem-xray2.mjs [tracePath]
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
import { scanTrace } from './_exit-mem-scan.mjs';

const TRACE = process.argv[2] || needInput(join(DOWNLOADS, 'Trace-20261004T130359.json'));
const OUT = '/tmp/exit-mem';
const T0 = 816233258417; // recon window min

// 窗口(相对秒)
const WIN = [
  ['boot', 0, 6],
  ['world', 6, 96],
  ['exit', 96, 100.5],
  ['title', 100.5, 104.5],
];
const winOf = (ts) => {
  const s = (ts - T0) / 1e6;
  for (const [nm, a, b] of WIN) if (s >= a && s < b) return nm;
  return null;
};

// 画像状态
const profs = new Map(); // id → {nodes:Map, parent:Map, self:Map(win→Map(fn→us)), busy:Map(win→us), gcSelf:Map(win→us), idle}
const rafTs = [], drawTs = [], presTs = [];
let skipped = 0;

const shortUrl = (u) => !u ? '' : u.split('/').slice(-1)[0].split('?')[0];

let _hbN = 0; const _hbT = Date.now();
scanTrace(TRACE, (e) => {
  if ((++_hbN & 0x3ffff) === 0) console.error(`[hb] ${((Date.now() - _hbT) / 1000).toFixed(1)}s ev=${_hbN}`);
  const nm = e.name;
  if (e.pid === 84464) {
    if (nm === 'FireAnimationFrame' && e.tid === 27036070) { rafTs.push(e.ts); return; }
    if (nm === 'AnimationFrame::Presentation' && e.tid === 27036070) { presTs.push(e.ts); return; }
    if (nm === 'DrawFrame' && e.tid === 27036083) { drawTs.push(e.ts); return; }
  }
  if (nm !== 'ProfileChunk' || e.pid !== 84464) return;
  const d = e.args?.data || {};
  const cp = d.cpuProfile || {};
  const P = profs.get(e.id) || (profs.set(e.id, { nodes: new Map(), parent: new Map(), self: new Map(WIN.map(([w]) => [w, new Map()])), busy: new Map(WIN.map(([w]) => [w, 0])), gcSelf: new Map(WIN.map(([w]) => [w, 0])), tid: e.tid }), profs.get(e.id));
  for (const n of cp.nodes || []) {
    if (!P.nodes.has(n.id)) {
      const cf = n.callFrame || {};
      const fn = cf.functionName || '(anon)';
      const p = n.parent;
      if (p != null) P.parent.set(n.id, typeof p === 'object' ? p.id : p);
      P.nodes.set(n.id, {
        cf,
        k: fn + '@' + shortUrl(cf.url) + ':' + (cf.lineNumber ?? '?'),
        gc: fn === '(garbage collector)',
        idle: fn === '(idle)' || fn === '(program)',
      });
    }
  }
  const td = d.timeDeltas || cp.timeDeltas || [];
  const sm = cp.samples || [];
  const w = winOf(e.ts);
  if (!w) return;
  const self = P.self.get(w);
  let busy = P.busy.get(w), gcS = P.gcSelf.get(w);
  for (let i = 0; i < sm.length; i++) {
    const delta = td[i];
    if (!(delta > 0)) continue;
    const nd = P.nodes.get(sm[i]);
    if (!nd) { skipped++; continue; }
    if (nd.idle) continue;
    busy += delta;
    if (nd.gc) { gcS += delta; continue; }
    const k = nd.k;
    self.set(k, (self.get(k) || 0) + delta);
  }
  P.busy.set(w, busy); P.gcSelf.set(w, gcS);
});

// ---- 输出 ----
const ms = (us) => (us / 1000);
const T0TID = { '0xf': 'MAIN', '0x10': 'W1(1.0s)', '0x11': 'W2(2.1s?)', '0x12': 'W3(3.9s)', '0x13': 'W4(5.5s)', '0x14': 'W5(5.8s)', '0x15': 'W6(6.8s)', '0x16': 'W7(99.4s)' };

console.log('== 各 isolate 分窗 busy(ms) / busy%(窗时长) ==');
const WINDUR = { boot: 6, world: 90, exit: 4.5, title: 4 };
for (const [id, P] of [...profs.entries()].sort()) {
  const parts = WIN.map(([w]) => {
    const b = ms(P.busy.get(w) || 0);
    return `${w}=${b.toFixed(0)}ms(${(100 * (P.busy.get(w) || 0) / 1e6 / WINDUR[w]).toFixed(0)}%)`;
  });
  console.log(` prof ${id} ${T0TID[id] || ''} tid=${P.tid} nodes=${P.nodes.size}: ${parts.join(' ')}`);
}

console.log('\n== MAIN(0xf) 分窗自耗时 top15 ==');
const MP = profs.get('0xf');
const jsAncestor = (P, nid) => {
  let cur = P.parent.get(nid), g = 0;
  while (cur != null && g++ < 20) {
    const nd = P.nodes.get(cur);
    if (!nd) return null;
    const c = nd.cf;
    if (c.url) return (c.functionName || '?') + '@' + shortUrl(c.url) + ':' + (c.lineNumber ?? '?');
    cur = P.parent.get(cur);
  }
  return null;
};
// 重建 nid→fnKey 以便做父链标注(只在 top 汇总后按需查)
for (const [w] of WIN) {
  if (!MP) break;
  const arr = [...MP.self.get(w).entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(` -- ${w} --`);
  for (const [k, v] of arr) console.log(`   ${ms(v).toFixed(0).padStart(7)}ms  ${k.slice(0, 130)}`);
}

console.log('\n== MAIN 慢帧:分窗帧距(ms) ==');
const frameStat = (ts, lo, hi, label) => {
  const d = [];
  for (let i = 1; i < ts.length; i++) { const x = (ts[i] - ts[i - 1]) / 1000; const s = (ts[i - 1] - T0) / 1e6; if (x > 0 && x < 5000 && s >= lo && s < hi) d.push(x); }
  if (!d.length) { console.log(`${label}: (空)`); return; }
  const a = [...d].sort((x, y) => x - y);
  const q = (p) => a[Math.floor(a.length * p)] || 0;
  console.log(`${label} n=${d.length} avg=${(d.reduce((x, y) => x + y, 0) / d.length).toFixed(1)} med=${q(.5).toFixed(1)} p95=${q(.95).toFixed(1)} p99=${q(.99).toFixed(1)} max=${a[a.length - 1].toFixed(0)} >25ms=${d.filter(x => x > 25).length} >50=${d.filter(x => x > 50).length} >100=${d.filter(x => x > 100).length}`);
};
for (const [, a, b] of WIN) { frameStat(rafTs, a, b, ` rAF  ${a}-${b}s`); frameStat(drawTs, a, b, ` DrawF ${a}-${b}s`); }

console.log('\n== 慢帧最重秒 top12(按 rAF 超额 25ms 以上帧数) ==');
const perSecSlow = new Map();
for (let i = 1; i < rafTs.length; i++) {
  const x = (rafTs[i] - rafTs[i - 1]) / 1000;
  if (x > 25 && x < 5000) {
    const s = Math.floor((rafTs[i] - T0) / 1e6);
    const o = perSecSlow.get(s) || { n: 0, sum: 0, worst: 0 };
    o.n++; o.sum += x - 16.7; o.worst = Math.max(o.worst, x);
    perSecSlow.set(s, o);
  }
}
for (const [s, o] of [...perSecSlow.entries()].sort((x, y) => y[1].sum - x[1].sum).slice(0, 12))
  console.log(`  ${String(s).padStart(3)}s  >25ms帧=${String(o.n).padStart(3)}  超额合计=${o.sum.toFixed(0)}ms  worst=${o.worst.toFixed(0)}ms`);

console.log('\n== 退出段画像:exit/title 窗各 isolate 自耗时 top6 ==');
for (const [id, P] of [...profs.entries()].sort()) {
  for (const w of ['exit', 'title']) {
    const arr = [...P.self.get(w).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!arr.length) continue;
    console.log(` prof ${id} ${T0TID[id] || ''} [${w}] busy=${ms(P.busy.get(w)).toFixed(0)}ms gcSelf=${ms(P.gcSelf.get(w)).toFixed(0)}ms`);
    for (const [k, v] of arr) console.log(`    ${ms(v).toFixed(1).padStart(8)}ms  ${k.slice(0, 120)}`);
  }
}

fs.writeFileSync(OUT + '/xray2.json', JSON.stringify({
  wins: WIN, skipped,
  profBusy: [...profs.entries()].map(([id, P]) => ({ id, tid: P.tid, nodes: P.nodes.size, busy: Object.fromEntries(P.busy), gcSelf: Object.fromEntries(P.gcSelf) })),
  mainSelf: MP ? Object.fromEntries(WIN.map(([w]) => [w, [...MP.self.get(w).entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)])) : null,
}, null, 1));
console.log('\n→ ' + OUT + '/xray2.json');
