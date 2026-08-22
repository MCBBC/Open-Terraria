// 一次性:雪原夜景——极光 GL 画布与主画布分别落盘,肉眼对比带形态与合成结果。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log('GAME NOT READY'); await browser.close(); process.exit(1); }

await page.evaluate(async () => {
  const td = await import('/src/data/tiles.ts');
  const defs = td.TILE_DEFS;
  const snowIds = new Set();
  for (let id = 0; id < defs.length; id++) {
    const v = defs[id]?.vanilla?.sheet;
    if (v === 147 || v === 161) snowIds.add(id);
  }
  const g = window.__swGame;
  const w = g.world, st = w.store, p = g.player;
  const gy = w.groundLevel;
  const colSnow = [];
  for (let x = 10; x < st.w - 10; x++) {
    let n = 0;
    for (let y = Math.max(5, gy - 80); y < Math.min(st.h - 5, gy + 40); y++) {
      if (snowIds.has(st.type[st.idx(x, y)])) n++;
    }
    colSnow.push(n);
  }
  const cand = [];
  for (let x = 16; x < colSnow.length - 16; x++) {
    let s = 0;
    for (let k = -16; k <= 16; k++) s += colSnow[x + k];
    cand.push({ x, s });
  }
  cand.sort((a, b) => b.s - a.s);
  let ty = -1, bx = -1;
  for (const cd of cand.slice(0, 40)) {
    for (let y = Math.max(4, gy - 100); y <= gy + 40; y++) {
      if (st.isSolid(cd.x, y)) {
        let open = true;
        for (let k = 1; k <= 6; k++) if (st.isSolid(cd.x, y - k)) { open = false; break; }
        if (open) { bx = cd.x; ty = y; }
        break;
      }
    }
    if (ty >= 0) break;
  }
  if (ty >= 0) {
    p.x = bx * 16 - p.w / 2;
    p.y = (ty - 3) * 16 - p.h;
    p.vx = 0; p.vy = 0;
  }
  const c = g.world.clock;
  if (typeof c.timeOfDay === 'number') c.timeOfDay = 0.9;
  if ('moonPhase' in c) { try { c.moonPhase = 0; } catch { /* noop */ } }
});
await new Promise((r) => setTimeout(r, 9000));

const shots = await page.evaluate(() => {
  const g = window.__swGame;
  const aur = g.renderer.sky.aurora;
  const gl = aur.glAurora;
  const out = {};
  if (gl.canvas && gl.canvas.width > 0) {
    out.gl = gl.canvas.toDataURL('image/png');
  }
  // 主画布天空区裁剪(0,0,1280,450)
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 450;
  cv.getContext('2d').drawImage(g.renderer.canvas, 0, 0, 1280, 450, 0, 0, 1280, 450);
  out.main = cv.toDataURL('image/png');
  out.aurOpacity = aur.opacity;
  return out;
});
if (shots.gl) fs.writeFileSync('/tmp/aur-glcanvas.png', Buffer.from(shots.gl.split(',')[1], 'base64'));
fs.writeFileSync('/tmp/aur-maincrop.png', Buffer.from(shots.main.split(',')[1], 'base64'));
console.log('saved /tmp/aur-glcanvas.png (if present) + /tmp/aur-maincrop.png; opacity=' + shots.aurOpacity);
await browser.close();
