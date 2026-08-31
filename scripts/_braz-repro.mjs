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
  // 玩家挪过去（相机跟随）
  g.player.x = sx*16 - 60; g.player.y = sy*16 + 40; g.player.vx=0; g.player.vy=0;
  g.player.hp = g.player.maxHp; g.player.dead=false;
  for (let i=0;i<30;i++) g.fixedUpdate(1/60);
  // 背后木墙（wall id 21 木栅? 用 1 通用墙）铺满 2×3
  for (let dy=0; dy<3; dy++) for (let dx=0; dx<2; dx++) {
    st.wall[st.idx(sx+dx, sy+dy)] = 5;
    st.setTile(sx+dx, sy+dy, 0);
  }
  // 真实放置：tryPlace(tx=sx, ty=sy, itemDef)
  const r1 = g['tryPlace'](sx, sy, itemDef);
  out.tryPlaceRet = r1;
  out.tileWritten = st.get(sx, sy+1);
  out.fx = st.frameX[st.idx(sx, sy+1)], out.fy = st.frameY[st.idx(sx, sy+1)];
  for (let i=0;i<40;i++) g.fixedUpdate(1/60);    // 烘焙
  out.store592Count = (() => {
    let c=0; for (let y=0;y<st.h;y+=7) for (let x=0;x<st.w;x+=7) if (st.type[st.idx(x,y)]===out.tileWritten) c++;
    return 'sampled='+c;
  })();
  return out;
});
console.log(JSON.stringify(res));
// 截屏看效果
const cam = await page.evaluate(() => { const c = window.__swGame.renderer.camera; return {x:c.x,y:c.y,zoom:c.zoom,vw:innerWidth,vh:innerHeight}; });
console.log('camera', JSON.stringify(cam));
await page.screenshot({ path: '/tmp/braz-after.png' });
await browser.close();
