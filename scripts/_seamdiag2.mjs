// 竖缝数据级诊断:复现竖井 → 实测缝列 → 反算世界列 dump 墙/块 → A/B 清墙对照
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

// 挖竖井+放火把+固定玩家(与 _bandwalk-probe 同参)
const loc = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const cx = 341;
  const cy = Math.round((g.world.groundLevel + g.world.rockLevel) / 2 + 40);   // 当前海滩翻转深度
  for (let y = cy - 14; y <= cy + 12; y++)
    for (let x = cx - 3; x <= cx + 3; x++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); st.liquid[st.idx(x, y)] = 0; }
  const TORCH = window.__swTileByKey?.('torch') ?? 4;
  for (const y of [cy - 12, cy - 6, cy, cy + 5, cy + 10]) st.setTileSilent(cx + 3, y, TORCH);
  const pl = g.player;
  window.__pin = () => { pl.x = cx * 16 + 8 - pl.w / 2; pl.y = cy * 16 + 8 - pl.h / 2; pl.vx = 0; pl.vy = 0; };
  window.__pin();
  return { cy, ws: g.world.groundLevel, rock: g.world.rockLevel };
});
console.log('LOC', JSON.stringify(loc));
for (let i = 0; i < 5; i++) {
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => window.__pin());
}
const alive = await page.evaluate(() => {
  const g = window.__swGame, pl = g.player, st = g.world.store;
  const i = st.idx(341, Math.floor(pl.cy / 16));
  return { px: Math.round(pl.x), py: Math.round(pl.y), hp: pl.hp, camX: Math.round(g.camera.x), tileAt: st.type[i], wallAt: st.wall[i] };
});
console.log('ALIVE', JSON.stringify(alive));
await new Promise((r) => setTimeout(r, 300));

// 实测暗竖条 → 反算世界列 → dump 数据
const diag = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store, cam = g.camera;
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
  const ctx2 = c2.getContext('2d');
  ctx2.drawImage(cv, 0, 0);
  const img = ctx2.getImageData(0, 0, cv.width, cv.height).data;
  const W = cv.width;
  const lum = (x, y) => { const o = (y * W + x) * 4; return (img[o] + img[o + 1] + img[o + 2]) / 3; };
  // 竖井屏区:玩家屏中心 ±120px,y 取竖井可见段
  const pcx = Math.round(W / 2);
  const strips = [];
  for (let sx = pcx - 120; sx <= pcx + 120; sx++) {
    let cnt = 0, sum = 0;
    for (let y = 200; y < 700; y += 2) {
      const l = lum(sx, y), la = lum(sx - 14, y), lb = lum(sx + 14, y);
      if (la > 30 && lb > 30 && l < 0.72 * Math.min(la, lb)) { cnt++; sum += l; }
    }
    if (cnt > 60) strips.push({ sx, cnt, avgL: Math.round(sum / cnt) });
  }
  const merged = [];
  for (const s of strips) {
    const last = merged[merged.length - 1];
    if (last && s.sx - last.sx2 <= 3) { last.sx2 = s.sx; last.cnt = Math.max(last.cnt, s.cnt); }
    else merged.push({ sx: s.sx, sx2: s.sx, cnt: s.cnt, avgL: s.avgL });
  }
  const zoom = cam.zoom;
  const cols = merged.map((m) => {
    const wxMid = cam.x + ((m.sx + m.sx2) / 2 - W / 2) / zoom;
    const tx = Math.floor(wxMid / 16);
    // dump 该列 ±1 在竖井行段的数据
    const rows = [];
    const cyv = Math.round((g.world.groundLevel + g.world.rockLevel) / 2 + 40);
    for (let ty = cyv - 13; ty <= cyv + 13; ty += 2) {
      const r = [];
      for (let dx = -1; dx <= 1; dx++) {
        const i = st.idx(tx + dx, ty);
        r.push([st.type[i], st.wall[i], st.liquid[i]]);
      }
      rows.push({ ty, cols: r });
    }
    return { ...m, tx, rows };
  });
  return { zoom, camX: cam.x, strips: cols };
});
console.log('DIAG', JSON.stringify(diag));
await page.screenshot({ path: '/tmp/diag-a.png' });

// A/B:把缝列墙清掉再截屏对照
const seamCols = diag.strips.map((s) => s.tx);
if (seamCols.length) {
  await page.evaluate((cols) => {
    const g = window.__swGame, st = g.world.store;
    const cyv = Math.round((g.world.groundLevel + g.world.rockLevel) / 2 + 40); for (const tx of cols) for (let ty = cyv - 15; ty <= cyv + 15; ty++) st.setWallSilent(tx, ty, 0);
  }, seamCols);
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(() => window.__pin());
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: '/tmp/diag-b.png' });
  // 复测缝
  const re = await page.evaluate(() => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    const ctx2 = c2.getContext('2d');
    ctx2.drawImage(cv, 0, 0);
    const img = ctx2.getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width;
    const lum = (x, y) => { const o = (y * W + x) * 4; return (img[o] + img[o + 1] + img[o + 2]) / 3; };
    const pcx = Math.round(W / 2);
    let hits = 0;
    for (let sx = pcx - 120; sx <= pcx + 120; sx++) {
      let cnt = 0;
      for (let y = 200; y < 700; y += 2) {
        const l = lum(sx, y), la = lum(sx - 14, y), lb = lum(sx + 14, y);
        if (la > 30 && lb > 30 && l < 0.72 * Math.min(la, lb)) cnt++;
      }
      if (cnt > 60) hits++;
    }
    return { seamColsRemaining: hits };
  });
  console.log('RECHECK', JSON.stringify(re));
}
await browser.close();
