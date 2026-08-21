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
console.log('S1 ready');
const d1 = await page.evaluate(async () => {
  const b = window.__remasterBridge;
  const nxt = b.gotoNextTodo();
  b.selectEntry(nxt);
  await new Promise((r) => setTimeout(r, 800));
  return { cur: b.curEntry().key, fi: b.curFrameIdx(), whole: b.wholeMode() };
});
console.log('S2', JSON.stringify(d1));
const d2 = await page.evaluate(async () => {
  const b = window.__remasterBridge;
  await b.remaster();
  return 'enq';
});
console.log('S3', d2);
await page.waitForFunction(() => {
  const b = window.__remasterBridge;
  return b.state.frame(b.curEntry(), b.curFrameIdx()).status === 'pending';
}, { timeout: 15000 }).then(() => console.log('S4 pending')).catch(() => console.log('S4 TIMEOUT'));
const d3 = await page.evaluate(async () => {
  const b = window.__remasterBridge;
  await b.accept();
  const cur = b.curEntry();
  const p = b.state.progress[cur.key];
  const hasFrameRec = cur.frames.some((f) => p.frames[f.frameIdx] !== undefined);
  const collected = hasFrameRec || p.frames[-1] !== undefined;
  const r = await Promise.race([b.exportPack(), new Promise((res) => setTimeout(() => res('T/O'), 20000))]);
  return { collected, wholeRec: !!p.frames[-1], r };
});
console.log('S5', JSON.stringify(d3));
await browser.close();
process.exit(0);
