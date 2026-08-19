// 箭打 Enemy 376 调试 v3：箭贴靶生成（同行空气袋内）+ 起点实心检查
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
await new Promise(r => setTimeout(r, 2000));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const TILE = 16;
  const st = g.world.store;
  g.enemySpawnEnabled = false;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const res = {};
  const stx = Math.floor(g.player.cx / TILE);
  let gy = Math.floor(g.world.groundLevel) - 6;
  while (gy < st.h - 4 && !st.isSolid(stx, gy)) gy++;
  const tx = stx + 6;
  let ty = Math.floor(g.player.cy / TILE);
  while (ty < st.h - 4 && !st.isSolid(tx, ty)) ty++;
  const e = Enemy.fromVanilla(376, tx * TILE + 8, (ty - 1) * TILE);
  e.id = g.entities.nextId++;
  g.entities.add(e, 'enemies');
  await sleep(400);
  res.target = { x: Math.round(e.x), y: Math.round(e.y), hp: e.hp };
  // 箭贴靶左 20px,同行
  const sx = e.x - 20, sy = e.cy - 3;
  res.spawnSolid = { tile: [Math.floor(sx / TILE), Math.floor(sy / TILE)], solid: st.isSolid(Math.floor(sx / TILE), Math.floor(sy / TILE)) };
  const a = new Arrow(sx, sy, 8, 0, 25, 3, 1);
  a.id = g.entities.nextId++;
  g.entities.add(a, 'projectiles');
  res.traj = [];
  for (let i = 0; i < 8; i++) {
    await sleep(100);
    res.traj.push({ t: i, ax: Math.round(a.x), dead: !!a.dead, ehp: e.hp });
  }
  res.arrow_enemy376 = { dmg: 250 - e.hp };
  e.dead = true; a.dead = true;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
