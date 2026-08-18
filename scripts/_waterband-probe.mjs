// 半砖浸润带验证(2026-08-19):原版 :3943 flag5 = 半砖格【自己格内】的液体画
// 浸润;旧实现只读四邻 = 整类缺失。场景:铺一排半砖,格内灌水,截图数水色带。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=240000 scripts/_waterband-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = '/Users/vinlic/.claude/jobs/8405c930/tmp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/waterband-profile`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').catch(() => {})).catch(() => {});
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });

// 造景:手动筑台(铺土行+清空上方 3 行),6 格砸半砖并格内灌水
const setup = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const dirt = window.__swTileByKey('dirt');
  if (!(dirt > 0)) return { err: 'dirt id 缺失' };
  const sx = Math.floor(g.player.cx / 16) - 6, sy = Math.floor(g.world.groundLevel) + 6;
  for (let x = sx; x < sx + 12; x++) {
    for (let dy = -3; dy <= 0; dy++) st.setTile(x, sy + dy, dy === 0 ? dirt : 0, 0);
    st.setLiquid(x, sy, 0, 1);
  }
  // 6 格半砖+格内水 200(flag5 需 >160);后 3 格整块+其上格灌水(对照:侧向浸润)
  for (let k = 0; k < 6; k++) {
    const i = st.idx(sx + k, sy);
    st.half[i] = 1;
    st.setLiquid(sx + k, sy, 200, 1);
  }
  for (let k = 7; k < 10; k++) st.setLiquid(sx + k, sy - 1, 200, 1);
  g.player.x = (sx + 5) * 16; g.player.y = (sy - 5) * 16;
  return { sx, sy };
});
console.log('场景:', JSON.stringify(setup));
await sleep(4000);

const shot = await page.screenshot({ type: 'png' });
fs.writeFileSync(`${TMP}/waterband.png`, shot);
// 量化:半砖行(sy)的屏面水色像素(水色≈蓝,土=棕)。
// 相机:玩家中心;zoom 默认 1(小地图 zoom 不影响世界渲染)。
const stats = await page.evaluate((sy) => {
  const r = window.__swGame.renderer;
  const cam = { x: window.__swGame.player.x, y: window.__swGame.player.y };
  const cv = r.canvas, ctx = cv.getContext('2d');
  const z = 1;
  const worldToScreen = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  const countBlue = (x0, y0, w, h) => {
    const d = ctx.getImageData(x0, y0, w, h).data;
    let blue = 0, brown = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (A > 100 && B > 90 && B > R + 25 && B > G + 15) blue++;
      else if (A > 100 && R > 100 && R > B + 25 && G > B) brown++;
    }
    return { blue, brown };
  };
  // 半砖行 sy 的 6 格(世界像素 sy*16..sy*16+16)
  const [hx0, hy0] = worldToScreen(setup.sx0, sy * 16);
  return { err: 'placeholder' };
}, setup.sy).catch((e) => ({ err: String(e).slice(0, 120) }));
// 上面 evaluate 里 worldToScreen 用了 setup.sx0——简化:直接在页面里重找 sx
const final = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer, st = g.world.store;
  const cv = r.canvas, ctx = cv.getContext('2d');
  const cam = { x: g.player.x, y: g.player.y };
  const z = 1;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  // 重找半砖格:half=1 且有液体的 6 格
  const cells = [];
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
    const i = y * st.w + x;
    if (st.half[i] && st.liquid[i] > 100) cells.push({ x, y });
    if (cells.length >= 6) break;
  }
  if (!cells.length) return { err: '半砖格未找到(造景失败?)' };
  const y0 = cells[0].y;
  let blueInHalf = 0, brownInHalf = 0, blueTotal = 0;
  for (const c of cells) {
    const [sx, sy] = w2s(c.x * 16, c.y * 16);
    const d = ctx.getImageData(Math.round(sx), Math.round(sy), 16, 16).data;
    for (let i = 0; i < d.length; i += 4) {
      const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (A > 100 && B > 90 && B > R + 25 && B > G + 15) blueInHalf++;
      else if (A > 100 && R > 100 && R > B + 25) brownInHalf++;
    }
  }
  return { halfCells: cells.length, blueInHalf, brownInHalf, rowY: y0 };
}).catch((e) => ({ err: String(e).slice(0, 160) }));
console.log('[半砖格像素]', JSON.stringify(final));
const ok = final.halfCells >= 5 && final.blueInHalf > 80;
console.log(ok ? 'PASS: 半砖格内水的浸润带已渲染' : 'FAIL: 半砖浸润带缺失或不足');
await browser.close();
process.exit(ok ? 0 : 1);
