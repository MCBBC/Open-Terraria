// ★BJ328 v2：监听器全量按 target 定位（DOM+非 DOM 都记），加 CDP 连接树逐节点监听 walk。
//  · addEventListener 插桩：WeakMap target→{n, stack}；dump top30（DOM 节点给身份+isConnected）
//  · CDP: 对 body 全树逐节点 DOMDebugger.getEventListeners → 聚合 top 节点
//  · 菜单态 vs 世界态 各 census；P0 → quit M1 → reenter P1 → quit M2 → reenter P2 → quit M3
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('DOM.enable');
await cdp.send('Runtime.enable');

await page.evaluateOnNewDocument(() => {
  const isWin = (t) => t === window;
  const isNode = (t) => { try { return t instanceof Node; } catch { return false; } };
  const live = new Map();   // target → {n, stack, ctor, types:Set}
  const ctorOf = (t) => { try { const p = Object.getPrototypeOf(t); return (p && p.constructor && p.constructor.name) || '?'; } catch { return '?'; } };
  const descOf = (t) => {
    try {
      if (isWin(t)) return 'window';
      if (t === document) return 'document';
      if (isNode(t)) {
        const el = t;
        const tag = el.tagName ?? el.nodeName ?? '?';
        const id = el.id ? '#' + el.id : '';
        const cls = typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').slice(0, 2).join('.') : '';
        return `${tag}${id}${cls}${el.isConnected ? '' : '(DETACHED)'}`;
      }
      return `${ctorOf(t)}(nonDOM)`;
    } catch { return '?'; }
  };
  const origAdd = EventTarget.prototype.addEventListener;
  const origRem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    try {
      if (typeof fn === 'function') {
        let e = live.get(this);
        if (!e) { e = { n: 0, stack: '', ctor: ctorOf(this), types: new Set(), desc: descOf(this) }; live.set(this, e); }
        e.n++; e.types.add(type);
        if (!e.stack && (isWin(this) || isNode(this) || !isNode(this))) {
          e.stack = (new Error().stack ?? '').split('\n').slice(2, 5).join('\n').slice(0, 400);
        }
      }
    } catch { /* 插桩中性 */ }
    return origAdd.call(this, type, fn, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    try {
      const e = live.get(this);
      if (e && typeof fn === 'function') { e.n--; if (e.n <= 0) live.delete(this); }
    } catch { /* 插桩中性 */ }
    return origRem.call(this, type, fn, opts);
  };
  (window).__swLsTop = (minN) => {
    const rows = [];
    let total = 0, dom = 0, nonDom = 0, detached = 0;
    for (const [t, e] of live) {
      if (e.n <= 0) continue;
      total += e.n;
      if (isWin(t) || isNode(t)) {
        dom += e.n;
        if (isNode(t) && !t.isConnected) detached += e.n;
      } else nonDom += e.n;
      rows.push({ n: e.n, desc: descOf(t), ctor: e.ctor, types: [...e.types].slice(0, 8).join(','), stack: e.stack });
    }
    rows.sort((a, b) => b.n - a.n);
    return { total, dom, nonDom, detached, top: rows.filter((r) => r.n >= (minN ?? 4)).slice(0, 30) };
  };
});

const gc = async () => {
  await cdp.send('HeapProfiler.enable').catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 350));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 350));
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
  await new Promise((r) => setTimeout(r, 1500));
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
  return { listeners: g('JSEventListeners'), nodes: g('Nodes') };
}
/** CDP 连接树逐节点监听统计（body/documentElement 全树） */
async function treeWalk() {
  const agg = [];
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const stack = [root];
    let seen = 0;
    while (stack.length && seen < 4000) {
      const n = stack.pop();
      seen++;
      for (const c of (n.children ?? [])) stack.push(c);
      for (const c of (n.shadowRoots ?? [])) stack.push(c);
      if (n.nodeName.startsWith('#')) continue;
      try {
        const l = await cdp.send('DOMDebugger.getEventListeners', { objectId: undefined, nodeId: n.nodeId });
        if (l.listeners.length) {
          const byType = {};
          for (const li of l.listeners) byType[li.type] = (byType[li.type] ?? 0) + 1;
          agg.push({ node: `${n.nodeName}${(n.attributes ?? []).length ? '[' + n.attributes.slice(0, 6).join(' ').slice(0, 90) + ']' : ''}`, n: l.listeners.length, byType });
        }
      } catch { /* node gone */ }
    }
    agg.sort((a, b) => b.n - a.n);
  } catch { /* ignore */ }
  return agg;
}

async function census(label) {
  await gc();
  const m = await metrics();
  const ls = await page.evaluate(() => (window).__swLsTop ? (window).__swLsTop(4) : null);
  const tw = await treeWalk();
  const twTotal = tw.reduce((s, r) => s + r.n, 0);
  console.log(`\n===== ${label} ===== metric.listeners=${m.listeners} metric.nodes=${m.nodes}`);
  if (ls) {
    console.log(` 插桩 addEventListener 活量: total=${ls.total} dom(连接+游离)=${ls.dom}(游离=${ls.detached}) 非DOM=${ls.nonDom}`);
    for (const r of ls.top.slice(0, 18)) {
      console.log(`   ×${r.n} ${r.desc} [${r.types}]`);
      if (r.n >= 20 && r.stack) console.log('      ' + r.stack.split('\n').join('\n      ').slice(0, 400));
    }
  }
  console.log(` CDP 连接树监听总量=${twTotal}（节点数=${tw.length}）top:`);
  for (const r of tw.slice(0, 12)) console.log(`   ×${r.n} ${r.node} ${JSON.stringify(r.byType).slice(0, 160)}`);
}

await enterWorld();
await census('P0 fresh world');
await quit();
await census('M1 menu');
await reenter();
await census('P1 world');
await quit();
await census('M2 menu');
await reenter();
await census('P2 world');
await quit();
await census('M3 menu');
await browser.close();
process.exit(0);
