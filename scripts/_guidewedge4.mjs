// 向导楔死复现④：钉在用户日志起点 (cx=50904, cy=6057, dir=-1, wm=1) 逐 tick 600t
// 全旗标观测 + 末尾接续 1500t 看长程行为（是否形成 平台→压下→ramp→爬回→循环）
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
    g: n.onGround ? 1 : 0, hw: n.hitWall ? 1 : 0, hh: n.hitHead ? 1 : 0, cY: n.collideY ? 1 : 0,
    cy: +n.cy.toFixed(1), eT: n.embedTicks | 0, eP: n.embedPushed | 0,
    wm: n.walkMode, dir: n.facing, wt: n.walkT | 0,
  });

  // 用户日志起点（t=390 样本）：cx=50904, cy=6057, vx=0, dir=-1, wm=1, hw=true, g=false
  guide.x = 50904 - guide.w / 2;
  guide.y = 6057 - guide.h / 2;
  guide.vx = 0; guide.vy = 0;
  guide.walkMode = 1; guide.walkT = 3000; guide.facing = -1;
  guide.embedTicks = 0; guide.embedPushed = 0;

  const trace = [];
  for (let i = 0; i < 600; i++) { g.fixedUpdate(1 / 60); trace.push(snap(guide)); }
  const long = [];
  for (let i = 0; i < 1500; i++) { g.fixedUpdate(1 / 60); long.push(snap(guide)); }
  // 压缩 long：只在 y 或 dir 或 wm 变化时保留
  const longC = [];
  let prev = null;
  for (const r of long) {
    const k = JSON.stringify([r.y, r.x, r.dir, r.wm, r.g]);
    if (k !== prev) { longC.push(r); prev = k; }
  }
  return { trace, longC, dbg: window.__swPhysDbg };
}, json);
console.log(JSON.stringify(out, null, 1));
await browser.close();
