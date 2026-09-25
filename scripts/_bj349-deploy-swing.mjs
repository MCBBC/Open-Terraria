// BJ349 部署站复现:初始工具挥砍四向(右/左/右上/右下)视觉+朝向对拍
// 判据:挥砍动画朝鼠标侧;武器贴图在玩家手位且朝向正确。
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'https://ab575621.sandboxworld.pages.dev';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR:' + String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 300000, polling: 1500 });
await new Promise(r => setTimeout(r, 3000));
const vw = 1360, vh = 860;
const clip = { x: vw / 2 - 420, y: vh / 2 - 240, width: 840, height: 480 };
const cases = [
  ['right', vw - 120, Math.round(vh / 2)],
  ['left', 120, Math.round(vh / 2)],
  ['upright', vw - 260, Math.round(vh / 2) - 200],
  ['upleft', 260, Math.round(vh / 2) - 200],
];
const results = [];
for (const [name, mx, my] of cases) {
  const st = await page.evaluate(([mx, my]) => {
    const g = window.__swGame;
    g.input.mouseX = mx; g.input.mouseY = my;
    g.input.mouseDown = true;
    for (let i = 0; i < 3; i++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
    const sw = g.swing ? { t: g.swing.t, dur: g.swing.dur, aim: g.swing.aim } : null;
    return { facing: g.player.facing, swing: sw, held: g.player.inv.slots[g.player.selectedSlot]?.id, px: +g.player.cx.toFixed(0), py: +g.player.cy.toFixed(0) };
  }, [mx, my]);
  // 等挥砍动画中段(约 40% 处)截屏
  await new Promise(r => setTimeout(r, 120));
  const shot = await page.screenshot({ clip });
  writeFileSync(`/tmp/bj349-deploy-${name}.png`, shot);
  await new Promise(r => setTimeout(r, 600));
  results.push([name, st]);
  // 等挥砍窗结束
  await page.evaluate(() => { const g = window.__swGame; for (let i = 0; i < 80; i++) g.fixedUpdate(1 / 60); });
}
console.log('DEPLOY=' + ORIGIN);
for (const [name, st] of results) console.log(name + '=' + JSON.stringify(st));
if (errs.length) console.log('ERRS:', JSON.stringify(errs.slice(0, 5)));
await browser.close();
