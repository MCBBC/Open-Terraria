// 抓现行:hook 主画布 2d context 的 drawImage/fillRect——史莱姆挪走后,
// 记录打到史莱姆历史位置区域的所有绘制调用(源图尺寸/目标矩形/alpha/gCO)
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
  const pinX = (px0 - 8) * 16, pinY = (py0 - 4) * 16;
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
  while (performance.now() - t0 < 5000) {
    g.player.x = pinX; g.player.y = pinY; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    await new Promise((r) => requestAnimationFrame(r));
    hist.push({ x: slime.cx, y: slime.cy });
  }
  slime.x = g.camera.x + 2400; slime.y = g.camera.y - 2400;
  slime.vx = 0; slime.vy = 0; slime.ai0 = -1120;
  // ---- hook 主画布 ----
  const cv = ren.canvas;
  const ctx = cv.getContext('2d');
  const zone = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };   // 历史位置包围盒(屏幕系,当帧相机)
  const cam = g.camera;
  for (const h of hist) {
    const [sx, sy] = cam.worldToScreen(h.x, h.y);
    zone.x0 = Math.min(zone.x0, sx - 30); zone.y0 = Math.min(zone.y0, sy - 30);
    zone.x1 = Math.max(zone.x1, sx + 30); zone.y1 = Math.max(zone.y1, sy + 30);
  }
  const hits = [];
  const inZone = (x, y, w, h2) => !(x > zone.x1 || x + w < zone.x0 || y > zone.y1 || y + h2 < zone.y0);
  const origDraw = ctx.drawImage.bind(ctx);
  const origFill = ctx.fillRect.bind(ctx);
  ctx.drawImage = function (img, ...rest) {
    // 目标矩形:drawImage 9 参 (img,sx,sy,sw,sh,dx,dy,dw,dh) 或 5 参 (img,dx,dy,dw,dh) 或 3 参
    let dx = 0, dy = 0, dw = 0, dh = 0;
    if (rest.length >= 8) { dx = rest[4]; dy = rest[5]; dw = rest[6]; dh = rest[7]; }
    else if (rest.length >= 4) { dw = rest[2]; dh = rest[3]; }
    else { dw = img.width; dh = img.height; }
    if (inZone(dx, dy, dw, dh) && hits.length < 400) {
      hits.push({
        op: 'drawImage', src: `${img.width}x${img.height}`, dst: [Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh)],
        alpha: +ctx.globalAlpha.toFixed(2), gco: ctx.globalCompositeOperation,
      });
    }
    return origDraw(img, ...rest);
  };
  ctx.fillRect = function (x, y, w, h2) {
    if (inZone(x, y, w, h2) && hits.length < 400) {
      hits.push({ op: 'fillRect', dst: [Math.round(x), Math.round(y), Math.round(w), Math.round(h2)], alpha: +ctx.globalAlpha.toFixed(2), gco: ctx.globalCompositeOperation, fill: ctx.fillStyle?.toString?.().slice(0, 40) });
    }
    return origFill(x, y, w, h2);
  };
  const t1 = performance.now();
  while (performance.now() - t1 < 1000) {
    g.player.x = pinX; g.player.y = pinY; g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp;
    await new Promise((r) => requestAnimationFrame(r));
  }
  ctx.drawImage = origDraw; ctx.fillRect = origFill;
  // 汇总:按 (src,gco,尺寸) 聚合计数
  const agg = {};
  for (const h of hits) {
    const k = `${h.op}|${h.src ?? ''}|${h.gco}|${h.dst[2]}x${h.dst[3]}|a${h.alpha}`;
    agg[k] = (agg[k] ?? 0) + 1;
  }
  return { slime: 1, zone: { x0: Math.round(zone.x0), y0: Math.round(zone.y0), x1: Math.round(zone.x1), y1: Math.round(zone.y1) }, total: hits.length, agg, sample: hits.slice(0, 25) };
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);
