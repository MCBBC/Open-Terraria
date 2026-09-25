// ★rot 雨风角 A/B（2026-09-25 用户实报「雨滴风向倾斜失效」判别刃）：
//   定植强风+雨,冻结,G 臂(bglshim=1) vs 2D 臂(bglshim=0) 逐像素对拍+雨条角度量测。
//   判别:①两臂都倾斜≈同角 → 雨路径健康(用户世界静风=parity 正确);
//         ②GL 臂垂直/角小、2D 臂倾斜 → shim 发射支回归(同病);
//         ③两臂都垂直 → windSpeedCurrent 未驱动/生成侧缺角=移植缺失。
// 运行:SW_ORIGIN=http://localhost:5220 node tools/run-diag.mjs --timeout=600000 scripts/_rot-rain-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await bootstrap(page, ORIGIN + '/?bgl=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await pump(page, 30);

// ---- 夹具:地表开阔处+强风+雨,真实 update 填雨池 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  // 挑地表:直接把玩家放到出生点地表(已在地表),找开阔视野
  for (const k of ['enemies', 'drops', 'critters']) if (Array.isArray(g.entities?.[k])) g.entities[k].length = 0;
  const w = g.world.weather;
  w.raining = true; w.cloudAlpha = 1; w.maxRaining = 0.8;
  w.windSpeedSet = 0.6;                            // 强风(若 Setter 缺失直接写 current)
  try { w.windSpeedCurrent = 0.6; } catch { /* 只读则走 Set */ }
  await import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; m.options.data.waveQuality = 0; });
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  sky.maintainClouds = () => {}; sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
});
await page.evaluate(() => { window.__swGame.paused = false; });
await pump(page, 80);          // 真实 update 填雨池（雨滴生成+倾斜角就位）
const rainState = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world.weather;
  const pool = g.renderer.weatherFx?.pool ?? [];
  const act = pool.filter((d) => d.active);
  const angs = act.slice(0, 200).map((d) => d.rotation);
  return { wind: w.windSpeedCurrent, raining: w.raining, active: act.length,
    angMin: angs.length ? Math.min(...angs) : null, angMax: angs.length ? Math.max(...angs) : null };
});
console.log('rain state:', JSON.stringify(rainState));
await page.evaluate(() => { window.__swGame.paused = true; });
await new Promise((r) => setTimeout(r, 150));

// ---- 双臂三帧协议 ----
const shots = {};
for (const [nm, shim] of [['gl', 1], ['d2', 0]]) {
  await page.evaluate((s) => { window.__swGame.renderer.constructor.bglShimSetForTest(s); }, shim);
  await new Promise((r) => setTimeout(r, 200));
  const s1 = await page.screenshot({ type: 'png' });
  await new Promise((r) => setTimeout(r, 200));
  const s2 = await page.screenshot({ type: 'png' });
  shots[nm] = { a: s1.toString('base64'), a2: s2.toString('base64') };
  console.log('shot', nm);
}
await page.evaluate(() => { window.__swGame.renderer.constructor.bglShimSetForTest(1); });

// ---- 量测:世界带内逐像素对拍 + 雨条角（对每臂图做 Hough 简化:红/蓝雨条像素主轴）----
const cmp = await page.evaluate(async ({ shots }) => {
  const dec = async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(bmp, 0, 0);
    return { d: cx.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
  };
  // 雨条角估计:世界带内找「亮蓝-白细条」像素（雨条为光照着色的浅色 2px 条),
  //   对每条连通段做 PCA 主轴角——简化:取所有雨像素,按 y 分桶 40 行,每桶内 x 均值漂移
  //   对 y 回归斜率 → 平均倾角（雨条同向 ⇒ 漂移方向一致）
  const rainAngle = (img) => {
    const { d, w, h } = img;
    // 雨像素判据:亮度高(>140)且蓝>红且非天空(天空也蓝…改用「局部细条」:亮且上下邻像素暗)
    const pts = [];
    for (let y = 130; y < 690; y++) for (let x = 2; x < w - 2; x++) {
      const i = (y * w + x) * 4;
      const R = d[i], G = d[i + 1], B = d[i + 2];
      const lum = (R + G + B) / 3;
      if (lum > 150 && B >= R) {
        const up = (y - 3) > 0 ? ((y - 3) * w + x) * 4 : i;
        const dn = (y + 3) < h ? ((y + 3) * w + x) * 4 : i;
        const lumU = (d[up] + d[up + 1] + d[up + 2]) / 3;
        const lumD = (d[dn] + d[dn + 1] + d[dn + 2]) / 3;
        if (lumU < 110 && lumD < 110) pts.push([x, y]);   // 细条:上下 3px 处均暗
      }
    }
    if (pts.length < 30) return { n: pts.length, deg: null };
    // 分桶回归:每 12px 高桶内 x 均值;对桶中心 y 拟合斜率
    const H = 12;
    const buckets = new Map();
    for (const [x, y] of pts) {
      const k = Math.floor(y / H);
      if (!buckets.has(k)) buckets.set(k, [0, 0, 0]);
      const b = buckets.get(k); b[0] += x; b[1] += y; b[2]++;
    }
    let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
    for (const [k, b] of buckets) {
      if (b[2] < 4) continue;
      const mx = b[0] / b[2], my = b[1] / b[2];
      sx += mx; sy += my; sxx += mx * mx; sxy += mx * my; n++;
    }
    if (n < 4) return { n: pts.length, deg: null };
    // 对 y=斜率(x) 拟合:dreg = (n·sxy − sx·sy)/(n·sxx − sx²) → 角=atan(dy/dx 每桶漂移/12px)
    const cov = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const deg = +(Math.atan(cov) * 180 / Math.PI).toFixed(1);
    return { n: pts.length, deg };
  };
  const G = await dec(shots.gl.a), D = await dec(shots.d2.a);
  const ag = rainAngle(G), ad = rainAngle(D);
  // 双臂对拍:世界带 mismatch
  let n = 0, maxd = 0;
  for (let y = 130; y < 690; y++) for (let x = 0; x < G.w; x++) {
    const i = (y * G.w + x) * 4;
    const dd = Math.max(Math.abs(G.d[i] - D.d[i]), Math.abs(G.d[i + 1] - D.d[i + 1]), Math.abs(G.d[i + 2] - D.d[i + 2]));
    if (dd > 32) { n++; maxd = Math.max(maxd, dd); }
  }
  return { glAngle: ag, d2Angle: ad, crossMismatch: n, crossMaxd: maxd };
}, { shots });

console.log(JSON.stringify(cmp, null, 2));
const { glAngle, d2Angle } = cmp;
if (glAngle.deg === null || d2Angle.deg === null) console.log('VERDICT: INCONCLUSIVE —— 雨像素检出不足');
else if (Math.abs(d2Angle.deg) < 5) console.log('VERDICT: BOTH-VERTICAL —— 两臂都近垂直(生成侧/wind 驱动面,移植缺失倾向)');
else if (Math.abs(Math.abs(glAngle.deg) - Math.abs(d2Angle.deg)) < 6) console.log('VERDICT: BOTH-TILTED —— 两臂同角(雨路径健康)');
else console.log(`VERDICT: GL-ONLY-BROKEN —— GL ${glAngle.deg}° vs 2D ${d2Angle.deg}°(shim 回归)`);
await browser.close();
