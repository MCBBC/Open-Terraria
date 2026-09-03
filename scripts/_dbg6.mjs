import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const MAP = '/Users/vinlic/Downloads/map-饥饿的庄园 (1).json';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 800, height: 600 },
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
  g.player.debugGod = true;
});
const s0 = await p.evaluate(() => {
  const g = window.__swGame, pl = g.player;
  pl.x = 1679 * 16 - pl.w / 2; pl.y = 451 * 16;
  pl.vx = 0; pl.vy = 0;
  return { x: pl.x / 16, y: pl.y / 16, dead: pl.dead, hp: pl.hp, respawn: pl.respawnTime };
});
await new Promise(r => setTimeout(r, 1200));
const s1 = await p.evaluate(() => {
  const g = window.__swGame, pl = g.player;
  return { x: pl.x / 16, y: pl.y / 16, dead: pl.dead, hp: pl.hp, camx: g.camera.x / 16, camy: g.camera.y / 16, z: g.camera.zoom };
});
console.log('T0:', JSON.stringify(s0));
console.log('T+1.2s:', JSON.stringify(s1));
await b.close();
