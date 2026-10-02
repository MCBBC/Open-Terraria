// Z3 调试：幕 B 行为链逐帧透视（仙灵位/接触判定/原地直调/ai2）
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5841';
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

const res = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILE = 16;
  const { Enemy, fairyTreasureCoords } = await import('/src/entities/Enemy.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const GOLD = TILE_BY_KEY['ore_gold'];
  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.5;
  for (const e of g.entities.enemies) if (e.vanillaId >= 583 && e.vanillaId <= 585) e.dead = true;

  const surfaceY = (tx) => { let gy = 0; while (gy < st.h - 2 && !st.isSolid(tx, gy)) gy++; return gy; };
  let anchorTx = -1, anchorGy = -1;
  for (let tx = 120; tx < st.w - 90 && anchorTx < 0; tx += 4) {
    const gy = surfaceY(tx);
    if (gy < 8 || gy > st.h - 120) continue;
    const pl = g.player;
    pl.x = tx * TILE + 8 - pl.w / 2; pl.y = gy * TILE - pl.h; pl.vx = 0; pl.vy = 0;
    if (fairyTreasureCoords(st, pl.cx, pl.cy) === null) { anchorTx = tx; anchorGy = gy; }
  }
  const pl = g.player;
  pl.x = anchorTx * TILE + 8 - pl.w / 2; pl.y = anchorGy * TILE - pl.h; pl.vx = 0; pl.vy = 0;
  const cx = pl.cx, cy = pl.cy, px = Math.floor(cx / TILE), py = Math.floor(cy / TILE);

  // 矿脉（同幕 B 布景）
  const v0x = px + 3, v0y = py - 3;
  for (let i = v0x; i < v0x + 7; i++) for (let j = v0y; j < v0y + 7; j++) st.setTileSilent(i, j, GOLD, 0, 0);

  const f = Enemy.fromVanilla(583, cx - 8, cy - 8);
  f.ai2 = 2; f.ai3 = 0;
  g.entities.enemies.push(f);
  const frames = [];
  await new Promise((resolve) => {
    let n = 0;
    const step = () => {
      const rw = pl.w + 60, rh = pl.h / 2;
      const overlap = f.x < pl.cx + rw / 2 && f.x + f.w > pl.cx - rw / 2
        && f.y < pl.cy + rh / 2 && f.y + f.h > pl.cy - rh / 2;
      frames.push({
        n, ai2: f.ai2, ai3: +f.ai3.toFixed(0), dead: !!f.dead,
        fx: +f.x.toFixed(1), fy: +f.y.toFixed(1), fw: f.w, fh: f.h,
        noTC: f.noTileCollide, overlap,
        search: fairyTreasureCoords(st, f.cx, f.cy),
        pcx: +pl.cx.toFixed(1), pcy: +pl.cy.toFixed(1),
        hitWall: !!f.hitWall, collideY: !!f.collideY,
      });
      if (++n >= 120) resolve(); else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  f.dead = true;
  return { anchor: [anchorTx, anchorGy], vein: [v0x, v0y], player: { w: pl.w, h: pl.h }, frames };
});
const interesting = res.frames.filter((fr, i) => i < 3 || i % 10 === 0 || fr.ai2 !== res.frames[i - 1]?.ai2);
for (const fr of interesting) console.log(JSON.stringify(fr));
await b.close();
console.log('DEBUG-DONE');
