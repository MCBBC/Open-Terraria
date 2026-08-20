// 蚁狮倾斜实机探针（2026-08-20）：F6 召唤 69 + 玩家站上方 → 断言 visAngle 依方位倾斜 + 截图。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('蚁狮探针');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const worldItem = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (worldItem) {
  await page.click('.sw-list-panel .sw-item');
} else {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await new Promise(r => setTimeout(r, 3000));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  const p = g.player;
  const px = p.x, py = p.y;

  // fromVanilla 直造（_bossfix-audit-probe 同款：动态 import + entities.add）
  const { Enemy } = await import('/src/entities/Enemy.ts');
  let ant = Enemy.fromVanilla(69, p.cx, p.cy + 40);
  out.spawned = !!ant;
  if (!ant) return out;
  ant.id = g.entities.nextId++;
  g.entities.add(ant, 'enemies');
  ant.hp = ant.maxHp;
  out.defBefore = { visAngle: ant.visAngle, ai0: ant.ai0 };

  // 玩家站蚁狮正上方 → 期望 visAngle≈0；再移到右上 → 期望 +倾角
  await wait(900);
  out.straightAbove = { visAngle: +ant.visAngle.toFixed(4), ai0: ant.ai0, dead: ant.dead, y: ant.y };
  // 右上方 300px
  p.x = ant.cx + 300 - p.w / 2; p.y = ant.cy - 300 - p.h / 2;
  await wait(900);
  out.upperRight = { visAngle: +ant.visAngle.toFixed(4) };
  // 近水平右侧 → 钳 0.8
  p.x = ant.cx + 400 - p.w / 2; p.y = ant.cy - 30 - p.h / 2;
  await wait(900);
  out.nearHorizontal = { visAngle: +ant.visAngle.toFixed(4) };
  // 玩家下方 → 保留
  const keep = ant.visAngle;
  p.x = ant.cx; p.y = ant.cy + 200;
  await wait(600);
  out.belowRetain = { kept: +keep.toFixed(4), now: +ant.visAngle.toFixed(4) };
  // 恢复玩家 + 帧率抽样
  p.x = ant.cx - 300 - p.w / 2; p.y = ant.cy - 300 - p.h / 2;
  await wait(700);
  out.upperLeft = { visAngle: +ant.visAngle.toFixed(4) };
  return out;
});
fs.writeFileSync('/tmp/sw-antlion-tilt.png', await page.screenshot({ type: 'png' }));
console.log(JSON.stringify({ res, errs: errs.slice(0, 6) }, null, 2));
await browser.close();
