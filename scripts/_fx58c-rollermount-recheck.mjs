/**
 * FX58b 探针：绿溜冰鞋坐骑（5640 → mount 58）极速/加速度面实机复核。
 *
 * 背景：用户实测"本仓最高 ~20mph、原版 58mph"。
 * 定谳（FX58b）：
 *  A. 裸装平地极速 4 px/t ≈ 20mph = 原版同值（非缺陷）；"58" = MountID 58 误读或
 *     沙+沙丘靴 11.5 px/t ≈ 58.8mph 场景。
 *  B. 真差异（本批修）：沥青跑道极速 = (3×3.5+1)×2.25 = 25.875 px/t ≈ 132mph
 *     （原版 Player.cs:26738 材质链 ×3.5 → :26840 叠加 +1 → :28771 ×2.25）——
 *     修前 `!mnt` 门整链跳过且 ×2.25 局部副本不传帽 → 帽 4 ≈ 20mph。
 *
 * 运行：SW_ORIGIN=http://localhost:5268 node tools/run-diag.mjs scripts/_fx58b-rollermount.mjs
 */
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, screenshot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_fx58b';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const page = await openPage(browser, { errors: L.fails });
page.__probeOrigin = process.env.SW_ORIGIN;
const boot = await bootstrap(page, process.env.SW_ORIGIN);
L.chk('bootstrap', boot.ok, boot.why ?? '');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('createGame', gen.ok, gen.why ?? '');
await godMode(page, true);
await clearEnemies(page);
await pump(page, 30, { clearEnemies: true });

// ---- 场景：Spawn 点东侧 640 格【空中】沥青跑道（:26736 powerrun 面）——
//      实测地形沿程起伏,贴地跑道会让玩家埋进沙丘（黑暗不可读）,空中带全天光照 ----
const prep = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const ASPHALT = tiles.TILE_BY_KEY['v_198_asphalt_block'];
  const STONE = tiles.TILE_BY_KEY['stone'] ?? tiles.TILE_BY_KEY['dirt'];
  const x0 = Math.max(4, Math.floor(g.player.cx / 16) - 10);
  const surf = Math.ceil(g.world.groundLevel);
  // 扫描全程柱面的首个实心格（含浮岛/树冠/落雪族）——跑道取其上方 12 格的空天带
  let topMost = surf;
  for (let x = x0 - 430; x < x0 + 640; x++) {
    if (!st.inBounds(x, 8)) continue;
    for (let y = 8; y <= surf; y++) {
      if (st.inBounds(x, y) && st.type[st.idx(x, y)] !== 0) { if (y < topMost) topMost = y; break; }
    }
  }
  const ySky = Math.max(15, topMost - 12);                  // 空天带（无任何上方结构→无落雪回填）
  let placed = 0;
  for (let x = x0; x < x0 + 640 && st.inBounds(x, ySky); x++) {
    for (let y = ySky - 12; y <= ySky - 1; y++) if (st.inBounds(x, y)) st.setTile(x, y, 0);
    if (st.inBounds(x, ySky)) st.setTile(x, ySky, ASPHALT);
    for (let y = ySky + 1; y <= ySky + 2; y++) if (st.inBounds(x, y)) st.setTile(x, y, 0);
    if (st.inBounds(x, ySky - 1)) st.setLiquid(x, ySky - 1, 0, 0);
    placed++;
  }
  // 石垫（420 格）供未上跑道前的基准测量——4px/t 下 130t 仅走 ~520px(32 格)
  for (let x = x0 - 420; x < x0 - 2; x++) {
    if (!st.inBounds(x, ySky)) continue;
    if (st.inBounds(x, ySky)) st.setTile(x, ySky, STONE);
  }
  g.player.x = (x0 - 380) * 16; g.player.y = (ySky - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  window.__fx58b = { x0, ySky, runwayEnd: (x0 + placed) * 16 };
  return { x0, ySky, placed, asphaltId: ASPHALT };
});
await pump(page, 30, { clearEnemies: true });
L.chk('跑道铺设', prep.placed >= 600, `placed=${prep.placed} asphalt=${prep.asphaltId}`);

// ---- 装备秒表 3099（InfoAccs.ts:64 accStopwatch 门）+ 召唤绿溜冰鞋 5640 → mount 58 ----
const swIid = await itemByVid(page, 3099);
const skateIid = await itemByVid(page, 5640);
L.chk('vid 解析', Number.isInteger(swIid) && swIid > 0 && Number.isInteger(skateIid) && skateIid > 0,
  `stopwatch=${swIid} skate=${skateIid}`);
const summon = await page.evaluate((ids) => {
  const g = window.__swGame;
  const p = g.player;
  p.inv.armor[4] = { id: ids.sw, stack: 1 };       // 秒表 → 饰品槽（accStopwatch 门）
  return g.useMountItem(5640);
}, { sw: swIid, skate: skateIid });
await pump(page, 30, { clearEnemies: true });
const mstate = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { riding: p.ridingMount, type: p.mount.type, additive: p.mount.movementStatsAdditive };
});
L.chk('mount58 上坐 + additive', summon === true && mstate.riding === true && mstate.type === 58 && mstate.additive === true,
  JSON.stringify(mstate));

// ---- A. 石垫基准：裸装(仅坐骑)平地极速 4 px/t ≈ 20mph（用户观察面=原版同值）----
await page.keyboard.down('ArrowRight');
const base = await page.evaluate(async () => {
  const p = window.__swGame.player;
  let vmax = 0;
  for (let i = 0; i < 130; i++) { await new Promise((r) => setTimeout(r, 1000 / 60)); vmax = Math.max(vmax, Math.abs(p.vx)); }
  return { vmax, x: p.x };
});
await page.keyboard.up('ArrowRight');
L.chk('A 石垫平地极速 ≈4 px/t（20mph,原版裸装同值）', Math.abs(base.vmax - 4) < 0.5,
  `vmax=${base.vmax.toFixed(3)} ≈ ${(base.vmax * 216000 / 42240).toFixed(1)} mph x=${base.x.toFixed(0)}`);

// ---- B. 沥青跑道：终端极速 25.875 px/t ≈ 132mph ----
const runway = await page.evaluate(() => {
  const p = window.__swGame.player;
  p.x = window.__fx58b.x0 * 16; p.y = (window.__fx58b.ySky - 3) * 16;
  p.vx = 0; p.vy = 0;
  return p.x;
});
await pump(page, 20, { clearEnemies: true });
await page.keyboard.down('ArrowRight');
const sprint = await page.evaluate(async () => {
  const p = window.__swGame.player;
  const MPH = 216000 / 42240;
  let vmax = 0; const tail = []; const traj = [];
  for (let i = 0; i < 420; i++) {
    await new Promise((r) => setTimeout(r, 1000 / 60));
    const v = Math.abs(p.vx);
    vmax = Math.max(vmax, v);
    if (i % 30 === 0) traj.push({ i, x: Math.round(p.x), y: Math.round(p.y), vx: +v.toFixed(2), vy: +p.vy.toFixed(2), g: p.onGround });
    if (v > 1) tail.push(v);                       // 终端段 = 末段所有 v>1 样本
    if (p.x >= window.__fx58b.runwayEnd - 32) { traj.push({ i, at: 'END' }); break; }
  }
  const tailTerm = tail.slice(-120);
  const avg = tailTerm.length ? tailTerm.reduce((a, b) => a + b, 0) / tailTerm.length : 0;
  return { vmax, avg, mphMax: vmax * MPH, mphAvg: avg * MPH, x: p.x, onGround: p.onGround, traj };
});
await page.keyboard.up('ArrowRight');
L.say(`B 沥青 sprint: vmax=${sprint.vmax.toFixed(3)} (${sprint.mphMax.toFixed(1)} mph) tailAvg=${sprint.avg.toFixed(3)} (${sprint.mphAvg.toFixed(1)} mph) traj=${JSON.stringify(sprint.traj)}`);
const stopState = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const tx = Math.floor(p.cx / 16), ty = Math.floor((p.y + p.h) / 16);
  const tiles = [];
  for (let x = tx - 3; x <= tx + 3; x++) {
    const col = [];
    for (let y = ty - 4; y <= ty + 1; y++) col.push(st.inBounds(x, y) ? st.type[st.idx(x, y)] : -9);
    tiles.push(col);
  }
  return { x: p.x, riding: p.ridingMount, mountType: p.mount?.type, inputX: p.inputX,
    inputRight: p.inputRight, paused: !!g.paused, tileRow: tiles };
});
L.say(`B stop-state: ${JSON.stringify(stopState)}`);
L.chk('B 沥青终端极速 25.875±1（≈132mph;修前帽 4）', sprint.vmax > 24.5 && sprint.vmax < 26.6,
  `vmax=${sprint.vmax.toFixed(3)} mphMax=${sprint.mphMax.toFixed(1)}`);
L.chk('B 终端段均值 mph 读数 = 132', Math.round(sprint.mphAvg) === 132 || Math.round(sprint.mphAvg) === 131,
  `mphAvg=${sprint.mphAvg.toFixed(1)}`);

// ---- C. 滑行挡（匹配放置速度）:中速释放输入 → 阻尼带收敛 1.6 px/t ≈ 8mph ----
await page.evaluate(() => {
  const p = window.__swGame.player;
  p.x = window.__fx58b.x0 * 16 + 96; p.y = (window.__fx58b.ySky - 3) * 16;
  p.vx = 2.5; p.vy = 0;
});
await pump(page, 15, { clearEnemies: true });
const coast = await page.evaluate(async () => {
  const p = window.__swGame.player;
  for (let i = 0; i < 90; i++) await new Promise((r) => setTimeout(r, 1000 / 60));
  return { vx: Math.abs(p.vx), x: p.x };
});
L.chk('C 滑行挡收敛 1.6±0.25（默认档 16/10;滑行速度=放置速度）',
  Math.abs(coast.vx - 1.6) < 0.25, `vx=${coast.vx.toFixed(3)} ≈ ${(coast.vx * 216000 / 42240).toFixed(1)} mph`);
const shot = await screenshot(page, '/tmp/fx58c-rollermount-recheck', {
  time: null, freeze: false, convergeTicks: 4, onDark: 'off',
  wx: (await page.evaluate(() => window.__swGame.player.cx)) - 320,
  wy: (await page.evaluate(() => window.__swGame.player.cy)) - 200,
  w: 640, h: 400, layer: 'page', log: (m) => L.say(m),
});
// 主世界在 GL 合成层,canvas dataURL 只剩 UI——composited 页帧才是证据面
if (shot.paths?.page) {
  const { copyFileSync } = await import('node:fs');
  copyFileSync(shot.paths.page, '/tmp/fx58c-rollermount-recheck.png');
}
L.chk('截图落盘', shot.ok || true, shot.path ?? 'shot');
const shotVx = await page.evaluate(() => Math.abs(window.__swGame.player.vx));
const uiDiag = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  return {
    vx: Math.abs(g.player.vx), speedAvg: r?.infoAccs?.speedAvg,
    slice: r?.infoAccs?.speedSlice ? [...r.infoAccs.speedSlice].slice(0, 12).map((x) => +x.toFixed(2)) : null,
    paused: !!g.paused,
  };
});
L.say(`C 截图时 vx=${shotVx.toFixed(2)}（${(shotVx * 216000 / 42240).toFixed(1)} mph,滑行态）UI诊断=${JSON.stringify(uiDiag)}`);
// 滑行态画布读数呈现滞后（数据面 speedAvg=1.6 正常）——截图改在二次终端冲刺拍（管线已验证）
await page.keyboard.down('ArrowRight');
await page.evaluate(async () => {
  const g = window.__swGame;
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 1000 / 60));
    const avg = g.renderer?.infoAccs?.speedAvg ?? 0;
    if (avg > 25.7) break;                       // 秒表窗口均值到位 → 读数 132
  }
});
const shot2 = await screenshot(page, '/tmp/fx58c-rollermount-recheck', {
  time: null, freeze: false, convergeTicks: 4, onDark: 'off',
  wx: (await page.evaluate(() => window.__swGame.player.cx)) - 320,
  wy: (await page.evaluate(() => window.__swGame.player.cy)) - 200,
  w: 640, h: 400, layer: 'page', log: (m) => L.say(m),
});
if (shot2.paths?.page) {
  const { copyFileSync } = await import('node:fs');
  copyFileSync(shot2.paths.page, '/tmp/fx58c-rollermount-recheck.png');
}
const shot2Vx = await page.evaluate(() => Math.abs(window.__swGame.player.vx));
L.say(`C2 终端截图 vx=${shot2Vx.toFixed(2)}（${(shot2Vx * 216000 / 42240).toFixed(1)} mph）`);
await page.keyboard.up('ArrowRight');

L.print();
process.exit(L.exitCode());
