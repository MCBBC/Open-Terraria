// ★BJ325 探针①：液体渲染 SolidTile 全式两站（BJ307 债）逐像素/逐 draw-call 对拍。
// 场景（测试 F1-F5 同构,天空白底、满水、quality0 钳 bob）：
//   A (10,ty) 全块+左水+上格半砖 —— 站①判别:带源 sy 0(修后)/4(修前)
//   B (14,ty) 全块+左水+上格全实心 —— 反真空:sy=4 恒定
//   C (18,ty) 自身半砖+左水+上格全实心 —— num4 臂:sy=0 恒定
//   D (20,ty) slope2+左水+上格半砖 —— 站②判别:IIII256 亮线在场(修后)/缺(修前)
//   E (24,ty) slope2+左水+上格全实心 —— 反真空:亮线缺席恒定
// 仪器：CanvasRenderingContext2D.drawImage 钩子（BJ274/IIIII256 实证范式）捕获
//   Liquid_0/LiquidSlope_0 源调用全参 + 整帧 canvas 落盘。
// 跑法（修后/修前各跑一次,tag 区分;修前=临时字节变异两站后还原）：
//   SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj325-liquid-two-sites.mjs -- --tag=after
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode, teleport } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { saveCanvasShot } from '../tools/probe/lib/shot.mjs';

const OUT = '/tmp/bj325-out';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TAG = (process.argv.find((a) => a.startsWith('--tag=')) || '--tag=after').slice(6);
const log = (...a) => console.log('[bj325-liq]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({});
const page = await openPage(browser, { errors: [] });
try {
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  if (!gen.ok) throw new Error('createGame: ' + gen.why);
  await godMode(page, true);
  await freezeClock(page, { tod: 0.5 });   // 白昼正午亮度
  await page.evaluate(async () => {
    const { waterWaves } = await import('/src/render/WaterWaves.ts');
    waterWaves.setQuality(0);   // 钳 IIIII251 bob → dy251=0 确定性（BJ307 同款）
  });
  await teleport(page, 400 * 16, 60 * 16);   // 相机先钉住,再布景
  await sleep(300);

  // ---- 场景注入（天空白底,玩家已移开;世界暂停后布景防液动）----
  const scene = await page.evaluate(() => {
    const g = window.__swGame;
    g.paused = true;
    const st = g.world.store;
    const ty = 60, tx0 = 400;
    const STONE = 2;   // TILE_DEFS key 'stone' → tile id 2（tileSolid 全式实心）
    const set = (x, y, t, liquid = 0, slope = 0, half = 0) => {
      const i = st.idx(x, y);
      st.type[i] = t; st.flags[i] = t ? 1 : 0;
      st.liquid[i] = liquid; st.liquidType[i] = liquid > 0 ? 1 : 0;
      st.slope[i] = slope; st.half[i] = half;
      st.wall[i] = 0;
    };
    set(tx0 + 10, ty, STONE); set(tx0 + 9, ty, 0, 255); set(tx0 + 10, ty - 1, STONE, 0, 0, 1);       // A
    set(tx0 + 14, ty, STONE); set(tx0 + 13, ty, 0, 255); set(tx0 + 14, ty - 1, STONE);               // B
    set(tx0 + 18, ty, STONE, 0, 0, 1); set(tx0 + 17, ty, 0, 255); set(tx0 + 18, ty - 1, STONE);      // C
    set(tx0 + 20, ty, STONE, 0, 2); set(tx0 + 19, ty, 0, 255); set(tx0 + 20, ty - 1, STONE, 0, 0, 1);// D
    set(tx0 + 24, ty, STONE, 0, 2); set(tx0 + 23, ty, 0, 255); set(tx0 + 24, ty - 1, STONE);         // E
    return { tx0, ty };
  });
  // 相机对准场景中心 (tx0+17, ty)
  await teleport(page, (scene.tx0 + 17) * 16, scene.ty * 16 + 8);
  await sleep(200);

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

  // ---- 泵帧（光照收敛+首绘懒加载贴图）----
  for (let k = 0; k < 8; k++) { await sleep(100); }
  const n1 = await page.evaluate(() => window.__liqDraws.length);
  await page.evaluate(() => { window.__liqDraws.length = 0; });   // 清首帧懒加载噪声
  for (let k = 0; k < 6; k++) { await sleep(100); }
  const draws = await page.evaluate(() => {
    const out = window.__liqDraws.slice();
    window.__liqOrigDrawImage && (CanvasRenderingContext2D.prototype.drawImage = window.__liqOrigDrawImage);
    delete window.__liqOrigDrawImage;
    return out;
  });
  log('draw records:', n1, '→', draws.length / 9, 'calls (post-warmup)');

  // ---- 像素档案（D/E 亮线区 + A 带区,世界坐标→屏幕）----
  const pixels = await page.evaluate(({ tx0, ty }) => {
    const g = window.__swGame;
    const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
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
      for (let i = 0; i < d.length; i += 4) s += d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ' ';
      return s.trim();
    };
    return {
      D: grabRaw((tx0 + 20) * 16, ty * 16),
      E: grabRaw((tx0 + 24) * 16, ty * 16),
      A: grabRaw((tx0 + 10) * 16, ty * 16),
    };
  }, { tx0: scene.tx0, ty: scene.ty });

  await saveCanvasShot(page, join(OUT, `liq-canvas-${TAG}.png`));
  writeFileSync(join(OUT, `liq-draws-${TAG}.json`), JSON.stringify({ tag: TAG, scene, draws, pixels }, null, 1));
  log('OK tag=' + TAG, '→', join(OUT, `liq-draws-${TAG}.json`));
} catch (err) {
  console.error('[bj325-liq] FAIL', err?.message ?? err);
  process.exitCode = 1;
} finally {
  await closeAllBrowsers().catch(() => {});
}
