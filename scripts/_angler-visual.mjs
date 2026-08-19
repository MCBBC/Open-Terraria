// 渲染对照：bound TownNPC 'angler' vs Enemy 376 在已加载区的可见性
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
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const TILE = 16;
  const st = g.world.store;
  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.5;   // 正午光照
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const res = {};
  // 玩家脚下已加载区：左右各放一个靶（间距 6 格，玩家居中不动）
  const ptx = Math.floor(g.player.cx / TILE);
  let ty = Math.floor(g.player.cy / TILE);
  while (ty < st.h - 4 && !st.isSolid(ptx, ty)) ty++;
  g.player.x = ptx * TILE; g.player.y = (ty - 3) * TILE; g.player.vx = 0; g.player.vy = 0;
  await sleep(800);
  // 左：bound TownNPC 'angler'；右：Enemy 376
  const bn = new TownNPC('angler', (ptx - 4) * TILE + 8, ty * TILE);
  bn.id = g.entities.nextId++;
  bn.bound = true;
  g.entities.add(bn, 'npcs');
  const e376 = Enemy.fromVanilla(376, (ptx + 4) * TILE + 8, (ty - 1) * TILE);
  e376.id = g.entities.nextId++;
  g.entities.add(e376, 'enemies');
  await sleep(1500);
  res.ents = {
    bound: { x: Math.round(bn.x), y: Math.round(bn.y), bound: !!bn.bound, dead: !!bn.dead },
    e376: { x: Math.round(e376.x), y: Math.round(e376.y), dead: !!e376.dead },
    player: { x: Math.round(g.player.x), y: Math.round(g.player.y) },
  };
  return res;
});
await new Promise(r => setTimeout(r, 500));
await p.screenshot({ path: 'shots/_angler-visual.png' });
console.log(JSON.stringify(out, null, 1));
await b.close();
