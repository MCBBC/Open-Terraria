// 一次性:血月月相矩阵——phase 0/3/4/5 同时刻月亮区裁片,验证黑盘=原版贴图语义
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NT = 7782;   // 与用户截图月亮位置同时刻(ft≈0.24,左上升段)
for (const ph of [0, 3, 4, 5]) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
  const p = await b.newPage();
  await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
  await p.evaluate((ph) => {
    const g = window.__swGame;
    g.world.clock.timeOfDay = 0.8125 + (7782 / 32400) * 0.375;
    g.world.clock.moonPhase = ph;
    g.world.clock.bloodMoon = true;
    const pl = g.player;
    pl.x = g.world.store.w * 16 / 2;
    pl.vx = 0;
  }, ph);
  await sleep(2500);
  const info = await p.evaluate(() => {
    const sky = window.__swGame.renderer.sky;
    const cv = window.__swGame.renderer.canvas;
    const ctx = cv.getContext('2d');
    const m = sky.moonScreen;
    if (!m) return { moon: null };
    const d = ctx.getImageData(Math.max(0, Math.round(m.x) - 3), Math.max(0, Math.round(m.y) - 3), 7, 7).data;
    let r = 0, gg = 0, bb = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; }
    return { moon: { x: Math.round(m.x), y: Math.round(m.y) }, centerPx: [Math.round(r / 49), Math.round(gg / 49), Math.round(bb / 49)] };
  });
  // 裁月亮区放大存证
  const clip = await p.evaluate(() => {
    const m = window.__swGame.renderer.sky.moonScreen;
    return m ? { x: Math.max(0, m.x - 60), y: Math.max(0, m.y - 60), width: 120, height: 120 } : null;
  });
  if (clip) await p.screenshot({ path: `${OUT}/bm-phase-${ph}.png`, clip });
  console.log(`phase ${ph}:`, JSON.stringify(info));
  await b.close();
}
console.log('DONE →', OUT);
