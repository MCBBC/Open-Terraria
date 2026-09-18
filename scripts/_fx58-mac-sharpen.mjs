// ★FX58 2026-09-18 信息栏字体 Mac「过于锐化」探针(用户实报:Windows FX57 显示优化
// 落地后,Mac Retina 上信息栏文字硬边感/描边锐利过度)。
//
// 【机制链定谳证据】(PHASE=before 应全绿)
//  ① 画布架构:主画布后备 = CSS 逻辑分辨率(Renderer.resize :3299 canvas.width=
//     innerWidth,非 dpr 缩放)+ index.html:47 `image-rendering: pixelated` ⇒
//     Mac dpr=2 下浏览器对整个 canvas 元素做 ×2 最近邻硬拉伸(截图 2×2 块一致性实证)。
//  ② FX57 管线三连硬量化零灰度:离屏 12px 烘焙+binarize(0/255) → 主画布 NN 12→14
//     (imageSmoothingEnabled=false) → 元素 ×2 pixelated。A/B 台架(真实
//     InfoAccsLayer.draw,白底)行带直方图:中间调像素=0(纯二值)=硬边 smoking gun。
//  ③ 候选(原版线性采样语义):同一烘焙位图改双线性放大(SpriteBatch LinearClamp
//     同相,vanilla Main.cs:41568 UI Begin null sampler=FNA 缺省 LinearClamp)——
//     台架 B 量测:边缘出现有界 ramp、笔画芯保持实心、ramp 数远小于旧直绘 fillText
//     AA(FX57 Windows 糊根因=非整数档覆盖全域碎化,不同物)。
//
// 【PHASE=after 判别力】修复(imageSmoothingEnabled=true+整倍率守卫)后:
//  ④ 实机生产路径(InfoAccsLayer.draw)行带中间调 >0(有界 ramp 落地);
//  ⑤ 台架 A(生产路径)与 B(候选)像素 diff=0(同相);
//  ⑥ 截图 /tmp/fx58-live-{phase}.png(实机信息列,dsf=2=用户观感)、
//     /tmp/fx58-ab-{phase}.png(A/B/C 三联)、/tmp/fx58-zoom-{phase}.png(单行 ×3 放大)。
// 变异判别:修复行( smoothing=true )回拨 false ⇒ ④ 必红(登记于 _mutate 流程)。
import puppeteer from 'puppeteer-core';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PHASE = process.env.PHASE ?? 'before';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5229') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: PHASE === 'dpr1' ? 1 : 2 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 120000 });
  await page.keyboard.type('FX58锐度');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 120000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 120000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
// 收起 spawn 自开的对话/大地图/背包(直设渲染层状态,不走按键——Esc 会开背包),
// 信息栏回到右上原位(截图域)
await page.evaluate(() => {
  const g = window.__swGame;
  try { g.closeNpcDialog?.(true); } catch { /* 无对话 */ }
  g.renderer.playerInventory = false;
  g.renderer.mapStyle = 0;
});
await new Promise((r) => setTimeout(r, 600));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 冻结时钟(III255 夹具):A/B/C/D 四张台架画布必须同内容——否则时间行文本
// 在台架间前移,人为制造 diff 噪声(首轮实测 diffA-D=224 全是钟面漂移)
const frz = await freezeClock(page, { tod: 0.5 });
check('时钟已冻结(台架内容稳定)', frz.ok === true, JSON.stringify(frz));

// 入包信息族(同 FX57 探针配方:常规+灰字行源)
await page.evaluate(() => {
  const g = window.__swGame;
  const vk = window.__swVANILLA_ITEM_KEY_BY_ID ?? {};
  const it = window.__swItems ?? {};
  [17, 18, 393, 3119, 3099, 3084, 3102, 3118].forEach((vid, i) => {
    const k = vk[vid];
    if (k && it[k]) g.player.inv.slots[40 + i] = { id: it[k], stack: 1 };
  });
});
await new Promise((r) => setTimeout(r, 1200));

const rows = await page.evaluate(() => {
  const g = window.__swGame;
  return { n: g.renderer.infoAccs.state.rows.length, texts: g.renderer.infoAccs.state.rows.map((r) => r.text) };
});
check('信息行渲染中(八件饰品)', rows.n >= 5, JSON.stringify({ n: rows.n, texts: rows.texts.slice(0, 3) }));

// ① 画布架构事实:后备=逻辑分辨率 + pixelated + dpr
const arch = await page.evaluate(() => {
  const cv = window.__swGame.renderer.canvas;
  return {
    dpr: devicePixelRatio,
    backingW: cv.width, backingH: cv.height,
    cssW: cv.clientWidth, cssH: cv.clientHeight,
    imageRendering: getComputedStyle(cv).imageRendering,
  };
});
console.log('[fx58] 画布架构:', JSON.stringify(arch));
check(PHASE === 'dpr1' ? 'dpr=1(Windows 100% 模拟)' : 'dpr=2(Retina 用户环境)', arch.dpr === (PHASE === 'dpr1' ? 1 : 2), `dpr=${arch.dpr}`);
check('主画布后备=逻辑分辨率(非 dpr 缩放)', arch.backingW === arch.cssW && arch.cssW === 1280,
  `backing=${arch.backingW}x${arch.backingH} css=${arch.cssW}x${arch.cssH}`);
check('canvas 元素 image-rendering:pixelated(×2 硬拉伸站)', arch.imageRendering === 'pixelated', arch.imageRendering);

// ② A/B/C 台架(白底,真实 InfoAccsLayer.draw)+ 度量
const bench = await page.evaluate(() => {
  const g = window.__swGame;
  const W = 460, H = 800, X = W - 280, Y = -32, pitch = 22;
  const mk = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv; };
  const infoCtx = {
    gates: { accWatch: 3, accDepthMeter: 3, accCompass: 3, accFishFinder: false, accWeatherRadio: true,
      accCalendar: true, accThirdEye: true, accJarOfSouls: false, accCritterGuide: true, accStopwatch: true,
      accOreFinder: true, accDreamCatcher: false },
    mainTime: 27000, dayTime: true,
    weather: { storming: false, maxRaining: 0, cloudBGActive: 0, numClouds: 0, windSpeedCurrent: 2, sandstorm: false, globalTimeSec: 0 },
    moonPhase: 0, bloodMoon: false, eclipse: false,
    fishingText: null, oreText: null, rareText: null, rareVid: null,
    enemyCount: 0, killText: null, dps: -1, mph: 42,
    centerX: 2100, bottomY: 331 * 16, worldSurface: 331, rockLevel: 427, maxTilesX: 4200, maxTilesY: 1200,
  };
  const colorOf = (r) => r.gold ? '#FFE745' : r.grayed ? '#646464' : '#e8e4f0';
  const rowsN = (() => {
    const cv = mk(); const c = cv.getContext('2d');
    g.renderer.infoAccs.draw(c, W, H, infoCtx, [], false, false, 1, 0, 0, () => {});
    return g.renderer.infoAccs.state.rows.map((r) => ({ text: r.text, grayed: !!r.grayed, gold: !!r.gold }));
  })();

  // A = 生产路径现状(烘焙+NN;PHASE=after 时=HiDPI 档已修复超采样线性采样)
  const cvA = mk();
  const actx = cvA.getContext('2d');
  actx.fillStyle = '#fff'; actx.fillRect(0, 0, W, H);
  g.renderer.infoAccs.draw(actx, W, H, infoCtx, [], false, false, 1, 0, 0, () => {});

  // B = 候选①:同生产代码,imageSmoothingEnabled 强制 true(defineProperty 拦截,仅台架)
  const cvB = mk();
  const bctx = cvB.getContext('2d');
  bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, W, H);
  const proto = Object.getPrototypeOf(bctx);
  const desc = Object.getOwnPropertyDescriptor(proto, 'imageSmoothingEnabled');
  Object.defineProperty(bctx, 'imageSmoothingEnabled', {
    get() { return true; },
    set() { /* 拦截:恒 true(候选=线性采样) */ },
    configurable: true,
  });
  g.renderer.infoAccs.draw(bctx, W, H, infoCtx, [], false, false, 1, 0, 0, () => {});
  Object.defineProperty(bctx, 'imageSmoothingEnabled', desc);   // 还原

  // C = FX57 前旧直绘(fillText 14px AA,Windows「糊」参照系)
  const cvC = mk();
  const cctx = cvC.getContext('2d');
  cctx.fillStyle = '#fff'; cctx.fillRect(0, 0, W, H);
  cctx.imageSmoothingEnabled = false;
  cctx.textAlign = 'left'; cctx.textBaseline = 'middle';
  cctx.font = '14px "Fusion Pixel 12px", monospace';
  rowsN.forEach((r, i) => {
    const ty = Y + 74 + pitch * i + 48;
    const m = cctx.measureText(r.text);
    const w = m.width;
    let scaleX = 1; if (w > 215) scaleX = 215 / w;
    let scaleY = 1; if (scaleX < 0.58) scaleY = 1 - scaleX / 3;
    const dim = i === 2 ? 0.34 : 1;
    cctx.save();
    cctx.translate(X + 20, ty);
    cctx.scale(scaleX, scaleY);
    cctx.globalAlpha = dim;
    for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { cctx.fillStyle = '#000'; cctx.fillText(r.text, ox, oy); }
    cctx.fillStyle = colorOf(r);
    cctx.fillText(r.text, 0, 0);
    cctx.restore();
  });

  // D = 候选:HiDPI 档 2× 超采样烘焙(28px 灰度 AA)→ drawImage 线性采样 ÷2 盒滤波
  //     → 14px 逻辑位图 1:1 直出(原版语义:rasterize at texture res + LinearClamp)
  const SS = 2;
  const mkAA = (text) => {
    const probe = document.createElement('canvas'); probe.width = 8; probe.height = 8;
    const pc = probe.getContext('2d');
    const F28 = '28px "Fusion Pixel 12px", monospace';
    pc.font = F28; pc.textAlign = 'left'; pc.textBaseline = 'alphabetic';
    const m = pc.measureText(text);
    const w12 = m.width, ascA = m.actualBoundingBoxAscent, descA = m.actualBoundingBoxDescent;
    const ascI = Math.ceil(ascA), descI = Math.ceil(descA);
    const OUT_SS = 4;                       // ±2 逻辑 px = ±4 subpx(旧直绘 ±2 字体像素同环)
    const padL = OUT_SS + 1;                // =生产 MouseTextBake bake():outline+1
    const w = padL + Math.ceil(w12) + OUT_SS + 1, baseY = OUT_SS + 1 + ascI, h = baseY + descI + OUT_SS + 1;
    const sil = document.createElement('canvas'); sil.width = w; sil.height = h;
    const sc = sil.getContext('2d');
    sc.font = F28; sc.textAlign = 'left'; sc.textBaseline = 'alphabetic'; sc.fillStyle = '#000';
    for (const [ox, oy] of [[OUT_SS, 0], [-OUT_SS, 0], [0, OUT_SS], [0, -OUT_SS]]) sc.fillText(text, padL + ox, baseY + oy);
    sc.fillText(text, padL, baseY);
    const mask = document.createElement('canvas'); mask.width = w; mask.height = h;
    const mc = mask.getContext('2d');
    mc.font = F28; mc.textAlign = 'left'; mc.textBaseline = 'alphabetic'; mc.fillStyle = '#fff';
    mc.fillText(text, padL, baseY);
    return { sil, mask, w, h, padL, baseY, ascA, w12 };
  };
  const cvD = mk();
  const dctx = cvD.getContext('2d');
  dctx.fillStyle = '#fff'; dctx.fillRect(0, 0, W, H);
  dctx.textAlign = 'left'; dctx.textBaseline = 'middle';
  const cacheD = new Map();
  rowsN.forEach((r, i) => {
    const ty = Y + 74 + pitch * i + 48;
    dctx.font = '14px "Fusion Pixel 12px", monospace';
    const m = dctx.measureText(r.text);
    let scaleX = 1; if (m.width > 215) scaleX = 215 / m.width;
    let scaleY = 1; if (scaleX < 0.58) scaleY = 1 - scaleX / 3;
    const dim = i === 2 ? 0.34 : 1;
    let b = cacheD.get(r.text);
    if (!b) { b = mkAA(r.text); cacheD.set(r.text, b); }
    // 与生产 drawBakedMouseText 同式:kx=bake 推进宽反推,ky=TARGET/bakePx(=1/SS)
    const kx = (m.width * scaleX) / b.w12, ky = (14 / (14 * SS)) * scaleY;
    const inkTop = ty - m.actualBoundingBoxAscent * scaleY;
    const dx = (X + 20) - b.padL * kx, dy = inkTop - (b.baseY - b.ascA) * ky;
    const dw = b.w * kx, dh = b.h * ky;
    dctx.save();
    dctx.imageSmoothingEnabled = true;
    if (dim < 1) dctx.globalAlpha = dim;
    dctx.drawImage(b.sil, dx, dy, dw, dh);
    // 染色(scratch source-in,同生产)
    const scratch = document.createElement('canvas'); scratch.width = b.w; scratch.height = b.h;
    const scc = scratch.getContext('2d');
    scc.drawImage(b.mask, 0, 0);
    scc.globalCompositeOperation = 'source-in';
    scc.fillStyle = colorOf(r);
    scc.fillRect(0, 0, b.w, b.h);
    dctx.drawImage(scratch, dx, dy, dw, dh);
    dctx.restore();
  });

  // 度量:每行带 [ty±9)×[X+20, X+275) —— 调色板外 ramp 像素 / 硬边对 / 实心笔画像素
  const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const overWhite = (c, a) => c.map((v) => Math.round(v * a + 255 * (1 - a)));
  const overBlack = (c, a) => c.map((v) => Math.round(v * a));
  const metrics = (cv, rowsL) => {
    const c = cv.getContext('2d', { willReadFrequently: true });
    let ramp = 0, hardPairs = 0, solid = 0;
    const perRow = rowsL.map((r, i) => {
      const ty = Y + 74 + pitch * i + 48;
      const dim = i === 2 ? 0.34 : 1;
      const tc = hex2rgb(colorOf(r));
      // 压暗行合成差异:A/D(bake:剪影先合成上画布,整图 globalAlpha)=字色叠在
      // 【168 灰剪影】上;C(旧直绘:描边/本体逐遍 α0.34 叠加,四遍描边叠白
      // ≈1-(0.66)^4→深底≈48→×0.66≈31)=字色叠在更深底上(≈100)。
      // 两族底色都入调色板(压暗行部分失配计入 C 的 ramp=糊,符合参照系定位)。
      const dimSil = Math.round(255 * (1 - dim));
      const glyphBakeDim = dim < 1 ? tc.map((v) => Math.round(v * dim + dimSil * (1 - dim))) : tc;
      const glyphOldDim = dim < 1 ? tc.map((v) => Math.round(v * dim + 31 * (1 - dim))) : tc;
      const pal = [[255, 255, 255], overWhite([0, 0, 0], dim), glyphBakeDim, glyphOldDim];
      const d = c.getImageData(X + 20, ty - 9, 255, 18).data;
      let r0 = 0, h0 = 0, s0 = 0;
      const classify = (p) => {
        let best = 1e9, bi = -1;
        for (let q = 0; q < pal.length; q++) {
          const dist = Math.abs(d[p] - pal[q][0]) + Math.abs(d[p + 1] - pal[q][1]) + Math.abs(d[p + 2] - pal[q][2]);
          if (dist < best) { best = dist; bi = q; }
        }
        return best <= 36 ? bi : -1;
      };
      const BW = 255, BH = 18;
      const prev = new Int16Array(BW * BH);
      for (let p = 0; p < d.length; p += 4) prev[p / 4] = classify(p);
      for (let y = 0; y < BH; y++) {
        for (let x = 0; x < BW; x++) {
          const cl = prev[y * BW + x];
          if (cl === -1) { r0++; continue; }
          if (cl === 2) s0++;
          if (x > 0 && cl >= 0 && prev[y * BW + x - 1] >= 0 && cl !== prev[y * BW + x - 1]) h0++;
        }
      }
      ramp += r0; hardPairs += h0; solid += s0;
      return { i, text: r.text.slice(0, 12), ramp: r0, hard: h0, solid: s0 };
    });
    return { ramp, hardPairs, solid, perRow };
  };
  const mA = metrics(cvA, rowsN), mB = metrics(cvB, rowsN), mC = metrics(cvC, rowsN), mD = metrics(cvD, rowsN);
  // A vs B / A vs D 文本列像素 diff(x≥X+17:排除图标列(X-2..X+14 及悬停外扩 18×18
  // 至 X+16)——图标在分数坐标下的采样随 intercept/bench 组态而异,与文本判定无关)
  const TX0 = X + 17, TW = 245, TY = 60, TH = rowsN.length * pitch + 40;
  const da = cvA.getContext('2d').getImageData(TX0, TY, TW, TH).data;
  const diffOf = (cv) => {
    const dx2 = cv.getContext('2d').getImageData(TX0, TY, TW, TH).data;
    let n = 0;
    for (let p = 0; p < da.length; p += 4) {
      if (Math.abs(da[p] - dx2[p]) + Math.abs(da[p + 1] - dx2[p + 1]) + Math.abs(da[p + 2] - dx2[p + 2]) > 8) n++;
    }
    return n;
  };
  const diffB = diffOf(cvB), diffD = diffOf(cvD);
  window.__fx58 = { cvA, cvB, cvC, cvD, rowsN };
  return { rowsN, mA, mB, mC, mD, diffB, diffD };
});
console.log('[fx58] A(生产现状)   ramp=%d hard=%d solid=%d  逐行=%s', bench.mA.ramp, bench.mA.hardPairs, bench.mA.solid, JSON.stringify(bench.mA.perRow));
console.log('[fx58] B(双线性12→14) ramp=%d hard=%d solid=%d  diffA=%d', bench.mB.ramp, bench.mB.hardPairs, bench.mB.solid, bench.diffB);
console.log('[fx58] C(旧直绘AA)    ramp=%d hard=%d solid=%d', bench.mC.ramp, bench.mC.hardPairs, bench.mC.solid);
console.log('[fx58] D(2×超采样÷2)  ramp=%d hard=%d solid=%d  diffA=%d', bench.mD.ramp, bench.mD.hardPairs, bench.mD.solid, bench.diffD);

if (PHASE === 'before') {
  check('②A 生产管线行带零中间调(纯二值=硬边 smoking gun)', bench.mA.ramp <= 5, `ramp=${bench.mA.ramp}`);
  check('②A NN 硬边对显著(每行边界全为硬跳变)', bench.mA.hardPairs >= bench.mA.perRow.length * 40, `hard=${bench.mA.hardPairs}`);
  check('③B 双线性放大笔画芯塌( washing 实证=FX57 糊根因复演,否决)', bench.mB.solid < bench.mA.solid * 0.5, `B=${bench.mB.solid} A=${bench.mA.solid}`);
  check('③D 超采样÷2 线性采样:笔画芯实心(≥A 的 60%)', bench.mD.solid >= bench.mA.solid * 0.6, `D=${bench.mD.solid} A=${bench.mA.solid}`);
  check('③D 软边落地(ramp>0)且硬边对塌陷(<A 的 30%)', bench.mD.ramp > 10 && bench.mD.hardPairs < bench.mA.hardPairs * 0.3, `D.ramp=${bench.mD.ramp} D.hard=${bench.mD.hardPairs} A.hard=${bench.mA.hardPairs}`);
  check('③D 笔画芯优于旧直绘 AA(≥C 的 90%)', bench.mD.solid >= bench.mC.solid * 0.9, `D=${bench.mD.solid} C=${bench.mC.solid}`);
  check('③D AA 有界非全域(ramp ≤ C)', bench.mD.ramp <= bench.mC.ramp * 1.1, `D=${bench.mD.ramp} C=${bench.mC.ramp}`);
  check('②C 旧直绘 AA=糊参照系(ramp 显著)', bench.mC.ramp >= 20, `C=${bench.mC.ramp}`);
} else if (PHASE === 'dpr1') {
  // 跨平台回归档:Windows 100% (dpr=1) → pixel 档,FX57 管线须逐字节保持
  check('④pixel dpr=1 生产=FX57 二值 NN(行带零中间调)', bench.mA.ramp <= 5, `ramp=${bench.mA.ramp}`);
  check('④pixel dpr=1 硬边对显著(NN 语义保持)', bench.mA.hardPairs >= bench.mA.perRow.length * 40, `hard=${bench.mA.hardPairs}`);
  check('④pixel dpr=1 与 hidpi 档位图互异(档位真分档)', bench.diffD > 100, `diffA-D=${bench.diffD}`);
} else {
  check('④ 实机生产路径=HiDPI 线性采样语义(行带有界 ramp 落地)', bench.mA.ramp > 10, `A=${bench.mA.ramp}`);
  check('⑤ 生产路径与候选 D 同相(文本列 diff=0)', bench.diffD === 0, `diffA-D=${bench.diffD}`);
  check('⑤ 硬边对塌陷(<1000=软过渡生效,修前 4345)', bench.mA.hardPairs < 1000, `hard=${bench.mA.hardPairs}`);
}

// ⑥ 截图:实机信息列(用户观感,dsf=2)+ 三联台架 + 单行 ×3 放大
await page.screenshot({ path: `/tmp/fx58-live-${PHASE}.png`, clip: { x: 1280 - 420, y: 0, width: 420, height: 420 } });
await page.evaluate((phase) => {
  const { cvA, cvB, cvC, cvD, rowsN } = window.__fx58;
  const disp = document.createElement('canvas');
  disp.id = 'fx58-ab';
  disp.width = 620; disp.height = 640;
  const c = disp.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, 620, 640);
  c.fillStyle = '#333'; c.font = '12px monospace'; c.textAlign = 'left'; c.textBaseline = 'top';
  const X = 460 - 280;
  c.fillText('A = production (current)', 8, 4);
  c.drawImage(cvA, X + 10, 40, 275, 220, 8, 20, 275, 220);
  c.fillText('B = bilinear 12->14 (REJECTED: stroke washing)', 8, 248);
  c.drawImage(cvB, X + 10, 40, 275, 220, 8, 264, 275, 220);
  c.fillText('C = pre-FX57 fillText AA (mush reference)   D = 2x supersample /2 box', 8, 492);
  c.drawImage(cvC, X + 10, 40, 275, 220, 8, 508, 275, 220);
  c.drawImage(cvD, X + 10, 40, 275, 220, 318, 508, 275, 220);
  disp.style.cssText = 'position:fixed;left:0;top:420px;z-index:99999;background:#fff;';
  document.body.appendChild(disp);
  // 单行 ×3 最近邻放大(首行):A|D 并排
  const z = document.createElement('canvas');
  z.id = 'fx58-zoom';
  z.width = 540; z.height = 70;
  const zc = z.getContext('2d');
  zc.imageSmoothingEnabled = false;
  zc.fillStyle = '#fff'; zc.fillRect(0, 0, 540, 70);
  zc.fillStyle = '#333'; zc.font = '11px monospace'; zc.textAlign = 'left'; zc.textBaseline = 'top';
  zc.fillText('A x3', 4, 2); zc.fillText('D x3', 274, 2);
  zc.drawImage(cvA, X + 20, 86, 250, 20, 4, 16, 250 * 2, 40);
  zc.drawImage(cvD, X + 20, 86, 250, 20, 274, 16, 250 * 2, 40);
  z.style.cssText = 'position:fixed;left:640px;top:420px;z-index:99999;background:#fff;';
  document.body.appendChild(z);
}, PHASE);
await page.screenshot({ path: `/tmp/fx58-ab-${PHASE}.png`, clip: { x: 0, y: 420, width: 620, height: 640 } });
await page.screenshot({ path: `/tmp/fx58-zoom-${PHASE}.png`, clip: { x: 640, y: 420, width: 540, height: 70 } });
await page.evaluate(() => { document.getElementById('fx58-ab')?.remove(); document.getElementById('fx58-zoom')?.remove(); });

check('无页面错误', errors.filter((e) => !e.includes('[worldGen]')).length === 0, errors.join('|').slice(0, 200));
console.log(`\n[${PHASE}] ${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
