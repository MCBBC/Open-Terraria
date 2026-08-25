// 蚁狮沙球落档探针：Dart 31 与 FallingBlock 落地放置语义（Projectile.Kill aiStyle==10 等价）
// ★全部用本仓 id 域（TILE_BY_KEY/VANILLA_TILE_ID）——原版 id 直写=别的方块
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 1000));
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const { Dart } = await import('/src/entities/Dart.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const T = {
    sand: tiles.TILE_BY_KEY['sand'],
    grass: tiles.TILE_BY_KEY['grass'],
    plant: tiles.TILE_BY_KEY['v_3_forest_short_plants'],
    cactus: tiles.TILE_BY_KEY['v_80_cactus'],
    dirt: tiles.TILE_BY_KEY['dirt'],
  };

  // 场地：出生点东侧,清空工作区
  const X = g.world.spawnX + 12;
  const Y = Math.floor(g.world.groundLevel);
  const clearCol = (cx) => { for (let dy = -9; dy <= -1; dy++) if (st.inBounds(cx, Y + dy) && st.get(cx, Y + dy) !== 0) st.setTile(cx, Y + dy, 0, 0, 0); };
  for (let dx = -4; dx <= 4; dx++) { clearCol(X + dx); st.setTile(X + dx, Y, T.grass, 0, 0); }

  const colScan = (cx) => {
    const hits = [];
    for (let dy = -9; dy <= -1; dy++) { const t = st.get(cx, Y + dy); if (t !== 0) hits.push([Y + dy - Y, t]); }
    return hits;
  };
  const spawnDart = (tx, ty) => {
    const d = new Dart(tx * 16 + 3, ty * 16 + 3, 0, 5, 10, 31);
    d.hostile = true;
    g.entities.add(d, 'projectiles');
    return d;
  };

  const res = {};
  // A) 裸草：沙球垂直落 → 沙贴格占据草上方空格
  spawnDart(X, Y - 6);
  await sleep(1200);
  res.A_bareGrass = { col: colScan(X), pass: st.get(X, Y - 1) === T.sand && st.get(X, Y) === T.grass };

  // B) 草苗占落点格 → 沙消失(不悬空叠放)
  clearCol(X);
  st.setTile(X, Y - 1, T.plant, 0, 0);
  spawnDart(X, Y - 7);
  await sleep(1200);
  res.B_plant = { col: colScan(X), pass: st.get(X, Y - 2) === 0 && st.get(X, Y - 1) === T.plant };

  // C) 仙人掌(沙底支撑,合法锚) :沙落仙人掌顶 → 贴格放置,不顶进臂位
  clearCol(X);
  st.setTile(X, Y, T.sand, 0, 0);
  st.setTile(X, Y - 1, T.cactus, 0, 0);
  spawnDart(X, Y - 6);
  await sleep(1200);
  res.C_cactus = { col: colScan(X), pass: st.get(X, Y - 2) === T.sand || st.get(X, Y - 1) === T.sand };
  st.setTile(X, Y, T.grass, 0, 0);
  clearCol(X);

  // D) 下落沙回归：支撑被挖 → 坠落 → 贴格落回草上方
  st.setTile(X, Y - 5, T.sand, 0, 0);
  st.setTile(X, Y - 6, T.dirt, 0, 0);      // 先给沙一个支撑
  st.setTile(X, Y - 6, 0, 0, 0);           // 挖支撑 → 监听器触发下落
  await sleep(1500);
  res.D_falling = { col: colScan(X), pass: st.get(X, Y - 1) === T.sand };

  // E) 下落沙 × 草苗落点格被占 → 消失
  st.setTile(X, Y - 1, T.plant, 0, 0);
  st.setTile(X, Y - 5, T.sand, 0, 0);
  st.setTile(X, Y - 6, T.dirt, 0, 0);
  st.setTile(X, Y - 6, 0, 0, 0);
  await sleep(1500);
  res.E_fallingPlant = { col: colScan(X), pass: st.get(X, Y - 2) === 0 && st.get(X, Y - 1) === T.plant };

  clearCol(X);
  return res;
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
