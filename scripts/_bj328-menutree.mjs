// ★BJ328：菜单态 DOM 结构差分——找出每轮 +9 节点/+900 监听器的连接树残留身份。
// M1(1轮退世界后菜单) vs M2(2轮) vs M3：dump body 子树每元素 {路径, id, class, 监听数估算(经 window.__swLsTouch 插桩的 target 活量)}
// 加轻量 addEventListener 插桩（只记 target→count 到 WeakMap 不可,要枚举——用 Map 但 dump 完即弃;
// 每相 dump 完清空 registry 防自留）。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });

await page.evaluateOnNewDocument(() => {
  // 轻量插桩：只计数,Map 持 target——每次 dump 后清空（防插桩自留）
  const reg = new Map();
  const desc = (t) => {
    try {
      if (t === window) return 'window';
      if (t === document) return 'document';
      if (t instanceof Node) {
        const tag = t.tagName ?? t.nodeName ?? '?';
        const id = t.id ? '#' + t.id : '';
        const cls = typeof t.className === 'string' && t.className ? '.' + t.className.split(' ').slice(0, 2).join('.') : '';
        return `${tag}${id}${cls}${t.isConnected ? '' : '(DET)'}`;
      }
      const p = Object.getPrototypeOf(t);
      return `${(p && p.constructor && p.constructor.name) || '?'}(nonDOM)`;
    } catch { return '?'; }
  };
  const origAdd = EventTarget.prototype.addEventListener;
  const origRem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn) {
    try {
      if (typeof fn === 'function') {
        let e = reg.get(this);
        if (!e) { e = { n: 0, d: desc(this), types: {} }; reg.set(this, e); }
        e.n++; e.types[type] = (e.types[type] ?? 0) + 1;
      }
    } catch { /* 中立 */ }
    return origAdd.call(this, type, fn);
  };
  EventTarget.prototype.removeEventListener = function (type, fn) {
    try { const e = reg.get(this); if (e) { e.n--; if (e.n <= 0) reg.delete(this); } } catch { /* 中立 */ }
    return origRem.call(this, type, fn);
  };
  (window).__swDumpLS = () => {
    const rows = [];
    for (const [, e] of reg) if (e.n > 0) rows.push({ n: e.n, d: e.d, types: e.types });
    reg.clear();   // ★防插桩自留（Map 引用清掉,GC 可回收 target）
    rows.sort((a, b) => b.n - a.n);
    return rows;
  };
});

const gc = async () => {
  const cdp = await page.createCDPSession();
  await cdp.send('HeapProfiler.enable').catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  await cdp.detach().catch(() => {});
};

async function poll(expr, timeoutMs = 300000) {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = await page.evaluate(expr); } catch { /* 导航窗 */ }
    if (v) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}
const WORLD_READY = () => !!(window).__swGame && !!(window).__swGame.world && !!(window).__swGame.liquid;

async function enterWorld() {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  if (!await poll(WORLD_READY)) throw new Error('enter 超时');
  await new Promise((r) => setTimeout(r, 2500));
}
async function quit() {
  await page.evaluate(() => window.__swFlow.quitToMenu());
  if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
  await new Promise((r) => setTimeout(r, 1500));
}
async function reenter() {
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  if (!await poll(WORLD_READY)) throw new Error('reenter 超时');
  await new Promise((r) => setTimeout(r, 2500));
}

/** 菜单 DOM 结构 dump：body 下每元素一行（路径缩进 + id/class + 文本摘要） */
async function dumpTree(label) {
  const lines = await page.evaluate(() => {
    const out = [];
    const walk = (el, depth) => {
      if (depth > 8 || out.length > 400) return;
      const tag = el.tagName;
      const id = el.id ? '#' + el.id : '';
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      const txt = el.childElementCount === 0 ? JSON.stringify((el.textContent ?? '').trim().slice(0, 30)) : '';
      const style = el.style ? el.style.cssText.slice(0, 80) : '';
      out.push(`${'  '.repeat(depth)}${tag}${id}${cls} ${txt} ${style ? '{' + style + '}' : ''}`);
      for (const c of el.children) walk(c, depth + 1);
    };
    walk(document.body, 0);
    return out;
  });
  console.log(`\n===== ${label} tree (${lines.length} 行) =====`);
  for (const l of lines.slice(0, 120)) console.log(' ' + l);
}

/** 监听器插桩 dump（top30） */
async function dumpLS(label) {
  await gc();
  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable').catch(() => {});
  const { metrics } = await cdp.send('Performance.getMetrics');
  await cdp.send('Performance.disable').catch(() => {});
  await cdp.detach().catch(() => {});
  const total = Math.round(metrics.find((x) => x.name === 'JSEventListeners')?.value ?? -1);
  const rows = await page.evaluate(() => (window).__swDumpLS());
  const agg = new Map();
  for (const r of rows) {
    const k = `${r.d} ${Object.keys(r.types).sort().join(',')}`;
    agg.set(k, (agg.get(k) ?? 0) + r.n);
  }
  console.log(`\n===== ${label} ===== metric.listeners=${total} 插桩total=${rows.reduce((s, r) => s + r.n, 0)}`);
  for (const [k, n] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) console.log(`   ×${n} ${k}`);
}

await enterWorld();
await dumpLS('P0 world');
await quit();
await dumpLS('M1 menu'); await dumpTree('M1');
await reenter();
await dumpLS('P1 world');
await quit();
await dumpLS('M2 menu'); await dumpTree('M2');
await reenter();
await quit();
await dumpLS('M3 menu'); await dumpTree('M3');
await browser.close();
process.exit(0);
