// ★BJ529 骷髅头弹(270) 光照乘法 A/B 定谳探针 v2
// 场景:夜 22:00 冻结钟,玩家+相机瞬移地下暗腔;弹注入在玩家右侧 250px(超出玩家光晕,
//  仍在视窗内)。弹零速悬浮(noTileCollide),40t 脉冲周期内每模式采 ~1.5s。
// A=正常(fullbright=false,compositeLight 乘光生效) / B=开灯(fullbright=true,无乘光)。
// 判据:
//  · B 峰值包络 ≈ 贴图像素(弹以本色画出)——盒内容=弹本体证明;
//  · A 峰值包络 ≈ B × k——k=乘光系数;k≪1 → 弹被乘光压暗=缺陷证据
//    (原版 GetAlpha :80722 恒白=光照无关,脉冲峰应=本色,即 vanilla 语义=B 恒成立)。
import { launchBrowser, openPage, bootstrap, createGame, freezeClock } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
const fr = await freezeClock(page, { tod: 22 / 24 });
if (!fr.ok) { console.log(JSON.stringify({ ok: false, why: 'freeze-clock' })); process.exit(1); }

const inj = await page.evaluate(async () => {
  const g = window.__swGame;
  if (!g.ctorRef) g.ctorRef = {};
  if (!g.ctorRef.Arrow) {
    const m = await import('/src/entities/Arrow.ts');
    g.ctorRef.Arrow = m.Arrow;
  }
  const st = g.world.store;
  const surf = g.world.groundLevel ?? 400;
  let sx = -1, sy = -1;
  outer: for (let ty = surf + 120; ty < Math.min(st.h - 60, surf + 700); ty += 4) {
    for (let tx = 60; tx < st.w - 60; tx += 7) {
      if (!st.inBounds(tx, ty) || !st.inBounds(tx - 1, ty - 1) || !st.inBounds(tx + 1, ty + 1)) continue;
      if (st.isSolid(tx, ty) || st.isSolid(tx, ty - 1) || st.isSolid(tx, ty + 1)
        || st.isSolid(tx - 1, ty) || st.isSolid(tx + 1, ty)) continue;
      if (st.liquid[st.idx(tx, ty)] !== 0) continue;
      sx = tx; sy = ty; break outer;
    }
  }
  if (sx < 0) return { fail: 'no-cave' };
  const Arrow = g.ctorRef.Arrow;
  const wx = sx * 16 + 8, wy = sy * 16 + 8;
  g.player.x = wx - g.player.w / 2; g.player.y = wy - g.player.h / 2;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = wx; g.camera.y = wy;
  const p = new Arrow(wx + 250, wy, 0, 0, 17, 0, 270, { pierce: 3, skullBone: true, life: 300, grav: 0 });
  p.noTileCollide = true;
  g.entities.projectiles.push(p);
  g.__bj529p = p;
  return { tile: [sx, sy], pid: p.projId };
});
if (!inj || inj.fail || inj.pid !== 270) { console.log(JSON.stringify({ ok: false, why: 'inject-failed', inj })); process.exit(1); }

// 盒读回:弹盒(26×26×zoom)屏区逐像素 max-包络累积。返回每像素最大亮度数组(扁平 26×26 采样步 2)。
const envelope = () => page.evaluate(() => {
  const g = window.__swGame;
  const p = g.__bj529p;
  const cam = g.camera;
  const cv = g.renderer.canvas;
  const s = document.createElement('canvas');
  s.width = cv.width; s.height = cv.height;
  const sc = s.getContext('2d');
  sc.drawImage(cv, 0, 0);
  const d = sc.getImageData(0, 0, cv.width, cv.height).data;
  const z = cam.zoom;
  const half = Math.ceil(13 * z);
  const [sx0, sy0] = cam.worldToScreen(p.x + p.w / 2, p.y + p.h / 2);
  const N = 13;
  const out = new Array(N * N).fill(0);
  for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
    const px = Math.round(sx0 + (ix - N / 2) * 2 * z * 2);
    const py = Math.round(sy0 + (iy - N / 2) * 2 * z * 2);
    if (px < 0 || py < 0 || px >= cv.width || py >= cv.height) continue;
    const i = (py * cv.width + px) * 4;
    out[iy * N + ix] = Math.max(d[i], d[i + 1], d[i + 2]);
  }
  return out;
});

const sampleMode = async (frames) => {
  const acc = new Array(13 * 13).fill(0);
  for (let f = 0; f < frames; f++) {
    const env = await envelope();
    for (let i = 0; i < acc.length; i++) if (env[i] > acc[i]) acc[i] = env[i];
    await new Promise((r) => setTimeout(r, 33));
  }
  return acc;
};

// 模式 A:正常(乘光) → 模式 B:开灯(无乘光)
await page.evaluate(() => { window.__swGame.renderer.fullbright = false; });
const envA = await sampleMode(46);
await page.evaluate(() => { window.__swGame.renderer.fullbright = true; });
await new Promise((r) => setTimeout(r, 120));
const envB = await sampleMode(46);
await page.evaluate(() => { window.__swGame.renderer.fullbright = false; });

// 贴图参照(帧 0,26×30 → 中心 26×26 每隔 2px 采样,同一 N 网格)
const spriteRef = await page.evaluate(async () => {
  const img = await (await fetch('/sprites/vanilla/Projectile_270.png')).blob();
  const bm = await createImageBitmap(img);
  const c = document.createElement('canvas');
  c.width = 26; c.height = 30;
  const cc = c.getContext('2d');
  cc.drawImage(bm, 0, 0, 26, 30, 0, 0, 26, 30);
  const d = cc.getImageData(0, 0, 26, 30).data;
  const N = 13;
  const out = new Array(N * N).fill(0);
  for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
    const px = 13 + (ix - N / 2) * 2, py = 15 + (iy - N / 2) * 2;
    if (px < 0 || py < 0 || px >= 26 || py >= 30) continue;
    const i = (py * 26 + px) * 4;
    if (d[i + 3] < 8) continue;
    out[iy * N + ix] = Math.max(d[i], d[i + 1], d[i + 2]);
  }
  return out;
});
// 统计:仅取贴图非零像素位(=弹本体位)
let sumA = 0, sumB = 0, sumS = 0, n = 0, mxA = 0, mxB = 0;
for (let i = 0; i < spriteRef.length; i++) {
  if (spriteRef[i] <= 0) continue;
  sumA += envA[i]; sumB += envB[i]; sumS += spriteRef[i]; n++;
  if (envA[i] > mxA) mxA = envA[i];
  if (envB[i] > mxB) mxB = envB[i];
}
const k = sumB > 0 ? sumA / sumB : -1;
const out = {
  ok: true,
  inj,
  spriteAvgAtBodyPx: +(sumS / n).toFixed(1),
  envA_avgAtBodyPx: +(sumA / n).toFixed(1),
  envB_avgAtBodyPx: +(sumB / n).toFixed(1),
  envA_mx: mxA, envB_mx: mxB,
  k_multiplyFactor: +k.toFixed(3),
  errs,
};
console.log(JSON.stringify(out));
await browser.close();
process.exit(0);
