// GGGG 卡点定位：generateWorld 逐 pass 进度日志（含耗时），定位级联引入的挂起
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text().slice(0, 200)));
page.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const t0 = performance.now();
  const log = (s) => console.log(`${((performance.now() - t0) / 1000).toFixed(1)}s ${s}`);
  log('imported, generateWorld start');
  try {
    await mod.generateWorld({
      width: 4200, height: 1200, seedText: '12345', name: 'hang',
      onProgress: (label, p) => log(`${(p * 100).toFixed(0)}% ${label}`),
    });
    log('DONE');
  } catch (e) {
    log('THROW: ' + String(e?.message ?? e).slice(0, 300));
  }
});
await browser.close();
