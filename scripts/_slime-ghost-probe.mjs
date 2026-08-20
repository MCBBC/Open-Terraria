// 绿史莱姆运动残影复现探针:
// 1) 生成绿史莱姆(vid=1)让 AI_001 自然跳跃 120 帧,逐帧 render 并记录史莱姆世界包围盒
// 2) 把史莱姆移出屏幕再 render —— 采样所有历史位置中心:若有史莱姆色残留=残影实锤
// 3) 同时采样主画布与 worldCanvas(若启用),定位残影所在层
// 4) 报告 renderer.worldLayerEnabled / tintAtlas size / colorRGBA 实际值
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
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(() => {
  const g = window.__swGame;
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
  g.player.x = (px0 + 30) * 16; g.player.y = (py0 - 4) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  g.world.clock.timeOfDay = 0.5;
  // 现场没有就 spawn 一只绿史莱姆
  let slime = g.entities.enemies.find((e) => e.vanillaId === 1 && !e.dead);
  if (!slime) {
    const ctor = g.entities.enemies.constructor;
    // 通过 fromVanilla 生成(Enemy.fromVanilla)
    const E = Object.getPrototypeOf(g.entities.enemies.find((e) => e instanceof Object) ?? {});
    // 兜底:用 spawner 池
    window.__swSetPool?.([1]);
    for (let i = 0; i < 600 && !slime; i++) { g.fixedUpdate(1 / 60); slime = g.entities.enemies.find((e) => e.vanillaId === 1 && !e.dead); }
  }
  if (!slime) return { slime: 0 };
  slime.x = (px0 - 20) * 16; slime.y = (py0 - 6) * 16;
  slime.vx = 0; slime.vy = 0;
  slime.hp = slime.maxHp ?? 999;
  // 逐帧跳跃 + 渲染,记录包围盒(世界坐标)
  const hist = [];
  const canvas = g.renderer.canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  g.render();
  for (let i = 0; i < 150; i++) {
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    g.fixedUpdate(1 / 60);
    g.render();
    hist.push({ x: slime.cx, y: slime.cy, vx: slime.vx, vy: slime.vy, dead: slime.dead });
    if (slime.dead) break;
  }
  // 挪走史莱姆(屏幕外上方),再渲染一帧——历史位置若有残留即残影
  const lastPos = { x: slime.cx, y: slime.cy };
  slime.x = g.camera.x + 3000; slime.y = g.camera.y - 3000; slime.vx = 0; slime.vy = 0;
  slime.ai0 = -1120;
  for (let i = 0; i < 5; i++) { g.fixedUpdate(1 / 60); g.render(); }
  // 采样历史位置(屏幕坐标),主画布 + worldCanvas
  const sampleAt = (cv, wx, wy, n = 5) => {
    if (!cv) return null;
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    const c2 = cv.getContext('2d');
    const im = c2.getImageData(Math.round(sx) - (n >> 1), Math.round(sy) - (n >> 1), n, n).data;
    let r = 0, gg = 0, b = 0, a = 0;
    for (let j = 0; j < im.length; j += 4) { r += im[j]; gg += im[j + 1]; b += im[j + 2]; a += im[j + 3]; }
    const c = im.length / 4;
    return [Math.round(r / c), Math.round(gg / c), Math.round(b / c), Math.round(a / c)];
  };
  const worldCv = g.renderer.worldCanvas ?? null;
  const picks = [];
  for (let i = 0; i < hist.length; i += 10) {
    const h = hist[i];
    picks.push({
      i, wx: h.x, wy: h.y,
      main: sampleAt(canvas, h.x, h.y),
      world: worldCv ? sampleAt(worldCv, h.x, h.y) : null,
    });
  }
  // 背景参照(从没走过史莱姆的空白处)
  const bg = { main: sampleAt(canvas, (px0 - 50) * 16, (py0 - 4) * 16), world: worldCv ? sampleAt(worldCv, (px0 - 50) * 16, (py0 - 4) * 16) : null };
  return {
    slime: 1,
    worldLayerEnabled: g.renderer.worldLayerEnabled ?? null,
    tintAtlasSize: g.renderer.tintAtlas ? g.renderer.tintAtlas.size : null,
    tintAtlasPages: g.renderer.tintAtlas ? g.renderer.tintAtlas.pageCount : null,
    colorRGBA: slime.colorRGBA ? slime.colorRGBA.map((v) => Math.round(v)) : null,
    spawnAlpha: slime.spawnAlpha,
    histLen: hist.length,
    histSample: hist.filter((_, i) => i % 25 === 0).map((h) => ({ x: Math.round(h.x), y: Math.round(h.y), vx: +h.vx.toFixed(2), vy: +h.vy.toFixed(2) })),
    lastPos,
    picks,
    bg,
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: './shots/slime-ghost.png' });
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);
