// 墓碑放置复现：tryPlace 直驱（itemDef 传 {tile:'tombstone_v'} 形状）→
// 检查 ①放置是否成功 ②地板是否被打掉 ③是否生成掉落物 ④监听链后墓碑是否还在
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5219';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 140)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('墓碑');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
}
await new Promise(r => setTimeout(r, 1500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TOMB = window.__swTiles['tombstone_v'];
  // 找平地：玩家附近 3 宽平顶（下格实心、上两格空）
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  let spot = null;
  for (let dx = -40; dx < 40 && !spot; dx++) {
    for (let dy = -20; dy < 20; dy++) {
      const x = px + dx, y = py + dy;
      if (!st.inBounds(x, y + 1)) continue;
      if (st.isActive(x, y) || st.isActive(x + 1, y) || st.isActive(x, y - 1) || st.isActive(x + 1, y - 1)) continue;
      if (st.isSolid(x, y + 1) && st.isSolid(x + 1, y + 1) && !st.half[st.idx(x, y + 1)] && !st.half[st.idx(x + 1, y + 1)]) { spot = { x, y }; break; }
    }
  }
  if (!spot) {
    // 造平地：清 4×3 区域 + 铺 3 宽石块
    const STONE = window.__swTiles['vi_3_stone_block'] ?? window.__swTiles['stone'];
    const sx = px + 6, sy = py + 4;
    for (let y = sy - 2; y <= sy; y++) for (let x = sx; x < sx + 3; x++) st.setTile(x, y, 0);
    for (let x = sx; x < sx + 3; x++) st.setTile(x, sy + 1, STONE);
    for (let i = 0; i < 10; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
    spot = { x: sx, y: sy };
  }
  const floorBefore = [st.get(spot.x, spot.y + 1), st.get(spot.x + 1, spot.y + 1)];
  // 插桩：追踪 tryPlace 期间的所有 breakTile/setTile 调用（谁拆的墓碑）
  const trace = [];
  const origBreak = g.breakTile.bind(g);
  const origSet = st.setTile.bind(st);
  g.breakTile = (x, y, a, b, c) => { trace.push(['break', x, y, st.get(x, y)]); return origBreak(x, y, a, b, c); };
  st.setTile = (x, y, t, fx, fy) => { trace.push(['set', x, y, t, fx, fy]); return origSet(x, y, t, fx, fy); };
  const dropsBefore = g.entities.drops.length;
  // 直驱 tryPlace（点击格 = 墓碑左下格 = spot.y）
  g.tryPlace(spot.x, spot.y, { key: 'vi_321_grave_marker', tile: 'tombstone_v', placeStyle: 0 });
  st.setTile = origSet;
  g.breakTile = origBreak;
  const afterPlace = {
    trace,
    dropsBefore,
    piece: [[st.get(spot.x, spot.y), st.get(spot.x + 1, spot.y)], [st.get(spot.x, spot.y + 1), st.get(spot.x + 1, spot.y + 1)]],
    floor: [st.get(spot.x, spot.y + 1), st.get(spot.x + 1, spot.y + 1)],
    drops: g.entities.drops.length,
    frames: [st.frameX[st.idx(spot.x, spot.y)], st.frameY[st.idx(spot.x, spot.y)], st.frameX[st.idx(spot.x + 1, spot.y)], st.frameY[st.idx(spot.x + 1, spot.y)]],
  };
  // 推进 60 tick 看监听链后效
  for (let i = 0; i < 60; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  const afterTicks = {
    piece: [[st.get(spot.x, spot.y), st.get(spot.x + 1, spot.y)], [st.get(spot.x, spot.y + 1), st.get(spot.x + 1, spot.y + 1)]],
    floor: [st.get(spot.x, spot.y + 1), st.get(spot.x + 1, spot.y + 1)],
    drops: g.entities.drops.length,
  };
  return { TOMB, spot, floorBefore, afterPlace, afterTicks };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
