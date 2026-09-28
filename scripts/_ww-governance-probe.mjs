// ★看门狗治理验收探针（2026-09-28;一次性诊断,_ 前缀经 run-diag 运行）:
//   A. 基线:light/wave worker 活跃,零回落;
//   B. Windows 画像模拟:主线程 200ms 级重任务注入 8s（231ms 帧画像）→
//      worker 全程活（falls=0,results/fields 持续增长）=「主线程忙不算 worker 死」;
//   C. 真杀实测:手动 terminate 双 worker → outstanding-aware 看门狗定谳回落（falls+指纹）
//      → 阶梯重生（respawns+1）→ worker 模式恢复 =「去永久化」;
//   D. F5 驾驶舱扩展样例 JSON（fallsBy 三分类 + respawns）。
// 用法:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs --timeout=300000 scripts/_ww-governance-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, nextFrame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});

const page = await openPage(browser, {});
const warns = [];
page.on('console', (m) => {
  const t = m.text?.() ?? '';
  if (/WaveWaves|LightWorker|看门狗|worker error|pageerror/i.test(t) || m.type?.() === 'error') warns.push(`[${m.type?.()}]` + t.slice(0, 140));
});
page.on('pageerror', (e) => warns.push('[pageerror]' + String(e?.message ?? e).slice(0, 140)));

console.error('stage: bootstrap');
// ★注意:不做手动预 goto——同页二次导航会让桥不就绪（本仓探针环境实测,见交付报告）;
//   bootstrap 自带 gotoApp→cleanStorage→gotoApp→waitForBridge 全链,直接调用即可。
let boot = await bootstrap(page, ORIGIN);
if (!boot.ok) boot = await bootstrap(page, ORIGIN);
if (!boot.ok) { console.log('bootstrap FAIL:', boot.why); process.exit(1); }
console.error('stage: createGame');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
if (!gen.ok) { console.log('createGame FAIL:', gen.why); process.exit(1); }

const pump = async (n) => { for (let i = 0; i < n; i++) await nextFrame(page); };
const readStats = () => page.evaluate(async () => {
  const lw = await import('/src/lighting/LightWorkerLink.ts');
  const ww = await import('/src/render/WaterWaves.ts');
  const ge = await import('/src/lighting/LightingEngine.ts');
  return {
    light: lw.lightWorkerStats(),
    lightLive: ge.lightGateDiag.live,
    wave: ww.wwWorkerStats(),
  };
}).catch((e) => ({ evalErr: String(e).slice(0, 160) }));

console.error('stage: warm');
await pump(60);
const base = await readStats();
console.log('[A 基线]', JSON.stringify(base));

// ---- B. Windows 画像模拟（主线程 200ms 级重任务链 8s）----
console.error('stage: busy-load');
await page.evaluate(() => {
  globalThis.__swBusyStart = performance.now();
  globalThis.__swBusy = true;
  (function spin() {
    if (performance.now() - globalThis.__swBusyStart > 8000) { globalThis.__swBusy = null; return; }
    const t0 = performance.now();
    while (performance.now() - t0 < 200) { if (Math.random() < 1e-9) Math.sqrt(t0); }
    setTimeout(spin, 30);
  })();
});
for (let i = 0; i < 14; i++) { await pump(20); const mid = await readStats(); if (i === 6) console.log('[B 中段]', JSON.stringify(mid)); }
await page.waitForFunction(() => globalThis.__swBusy === null, { timeout: 30000 }).catch(() => {});
const afterLoad = await readStats();
console.log('[B 重负载后]', JSON.stringify(afterLoad));

// ---- C. 真杀实测（terminate → 定谳 → 阶梯重生 → 恢复）----
console.error('stage: light kill');
await page.evaluate(() => {
  const g = window.__swGame;
  try { g.lighting._lw.worker.terminate(); globalThis.__swKillLight = 'ok'; } catch (e) { globalThis.__swKillLight = String(e); }
});
let c1 = null;
for (let i = 0; i < 30; i++) {          // 30×30 帧 ≈ 33s 上限
  await pump(30);
  const s = await readStats();
  if (s.light?.respawns >= 1 && s.light?.results > 0 && s.lightLive) { c1 = s; break; }
}
console.log('[C 光照重生]', JSON.stringify(c1 ?? 'TIMEOUT'));

console.error('stage: wave kill');
await page.evaluate(async () => {
  const ww = await import('/src/render/WaterWaves.ts');
  try { ww.waterWaves._ww.terminate(); globalThis.__swKillWave = 'ok'; } catch (e) { globalThis.__swKillWave = String(e); }
});
let c2 = null;
for (let i = 0; i < 30; i++) {
  await pump(30);
  const s = await readStats();
  if (s.wave?.respawns >= 1 && s.wave?.on) { c2 = s; break; }
}
await pump(60);                          // shadow→切主:再看 fields 增长
const c2b = await readStats();
console.log('[C 波场重生]', JSON.stringify({ c2, c2b }));

// ---- D. F5 驾驶舱扩展样例 ----
const sample = await readStats();
console.log('[D F5 样例]', JSON.stringify({
  debugReport_lightWorker: { falls: sample.light.falls, fallsBy: sample.light.fallsBy, respawns: sample.light.respawns, posted: sample.light.posted, results: sample.light.results },
  debugReport_waveWorker: { falls: sample.wave.falls, fallsBy: sample.wave.fallsBy, respawns: sample.wave.respawns, posted: sample.wave.posted, fields: sample.wave.fields, on: sample.wave.on },
}, null, 1));

console.log('[warns]', JSON.stringify(warns.slice(0, 14)));
await page.close();
await browser.close();
process.exit(0);
