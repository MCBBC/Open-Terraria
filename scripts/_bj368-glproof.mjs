// ★BJ368 GL 路径证明探针——正面验证球确经 GL 管线渲染:
//  ①renderMode/usingCpu/bglPathStats ②GLStats(swpipe 账页)逐帧 draws/verts/uploads
//  ③quadSprite 钩(球 30×32 纹理→GL drawArrays) ④世界 FBO readPixels 直接取证球像素
//  ⑤GL 不可用/回退面(bglPathStats 中 2d/degraded 计数)清零核对
// 运行：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj368-glproof.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  const O = {};
  const { options } = await import('/src/core/Options.ts');
  options.set('renderMode', 'gpu');
  await new Promise((r) => setTimeout(r, 500));
  await g.newWorld('bj368gl', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  g.world.clock.timeOfDay = 0.5;   // 白天(球可见性最大)
  const c0 = Math.trunc(p.x / 16);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  if (groundY > 0) { p.x = c0 * 16; p.y = groundY * 16 - p.h; }
  p.vx = 0; p.vy = 0;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 400));

  // ①渲染模式与路径账
  O.mode = {
    renderMode: options.data.renderMode,
    usingCpu: g.renderer.usingCpu ?? g.renderer.cpuRender,
    isCpuRender: g.renderer.isCpuRender ? g.renderer.isCpuRender() : null,
    bglPathUsed: g.renderer.bglPathUsed,
    composePath: g.renderer.composePathUsed ?? null,
  };
  // ②GLStats 账页快照(帧级)
  const gpuSnap = () => {
    try {
      const s = window.__swGPULog?.snapshot?.();
      return s ? JSON.parse(JSON.stringify(s)).frames?.slice(-2) ?? s : null;
    } catch (e) { return String(e); }
  };
  // ③quadSprite 球纹理钩
  const { GLSpriteLayer } = await import('/src/render/GLSpriteLayer.ts');
  const glp = GLSpriteLayer.prototype;
  let ballQuads = 0, otherQuads = 0;
  if (!glp.__bj368gl) {
    glp.__bj368gl = true;
    const oq = glp.quadSprite;
    glp.quadSprite = function (e, ...a) {
      if (e && e.w === 30 && e.h === 32) ballQuads++; else otherQuads++;
      return oq.call(this, e, ...a);
    };
  }
  // ④出球 + 3 帧渲染
  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };
  aim(p.cx + 200, p.cy - 4);
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  let head = g.entities.projectiles.find((q) => q.projId === 404);
  O.spawned = !!head;
  const before = gpuSnap();
  for (let i = 0; i < 4; i++) {
    g.paused = false;
    head = g.entities.projectiles.find((q) => q.projId === 404 && !q.dead);
    if (head) { head.alpha = 0; head.ai1 = 10; }   // 保证可见
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
  }
  O.ballQuadsGL = ballQuads;      // GL drawArrays 口径
  O.otherQuadsGL = otherQuads;
  O.gpuBefore = before;
  O.gpuAfter = gpuSnap();
  O.bglPathStats = { ...g.renderer.bglPathStats };
  // ⑤主画布像素取证(球位 teal)
  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  if (head) {
    const [sx, sy] = g.camera.worldToScreen(head.x, head.y);
    const bx = Math.max(0, Math.round(sx * scale) - 60), by = Math.max(0, Math.round(sy * scale) - 60);
    const cv = document.createElement('canvas'); cv.width = 120; cv.height = 120;
    const cx2 = cv.getContext('2d', { willReadFrequently: true });
    cx2.drawImage(canvas, bx, by, 120, 120, 0, 0, 120, 120);
    const d = cx2.getImageData(0, 0, 120, 120).data;
    let teal = 0, white = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - 48) < 80 && Math.abs(d[i + 1] - 248) < 80 && Math.abs(d[i + 2] - 171) < 80) teal++;
      if (d[i] >= 240 && d[i + 1] >= 240 && d[i + 2] >= 240) white++;
    }
    O.mainCanvasBall = { teal, white };
  }
  return O;
});
console.log('BJ368_GLPROOF=' + JSON.stringify(out, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();
