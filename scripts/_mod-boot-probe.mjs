// mod loader boot 中立性探针(2026-10-04):零 mod 时启动链零扰动+面板入口在位。
// 用法:私有 vite 实例(SW_PORT=5201 SW_NO_HMR=1) + SW_ORIGIN 经 run-diag 注入。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 250)));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push('CONSOLE: ' + t.slice(0, 200)); });

// ---- ① 标题菜单路径:mods 按钮在位,面板可开,零 mod 装载无错 ----
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 14000));
const title = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sw-title-btn')];
  return {
    titleMenu: !!document.querySelector('.sw-title-menu'),
    modsBtn: btns.some((b) => b.dataset.act === 'mods'),
    btnTexts: btns.map((b) => b.textContent?.trim()).slice(0, 8),
  };
}).catch(e => ({ evalFail: String(e).slice(0, 120) }));
let panelOpened = false;
if (title.modsBtn) {
  await page.click('[data-act=mods]').catch(() => {});
  await new Promise(r => setTimeout(r, 600));
  panelOpened = await page.evaluate(() => !!document.getElementById('sw-mods-panel')).catch(() => false);
  await page.keyboard.press('Escape').catch(() => {});
}
// ---- ② ?play=small 旁路进世界(零 mod 世界引导) ----
const page2 = await browser.newPage();
const errs2 = [];
page2.on('pageerror', (e) => errs2.push('PAGEERR: ' + String(e).slice(0, 250)));
page2.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs2.push('CONSOLE: ' + t.slice(0, 200)); });
await page2.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 30000));
const game = await page2.evaluate(() => ({
  hasGame: !!window.__swGame,
  hasPlayer: !!(window.__swGame && window.__swGame.player),
  modsLoadedFlag: window.__swModsLoaded === true,
})).catch(e => ({ evalFail: String(e).slice(0, 120) }));
console.log(JSON.stringify({ title, panelOpened, game, errs: errs.slice(0, 6), errs2: errs2.slice(0, 6) }, null, 1));
await browser.close();
