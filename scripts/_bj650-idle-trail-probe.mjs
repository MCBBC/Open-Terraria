// ★BJ650 残影列二复报定谳探针（2026-10-13 截图 114：刃杖上方小刃簇,色相已对）：
//   机械面对拍已齐（原版 :30883-30892 num166=12/num164=0/num165=-1/num167=1.4 +
//   :31135 循环 i=12..1 + :31331-31336 fade=(start−i)/(TCL×1.5)=（12−i)/90 +
//   :387 TCL[864]=60 + num169 缺省 0=同角无展开 + P() 同参）——本探针量化静止态：
//   ① ring 槽位 1..12 位置散布（散布≈0=静止叠栈;散布大=运动残影列）;
//   ② 刃上方带（bob/残影列嫌疑区）像素亮度偏移量化;
//   ③ 静止/动后两张 3× 放大取证。
// 用法(game/ 下): SW_ORIGIN=http://localhost:5206 node tools/run-diag.mjs scripts/_bj650-idle-trail-probe.mjs
import { mkdirSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, createGame, ledger, savePageShot, resolveShotPath,
} from '../tools/probe/lib/index.mjs';

const L = ledger();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: 'bj650idle', size: 'small' });
L.chk('世界已建', gen.ok);
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
  window.__swGame.enemySpawnEnabled = false;
});

// 纯闲置：无靶（不投放僵尸）——单刃静态锚（player.Top+(0,-30),单刃轨道半径=0）
await page.evaluate(async () => {
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
  const m = new MinionProj(g.player.cx + 60, g.player.cy - 30, 864, 6, 0, false, 0, false, () => g.player);
  g.entities.add(m, 'projectiles');
  const bt = buffTypeByVanilla(271);
  if (bt !== undefined) g.player.buffs.set(bt, 300);
});
await wait(2500);   // 静置收敛（rot lerp + 环填满）

const idle = await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  if (!m) return { err: 'no 864' };
  const ring = m.ghostRing;
  const slots = [];
  for (let i = 1; i <= 12; i++) {
    const s = ring.at(i);
    slots.push(s ? { x: +(s.x - m.x).toFixed(2), y: +(s.y - m.y).toFixed(2) } : null);
  }
  const spread = Math.max(...slots.filter(Boolean).map((s) => Math.hypot(s.x, s.y)));
  return { whoAmI: m.whoAmI, st: m.a169St, vx: +m.vx.toFixed(3), vy: +m.vy.toFixed(3),
    rot: +m.rot.toFixed(3), filled: ring.filled, spread, slots };
});
L.say(`静止态: ${JSON.stringify(idle)}`);
L.chk('闲置态静止（ring 12 槽散布 < 2px=叠栈非残影列）', idle.spread !== undefined && idle.spread < 2,
  `spread=${idle.spread}px`);

// 刃上方带亮度偏移（残影列嫌疑区=刃盒上方 0..40px、全宽±40px）
const lum = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  const ctx = cv.getContext('2d');
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  const cam = g.camera;
  const z = cam.zoom ?? 1;
  const sx = (m.cx - cam.x) * z + cv.width / 2, sy = (m.cy - cam.y) * z + cv.height / 2;
  const img = ctx.getImageData(Math.trunc(sx - 40), Math.trunc(sy - 40 - 40), 80, 40);
  const d = img.data;
  let sum = 0, n = 0, mx = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += l; n++;
    if (l > mx) mx = l;
  }
  // 基准=同宽下方远域（刃下方 60-100px）
  const img2 = ctx.getImageData(Math.trunc(sx - 40), Math.trunc(sy + 60), 80, 40);
  const d2 = img2.data;
  let sum2 = 0;
  for (let i = 0; i < d2.length; i += 4) sum2 += (d2[i] + d2[i + 1] + d2[i + 2]) / 3;
  return { aboveAvg: +(sum / n).toFixed(1), aboveMax: +mx.toFixed(0), belowAvg: +(sum2 / (d2.length / 4)).toFixed(1) };
});
L.say(`刃上方带亮度: ${JSON.stringify(lum)}`);

const shotA = await savePageShot(page, resolveShotPath('bj650-idle-full.png'));
const zoomA = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  const cam = g.camera;
  const z = cam.zoom ?? 1;
  const sx = (m.cx - cam.x) * z + cv.width / 2, sy = (m.cy - cam.y) * z + cv.height / 2;
  const W = 140, H = 200;
  const out = document.createElement('canvas');
  out.width = W * 3; out.height = H * 3;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(cv, sx - W / 2, sy - H / 2 - 30, W, H, 0, 0, W * 3, H * 3);
  return out.toDataURL('image/png');
});
{
  const { writeFile } = await import('node:fs/promises');
  const p3 = resolveShotPath('bj650-idle-zoom3x.png');
  await writeFile(p3, Buffer.from(zoomA.split(',')[1], 'base64'));
  L.say(`截图: ${p3}`);
}
L.say(`全幅: ${shotA}`);

// 对照组：驱冲刺后同参测量（运动残影列形态）
await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  m.vx = -7; m.vy = 2;
});
await wait(600);
const after = await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  const ring = m.ghostRing;
  const slots = [];
  for (let i = 1; i <= 12; i++) {
    const s = ring.at(i);
    slots.push(s ? { x: +(s.x - m.x).toFixed(2), y: +(s.y - m.y).toFixed(2) } : null);
  }
  const spread = Math.max(...slots.filter(Boolean).map((s) => Math.hypot(s.x, s.y)));
  return { spread, st: m.a169St };
});
L.say(`动后: spread=${after.spread}px st=${after.st}`);
L.chk('动后残影列（对照）', after.spread > 8, `spread=${after.spread}px`);
const zoomB = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  const cam = g.camera;
  const z = cam.zoom ?? 1;
  const sx = (m.cx - cam.x) * z + cv.width / 2, sy = (m.cy - cam.y) * z + cv.height / 2;
  const W = 140, H = 200;
  const out = document.createElement('canvas');
  out.width = W * 3; out.height = H * 3;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(cv, sx - W / 2, sy - H / 2 - 30, W, H, 0, 0, W * 3, H * 3);
  return out.toDataURL('image/png');
});
{
  const { writeFile } = await import('node:fs/promises');
  const p3 = resolveShotPath('bj650-aftermove-zoom3x.png');
  await writeFile(p3, Buffer.from(zoomB.split(',')[1], 'base64'));
  L.say(`截图: ${p3}`);
}

L.say(`耗时 ${L.elapsed()}`);
L.print();
process.exit(L.ok ? 0 : 2);
