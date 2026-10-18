// SDMG+诅咒弹连射崩溃复现:给枪弹、按住鼠标 5s,收 pageerror/rAF 存活/弹幕数。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/sdmg-profile'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => { errs.push(String(e.stack || e.message).slice(0, 500)); console.log('[pageerror]', String(e.message).slice(0, 160)); });
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(async () => {
  const m = await import('/src/data/items.ts');
  const gun = m.ITEM_BY_KEY['vi_1553_SDMG'], ammo = m.ITEM_BY_KEY['vi_546_CursedBullet'];
  if (!gun || !ammo) { window.__giveErr = { gun: !!gun, ammo: !!ammo }; return; }
  const g = window.__swGame;
  g.player.inv.slots[0] = { id: gun, stack: 1 };
  g.player.inv.slots[53] = { id: ammo, stack: 999 };
  g.player.inv.selected = 0;
  window.__giveErr = null;
  // 瞄准远处
  g.player.debugGod = true;
});
await new Promise((r) => setTimeout(r, 1500));
console.log('[给枪]', JSON.stringify(await page.evaluate(() => window.__giveErr)));
// 按住鼠标连射 6s(机枪连发),期间鼠标小幅摆动
await page.mouse.move(900, 300);
await page.mouse.down();
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  await page.mouse.move(700 + i * 60, 250 + (i % 2) * 120);
}
await page.mouse.up();
await new Promise((r) => setTimeout(r, 1500));
const state = await page.evaluate(() => {
  const g = window.__swGame;
  window.__fps = window.__fps || { n: 0, last: performance.now() };
  return {
    projs: g.entities?.projectiles?.length ?? -1,
    playerAlive: !!g.player,
    rafAlive: !!(g.renderer && g.renderer.lastFrameAt && performance.now() - g.renderer.lastFrameAt < 1000),
    errs: window.__giveErr,
  };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log('[状态]', JSON.stringify(state));
console.log('[pageerror 总数]', errs.length);
if (errs.length) console.log('[首个栈]', errs[0]);
await browser.close();
