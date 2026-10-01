// Y3（W4-债2 补齐①）——无人机 FPV 跟踪源实机光照连续性探针（SP 可达面）。
//
// 定谳锚（1457 反编译直读）：
//   汇入点 = Main.GetObjectTrackingCameraPan（Main.cs:63671-63699）第三支
//   DroneCameraTracker.TryTracking（Main.cs:63692-63694）——Track 调用点在
//   AI_195_JimsDrone owner==myPlayer 支逐帧（Projectile.cs:41688）；
//   门 = Main.LocalPlayer.remoteVisionForDrone（DroneCameraTracker.cs:26；
//   Player.cs:2373 字段，:14315 虚荣支 case 5452 / :15576 功能支 type==5452 置位，
//   :18828 ResetEffects 复位）——**装备门非联机门，SP 可达**（与 specCam 观战支
//   的 netMode 门相反，见 _y3-spectate-light.mjs 定谳）。
//   本仓接线 = Game.ts:11873-11875（camTX 汇入，全链优先序 1:1）→
//   Game.ts:12216 光照区域锚相机（★W4 修复面）。
//
// 实机判据（与 W4 高尔夫链同机制）：
//   ① 出膛真链：手持 5451 点击 → JimsDroneProj(1020) 实体（updateUse :14796 支）；
//   ② 佩戴 5452 → droneTracker.tryTracking 活，相机跟弹心（玩家瞬移 200 格外后
//      相机留在无人机处，distTiles≈200）；
//   ③ 光照连续：跟拍全程 coverage=1 + 五采样点 lightAt 全亮（W4 修复前该面
//      coverage→0 全屏黑——_w4-light-anchor 定谳面）+ 原子截图留档；
//   ④ 门反转：摘 5452 → tryTracking 立断 → 相机回玩家（装备门 1:1 面）；
//      复佩 → 相机回无人机。杀弹 → 相机回玩家（Track 断供面）。
//
// 用法：SW_ORIGIN=http://localhost:5740 node tools/run-diag.mjs scripts/_y3-fpv-drone-light.mjs
// 产物：JSON 台账(stdout) + 截图 docs/evidence/w4/y3-fpv-drone-*.png
import {
  launchBrowser, openPage, bootstrap, createGame, giveItems,
  pumpInline, camSnapTo, ledger, resolveShotPath, freezeClock, front, godMode,
} from '../tools/probe/lib/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = process.env.W4_OUT || 'docs/evidence/w4';
const L = ledger();

// ---- 页内采样器：区域×视口覆盖几何 + 五点 lightAt + 跟踪源判定 ----
const SAMPLE_SRC = (() => {
  function sample() {
    const g = window.__swGame;
    const cam = g.camera, p = g.player, li = g.lighting;
    const halfWT = cam.viewW / 2 / cam.zoom / 16, halfHT = cam.viewH / 2 / cam.zoom / 16;
    const cxT = cam.x / 16, cyT = cam.y / 16;
    const vx0 = Math.floor(cxT - halfWT), vx1 = Math.ceil(cxT + halfWT);
    const vy0 = Math.floor(cyT - halfHT), vy1 = Math.ceil(cyT + halfHT);
    const rx = li.rx, ry = li.ry, rw = li.rw, rh = li.rh;
    const ix0 = Math.max(vx0, rx), iy0 = Math.max(vy0, ry);
    const ix1 = Math.min(vx1, rx + rw - 1), iy1 = Math.min(vy1, ry + rh - 1);
    const vw = vx1 - vx0 + 1, vh = vy1 - vy0 + 1;
    const inter = (ix1 >= ix0 && iy1 >= iy0) ? (ix1 - ix0 + 1) * (iy1 - iy0 + 1) : 0;
    const pts = [[vx0, vy0], [vx1, vy0], [vx0, vy1], [vx1, vy1], [Math.floor(cxT), Math.floor(cyT)]];
    let lit = 0, sum = 0, centerLit = 0;
    for (const [x, y] of pts) {
      const c = li.lightAt(x, y);
      const s = c[0] + c[1] + c[2];
      sum += s;
      if (s > 0) lit++;
      if (x === Math.floor(cxT) && y === Math.floor(cyT)) centerLit = Math.round(s);
    }
    // 跟踪源判定（GetObjectTrackingCameraPan 同序：spectating→dead 门→drone→golf）
    const drone = g.camera.droneTracker.tryTracking(g.player, g.player.inv);
    const golf = !p.dead ? g.golfState.tryGetCameraTrackingPosition() : null;
    const source = (g.spectatingSlot >= 0 && g.net?.active) ? 'spec'
      : p.dead ? 'deadlock'
        : drone ? 'drone' : golf ? 'golf' : 'player';
    const droneEnt = g.entities.projectiles.find(
      (m) => !m.dead && m.projId === 1020 && m.ownerPlayer === g.player);
    return {
      source,
      distTiles: Math.round(Math.hypot(cam.x - p.cx, cam.y - p.cy) / 16 * 10) / 10,
      droneDist: droneEnt ? Math.round(Math.hypot(cam.x - droneEnt.cx, cam.y - droneEnt.cy) * 10) / 10 : null,
      coverage: Math.round(inter / (vw * vh) * 1000) / 1000,
      litCorners: lit,
      centerLit,
      cornerSum: Math.round(sum),
      region: [rx, ry, rw, rh],
      cam: [Math.round(cam.x), Math.round(cam.y)],
      drone: droneEnt ? [Math.round(droneEnt.cx), Math.round(droneEnt.cy)] : null,
      dead: p.dead,
    };
  }
  return sample.toString();
})();

const fnOf = (src) => new Function(`return (${src})`)();

async function sampleSeries(page, ticks, { every = 1 } = {}) {
  await front(page);
  return page.evaluate(({ ticks, every, fnSrc }) => {
    const fn = new Function(`return (${fnSrc})`)();
    const g = window.__swGame;
    const out = [];
    for (let i = 0; i < ticks; i++) {
      g.fixedUpdate(1 / 60);
      if (i % every === 0) out.push(fn());
    }
    return out;
  }, { ticks, every, fnSrc: SAMPLE_SRC });
}

/** 原子画布捕获:单 evaluate 内 render+toDataURL（无 rAF 竞态）。 */
async function atomicShot(page) {
  await front(page);
  return page.evaluate(({ fnSrc }) => {
    const fn = new Function(`return (${fnSrc})`)();
    const g = window.__swGame;
    g.render();
    const cv = g.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
    return { mid: fn(), data: cv ? cv.toDataURL('image/png') : null };
  }, { fnSrc: SAMPLE_SRC });
}

function saveDataURL(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));
  return path;
}

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('世界已建', gen.ok);
await page.evaluate(() => { window.__swGame.renderer.cpuRender = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => { window.__swGame.enemySpawnEnabled = false; });
await godMode(page, true);
await pumpInline(page, 12);

// ---- 出膛前置：佩戴门正反两面（hasRemoteVisionForDrone 现算面） ----
const visor0 = await page.evaluate(async () => {
  const g = window.__swGame;
  const { hasRemoteVisionForDrone } = await import('/src/render/DroneCameraTracker.ts');
  const visorId = window.__swFlow.itemByVid(5452);
  const before = hasRemoteVisionForDrone(g.player.inv);
  g.player.inv.armor[3] = { id: visorId, stack: 1 };
  const after = hasRemoteVisionForDrone(g.player.inv);
  return { before, after, visorId };
});
L.chk('装备门:裸机 false→佩 5452 true（remoteVisionForDrone SP 可达）',
  visor0.before === false && visor0.after === true, JSON.stringify(visor0));

// ---- ① 出膛真链：手持 5451 点击（updateUse :14796 支） ----
const give0 = await giveItems(page, [{ vid: 5451, slot: 0 }], { select: 0 });
L.chk('手持吉姆无人机(5451)就位', give0.ok, JSON.stringify(give0));
const spawn0 = await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = Math.floor(g.camera.viewW / 2);
  g.input.mouseY = Math.floor(g.camera.viewH / 2);
  g.input.mouseDown = true; g.input.mouseHeld = true;
  return true;
});
await pumpInline(page, 6);
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseDown = false; g.input.mouseHeld = false;
});
const spawned = await page.evaluate(() => {
  const g = window.__swGame;
  const d = g.entities.projectiles.find(
    (m) => !m.dead && m.projId === 1020 && m.ownerPlayer === g.player);
  return d ? { cx: Math.round(d.cx), cy: Math.round(d.cy) } : null;
});
L.chk('①出膛真链:点击 5451 → JimsDroneProj(1020) 在场', !!spawned && spawn0,
  JSON.stringify(spawned));

// ---- ② 跟拍建立：tryTracking 活 + 相机收敛弹心 ----
await pumpInline(page, 45);
const track0 = await page.evaluate(() => {
  const g = window.__swGame;
  const t = g.camera.droneTracker.tryTracking(g.player, g.player.inv);
  const d = g.entities.projectiles.find(
    (m) => !m.dead && m.projId === 1020 && m.ownerPlayer === g.player);
  return {
    track: t ? [Math.round(t.x), Math.round(t.y)] : null,
    drone: d ? [Math.round(d.cx), Math.round(d.cy)] : null,
  };
});
L.chk('②Track 活:tryTracking=弹心（AI_195 :41688 逐帧链）',
  !!track0.track && track0.drone
  && Math.abs(track0.track[0] - track0.drone[0]) < 2
  && Math.abs(track0.track[1] - track0.drone[1]) < 2, JSON.stringify(track0));

// ---- ③ 玩家瞬移 200 格正东（相机应留在无人机处）——跟拍全程光照连续 ----
const tp0 = await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x += 200 * 16; g.player.vx = 0; g.player.vy = 0;
  return { px: Math.round(g.player.cx), py: Math.round(g.player.cy) };
});
await pumpInline(page, 20);   // 相机缓动收敛向弹心
const series = await sampleSeries(page, 60, { every: 3 });
const covMin = Math.min(...series.map((s) => s.coverage));
const srcSet = [...new Set(series.map((s) => s.source))];
const distMin = Math.min(...series.map((s) => s.distTiles));
const droneDistMax = Math.max(...series.map((s) => s.droneDist ?? 999));
console.log('[y3-fpv] 跟拍逐拍(每3t):');
for (const s of series) console.log('  ', JSON.stringify(s));
L.chk('③跟拍源=drone 且稳态相机锚弹心（玩家 200 格外）',
  srcSet.length === 1 && srcSet[0] === 'drone'
  && Math.min(...series.slice(-3).map((s) => s.distTiles)) > 180,
  `src=${srcSet} distEnd=${series[series.length - 1].distTiles} droneDistEnd=${series[series.length - 1].droneDist}`);
L.chk('③W4 判据:跟拍全程 coverage=1 + 视口实亮（中心 lightAt>0）',
  covMin >= 0.999 && series.every((s) => s.centerLit > 0),
  `covMin=${covMin} centerLitMin=${Math.min(...series.map((s) => s.centerLit))}`);

// 烘焙两段式 → 原子截图（无人机视角视口实亮,玩家在画面外 200 格）
for (let round = 0; round < 4; round++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    for (let i = 0; i < 6; i++) { g.fixedUpdate(1 / 60); g.render(); }
  });
  await new Promise((r) => setTimeout(r, 120));
}
const shot = await atomicShot(page);
saveDataURL(resolveShotPath(OUT + '/y3-fpv-drone-follow', OUT), shot.data);
console.log('[y3-fpv] 留档拍:', JSON.stringify(shot.mid));
L.chk('③留档拍 coverage=1 + 中心实亮', shot.mid.coverage >= 0.999 && shot.mid.centerLit > 0,
  `cov=${shot.mid.coverage} centerLit=${shot.mid.centerLit} lit=${shot.mid.litCorners}`);

// ---- ④ 门反转面A:摘 5452 → Track 立断 → 相机回玩家 ----
await page.evaluate(() => { window.__swGame.player.inv.armor[3] = null; });
await pumpInline(page, 30);
const gateA = await page.evaluate(() => {
  const g = window.__swGame;
  const t = g.camera.droneTracker.tryTracking(g.player, g.player.inv);
  return { track: !!t, dist: Math.round(Math.hypot(g.camera.x - g.player.cx, g.camera.y - g.player.cy) / 16 * 10) / 10 };
});
L.chk('④A摘镜:tryTracking 断 + 相机回玩家(dist<3)', !gateA.track && gateA.dist < 3,
  JSON.stringify(gateA));

// 门反转面B:复佩 → 相机回无人机
await page.evaluate(async () => {
  const g = window.__swGame;
  const visorId = window.__swFlow.itemByVid(5452);
  g.player.inv.armor[3] = { id: visorId, stack: 1 };
});
await pumpInline(page, 45);
const gateB = await page.evaluate(() => {
  const g = window.__swGame;
  const t = g.camera.droneTracker.tryTracking(g.player, g.player.inv);
  const d = g.entities.projectiles.find(
    (m) => !m.dead && m.projId === 1020 && m.ownerPlayer === g.player);
  return {
    track: !!t, droneAlive: !!d,
    dist: d ? Math.round(Math.hypot(g.camera.x - d.cx, g.camera.y - d.cy) * 10) / 10 : null,
  };
});
L.chk('④B复镜:Track 复活 + 相机回弹心(<4px)', gateB.track && gateB.droneAlive && gateB.dist !== null && gateB.dist < 4,
  JSON.stringify(gateB));

// 门反转面C:杀弹 → Track 断供 → 相机回玩家
await page.evaluate(() => {
  const g = window.__swGame;
  const d = g.entities.projectiles.find(
    (m) => !m.dead && m.projId === 1020 && m.ownerPlayer === g.player);
  d.killNow(g);
});
await pumpInline(page, 30);
const gateC = await page.evaluate(() => {
  const g = window.__swGame;
  return { dist: Math.round(Math.hypot(g.camera.x - g.player.cx, g.camera.y - g.player.cy) / 16 * 10) / 10 };
});
L.chk('④C杀弹:相机回玩家(dist<3)', gateC.dist < 3, JSON.stringify(gateC));

L.print();
console.log(`LEDGER ${L.ok ? 'GREEN' : 'RED'} (${L.elapsed()})`);
await browser.close();
process.exit(L.exitCode());
