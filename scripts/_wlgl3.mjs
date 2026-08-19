import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wlgl3',
  args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  window.__swGame.player.x = 383 * 16; window.__swGame.player.y = 228 * 16;
  window.__swGame.player.debugGod = true;
  const c = window.__swGame.world.clock; if (c) c.timeOfDay = 0.4;
});
await new Promise((r) => setTimeout(r, 3000));
const st = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  const wl = r.worldLight;
  if (!wl || !wl.gl) return { err: 'no gl' };
  const gl = wl.gl;
  const W = wl.canvas.width, H = wl.canvas.height;
  const read = (x, y) => {
    const b = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
    return [b[0], b[1], b[2], b[3]];
  };
  // 同一世界点:GL 坐标系 y 与 canvas 反(readPixels y=0 = 缓冲区底行)
  const sx = 627, syCanvas = 456;
  return {
    size: [W, H],
    atCanvasY: read(sx, H - syCanvas),      // 读 canvas 语义 (627,456)
    atMirrorY: read(sx, syCanvas),          // 读镜像点 (627,344)
    top: read(640, H - 10), bot: read(640, 10),
  };
});
console.log(JSON.stringify(st));
await browser.close();
