// 吊挂火盆(tile 592)本体缺失复现：真实放置管线 tryPlace → 渲染烘焙截图取证
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r=>setTimeout(r,1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise(r=>setTimeout(r,1500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  // itemDef 用最小代理（place_v 稳定键命名法，tryPlace 只消费 .tile/.key）
  const itemDef = { key: 'place_v_592_hanging_brazier', tile: 'v_592_hanging_brazier', name: '(proxy)' };
  out.itemFound = true; out.itemKey = itemDef.key;
  // 场景：复现用户世界数据——直接写 mark 快照 (fx 0/18, fy 18/36/54 组)
  const T = await import('/src/data/tiles.ts');
  const st = g.world.store;
  // 高空场景：干净空气 + 石头天花板
  const sx = g.world.spawnX + 12;
  let sy0 = 60;
  while (sy0 < g.world.h - 80 && st.get(sx, sy0) !== 0) sy0++;
  sy0 -= 10;
  // 玩家挪过去（相机跟随）
  g.player.x = sx*16 - 60; g.player.y = sy0*16 + 60; g.player.vx=0; g.player.vy=0;
  g.player.hp = g.player.maxHp; g.player.dead=false;
  for (let i=0;i<30;i++) g.fixedUpdate(1/60);
  // 用户 mark 快照直写 (fx∈{0,18}, fy∈{18,36}; 顶行另含 fy=? 的第三格在上方——
  //   由 marks 推断完整 2×3 组: rows y-?..y+?, 这里按截图相对位置复刻三行)
  const T592 = T.TILE_BY_KEY['v_592_hanging_brazier'];
  for (const dx of [0,1]) st.setTile(sx+dx, sy0, T.TILE_BY_KEY['stone']);   // 天花板
  const bx = sx, by = sy0 + 1;                // 组顶行=天花板下一行

  const layout = [[0,0],[0,18],[0,36],[18,0],[18,18],[18,36]];
  for (const [fx, fy] of layout) {
    const dx2 = fx/18, dy2 = fy/18;
    const i2 = st.idx(bx+dx2, by+dy2);
    st.setTile(bx+dx2, by+dy2, T592);
    st.frameX[i2] = fx; st.frameY[i2] = fy;
  }
  for (let i=0;i<45;i++) g.fixedUpdate(1/60);    // 烘焙
  return out;
});
console.log(JSON.stringify(res));
// 相机以玩家为中心 → 玩家世界位在屏幕中心；吊盆在玩家右上约 (80, -70)px(粗)
await page.waitForFunction(() => window.__swGame?.player && !window.__swGame.paused, { timeout: 60000 });
await new Promise(r=>setTimeout(r,1200));
const sc = await page.evaluate(() => ({ px: innerWidth/2 + 120, py: innerHeight/2 - 100 }));
await page.screenshot({ path: '/tmp/braz-after.png', clip: { x: Math.max(0,sc.px-90), y: Math.max(0,sc.py-110), width: 200, height: 200 } });
