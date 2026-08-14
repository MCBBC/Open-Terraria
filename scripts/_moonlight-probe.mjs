// 月光实证探针:夜半露天光值(引擎种子+渲染像素) + 月相调制 + 天空月亮可见
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  // 纯函数实测:skySeed 各相位夜半
  const { skySeed } = await import('/src/lighting/SkyColor.ts');
  const seeds = [];
  for (let ph = 0; ph < 8; ph++) seeds.push(skySeed(0, 1, false, false, ph).map((v) => (v * 255).toFixed(1)).join(','));
  // 引擎实测:切夜半(满月=day1),测玩家上方露天格 lightAt
  const result = { seeds, moonPhaseField: w.clock.moonPhase, dayCount: w.clock.dayCount };
  const sample = (tag) => {
    const st = w.store;
    const ptx = Math.floor(g.player.cx / 16);
    let ty = Math.floor(g.player.cy / 16);
    while (ty > 2 && (st.flags[st.idx(ptx, ty)] || st.wall[st.idx(ptx, ty)] !== 0)) ty--;
    const light = g.lighting ? g.lighting.lightAt(ptx, ty) : [255, 255, 255];
    result[tag] = { tile: [ptx, ty], light: light.map((v) => Math.round(v)) };
    return result[tag];
  };
  // 白天基线
  w.clock.timeOfDay = 0.5; w.clock.isDay = true;
  return new Promise((resolve) => setTimeout(() => {
    sample('dayBaseline');
    // 夜半(月相走 clock.moonPhase ?? dayCount%8)
    w.clock.timeOfDay = 0; w.clock.isDay = false;
    setTimeout(() => {
      sample('nightFull');
      // 新月:dayCount=5 → phase 4(Empty=11)
      w.clock.dayCount = 5;
      setTimeout(() => { sample('nightNewMoon'); resolve(result); }, 700);
    }, 700);
  }, 700));
});
console.log(JSON.stringify(out, null, 1));

// 渲染像素:夜半画布地表亮度(平均) vs 白天
const px = await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.renderer.canvas;
  const ctx2 = c.getContext('2d');
  const avg = (label) => {
    const img = ctx2.getImageData(c.width / 2 - 200, c.height / 2, 400, 100).data;
    let s = 0;
    for (let i = 0; i < img.length; i += 4) s += (img[i] + img[i + 1] + img[i + 2]) / 3;
    return { label, avg: Math.round(s / (img.length / 4)) };
  };
  const day = avg('day');
  g.world.clock.timeOfDay = 0; g.world.clock.isDay = false; g.world.clock.dayCount = 1;
  return new Promise((resolve) => setTimeout(() => resolve([day, avg('night')]), 800));
});
console.log('render px:', JSON.stringify(px));
console.log('errors:', errors.length);
await browser.close();
