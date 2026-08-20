// 最终验证:史莱姆跳跃→挪走→历史位置残影计数(应=0,仅天空)+染色中心色
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 280000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ren = g.renderer;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let surf = 8;
  while (surf < st.h - 20 && !st.isSolid(px0, surf)) surf++;
  const py0 = surf - 6;
  for (let dy = -14; dy <= 0; dy++) for (let dx = -60; dx <= 60; dx++) {
    st.setTile(px0 + dx, py0 + dy, 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  for (let dx = -60; dx <= 60; dx++) st.setTile(px0 + dx, py0 + 1, 2);
  const pinX = px0 * 16, pinY = (py0 - 4) * 16;   // 玩家钉台中央;史莱姆从左端追跳,轨迹在屏内
  g.player.x = pinX; g.player.y = pinY;
  g.camera.x = pinX; g.camera.y = pinY;
  g.world.clock.timeOfDay = 0.5;
  window.__swSetPool?.([1]);
  let slime = null;
  for (let i = 0; i < 3000 && !slime; i++) { g.fixedUpdate(1 / 60); slime = g.entities.enemies.find((e) => e.vanillaId === 1 && !e.dead); }
  if (!slime) return { slime: 0 };
  slime.x = (px0 - 20) * 16; slime.y = (py0 - 8) * 16;
  slime.vx = 0; slime.vy = 0;
  slime.hp = slime.maxHp ?? 999;
  const hist = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 3500) {
    g.player.x = pinX; g.player.y = pinY; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    await new Promise((r) => requestAnimationFrame(r));
    hist.push({ x: slime.cx, y: slime.cy });
  }
  // 挪走史莱姆
  slime.x = g.camera.x + 2400; slime.y = g.camera.y - 2400;
  slime.vx = 0; slime.vy = 0; slime.ai0 = -1120;
  const t1 = performance.now();
  while (performance.now() - t1 < 800) {
    g.player.x = pinX; g.player.y = pinY; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    await new Promise((r) => requestAnimationFrame(r));
  }
  // 残影检测:每个历史位置(6px 网格去重)与【同高度 ±120px 史莱姆未到过的参照列】比色差
  const cv = ren.canvas;
  const cctx = cv.getContext('2d', { willReadFrequently: true });
  const px = (sx, sy) => cctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
  const cam = g.camera;
  const zone = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  const pts = [];
  const seen = new Set();
  for (const h of hist) {
    const [sx, sy] = cam.worldToScreen(h.x, h.y);
    if (sx < 100 || sy < 60 || sx > 1180 || sy > 700) continue;
    const k = Math.round(sx / 8) + ':' + Math.round(sy / 8);
    if (seen.has(k)) continue;
    seen.add(k);
    pts.push([sx, sy]);
    zone.x0 = Math.min(zone.x0, sx); zone.y0 = Math.min(zone.y0, sy);
    zone.x1 = Math.max(zone.x1, sx); zone.y1 = Math.max(zone.y1, sy);
  }
  // 玩家屏幕位置(排除其矩形 ±40px 的轨迹点,防把玩家当残影)
  const [pPsx, pPsy] = cam.worldToScreen(pinX, pinY);
  const playerZone = (x, y) => Math.abs(x - pPsx) < 40 && y > pPsy - 90 && y < pPsy + 20;
  // 参照:轨迹包围盒外同高度(±60px 外,史莱姆从未接近的天空)
  let ghosts = 0, checked = 0, maxDev = 0;
  const deviations = [];
  const ghostDetail = [];
  for (const [sx, sy] of pts) {
    if (playerZone(sx, sy)) continue;
    const rx = sx < (zone.x0 + zone.x1) / 2 ? zone.x0 - 60 : zone.x1 + 60;
    if (rx < 20 || rx > 1260) continue;
    const ref = px(rx, sy);
    const p = px(sx, sy);
    const dev = Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]);
    checked++;
    if (dev > maxDev) maxDev = dev;
    deviations.push(Math.round(dev));
    if (dev > 60) ghosts++;
    if (dev > 60 && ghostDetail.length < 12) ghostDetail.push({ at: [Math.round(sx), Math.round(sy)], p: [p[0], p[1], p[2]], ref: [ref[0], ref[1], ref[2]], refAt: Math.round(rx) });
  }
  deviations.sort((a, b) => b - a);
  // 史莱姆本体中心色(挪回中心再采样一次)
  slime.x = pinX - 100; slime.y = (py0 - 3) * 16; slime.vx = 0; slime.vy = 0;
  for (let k = 0; k < 8; k++) {
    g.player.x = slime.cx + 120; g.player.y = slime.y; g.player.vx = 0; g.player.vy = 0; g.player.hp = g.player.maxHp;
    slime.vx = 0; slime.vy = 0;
    await new Promise((r) => requestAnimationFrame(r));
  }
  g.render();
  const [ssx, ssy] = cam.worldToScreen(slime.cx, slime.cy - slime.h / 2);
  const d = cctx.getImageData(Math.round(ssx) - 2, Math.round(ssy) - 2, 5, 5).data;
  let r = 0, gg = 0, b = 0;
  for (let j = 0; j < d.length; j += 4) { r += d[j]; gg += d[j + 1]; b += d[j + 2]; }
  const center = [Math.round(r / 25), Math.round(gg / 25), Math.round(b / 25)];
  const skyRef = px(...cam.worldToScreen(slime.cx, slime.cy - 60));
  return {
    slime: 1, histLen: hist.length, trailPts: pts.length,
    ghostCount: ghosts, checked, maxDev, topDevs: deviations.slice(0, 10), ghostDetail,
    centerColor: center, skyNear: [skyRef[0], skyRef[1], skyRef[2]],
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: './shots/slime-final.png' });
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);
