// 竖缝复现+定位:截屏→找黑色竖列→dump 该列墙/地块/带层数据
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
// 传送到用户区域,放火把照明
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player, st = g.world.store;
  const cx = 341, cy = 422;
  // 原样场景:玩家持火把(手持光源)走查
  const TORCH_ITEM = 8;   // 火把物品
  pl.inv.slots[pl.inv.selected] = { id: TORCH_ITEM, stack: 1 };
  g.cb.onInventoryChanged?.();
  pl.x = cx * 16; pl.y = cy * 16 - pl.h / 2; pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1500));
  // 孤立暗列检测:火把照明行内,本列黑 且 ±24px 同行亮
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
  const ctx2 = c2.getContext('2d');
  ctx2.drawImage(cv, 0, 0);
  const full = ctx2.getImageData(0, 0, cv.width, cv.height).data;
  const W = cv.width, H = cv.height;
  const bright = (x, y) => {
    const d = (y * W + x) * 4;
    return full[d] + full[d + 1] + full[d + 2] > 45;
  };
  const seams = [];
  for (let sx = 130; sx < W - 130; sx++) {
    let isolated = 0;
    for (let sy = 120; sy < H - 120; sy++) {
      if (!bright(sx, sy) && bright(sx - 24, sy) && bright(sx + 24, sy)) isolated++;
    }
    if (isolated > 25) seams.push({ sx, isolated });
  }
  const merged = [];
  for (const s of seams) {
    const last = merged[merged.length - 1];
    if (last && s.sx - last.sx <= 4) { last.isolated = Math.max(last.isolated, s.isolated); }
    else merged.push({ ...s });
  }
  // 带层平铺参数对照:缝的世界 x → 相对带层周期的位置
  const G = window.__swGame;
  const cam = G.camera;
  const z = cam.zoom;
  const outSeams = merged.map((s) => {
    const wx = cam.x + (s.sx - W / 2) / z;
    return { ...s, worldX: Math.round(wx), mod128: ((Math.round(wx) % 128) + 128) % 128, mod96: ((Math.round(wx) % 96) + 96) % 96 };
  });
  window.__seams = outSeams;
  return { seamCount: outSeams.length, seams: outSeams.slice(0, 10) };
});
console.log(JSON.stringify(out));
await page.screenshot({ path: '/tmp/seamhunt.png' });
await browser.close();
