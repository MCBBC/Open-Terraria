// 探针场景精确复刻 + mock 拦截,插桩 bySheet
import puppeteer from 'puppeteer-core';
const { PNG } = await import('pngjs');
const mockPng = new PNG({ width: 1024, height: 1024 });
for (let i = 0; i < mockPng.data.length; i += 4) { mockPng.data[i]=160; mockPng.data[i+1]=60; mockPng.data[i+2]=220; mockPng.data[i+3]=255; }
const PNG_B64 = PNG.sync.write(mockPng).toString('base64');
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'warning') console.log('WARN:', m.text().slice(0, 150)); });
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('/v1/images/edits')) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' };
    if (req.method() === 'OPTIONS') req.respond({ status: 204, headers: cors });
    else req.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ data: [{ b64_json: PNG_B64 }] }) });
  } else req.continue();
});
await page.goto(`${ORIGIN}/remaster.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__remasterBridge?.curEntry(), { timeout: 30000 });
const diag = await page.evaluate(async () => {
  const b = window.__remasterBridge;
  const dirt = b.catalog.byKey.get('tile:0');
  b.selectEntry(dirt);
  await new Promise((r) => setTimeout(r, 600));
  const nxt = b.gotoNextTodo();
  b.selectEntry(nxt || dirt);
  await new Promise((r) => setTimeout(r, 800));
  const cur = b.curEntry(); const fi = b.curFrameIdx();
  await b.remaster();
  await new Promise((r) => setTimeout(r, 2500));
  await b.accept();
  // 复刻收集逻辑
  const p = b.state.progress[cur.key];
  const hasFrameRec = cur.frames.some((f) => p.frames[f.frameIdx] !== undefined);
  const collected = hasFrameRec || p.frames[-1] !== undefined;
  const r = await b.exportPack();
  return { cur: cur.key, fi, status: p.frames[fi]?.status, hasFrameRec, wholeRec: !!p.frames[-1], collected, result: r };
});
console.log('DIAG:', JSON.stringify(diag));
await browser.close();
process.exit(0);
