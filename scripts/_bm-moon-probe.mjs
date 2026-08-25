// 一次性:血月月亮取证——月亮屏位+该位置像素+月色计算链
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await p.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.8125 + (16200 / 32400) * 0.375 - 0.0005;
  g.world.clock.moonPhase = 0;
  g.world.clock.bloodMoon = true;
  const pl = g.player;
  pl.x = g.world.store.w * 16 / 2;
  pl.vx = 0;
});
await sleep(3500);
const st = await p.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const cv = g.renderer.canvas ?? document.querySelector('.sw-root canvas');
  const ctx = cv.getContext('2d');
  const moon = sky.moonScreen;
  let moonPx = null, aroundPx = null;
  if (moon) {
    const d = ctx.getImageData(Math.max(0, Math.round(moon.x) - 2), Math.max(0, Math.round(moon.y) - 2), 5, 5).data;
    let r = 0, gg = 0, bb = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; }
    moonPx = [Math.round(r / 25), Math.round(gg / 25), Math.round(bb / 25)];
    const d2 = ctx.getImageData(Math.max(0, Math.round(moon.x) - 60), Math.max(0, Math.round(moon.y)), 20, 10).data;
    let r2 = 0, g2 = 0, b2 = 0;
    for (let i = 0; i < d2.length; i += 4) { r2 += d2[i]; g2 += d2[i + 1]; b2 += d2[i + 2]; }
    aroundPx = [Math.round(r2 / 200), Math.round(g2 / 200), Math.round(b2 / 200)];
  }
  return {
    moonScreen: moon,
    moonPx, aroundPx,
    moonEventKind: sky.fx ? sky.fx.moonEventKind : null,
    moonType: sky.moonType,
    // 月亮绘制色(页内直接调纯函数如果可及)
    cots: g.renderer.colorOfTheSkies.map((v) => Math.round(v))
  };
});
console.log('BM_MOON:', JSON.stringify(st));
await b.close();
console.log('DONE');
