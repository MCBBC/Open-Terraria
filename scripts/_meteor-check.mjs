// 一次性:菜单流星视觉诊断——深夜连拍三帧 + 云/星状态。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
// 等 splash 退场
for (let i = 0; i < 120; i++) {
  const gone = await page.evaluate(() => !document.querySelector('.layer.back')).catch(() => true);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 2000));

// 切深夜 + 强制高频坠星观察窗
await page.evaluate(() => {
  const mb = window.__swMenuBg;
  mb.vTime = 16200;
  mb.dayTime = false;
});
await new Promise((r) => setTimeout(r, 1500));

const state = await page.evaluate(() => {
  const sky = window.__swMenuBg.sky;
  const falling = sky.stars.filter((s) => s.falling && !s.hidden);
  return {
    stars: sky.stars.length,
    falling: falling.length,
    sample: falling.slice(0, 4).map((s) => ({
      x: Math.round(s.x), y: Math.round(s.y),
      fvx: +s.fvx.toFixed(2), fvy: +s.fvy.toFixed(2),
      fallTime: Math.round(s.fallTime), rot: +s.rot.toFixed(2),
    })),
  };
});
console.log('STARS:', JSON.stringify(state));

// 连拍三帧(天空区)
for (let k = 0; k < 3; k++) {
  await page.screenshot({ path: `/tmp/meteor-${k}.png`, clip: { x: 0, y: 0, width: 1280, height: 500 } });
  await new Promise((r) => setTimeout(r, 250));
}
console.log('saved meteor-0..2.png');
await browser.close();
