// ★b2b-acc-degraded 清偿批定谳仪（2026-10-05）：acc 整帧降级构成清单·相位矩阵版。
// 场景=_lightwasm-probe 柱战段原配方复刻（登记债 66% 的测量上下文）：
//   静置 → 高空传送(surf-70)下坠 → zoom-out 0.5 → 雷雨 → 四柱强置盾柱战(600+帧)。
// 每相位独立账：帧路径占比（降级率）+ degradeTriggers 按 op + accFail。
// 会话级 degradeOps/degradeCallers（首触发调用方栈）收尾总账。
// 只读探针:页内运行时包裹,零生产码改动。
import { launchBrowser, openPage, bootstrap, createGame, teleport, nextFrame, godMode } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5217';
const errors = [];

const browser = await launchBrowser({});
const page = await openPage(browser, { errors });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 160)));
await bootstrap(page, `${ORIGIN}/?cloudcache=0`);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await godMode(page, true);

// ① 页内仪具:frameReset 累计器（frameReset=acc 窗开,每帧恰好一次）+ 相位账
await page.evaluate(() => {
  const g = window.__swGame;
  const M = g.renderer.bglEntShim.constructor;   // GLShimExecutor
  const proto = M.prototype;
  window.__phase = null;
  window.__accStats = {};                         // phase -> {frames,degraded,paths,ops,accFails}
  window.__GLShimExecutor = M;
  const origReset = proto.frameReset;
  proto.frameReset = function () {
    try {
      const R = window.__swGame.renderer;
      const ph = window.__phase || 'pre';
      const acc = (window.__accStats[ph] ??= { frames: 0, degraded: 0, paths: {}, ops: {}, accFails: {} });
      const p = R.bglPathUsed || 'off';
      acc.paths[p] = (acc.paths[p] || 0) + 1;
      if (String(p).startsWith('b2b-acc-degraded')) acc.degraded++;
      acc.frames++;
      const t = this.stats.degradeTriggers || {};
      for (const k in t) acc.ops[k] = (acc.ops[k] || 0) + t[k];
      const af = this.stats.accFails || {};
      for (const k in af) acc.accFails[k] = (acc.accFails[k] || 0) + af[k];
    } catch { /* 仪面不伤帧 */ }
    return origReset.call(this);
  };
});

const report = (tag) => page.evaluate((t) => {
  const acc = window.__accStats[t] || { frames: 0, degraded: 0, paths: {}, ops: {} };
  const rate = acc.frames ? +(acc.degraded / acc.frames * 100).toFixed(1) : -1;
  return { tag: t, frames: acc.frames, degraded: acc.degraded, rate, paths: acc.paths, ops: acc.ops, accFails: acc.accFails };
}, tag).then((r) => {
  console.log(`[${r.tag}] frames=${r.frames} degraded=${r.degraded} rate=${r.rate}%`);
  if (Object.keys(r.paths).length) console.log(`  paths=${JSON.stringify(r.paths)}`);
  if (Object.keys(r.ops).length) console.log(`  triggers=${JSON.stringify(r.ops)}`);
  if (r.accFails && Object.keys(r.accFails).length) console.log(`  accFails=${JSON.stringify(r.accFails)}`);
  return r;
});

// ---- 相位 1:静置 60 帧 ----
window_marker: {
  await page.evaluate(() => { window.__phase = 'idle'; });
  for (let i = 0; i < 60; i++) await nextFrame(page);
  await report('idle');
}

// ---- 相位 2:高空传送(surf-70)下坠 240 帧 ----
const winfo = await page.evaluate(() => {
  const g = window.__swGame;
  return { w: g.world.w, h: g.world.h, surf: g.world.groundLevel ?? 0 };
});
await teleport(page, Math.floor(winfo.w / 2) * 16, Math.max(80, (winfo.surf - 70) * 16));
await page.evaluate(() => { window.__phase = 'fall'; });
for (let i = 0; i < 240; i++) await nextFrame(page);
await report('fall');

// ---- 相位 3:zoom-out 0.5 120 帧 ----
await page.evaluate(() => { window.__swGame.camera.zoom = 0.5; window.__phase = 'zoom'; });
for (let i = 0; i < 120; i++) await nextFrame(page);
await report('zoom');
await page.evaluate(() => { window.__swGame.camera.zoom = 1; });

// ---- 相位 4:雷雨 120 帧 ----
await page.evaluate(() => {
  const g = window.__swGame;
  if (g.world.weather) { g.world.weather.raining = true; g.world.weather.cloudAlpha = 1; g.world.weather.maxRaining = 1; }
  window.__phase = 'rain';
});
for (let i = 0; i < 120; i++) await nextFrame(page);
await report('rain');
await page.evaluate(() => { if (window.__swGame.world.weather) window.__swGame.world.weather.raining = false; });

// ---- 相位 5:四柱强置盾柱战 900 帧（lightwasm 配方:shield 10000,相机钉玩家）----
await page.evaluate(async () => {
  const g = window.__swGame;
  const ids = [517, 422, 507, 493];
  const px = g.player.cx, py = g.player.cy;
  const spawned = [];
  for (let i = 0; i < ids.length; i++) {
    const e = await window.__swFlow.spawnVanillaEnemy(ids[i], px - 300 + i * 200, py - 40);
    if (e) spawned.push(e.id);
  }
  const le = g.world.lunarEvent;
  le.active = true; le.towerActive = { solar: true, vortex: true, nebula: true, stardust: true };
  for (const k of ['solar', 'vortex', 'nebula', 'stardust']) le.shield[k] = 10000;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  window.__pillarPin = setInterval(() => { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }, 16);
  window.__towersSpawned = spawned.length;
});
console.log(`towers spawned: ${await page.evaluate(() => window.__towersSpawned)}`);
await page.evaluate(() => { window.__phase = 'pillar'; });
for (let i = 0; i < 900; i++) await nextFrame(page);
await report('pillar');
await page.evaluate(() => clearInterval(window.__pillarPin));

// ---- 相位 6:柱战+天顶剑攻击（弹幕/受击/尘全开）600 帧 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const flow = window.__swFlow;
  const iid = flow.itemByVid(4956);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  window.__pillarPin = setInterval(() => { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }, 16);
});
await page.mouse.move(700, 300);
await page.mouse.down();
await page.evaluate(() => { window.__phase = 'pillarCombat'; });
for (let i = 0; i < 600; i++) await nextFrame(page);
await page.mouse.up();
await page.evaluate(() => clearInterval(window.__pillarPin));
await report('pillarCombat');

// ---- 会话级总账 ----
const total = await page.evaluate(() => ({
  degradeOps: window.__GLShimExecutor.degradeOps,
  degradeCallers: window.__GLShimExecutor.degradeCallers,
  creations: window.__swGame.renderer.b2bWorldCanvasCreations,
  wcNull: window.__swGame.renderer.worldCanvas === null,
}));
console.log('--- 会话级总账 ---');
console.log('degradeOps:', JSON.stringify(total.degradeOps));
console.log('degradeCallers:');
Object.entries(total.degradeCallers).sort((a, b) => b[1] - a[1]).slice(0, 30)
  .forEach(([k, v]) => console.log(`  ${v}\t${k}`));
console.log(`b2bWorldCanvasCreations=${total.creations} wcNull=${total.wcNull}`);

if (errors.length) console.log('ERRORS:', errors.slice(0, 8));
await browser.close();
console.log('DONE');
