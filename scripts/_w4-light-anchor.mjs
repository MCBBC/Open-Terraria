#!/usr/bin/env node
/**
 * ★W4 清偿刀——光照区域锚定谳探针 v3（Game.ts:12202 ensureRegion 锚 player.cx/cy vs
 * 原版 GetAreaToLight Main.cs:64888-64899 锚 Camera.ScaledPosition）。
 *
 * v3 判据修正（_w4-shot-diag 定谳）：GPU 合成链下 renderer.canvas 的 dataURL 捕获
 * 只含 HUD 层（世界在 glCanvas 合成,2D 回贴空）——**伪黑**。cpuRender=true 走 2D
 * 全合成路径后画布捕获=真实帧。烘焙回应跨 evaluate 到达（同步 evaluate 内派发的
 * worker 烘焙当帧回不来）——预烘焙必须跨 evaluate 两段式。
 *
 * 两暴露面量化（W2 定谳面,本探针给数）：
 *   ① 跟踪镜头：高尔夫跟踪链（golfState.recordSwing 假球 200 格外 + 手持 3611
 *      宏伟蓝图维持跟踪,GolfState.update(:111-134) heldIsWireKite 门）→ camTX 汇入
 *      follow,相机远离玩家 → 区域(锚玩家)视口覆盖度→0,lightAt 四角全 0=全屏黑。
 *   ② 传送滑行：startCameraTransitionForPlayerTeleport（Game.ts:12699,近距
 *      dist<blackFadeDist→advanceTeleportLerp 滑行）——玩家瞬移 800px(50 格),
 *      相机自 A 滑向 B;区域锚玩家(在 B)而相机在 A,视缘带出区=黑带。
 *   ③ 对照组：静置普通游玩（相机≈玩家）覆盖度=1（零回归面）。
 *
 * 用法：SW_ORIGIN=http://localhost:5720 node tools/run-diag.mjs scripts/_w4-light-anchor.mjs
 * 产物：JSON 台账(stdout) + 画布截图(docs/evidence/w4/)
 */
import {
  launchBrowser, openPage, bootstrap, createGame, giveItems,
  pumpInline, camSnapTo, ledger, resolveShotPath, freezeClock, front,
} from '../tools/probe/lib/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = process.env.W4_OUT || 'docs/evidence/w4';
const L = ledger();

// ---- 页内采样器:区域×视口覆盖几何 + 角落 lightAt + 烘焙账 ----
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
    let lit = 0, sum = 0;
    for (const [x, y] of pts) {
      const c = li.lightAt(x, y);
      sum += c[0] + c[1] + c[2];
      if (c[0] + c[1] + c[2] > 0) lit++;
    }
    // 烘焙账:视口覆盖 chunk(16×16 tile)中已有 canvas 的对数
    const key = (cx, cy) => (cx & 0xffff) | ((cy & 0xffff) << 16);
    let baked = 0, tot = 0;
    const ccx0 = Math.floor(vx0 / 16), ccx1 = Math.floor(vx1 / 16), ccy0 = Math.floor(vy0 / 16), ccy1 = Math.floor(vy1 / 16);
    for (let cy = ccy0; cy <= ccy1; cy++) for (let cx = ccx0; cx <= ccx1; cx++) {
      tot++;
      const ch = g.chunks.chunks.get(key(cx, cy));
      if (ch && !ch.placeholder && ch.tile && ch.wall) baked++;
    }
    return {
      distTiles: Math.round(Math.hypot(cam.x - p.cx, cam.y - p.cy) / 16 * 10) / 10,
      coverage: Math.round(inter / (vw * vh) * 1000) / 1000,
      litCorners: lit,
      cornerSum: Math.round(sum),
      region: [rx, ry, rw, rh],
      cam: [Math.round(cam.x), Math.round(cam.y)],
      baked: baked + '/' + tot,
    };
  }
  return sample.toString();
})();

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
await page.evaluate(() => { window.__swGame.renderer.cpuRender = true; });   // 2D 全合成:画布捕获=真实帧
await freezeClock(page, { tod: 0.5 });   // 钉正午:阳光面=出区黑对照最强
await pumpInline(page, 12);              // 光照首收敛

// ---- 面③ 对照组:静置(相机≈玩家) ----
await camSnapTo(page, ...await page.evaluate(() => [window.__swGame.player.cx, window.__swGame.player.cy]));
await pumpInline(page, 8);
const idle = await page.evaluate(new Function(`return (${SAMPLE_SRC})`)());
L.chk('对照:静置覆盖度=1(区域含视口)', idle.coverage >= 0.999, `coverage=${idle.coverage} dist=${idle.distTiles}`);
const ctrlShot = await atomicShot(page);
saveDataURL(resolveShotPath(OUT + '/w4-diag-control', OUT), ctrlShot.data);

// ---- 面① 高尔夫跟踪:假球 200 格外,手持 3611 维持跟踪 ----
const golf0 = await giveItems(page, [{ vid: 3611, slot: 0 }], { select: 0 });
L.chk('手持宏伟蓝图(3611)就位', golf0.ok, JSON.stringify(golf0));
const playerPos = await page.evaluate(() => {
  const g = window.__swGame;
  // GolfState.recordSwing(:83-95) 公开:置 lastHitBall+waitingForBallToSettle
  const bx = g.player.cx + 200 * 16, by = g.player.cy;   // 200 格正东
  const ball = { id: 99991, x: bx, y: by, cx: bx, cy: by, vx: 0, vy: 0, swings: 1, moving: true, dead: false, isMine: true };
  g.golfState.recordSwing(ball);
  g.__w4Ball = ball;
  return { px: g.player.cx, py: g.player.cy, ball: [bx, by] };
});
L.chk('假球已置(200 格东)+跟踪态', !!playerPos.ball, JSON.stringify(playerPos));
const golfSeries = await sampleSeries(page, 60, { every: 3 });
const golfEnd = golfSeries[golfSeries.length - 1];
const golfCovMin = Math.min(...golfSeries.map((s) => s.coverage));
console.log('[w4] 面①高尔夫跟踪逐拍(每3t):');
for (const s of golfSeries) console.log('  ', JSON.stringify(s));
L.chk('面①量化:跟拍视口覆盖度塌落', true, `covMin=${golfCovMin} covEnd=${golfEnd.coverage} distEnd=${golfEnd.distTiles}`);
// 球位烘焙两段式:render 派发 → 让事件循环收烘焙回应 → 再 render 使用
for (let round = 0; round < 4; round++) {
  await page.evaluate(() => { const g = window.__swGame; for (let i = 0; i < 6; i++) { g.fixedUpdate(1 / 60); g.render(); } });
  await new Promise((r) => setTimeout(r, 120));
}
const golfShot = await atomicShot(page);
saveDataURL(resolveShotPath(OUT + '/w4-golf-follow', OUT), golfShot.data);
console.log('[w4] 高尔夫跟拍留档拍:', JSON.stringify(golfShot.mid));

// ---- 面② 传送滑行:回收跟踪态 → 800px 近距传送 lerp ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.__w4Ball.dead = true;                       // 断跟踪
  g.golfState.waitingForBallToSettle = false;
  g.player.inv.selected = 1;                    // 换下 3611(双保险)
});
await camSnapTo(page, playerPos.px, playerPos.py);   // 相机玩家同点 A
await pumpInline(page, 10);                        // A 点光照稳态
const lerpSeries = await page.evaluate(({ fnSrc }) => {
  const fn = new Function(`return (${fnSrc})`)();
  const g = window.__swGame;
  const p = g.player;
  const oldX = p.cx, oldY = p.cy;
  p.x += 800; p.vx = 0; p.vy = 0;               // 玩家瞬移 800px=50 格(>区域余量 29,<幕帘阈 62.5)
  g.startCameraTransitionForPlayerTeleport(oldX, oldY);   // 近距支→advanceTeleportLerp(0.1 起)
  const out = [{ phase: 'pre', ...fn() }];
  for (let i = 0; i < 14; i++) {
    g.fixedUpdate(1 / 60);
    out.push({ phase: 't' + (i + 1), ...fn() });
  }
  return out;
}, { fnSrc: SAMPLE_SRC });
console.log('[w4] 面②传送滑行逐拍:');
for (const s of lerpSeries) console.log('  ', JSON.stringify(s));
const uncoveredTicks = lerpSeries.filter((s) => s.phase !== 'pre' && s.coverage < 0.999).length;
const maxDist = Math.max(...lerpSeries.map((s) => s.distTiles));
L.chk('面②量化:滑行窗视口出区拍数', true, `uncovered=${uncoveredTicks}/14 maxDist=${maxDist}`);

// 滑行重演(原子截图):玩家已到 B——B 点烘焙两段式 → 回 A → lerp 第 2 拍原子捕获
for (let round = 0; round < 5; round++) {
  await page.evaluate(() => { const g = window.__swGame; for (let i = 0; i < 6; i++) { g.render(); } });
  await new Promise((r) => setTimeout(r, 120));
}
const bakeB = await page.evaluate(new Function(`return (${SAMPLE_SRC})`)());
console.log('[w4] B 点烘焙账:', JSON.stringify(bakeB));
await page.evaluate(({ fnSrc }) => {
  const fn = new Function(`return (${fnSrc})`)();
  const g = window.__swGame;
  // 回 A:玩家相机同点重置+光照稳态(此时玩家在 B,西移 800px)
  g.player.x -= 800; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  for (let i = 0; i < 12; i++) { g.fixedUpdate(1 / 60); }
  // 重演滑行:第 2 拍原子捕获
  const oldX = g.player.cx, oldY = g.player.cy;
  g.player.x += 800; g.player.vx = 0; g.player.vy = 0;
  g.startCameraTransitionForPlayerTeleport(oldX, oldY);
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
  g.__w4Mid = fn();
  g.render();
  const cv = g.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  window.__w4LerpData = cv.toDataURL('image/png');
}, { fnSrc: SAMPLE_SRC });
const mid = await page.evaluate(() => { const m = window.__swGame.__w4Mid; const d = window.__w4LerpData; window.__w4LerpData = null; window.__swGame.__w4Mid = null; return { m, d }; });
console.log('[w4] 滑行第2拍(原子截图拍):', JSON.stringify(mid.m));
saveDataURL(resolveShotPath(OUT + '/w4-teleport-lerp-mid', OUT), mid.d);

L.print();
console.log(`LEDGER ${L.ok ? 'GREEN' : 'RED'} (${L.elapsed()})`);
await browser.close();
process.exit(L.exitCode());
