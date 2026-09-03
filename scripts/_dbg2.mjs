import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const MAP = '/Users/vinlic/Downloads/map-饥饿的庄园 (1).json';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const p = await b.newPage();
let booted = false;
for (let attempt = 0; attempt < 3 && !booted; attempt++) {
  await p.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson).catch(() => false)) { booted = true; break; }
  }
}
await p.evaluate(async t => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame?.world?.store?.w).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => {
  const g = window.__swGame;
  g.liquid.updateLiquid = () => {};
  g.player.debugGod = true; g.player.hp = g.player.maxHp; g.player.dead = false;
  try { g.setZoom(0.5); } catch (e) {}
});
await p.evaluate(() => {
  const g = window.__swGame, pl = g.player;
  pl.x = 3664 * 16 - pl.w / 2; pl.y = (1136 - 12) * 16;
  pl.vx = 0; pl.vy = 0;
});
await new Promise(r => setTimeout(r, 2500));
const diag = await p.evaluate(() => {
  const g = window.__swGame, st = g.world.store, cam = g.camera;
  const canvas = g.renderer.canvas;
  // 统计视野内坡面×液
  let slopeIn = 0, liqIn = 0;
  const zEff = cam.zoom * (canvas.width / canvas.clientWidth);
  const hw = canvas.width / 2 / zEff, hh = canvas.height / 2 / zEff;
  for (let x = Math.floor(cam.x - hw); x <= cam.x + hw; x++) {
    for (let y = Math.floor(cam.y - hh); y <= cam.y + hh; y++) {
      if (x < 1 || y < 1 || x >= st.w - 1 || y >= st.h - 1) continue;
      const i = st.idx(x, y);
      if (st.flags[i] && (st.slope[i] || st.half[i])) slopeIn++;
      if (st.liquid[i] > 0) liqIn++;
    }
  }
  return { cam: { x: cam.x, y: cam.y, z: cam.zoom }, pl: { x: g.player.x / 16, y: g.player.y / 16, dead: g.player.dead },
    canvas: { w: canvas.width, cw: canvas.clientWidth }, slopeIn, liqIn, zoomApi: !!g.setZoom };
});
console.log(JSON.stringify(diag, null, 1));
await b.close();
