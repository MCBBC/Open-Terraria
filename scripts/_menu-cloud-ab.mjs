// 一次性:晨昏云光照 A/B——同一 timeOfDay(time 46500 黄昏)下菜单 vs 游戏内
// 云 RGB 采样对比(_layer-color.mjs 思路)+ 双侧 sky.cots 单源对照。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const T = 46500;   // 黄昏窗(落日光斑期,云光照差异最敏感)

const sampleCloudsSrc = `var sampleClouds = (cv, y0, y1) => {
    const g = cv.getContext('2d');
    const w = cv.width, h = Math.min(y1, cv.height);
    const d = g.getImageData(0, y0, w, h - y0).data;
    const px = [];
    for (let y = 0; y < h - y0; y += 3) {
      for (let x = 0; x < w; x += 3) {
        const i = ((y0 + y) * w + x) * 4;
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        const lum = (r + gg + b) / 3, sat = Math.max(r, gg, b) - Math.min(r, gg, b);
        if (lum > 140 && sat < 60) px.push([r, gg, b]);
      }
    }
    if (!px.length) return null;
    let r = 0, gg = 0, b = 0;
    for (const p of px) { r += p[0]; gg += p[1]; b += p[2]; }
    return { n: px.length, rgb: [Math.round(r / px.length), Math.round(gg / px.length), Math.round(b / px.length)] };
  }`;
/** 页内采样代码(字符串形式交给 page.evaluate,Node 作用域函数不可跨域) */
const pageCode = (y0, y1, pick) => `(() => { ${sampleCloudsSrc};
  return (${pick})(sampleClouds, ${y0}, ${y1}); })()`;

// ---- 菜单侧 ----
const b1 = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p1 = await b1.newPage();
await p1.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 100 && !await p1.evaluate(() => !!window.__swMenuBg).catch(() => false); i++) await new Promise((r) => setTimeout(r, 1000));
for (let i = 0; i < 120; i++) {
  if (await p1.evaluate(() => !document.querySelector('.layer.back')).catch(() => true)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await p1.evaluate((t) => { const mb = window.__swMenuBg; mb.dayTime = true; mb.vTime = t; }, T);
// 菜单时钟 ~26 倍速(26.6s/昼)——350ms 内采样,漂移 ≈ +710 vanilla tick(t+0.008)
await new Promise((r) => setTimeout(r, 350));
const menu = await p1.evaluate(pageCode(120, 560,
  `(sc, y0, y1) => { const mb = window.__swMenuBg; return { t: +mb.clockTime().toFixed(4), cots: mb.sky.cots?.map((v) => Math.round(v)), cloud: sc(mb.canvas, y0, y1) }; }`));
console.log('MENU:', JSON.stringify(menu));
await b1.close();

// ---- 游戏内侧 ----
const b2 = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p2 = await b2.newPage();
await p2.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p2.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await p2.evaluate((t) => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.1875 + (t / 54000) * 0.625;   // vanilla time → t01
  const p = g.player;
  p.x = g.world.store.w * 16 / 2; p.vx = 0;
}, T);
await new Promise((r) => setTimeout(r, 2500));
const ingame = await p2.evaluate(pageCode(120, 560,
  `(sc, y0, y1) => { const g = window.__swGame; const cv = g.renderer.canvas ?? document.querySelector('.sw-root canvas'); return { t: +g.world.clock.timeOfDay.toFixed(4), cots: g.renderer.sky.cots?.map((v) => Math.round(v)), cloud: sc(cv, y0, y1) }; }`));
console.log('INGAME:', JSON.stringify(ingame));
await b2.close();
