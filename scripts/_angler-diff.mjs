// 像素差分：定位 bound TownNPC angler 与 Enemy 376 的真实渲染区
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 3000));
await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const TILE = 16;
  const st = g.world.store;
  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.5;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const ptx = Math.floor(g.player.cx / TILE);
  let ty = Math.floor(g.player.cy / TILE);
  while (ty < st.h - 4 && !st.isSolid(ptx, ty)) ty++;
  g.player.x = ptx * TILE; g.player.y = (ty - 3) * TILE; g.player.vx = 0; g.player.vy = 0;
  await sleep(800);
  window.__bn = new TownNPC('angler', (ptx - 4) * TILE + 8, ty * TILE);
  window.__bn.id = g.entities.nextId++;
  window.__bn.bound = true;
  g.entities.add(window.__bn, 'npcs');
  window.__e376 = Enemy.fromVanilla(376, (ptx + 4) * TILE + 8, (ty - 1) * TILE);
  window.__e376.id = g.entities.nextId++;
  g.entities.add(window.__e376, 'enemies');
  await sleep(1500);
});
await new Promise(r => setTimeout(r, 300));
await p.screenshot({ path: 'shots/_angler-diff-with.png' });
await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  window.__bn.dead = true;
  window.__e376.dead = true;
  await sleep(500);
});
await new Promise(r => setTimeout(r, 300));
await p.screenshot({ path: 'shots/_angler-diff-without.png' });
await b.close();
