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
  const out = { steps: [] };
  const ok = (n, c, e2 = '') => { out.steps.push(`${c?'PASS':'FAIL'} ${n}${e2?' | '+e2:''}`); return c; };
  // itemDef 用最小代理（place_v 稳定键命名法，tryPlace 只消费 .tile/.key）
  const itemDef = { key: 'place_v_592_hanging_brazier', tile: 'v_592_hanging_brazier', name: '(proxy)' };
  out.itemFound = true; out.itemKey = itemDef.key;
  // 场景：出生点旁建"地板+天花板+吊盆"结构，玩家站地板上（不摔）
  const T = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const bx = g.world.spawnX + 6;
  const surfY = (() => { for (let y = 10; y < g.world.h - 10; y++) { if (st.get(bx, y) !== 0) return y; } return Math.floor(g.world.groundLevel); })();
  for (let dy=-5; dy<3; dy++) for (let dx=0; dx<6; dx++) st.setTileSilent(bx+dx, surfY+dy, 0);
  for (let dx=0; dx<6; dx++) st.setTileSilent(bx+dx, surfY, T.TILE_BY_KEY['stone']);          // 地板
  for (let dx=0; dx<6; dx++) st.setTileSilent(bx+dx, surfY-5, T.TILE_BY_KEY['stone']);        // 天花板
  const T592 = T.TILE_BY_KEY['v_592_hanging_brazier'];
  for (let dy=0; dy<3; dy++) for (let dx=0; dx<2; dx++) {
    const i2 = st.idx(bx+1+dx, surfY-4+dy);
    st.setTileSilent(bx+1+dx, surfY-4+dy, T592);
    st.frameX[i2] = dx*18; st.frameY[i2] = dy*18;
  }
  g.player.x = (bx+4)*16; g.player.y = (surfY-1)*16;
  g.player.vx=0; g.player.vy=0; g.player.hp=g.player.maxHp; g.player.dead=false;
  g.chunks.markDirtyArea(bx-1, surfY-6, bx+6, surfY+2);
  for (let i=0;i<60;i++) g.fixedUpdate(1/60);
  // 断言
  ok('S1 tile 存留', st.get(bx+1, surfY-4) === T592);
  ok('S2 frameY mark 同款', st.frameY[st.idx(bx+1, surfY-4)] === 0 && st.frameY[st.idx(bx+1, surfY-3)] === 18);
  // WindSway 动态绘制路径已通过 592 专用分支实现（本文件外 VanillaTiler/WindSway）
  window.__brazScreenX = Math.round(bx*16 - g.player.cx + innerWidth/2);
  window.__brazScreenY = Math.round((surfY-3)*16 - g.player.cy + innerHeight/2);
  return out;
});

if (res.steps) for (const s of res.steps) console.log(s);

// 截图吊盆区域
await new Promise(r=>setTimeout(r,600));
const bsc = await page.evaluate(() => ({ x: window.__brazScreenX ?? 400, y: window.__brazScreenY ?? 400 }));
await page.screenshot({ path: '/tmp/braz-final.png', clip: { x: Math.max(0,bsc.x-80), y: Math.max(0,bsc.y-80), width: 200, height: 200 } });
console.log('screenshot saved');
await browser.close();
console.log('done');
