// BJ346 shader lab：FilterTower GL 真链 vs JS 字节码参考 逐列对拍。
// 合成输入 = 256 级灰阶横条（覆盖 lo 支/hi 支全域），塔放远处（amp≈0 消扭曲项）
// → 输出应逐列等于 towerFilterColorPush(s, [1,0,0.9], 0.35)。同时计算旧实现
// （恒 hi+2−3uColor）参考做判别对照。
// 用法：SW_ORIGIN=... node tools/run-diag.mjs scripts/_bj346-shader-lab.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5202';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', defaultViewport: { width: 800, height: 600 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERR:', e.message));
await page.goto(ORIGIN + '/?play=small&bj346lab' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) { console.error('未进游戏'); process.exit(1); }
if (process.argv.includes('--i0')) await page.evaluate(() => { window.__labI0 = 1; });

const report = await page.evaluate(() => {
  const g = window.__swGame;
  const fx = g.renderer.screenFx;
  const LAB_I0 = window.__labI0 === 1;
  if (!fx) return { err: 'no screenFx' };
  fx.ensureStandalone();
  // 合成输入：256×64，第 x 列 = 灰度 x/255（含 0 与 255 端点）
  const W = 256, H = 64;
  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const sctx = src.getContext('2d');
  const img = sctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, v = x;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);
  // 塔放屏外极远处：amp = min(50/(180−len),5) → len≫180 → ≈0（纯色推核）
  const pass = {
    kind: 'FilterTower', color: [1, 0, 0.9], opacity: 0.35,
    screenRes: [W, H], screenPos: [0, 0],
    targetPx: [60000, 60000], intensity: LAB_I0 ? 0 : 1, progress: 0, time: 0,   // len≈9e4 → amp≈5.6e-4（f32 粒度可忽略）
  };
  const drew = fx.drawChain(src, [pass], [1, 1, 1]);
  if (!drew) return { err: 'drawChain failed' };
  // 回读（GL 画布 → 2D 画布 → getImageData；GL 上下文 preserveDrawingBuffer=true）
  const rd = document.createElement('canvas');
  rd.width = W; rd.height = H;
  const rctx = rd.getContext('2d', { willReadFrequently: true });
  rctx.drawImage(fx.canvas, 0, 0, W, H);
  const out = rctx.getImageData(0, 0, W, H).data;
  // JS 参考：字节码语义 + 旧实现语义
  const fract = (x) => x - Math.floor(x);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ref = [];
  const oldRef = [];
  for (let x = 0; x < W; x++) {
    const s = x / 255, V = s, mn = s, sum = V + mn, k = sum - 1;
    const c = [1, 0, 0.9], op = 0.35;
    const hi = [c[0] + k * (1 - c[0]), c[1] + k * (1 - c[1]), c[2] + k * (1 - c[2])];
    const lo = [sum * c[0], sum * c[1], sum * c[2]];
    const tgt = k * 0.5 >= 0 ? hi : lo;
    ref.push([s + op * (tgt[0] - s), s + op * (tgt[1] - s), s + op * (tgt[2] - s)]);
    const t2 = [c[0] + k * ((1 - c[0]) * 2 - c[0]), c[1] + k * ((1 - c[1]) * 2 - c[1]), c[2] + k * ((1 - c[2]) * 2 - c[2])];
    oldRef.push([clamp01(s + op * (t2[0] - s)), clamp01(s + op * (t2[1] - s)), clamp01(s + op * (t2[2] - s))]);
  }
  // 逐列对拍（取 y=32 行）
  let maxDev = 0, maxDevOld = 0, worstX = -1, worstOldX = -1;
  const rows = [];
  for (let x = 0; x < W; x += 16) {
    const i = (32 * W + x) * 4;
    const R = out[i] / 255, G = out[i + 1] / 255, B = out[i + 2] / 255;
    const d = Math.max(Math.abs(R - ref[x][0]), Math.abs(G - ref[x][1]), Math.abs(B - ref[x][2]));
    const dOld = Math.max(Math.abs(R - oldRef[x][0]), Math.abs(G - oldRef[x][1]), Math.abs(B - oldRef[x][2]));
    if (d > maxDev) { maxDev = d; worstX = x; }
    if (dOld > maxDevOld) { maxDevOld = dOld; worstOldX = x; }
    rows.push({ x, got: [+R.toFixed(3), +G.toFixed(3), +B.toFixed(3)], ref: ref[x].map((v) => +v.toFixed(3)) });
  }
  return { drew, maxDev: +maxDev.toFixed(4), worstX, maxDevOld: +maxDevOld.toFixed(4), worstOldX, rows };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
console.log('DONE lab');
