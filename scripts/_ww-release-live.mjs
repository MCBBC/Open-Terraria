// ★债1 活机取证：WaveWorker release() 全流程生命周期（进→退→再进波场正常）
// run: SW_ORIGIN=http://localhost:5215 node tools/run-diag.mjs scripts/_ww-release-live.mjs
// 判据：
//  A 进世界①：WaveWorker worker target 出现；wwWorkerStats().on=true 且 posted/fields 随时间推进
//  B quitToMenu（Game.destroy → waterWaves.release）：WaveWorker target 归零（terminate 实证）、on=false
//  C 进世界②：WaveWorker target 重新出现（_wwSpawned 闩已复位 → _wwEnsure 重建）、fields 继续推进
//    = 波场静默永失反证（若闩未复位，②永远无 worker/无 fields）
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5215';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.message).slice(0, 160)));

await bootstrap(page, ORIGIN + '/');
// 标题就绪
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('[data-act=sp]')).catch(() => false)) break;
  await sleep(2000);
}
await sleep(1200);

const workerTargets = () => {
  const out = [];
  for (const t of browser.targets()) {
    const u = t.url() || '';
    if (/WaveWorker/i.test(u)) out.push(u.split('/').pop());
  }
  return out;
};
/** WaveWorker isolate 堆量化（CDP Performance.getMetrics,GC 后读数——worker 域
 *  无 performance.memory（恒 0/缺）,须走 metrics 面——bj318 判例同款） */
const waveWorkerHeapMB = async () => {
  for (const t of browser.targets()) {
    if (!/WaveWorker/i.test(t.url() || '')) continue;
    let s = null;
    try {
      s = await t.createCDPSession();
      await s.send('Performance.enable').catch(() => {});
      await s.send('HeapProfiler.enable').catch(() => {});
      await s.send('HeapProfiler.collectGarbage').catch(() => {});
      const r = await s.send('Performance.getMetrics').catch(() => null);
      const g = (n) => r?.metrics?.find((x) => x.name === n)?.value ?? -1;
      return Math.round(g('JSHeapUsedSize') / 1e6 * 10) / 10;
    } catch { return -1; }
    finally { await s?.detach().catch(() => {}); }
  }
  return -1;
};
const wwStats = () => page.evaluate(async () => {
  const m = await import('/src/render/WaterWaves.ts');
  return m.wwWorkerStats();
});
const waitRunning = async () => {
  for (let i = 0; i < 240; i++) {
    if (await page.evaluate(() => !!(window.__swGame && window.__swGame.world && window.__swGame.running === true && window.__swGame.player)).catch(() => false)) return true;
    await sleep(500);
  }
  return false;
};

const out = { ok: true, errs };

// ---- A. 进世界① ----
await page.evaluate(() => window.__swFlow.newWorld('wwrel' + (Date.now() % 10000), 4200, 1200));
if (!await waitRunning()) { console.log(JSON.stringify({ ok: false, why: 'world1-not-running' })); process.exit(1); }
await sleep(4000);   // 波场 worker 冷启动 + 首场回传窗
// ★MSG-FREQ（2026-10-04）静默窗语义：场处不动点时 posted/fields 停推进是正常态
//  ——活性判据必须先打一发非 camera 注入（恢复逐帧发送）再采样对
const stats1a = await wwStats();
await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/render/WaterWaves.ts');
  m.waterWaves.injectWash(g.player.cx, g.player.cy, 96, 96, 0.5, 0.5, 0.9);
});
await sleep(1500);
const stats1b = await wwStats();
const targets1 = workerTargets();
out.A = {
  workerTargets: targets1.length,
  on: stats1a.on,
  posted: [stats1a.posted, stats1b.posted],
  fields: [stats1a.fields, stats1b.fields],
  falls: stats1b.falls,
  respawns: stats1b.respawns,
};
out.A.waveWorkerHeapMB = await waveWorkerHeapMB();   // terminate 前 worker isolate 堆
out.A.ok = targets1.length >= 1 && stats1b.on === true
  && stats1b.fields > stats1a.fields;   // 注入后新场回传 = worker 链活性

// 波场活性实证：实体洗掠注入后波场格非中性（sampleDisplace 有位移）
const rippleProbe = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/render/WaterWaves.ts');
  // 找水面：从地表往下找第一格液体
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let wy = -1;
  for (let ty = Math.floor(g.player.cy / 16) - 40; ty < st.h - 10; ty++) {
    if (!st.inBounds(px, ty)) continue;
    if (st.liquid[st.idx(px, ty)] > 0) { wy = ty; break; }
  }
  if (wy < 0) return { water: false };
  const before = [0, 0];
  m.waterWaves.sampleDisplace(px * 16 + 8, wy * 16, before);
  // 注入一次强洗掠（玩家位置拍水）→ 30 帧后位移应非零（波前扩散）
  m.waterWaves.injectWash(px * 16 + 8, wy * 16, 96, 96, 0.5, 0.5, 0.9);
  return { water: true, dispBefore: before, on: m.waterWaves.wwActive() };
});
await sleep(1200);
const rippleAfter = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/render/WaterWaves.ts');
  const px = Math.floor(g.player.cx / 16);
  const st = g.world.store;
  let wy = -1;
  for (let ty = Math.floor(g.player.cy / 16) - 40; ty < st.h - 10; ty++) {
    if (!st.inBounds(px, ty)) continue;
    if (st.liquid[st.idx(px, ty)] > 0) { wy = ty; break; }
  }
  const d = [0, 0];
  if (wy >= 0) m.waterWaves.sampleDisplace(px * 16 + 8, wy * 16, d);
  return { disp: d };
});
out.A.ripple = { water: rippleProbe.water, dispBefore: rippleProbe.dispBefore, dispAfter: rippleAfter.disp };

// ---- B. quitToMenu → destroy → release ----
await page.evaluate(() => window.__swFlow.quitToMenu());
for (let i = 0; i < 60; i++) {
  const g = await page.evaluate(() => !!window.__swGame).catch(() => true);
  if (!g) break;
  await sleep(500);
}
await sleep(2500);   // terminate 异步面 + target 表刷新窗
const stats2 = await wwStats();
const targets2 = workerTargets();
out.B = { workerTargetsAfterQuit: targets2.length, on: stats2.on, fields: stats2.fields };
out.B.ok = targets2.length === 0 && stats2.on === false;
// 堆收益面：terminate 后 worker isolate 归零（-1=无 target 即收益全额）
out.B.waveWorkerHeapMBAfter = await waveWorkerHeapMB();

// ---- C. 再进世界（同页、同一模块单例——闩复位实证）----
await page.evaluate(() => window.__swFlow.newWorld('wwrel2' + (Date.now() % 10000), 4200, 1200));
if (!await waitRunning()) { console.log(JSON.stringify({ ok: false, why: 'world2-not-running', out })); process.exit(1); }
await sleep(4000);
const stats3a = await wwStats();
await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/render/WaterWaves.ts');
  m.waterWaves.injectWash(g.player.cx, g.player.cy, 96, 96, 0.5, 0.5, 0.9);
});
await sleep(1500);
const stats3b = await wwStats();
const targets3 = workerTargets();
out.C = {
  workerTargets: targets3.length,
  on: stats3b.on,
  posted: [stats3a.posted, stats3b.posted],
  fields: [stats3a.fields, stats3b.fields],
  // ★反「静默永失」主判据：再进世界后 fields 总量显著超过世界①收场值
  //   （若 _wwSpawned 闩未复位,②永远无 worker → fields 恒停在 B 的收场值）
  fieldsGrewBeyondWorld1: [out.A.fields[1], stats3b.fields],
  falls: stats3b.falls,
  respawns: stats3b.respawns,
};
out.C.ok = targets3.length >= 1 && stats3b.on === true
  && stats3b.fields > stats3a.fields
  && stats3b.fields > out.A.fields[1] + 10;

out.ok = out.A.ok && out.B.ok && out.C.ok && errs.length === 0;
console.log(JSON.stringify(out, null, 1));
process.exit(out.ok ? 0 : 2);
