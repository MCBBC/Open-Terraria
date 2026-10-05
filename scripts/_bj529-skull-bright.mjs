// ★BJ529 骷髅王骷髅头弹(270) 暗度定谳探针
// 场景:夜 22:00 冻结钟 + 地表出生点,注入 Arrow(270) 悬浮在相机中心,
//  沿 40t 脉冲周期采样 28 拍 → 主画布(最终呈现面)读回弹心窗口亮度。
// 判据:
//  ①对照面=贴图原亮度(帧0 26×30 最大亮度/骨架像素平均)——
//    原版 GetAlpha 全白(Projectile.cs:80722)=光照无关,脉冲峰读回应≈贴图亮度;
//  ②本仓实体层在 compositeLight 全屏乘光之下 → 夜面读回应显著偏暗(缺陷证据);
//  ③同屏对照窗(弹左 400px 夜空)读回≈0,证明亮度差来自弹体。
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

// 挂载 Arrow 构造器 + 找地下暗空腔 + 注入 270(零速悬浮)
const inj = await page.evaluate(async () => {
  const g = window.__swGame;
  if (!g.ctorRef) g.ctorRef = {};
  if (!g.ctorRef.Arrow) {
    const m = await import('/src/entities/Arrow.ts');
    g.ctorRef.Arrow = m.Arrow;
  }
  // 向下找一格:空气 tile + 格光≈0(地下暗腔,避开月光/火把)
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
  // 玩家+相机瞬移到暗腔(相机 follow 缓动旁路=直写)
  g.player.x = wx - g.player.w / 2; g.player.y = wy - g.player.h / 2;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = wx; g.camera.y = wy;
  const p = new Arrow(wx, wy, 0, 0, 17, 0, 270, { pierce: 3, skullBone: true, life: 300, grav: 0 });
  p.noTileCollide = true;   // 悬浮不撞块(探针确定性)
  g.entities.projectiles.push(p);
  g.__bj529p = p;
  return { tile: [sx, sy], wx, wy, pid: p.projId, life: p.life, w: p.w, h: p.h };
});
if (!inj || inj.fail || inj.pid !== 270) { console.log(JSON.stringify({ ok: false, why: 'inject-failed', inj })); process.exit(1); }
if (!inj || inj.pid !== 270) { console.log(JSON.stringify({ ok: false, why: 'inject-failed', inj })); process.exit(1); }

// 读回:主画布弹心 41×41 窗内最大亮度/平均亮度 + 左 400px 对照窗
const sample = () => page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera;
  const p = g.__bj529p;
  const cv = g.renderer.canvas;
  const s = document.createElement('canvas');
  s.width = cv.width; s.height = cv.height;
  const sc = s.getContext('2d');
  sc.drawImage(cv, 0, 0);
  const d = sc.getImageData(0, 0, cv.width, cv.height).data;
  const [sx, sy] = cam.worldToScreen(p.x + p.w / 2, p.y + p.h / 2);
  const [bx, by] = cam.worldToScreen(p.x + p.w / 2 - 400, p.y + p.h / 2);
  const grab = (cx0, cy0, half) => {
    let mx = 0, sum = 0, n = 0;
    for (let dy = -half; dy <= half; dy += 2) for (let dx = -half; dx <= half; dx += 2) {
      const px = Math.min(cv.width - 1, Math.max(0, Math.round(cx0 + dx)));
      const py = Math.min(cv.height - 1, Math.max(0, Math.round(cy0 + dy)));
      const i = (py * cv.width + px) * 4;
      const lum = Math.max(d[i], d[i + 1], d[i + 2]);
      if (lum > mx) mx = lum;
      sum += lum; n++;
    }
    return { mx, avg: +(sum / n).toFixed(1) };
  };
  return { proj: grab(sx, sy, 20), bg: grab(bx, by, 20), life: p.life, age: p.age };
});

// 光照值读回(弹所在 tile 的 lightAt)
const lightAt = () => page.evaluate(() => {
  const g = window.__swGame;
  const p = g.__bj529p;
  const eng = g.world?.lighting ?? g.renderer?.lighting ?? g.lighting;
  if (!eng?.lightAt) return null;
  return eng.lightAt(Math.floor((p.x + p.w / 2) / 16), Math.floor((p.y + p.h / 2) / 16));
});

// 采样 28 拍 ≈ 0.7 个脉冲周期(40t)——峰谷都应被覆盖
const rows = [];
for (let i = 0; i < 28; i++) {
  const r = await sample();
  r.light = await lightAt();
  rows.push(r);
  await new Promise((res) => setTimeout(res, 50));
}
// 贴图参照亮度(离屏,无光照)——帧 0(26×30)
const spriteRef = await page.evaluate(async () => {
  const img = await (await fetch('/sprites/vanilla/Projectile_270.png')).blob();
  const bm = await createImageBitmap(img);
  const c = document.createElement('canvas');
  c.width = 26; c.height = 30;
  const cc = c.getContext('2d');
  cc.drawImage(bm, 0, 0, 26, 30, 0, 0, 26, 30);
  const d = cc.getImageData(0, 0, 26, 30).data;
  let mx = 0, sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const lum = Math.max(d[i], d[i + 1], d[i + 2]);
    if (lum > mx) mx = lum;
    sum += lum; n++;
  }
  return { mx, avg: +(sum / n).toFixed(1), w: bm.width, h: bm.height };
});
const projPeak = Math.max(...rows.map((r) => r.proj.mx));
const projAvgMax = Math.max(...rows.map((r) => r.proj.avg));
const bgMx = Math.max(...rows.map((r) => r.bg.mx));
const out = {
  ok: true,
  rows: rows.length,
  inj,
  lightSamples: rows.map((r) => r.light).filter(Boolean).slice(0, 3),
  projPeak, projAvgMax, bgMx,
  spriteRef: { mx: spriteRef.mx, avg: spriteRef.avg, tex: spriteRef.w + 'x' + spriteRef.h },
  ratio: +(projPeak / spriteRef.mx).toFixed(3),
  errs,
};
console.log(JSON.stringify(out));
await browser.close();
process.exit(0);
