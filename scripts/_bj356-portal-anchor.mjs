// BJ356 face5 e2e：真 useEterniaStand 链——薄平台+点座【顶格】→ 水晶贴地表 + 门户在竞技场两端
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow?.newWorld, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('424242', 4200, 1200));
await page.waitForFunction(() => window.__swGame?.player, { timeout: 300000 });
await new Promise(r => setTimeout(r, 2000));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE } = await import('/src/core/constants.ts');
  const st = g.world.store;
  const bx = 2100;
  // 薄平台 2 行（41-42），±80 格；座 466 立平台顶（行 37-40,帧 0/18/36/54）
  for (let dx = -80; dx <= 80; dx++) { st.setTile(bx + dx, 41, 1); st.setTile(bx + dx, 42, 1); }
  for (let k = 0; k < 4; k++) {
    st.setTile(bx, 37 + k, 466);
    const i = st.idx(bx, 37 + k);
    st.frameX[i] = 0; st.frameY[i] = k * 18;
  }
  // 玩家给 3828（永恒水晶）+ 拉到座旁
  const manaIid = window.__swFlow.itemByVid(3828);
  g.player.inv.add(manaIid, 1);
  g.player.x = (bx - 6) * TILE; g.player.y = 39 * TILE; g.player.vx = 0; g.player.vy = 0;
  await new Promise(r => setTimeout(r, 300));
  // 真 useEterniaStand（TS private 仅编译期）——模拟点击【顶格】(bx, 37, frameY=0)
  g.useEterniaStand(bx, 37);
  await new Promise(r => setTimeout(r, 700));
  const crystal = g.entities.enemies.find(e => !e.dead && e.vanillaId === 548);
  const portals = g.entities.enemies.filter(e => !e.dead && e.vanillaId === 549);
  const surfacePx = 41 * TILE;
  return {
    ongoing: g.world.oldOnesArmy.ongoing,
    crystalFeet: crystal ? Math.round(crystal.y + crystal.h) : null,
    surfacePx,
    crystalBuried: crystal ? (crystal.y + crystal.h) > surfacePx + 2 : null,
    portalDistTiles: portals.map(p => Math.round(Math.abs(p.cx - crystal.cx) / TILE)),
    portalFeetY: portals.map(p => Math.round(p.y + p.h)),
  };
});
console.log(JSON.stringify(res, null, 2));
await browser.close();
