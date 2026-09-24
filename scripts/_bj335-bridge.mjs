// ★BJ335（2026-09-24）：活对象桥主锚定位。
// 方法（BJ328 定）：queryObjects(HTMLElement) → getHeapObjectId → 快照按 id 交叉 →
// in-edges(retainer 链) → closure 取 [[FunctionLocation]] 锁源码行。
// 采样门：nodeType===1 + 逐元素 try/catch（防跨 realm Illegal invocation）。
// 轮次：进/退世界 ×3，每轮菜单态 GC 后 census（活元素总数/游离分类直方图）。
// M3 后取 6 个代表性游离元素句柄 → 单张快照 → 逐个 retainer 链。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const ROUNDS = Number(process.env.SW_ROUNDS ?? 3);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('Runtime.enable');
await cdp.send('Debugger.enable').catch(() => {});
await cdp.send('HeapProfiler.enable').catch(() => {});

const gc = async () => {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 600));
};
const poll = async (expr, ms) => {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = await page.evaluate(expr); } catch { /* nav */ }
    if (v) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
};
const WORLD = () => !!(window).__swGame && !!(window).__swGame.world && !!(window).__swGame.liquid;

async function enter() {
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  if (!await poll(WORLD, 300000)) throw new Error('enter 超时');
  await new Promise((r) => setTimeout(r, 2500));
}
async function quitToMenu() {
  await page.evaluate(() => window.__swFlow.quitToMenu());
  if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
  await new Promise((r) => setTimeout(r, 1500));
}

// ---- 活元素 census（queryObjects 桥；单次枚举——queryObjects 对象为一次性迭代）----
async function qoCensus(label) {
  await gc();
  const proto = await cdp.send('Runtime.evaluate', { expression: 'HTMLElement.prototype' });
  const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
  // 一趟全拿：直方图序列化为 JSON 字符串（原始值直读）+ 游离代表元素数组（byRef）
  const statR = await cdp.send('Runtime.callFunctionOn', {
    objectId: objects.objectId,
    functionDeclaration: `function () {
      const hist = new Map(); let total = 0, conn = 0, det = 0, err = 0;
      const dets = [];
      for (const e of Array.from(this)) {
        try {
          if (!e || e.nodeType !== 1) continue;
          total++;
          if (e.isConnected) { conn++; continue; }
          det++;
          const cls = (typeof e.className === 'string' && e.className) ? e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
          const key = e.tagName + (cls ? '.' + cls : '');
          hist.set(key, (hist.get(key) ?? 0) + 1);
          if (dets.length < 64) dets.push(e);
        } catch (err2) { err++; }
      }
      const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
      return { hist: JSON.stringify(top), total, conn, det, err, dets };
    }`,
    returnByValue: false,
  });
  if (statR.exceptionDetails) throw new Error('census exc: ' + JSON.stringify(statR.exceptionDetails).slice(0, 300));
  const props = await cdp.send('Runtime.getProperties', { objectId: statR.result.objectId, ownProperties: true });
  // ★CDP 返回形：属性数组在 response.result（BJ328 loc 探针曾用 .properties 静默遍历 undefined）
  const propArr = props.result ?? props.properties ?? [];
  const byName = new Map(propArr.map((p) => [p.name, p.value]));
  const plain = { total: byName.get('total').value, conn: byName.get('conn').value, det: byName.get('det').value, err: byName.get('err').value };
  const top = JSON.parse(byName.get('hist').value);
  // 代表句柄：取 dets 数组里的若干索引元素（保持 objectId → getHeapObjectId）
  const detsP = byName.get('dets');
  const detsProps = await cdp.send('Runtime.getProperties', { objectId: detsP.objectId, ownProperties: true });
  const dets = (detsProps.result ?? detsProps.properties ?? []).filter((p) => /^\d+$/.test(p.name)).sort((a, b) => Number(a.name) - Number(b.name));
  // 保留 Runtime objectId（getHeapObjectId 须在【快照之后】调用——id 相对最近一张快照）
  const handles = dets.slice(0, 8).map((p) => ({ idx: Number(p.name), objId: p.value.objectId }));
  console.log(`\n[${label}] liveHTMLElements total=${plain.total} connected=${plain.conn} detached=${plain.det} crossRealmErr=${plain.err}`);
  for (const [k, n] of top) console.log(`   ×${n} ${k}`);
  console.log('   bridge handles:', JSON.stringify(handles));
  return { plain, handles };
}

// ---- 首次进入（走 goto）----
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await gc();
await qoCensus('M0 title (fresh, GC)');
await enter();
await quitToMenu();
const m1 = await qoCensus('M1 menu after round1 (GC)');
await enter();
await quitToMenu();
const m2 = await qoCensus('M2 menu after round2 (GC)');
await enter();
await quitToMenu();
const m3 = await qoCensus('M3 menu after round3 (GC)');

// ---- 快照 + retainer 链 ----
console.log('\n==== takeHeapSnapshot ====');
const chunks = [];
cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
const snapT0 = Date.now();
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
console.log('snapshot taken in', ((Date.now() - snapT0) / 1000).toFixed(1), 's, bytes=', chunks.join('').length);

const raw = JSON.parse(chunks.join(''));
try { (await import('node:fs')).writeFileSync('/tmp/bj335-m3.heapsnapshot', chunks.join('')); console.log('snapshot saved /tmp/bj335-m3.heapsnapshot'); } catch { /* ok */ }
const meta = raw.snapshot.meta;
const nodes = raw.nodes, edges = raw.edges, strings = raw.strings;
const F = meta.node_fields.length, EF = meta.edge_fields.length;
const typeNames = meta.node_types[0], edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name'), nId = meta.node_fields.indexOf('id'), nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index'), eType = meta.edge_fields.indexOf('type'), eTo = meta.edge_fields.indexOf('to_node');
const nodeCount = raw.snapshot.node_count;
const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => typeNames[nodes[i * F + nType]];
const idOf = (i) => nodes[i * F + nId];

// 反向边索引
console.log('building reverse edge index… nodes=', nodeCount);
const revT0 = Date.now();
const rev = new Map();
let ep = 0;
for (let i = 0; i < nodeCount; i++) {
  const cnt = nodes[i * F + nEdges];
  for (let k = 0; k < cnt; k++) {
    const base = (ep + k) * EF;
    const to = edges[base + eTo] / F;
    let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
    l.push({ src: i, eT: edgeTypeNames[edges[base + eType]], eN: typeof edges[base + eName] === 'number' && edgeTypeNames[edges[base + eType]] === 'element' ? String(edges[base + eName]) : (strings[edges[base + eName]] ?? String(edges[base + eName])) });
  }
  ep += cnt;
}
console.log('rev index built in', ((Date.now() - revT0) / 1000).toFixed(1), 's');
// 前向边索引（延迟构建太贵——按需构建 slot 表：只对 Context/对象节点现算）
const fwdStart = (() => { const a = new Int32Array(nodeCount + 1); let acc = 0; for (let i = 0; i < nodeCount; i++) { a[i] = acc; acc += nodes[i * F + nEdges]; } a[nodeCount] = acc; return a; })();
function fwd(i) {
  const out = [];
  for (let k = fwdStart[i]; k < fwdStart[i + 1]; k++) {
    const base = k * EF;
    const t = edgeTypeNames[edges[base + eType]];
    const eN = t === 'element' ? '[' + edges[base + eName] + ']' : (strings[edges[base + eName]] ?? String(edges[base + eName]));
    out.push({ eT: t, eN, to: edges[base + eTo] / F });
  }
  return out;
}
const idToNode = new Map();
for (let i = 0; i < nodeCount; i++) idToNode.set(idOf(i), i);

const SYSTEM_ROOTS = /^(Bootstrapper|Builtins|Compilation cache|Code flusher|Debugger|Eternal handles|External strings|Extensions|GC roots|User objects|Object shapes|Internalized strings|Array buffer extensions|Detached\[[^\]]*\])$/;
const SEM = new Set(['context', 'property', 'internal', 'element', 'shortcut']);
// closure → [[FunctionLocation]] → 源码行
async function fnSource(heapId) {
  try {
    const { result } = await cdp.send('HeapProfiler.getObjectByHeapObjectId', { objectId: String(heapId) });
    if (!result?.objectId) return null;
    const pr = await cdp.send('Runtime.getProperties', { objectId: result.objectId, internalProperties: true });
    const loc = (pr.internalProperties ?? []).find((p) => p.name === '[[FunctionLocation]]');
    if (!loc?.value?.value) return null;
    const { scriptId, lineNumber, columnNumber } = loc.value.value;
    const { scriptSource } = await cdp.send('Debugger.getScriptSource', { scriptId }).catch(() => ({ scriptSource: null }));
    const line = scriptSource ? (scriptSource.split('\n')[lineNumber] ?? '').trim().slice(0, 160) : '(no source)';
    return `served:${lineNumber + 1}:${columnNumber + 1} → ${line}`;
  } catch { return null; }
}
async function walkChain(heapId, label) {
  let cur = idToNode.get(Number(heapId));
  console.log(`\n===== chain ${label} (heapId=${heapId} → node ${cur >= 0 ? cur : '未找到'}) =====`);
  if (cur === undefined || cur < 0) { console.log('  未在快照中找到该 id（可能桥接失效）'); return; }
  console.log(`  root: ${tp(cur)}:${String(nm(cur)).slice(0, 90)}`);
  const visited = new Set([cur]);
  for (let depth = 0; depth < 9 && cur >= 0; depth++) {
    const ins = (rev.get(cur) ?? []).filter((e) => !(e.eT === 'element' && SYSTEM_ROOTS.test(e.eN)) && !(e.eT === 'shortcut' && e.eN === ''));
    if (!ins.length) { console.log('   ── (无语义 in-edge:GC 根)'); break; }
    ins.sort((a, b) => (SEM.has(a.eT) ? 0 : 1) - (SEM.has(b.eT) ? 0 : 1));
    const shown = ins.slice(0, 10);
    for (const e of shown) console.log(`   in ${e.eT}:'${String(e.eN).slice(0, 40)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 80)}#${e.src}`);
    const next = shown[0];
    if (visited.has(next.src)) { console.log('   ── (环,止)'); break; }
    // context 节点:dump 槽表（谁把元素放进 context）
    const nmt = String(nm(cur));
    if (nmt.includes('Context')) {
      try {
        const slots = fwd(cur).filter((e) => e.eT === 'context' || e.eT === 'internal' || e.eT === 'property');
        console.log(`   [context#${cur} 槽表]` + slots.slice(0, 24).map((s) => ` ${s.eN}→${tp(s.to)}:${String(nm(s.to)).slice(0, 40)}`).join(' |'));
      } catch { /* ok */ }
    }
    // closure 节点:锁源码行
    if (tp(cur) === 'closure' || tp(next.src) === 'closure') {
      const t = tp(cur) === 'closure' ? cur : next.src;
      const src = await fnSource(nodes[t * F + nId]);
      if (src) console.log(`   [fn@${t} ${String(nm(t)).slice(0, 50)}] ${src}`);
    }
    cur = next.src; visited.add(cur);
  }
}

// 每轮代表元素 + 每轮差分元素都走链（M3 handles 在快照后解析 id）
console.log('\n==== retainer chains (M3 代表游离元素) ====');
const m3Handles = [...m3.handles];
for (const h of m3Handles) {
  const id = await cdp.send('HeapProfiler.getHeapObjectId', { objectId: h.objId }).catch((e) => { console.log('   getHeapObjectId err:', String(e).slice(0, 120)); return null; });
  const heapId = id ? id.heapSnapshotObjectId ?? id.heapObjectId : null;
  if (!heapId || heapId === '0') { console.log(`det[${h.idx}] → 无快照 id(${heapId})`); continue; }
  await walkChain(heapId, `det[${h.idx}]`);
  if (h.idx >= 8) break;
}

await browser.close();
process.exit(0);
