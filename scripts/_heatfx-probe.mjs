// FilterHeatDistortion 落地探针：地狱带激活门 + 强度 + GL 链生效性（A/B 像素差）。
// 走真实渲染管线：传送玩家到地狱 → 跑帧 → 断言 monoFilters 状态机 →
// 采样主画布 A(heat on)/B(heat 强制关) 差异分布。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// 噪声资产可载
const noiseOk = await page.evaluate(async () => {
  const r = await fetch('sprites/vanilla/Misc_noise.png');
  return r.ok;
});
check('噪声贴图 sprites/vanilla/Misc_noise.png 可载', noiseOk);

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 传送玩家到地狱深处（TileCenter.Y > maxTilesY-320）
  const uy = st.h - 60;
  g.player.x = Math.floor(g.player.cx / 16) * 16;
  g.player.y = uy * 16;
  g.player.vx = 0; g.player.vy = 0;
  // 跑 120 tick 刷 SceneMetrics + 等 ~1.5s 真实渲染帧（FilterManager.Update 按帧斜坡）
  for (let i = 0; i < 120; i++) g.fixedUpdate(1 / 60);
  await new Promise((r) => setTimeout(r, 1500));
  g.render?.();
  const mono = g.renderer.monoFilters;
  const scene = g.renderer.scene;
  const out = {
    tileY: scene?.tileY, maxTY: st.h,
    heatActive: mono.heatActive,
    heatOpacity: mono.heatOpacity,
    heatIntensity: mono.heatIntensity,
    heatVisible: mono.heatVisible,
    heatInUse: mono.heatInUse,
  };
  // A 帧：heat 常态（GL 链）。等噪声图就绪。
  await new Promise((r) => setTimeout(r, 400));
  g.render?.();
  const canvas = g.renderer.canvas;
  const w = canvas.width, h = canvas.height;
  const grab = () => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(canvas, 0, 0);
    return c.getContext('2d').getImageData(0, 0, w, h).data;
  };
  const a = grab();
  // B 帧：强制关 heat（opacity/intensity 清零）后重渲
  const saveOp = mono.heatOpacity, saveIn = mono.heatIntensity;
  mono.heatOpacity = 0; mono.heatIntensity = 0;
  g.render?.();
  const b = grab();
  mono.heatOpacity = saveOp; mono.heatIntensity = saveIn;
  let diffPx = 0, maxDelta = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (d > 6) diffPx++;
    if (d > maxDelta) maxDelta = d;
  }
  out.aDiffPx = diffPx;
  out.aTotal = a.length / 4;
  out.maxDelta = maxDelta;
  return out;
});

check('地狱带激活（tileY > maxTY-320）', res.heatActive === true,
  `tileY=${res.tileY} maxTY=${res.maxTY}`);
check('强度 = min(1,(tileY-(maxTY-320))/120)·2 = 2（深处封顶）', Math.abs(res.heatIntensity - 2) < 1e-6,
  `intensity=${res.heatIntensity}`);
check('斜坡到 1（120 tick ≈ 2s）', res.heatOpacity >= 0.99, `opacity=${res.heatOpacity}`);
check('heatVisible/heatInUse', res.heatVisible === true && res.heatInUse === true);
check('GL 链生效：A/B 帧像素差 > 1%（扭曲真实改变了画面）',
  res.aDiffPx > res.aTotal * 0.01,
  `diff=${res.aDiffPx}/${res.aTotal} (${(res.aDiffPx / res.aTotal * 100).toFixed(2)}%) maxDelta=${res.maxDelta}`);

await browser.close();
console.log(`---- ${pass} pass / ${fail} fail`);
console.log(errors.length ? `page errors: ${errors.slice(0, 5).join(' | ')}` : 'no page errors');
process.exit(fail ? 1 : 0);
