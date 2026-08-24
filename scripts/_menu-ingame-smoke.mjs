// 一次性:进游戏冒烟(世界内天空/云/星渲染 + 控制台错误)。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_menu-ingame-smoke.mjs
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__swMenuBg', { timeout: 30000 });
// 旧垫片:select(尺寸)+button(创建小世界)
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /创建新世界/.test(b.textContent || ''));
  if (!btn) throw new Error('legacy shim button not found');
  btn.click();
});
// 等世界生成完成(菜单 DOM 消失/游戏画布出现)
try {
  await page.waitForFunction(`!!window.__swMenuBg === false || !document.querySelector('.sw-housing-panel')`, { timeout: 5000 });
} catch { /* 忽略,靠轮询 */ }
let inGame = false;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  inGame = await page.evaluate(() => {
    const g = window.__swGame ?? (window).game;
    return !!(g && g.world && g.world.width);
  }).catch(() => false);
  if (inGame) break;
}
const shot = await page.screenshot({ encoding: 'base64' });
fs.writeFileSync('/tmp/menu-ingame.png', Buffer.from(shot, 'base64'));
const state = await page.evaluate(() => {
  const g = window.__swGame ?? (window).game;
  return {
    inGame: !!(g && g.world && g.world.width),
    worldW: g?.world?.width ?? 0,
    glCloud: !!(g?.renderer?.sky?.cloudGlLayer && !g.renderer.sky.cloudGlLayer.unavailable),
  };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log(JSON.stringify({ ...state, errors: errors.slice(0, 8) }));
await browser.close();
