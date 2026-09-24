import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 590000,
  userDataDir: '/tmp/bj319t-' + (Date.now() % 100000),
  args: ['--no-sandbox', '--no-proxy-server'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('Performance.enable').catch(() => {});
const gc = async () => {
  await cdp.send('HeapProfiler.enable').catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
};
const total = async () => {
  const m = await cdp.send('Performance.getMetrics');
  return Math.round(m.metrics.find((x) => x.name === 'JSEventListeners')?.value ?? -1);
};
const targetCounts = async () => {
  const out = {};
  for (const [name, expr] of [['window', 'window'], ['document', 'document'], ['body', 'document.body']]) {
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: expr });
      const l = await cdp.send('DOMDebugger.getEventListeners', { objectId: r.result.objectId });
      out[name] = l.listeners.length;
    } catch { out[name] = -1; }
  }
  // body 后代节点监听器采样：遍历 body 全树
  try {
    const doc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    let cnt = 0; const byType = {};
    const walk = (n) => {
      if (n.nodeName !== '#document' && n.nodeName !== '#documentType') {
        // 逐节点查太慢——仅统计有监听器的（getEventListeners 逐节点太贵,改为统计节点数）
      }
      for (const c of (n.children ?? [])) walk(c);
      for (const c of (n.shadowRoots ?? [])) walk(c);
    };
    walk(doc.root);
    out.domNodeCount = JSON.stringify(doc).length > 0 ? 'see total' : 0;
  } catch { /* skip */ }
  return out;
};
const enterWorld = async () => {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
};
await enterWorld(); await gc();
console.log('P0   total=', await total(), 'targets=', JSON.stringify(await targetCounts()));
for (let i = 1; i <= 2; i++) {
  await page.evaluate(() => window.__swFlow.quitToMenu());
  await page.waitForFunction(() => !window.__swGame, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 800));
  await gc();
  console.log(`quit#${i} total=`, await total(), 'targets=', JSON.stringify(await targetCounts()));
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
  await gc();
  console.log(`reenter#${i} total=`, await total());
}
await browser.close();
process.exit(0);
