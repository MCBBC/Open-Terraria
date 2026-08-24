// 一次性:菜单背景统一(BiomeBackground.menuMode)视觉验证矩阵——
// 白天正午/黄昏光斑/深夜腐化槽+星+流星 + 样式轮换(51崖/7雪松/13帧图/3-91槽)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = '/tmp/menu-unify';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
if (!menuReady) { console.log('FAIL: menu handle missing'); process.exit(1); }
for (let i = 0; i < 120; i++) {
  const gone = await page.evaluate(() => !document.querySelector('.layer.back')).catch(() => true);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 1500));

const setTime = (t, day) => page.evaluate((t, day) => {
  const mb = window.__swMenuBg;
  mb.vTime = t; mb.dayTime = day;
}, t, day);
const shoot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. 白天正午(time 27000)
await setTime(27000, true); await wait(1200); await shoot('menu-day-noon');
// 2. 样式轮换(昼):51 蓝崖 / 7 雪松浮空岛 / 13 帧图341 / 3 槽0=91特例
for (const st of [51, 7, 13, 3]) {
  await page.evaluate((st) => { window.__swMenuBg.style = st; }, st);
  await wait(1500);
  await shoot(`menu-style-${st}`);
}
// 3. 黄昏 time=46500(落日光斑 DrawLensFlare)
await setTime(46500, true); await wait(1200); await shoot('menu-dusk-flare');
// 4. 深夜 time=16200(腐化槽交叉淡化 + 星 + 流星)
await setTime(16200, false); await wait(2600);
await shoot('menu-night-corrupt');
for (let k = 0; k < 6; k++) { await shoot(`menu-night-met-${k}`); await wait(150); }
// 5. 状态 + 173 动画帧贴图存在性
const state = await page.evaluate(async () => {
  const mb = window.__swMenuBg;
  const bb = mb.biomeBg;
  const frames = [];
  for (const n of [251, 252, 253, 254, 341]) {
    try { const r = await fetch(`sprites/vanilla/Background_${n}.png`, { method: 'HEAD' }); frames.push(`${n}:${r.status}`); }
    catch { frames.push(`${n}:ERR`); }
  }
  return {
    style: mb.style, bgStyle: bb.bgStyle,
    alphaFront: [bb.alphaFront[0], bb.alphaFront[1]].map((v) => +v.toFixed(3)),
    menuMode: bb.menuMode, tintBufs: bb.menuTintBufs.size,
    fallingStars: mb.sky.stars.filter((s) => s.falling && !s.hidden).length,
    frames,
  };
});
console.log('STATE:', JSON.stringify(state));
await browser.close();
