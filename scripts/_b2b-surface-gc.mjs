// ★B2b 收官账面:①IOSurface/画布张数盘点（createElement 钩:按臂累计创建+存活统计）
// ②GL 上传字节量/帧（texImage2D+texSubImage2D 估算字节;worldCanvas 源专账）
// ③JS 堆分配率（performance.memory 120 帧 Δ→MB/s;GC 分配率口径）
// 三臂:A(pure 2D,bgl=0) / Bridge(bgl=1,b2b=0) / Acc(bgl=1,b2b=1 缺省)。
// 运行:SW_ORIGIN=http://localhost:5212 node tools/run-diag.mjs --timeout=600000 scripts/_b2b-surface-gc.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await bootstrap(page, ORIGIN + '/?bgl=1&cloudcache=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });
console.log('createGame', !!gen?.ok);

await page.evaluate(() => {
  // 画布创建追踪（boot 期钩不到的存量面=DOMContentLoaded 前创建,不追;本账=游戏期创建面）
  if (!window.__canvasBorn) {
    window.__canvasBorn = { created: 0, list: [] };
    const orig = document.createElement.bind(document);
    document.createElement = function (tag, ...rest) {
      const el = orig(tag, ...rest);
      if (String(tag).toLowerCase() === 'canvas') {
        window.__canvasBorn.created++;
        window.__canvasBorn.list.push(el);
      }
      return el;
    };
  }
  const g = window.__swGame;
  const r = g.renderer;
  window.__armSet = (bgl, b2b) => { r.constructor.bglSetForTest(bgl); r.constructor.b2bSetForTest(b2b); };
  window.__ledger = () => {
    const born = window.__canvasBorn;
    let alive = 0;
    for (const c of born.list) if (c.width > 0 || c.isConnected) alive++;
    const mem = performance.memory ? { heap: performance.memory.usedJSHeapSize, gc: performance.memory ? undefined : 0 } : null;
    const gpulog = window.__swGPULog?.snapshot?.();
    return {
      created: born.created, alive,
      heapMB: mem ? +(mem.heap / 1048576).toFixed(1) : -1,
      swpipe: gpulog?.ctxs?.swpipe ?? null,
      worldCompose: gpulog?.ctxs?.worldCompose ?? null,
      path: r.bglPathUsed, creations: r.b2bWorldCanvasCreations,
      worldCanvasNull: r.worldCanvas === null,
    };
  };
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.waveQuality = 0; }));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  Object.defineProperty(r, '_liquidNow', { get: () => 60_000, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};
});
await pump(page, 60);
await page.evaluate(() => window.__pause(true));

// GL 上传字节钩（帧窗内累计;worldCanvas 源专账）
await page.evaluate(() => {
  const GLP = WebGL2RenderingContext.prototype;
  if (!GLP.__b2bLedger) {
    GLP.__b2bLedger = { upBytes: 0, wcBytes: 0, texImage2D: 0, texSubImage2D: 0 };
    const oImg = GLP.texImage2D;
    GLP.texImage2D = function (target, level, ...a) {
      const L = GLP.__b2bLedger;
      // (internalFmt,w,h,...) or (internalFmt,fmt,type,src)
      if (typeof a[0] === 'number' && typeof a[1] === 'number') L.upBytes += a[1] * a[2] * 4;
      else if (a[2] && a[2].width) { L.upBytes += a[2].width * a[2].height * 4; if (a[2] === window.__swGame.renderer.worldCanvas) L.wcBytes += a[2].width * a[2].height * 4; }
      L.texImage2D++;
      return oImg.apply(this, arguments);
    };
    const oSub = GLP.texSubImage2D;
    GLP.texSubImage2D = function (target, level, xo, yo, ...a) {
      const L = GLP.__b2bLedger;
      if (a.length === 3 && a[2] && a[2].width) { L.upBytes += a[2].width * a[2].height * 4; if (a[2] === window.__swGame.renderer.worldCanvas) L.wcBytes += a[2].width * a[2].height * 4; }
      else if (a.length >= 9 && typeof a[2] === 'number' && typeof a[3] === 'number') L.upBytes += a[2] * a[3] * 4;
      L.texSubImage2D++;
      return oSub.apply(this, arguments);
    };
    GLP.__b2bPatched = true;
  }
  window.__ledgerReset = () => { const L = GLP.__b2bLedger; L.upBytes = 0; L.wcBytes = 0; L.texImage2D = 0; L.texSubImage2D = 0; };
  window.__ledgerRead = () => ({ ...GLP.__b2bLedger });
});

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}
async function frameTiming60() {
  return page.evaluate(() => {
    const g = window.__swGame;
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) { window.__vnow = (window.__vnow || performance.now()) + 16.6667; g.frame(window.__vnow); }
    return (performance.now() - t0) / 60;
  });
}

// ---- 三臂扫描:海面场景（水体大场面=最重组） ----
await page.evaluate(() => { const g = window.__swGame; g.player.x = 400; g.player.y = g.world.groundLevel * 16 - 40; g.camera.x = g.player.x + 8; g.camera.y = g.player.y + 8; });
await pump(page, 40);
await page.evaluate(() => window.__pause(true));
await waitFrame(6);

const rows = [];
for (const [tag, bgl, b2b] of [['A(2D)', false, true], ['Bridge', true, false], ['Acc', true, true]]) {
  await page.evaluate((b, a) => window.__armSet(b, a), bgl, b2b);
  await waitFrame(6);
  const before = await page.evaluate(() => window.__ledgerRead());
  const heap0 = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0);
  const born0 = await page.evaluate(() => window.__canvasBorn.created);
  const ms = await frameTiming60();
  const after = await page.evaluate(() => window.__ledgerRead());
  const heap1 = await page.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : 0);
  const born1 = await page.evaluate(() => window.__canvasBorn.created);
  const led = await page.evaluate(() => window.__ledger());
  rows.push({
    tag,
    ms: +ms.toFixed(3),
    upMBframe: +((after.upBytes - before.upBytes) / 60 / 1048576).toFixed(2),
    wcMBframe: +((after.wcBytes - before.wcBytes) / 60 / 1048576).toFixed(3),
    texSub: after.texSubImage2D - before.texSubImage2D,
    texImg: after.texImage2D - before.texImage2D,
    heapMB: led.heapMB, heapdMB: +((heap1 - heap0) / 1048576).toFixed(2),
    canvasCreated: born1 - born0,
    creations: led.creations, wcNull: led.worldCanvasNull,
    swpipeLive: led.swpipe?.liveMB ?? null,
  });
  await waitFrame(3);
}
for (const r of rows) console.log('[LEDGER]', JSON.stringify(r));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5));
await browser.close();
