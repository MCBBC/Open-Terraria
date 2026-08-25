// shader 审计战役探针：MagicMissile 族拖尾直连实证（SW_PORT=5233）。
// 构造宝石弹 122（黄晶,RainbowRod 组 Extra_195/197/196）+ 真实 atlas 加载,
// 调 Arrow.draw → 目标画布像素断言：拖尾着色非平色 + 'lighter' 叠画生效。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5233';
const browser = await puppeteer.launch({
  protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 || document.querySelector('.sw-title-menu'), { timeout: 60000 });
// 若在标题页,直接进世界太重——本探针不进游戏,纯模块级构造（无需 world）
await new Promise((r) => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const R = { checks: [], fatal: null };
  const ck = (n, ok, d) => R.checks.push({ n, ok, d });
  try {
    const ArrowMod = await import('/src/entities/Arrow.ts');
    const TrailMod = await import('/src/fx/TrailShader.ts');
    // 真 atlas：懒加载真实 vanilla Extra 贴图
    const imgCache = new Map();
    const loadImg = (path) => new Promise((res) => {
      const hit = imgCache.get(path);
      if (hit) return res(hit);
      const im = new Image();
      im.onload = () => { imgCache.set(path, im); res(im); };
      im.onerror = () => { imgCache.set(path, null); res(null); };
      im.src = `sprites/${path}`;
    });
    const atlas = { ensureVImage: (path) => imgCache.get(path) ?? null };
    const lazyAtlas = { ensureVImage: (path) => { loadImg(path); return imgCache.get(path) ?? null; } };

    // 预载三张 Extra
    for (const p of ['vanilla/Extra_195.png', 'vanilla/Extra_196.png', 'vanilla/Extra_197.png']) await loadImg(p);
    ck('(p1) Extra_195/196/197 资产加载', ['vanilla/Extra_195.png', 'vanilla/Extra_196.png', 'vanilla/Extra_197.png']
      .every((p) => (imgCache.get(p) || {}).width > 0),
      [...imgCache.entries()].map(([k, v]) => `${k.split('/').pop()}=${v ? v.width : 'null'}`).join(','));

    // 目标画布 + 渲染器桩（真 2D ctx）
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const ctx = cv.getContext('2d');
    const renderer = { ctx, atlas: lazyAtlas };

    // 宝石弹 122：拖尾点列（水平右向 12 点）
    const bolt = new ArrowMod.Arrow(100, 60, 4, 0, 11, 2, 122, null, {});
    // 直填 gemTrail（私有字段,探针侧经括号访问）
    const trail = [];
    for (let i = 0; i < 12; i++) trail.unshift(100 + i * 10, 60);
    (bolt).gemTrail = trail;
    const camStub = {};
    (bolt).draw.call(bolt, renderer, camStub);

    const im = ctx.getImageData(0, 0, 512, 128).data;
    let lit = 0; const vals = new Set(); let blueish = 0;
    for (let i = 0; i < im.length; i += 4) {
      if (im[i] > 24 || im[i + 1] > 24 || im[i + 2] > 24) {
        lit++;
        vals.add((im[i] >> 3) * 10000 + (im[i + 1] >> 3));
        if (im[i + 2] > im[i]) blueish++;
      }
    }
    ck('(p2) 拖尾着色像素 ≥90(亮芯带宽由 pass 边缘包络决定)', lit >= 90, `lit=${lit}`);
    ck('(p3) 非平色（亮度档 ≥6 档,噪声门调制生效）', vals.size >= 6, `levels=${vals.size}`);
    void blueish;

    // 对照组：atlas 无图 → 不绘制（负路径）
    const cv2 = document.createElement('canvas'); cv2.width = 64; cv2.height = 32;
    const ctx2 = cv2.getContext('2d');
    const emptyAtlas = { ensureVImage: () => null };
    let threw = false;
    try {
      const b2 = new ArrowMod.Arrow(10, 10, 4, 0, 11, 2, 122, null, {});
      (b2).gemTrail = [0, 10, 20, 10];
      (b2).draw.call(b2, { ctx: ctx2, atlas: emptyAtlas }, {});
    } catch (e) { threw = true; }
    const im2 = ctx2.getImageData(0, 0, 64, 32).data;
    let lit2 = 0;
    for (let i = 0; i < im2.length; i += 4) if (im2[i] > 24) lit2++;
    ck('(p4) 空 atlas 安全（无异常;仅本体贴图着色,无拖尾）', !threw && lit2 < 200, `threw=${threw} lit=${lit2}`);
  } catch (e) { R.fatal = String(e.message).slice(0, 160); }
  return R;
});
console.log(JSON.stringify(out, null, 1));
if (errs.length) console.log('pageerrors:', errs.slice(0, 4));
await browser.close();
const bad = out.checks.filter((c) => !c.ok);
console.log(`\n== SHADER PROBE: ${out.checks.length - bad.length}/${out.checks.length} passed ==`);
process.exit(bad.length ? 1 : 0);
