// 一次性:血月暗化隔离——四态矩阵量化: {fullbright × 滤镜开关} 世界层/滤镜层各自贡献
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
await sleep(3000);
const lum = () => p.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('.sw-root canvas');
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, Math.min(cv.height, 430)).data;
  let rr = 0, gg = 0, bb = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
  return [Math.round(rr / n), Math.round(gg / n), Math.round(bb / n)];
});
// 钉血月滤镜强度=0 的开关(每帧重写防链路回写)
const setKill = (on) => p.evaluate((on) => {
  const r = window.__swGame.renderer;
  if (on) {
    r.__kill = setInterval(() => {
      if (r.monoFilters) r.monoFilters.bloodMoonUseOpacity = 0;
    }, 30);
  } else if (r.__kill) { clearInterval(r.__kill); r.__kill = null; }
}, on);
const setFb = (on) => p.evaluate((on) => { window.__swGame.renderer.fullbright = on; }, on);

await setKill(false); await setFb(false);
await sleep(600);
const normal = await lum();
await setFb(true);
await sleep(600);
const fbOnly = await lum();          // 开灯+滤镜
await setKill(true);
await sleep(800);
const fbNoFilter = await lum();      // 开灯+无滤镜 = 世界层本底
await setFb(false);
await sleep(800);
const noFbNoFilter = await lum();    // 正常光照+无滤镜 = 血月环境光本底
console.log('normal(滤镜+无灯):', JSON.stringify(normal));
console.log('fullbright+滤镜  :', JSON.stringify(fbOnly));
console.log('fullbright+无滤镜:', JSON.stringify(fbNoFilter));
console.log('无灯+无滤镜      :', JSON.stringify(noFbNoFilter));
await p.screenshot({ path: `${OUT}/bm-fb-nofilter.png` });
await setKill(false);
await b.close();
console.log('DONE');
