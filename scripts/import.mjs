// 端到端：菜单导入真实 .wld → 进游戏 → 验证世界形状与可玩性
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || '' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '';
import { resolve } from 'node:path';
const WLD = resolve('Starter_World Master.wld');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle0' });

// 点击「导入泰拉瑞亚地图」按钮触发隐藏 file input
const btns = await page.$$('button');
for (const b of btns) {
  const text = await b.evaluate((el) => el.textContent);
  if (text?.includes('导入')) {
    // 直接找随后隐藏的 input
    const input = await page.$('input[type=file][accept=".wld"]');
    await input.uploadFile(WLD);
    break;
  }
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000)); // 等首批 chunk/光照

const state = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const w = st.w, h = st.h;
  // 天空判据：y = h*0.1 行应几乎全空
  let air = 0, n = 0;
  const ySky = Math.floor(h * 0.08);
  for (let x = 0; x < w; x += 13) { n++; if (!st.isActive(x, ySky)) air++; }
  // 地表判据：y = h*0.27 行附近应有大量实心
  let solid = 0, n2 = 0;
  const ySurf = Math.floor(h * 0.28);
  for (let x = 0; x < w; x += 13) { n2++; if (st.isActive(x, ySurf)) solid++; }
  return {
    size: `${w}x${h}`,
    name: g.world.name,
    wldVersion: g.world.name,
    skyAirRatio: +(air / n).toFixed(2),
    surfaceSolidRatio: +(solid / n2).toFixed(2),
    playerY: Math.round(g.player.y / 16),
    hp: g.player.hp,
    chests: g.world.chests.length,
  };
});
console.log('IMPORTED:', JSON.stringify(state));
await page.screenshot({ path: './shots/10-wld-import.png' });
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'NO ERRORS');
await browser.close();
