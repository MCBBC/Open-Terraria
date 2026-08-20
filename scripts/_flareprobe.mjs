// 耀斑贴图健康探针:验证 Misc_Sunflare_Lens_* 贴图加载与尺寸+耀斑像素采样
import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/flareprobe',
  args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 383 * 16; g.player.y = 228 * 16; g.player.debugGod = true;
  g.world.clock.timeOfDay = 0.275;
});
await new Promise((r) => setTimeout(r, 3500));
const result = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const sky = r.sky;
  const texStatus = {};
  for (const [key, tex] of Object.entries(sky.sunflareTex)) {
    texStatus[key] = tex ? { w: tex.width, h: tex.height, complete: tex.complete } : null;
  }
  const W = r.canvas.width, H = r.canvas.height, ctx = r.ctx;
  const sun = sky.sunScreen;
  if (!sun) return { texStatus, error: 'no sunScreen' };
  const cx2 = W / 2, cy2 = H / 2;
  const samples = [];
  for (let t = 0; t <= 1; t += 0.15) {
    const px = Math.round(sun.x + (cx2 - sun.x) * t * 2);
    const py = Math.round(sun.y + (cy2 - sun.y) * t * 2);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;
    const d = ctx.getImageData(px, py, 1, 1).data;
    samples.push({ t: t.toFixed(2), x: px, y: py, r: d[0], g: d[1], b: d[2], a: d[3] });
  }
  return { texStatus, samples };
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
