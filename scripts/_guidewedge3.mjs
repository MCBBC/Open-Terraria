// 向导楔死复现③：直接站上平台楔点 cx=50904/cy=6028 向左强走 300t 逐 tick 采样
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
    t: g.tickCount, x: +n.x.toFixed(1), y: +n.y.toFixed(1),
    vx: +n.vx.toFixed(2), vy: +n.vy.toFixed(2),
    g: n.onGround ? 1 : 0, hw: n.hitWall ? 1 : 0, hh: n.hitHead ? 1 : 0,
    cy: +n.cy.toFixed(1), eT: n.embedTicks | 0, eP: n.embedPushed | 0,
    wm: n.walkMode, dir: n.facing,
  });

  // 楔点站位：平台顶面 6048 → y=6008, cx=50904 → x=50895
  guide.x = 50895; guide.y = 6008;
  guide.vx = 0; guide.vy = 0;
  guide.walkMode = 1; guide.walkT = 6000; guide.facing = -1;
  guide.embedTicks = 0; guide.embedPushed = 0;

  const trace = [];
  for (let i = 0; i < 600; i++) { g.fixedUpdate(1 / 60); trace.push(snap(guide)); }
  return { trace, dbg: window.__swPhysDbg };
}, json);
console.log(JSON.stringify(out, null, 1));
await browser.close();
