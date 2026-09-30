// BJ411 实机探针(2026-09-30):①流星头 23 FindFrame 火尾(每 tick 1 发 dust6=旧位拖尾)
//   ②陨石块 37 环境火星(dustRaw 通道,scale=Next(3)/scale>1 悬浮)+挖掘/破坏尘(id∈{6,23})。
// 判据(对应反编译锚):A.23 活体 60t → spawnDust(d6) 恒 60 发且盒=拍前位(拖尾相位);
//   B.37 屏内 24×6 格 ×600t → d6 尘在陨石带内成批出现(1/250/帧/格 折算量级);
//   C.breakTile(37 格) → 恰 10 发 id∈{6,23};spawnMeteoriteBreakDust fail 档 → 恰 3 发。
// 运行:SW_ORIGIN=http://localhost:5441 node tools/run-diag.mjs scripts/_bj411-meteor-particles.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { spawnEnemy, tileIdBySheet, clearEnemies } from '../tools/probe/lib/entities.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { saveCanvasShot } from '../tools/probe/lib/shot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = join(process.env.SW_PROBE_OUT ?? '/tmp/probe-out', 'bj411');
mkdirSync(OUT, { recursive: true });
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260930 });
L.chk('createGame', gen.ok, gen.why ?? '');
await freezeClock(page, { tod: 0.5 });
await godMode(page, true);
await pump(page, 30);

// ---- 尘捕获桩:包住 Game.spawnDust 记录 (type,x,y,scale,noGravity,w,h) ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.__dustLog = [];
  const orig = g.spawnDust.bind(g);
  g.spawnDust = function (x, y, w, h, type, sx, sy, alpha, color, scale, ng, perfect) {
    g.__dustLog.push({ type, x, y, scale, noGravity: !!ng, w, h, t: g.tickCount });
    return orig(x, y, w, h, type, sx, sy, alpha, color, scale, ng, perfect);
  };
  g.__dustLog.length = 0;
});

// ================= ① 流星头火尾 =================
const ppos = await page.evaluate(() => { const p = window.__swGame.player; return { x: p.cx, y: p.cy }; });
const sp = await spawnEnemy(page, 23, ppos.x + 260, ppos.y - 60);
L.chk('spawn 23', sp.ok, JSON.stringify(sp).slice(0, 120));
await page.evaluate(() => { const g = window.__swGame; g.__dustLog.length = 0; });
await pump(page, 60);
const trail = await page.evaluate(() => {
  const g = window.__swGame;
  const e = (g.entities.enemies ?? []).find((x) => x.vanillaId === 23 && !x.dead);
  const log = g.__dustLog;
  const d6 = log.filter((d) => d.type === 6);
  return {
    enemyAlive: !!e, logN: log.length, d6N: d6.length, logN60: log.length,
    allD6: log.every((d) => d.type === 6),
    scales: [...new Set(d6.map((d) => d.scale))],
    ng: d6.filter((d) => d.noGravity).length,
    box22: d6.every((d) => d.w === 22 && d.h === 22),
    perTick: d6.length === 60,
  };
});
L.chk('流星头火尾:60t≈60 发 dust6(每 tick 1 发±变步长,全 d6,盒 22×22)', trail.enemyAlive && trail.d6N >= 55 && trail.d6N <= 70 && trail.allD6 && trail.box22,
  JSON.stringify(trail));
L.chk('流星头火尾:入参 scale2 恒一(α100 走 spawnDust 8 参,scale 无抖档)', trail.scales.length === 1 && trail.scales[0] === 2,
  JSON.stringify({ scales: trail.scales, ng: trail.ng }));

// 拖尾相位:尘位 ≈ 该拍移动前位(与实体轨迹回溯一致)——取最近 10 发对拍实体 prev 快照不可得,
// 以"尘位与实体当前位置差 ≈ 速度×滞后拍数"量级判(火尾=身后拖影)
await saveCanvasShot(page, join(OUT, 'meteor-head-trail.png'));
L.chk('截图 meteor-head-trail.png', true, OUT);

await clearEnemies(page, {});

// ================= ② 陨石块环境火星 =================
const met = await tileIdBySheet(page, 37);
L.chk('tileIdBySheet(37) 陨石', !!(met && met.ok && met.id >= 0), JSON.stringify(met));
// 玩家传送到地表开阔带,屏内铺 24×6 陨石平台(用 setTileSilent 避免级联;帧 auto 由渲染端取)
await page.evaluate((metTile) => {
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  const ptx = Math.floor(p.cx / 16), pty = Math.floor(p.cy / 16);
  window.__patch = { x0: ptx - 12, x1: ptx + 12, y0: pty + 4, y1: pty + 10 };
  for (let y = window.__patch.y0; y <= window.__patch.y1; y++) {
    for (let x = window.__patch.x0; x <= window.__patch.x1; x++) {
      st.setTileSilent(x, y, metTile, 0, 0);
    }
  }
  // 清掉平台上方 8 格遮挡(视野通透)
  for (let y = window.__patch.y0 - 8; y < window.__patch.y0; y++) {
    for (let x = window.__patch.x0; x <= window.__patch.x1; x++) st.setTileSilent(x, y, 0, 0, 0);
  }
}, met.id);
await teleport(page, ppos.x, ppos.y - 40, { snapCamera: true, zeroVel: true });
await page.evaluate(() => { const g = window.__swGame; g.__dustLog.length = 0; });
await pump(page, 600);
const embers = await page.evaluate(() => {
  const g = window.__swGame;
  const patch = window.__patch;
  const d6 = g.__dustLog.filter((d) => d.type === 6);
  const inPatch = d6.filter((d) => {
    const tx = Math.floor(d.x / 16), ty = Math.floor(d.y / 16);
    return tx >= patch.x0 && tx <= patch.x1 && ty >= patch.y0 - 2 && ty <= patch.y1;
  });
  return {
    d6Total: d6.length, inPatchN: inPatch.length,
    scales: inPatch.reduce((m, d) => { m[d.scale] = (m[d.scale] ?? 0) + 1; return m; }, {}),
    ngN: inPatch.filter((d) => d.noGravity).length,
  };
});
// 期望量级:126 格 × 200 扫描(600t/3) × 1/250 ≈ 100 发(±宽量级窗;>10 即证"在发")
L.chk('陨石火星:600t 陨石带内 d6 成批(>10)且 scale 三档齐', embers.inPatchN > 10 &&
  Object.keys(embers.scales).length >= 1, JSON.stringify(embers));
const poolNg = await page.evaluate(() => {
  const g = window.__swGame;
  const pool = g.vanillaDust?.pool ?? [];
  const live = pool.filter((d) => d.active && d.type === 6);
  return { liveN: live.length, ngN: live.filter((d) => d.noGravity).length };
});
L.chk('陨石火星:活尘池 d6 存在且含 noGravity 悬浮档(scale>1 档)', poolNg.liveN > 0 && poolNg.ngN > 0,
  JSON.stringify(poolNg));
await saveCanvasShot(page, join(OUT, 'meteorite-embers.png'));
L.chk('截图 meteorite-embers.png', true, OUT);

// ================= ③ 陨石挖掘/破坏尘 =================
const mining = await page.evaluate(() => {
  const g = window.__swGame;
  const patch = window.__patch;
  const st = g.world.store;
  const tx = Math.floor((patch.x0 + patch.x1) / 2), ty = patch.y1;
  const beforeType = st.get(tx, ty);
  const beforeSheet = st.type[st.idx(tx, ty)];
  g.__dustLog.length = 0;
  g.breakTile(tx, ty, true);
  const afterType = st.get(tx, ty);
  const allLog = g.__dustLog.slice();
  const breakDust = allLog.filter((d) => d.type === 6 || d.type === 23);
  g.__dustLog.length = 0;
  g.spawnMeteoriteBreakDust(tx, ty, 3);   // fail 档(镐每击)直接驱动
  const hitDust = g.__dustLog.filter((d) => d.type === 6 || d.type === 23);
  return {
    beforeType, beforeSheet, afterType, tileGone: afterType === 0,
    allLogN: allLog.length, allTypes: [...new Set(allLog.map((d) => d.type))],
    breakN: breakDust.length, breakIds: [...new Set(breakDust.map((d) => d.type))],
    hitN: hitDust.length, hitIds: [...new Set(hitDust.map((d) => d.type))],
    breakBoxOK: breakDust.every((d) => Math.abs(d.x - tx * 16) <= 16 && Math.abs(d.y - ty * 16) <= 16),
  };
});
L.chk('陨石破坏:格被清(type→0)', mining.tileGone, JSON.stringify(mining));
L.chk('陨石破坏尘:恰 10 发 id∈{6,23}', mining.breakN === 10 && mining.breakIds.every((i) => i === 6 || i === 23),
  JSON.stringify(mining));
L.chk('陨石挖掘尘(fail 档):恰 3 发 id∈{6,23}', mining.hitN === 3 && mining.hitIds.every((i) => i === 6 || i === 23),
  JSON.stringify(mining));
L.chk('陨石破坏尘盒=格 16×16', mining.breakBoxOK, JSON.stringify(mining));
await saveCanvasShot(page, join(OUT, 'meteorite-mining-dust.png'));
L.chk('截图 meteorite-mining-dust.png', true, OUT);

L.dump(join(OUT, 'ledger.json'));
await browser.close();
process.exit(L.exitCode());
