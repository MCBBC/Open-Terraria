// 地牢内部结构诊断：墙/砖分布直方图 + zoneDungeon 判定
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const dX = g.world.dungeonX, dY = g.world.dungeonY || Math.floor(g.world.groundLevel);
  const walls = {}, types = {};
  let airWithWall = 0, airNoWall = 0;
  for (let dy = -20; dy < Math.floor(g.world.rockLevel) + 200 - dY; dy++) {
    for (let dx = -120; dx <= 120; dx++) {
      const x = dX + dx, y = dY + dy;
      if (x < 2 || y < 2 || x > st.w - 3 || y > st.h - 3) continue;
      const i = st.idx(x, y);
      walls[st.wall[i]] = (walls[st.wall[i]] ?? 0) + 1;
      if (st.flags[i]) types[st.type[i]] = (types[st.type[i]] ?? 0) + 1;
      else if (st.wall[i]) airWithWall++; else airNoWall++;
    }
  }
  // tile 名反查
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const typeNames = {};
  for (const k of Object.keys(types).sort((a, b) => types[b] - types[a]).slice(0, 8)) {
    typeNames[TILE_DEFS[+k]?.key ?? k] = types[k];
  }
  // 玩家站到几个候选点看 scene.zoneDungeon
  const scenes = [];
  for (const [ox, oy] of [[0, 60], [0, 100], [20, 80], [-20, 80]]) {
    const x = dX + ox, y = dY + oy;
    const i = st.idx(x, y);
    if (st.isSolid(x, y)) continue;
    g.player.x = (x + 0.5) * 16 - g.player.w / 2;
    g.player.y = (y - 2) * 16;
    for (let k = 0; k < 20; k++) g.fixedUpdate(1 / 60);
    scenes.push({ x, y, wall: st.wall[i], zoneDungeon: g.scene?.zoneDungeon, below: g.scene?.belowSurface });
  }
  return { dX, dY, gl: g.world.groundLevel, rock: g.world.rockLevel, walls, typeNames, airWithWall, airNoWall, scenes };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
