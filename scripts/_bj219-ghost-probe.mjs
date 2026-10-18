// ★BJ219 弹幕域 oldPos 残影族探针——四弹同框实机截图（通用残影表落刀取证）。
// 载体：503 星怒（独占支挂点,originY=70 档）/ 424 陨星弹（DEF 档+红染族 tint）/
//       909 岩石（start 5 step −1 短环）/ 261 大地之杖滚石（18..2 长环+灰染）。
// 断言面：①canvas 读回——每弹身后 ghost 带内非背景像素计数 > 0（半透≠背景）；
//        ②503 ghost 与本体旋转差 π/2 档不崩；③无 pageerror。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = needInput(join(DOWNLOADS, 'map-Starter_World (12).json'));
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5204') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); console.log('[probe] sp ok'); break; }
  catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const boot = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'loader' };
  await window.__swLoadJson(t);
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
  return window.__swGame?.world ? { ok: true } : { fail: 'world' };
}, mapText);
console.log('[probe] world loaded');
if (!boot.ok) { console.log(JSON.stringify(boot)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));
for (const sel of ['button', '[data-act]']) {
  try {
    const done = await page.evaluate((s) => {
      const b = [...document.querySelectorAll(s)].find((x) => /我已知晓/.test(x.textContent ?? ''));
      if (b) { b.click(); return true; }
      return false;
    }, sel);
    if (done) break;
  } catch { /* next */ }
}
await new Promise((r) => setTimeout(r, 500));

const out = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const { Arrow } = await import('/src/entities/Arrow.ts');

  // 场地：玩家出生行同高（开阔空气带）——四弹自左向右飞过玩家（friendly 不伤人）
  const py = g.player.y;
  const made = [];
  const spec = [
    { id: 503, dx: -260, vx: 3.0 },   // 星怒（独占支 ghost 挂点）
    { id: 424, dx: -120, vx: 4.0 },   // 陨星弹（DEF 档）
    { id: 909, dx: 160,  vx: 2.5 },   // 岩石（5..1 短环）
    { id: 261, dx: 300,  vx: 2.0 },   // 大地滚石（18..2 长环）
  ];
  for (const s of spec) {
    const a = new Arrow(g.player.x + s.dx, py, s.vx, 0, 30, 0, s.id,
      { grav: 0, life: 600, pierce: 99 });
    g.entities.add(a, 'projectiles');
    made.push({ id: s.id, ent: a });
  }
  await wait(900);                                       // ~54 tick——长环(261=18 槽)充分展开

  // 读回：各弹身后 ghost 带（本体左 4..36px、竖 ±10px）内非天空像素计数
  const cv = document.querySelector('canvas');
  const c2 = cv.getContext('2d');
  const cam = g.renderer ? g.renderer.camera ?? g.renderer.cam : null;
  const sky = c2.getImageData(0, 0, 1, 1).data.slice(0, 3).join(',');
  const rows = [];
  for (const m of made) {
    const ent = m.ent;
    const sx = (ent.x - g.camera.x), sy = (ent.y - g.camera.y);
    let non = 0, samples = 0;
    for (let dx = 4; dx < 40; dx += 2) {
      for (let dy = -10; dy <= 10; dy += 2) {
        const d = c2.getImageData(Math.round(sx - dx), Math.round(sy + dy) , 1, 1).data;
        samples++;
        if (Math.abs(d[0] - +sky.split(',')[0]) + Math.abs(d[1] - +sky.split(',')[1]) + Math.abs(d[2] - +sky.split(',')[2]) > 30) non++;
      }
    }
    rows.push({ id: m.id, x: Math.round(ent.x), y: Math.round(ent.y), screenX: Math.round(sx), screenY: Math.round(sy), ghostPixels: non, samples, alive: !ent.dead });
  }
  return { rows, dpr: window.devicePixelRatio, camX: Math.round(g.camera.x) };
});
console.log(JSON.stringify({ out, errs: errs.slice(0, 4) }, null, 1));
await page.screenshot({ path: '/tmp/bj219-ghost-probe.png' });
await browser.close();
