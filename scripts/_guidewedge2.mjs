// 向导楔死复现②：沿 row-378 平台向左行走撞悬檐（用户日志 dir=-1/wm=1/hw=true 入场）
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
    g: n.onGround ? 1 : 0, hw: n.hitWall ? 1 : 0, hh: n.hitHead ? 1 : 0,
    eT: n.embedTicks | 0, eP: n.embedPushed | 0,
    wm: n.walkMode, dir: n.facing, cy: Math.round(n.y + n.h / 2),
  });

  // 站上 row-378 平台（顶面 6048）：cy = 6048-20 = 6028，cx = 50928 (tile 3183)
  // 强制向左走（wm=1, walkT 拉满, facing=-1）
  guide.x = 50928 - guide.w / 2;
  guide.y = 6048 - guide.h;
  guide.vx = 0; guide.vy = 0;
  guide.walkMode = 1; guide.walkT = 600; guide.facing = -1;
  guide.embedTicks = 0; guide.embedPushed = 0;
  const at = { cx: guide.cx, cy: guide.cy };

  const trace = [];
  for (let i = 0; i < 1200; i++) { g.fixedUpdate(1 / 60); trace.push(snap(guide)); }

  // 关注: cx 进入 50890..50920 后的逐 tick
  const near = trace.filter((r) => r.x <= 50940 && r.x >= 50860);
  return { at, near, dbg: window.__swPhysDbg, final: trace[trace.length - 1] };
}, json);
console.log(JSON.stringify(out, null, 1));
await browser.close();
