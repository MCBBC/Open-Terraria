// 一次性:守卫批烟测——游戏内昼/夜两帧截图+GL 层状态,确认 texFromImage 总闸无回归
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await p.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  const pl = g.player;
  pl.x = g.world.store.w * 16 / 2;
  pl.vx = 0;
});
await sleep(3500);
await p.screenshot({ path: `${OUT}/smoke-noon.png` });
const st = await p.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  return {
    gl: sky.cloudGlLayer ? { unavailable: !!sky.cloudGlLayer.unavailable, cloudFxOK: !!sky.cloudGlLayer.cloudFxOK, texN: sky.cloudGlLayer.texs ? sky.cloudGlLayer.texs.size : -1 } : null,
    cel: sky.cloudCelestial ? +sky.cloudCelestial.intensity.toFixed(3) : null,
    bgStyle: g.renderer.biomeBg ? g.renderer.biomeBg.bgStyle : undefined
  };
});
console.log('NOON:', JSON.stringify(st));
// 夜帧（GL 纹理缓存跨昼夜复用,验证不炸）
await p.evaluate(() => { window.__swGame.world.clock.timeOfDay = 0.99; });
await sleep(2000);
await p.screenshot({ path: `${OUT}/smoke-night.png` });
console.log('DONE');
await b.close();
