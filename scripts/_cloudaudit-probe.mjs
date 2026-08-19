// 云渲染审计(2026-08-18):用户报"好多云不渲染"。两个证据面:
//  ① cloudTintCache 逐条目 alpha 审计(空画布 = 污染色桶 = 云不可见)
//  ② 截图天空区域云覆盖度(与纯天空渐变对比)
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=240000 scripts/_cloudaudit-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = '/Users/vinlic/.claude/jobs/8405c930/tmp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/cloudaudit-profile`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.setDefaultTimeout(300000);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
console.log('世界就绪,等资产+云稳定 15s…');
await sleep(15000);

// ① 缓存条目 alpha 审计 + 云可见性各门读数
const audit = await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const cache = sky.cloudTintCache;
  let empty = 0, total = 0;
  const emptyKeys = [];
  for (const [k, c] of cache) {
    total++;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let alpha = 0;
    for (let i = 3; i < d.length; i += 40) alpha += d[i];
    if (alpha === 0) { empty++; emptyKeys.push(k); }
  }
  // 可见性门实时读数(drawCloudPass 同式)
  const wr = sky.weatherRef;
  const basis = wr ? Math.max(wr.cloudAlpha, (wr.graveyardVisual ?? 0) * 0.92) : 0;
  const atmo = sky.atmoValue(g.player.y);
  const globalCloudAlpha = basis * atmo;
  // 云按 pass 分桶的屏内统计(x 是屏幕空间 0..viewW)
  const vw = 1280;
  let onScreen = 0;
  for (const c of sky.vclouds) {
    const w = (sky.cloudTex(c.type)?.width ?? 200) * c.scale;
    if (c.x + w > 0 && c.x < vw && !c.kill) onScreen++;
  }
  return { cacheSize: total, emptyEntries: empty, emptyKeys: emptyKeys.slice(0, 6),
    vclouds: sky.vclouds.length, onScreen,
    numCloudsTarget: wr?.numClouds ?? '无weatherRef',
    cloudAlpha: wr?.cloudAlpha, cloudBGActive: wr?.cloudBGActive,
    graveyardVisual: wr?.graveyardVisual, atmo, globalCloudAlpha,
    towerCloudMul: sky.towerCloudMul, lastSkyTop: sky.lastSkyTop,
    cloudGL: sky.cloudGL ? (sky.cloudGL.unavailable ? '死' : '活') : '未建',
    cloudGLQuads: sky.cloudGL?.quadsLastPass ?? -1,
    cloudGLSize: sky.cloudGL ? `${sky.cloudGL.canvas.width}x${sky.cloudGL.canvas.height}` : '-',
    cloudGLInitFailed: sky.cloudGLInitFailed, useGLClouds: sky.useGLClouds,
    surfaceGate: g.player.y - 400 < sky.fx.surfaceY + 16,
    isDay: g.world.clock?.isDay ?? '未知' };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log('[审计]', JSON.stringify(audit));

// ② 主画布(取最大)分带覆盖度 + GL 画布内容自检
const shot = await page.screenshot({ type: 'png' }).catch(() => null);
if (shot) {
  fs.writeFileSync(`${TMP}/cloudaudit-sky.png`, shot);
  const cover = await page.evaluate(() => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;   // ★直取主画布(面积排序平局曾抓错成光照画布!)
    if (!cv) return { err: '无画布' };
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const bands = new Array(8).fill(0);
    for (let y = 2; y < cv.height - 2; y += 2) {
      const band = Math.min(7, Math.floor(y / cv.height * 8));
      for (let x = 2; x < cv.width - 2; x += 4) {
        const i = (y * cv.width + x) * 4;
        const r2 = (y * cv.width + x + 2) * 4;
        const dr = Math.abs(d[i] - d[r2]) + Math.abs(d[i + 1] - d[r2 + 1]) + Math.abs(d[i + 2] - d[r2 + 2]);
        if (dr > 30) bands[band]++;
      }
    }
    // GL 画布自检(preserveDrawingBuffer 留有上一帧;★GL y 原点在底,顶行 = height-1)
    let glPix = '无实例';
    const glc = g.renderer.glfx?.canvas;
    if (glc && glc.width > 0) {
      try {
        const gctx = glc.getContext('webgl2');
        const px = new Uint8Array(4 * 256);
        gctx.readPixels(0, glc.height - 1, 256, 1, gctx.RGBA, gctx.UNSIGNED_BYTE, px);
        let nz = 0;
        for (let i = 3; i < px.length; i += 4) if (px[i] > 0) nz++;
        glPix = `顶行256px非零alpha=${nz}`;
      } catch (e) { glPix = '读回失败:' + String(e).slice(0, 60); }
    }
    return { main: `${cv.width}x${cv.height}`, bands, glPix };
  }).catch((e) => ({ err: String(e).slice(0, 160) }));
  console.log('[覆盖度/带+GL自检]', JSON.stringify(cover));
}
await browser.close();
