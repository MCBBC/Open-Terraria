// 在线路径解剖:worldCanvas 在地面点的直读值 vs 主画布合成值;?wgl=0 三步回退对照
import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
async function probe(qs) {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', userDataDir: `/Users/vinlic/.claude/jobs/8405c930/tmp/wlgl2${qs}`,
    args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
  await page.goto(B + '/' + qs, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
  await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
  await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.x = 383 * 16; g.player.y = 228 * 16; g.player.debugGod = true;
    const c = g.world.clock; if (c) c.timeOfDay = 0.4;
  });
  await new Promise((r) => setTimeout(r, 3000));
  const st = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer;
    const z = g.camera.zoom, W = r.canvas.width, H = r.canvas.height;
    const st = g.world.store;
    let gy = 230; while (gy < 300 && !st.isSolid(383, gy)) gy++;
    const sx = Math.round((383 * 16 - g.camera.x) * z + W / 2);
    const sy = Math.round((gy * 16 + 24 - g.camera.y) * z + H / 2);
    const px = (c2, x, y) => { const d = c2.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
    const wc = r.worldCanvas?.getContext('2d');
    const gl = r.worldLight;
    return {
      qs: location.search, gy, sx, sy,
      main: px(r.ctx, sx, sy),
      layer: wc ? px(wc, sx, sy) : null,
      glAlive: !!gl && !gl.diedAt && !gl.unavailable,
    };
  });
  console.log(JSON.stringify(st));
  await browser.close();
}
await probe('');
await probe('?wgl=0');
await probe('?worldlayer=0');
