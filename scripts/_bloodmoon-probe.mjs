// 一次性:血月画面过暗取证——午夜血月截图+渲染链各层值(cots/滤镜路径/opacity/光种子)
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
  g.world.clock.timeOfDay = 0.8125 + (16200 / 32400) * 0.375 - 0.0005;   // 午夜
  g.world.clock.moonPhase = 0;
  g.world.clock.bloodMoon = true;
  const pl = g.player;
  pl.x = g.world.store.w * 16 / 2;
  pl.vx = 0;
});
await sleep(4000);
const st = await p.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  const mono = r.monoFilters;
  return {
    bloodMoon: g.world.clock.bloodMoon,
    cots: r.colorOfTheSkies.map((v) => Math.round(v)),
    skyCots: sky.cots ? sky.cots.map((v) => Math.round(v)) : null,
    screenFxEnabled: r.screenFxEnabled,
    cpuRender: r.isCpuRender ? !!r.isCpuRender() : null,
    screenFx: r.screenFx ? { unavailable: !!r.screenFx.unavailable, diedAt: !!r.screenFx.diedAt } : null,
    bloodMoonUseOpacity: mono ? +mono.bloodMoonUseOpacity.toFixed(3) : null,
    bloodMoonInUse: mono ? mono.filtersInUse?.has?.('BloodMoon') ?? 'n/a' : null,
    anyInUse: mono ? mono.anyInUse : null,
    // 光种子/环境光(地表一点)
    lightSample: (() => {
      try {
        const w = g.world.store.w, h = 0;
        return null; // 光照引擎内部态不便直读,以截图量化代替
      } catch (e) { return 'ERR'; }
    })(),
    fullbright: !!r.fullbright
  };
});
await p.screenshot({ path: `${OUT}/bloodmoon-midnight.png` });
console.log('BLOODMOON:', JSON.stringify(st));
// 亮度量化:全屏均值
const lum = await p.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('.sw-root canvas');
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, Math.min(cv.height, 430)).data;
  let rr = 0, gg = 0, bb = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
  return { r: Math.round(rr / n), g: Math.round(gg / n), b: Math.round(bb / n), n };
});
console.log('LUM(上屏):', JSON.stringify(lum));
// F9 开灯对照(找 Game 侧键处理直接置 fullbright)
const fb = await p.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  if ('fullbright' in r) r.fullbright = true;
  return { fullbright: !!r.fullbright };
});
await sleep(400);
await p.screenshot({ path: `${OUT}/bloodmoon-fullbright.png` });
const lum2 = await p.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('.sw-root canvas');
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, Math.min(cv.height, 430)).data;
  let rr = 0, gg = 0, bb = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
  return { r: Math.round(rr / n), g: Math.round(gg / n), b: Math.round(bb / n) };
});
console.log('FULLBRIGHT_LUM:', JSON.stringify(lum2), JSON.stringify(fb));
await b.close();
console.log('DONE →', OUT);
