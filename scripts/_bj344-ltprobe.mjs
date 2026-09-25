import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
await page.goto('about:blank');
const cdp = await page.createCDPSession();
const { product } = await cdp.send('Browser.getVersion');
console.log('browser:', product);
for (const m of ['LayerTree.getLayerTree', 'LayerTree.loadSnapshot', 'LayerTree.makeSnapshot', 'LayerTree.profileSnapshot', 'Overlay.enable', 'Tracing.start']) {
  try { await cdp.send(m.startsWith('Tracing') ? 'Tracing.enable' : m, m.includes('Snapshot') ? { snapshotId: 'x' } : {}); console.log('OK  ', m); }
  catch (e) { console.log('FAIL', m, '—', String(e.message).slice(0, 60)); }
}
await browser.close();
