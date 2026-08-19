import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wlgl',
  args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (t.includes('GLWorldLight')) console.log('[console]', t); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));
const st = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const wl = r.worldLight;
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  return {
    wlExists: !!wl, unavailable: wl?.unavailable, diedAt: wl?.diedAt ?? 0,
    enabled: r.worldLightEnabled, retryAt: r.worldLightRetryAt,
    glInBrowser: !!gl, glVer: gl ? gl.getParameter(gl.VERSION) : null,
    worldLayerActive: r.worldLayerActive, worldCanvasSize: r.worldCanvas ? [r.worldCanvas.width, r.worldCanvas.height] : null,
  };
});
console.log(JSON.stringify(st, null, 1));
await browser.close();
