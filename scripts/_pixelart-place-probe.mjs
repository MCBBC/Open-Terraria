// 像素画放置复现：合成 12×8 网格 → placeArt 同款写入 → 逐行清点 store
// → 推进 tick 后复查（判别：写入期塌缩 vs 放置后清扫 vs 渲染塌缩）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5219';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 120)));
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
  await page.keyboard.type('像素');
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
  const PIX = window.__swTiles['pixel_block'];
  if (!PIX) return { fail: 'no pixel_block key' };
  // 合成 12×8 网格：每行不同色
  const GW = 12, GH = 8;
  const rgba = new Uint8ClampedArray(GW * GH * 4);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = (y * GW + x) * 4;
    rgba[i] = 20 + y * 30; rgba[i + 1] = 200 - y * 20; rgba[i + 2] = 100; rgba[i + 3] = 255;
  }
  // 找空地：玩家正上方 30 格起找 14×12 全空区
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const clear = (x0, y0) => {
    for (let y = y0; y < y0 + GH + 2; y++) for (let x = x0; x < x0 + GW; x++) if (st.flags[st.idx(x, y)]) return false;
    return true;
  };
  let ox = -1, oy = -1;
  outer: for (let dy = 40; dy > 5; dy--) for (let dx = -30; dx < 30; dx++) {
    if (clear(px + dx, py - dy)) { ox = px + dx; oy = py - dy; break outer; }
  }
  if (ox < 0) return { fail: 'no clear area' };
  // placeArt 同款写入
  let n = 0;
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    const i = (cy * GW + cx) * 4;
    const r = rgba[i], gg = rgba[i + 1], b = rgba[i + 2];
    st.setTile(ox + cx, oy + cy, PIX, ((r || 1) << 8) | (gg || 1), b || 1);
    n++;
  }
  const rowScan = () => {
    const rows = [];
    for (let y = 0; y < GH; y++) {
      let cnt = 0;
      for (let x = 0; x < GW; x++) if (st.type[st.idx(ox + x, oy + y)] === PIX) cnt++;
      rows.push(cnt);
    }
    return rows;
  };
  const immediate = rowScan();
  // 推进 120 tick（让任何清扫/物理跑过）
  for (let i = 0; i < 120; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  const afterTicks = rowScan();
  // ① 自发光：把时间拨到午夜+传玩家到艺术旁地下暗处，采样艺术格 vs 邻近空气格光照
  g.world.clock.timeOfDay = 0.0; g.world.clock.dayTime = true;   // 午夜
  g.player.x = (ox + GW / 2) * 16; g.player.y = (oy + GH + 6) * 16;
  for (let i = 0; i < 30; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  const lightAt = g.renderer.lighting.lightAt.bind(g.renderer.lighting);
  const artLight = lightAt(ox + 6, oy + 4);
  const airLight = lightAt(ox + 6, oy - 4);      // 艺术上方 4 格（溢光）
  const farLight = lightAt(ox + 6, oy + GH + 4); // 下方远处（无溢光基准）
  // ② 可通行：玩家落进艺术格内 → 不被顶到艺术顶部 = 穿透
  g.player.x = (ox + 6) * 16; g.player.y = (oy + 2) * 16;
  for (let i = 0; i < 60; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  const feetTile = Math.floor((g.player.y + g.player.h) / 16);
  const insideArt = feetTile < oy + GH;          // 脚仍处艺术行内 = 未被顶起
  return { placed: n, ox, oy, immediate, afterTicks,
    artLight, airLight, farLight, feetTile, insideArt,
    solidDef: (window.__swTiles && undefined) ?? undefined };
});
console.log(JSON.stringify(res));
await page.screenshot({ path: '/tmp/pixelart-place.png' });
await browser.close();
