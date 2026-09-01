// 沙尘穿斜坡实机探针（2026-09-01 用户报"沙有几率穿透斜方块进屋"回归）:
// 真世界 store 砌一列沙墙,放一粒 268 使其【盒右缘搭进墙列 3px、中心点在左侧空气格】
// ——旧中心点单格门必漏判(穿墙根因),新 10×10 盒门必命中。跑生产 update() 单拍断言收缩。
// 另验真 SOLID_LUT(沙实心=1/工作台平台=0)。
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
  await new Promise((r) => setTimeout(r, 1500));
  const g = window.__swGame;
  const { solidCollisionBox } = await import('/src/render/WeatherRenderer.ts');
  const { TileStore } = await import('/src/world/TileStore.ts');
  const tiles = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const sand = tiles.TILE_BY_KEY['sand'];
  const workbench = tiles.TILE_BY_KEY['workbench'];
  const lutSand = TileStore.SOLID_LUT[sand];
  const lutBench = TileStore.SOLID_LUT[workbench];

  // 场地:出生点东侧清一块,砌一道 1 格厚沙墙(顶格斜坡框)
  const X = g.world.spawnX + 14, Y = Math.floor(g.world.groundLevel);
  for (let dy = -9; dy <= 0; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (st.inBounds(X + dx, Y + dy)) st.setTile(X + dx, Y + dy, 0, 0, 0, 0);
    }
  }
  for (let dy = -6; dy <= 0; dy++) st.setTile(X, Y + dy, sand, 0, 0, 0);
  st.setTile(X, Y - 7, sand, 0, 0, 2);          // 斜坡框沙(SolidCollision 对斜坡按整格算)
  const wallX = X * 16;

  // ★判别几何(1 格厚墙下旧门的真漏判窗):position = wallX+13 → 盒 [wallX+8, wallX+18]
  //   仍与墙列 [wallX, wallX+16) 重叠,但中心采样 px+5 = wallX+18 已在远侧空气格 X+1
  //   (旧单点门=漏判)——即粒心穿墙而盒尚在墙内的窗口
  const px = wallX + 13, py = Y * 16 - 8;
  const centerCellSolid = st.isSolid(Math.floor((px + 5) / 16), Math.floor((py + 5) / 16));
  const boxHit = solidCollisionBox(st, px - 5, py - 5, 10, 10);

  // 生产 update() 单拍:关沙暴发射防干扰,vx=8 → 移动后仍与墙列重叠 → 收缩
  const savedStorm = g.world.weather.sandstorm.happening;
  g.world.weather.sandstorm.happening = false;
  const wr = g.renderer.weatherFx;
  wr.sand.length = 0;
  const grain = { x: px, y: py, vx: -8, vy: 0, scale: 0.9, fadeIn: 0, cr: 200, cg: 160, cb: 20, frame: 0, active: true };
  wr.sand.push(grain);
  g.world.weather.sandstorm.happening = savedStorm === undefined ? false : false;
  wr.update(g.world, 1280, 800, px - 300, py - 300, 0, 0);
  const hitScale = grain.scale;
  const hitVx = grain.vx;
  wr.sand.length = 0;
  g.world.weather.sandstorm.happening = savedStorm;

  // 平台语义(静态盒测):工作台格 → 不算实心
  st.setTile(X + 2, Y - 6, workbench, 0, 0, 0);
  const benchHit = solidCollisionBox(st, (X + 2) * 16 + 4, (Y - 6) * 16 + 4, 10, 10);
  st.setTile(X + 2, Y - 6, 0, 0, 0, 0);

  return { lutSand, lutBench, centerCellSolid, boxHit, hitScale, hitVx, benchHit };
});

console.log(JSON.stringify(out));
const ok = out.lutSand === 1 && out.lutBench === 0
  && out.centerCellSolid === false && out.boxHit === true
  && out.hitScale < 0.9 && !out.benchHit;
console.log(`sand LUT=${out.lutSand} bench LUT=${out.lutBench}`);
console.log(`center-cell(old gate)=${out.centerCellSolid} box(new gate)=${out.boxHit}  ← 判别对`);
console.log(`after 1 update tick: scale=${out.hitScale.toFixed(4)}(<0.9 收缩) vx=${out.hitVx.toFixed(3)}`);
console.log(`bench(platform) hit=${out.benchHit}(want false)`);
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
