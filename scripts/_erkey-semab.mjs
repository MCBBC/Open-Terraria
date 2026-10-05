// ★30fps 刀1 语义对拍仪：texFromRegion 键归一「整数化是否改变可见输出」
//   REF=刀前行为（分数源 rect → round 尺寸 dest）vs NEW=刀后行为（floor/ceil 整数窗）
//   源画布=活机真水贴图（vanilla/Liquid_0 表面静态带 srcY=1280 + 微光 water_14）
//   +合成条带（亮线+渐变,模拟水面带结构）。判据:逐像素 maxd/差异像素数。
//   另验:层内 texFromRegion(小数 args) 落库键=归一键（无小数）+regScratch 窗=整数窗。
// run: SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs --timeout=200000 scripts/_erkey-semab.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5213';
const page = await openPage(await launchBrowser({ headless: true }), {});
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'eolcensus', size: 'small', pinRandom: 20261003, log: () => {} });
if (!made?.ok) { console.error('createGame fail'); process.exit(1); }
await sleep(1500);

const out = await page.evaluate(async () => {
  const res = { cases: [], live: null };

  // —— 取真水贴图（renderer.atlas.ensureVImage 与 VanillaLiquidRenderer 同口;
  //      游戏已载入=同步命中;lazy miss 触发载入后再取一次）——
  let waterImg = null, shimmerImg = null;
  try {
    const A = window.__swGame?.renderer?.atlas;
    if (A?.ensureVImage) {
      waterImg = A.ensureVImage('vanilla/Liquid_0.png');
      shimmerImg = A.ensureVImage('vanilla/Liquid_14.png');
      if (!waterImg) {
        await new Promise((r2) => setTimeout(r2, 1500));
        waterImg = A.ensureVImage('vanilla/Liquid_0.png');
        shimmerImg = A.ensureVImage('vanilla/Liquid_14.png');
      }
    }
  } catch (e) { res.atlasErr = String(e); }

  // 合成条带：顶部 2px 亮线 + 垂直渐变体（≈水面带结构:1280 静态带同构）
  const mkStrip = () => {
    const c = document.createElement('canvas');
    c.width = 34; c.height = 16;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 2, 0, 16);
    gr.addColorStop(0, '#93b9ff'); gr.addColorStop(1, '#1b4fd8');
    x.fillStyle = gr; x.fillRect(0, 2, 34, 14);
    x.fillStyle = '#b9d3ff'; x.fillRect(0, 0, 34, 2);
    return c;
  };

  const pixels = (cv) => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const compare = (a, b) => {
    const da = pixels(a), db = pixels(b);
    let n = 0, maxd = 0, sum = 0;
    const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
    const total = w * h;
    for (let i = 0; i < total * 4; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]),
        Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
      if (d > 0) n++;
      if (d > maxd) maxd = d;
      sum += d;
    }
    return { diffPx: n, total, maxd, mean: +(sum / total).toFixed(3) };
  };
  // OLD:刀前 texFromRegion scratch 绘制式=源 rect 原样(分数) → dest round(sw)×round(sh)
  const drawOld = (img, sx, sy, sw, sh) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
    const x = c.getContext('2d', { willReadFrequently: true });
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  };
  // NEW:刀后整数窗 floor(s)+ceil(e)
  const drawNew = (img, sx, sy, sw, sh) => {
    const isx = Math.floor(sx), isy = Math.floor(sy);
    const w = Math.max(1, Math.ceil(sx + sw) - isx), h = Math.max(1, Math.ceil(sy + sh) - isy);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.clearRect(0, 0, w, h);
    x.drawImage(img, isx, isy, w, h, 0, 0, w, h);
    return c;
  };

  const cases = [];
  const srcs = [['synth-strip', mkStrip()]];
  if (waterImg) {
    // 真水贴图表面静态带（srcY=1280 处 16px 内容;VanillaLiquidRenderer isSurface 支同区）
    cases.push(['water-band y=1280 [0,1280,34,0.52]', waterImg, 0, 1280, 34, 0.52]);
    cases.push(['water-band y=1280 [0,1280,34,0.48]', waterImg, 0, 1280, 34, 0.48]);
    cases.push(['water-band y=1280 [0,1280,34,1.37]', waterImg, 0, 1280, 34, 1.37]);
    cases.push(['water-band y=1280 [0.6,1280.3,16.5,0.8]', waterImg, 0.6, 1280.3, 16.5, 0.8]);
    cases.push(['water-body [0,80.4,16,15.2]', waterImg, 0, 80.4, 16, 15.2]);
  }
  if (shimmerImg) cases.push(['shimmer [0,1280,34,0.75]', shimmerImg, 0, 1280, 34, 0.75]);
  const st = mkStrip();
  cases.push(['strip [0,0,34,0.52]', st, 0, 0, 34, 0.52]);
  cases.push(['strip [0,0.48,34,0.52]', st, 0, 0.48, 34, 0.52]);
  cases.push(['strip [0,0.6,34,0.8]', st, 0, 0.6, 34, 0.8]);
  cases.push(['strip [0.5,0,33.5,16]', st, 0.5, 0, 33.5, 16]);
  for (const [tag, img, sx, sy, sw, sh] of cases) {
    if (!img) continue;
    const a = drawOld(img, sx, sy, sw, sh);
    const b = drawNew(img, sx, sy, sw, sh);
    res.cases.push({ tag, old: `${a.width}x${a.height}`, nw: `${b.width}x${b.height}`, ...compare(a, b) });
  }

  // —— 层内行为验证：texFromRegion(小数 args) → 落库键无小数 + scratch=整数窗 ——
  const r = window.__swGame.renderer;
  const glw = r._accGlw ?? r.glfx;
  if (glw && !glw.unavailable) {
    const img = st;
    const callerKey = 'er:999001:0:0,0,34,0.52';
    const e1 = glw.texFromRegion(callerKey, img, 0, 0, 34, 0.52);
    const e2 = glw.texFromRegion('er:999001:0:0,0,34,0.99', img, 0, 0, 34, 0.99);   // 异小数键同窗
    const e3 = glw.texFromRegion('er:999001:0:0,0,34,1', img, 0, 0, 34, 1);        // 整数同窗调用
    const normKey = 'er:999001:0:0,0,34,1';
    const sameEntry = e1 && e1 === e2 && e2 === e3;
    const stored = glw.texs.get(normKey);
    // scratch 窗验证
    const sc = glw.regScratch;
    const scPix = sc ? sc.getContext('2d').getImageData(0, 0, 1, 1).data : null;
    res.live = {
      ok: !!(e1 && sameEntry && stored === e1),
      normKeyHit: !!stored,
      entryW: e1?.w, entryH: e1?.h,
      scratchW: sc?.width, scratchH: sc?.height,
      decimalKeyAbsent: !glw.texs.get(callerKey),
    };
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await page.browser().close();
