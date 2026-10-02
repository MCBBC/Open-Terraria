// BJ434 状态门截图探针：同一 setups,在 ai2=3（起舞）/ai2=4（带路）/ai2=5（终演）
// 三个状态窗内各截一帧留档 docs/evidence/bj434/。
// 运行:SW_ORIGIN=http://localhost:5801 node tools/run-diag.mjs scripts/_bj434-fairy-shots.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const EV = new URL('../docs/evidence/bj434/', import.meta.url).pathname;
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2500));

await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILE = 16;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.5;
  for (const e of g.entities.enemies) if (e.vanillaId >= 583 && e.vanillaId <= 585) e.dead = true;
  const ptx = Math.floor(g.player.cx / TILE);
  let gy = Math.floor(g.player.cy / TILE);
  while (gy < st.h - 2 && !st.isSolid(ptx, gy)) gy++;
  st.setTileSilent(ptx + 6, gy - 2, TILE_BY_KEY['chest'], 0, 0);
  const fairy = Enemy.fromVanilla(583, g.player.cx - 9, (gy - 6) * TILE);
  fairy.ai2 = 2; fairy.ai3 = 0;
  g.entities.enemies.push(fairy);
  window.__bj434f = fairy;
});

const waitState = async (state, timeoutMs) => p.waitForFunction(
  (s) => { const f = window.__bj434f; return f && !f.dead && f.ai2 === s; },
  { timeout: timeoutMs, polling: 100 },
).then(() => true).catch(() => false);

const fairyCenter = () => p.evaluate(() => {
  const g = window.__swGame;
  const f = window.__bj434f;
  if (!f || f.dead) return null;
  const [sx, sy] = g.camera.worldToScreen(f.cx, f.cy);
  return { sx: Math.round(sx), sy: Math.round(sy), ai2: f.ai2 };
});

// 镜头跟仙灵（确保入画）
const followShot = async (name) => {
  for (let i = 0; i < 10; i++) {
    const c = await fairyCenter();
    if (c) await p.evaluate((sx, sy) => {
      const g = window.__swGame;
      const [wx, wy] = [g.camera.x, g.camera.y];
      void wx; void wy;
      g.camera.x += (sx - 640) ; g.camera.y += (sy - 400);
    }, c.sx, c.sy).catch(() => {});
    await new Promise(r => setTimeout(r, 50));
  }
  await new Promise(r => setTimeout(r, 350));
  await p.screenshot({ path: EV + name });
  const c = await fairyCenter();
  console.log(name, JSON.stringify(c));
};

await waitState(2, 15000);
await followShot('bj434-s2-seek.png');
await waitState(3, 20000);
await followShot('bj434-s3-dance.png');
await waitState(4, 30000);
await followShot('bj434-s4-lead.png');
await waitState(5, 30000);
await followShot('bj434-s5-finale.png');
console.log('SHOTS-DONE');
await b.close();
