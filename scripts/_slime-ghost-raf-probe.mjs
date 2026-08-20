// 绿史莱姆运动残影复现(RAF 真时间驱动版):
// 让史莱姆真实跳跃 5s(事件循环不阻塞,onload 正常完成),记录历史位置;
// 挪走后采样所有历史位置——任何一处非背景残留 = 残影实锤;报告残留数量/色值。
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
await new Promise((r) => setTimeout(r, 2500));

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
  // 玩家钉在史莱姆旁 12 格(相机跟随玩家→史莱姆始终在屏内;每帧重置位置+满血防击退/死亡)
  const pinX = (px0 - 8) * 16, pinY = (py0 - 4) * 16;
  g.player.x = pinX; g.player.y = pinY;
  g.camera.x = pinX; g.camera.y = pinY;
  g.world.clock.timeOfDay = 0.5;
  window.__swSetPool?.([1]);
  let slime = null;
  for (let i = 0; i < 1500 && !slime; i++) { g.fixedUpdate(1 / 60); slime = g.entities.enemies.find((e) => e.vanillaId === 1 && !e.dead); }
  if (!slime) return { slime: 0 };
  slime.x = (px0 - 20) * 16; slime.y = (py0 - 8) * 16;
  slime.vx = 0; slime.vy = 0;
  slime.hp = slime.maxHp ?? 999;
  // 真时间驱动 5 秒(RAF 跑起来,onload/渲染循环都活着)
  const hist = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 5000) {
    g.player.x = pinX; g.player.y = pinY; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    await new Promise((r) => requestAnimationFrame(r));
    hist.push({ x: slime.cx, y: slime.cy, vx: slime.vx, vy: slime.vy });
  }
  // 挪走史莱姆(屏幕外),再过 1s 让渲染稳定
  slime.x = g.camera.x + 2400; slime.y = g.camera.y - 2400;
  slime.vx = 0; slime.vy = 0; slime.ai0 = -1120;
  const t1 = performance.now();
  while (performance.now() - t1 < 1000) {
    g.player.x = pinX; g.player.y = pinY; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    await new Promise((r) => requestAnimationFrame(r));
  }
  // 采样:历史位置(去重到 6px 网格)+ 背景参照
  const cv = ren.canvas;
  const cctx = cv.getContext('2d', { willReadFrequently: true });
  const snapAt = (wx, wy, n = 5) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    const ix = Math.round(sx) - (n >> 1), iy = Math.round(sy) - (n >> 1);
    if (ix < 0 || iy < 0 || ix + n > cv.width || iy + n > cv.height) return 'offscreen';
    const im = cctx.getImageData(ix, iy, n, n).data;
    let r = 0, gg = 0, b = 0;
    for (let j = 0; j < im.length; j += 4) { r += im[j]; gg += im[j + 1]; b += im[j + 2]; }
    const c = im.length / 4;
    return [Math.round(r / c), Math.round(gg / c), Math.round(b / c)];
  };
  const seen = new Set();
  const picks = [];
  for (const h of hist) {
    const gx = Math.round(h.x / 6), gy = Math.round(h.y / 6);
    const k = gx + ':' + gy;
    if (seen.has(k)) continue;
    seen.add(k);
    picks.push({ wx: Math.round(h.x), wy: Math.round(h.y), px: snapAt(h.x, h.y - slime.h / 2) });
  }
  const bg1 = snapAt((px0 - 30) * 16, (py0 - 8) * 16);
  const bg2 = snapAt((px0 + 8) * 16, (py0 - 9) * 16);
  return {
    slime: 1,
    histLen: hist.length,
    tintSize: ren.tintAtlas.size, tintPages: ren.tintAtlas.pageCount,
    firstHist: hist.slice(0, 3), lastHist: hist.slice(-3),
    picksCount: picks.length,
    picks: picks.slice(0, 40),
    bg1, bg2,
    camNow: [Math.round(g.camera.x), Math.round(g.camera.y)],
    colorRGBA: slime.colorRGBA?.map((v) => Math.round(v)),
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: './shots/slime-ghost-raf.png' });
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);
