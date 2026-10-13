// ★BJ650 残影列自然态定谳探针 v2（2026-10-13 二轮反驳：用户实况=刃跟随玩家后停下,
//   静态截图有列;合成静止探针 spread=0 与实况矛盾——教训:必须先自然态复现再定谳）。
//   自然流复现：拖拽刃 40 拍（=玩家走位刃滞后）→ 释放 → 原版收敛机械（锚-位差直赋
//   钳 10-40 :46594-46597,到即停 velocity 恰 0=冻结）→ 逐拍采样 600 拍分段：
//   收敛期（spread 衰减）/ 静止期（spread>?=微动源实锤→逐拍 diff 定位）。
//   对照组：僵尸靶在射程（800）内=持续 lock/dart/return 循环（原版 :46601-46602
//   每 idle 拍即锁,无冷却）→ 列存在率量化。
// 用法(game/ 下): SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj650-natural-trail-probe.mjs
import { mkdirSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, createGame, ledger, savePageShot, resolveShotPath,
} from '../tools/probe/lib/index.mjs';

const L = ledger();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('/tmp/probe-out/bj650nat', { recursive: true });

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: 'bj650nat', size: 'small' });
L.chk('世界已建', gen.ok);
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
  window.__swGame.enemySpawnEnabled = false;
});

// 召唤刃 + buff（无敌人——纯自然收敛流）
await page.evaluate(async () => {
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
  const m = new MinionProj(g.player.cx + 60, g.player.cy - 30, 864, 6, 0, false, 0, false, () => g.player);
  g.entities.add(m, 'projectiles');
  const bt = buffTypeByVanilla(271);
  if (bt !== undefined) g.player.buffs.set(bt, 300);
});
await wait(800);   // 初始收敛落位

// ---- 自然流：拖拽 40 拍（每拍 −9,−2=玩家走位刃滞后）→ 释放收敛 → 逐拍采样 600 拍 ----
const nat = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  const m = () => g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  const st = { phase: 'drag', dragLeft: 40, tick: 0, samples: [] };
  const iv = setInterval(() => {
    const mm = m();
    if (!mm) return;
    st.tick++;
    if (st.phase === 'drag') {
      mm.x -= 9; mm.y -= 2;          // 拖拽（环记录拖拽轨迹,=走位滞后形态）
      if (--st.dragLeft <= 0) st.phase = 'rest';
    }
    // 逐拍采样（环 12 槽散布 + 刃逐拍位移）
    const ring = mm.ghostRing;
    let spread = 0;
    for (let i = 1; i <= 12; i++) {
      const s = ring.at(i);
      if (!s) continue;
      const d = Math.hypot(s.x - mm.x, s.y - mm.y);
      if (d > spread) spread = d;
    }
    const prev = st.samples[st.samples.length - 1];
    st.samples.push({
      t: st.tick, ph: st.phase,
      spread: +spread.toFixed(2),
      dx: prev ? +(mm.x - prev.bx).toFixed(3) : 0,
      dy: prev ? +(mm.y - prev.by).toFixed(3) : 0,
      bx: +mm.x.toFixed(2), by: +mm.y.toFixed(2),
      st: mm.a169St,
    });
    if (st.tick >= 640) { clearInterval(iv); resolve(st); }
  }, 1000 / 60);
}));
const restSamples = nat.samples.filter((s) => s.ph === 'rest' && s.t > nat.samples.find((x) => x.ph === 'rest').t + 60);
const restSpreadMax = Math.max(...restSamples.map((s) => s.spread));
const restMoveMax = Math.max(...restSamples.map((s) => Math.hypot(s.dx, s.dy)));
const convSamples = nat.samples.filter((s) => s.ph === 'rest' && s.t <= nat.samples.find((x) => x.ph === 'rest').t + 60);
const convTicks = convSamples.filter((s) => s.spread > 2).length;
L.say(`自然流: 拖拽40拍→收敛→静置。收敛期 spread>2 拍数=${convTicks}, 静止期(60拍后) spreadMax=${restSpreadMax}, 位移Max=${restMoveMax}`);
L.chk('静止期（收敛落位 60 拍后）spread=0（velocity 恰 0 冻结≙原版 :46594）', restSpreadMax < 0.5,
  `restSpreadMax=${restSpreadMax}`);
const tail = nat.samples.slice(-8).map((s) => `t${s.t}:sp${s.spread}:d(${s.dx},${s.dy})`).join(' ');
L.say(`末 8 拍: ${tail}`);

// ---- 收敛列峰值截图（释放后 ~0.35s=12 份 10px 阶梯列形态）----
await wait(250);
const zoomConv = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  const cam = g.camera;
  const z = cam.zoom ?? 1;
  const sx = (m.cx - cam.x) * z + cv.width / 2, sy = (m.cy - cam.y) * z + cv.height / 2;
  const W = 150, H = 220;
  const out = document.createElement('canvas');
  out.width = W * 3; out.height = H * 3;
  out.getContext('2d').imageSmoothingEnabled = false;
  out.getContext('2d').drawImage(cv, sx - W / 2, sy - H / 2 - 40, W, H, 0, 0, W * 3, H * 3);
  return out.toDataURL('image/png');
});
{
  const { writeFile } = await import('node:fs/promises');
  const p3 = resolveShotPath('bj650-nat-conv-zoom3x.png');
  await writeFile(p3, Buffer.from(zoomConv.split(',')[1], 'base64'));
  L.say(`截图: ${p3}`);
}

// ---- 静置 10s 后复查（列应消散=纯叠栈）----
await wait(10000);
const settled = await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  const ring = m.ghostRing;
  let spread = 0;
  for (let i = 1; i <= 12; i++) {
    const s = ring.at(i);
    if (!s) continue;
    const d = Math.hypot(s.x - m.x, s.y - m.y);
    if (d > spread) spread = d;
  }
  return { spread: +spread.toFixed(3), vx: +m.vx.toFixed(4), vy: +m.vy.toFixed(4) };
});
L.say(`静置 10s: ${JSON.stringify(settled)}`);
const zoomSettled = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  const cam = g.camera;
  const z = cam.zoom ?? 1;
  const sx = (m.cx - cam.x) * z + cv.width / 2, sy = (m.cy - cam.y) * z + cv.height / 2;
  const W = 150, H = 220;
  const out = document.createElement('canvas');
  out.width = W * 3; out.height = H * 3;
  out.getContext('2d').imageSmoothingEnabled = false;
  out.getContext('2d').drawImage(cv, sx - W / 2, sy - H / 2 - 40, W, H, 0, 0, W * 3, H * 3);
  return out.toDataURL('image/png');
});
{
  const { writeFile } = await import('node:fs/promises');
  const p3 = resolveShotPath('bj650-nat-settled-zoom3x.png');
  await writeFile(p3, Buffer.from(zoomSettled.split(',')[1], 'base64'));
  L.say(`截图: ${p3}`);
}

// ---- 对照组：僵尸靶入射程 → 持续 lock/dart/return 循环 → 列存在率 10s 量化 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const px = Math.trunc(g.player.cx), py = Math.trunc(g.player.cy);
  const st = g.world.store;
  let gy = Math.trunc(py / 16);
  while (gy < st.h - 2 && !st.isSolid(Math.trunc(px / 16), gy)) gy++;
  const e = Enemy.fromVanilla(3, px + 250, (gy - 1) * 16 - 20);
  e.maxHp = 5000000; e.hp = 5000000; e.vx = 0; e.vy = 0;
  g.entities.add(e, 'enemies');
});
const cycle = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  const m = () => g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  const st = { tick: 0, colTicks: 0, samples: [] };
  const iv = setInterval(() => {
    const mm = m();
    if (!mm) return;
    st.tick++;
    const ring = mm.ghostRing;
    let spread = 0;
    for (let i = 1; i <= 12; i++) {
      const s = ring.at(i);
      if (!s) continue;
      const d = Math.hypot(s.x - mm.x, s.y - mm.y);
      if (d > spread) spread = d;
    }
    if (spread > 8) st.colTicks++;
    if (st.tick % 30 === 0) st.samples.push({ t: st.tick, sp: +spread.toFixed(1), st: mm.a169St });
    if (st.tick >= 600) { clearInterval(iv); resolve(st); }
  }, 1000 / 60);
}));
L.say(`敌在射程 10s: 列存在率=${(100 * cycle.colTicks / 600).toFixed(1)}% (spread>8 拍数=${cycle.colTicks}/600), 态序列=${JSON.stringify(cycle.samples)}`);
L.say(`耗时 ${L.elapsed()}`);
L.print();
process.exit(L.ok ? 0 : 2);
