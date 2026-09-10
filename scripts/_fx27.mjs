// SW-FX27 波 2 实机探针：呈现面翻转（GameViewMatrix.Effects=FlipVertically 域）
//   + 鼠标→世界换算（ReverseGravitySupport）直读取证。
//   A. gd=1 基线：gravDir=1 / cam.flipY=false / screenToWorld 原式直读。
//   B. 翻转激活：重力药水 buff 18 + Up 沿 → gravDir=-1 → cam.flipY=true（实机同步链）。
//   C. 呈现镜像像素证据：冻结世界后翻转换截屏，B(x,y) ≍ A(x, viewH-y)（世界区采样
//      配对命中率 ≫ 同位对照 = 场景非 Y 对称下的镜像判别力）。
//   D. 鼠标命中镜像：同一屏点翻转前后 worldY 关于 cam.y 镜像（wy' = 2·cam.y − wy）。
//   E. 回正恒等：再按 Up 沿翻回 → flipY=false，screenToWorld 回原式。
// 运行：node tools/probe.mjs run scripts/_fx27.mjs --vite=auto --size=small
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const chromePath = process.env.SW_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 200)); });
console.log('[fx27] goto', ORIGIN);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 180000 });
console.log('[fx27] dom loaded; wait bridge');
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld, { timeout: 240000, polling: 500 });
console.log('[fx27] bridge ready; newWorld');
await page.evaluate(async () => { await window.__swFlow.newWorld('424242', 1200, 400); });
console.log('[fx27] newWorld done; wait game');
await page.waitForFunction(() => !!window.__swGame, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 2500));
console.log('[fx27] game ready');

const outDir = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_fx27';

// 随机采样配对像素（世界区中部，避开 HUD 条带）：命中=两图 RGBA 全等
const mirrorRate = async (x0, x1, y0, y1, n) => page.evaluate(async ([x0, x1, y0, y1, n]) => {
  const cv = document.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const H = cv.height;
  const a = ctx.getImageData(0, 0, cv.width, H).data;
  let mirrorHit = 0, sameHit = 0, total = 0;
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(Math.random() * (x1 - x0));
    const y = y0 + Math.floor(Math.random() * (y1 - y0));
    const ym = H - 1 - y;
    const i1 = (y * cv.width + x) * 4, i2 = (ym * cv.width + x) * 4, i3 = (y * cv.width + x) * 4;
    // a=当前屏（翻转后）, b=基线屏（缓存于 window.__fx27Base）
    const b = window.__fx27Base;
    if (a[i1] === b[i2] && a[i1 + 1] === b[i2 + 1] && a[i1 + 2] === b[i2 + 2] && a[i1 + 3] === b[i2 + 3]) mirrorHit++;
    if (a[i3] === b[i3] && a[i3 + 1] === b[i3 + 1] && a[i3 + 2] === b[i3 + 2] && a[i3 + 3] === b[i3 + 3]) sameHit++;
    total++;
  }
  return { mirrorRate: mirrorHit / total, sameRate: sameHit / total, H };
}, [x0, x1, y0, y1, n]);

const res = { cases: [] };
try {
  // ---- A. gd=1 基线 ----
  const base = await page.evaluate(() => {
    const g = window.__swGame;
    g.paused = true;                     // 冻结世界（渲染循环照跑,相机目标=冻结玩家恒定）
    return {
      gravDir: g.player.gravDir,
      flipY: g.camera.flipY,
      camX: g.camera.x, camY: g.camera.y, zoom: g.camera.zoom,
      viewW: g.camera.viewW, viewH: g.camera.viewH,
      mouseHit: (() => { const [wx, wy] = g.camera.screenToWorld(400, 300); return { wx, wy }; })(),
    };
  });
  res.base = base;
  await new Promise((r) => setTimeout(r, 600));   // 相机缓动收敛
  await page.screenshot({ path: `${outDir}/fx27-A-baseline.png` });
  await page.evaluate(() => {                      // 缓存基线全幅像素
    const cv = document.querySelector('canvas');
    const ctx = cv.getContext('2d');
    window.__fx27Base = ctx.getImageData(0, 0, cv.width, cv.height).data;
  });

  // ---- B. 翻转激活（重力药水 18 + Up 沿,Player.cs:26897-26912 链）----
  const flipped = await page.evaluate(async () => {
    const g = window.__swGame;
    const { updateGravityControls } = await import('/src/entities/Player.ts');
    const { BuffType } = await import('/src/stats/Buffs.ts');
    g.player.buffs.apply(BuffType.Gravitation, 180);
    updateGravityControls(g.player, true);         // Up 按下沿 → gravDir=-1
    await new Promise((r) => setTimeout(r, 700));  // 等 fixedUpdate/render 同步 flipY
    const [wx, wy] = g.camera.screenToWorld(400, 300);
    return {
      gravDir: g.player.gravDir,
      flipY: g.camera.flipY,
      mouseHit: { wx, wy },
      camY: g.camera.y,
      buff: g.player.buffs.has(BuffType.Gravitation),
    };
  });
  res.flipped = flipped;
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `${outDir}/fx27-B-flipped.png` });

  // ---- C. 呈现镜像像素配对（世界区中部采样;HUD 条带避开）----
  const viewH = base.viewH;
  res.mirror = await mirrorRate(260, 1020, 140, Math.min(600, viewH - 160), 4000);

  // ---- D. 鼠标命中镜像恒等 ----
  res.mirrorMath = {
    expectWy: 2 * base.camY - base.mouseHit.wy,    // 同屏点翻转态世界 Y（关于 cam.y 镜像）
    gotWy: flipped.mouseHit.wy,
    pass: Math.abs(flipped.mouseHit.wy - (2 * base.camY - base.mouseHit.wy)) < 1e-6,
  };

  // ---- E. 回正（再按 Up 沿）----
  const restored = await page.evaluate(async () => {
    const g = window.__swGame;
    const { updateGravityControls } = await import('/src/entities/Player.ts');
    updateGravityControls(g.player, true);
    await new Promise((r) => setTimeout(r, 500));
    const [wx, wy] = g.camera.screenToWorld(400, 300);
    return { gravDir: g.player.gravDir, flipY: g.camera.flipY, mouseHit: { wx, wy } };
  });
  res.restored = restored;

  // ---- 断言 ----
  res.cases.push(
    { name: 'A gd=1 基线 flipY=false', pass: base.flipY === false && base.gravDir === 1 },
    { name: 'B 药水+Up沿 → gravDir=-1 && cam.flipY=true（实机同步链）',
      pass: flipped.gravDir === -1 && flipped.flipY === true && flipped.buff === true },
    { name: 'C 呈现镜像配对命中 ≫ 同位对照（场景非Y对称判别力）',
      mirrorRate: res.mirror?.mirrorRate, sameRate: res.mirror?.sameRate,
      pass: !!res.mirror && res.mirror.mirrorRate > 0.6 && res.mirror.mirrorRate > res.mirror.sameRate * 2 },
    { name: 'D 鼠标命中镜像 wy\'=2·cam.y−wy', ...res.mirrorMath, pass: res.mirrorMath.pass },
    { name: 'E 再按沿回正 gravDir=1 && flipY=false', pass: restored.gravDir === 1 && restored.flipY === false },
  );
  res.allPass = res.cases.every((c) => c.pass);
} catch (e) {
  res.fatal = String(e?.stack ?? e);
  res.allPass = false;
}
console.log(JSON.stringify(res, null, 2));
await browser.close();
process.exit(res.allPass ? 0 : 1);
