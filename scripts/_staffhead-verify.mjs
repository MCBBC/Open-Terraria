// 一次性:杖头出生终验——冰川之牙蓄力 + 太阳花连发,各截一张
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1000);

// A. 冰川之牙蓄力中段
await p.evaluate(() => {
  const g = window.__swGame;
  const idx = window.__swItems['vi_6153_GlacierFang'];
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.player.inv.selected = 0;
  g.player.mana = 200; g.player.baseMaxMana = 200;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx - 80; g.input.mouseY = sy - 40;   // 左上瞄准
  g.input.mouseDown = true; g.input.mouseHeld = true;
});
await sleep(600);
let crop = await p.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  return { x: Math.max(0, Math.round(sx - 80)), y: Math.max(0, Math.round(sy - 95)), width: 160, height: 170 };
});
await p.screenshot({ path: '/tmp/mooncloud-probe/final-gf.png', clip: crop });
await p.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
await sleep(600);

// B. 太阳花连发
await p.evaluate(() => {
  const g = window.__swGame;
  const idx = window.__swItems['vi_6152_DaybloomStaff'];
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.player.inv.selected = 0;
  g.player.mana = 200;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx - 80; g.input.mouseY = sy - 40;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.__pin = setInterval(() => { g.input.mouseDown = true; g.input.mouseHeld = true; }, 50);
});
await sleep(900);
crop = await p.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  return { x: Math.max(0, Math.round(sx - 80)), y: Math.max(0, Math.round(sy - 95)), width: 160, height: 170 };
});
await p.screenshot({ path: '/tmp/mooncloud-probe/final-daybloom.png', clip: crop });
await p.evaluate(() => { clearInterval(window.__swGame.__pin); });
await b.close();
console.log('DONE → final-gf.png / final-daybloom.png');
