// 向导楔死复现（2026-09-02 用户实报：向导卡 3181.5,378 楔缝）
// 数据源：behavior-log-Starter_World-2026-09-02T14-23-50-255Z.json（npcMove 逐 30t 采样）
//  + map-Starter_World (28).json（官方存档）。
// A/B：① 存档原位直跑 ② 传送到日志楔死位 (cx=50904, cy=6055) 直跑；
// 逐 tick 记 x/y/vx/vy/onGround/hitWall/embedTicks/embedPushed/walkMode/facing。
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
  const st = g.world.store;
  const guide = g.entities.npcs.find((n) => n.npcKey === 'guide');
  if (!guide) return { err: 'no guide' };

  // ---- 地形交叉核对（与行为日志 terrain.cells 对拍）----
  const grid = [];
  for (let y = 371; y <= 386; y++) {
    let row = '';
    for (let x = 3174; x <= 3192; x++) {
      const i = st.idx(x, y);
      const t = st.type[i], sl = st.slope[i], hf = st.half[i];
      let ch = '.';
      if (t !== 0) {
        if (st.isPlatform(x, y)) ch = 'P';
        else if (hf) ch = 'h';
        else if (sl) ch = String(sl);
        else ch = '#';
      } else if (st.wall[i]) ch = ',';
      row += ch;
    }
    grid.push(y + ' ' + row);
  }

  const snap = (n) => ({
    t: g.tickCount, x: Math.round(n.x), y: Math.round(n.y),
    vx: +n.vx.toFixed(2), vy: +n.vy.toFixed(2),
    g: n.onGround ? 1 : 0, hw: n.hitWall ? 1 : 0, hh: n.hitHead ? 1 : 0,
    eT: n.embedTicks | 0, eP: n.embedPushed | 0,
    wm: n.walkMode, dir: n.facing, cy: Math.round(n.y + n.h / 2),
  });
  // 压缩：只保留 y/vy/标志/embed 变化的行 + 首行
  const compact = (rows) => {
    const keep = [];
    let prev = null;
    for (const r of rows) {
      const key = JSON.stringify([r.y, r.vx, r.vy, r.g, r.hw, r.hh, r.eT, r.eP, r.wm, r.dir]);
      if (!prev || key !== prev) { keep.push(r); prev = key; }
    }
    return keep;
  };

  const dims = { w: guide.w, h: guide.h, home: guide.home, x: guide.x, y: guide.y, cx: guide.cx, cy: guide.cy };
  const dbg0 = window.__swPhysDbg;

  // Phase1: 存档原位直跑
  const trace1 = [];
  for (let i = 0; i < 900; i++) { g.fixedUpdate(1 / 60); trace1.push(snap(guide)); }
  const dbg1 = { ...window.__swPhysDbg };

  // Phase2: 传送到日志楔死位（cx=50904, cy=6055）
  guide.x = 50904 - guide.w / 2;
  guide.y = 6055 - guide.h / 2;
  guide.vx = 0; guide.vy = 0;
  guide.embedTicks = 0; guide.embedPushed = 0;
  window.__swPhysDbg = {};
  const at2 = { x: guide.x, y: guide.y, cx: guide.cx, cy: guide.cy };
  const trace2 = [];
  for (let i = 0; i < 1500; i++) { g.fixedUpdate(1 / 60); trace2.push(snap(guide)); }
  const dbg2 = { ...window.__swPhysDbg };

  // 周边格实况（楔死位逐列）
  const cells = {};
  for (let y = 374; y <= 382; y++) for (let x = 3179; x <= 3186; x++) {
    const i = st.idx(x, y);
    cells[x + ',' + y] = [st.type[i], st.slope[i], st.half[i], st.isPlatform(x, y) ? 1 : 0];
  }

  return { dims, grid, trace1: compact(trace1), trace2: compact(trace2), at2, cells, dbg1, dbg2 };
}, json);
console.log(JSON.stringify(out, null, 1));
await browser.close();
