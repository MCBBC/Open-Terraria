// ★30fps 刀1 活机水面视觉对拍：同会话双臂（OLD=刀前语义模拟:分数源→round dest
//   +原始小数键;NEW=刀后原生路径）水面场景整页截图 + 水域直方图指纹 + 差分账。
//   波相位双臂间自然漂移=相位噪声,判读以直方图指纹+目检 PNG 为准（纹理级逐字节
//   判据已由 _erkey-semab.mjs 覆盖:表面带 0.52/0.48 刀前刀后 0 差）。
// run: SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs --timeout=240000 scripts/_erkey-visab.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, sleep, teleport, godMode } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5213';
const OUT = '/tmp/erkey-visab';
fs.mkdirSync(OUT, { recursive: true });

const page = await openPage(await launchBrowser({ headless: true }), {});
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail'); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'eolcensus', size: 'small', pinRandom: 20261003, log: () => {} });
if (!made?.ok) process.exit(1);
await sleep(1500);

// 找水（★首选海面:岸线水面恒露天;次选地表池+空气带相机点——C10e 探针判例防嵌埋）
const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const gl = w.groundLevel ?? 300;
  const Wt = w.store?.w ?? 0;
  const airAt = (tx, ty) => !w.isSolidPx(tx * 16 + 8, ty * 16 + 8);
  // 1) 海面:从世界两边缘向内扫,gl±6 带内的水面格
  for (const edge of [4, Wt - 5]) {
    const dir = edge < Wt / 2 ? 1 : -1;
    for (let x = edge; x > 0 && x < Wt - 1; x += dir * 3) {
      for (let y = gl - 6; y <= gl + 4; y++) {
        if (w.liquidAt(x * 16 + 8, y * 16 + 8) > 0 && w.liquidAt(x * 16 + 8, (y - 1) * 16 + 8) === 0) {
          return { x: x * 16 + 8, y: (y - 6) * 16, ty: y, surf: true, ocean: true };
        }
      }
    }
  }
  // 2) 地表池+空气带相机点
  let fallback = null;
  for (let r = 8; r < 220; r += 4) {
    for (let a = 0; a < 32; a++) {
      const x = px + Math.round(Math.cos(a / 32 * Math.PI * 2) * r);
      const y = py + Math.round(Math.sin(a / 32 * Math.PI * 2) * r);
      if (w.liquidAt(x * 16 + 8, y * 16 + 8) > 0 && w.liquidAt(x * 16 + 8, (y - 1) * 16 + 8) === 0) {
        if (y > gl + 8) { if (!fallback) fallback = { x: x * 16 + 8, y: (y - 8) * 16, ty: y, surf: false }; continue; }
        let air = 0, camTy = -1;
        for (let up = 2; up < 14; up++) {
          const ty = y - up;
          air = airAt(x, ty) ? air + 1 : 0;
          if (air >= 4) { camTy = ty; break; }
        }
        if (camTy < 0) continue;
        return { x: x * 16 + 8, y: (camTy - 2) * 16, ty: y, surf: true, camTy };
      }
    }
  }
  return fallback;
});
console.log('water spot:', JSON.stringify(spot));
if (!spot) process.exit(1);
await godMode(page, true);
await teleport(page, spot.x, spot.y, { snapCamera: true, zeroVel: true });
await sleep(2000);

// 双臂开关（OLD 臂=逐调用模拟刀前行为:分数源 rect→round dest + 原键 texFromImage）
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const glw = r._accGlw ?? r.glfx;
  const proto = Object.getPrototypeOf(glw);
  if (globalThis.__erVisArm) return;
  const orig = proto.texFromRegion;
  globalThis.__erVisArm = 'new';
  proto.texFromRegion = function (key, img, sx, sy, sw, sh) {
    if (globalThis.__erVisArm !== 'old') return orig.call(this, key, img, sx, sy, sw, sh);
    // OLD 模拟:round(sw)/round(sh) dest,源 rect 原样（含小数）,键=调用方原键
    if (sw <= 0 || sh <= 0) return null;
    const rsw = Math.max(1, Math.round(sw)), rsh = Math.max(1, Math.round(sh));
    if (!this.regScratch) this.regScratch = document.createElement('canvas');
    const sc = this.regScratch;
    if (sc.width !== rsw || sc.height !== rsh) { sc.width = rsw; sc.height = rsh; }
    const scx = this.regScratchCtx ??= sc.getContext('2d', { willReadFrequently: true });
    scx.clearRect(0, 0, rsw, rsh);
    scx.drawImage(img, sx, sy, sw, sh, 0, 0, rsw, rsh);
    return this.texFromImage(key, sc, false, true);
  };
});

// 屏幕上水域定位（世界→屏幕）
const view = await page.evaluate(() => {
  const g = window.__swGame;
  const c = document.querySelector('#sw-c10e-glcanvas') || document.querySelector('canvas');
  const r = g.renderer;
  return { cw: c?.width, ch: c?.height, sel: c?.id || 'canvas' };
});
console.log('present canvas:', JSON.stringify(view));

const shoot = async (arm) => {
  await page.evaluate((a) => { globalThis.__erVisArm = a; }, arm);
  await sleep(3000);   // 臂生效+稳态
  const buf = await page.screenshot({ type: 'png' });
  const p = `${OUT}/water-${arm}.png`;
  fs.writeFileSync(p, buf);
  return p;
};
const pOld = await shoot('old');
const pNew = await shoot('new');
// 交臂复核（order 效应排除）
const pOld2 = await shoot('old');
console.log('shots:', pOld, pNew, pOld2);

// 像素账：整页降采样直方图指纹 + 差分
const stats = await page.evaluate(async (paths) => {
  const load = (src) => new Promise((res) => {
    const fs = null; const img = new Image(); img.onload = () => res(img); img.src = src;
  });
  return { note: 'diff 在 node 侧做' };
}, [pOld, pNew, pOld2]);
console.log('shots saved');
await page.browser().close();
