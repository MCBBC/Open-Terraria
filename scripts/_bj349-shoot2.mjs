// BJ349 一锤定音(4173):星星炮注入→swing 触发?→弹生成?→弹移动方向两次采样
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4173';
const TAG = process.env.SW_TAG ?? 'x';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR:' + String(e.message).slice(0, 160)));
await page.goto(ORIGIN + '/?play=small' + (process.env.SW_FLAGS ?? ''), { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 300000, polling: 1500 });
await new Promise(r => setTimeout(r, 3000));
const vw = 1360, vh = 860;
const out = await page.evaluate(([vw, vh]) => {
  const g = window.__swGame;
  const inv = g.player.inv;
  inv.slots[0] = { id: 197, stack: 1 };   // 星星炮(方案A域)
  inv.slots[5] = { id: 75, stack: 999 };  // 坠星
  g.player.selectedSlot = 0;
  g.input.mouseX = vw - 150; g.input.mouseY = Math.round(vh / 2) - 80;  // 右偏上
  const sw2 = () => { for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60); return g.swing ? { t: g.swing.t, dur: g.swing.dur } : null; };
  const swingProbe = sw2();
  const before = new Set();
  for (const e of (g.entities.projectiles ?? [])) before.add(e);
  g.input.mouseDown = true;
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  const born = [];
  for (const e of (g.entities.projectiles ?? [])) if (!before.has(e)) born.push({ pid: e.projId, cls: e.constructor?.name, x: +Number(e.x).toFixed(1), y: +Number(e.y).toFixed(1), vx: +Number(e.vx).toFixed(2), vy: +Number(e.vy).toFixed(2) });
  const star = born[0] ?? null;
  let move = null;
  if (star) {
    for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
    for (const e of (g.entities.projectiles ?? [])) {
      if ((e.projId ?? null) === star.pid) {
        move = { x2: +Number(e.x).toFixed(1), y2: +Number(e.y).toFixed(1) };
        break;
      }
    }
  }
  const mwy = g.camera ? (() => { try { const [wx, wy] = g.camera.screenToWorld(g.input.mouseX, g.input.mouseY); return { wx: +wx.toFixed(0), wy: +wy.toFixed(0) }; } catch { return null; } })() : null;
  return { swingProbe, nBorn: born.length, born: born.slice(0, 4), move, mouse: { mx: g.input.mouseX, my: g.input.mouseY }, mwy, player: { cx: +g.player.cx.toFixed(0), cy: +g.player.cy.toFixed(0), facing: g.player.facing }, projCount: (g.entities.projectiles ?? []).length };
}, [vw, vh]);
console.log('F=' + TAG + '=' + JSON.stringify(out));
if (errs.length) console.log('ERRS:', JSON.stringify(errs.slice(0, 4)));
await browser.close();
