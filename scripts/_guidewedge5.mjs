// 向导楔死复现⑤ A/B：unembedPass 垂直抬升支 on/off
// A(现状): 楔点站位 → 电梯环; B(每 tick 重置 embedTicks → 抬升永不点火):
// 预期 = 向导落到 ramp 上走掉(原版等价行为)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (28).json';
const json = fs.readFileSync(MAP, 'utf8');

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__swFlow, { timeout: 60000 });

const out = await page.evaluate(async (text) => {
  await window.__swFlow.loadJson(text);
  const g = window.__swGame;
  window.__swPhysDbg = {};
  const guide = g.entities.npcs.find((n) => n.npcKey === 'guide');

  const snap = (n) => ({
    t: g.tickCount, x: Math.round(n.x), y: Math.round(n.y),
    vx: +n.vx.toFixed(2), vy: +n.vy.toFixed(2),
    g: n.onGround ? 1 : 0, hw: n.hitWall ? 1 : 0,
    cy: Math.round(n.y + n.h / 2), wm: n.walkMode, dir: n.facing,
  });
  const place = (n) => {
    n.x = 50895; n.y = 6035;             // 用户日志环顶: cx=50904, cy=6055
    n.vx = 0; n.vy = 0;
    n.walkMode = 1; n.walkT = 3000; n.facing = -1;
    n.embedTicks = 0; n.embedPushed = 0;
  };

  // A: 现状
  place(guide);
  const traceA = [];
  for (let i = 0; i < 300; i++) { g.fixedUpdate(1 / 60); traceA.push(snap(guide)); }
  const endA = snap(guide);

  // B: 每 tick 后重置 embedTicks(模拟「无垂直抬升」)，跑 600t 看是否自解
  place(guide);
  const traceB = [];
  for (let i = 0; i < 600; i++) {
    g.fixedUpdate(1 / 60);
    guide.embedTicks = 0;
    if (i % 3 === 0 || Math.abs(guide.x - 50895) > 1) traceB.push(snap(guide));
  }
  const endB = snap(guide);
  return { endA, traceA: traceA.slice(0, 40), endB, traceB: traceB.slice(0, 60) };
}, json);
console.log(JSON.stringify(out, null, 1));
await browser.close();
