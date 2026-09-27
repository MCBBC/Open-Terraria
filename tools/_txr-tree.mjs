#!/usr/bin/env node
// _txr-tree.mjs — 一次性取证：从原 trace 重建主线程 CPU profile 树
// 输出:①flame 顶展开(子树总量降序) ②目标函数祖先链聚合 ③分桶自耗时间线 ④慢帧构成
// 用法: node tools/run-diag.mjs --timeout=600000 tools/_txr-tree.mjs <trace.json> [--out /tmp/x.json] [--bucket 2000] [--expand pct]
import fs from 'node:fs';
import { scanTraceStream } from './trace-x-ray.mjs';

const argv = process.argv.slice(2);
if (argv[0] === '--_child') argv.splice(0, 2); // run-diag 子进程形态:--_child <script>
const tracePath = argv[0];
let outPath = '/tmp/txr-tree.json', bucketMs = 2000, expandPct = 0.4;
for (let i = 1; i < argv.length; i++) {
  if (argv[i] === '--out') outPath = argv[++i];
  else if (argv[i] === '--bucket') bucketMs = Number(argv[++i]);
  else if (argv[i] === '--expand') expandPct = Number(argv[++i]);
}

const sessions = new Map();
const threadNames = new Map();
const idToSession = new Map();
let seq = 0;
const fires = []; // [ts,dur] 主线程 rAF 锚（晚点按 mainTid 筛）
const fireTid = [];
let mainTidKey = null;

function onEvent(ev) {
  const name = ev.name || '', cat = ev.cat || '';
  if (cat === '__metadata') {
    if (name === 'thread_name') {
      threadNames.set(ev.pid + ':' + ev.tid, ev.args?.name || '?');
      if (ev.args?.name === 'CrRendererMain' && !mainTidKey) mainTidKey = ev.pid + ':' + ev.tid;
    }
    return;
  }
  if (name === 'FireAnimationFrame' && ev.ph === 'X') {
    fires.push(ev.ts || 0, ev.dur || 0); fireTid.push(ev.pid + ':' + ev.tid);
    return;
  }
  if (!cat.includes('cpu_profiler')) return;
  if (name === 'Profile') {
    const sk = (ev.id || '0x0') + '#' + (++seq);
    sessions.set(sk, {
      key: sk, pid: ev.pid, tid: ev.tid, tidKey: ev.pid + ':' + ev.tid,
      nodes: new Map(), selfUs: new Map(), ts: [], ids: [],
      pending: null, lastTs: 0, lastTsInit: false,
      startTs: ev.args?.data?.startTime ?? ev.ts ?? 0,
    });
    idToSession.set(ev.id, sk);
    return;
  }
  if (name === 'ProfileChunk') {
    const sk = idToSession.get(ev.id); if (!sk) return;
    const s = sessions.get(sk); if (!s) return;
    const d = ev.args?.data || {};
    const cp = d.cpuProfile || {};
    if (cp.nodes) for (const nd of cp.nodes) {
      const cf = nd.callFrame || {};
      s.nodes.set(nd.id, { p: nd.parent, fn: cf.functionName || '(anonymous)', url: cf.url || '', line: cf.lineNumber ?? -1 });
    }
    const samples = cp.samples || [], td = d.timeDeltas || [];
    const m = Math.min(samples.length, td.length);
    if (!s.lastTsInit) { s.lastTs = s.startTs || 0; s.lastTsInit = true; }
    for (let j = 0; j < m; j++) {
      const dt = td[j] >= 0 ? td[j] : 0;
      s.lastTs += dt;
      const node = samples[j];
      if (s.pending !== null) { s.selfUs.set(s.pending, (s.selfUs.get(s.pending) || 0) + dt); s.pending = null; }
      if (j + 1 < m) { const nx = td[j + 1] >= 0 ? td[j + 1] : 0; s.selfUs.set(node, (s.selfUs.get(node) || 0) + nx); }
      else s.pending = node;
      s.ts.push(s.lastTs); s.ids.push(node);
    }
  }
}

const t0 = Date.now();
const scan = scanTraceStream(tracePath, onEvent);
console.error(`[txr-tree] scan done: ${scan.total} top-level events, ${scan.bad} bad, ${Date.now() - t0}ms; sessions=${sessions.size} mainTid=${mainTidKey}`);

const WATCH = new Set([
  'texRefresh', 'texFromImage', 'texFromRegion', 'texImage2D', 'texSubImage2D', 'drawImage',
  'drawBolt', 'bakeBolt', 'generateBolt', 'flushAcc', 'flush', 'presentBatch', 'present', 'begin',
  'compositeLight', 'blurLine', 'exportTo', 'surfaceSky', 'mmHudBlit',
  'drawVanillaDustPass', 'drawDustPremul', 'drawVanillaLiquids', 'drawLiquidBehindTilesOnly',
  'fixedUpdate', 'render', 'frame', 'loop', 'update', '_step', 'sweep', 'finishBatch',
  'drawChainPipe', 'drawStar', 'quadSprite', 'quadTile', 'rasterizePathOp', 'recordPathOp',
  'drawRain', 'drawPrecipDust', 'compose', 'finishAccFrame', 'ensureBridged', 'degradeAcc',
  'uploadScratchBake', 'tintSource', 'drawVanillaRain', 'drawWeather', 'updateWorld', 'updateTime',
]);

const out = { trace: tracePath, mainTidKey, trees: [], targets: {}, buckets: [], slowFrames: [] };

for (const s of sessions.values()) {
  if (threadNames.get(s.tidKey) !== 'CrRendererMain') continue;
  console.error(`[txr-tree] session ${s.key} tid=${s.tidKey} nodes=${s.nodes.size} samples=${s.ids.length}`);

  // children + 子树总量
  const kids = new Map();
  for (const [id, nd] of s.nodes) {
    const pk = nd.p ?? 0;
    if (!kids.has(pk)) kids.set(pk, []);
    kids.get(pk).push(id);
  }
  const totalMemo = new Map();
  const totalOf = (id) => {
    let m = totalMemo.get(id);
    if (m !== undefined) return m;
    m = s.selfUs.get(id) || 0;
    const ch = kids.get(id) || [];
    if (ch.length <= 20000) for (const c of ch) m += totalOf(c);
    totalMemo.set(id, m);
    return m;
  };
  const wallUs = s.ts.length > 1 ? Math.max(...s.ts.slice(-1000)) - Math.min(...s.ts.slice(0, 1000)) : 0;
  const totalWallUs = [...s.selfUs.values()].reduce((a, b) => a + b, 0);

  // tag 归属（最近 enclosing watch fn）——带 memo
  const tagMemo = new Map();
  const tagOf = (id) => {
    let t = tagMemo.get(id);
    if (t !== undefined) return t;
    let cur = id, guard = 0, found = '(other)';
    while (cur !== undefined && guard++ < 200) {
      const nd = s.nodes.get(cur);
      if (!nd) break;
      if (nd.fn === '(root)' || nd.fn === '(program)' || nd.fn === '(idle)' || nd.fn === '(garbage collector)') { found = nd.fn; break; }
      if (WATCH.has(nd.fn)) { found = nd.fn; break; }
      cur = nd.p;
    }
    tagMemo.set(id, found);
    return found;
  };

  // ① flame 顶展开：从 (root) 往下，每层取子树总量最大的 children
  const flameLines = [];
  const expand = (id, depth, path) => {
    if (depth > 14) return;
    const ch = (kids.get(id) || [])
      .map((c) => ({ c, nd: s.nodes.get(c), t: totalOf(c) }))
      .filter((x) => x.nd && x.t > totalWallUs * expandPct / 100)
      .sort((a, b) => b.t - a.t)
      .slice(0, 8);
    for (const { c, nd, t } of ch) {
      const self = s.selfUs.get(c) || 0;
      const file = (nd.url || '').split('/').pop();
      flameLines.push(`${'  '.repeat(depth)}${nd.fn || '?'} @${file}:${nd.line}  incl=${(t / 1000).toFixed(0)}ms (${(t / totalWallUs * 100).toFixed(1)}%) self=${(self / 1000).toFixed(0)}ms  [${path}→${nd.fn}]`);
      expand(c, depth + 1, path + '→' + (nd.fn || '?'));
    }
  };
  const roots = (kids.get(0) || []);
  for (const r of roots) {
    const nd = s.nodes.get(r);
    if (!nd) continue;
    flameLines.push(`(root)→${nd.fn} incl=${(totalOf(r) / 1000).toFixed(0)}ms`);
    expand(r, 1, nd.fn);
  }
  out.trees.push({ session: s.key, wallMs: +(totalWallUs / 1000).toFixed(0), flame: flameLines });

  // ② 目标函数祖先链
  const targets = ['texRefresh', 'texFromImage', 'texImage2D', 'drawBolt', 'fixedUpdate', '_step', 'finishBatch', 'blurLine', 'exportTo', 'update'];
  for (const tfn of targets) {
    const chainAgg = new Map(); // 链签名 -> us
    let selfTotal = 0, nodesN = 0, inclTotal = 0;
    for (const [id, nd] of s.nodes) {
      if (nd.fn !== tfn) continue;
      nodesN++;
      selfTotal += s.selfUs.get(id) || 0;
      inclTotal += totalOf(id);
      const chain = [];
      let cur = nd.p, guard = 0;
      while (cur !== undefined && guard++ < 10) {
        const a = s.nodes.get(cur);
        if (!a) break;
        if (a.fn === '(root)') break;
        const file = (a.url || '').split('/').pop();
        chain.push(`${a.fn}@${file}:${a.line}`);
        cur = a.p;
      }
      if (!chain.length) chain.push('(root)');
      const sig = chain.join(' ← ');
      chainAgg.set(sig, (chainAgg.get(sig) || 0) + (s.selfUs.get(id) || 0));
    }
    out.targets[tfn] = out.targets[tfn] || [];
    out.targets[tfn].push({
      session: s.key, nodes: nodesN, selfMs: +(selfTotal / 1000).toFixed(1), inclMs: +(inclTotal / 1000).toFixed(1),
      chains: [...chainAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([sig, us]) => ({ selfMs: +(us / 1000).toFixed(1), chain: sig })),
    });
  }

  // ③ 分桶时间线（tag 自耗 + 关键 API 样本数）
  if (s.ts.length) {
    const tMin = s.ts[0], tMax = s.ts[s.ts.length - 1];
    const nB = Math.ceil((tMax - tMin) / 1000 / bucketMs) || 1;
    const buckets = Array.from({ length: nB }, () => ({ tagUs: new Map(), tex2dN: 0, tex2dUs: 0 }));
    for (let j = 0; j < s.ids.length; j++) {
      const t = s.ts[j];
      const dt = j + 1 < s.ts.length ? Math.max(0, s.ts[j + 1] - t) : 0;
      const bi = Math.min(nB - 1, Math.floor((t - tMin) / 1000 / bucketMs));
      const b = buckets[bi];
      const nd = s.nodes.get(s.ids[j]);
      if (!nd) continue;
      const tag = tagOf(s.ids[j]);
      b.tagUs.set(tag, (b.tagUs.get(tag) || 0) + dt);
      if (nd.fn === 'texImage2D') { b.tex2dN++; b.tex2dUs += dt; }
    }
    // rAF 锚 → 每桶帧数
    for (let k = 0; k < fires.length / 2; k++) {
      if (fireTid[k] !== s.tidKey) continue;
      const ts = fires[k * 2], dur = fires[k * 2 + 1];
      if (dur < 3000) continue;
      const bi = Math.min(nB - 1, Math.max(0, Math.floor((ts - tMin) / 1000 / bucketMs)));
      buckets[bi].frames = (buckets[bi].frames || 0) + 1;
    }
    out.buckets.push({
      session: s.key, t0Us: tMin, bucketMs,
      rows: buckets.map((b, i) => ({
        tSec: +(i * bucketMs / 1000).toFixed(0),
        frames: b.frames || 0,
        tagsMs: Object.fromEntries([...b.tagUs.entries()].filter(([, v]) => v > 30000).map(([k, v]) => [k, +(v / 1000).toFixed(0)])),
        tex2dN: b.tex2dN, tex2dMs: +(b.tex2dUs / 1000).toFixed(0),
      })),
    });
  }

  // ④ 慢帧构成：rAF 锚帧内,按 tag 聚合自耗
  const anchorList = [];
  for (let k = 0; k < fires.length / 2; k++) {
    if (fireTid[k] !== s.tidKey) continue;
    if (fires[k * 2 + 1] >= 3000) anchorList.push({ ts: fires[k * 2], dur: fires[k * 2 + 1] });
  }
  anchorList.sort((a, b) => b.dur - a.dur);
  const slowest = anchorList.slice(0, 400);
  const frameRows = [];
  // 主循环样本按二分进帧（帧窗=锚 ts..+100ms,与工具口径一致）
  const fTs = anchorList.map((a) => a.ts).sort((a, b) => a - b);
  const fDur = new Map(); for (const a of anchorList) fDur.set(a.ts, a.dur);
  const perFrame = new Map();
  for (let j = 0; j < s.ids.length; j++) {
    const t = s.ts[j];
    let lo = 0, hi = fTs.length - 1, fi = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (fTs[mid] <= t) { fi = mid; lo = mid + 1; } else hi = mid - 1; }
    if (fi < 0) continue;
    const ts = fTs[fi];
    if (t - ts >= 100000) continue;
    const dt = j + 1 < s.ts.length ? Math.max(0, s.ts[j + 1] - t) : 0;
    const nd = s.nodes.get(s.ids[j]);
    if (!nd) continue;
    let row = perFrame.get(ts);
    if (!row) { row = { gapMs: +(fDur.get(ts) / 1000).toFixed(1), tagsUs: new Map(), tex2dN: 0, tex2dUs: 0 }; perFrame.set(ts, row); }
    const tag = tagOf(s.ids[j]);
    row.tagsUs.set(tag, (row.tagsUs.get(tag) || 0) + dt);
    if (nd.fn === 'texImage2D') { row.tex2dN++; row.tex2dUs += dt; }
  }
  for (const ts of slowest.map((a) => a.ts)) {
    const row = perFrame.get(ts);
    if (!row) continue;
    frameRows.push({
      gapMs: row.gapMs,
      tagsMs: Object.fromEntries([...row.tagsUs.entries()].filter(([, v]) => v > 1000).map(([k, v]) => [k, +(v / 1000).toFixed(1)])),
      tex2dN: row.tex2dN,
      tex2dMs: +(row.tex2dUs / 1000).toFixed(1),
    });
  }
  out.slowFrames.push({ session: s.key, nAnchors: anchorList.length, slowestFrames: frameRows.slice(0, 120) });
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.error(`[txr-tree] wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
// 控制台摘要：flame 前 60 行 + 目标链 + 慢帧前 12
for (const t of out.trees) {
  console.log(`\n=== FLAME ${t.session} wall=${t.wallMs}ms ===`);
  for (const l of t.flame.slice(0, 70)) console.log(l);
}
for (const [k, v] of Object.entries(out.targets)) {
  for (const r of v) {
    console.log(`\n=== TARGET ${k} (${r.session}) nodes=${r.nodes} self=${r.selfMs}ms incl=${r.inclMs}ms ===`);
    for (const c of r.chains.slice(0, 5)) console.log(`  ${c.selfMs}ms  ${c.chain}`);
  }
}
for (const sf of out.slowFrames) {
  console.log(`\n=== SLOW FRAMES (${sf.session}) anchors=${sf.nAnchors} ===`);
  for (const f of sf.slowestFrames.slice(0, 15)) console.log(JSON.stringify(f));
}
