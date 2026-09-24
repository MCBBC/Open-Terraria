// ★BJ325 探针①：液体渲染 SolidTile 全式两站（BJ307 债）逐 draw-call + 逐像素对拍。
// 场景（世界【不暂停】——暂停封死光照更新=场景全黑（diag5 实证）；改冻结钟+活世界
//   +稳定水盆+camera.follow 覆写钉机位；?wwarp=0&slopewave=0 关 GL 位移场=像素确定）：
//   A (410,60) 全块+左盆水+上格半砖 —— 站①判别:带源 sy 0(修后)/4(修前)
//   B (414,60) 全块+左盆水+上格全实心 —— 反真空:sy=4 恒定
//   C (418,60) 自身半砖+左盆水+上格全实心 —— num4 臂:sy=0 恒定
//   D (420,60) slope2+左盆水+上格半砖 —— 站②判别:IIII256 亮线在场(修后)/缺(修前)
//   E (424,60) slope2+左盆水+上格全实心 —— 反真空:亮线缺席恒定
//   每水格:下格实心+左格实心墙 → 液拟稳定 255。
// 仪器：drawImage 钩子（BJ274/IIIII256 范式;ImageBitmap 无 src 按尺寸 306x16/72x16 归类）。
// 跑法（修后/修前各一次;修前=临时字节变异两站还原）：
//   SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=420000 \
//     scripts/_bj325-liquid-two-sites.mjs -- --tag=after
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode, teleport } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { saveCanvasShot } from '../tools/probe/lib/shot.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const OUT = '/tmp/bj325-out';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TAG = (process.argv.find((a) => a.startsWith('--tag=')) || '--tag=after').slice(6);
const log = (...a) => console.log('[bj325-liq]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({});
const pageErrors = [];
const page = await openPage(browser, { errors: pageErrors });
try {
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
  // 带参重导航（_bj78-pixel-ab 先例:bootstrap 后 location.href 载 flag,再候桥）
  await page.evaluate((href) => { location.href = href; }, ORIGIN + '/?wwarp=0&slopewave=0');
  await sleep(1500);
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld, { timeout: 120_000 });
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  if (!gen.ok) throw new Error('createGame: ' + gen.why);
  await godMode(page, true);
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(async () => {
    const { waterWaves } = await import('/src/render/WaterWaves.ts');
    waterWaves.setQuality(0);   // 钳 IIIII251 bob → dy251=0 确定性（BJ307 同款）
    const w = window.__swGame.world.weather;
    if (w) { w.raining = false; w.maxRaining = 0; w.lightning = 0; w.numClouds = 0; }
  });

  // ---- 相机钉位+水盆场景（不暂停;follow 覆写=机位冻结,液拟照跑收敛;
  //   方块一律走 st.setTile 正门(触发 onTileChanged→chunk 失效重烘;裸写数组
  //   曾绕过失效=方块不渲染,diag6 实证)）----
  await teleport(page, 6600, 968);
  const scene = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const STONE = 2;
    // 自寻开放天域:取 x∈[395,445] 列的最高地形顶,场景悬其上 14 格(保证全部
    //   场景格 sky-exposed=昼间天光满;351 定点曾嵌山体=全黑,diag8 家族)
    // 本地地形顶(x∈[405,441] 逐列最高活格)→ 场景贴地嵌入:ty=maxTop+2,并向上
    //   凿 46 格天井(setTile 0=正门失效)——保证场景格 sky-exposed 且处满亮光照带
    //   (高空层 y≲150 光照衰减=黑,定点 60/108/119 三版实证)
    let maxTop = 0;
    for (let x = 405; x <= 441; x++) {
      for (let y = 0; y < 500; y++) {
        if (st.flags[st.idx(x, y)]) { maxTop = Math.max(maxTop, y); break; }
      }
    }
    const ty = Math.max(8, maxTop + 2);
    for (let x = 403; x <= 443; x++) {
      for (let y = Math.max(1, ty - 46); y < ty; y++) st.setTile(x, y, 0);
    }
    const solid = (x, y) => st.setTile(x, y, STONE);
    const basin = (X) => {           // 水盆:interest(X) 左侧三格(墙-底-水)+格下封底
      solid(X - 2, ty); solid(X - 2, ty + 1); solid(X - 1, ty + 1); solid(X, ty + 1);
      st.liquid[st.idx(X - 1, ty)] = 255; st.liquidType[st.idx(X - 1, ty)] = 1;
    };
    for (const X of [10, 17, 24, 31, 38]) basin(400 + X);
    const mark = (dx, half, slope) => {   // interest 块(half/slope 裸写=烘焙下帧读)
      const X = 400 + dx, i = st.idx(X, ty);
      st.setTile(X, ty, STONE);
      st.half[i] = half; st.slope[i] = slope;
      st.type[i] = STONE; st.flags[i] = 1;
    };
    mark(10, 0, 0);   // A 全块+上半砖邻
    mark(17, 0, 0);   // B 全块+上全实心邻
    mark(24, 1, 0);   // C 自半砖
    mark(31, 0, 2);   // D slope2
    mark(38, 0, 2);   // E slope2
    const above = (dx, half) => {     // 上格形态
      const X = 400 + dx, i = st.idx(X, ty - 1);
      st.setTile(X, ty - 1, STONE);
      st.half[i] = half; st.type[i] = STONE; st.flags[i] = 1;
    };
    above(10, 1); above(17, 0); above(24, 0); above(31, 1); above(38, 0);
    // 玩家停场景右侧(相机已钉)
    g.player.x = 460 * 16; g.player.y = (ty + 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    const c = g.camera;
    c.x = 424 * 16; c.y = ty * 16 + 8;
    c.follow = () => {};   // 机位冻结（c10a cloudPin 同习语）
    return {
      tx0: 400, ty, maxTop,
      water0: [10, 17, 24, 31, 38].map((dx) => st.liquid[st.idx(400 + dx - 1, ty)]),
      cState: (() => { const i = st.idx(424, ty);
        return { half: st.half[i], slope: st.slope[i], flags: st.flags[i], liquid: st.liquid[i], type: st.type[i] }; })(),
    };
  });
  await sleep(300);

  // ---- drawImage 钩子（BJ274 范式）----
  await page.evaluate(() => {
    window.__liqDraws = [];
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    window.__liqOrigDrawImage = orig;
    proto.drawImage = function (img, a, b, c, d, e, f, g2, h) {
      try {
        const src = String(img?.src || '');
        const dim = img && img.width ? img.width + 'x' + img.height : '?';
        // Liquid_0.png=306x16(平面水条) / LiquidSlope_0.png=72x16(斜面表);
        // atlas 可能返 ImageBitmap(src='') → 按尺寸归类（dst 坐标过滤兜误配）
        let tag = null;
        if (src.includes('LiquidSlope_0') || (!src && dim === '72x16')) tag = 'S';
        else if (src.includes('Liquid_0') || (!src && dim === '306x16')) tag = 'P';
        if (tag) window.__liqDraws.push(tag, a, b, c, d, e, f, g2, h);
      } catch { /* 探针永不干扰绘制 */ }
      return orig.call(this, img, a, b, c, d, e, f, g2, h);
    };
  });

  // ---- 泵帧（确定性 tick;液拟收敛+光照 4 态收敛+chunk 重烘）----
  await pump(page, 150, { step: 30 });
  const n1 = await page.evaluate(() => window.__liqDraws.length);
  await page.evaluate(() => { window.__liqDraws.length = 0; });   // 清瞬态
  await pump(page, 40, { step: 20 });
  const draws = await page.evaluate(() => {
    const out = window.__liqDraws.slice();
    window.__liqOrigDrawImage && (CanvasRenderingContext2D.prototype.drawImage = window.__liqOrigDrawImage);
    delete window.__liqOrigDrawImage;
    return out;
  });
  const state = await page.evaluate(({ tx0, ty }) => {
    const st = window.__swGame.world.store;
    return [10, 17, 24, 31, 38].map((dx) => st.liquid[st.idx(tx0 + dx - 1, ty)]);
  }, { tx0: scene.tx0, ty: scene.ty });
  log('basin water after pump:', JSON.stringify(state), '(init [255,255,255,255,255])');
  log('draw records:', n1, '→', draws.length / 9, 'calls (post-warmup)');

  // ---- 像素档案（D/E 亮线区 + A 带区）----
  const pixels = await page.evaluate(({ tx0, ty }) => {
    const g = window.__swGame;
    const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[3];
    const grabRaw = (wx, wy) => {
      const [sx, sy] = g.camera.worldToScreen(wx, wy);
      const z = g.camera.zoom;
      const c2 = document.createElement('canvas');
      const W = Math.round(16 * z), H = Math.round(16 * z);
      c2.width = W; c2.height = H;
      const cx = c2.getContext('2d', { willReadFrequently: true });
      cx.drawImage(cv, Math.round(sx), Math.round(sy), W, H, 0, 0, W, H);
      const d = cx.getImageData(0, 0, W, H).data;
      let s = '';
      for (let i = 0; i < d.length; i += 4) s += d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3] + ' ';
      return s.trim();
    };
    return {
      // 像素分析离线做:主画布整帧 PNG(saveCanvasShot)+【worldCanvas 预乘层】
      //   整帧 dataURL(无光照乘/无合成=跨构建字节确定;光照地图随真实时间漂移
      //   曾毁跨运行像素 AB)。world 层内离线找簇切格。
      cam: { x: g.camera.x, y: g.camera.y, zoom: g.camera.zoom },
      cvW: cv.width, cvH: cv.height,
      worldLayer: (() => {
        const wc = g.renderer.worldCanvas;
        return wc ? wc.toDataURL('image/png') : null;
      })(),
      worldLayerSize: (() => {
        const wc = g.renderer.worldCanvas;
        return wc ? [wc.width, wc.height] : null;
      })(),
    };
  }, { tx0: scene.tx0, ty: scene.ty });

  await saveCanvasShot(page, join(OUT, `liq-canvas-${TAG}.png`));
  writeFileSync(join(OUT, `liq-draws-${TAG}.json`), JSON.stringify({ tag: TAG, scene, basinWaterAfter: state, draws, pixels }, null, 1));
  log('OK tag=' + TAG, '→', join(OUT, `liq-draws-${TAG}.json`));
  if (pageErrors.length) log('PAGE ERRORS:', JSON.stringify(pageErrors.slice(0, 8)));
} catch (err) {
  console.error('[bj325-liq] FAIL', err?.message ?? err);
  process.exitCode = 1;
} finally {
  await closeAllBrowsers().catch(() => {});
}
