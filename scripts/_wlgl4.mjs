import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wlgl4',
  args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));
const st = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const wl = r.worldLight;
  if (!wl) return { err: 'no wl' };
  const gl = wl.gl;
  const read = (x, y) => {
    const b = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
    return [b[0], b[1], b[2], b[3]];
  };
  // 隔离测试:满屏光照矩形 + 已就位的 worldCanvas
  const ok = wl.composite(r.worldCanvas, r.lightCanvas, [0, 0, 1280, 800]);
  const err = gl.getError();
  return {
    ok, glErr: err,
    ground: read(627, 800 - 456),
    groundMirror: read(627, 456),
    center: read(640, 400),
    layerAtGround: (() => {
      const w = r.worldCanvas.getContext('2d');
      const d = w.getImageData(627, 456, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    })(),
    lightSize: [r.lightCanvas.width, r.lightCanvas.height],
  };
});
console.log(JSON.stringify(st));
await browser.close();
