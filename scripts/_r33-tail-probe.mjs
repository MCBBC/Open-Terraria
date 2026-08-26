// 批III尾窗探针：事件屏效三 pass GL 帧面断言 + RainbowTownSlime 烘焙 + Stardew 叠画。
// 设计=GLScreenFilters.drawChain 直驱合成源画布（确定性,不依赖世界渲染状态）：
//   (p1) MoonLordShake：I=0 近直通；I>0 角部压暗+中心水平 3-tap 拖影
//   (p2) CrystalDestructionColor：中灰源 → uColor=(1,0,0.75) tint(g 降/b 升,粉紫化)
//   (p3) CrystalDestructionVortex：均匀源 → 噪声涡旋空间调制+时间动画
//   (p4) RainbowTownSlime：真 NPC_676 表帧经 SM2 pass 烘焙 → 彩虹调制+时间动画
//   (p5) Stardew 编排器：startStardewAnimation → 中央叠画非零+遮罩动画逐帧变化
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5243';
fs.mkdirSync('/tmp/recon/r33-shots', { recursive: true });

const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));

// 无需进游戏——drawChain/SM2/atlas 均可模块级驱动（atlas 需 Game 侧实例,见 p4 注）
const out = await page.evaluate(async () => {
  const R = { checks: [], dbg: {} };
  const ck = (name, ok, detail) => { R.checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} [${detail}]`); };
  const arrayToPng = (data, w, h) => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
    return cv.toDataURL('image/png');
  };

  const { GLScreenFilters, SCREEN_FX_FRAGS } = await import('/src/render/GLScreenFilters.ts');
  const glf = new GLScreenFilters();

  // 合成源：左半 192 灰、右半 64 灰（竖直硬边）+ 顶部渐变
  const mkSource = () => {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgb(220,220,220)'); g.addColorStop(1, 'rgb(60,60,60)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgb(128,128,128)'; c.fillRect(64, 0, 64, 128);
    return cv;
  };
  const lumAt = (ctx2, x, y) => {
    const d = ctx2.getImageData(x, y, 1, 1).data;
    return 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
  };

  // ---- (p1) MoonLordShake ----
  {
    const run = (intensity) => {
      const src = mkSource();
      const out = document.createElement('canvas');
      out.width = 128; out.height = 128;
      const octx = out.getContext('2d');
      const okDraw = glf.drawChain(src, [{ kind: 'FilterMoonLordShake', intensity, time: 1.234 }], [1, 1, 1]);
      octx.drawImage(glf.canvas, 0, 0);
      return { okDraw, octx };
    };
    const base = run(0);
    const shaken = run(0.9);
    const corner = (c) => lumAt(c, 2, 2), center = (c) => lumAt(c, 64, 100);
    const baseRatio = corner(base.octx) / Math.max(1, center(base.octx));
    const shakeRatio = corner(shaken.octx) / Math.max(1, center(shaken.octx));
    ck('(p1a) I=0 近直通（角部≈源 220）', base.okDraw && Math.abs(corner(base.octx) - 220) < 15, `corner=${corner(base.octx).toFixed(1)}`);
    ck('(p1b) I=0.9 角部径向压暗（gainX=1−1.3·d·I）', shakeRatio < baseRatio - 0.15,
      `shake=${shakeRatio.toFixed(3)} < base=${baseRatio.toFixed(3)}`);
    // 3-tap 拖影：硬边中段在 I>0 时采样到混合灰（dx=0.01×I×sin(phase),源竖直边被抹）
    const edgeBlur = (c) => lumAt(c, 63, 64);
    R.dbg.p1 = { edge: edgeBlur(shaken.octx), baseEdge: edgeBlur(base.octx) };
  }

  // ---- (p2) CrystalDestructionColor ----
  {
    const src = document.createElement('canvas');
    src.width = 64; src.height = 64;
    const c = src.getContext('2d');
    c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, 64, 64);   // V=0.5 → k=2, q=0.25, m=0.5
    const okDraw = glf.drawChain(src, [{ kind: 'FilterCrystalDestructionColor', color: [1, 0, 0.75], intensity: 1, opacity: 1 }], [1, 1, 1]);
    const oc = document.createElement('canvas');
    oc.width = 64; oc.height = 64;
    oc.getContext('2d').drawImage(glf.canvas, 0, 0);
    const d = oc.getContext('2d').getImageData(32, 32, 1, 1).data;
    const r = d[0] / 255, g = d[1] / 255, b = d[2] / 255;
    // 期望（I=1）：col = m·uColor + max(2q−1,0)·(1−uColor) = 0.5·(1,0,0.75)
    //  → out = mix(0.5, (0.5,0,0.375), 1) = (0.5, 0, 0.375)：g 归零（正部补色项=0）
    ck('(p2) Crystal tint 粉紫化（V=0.5 → out=(0.5,0,0.375)）', okDraw
      && Math.abs(r - 0.5) < 0.06 && g < 0.05 && Math.abs(b - 0.375) < 0.06,
      `rgb=(${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)}) okDraw=${okDraw}`);
  }

  // ---- (p3) CrystalDestructionVortex ----
  {
    const src = document.createElement('canvas');
    src.width = 128; src.height = 128;
    const c = src.getContext('2d');
    c.fillStyle = 'rgb(160,160,160)'; c.fillRect(0, 0, 128, 128);
    const run = async (time) => {
      // 噪声图惰性加载：drawChain false = 未就绪跳过 → 轮询重试
      for (let tries = 0; tries < 30; tries++) {
        const ok = glf.drawChain(src, [{ kind: 'FilterCrystalDestructionVortex',
          screenRes: [128, 128], targetPx: [64, 64], intensity: 2, progress: 0, time }], [1, 1, 1]);
        if (ok) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const oc = document.createElement('canvas');
      oc.width = 128; oc.height = 128;
      oc.getContext('2d').drawImage(glf.canvas, 0, 0);
      return oc.getContext('2d').getImageData(0, 0, 128, 128).data;
    };
    const da = await run(1.0), db = await run(51);  // 0.05×51=2.55 → frac 差 0.5=半张噪声表
    R.pngDataURL = arrayToPng(da, 128, 128);
    // 对照组：targetPx 变化（uniform 流动性 sanity——uTargetPx 同批接入）
    const src2 = document.createElement('canvas');
    src2.width = 128; src2.height = 128;
    src2.getContext('2d').fillStyle = 'rgb(160,160,160)';
    src2.getContext('2d').fillRect(0, 0, 128, 128);
    for (let tries = 0; tries < 30; tries++) {
      if (glf.drawChain(src2, [{ kind: 'FilterCrystalDestructionVortex',
        screenRes: [128, 128], targetPx: [10, 10], intensity: 2, progress: 0, time: 1.0 }], [1, 1, 1])) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const oc2 = document.createElement('canvas');
    oc2.width = 128; oc2.height = 128;
    oc2.getContext('2d').drawImage(glf.canvas, 0, 0);
    const dc = oc2.getContext('2d').getImageData(0, 0, 128, 128).data;
    let mn = 999, mx = -1, absDiff = 0, absDiffT = 0;
    for (let i = 0; i < da.length; i += 4) {
      const L = 0.299 * da[i] + 0.587 * da[i + 1] + 0.114 * da[i + 2];
      mn = Math.min(mn, L); mx = Math.max(mx, L);
      absDiff += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      absDiffT += Math.abs(da[i] - dc[i]) + Math.abs(da[i + 1] - dc[i + 1]);
    }
    ck('(p3a) 涡旋噪声调制（均匀源出现空间方差）', mx - mn > 2, `spread=${(mx - mn).toFixed(1)}`);
    R.dbg.p3 = { timeDiff: absDiff / (da.length / 4), targetDiff: absDiffT / (da.length / 4) };
    ck('(p3b) 时间动画（−2.5×uTime 逐像素差分）', absDiff / (da.length / 4) > 1,
      `meanAbsDiff=${(absDiff / (da.length / 4)).toFixed(2)} targetSanity=${(absDiffT / (da.length / 4)).toFixed(2)}`);
  }

  // ---- (p5) Stardew 编排器（先于 p4,复用页面） ----
  try {
    const sa = await import('/src/fx/StardewAnimation.ts');
    const cv = document.createElement('canvas');
    cv.width = 400; cv.height = 300;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgb(0,0,0)'; c.fillRect(0, 0, 400, 300);
    sa.startStardewAnimation();
    // 等资产加载+进入 hold 相（128+60 后全显）
    await new Promise((r) => setTimeout(r, 3200));
    c.fillRect(0, 0, 400, 300);
    const drew = sa.drawStardewAnimation(c, 400, 300);
    const d1 = c.getImageData(150, 130, 100, 40).data;
    let lit1 = 0;
    for (let i = 0; i < d1.length; i += 4) if (d1[i] + d1[i + 1] + d1[i + 2] > 60) lit1++;
    await new Promise((r) => setTimeout(r, 140));
    c.fillStyle = 'rgb(0,0,0)'; c.fillRect(0, 0, 400, 300);
    sa.drawStardewAnimation(c, 400, 300);
    const d2 = c.getImageData(150, 130, 100, 40).data;
    let same = 0, tot = 0;
    for (let i = 0; i < d1.length; i += 4) { tot++; if (d1[i] === d2[i] && d1[i + 1] === d2[i + 1]) same++; }
    ck('(p5a) Stardew 叠画非零（遮罩显隐+资产到位）', drew && lit1 > 20, `drew=${drew} lit=${lit1}`);
    ck('(p5b) 遮罩 8 帧动画（140ms=8.4t → 帧序推进）', same / tot < 0.98, `sameRatio=${(same / tot).toFixed(3)}`);
  } catch (e) { ck('(p5) Stardew 探针', false, String(e.message).slice(0, 80)); }

  return R;
});

// ---- (p4) RainbowTownSlime 真表帧烘焙（进游戏驱动 atlas）----
// 独立 evaluate：进游戏拿 atlas.ensureVImage('vanilla/NPC_676.png') 原表,
// 用 SM2 pass 复刻 Renderer.bakeRainbowSlimeFrame 的数学。
// （世界渲染黑屏与否不影响——纯模块级烘焙）
const out2 = await page.evaluate(async () => {
  const R = { checks: [], dbg: {} };
  const ck = (name, ok, detail) => { R.checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} [${detail}]`); };
  try {
    // 直接 fetch 真表（模块级,不经 atlas——同一文件）
    const resp = await fetch('/sprites/vanilla/NPC_676.png');
    if (!resp.ok) { ck('(p4) NPC_676 表可取', false, `http ${resp.status}`); return R; }
    const blob = await resp.blob();
    const bmp = await createImageBitmap(blob);
    const { defaultUniforms, getPass, runPassOnImageData } = await import('/src/fx/SM2Effect.ts');
    const pass = getPass('RainbowTownSlime');
    const bake = (time) => {
      const cv = document.createElement('canvas');
      cv.width = bmp.width; cv.height = Math.floor(bmp.height / 16);   // 首帧（帧数口径仅取切片）
      const c = cv.getContext('2d', { willReadFrequently: true });
      c.drawImage(bmp, 0, 0, bmp.width, cv.height, 0, 0, cv.width, cv.height);
      const id = c.getImageData(0, 0, cv.width, cv.height);
      const u = defaultUniforms();
      u.uTime = time;
      u.uSourceRect = [0, 0, cv.width, cv.height];
      u.uImageSize0 = [bmp.width, bmp.height];
      runPassOnImageData(pass, id.data, cv.width, cv.height, u, [],
        { sx: 0, sy: 0, sheetW: bmp.width, sheetH: bmp.height });
      const d = id.data;
      let mn = 999, mx = -1;
      for (let i = 0; i < d.length; i += 4) {
        const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        mn = Math.min(mn, L); mx = Math.max(mx, L);
      }
      return { mn, mx };
    };
    const t0 = bake(0), t1 = bake(777);   // 0.16×777 非整数防相位混叠
    ck('(p4) 真表帧彩虹烘焙（非透传+时间动画）',
      t0.mx - t0.mn > 2 && (t0.mx !== t1.mx || t0.mn !== t1.mn),
      `spread0=${(t0.mx - t0.mn).toFixed(0)} spread1=${(t1.mx - t1.mn).toFixed(0)}`);
  } catch (e) { ck('(p4)', false, String(e.message).slice(0, 80)); }
  return R;
});

if (out.pngDataURL) fs.writeFileSync('/tmp/recon/r33-shots/vortex-out.png', Buffer.from(out.pngDataURL.split(',')[1], 'base64'));
let pass = 0, fail = 0;
const report = (R) => { for (const c of R.checks ?? []) { console.log(`${c.ok ? 'PASS' : 'FAIL'}: ${c.name} [${c.detail}]`); c.ok ? pass++ : fail++; } };
report(out); report(out2);
console.log('dbg:', JSON.stringify({ p1: out.dbg?.p1 ?? null }));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exitCode = fail === 0 ? 0 : 1;
await browser.close();
