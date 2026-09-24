// ★BJ328：残留面逐源定谳探针（件2 监听器 / 件3 合成层）。
//  · addEventListener 全量插桩（非 DOM target 才记栈——BJ319 判谳=泄漏挂 App 级非 DOM EventTarget）
//  · window/document/body 监听器分相 census（DOMDebugger.getEventListeners）
//  · LayerTree 逐层 dump + backendNodeId→DOM 节点解析（层身份定位）
//  · Target.getTargets（worker 计数）
// P0(新页进世界) → quit → menu → reenter×2（每相 GC 后 census）。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('Page.enable');
await cdp.send('DOM.enable');
await cdp.send('Runtime.enable');

await page.evaluateOnNewDocument(() => {
  const isDOM = (t) => {
    try { if (t === window) return true; if (t instanceof Node) return true; } catch { /* cross-realm */ }
    return false;
  };
  const live = new Map();   // key `${ctor}|${type}|${cap}` → {n, stacks:[]}
  const reg = new WeakMap(); // target → Set(key)
  const ctorOf = (t) => {
    try { const p = Object.getPrototypeOf(t); return (p && p.constructor && p.constructor.name) || 'unknown'; } catch { return 'unknown'; }
  };
  const origAdd = EventTarget.prototype.addEventListener;
  const origRem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    try {
      if (!isDOM(this) && typeof fn === 'function') {
        const cap = !!(opts && (opts === true || opts.capture));
        const key = `${ctorOf(this)}|${type}|${cap}`;
        let e = live.get(key);
        if (!e) { e = { n: 0, stacks: [] }; live.set(key, e); }
        e.n++;
        if (e.stacks.length < 3) {
          const st = new Error().stack ?? '';
          e.stacks.push(st.split('\n').slice(2, 6).join('\n').slice(0, 500));
        }
        let s = reg.get(this); if (!s) { s = new Set(); reg.set(this, s); }
        s.add(key);
      }
    } catch { /* 插桩中性 */ }
    return origAdd.call(this, type, fn, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    try {
      if (!isDOM(this) && typeof fn === 'function') {
        const cap = !!(opts && (opts === true || opts.capture));
        const key = `${ctorOf(this)}|${type}|${cap}`;
        const e = live.get(key);
        if (e) e.n--;
        const s = reg.get(this); if (s) s.delete(key);
      }
    } catch { /* 插桩中性 */ }
    return origRem.call(this, type, fn, opts);
  };
  (window).__swLsDump = () => {
    const out = [];
    for (const [k, v] of live) if (v.n > 0) out.push({ key: k, n: v.n, stack: v.stacks[0] });
    out.sort((a, b) => b.n - a.n);
    return out;
  };
});

const gc = async () => {
  await cdp.send('HeapProfiler.enable').catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
};

async function enterWorld() {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
}
async function quit() {
  await page.evaluate(() => window.__swFlow.quitToMenu());
  await page.waitForFunction(() => !window.__swGame, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1200));
}
async function reenter() {
  await page.waitForSelector('select', { timeout: 60000 });
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
}

async function metrics() {
  await cdp.send('Performance.enable').catch(() => {});
  const { metrics: ms } = await cdp.send('Performance.getMetrics');
  await cdp.send('Performance.disable').catch(() => {});
  const g = (n) => Math.round(ms.find((x) => x.name === n)?.value ?? -1);
  return { listeners: g('JSEventListeners'), nodes: g('DOMNodes'), jsHeap: g('JSHeapUsedSize'), docHeap: g('Documents') };
}
async function domCensus() {
  const out = {};
  for (const [name, expr] of [['window', 'window'], ['document', 'document'], ['body', 'document.body']]) {
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: expr });
      const l = await cdp.send('DOMDebugger.getEventListeners', { objectId: r.result.objectId });
      const byType = {};
      for (const li of l.listeners) byType[li.type] = (byType[li.type] ?? 0) + 1;
      out[name] = byType;
    } catch { out[name] = { err: -1 }; }
  }
  return out;
}
async function targetCensus() {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const byType = {};
  for (const t of targetInfos) byType[t.type] = (byType[t.type] ?? 0) + 1;
  return byType;
}
async function layerDump() {
  await cdp.send('LayerTree.disable').catch(() => {});
  await cdp.send('LayerTree.enable').catch(() => {});
  const layers = await new Promise((res) => {
    const done = setTimeout(() => res(null), 3000);
    cdp.once('LayerTree.layerTreeDidChange', (e) => { clearTimeout(done); res(e.layers ?? []); });
  });
  try { await cdp.send('LayerTree.disable'); } catch { /* ignore */ }
  if (!layers) return { count: -1, list: [] };
  const list = [];
  for (const L of layers) {
    const item = {
      id: L.layerId, back: L.backendNodeId ?? 0,
      w: L.bounds?.width ?? 0, h: L.bounds?.height ?? 0,
      x: L.bounds?.x ?? 0, y: L.bounds?.y ?? 0, paint: L.paintCount ?? 0,
    };
    if (L.backendNodeId) {
      try {
        const { nodeId } = await cdp.send('DOM.pushNodeByBackendNodeIdToFrontend', { backendNodeId: L.backendNodeId });
        const { node } = await cdp.send('DOM.describeNode', { nodeId, depth: 0 });
        item.node = `${node.nodeName}${node.attributes ? '[' + node.attributes.join(' ').slice(0, 120) + ']' : ''}`;
      } catch { item.node = '(gone)'; }
    }
    list.push(item);
  }
  return { count: layers.length, list };
}

async function census(label) {
  await gc();
  const m = await metrics();
  const ls = await page.evaluate(() => (window).__swLsDump ? (window).__swLsDump() : null);
  const dc = await domCensus();
  const tg = await targetCensus();
  const ld = await layerDump();
  const canvases = await page.evaluate(() => {
    const arr = [...document.querySelectorAll('canvas')];
    return arr.map((c) => `${c.width}x${c.height}:${c.id || c.className || c.parentElement?.id || 'anon'}${c.isConnected ? '' : '(detached)'}`);
  });
  const wc = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => {
    const s = getComputedStyle(e);
    return s.willChange && s.willChange !== 'auto';
  }).map((e) => `${e.tagName}.${(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className) || ''}#${e.id || ''} wc=${e.style.willChange} [${e.offsetWidth}x${e.offsetHeight}] conn=${e.isConnected}`));
  console.log(`\n===== ${label} ===== listeners=${m.listeners} nodes=${m.nodes} layers=${ld.count} targets=${JSON.stringify(tg)}`);
  console.log(' canvases:', JSON.stringify(canvases));
  console.log(' willChange:', JSON.stringify(wc));
  console.log(' win:', JSON.stringify(dc.window));
  console.log(' doc:', JSON.stringify(dc.document));
  console.log(' body:', JSON.stringify(dc.body));
  if (ls && ls.length) {
    console.log(` 非 DOM EventTarget 活监听 ${ls.length} 键:`);
    for (const e of ls.slice(0, 14)) {
      console.log(`   ×${e.n} ${e.key}`);
      if (e.stack) console.log('      ' + e.stack.split('\n').join('\n      ').slice(0, 460));
    }
  } else console.log(' 非 DOM EventTarget 活监听: 0（或插桩丢失——页面已重载后为全新 registry）');
  if (ld.list.length) {
    const big = ld.list.filter((l) => l.w > 100 && l.h > 100);
    console.log(` 层(${ld.list.length}): ` + big.map((l) => `#${l.id} ${l.w}x${l.h}@${l.x},${l.y} paint=${l.paint} back=${l.back} ${l.node ?? ''}`).join(' | '));
  }
  return { listeners: m.listeners, layers: ld.count };
}

await enterWorld();
await census('P0 fresh world');
await quit();
await census('M1 menu after quit');
await reenter();
await census('P1 world reenter1');
await quit();
await census('M2 menu after quit2');
await reenter();
await census('P2 world reenter2');
await browser.close();
process.exit(0);
