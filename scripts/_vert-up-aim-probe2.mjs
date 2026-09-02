// 垂直向上终审测量（蓝队 2026-09-02）：相机钉死 + 调色板匹配 + 弹出生点即采
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const DIR = process.env.SW_DIR ?? 'up';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => window.__swFlow.newWorld('42424242', 4200, 1200));
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 300000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async (dir) => {
  const g = window.__swGame;
  const p = g.player;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  p.inv.slots.fill(null);
  p.inv.slots[0] = { id: ITEM_BY_KEY['vi_759_火箭发射器'], stack: 99 };
  p.inv.slots[1] = { id: ITEM_BY_KEY['vi_771_火箭一型'], stack: 99 };
  p.inv.selected = 0;
  // 钉死玩家与相机
  const pinX = p.x, pinY = p.y;
  const iv = setInterval(() => { p.x = pinX; p.y = pinY; p.vx = 0; p.vy = 0; p.useTime = 0; }, 8);
  await new Promise(r => setTimeout(r, 700));
  const cvs = g.renderer.canvas;
  const res = {};
  res.baseCam = g.camera.worldToScreen(p.cx, p.cy);
  res.basePng = cvs.toDataURL('image/png');
  // 仪器：真实帧 drawUseItem pivot/dest
  const real = g.renderer.drawUseItem.bind(g.renderer);
  const pivots = [];
  g.renderer.drawUseItem = function (c, pl, sw, f) {
    let tr = null, dest = null;
    const t = c.translate.bind(c), di = c.drawImage.bind(c);
    c.translate = (a, b) => { if (!tr) tr = [a, b]; t(a, b); };
    c.drawImage = (...args) => { if (!dest) dest = args.slice(5, 9); di(...args); };
    real(c, pl, sw, f);
    if (tr) pivots.push({ aim: sw.aim, facing: pl.facing, tr, dest: dest && [...dest] });
  };
  // 开火：鼠标钉头顶正上
  const [sx, sy] = g.camera.worldToScreen(p.cx, p.cy);
  g.input.mouseX = sx; g.input.mouseY = dir === 'down' ? sy + 400 : sy - 400;
  g.input.mouseDown = true;
  let proj = null, shotCam = null;
  const t0 = performance.now();
  while (performance.now() - t0 < 2000) {
    await new Promise(r => setTimeout(r, 4));
    const alive = g.entities.projectiles.find(e => !e.dead);
    if (alive) { proj = { tlx: alive.x, tly: alive.y, w: alive.w, h: alive.h, vx: alive.vx, vy: alive.vy }; break; }
  }
  shotCam = g.camera.worldToScreen(p.cx, p.cy);
  res.shotCam = shotCam;
  res.proj = proj;
  res.swingAim = g.swing ? g.swing.aim : null;
  res.p = { cx: p.cx, cy: p.cy, y: p.y, h: p.h, facing: p.facing };
  await new Promise(r => setTimeout(r, 30));
  res.shotPng = cvs.toDataURL('image/png');
  res.pivots = pivots.slice(-4);
  g.input.mouseDown = false;
  clearInterval(iv);
  return res;
}, DIR);
writeFileSync('/tmp/vertup2-' + DIR + '.json', JSON.stringify({ ...out, basePng: undefined, shotPng: undefined }, null, 1));
writeFileSync('/tmp/vertup2-' + DIR + '-base.png', Buffer.from(out.basePng.split(',')[1], 'base64'));
writeFileSync('/tmp/vertup2-' + DIR + '-shot.png', Buffer.from(out.shotPng.split(',')[1], 'base64'));
console.log(JSON.stringify({ ...out, basePng: undefined, shotPng: undefined }, null, 1));
console.log('ERRORS', JSON.stringify(errs.slice(0, 5)));
await browser.close();
