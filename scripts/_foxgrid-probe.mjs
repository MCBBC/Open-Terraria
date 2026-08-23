// 一次性诊断：火绒狐 1094/1113 网格贴图渲染探针（2026-08-23 网格切片批）。
// ① projFrameImg 实切校验：帧 0/9/27 画布尺寸 = 62×44（非整图 384×1242）、
//    帧间像素不同（列主序确实换列/换行）；
// ② 真实实体渲染：生成 MinionProj 1094/1113 入场,截图 /tmp/foxgrid-*.png 人工复核。
// 经 tools/run-diag.mjs 运行,SW_ORIGIN 指私有 vite 实例。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const { projFrameImg, projSprite, projFrameCount } = await import('/src/entities/Arrow.ts');
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const g = window.__swGame;
  // 预热贴图（懒加载,等就绪）
  projSprite(1094); projSprite(1113); projSprite(1092);
  for (let i = 0; i < 100 && !projSprite(1094); i++) await new Promise((r) => setTimeout(r, 100));
  const dims = (c) => (c ? [c.width, c.height] : null);
  const sig = (c) => {
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let on = 0, sum = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) { on++; sum += d[i - 3] + d[i - 2] + d[i - 1]; }
    return { on, mean: on ? Math.round(sum / on / 3) : 0 };
  };
  const frames = {};
  for (const id of [1094, 1113]) {
    frames[id] = {
      count: projFrameCount(id),
      sheet: dims(projSprite(id)),
      f0: { dim: dims(projFrameImg(id, 0)), ...sig(projFrameImg(id, 0)) },
      f9: { dim: dims(projFrameImg(id, 9)), ...sig(projFrameImg(id, 9)) },
      f27: { dim: dims(projFrameImg(id, 27)), ...sig(projFrameImg(id, 27)) },
    };
  }
  // 真实实体：狐两只入场（飞行族,空中帧 27）
  const mk = (id, dx) => {
    const m = new MinionProj(g.player.cx + dx, g.player.cy - 40, id, 10, 1, false, 0, false,
      () => (g.player.dead ? null : g.player));
    g.entities.add(m, 'projectiles');
    return true;
  };
  mk(1094, -60); mk(1113, 60);
  return { frames, sheetReady: !!projSprite(1094) };
});
console.log(JSON.stringify(out, null, 1));
await new Promise((r) => setTimeout(r, 3000));

// 截图：玩家周边区域（两只狐应各在两侧,呈完整狐形而非胶片条）
const shot = await page.evaluate(() => {
  const g = window.__swGame, c = g.renderer.canvas;
  const cam = g.camera;
  const [sx, sy] = cam.worldToScreen(g.player.cx, g.player.cy);
  return { sx, sy, cw: c.width, ch: c.height };
});
await page.screenshot({ path: '/tmp/foxgrid-world.png', clip: {
  x: Math.max(0, shot.sx - 260), y: Math.max(0, shot.sy - 220), width: 520, height: 380,
} });
// 帧切片拼图（0/9/27 三帧 × 1094/1113）直接画到独立画布截图
await page.evaluate(async () => {
  const { projFrameImg } = await import('/src/entities/Arrow.ts');
  const cv = document.createElement('canvas');
  cv.id = '__foxgrid_strip';
  cv.width = 62 * 3 + 8; cv.height = 44 * 2 + 6;
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#333;image-rendering:pixelated;width:' + cv.width * 3 + 'px;height:' + cv.height * 3 + 'px';
  document.body.appendChild(cv);
  const cx = cv.getContext('2d');
  [1094, 1113].forEach((id, row) => {
    [0, 9, 27].forEach((f, col) => {
      const img = projFrameImg(id, f);
      if (img) cx.drawImage(img, col * (62 + 4), row * (44 + 2));
    });
  });
});
await new Promise((r) => setTimeout(r, 300));
const strip = await page.$('#__foxgrid_strip');
await strip.screenshot({ path: '/tmp/foxgrid-frames.png' });
console.log('screenshots: /tmp/foxgrid-world.png /tmp/foxgrid-frames.png');
await browser.close();
