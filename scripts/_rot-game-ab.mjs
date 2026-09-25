// ★rot 游戏内 A/B（2026-09-25 修复刃终验面）：缺省链(shim 开) vs ?bglshim=0(实体 2D 链),
//   同一冻结世界状态——持枪多角度瞄准（useStyle5 静持 aim）+ 定植弹幕（Arrow 上/右向）
//   双臂逐像素对拍。修复前病相=GL 臂武器/弹幕固定朝向 → 巨差块;修复后=亚像素采样相位差。
// 运行:SW_ORIGIN=http://localhost:5220 node tools/run-diag.mjs --timeout=600000 scripts/_rot-game-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
await bootstrap(page, ORIGIN + '/?bgl=1&cloudcache=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
console.log('createGame', gen?.ok ?? false);

await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => { window.__swGame.paused = true; });
await pump(page, 30);

// ---- 环境冻结（_b2-entity-ab 同款;消叶摆/云动/水位/火苗帧噪声）----
await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const origDraw = Object.getPrototypeOf(sky).draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; w.update = () => {}; }
  await import('/src/core/Options.ts').then((m) => {
    m.options.data.swayInWind = false;
    m.options.data.waveQuality = 0;
  });
  await import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true));
  const fixed = 60_000;
  Object.defineProperty(r, '_liquidNow', { get: () => fixed, set: () => {}, configurable: true });
  if (g.lighting?.clock) g.lighting.clock.tick = () => {};
});

// ---- 夹具:清怪/给鲨鱼炮+弹药/清投影 ----
await page.evaluate(() => {
  const g = window.__swGame;
  for (const k of ['enemies', 'drops', 'projectiles', 'npcs']) {
    if (Array.isArray(g.entities?.[k])) g.entities[k].length = 0;
  }
  const inv = g.player.inv;
  const flow = window.__swFlow;
  for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = null;
  const put = (slot, vid) => { inv.slots[slot] = { id: flow.itemByVid(vid), stack: 999 }; };
  put(0, 533);      // Megashark
  put(54, 97);      // MusketBall 弹药槽
  inv.selected = 0;
  g.world.weather && (g.world.weather.raining = false);
});
await pump(page, 10);
await pump(page, 120);   // UI toast（选中物品名/稀有国度）淡出 settle——toast 区=帧噪声源

// ---- 页内助手:双臂切换/定植弹幕/瞄准驱动 ----
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  window.__arm = (shim) => {
    r.constructor.bglSetForTest(1);
    r.constructor.bglShimSetForTest(shim);
  };
  window.__state = () => ({
    shim: r.constructor.bglShim, path: r.bglPathUsed,
    playerSX: window.__swGame.player.cx, playerSY: window.__swGame.player.cy,
  });
});

const shots = {};
const angles = [
  ['right', 220, 0],
  ['upright', 156, -156],
  ['up', 0, -220],
  ['downleft', -156, 156],
];

for (const [name, ox, oy] of angles) {
  // 瞄准驱动:解除暂停→鼠标钉偏移→【按下开火】泵 tick（useStyle5 仅 itemAnimation
  //  激活期跟随 aim——空持=休息位恒不转,首版探针因此空转）→暂停冻结射击相
  await page.evaluate(() => { window.__swGame.paused = false; });
  await page.mouse.move(640 + ox, 360 + oy);
  await page.mouse.down();
  await pump(page, 5);
  await page.evaluate(() => { window.__swGame.paused = true; });
  await page.mouse.up();
  await page.waitForFunction(() => window.__swGame.paused === true);
  await new Promise((r) => setTimeout(r, 120));
  // 三帧协议:A1(臂A) A2(臂A 复拍=自噪声底) B(臂B)——real≈noise ⇒ 双臂等价
  await page.evaluate(() => window.__arm(1));
  await new Promise((r) => setTimeout(r, 150));
  const a1 = await page.screenshot({ type: 'png' });
  await new Promise((r) => setTimeout(r, 150));
  const a2 = await page.screenshot({ type: 'png' });
  await page.evaluate(() => window.__arm(0));
  await new Promise((r) => setTimeout(r, 150));
  const b = await page.screenshot({ type: 'png' });
  await page.evaluate(() => window.__arm(1));
  shots[name] = { a: a1.toString('base64'), a2: a2.toString('base64'), b: b.toString('base64') };
  console.log('shot', name);
}

// ---- 定植弹幕相（暂停中 push,双臂同状态）:上飞箭+右飞箭 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const px = g.player.cx, py = g.player.cy - 40;
  const up = new Arrow(px + 60, py, 0, -3, 10, 0, 1, {});
  const right = new Arrow(px - 60, py + 30, 3, 0, 10, 0, 1, {});
  g.entities.projectiles.push(up, right);
});
const vis = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = document.querySelector('canvas');
  const r = g.renderer;
  // 箭世界位→屏幕位:用渲染相机（cam.x/y=世界像素中心,zoom z）
  const z = r.glZoom || 1, lw = r['_worldLowW'] || cv.width, lh = r['_worldLowH'] || cv.height;
  const cam = g.camera;
  const toScr = (wx, wy) => [Math.round(lw / 2 + (wx - Math.round(cam.x * z) / z) * z), Math.round(lh / 2 + (wy - Math.round(cam.y * z) / z) * z)];
  const [ax, ay] = toScr(g.player.cx + 60, g.player.cy - 40);
  const [rx, ry] = toScr(g.player.cx - 60, g.player.cy + 30 - 40);
  return { ax, ay, rx, ry, count: g.entities.projectiles.length };
});
console.log('arrow screen pos:', JSON.stringify(vis));
await new Promise((r) => setTimeout(r, 150));
await page.evaluate(() => window.__arm(1));
await new Promise((r) => setTimeout(r, 150));
const pa = await page.screenshot({ type: 'png' });
await new Promise((r) => setTimeout(r, 150));
const pa2 = await page.screenshot({ type: 'png' });
await page.evaluate(() => window.__arm(0));
await new Promise((r) => setTimeout(r, 150));
const pb = await page.screenshot({ type: 'png' });
shots.proj = { a: pa.toString('base64'), a2: pa2.toString('base64'), b: pb.toString('base64') };

// ---- 逐像素对拍（页内 canvas 解码 PNG→diff 统计+差异 bbox+弹区结构采样）----
const cmp = await page.evaluate(async ({ shots }) => {
  const dec = async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(bmp, 0, 0);
    return { d: cx.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
  };
  const out = {};
  for (const [name, s] of Object.entries(shots)) {
    const A = await dec(s.a), A2 = await dec(s.a2), B = await dec(s.b);
    const Y0 = 110, Y1 = 700;   // 裁剪:UI toast 带(y<110 顶栏+名称浮层,y>700 底部 toast)=帧噪声源,只对拍世界带
    const scan = (X, Y) => {
      let n = 0, maxd = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
      for (let y = Y0; y < Y1; y++) for (let x = 0; x < X.w; x++) {
        const i = (y * X.w + x) * 4;
        const dd = Math.max(Math.abs(X.d[i] - Y.d[i]), Math.abs(X.d[i + 1] - Y.d[i + 1]), Math.abs(X.d[i + 2] - Y.d[i + 2]));
        if (dd > 32) {
          n++; maxd = Math.max(maxd, dd);
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
          if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
      }
      return { mismatch: n, maxd, bbox: n ? [bx0, by0, bx1, by1] : null };
    };
    const noise = scan(A, A2), real = scan(A, B);
    real.frac = +(real.mismatch / ((Y1 - Y0) * A.w) * 100).toFixed(3);
    noise.frac = +(noise.mismatch / ((Y1 - Y0) * A.w) * 100).toFixed(3);
    out[name] = { noise, real,
      ratio: noise.mismatch ? +(real.mismatch / noise.mismatch).toFixed(2) : (real.mismatch ? 'inf' : 0) };
  }
  return out;
}, { shots });

console.log(JSON.stringify(cmp, null, 2));
if (pageErrors.length) console.log('PAGE ERRORS:', pageErrors.slice(0, 5));
const bad = Object.entries(cmp).filter(([, v]) => v.real.mismatch > 4000 || (v.noise.mismatch >= 50 && v.ratio !== 'inf' && v.ratio > 3));
console.log(bad.length ? `VERDICT: RED —— ${bad.map(([k]) => k).join(',')} real/noise 超界` : 'VERDICT: GREEN');
await browser.close();
