// ★WASM 第四刀活机探针(2026-10-04):光照 scan 核(exportTo 主循环)AS 化。
//   A1 臂 ?lightworker=1&lightwasm=1  worker scan 核走 WASM(缺省转正态;scanRuns>0 实锤)
//   A0 臂 ?lightworker=1&lightwasm=0  worker 全 JS(对照;scanRuns=0)
// 场景:静置 → 高空下坠(区域跳行最重) → zoom-out 0.5(重区口径) → 雷雨(FlickerClock
//   活跃+case 83 雨branch;disco/demon/mouseTextColor 呼吸恒活跃)。位级归
//   tests/light-wasm.test.ts(node 域逐位);本探针=接通性/回退/性能面。
// 插桩:worker target evaluate 内 import 同一模块图(vite module cache 命中),
//   包 LightingEngine.prototype.processScan/processBlurAndPresent/compute +
//   TileLightScanner.prototype.exportTo,账本挂 globalThis.__swScanProf(探针自装,
//   src 零改动——禁永久插桩)。
// 运行:SW_ORIGIN=http://localhost:5217 node tools/run-diag.mjs --timeout=280000 scripts/_lightwasm-scan-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, teleport, nextFrame, godMode } from '../tools/probe/lib/index.mjs';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5217';
const SHOT_DIR = process.env.SW_SHOT_DIR || '/tmp/lightwasm-scan-shots';
mkdirSync(SHOT_DIR, { recursive: true });
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

/** worker 域:安装插桩(幂等)+ 读账本。包 compute(processScan+processBlurAndPresent
 *  的公共宿主)=worker busy 口径;exportTo=scan 总账(主核+JS 尾段);wasmStats 区分
 *  scanRuns/scanRefusals/blur runs。 */
async function workerEval(page, fn, arg = null) {
  for (const w of page.workers()) {
    if (!w.url().includes('LightWorker')) continue;
    return await w.evaluate(fn, arg).catch((e) => ({ evalErr: String(e).slice(0, 200) }));
  }
  return null;
}

const INSTALL = () => {
  (async () => {
    if (globalThis.__swScanProf) return;
    const LE = await import('/src/lighting/LightingEngine.ts');
    const TS = await import('/src/lighting/TileLightScanner.ts');
    const LM = await import('/src/lighting/LightMap.ts');
    const prof = { compute: 0, computeN: 0, scan: 0, scanN: 0, blur: 0, blurN: 0, present: 0, presentN: 0 };
    globalThis.__swScanProf = prof;
    const wrap = (proto, key, k) => {
      const o = proto[key];
      if (typeof o !== 'function') return;
      proto[key] = function (...a) {
        const t = performance.now();
        const r = o.apply(this, a);
        prof[k] += performance.now() - t;
        prof[k + 'N']++;
        return r;
      };
    };
    wrap(LE.LightingEngine.prototype, 'compute', 'compute');
    wrap(LE.LightingEngine.prototype, 'processScan', 'scan');
    wrap(LE.LightingEngine.prototype, 'processBlurAndPresent', 'blur');
    wrap(TS.TileLightScanner.prototype, 'exportTo', 'exportTo');
    void LM;
  })();
  return 'installing';
};

const READ = async () => {
  const p = globalThis.__swScanProf;
  const avg = (k) => (p && p[k + 'N'] > 0 ? +(p[k] / p[k + 'N']).toFixed(4) : null);
  let wasmStats = null;
  try {
    const m = await import('/src/wasm/lightWasm.ts');
    wasmStats = { ...m.__lightWasmStats, ready: m.lightWasmReady() };
  } catch (e) {
    wasmStats = { err: String(e).slice(0, 80) };
  }
  return {
    prof: p ? {
      computeMs: avg('compute'), computeN: p.computeN,
      scanMs: avg('scan'), scanN: p.scanN,
      exportToMs: avg('exportTo'), exportToN: p.exportToN,
      blurMs: avg('blur'), blurN: p.blurN,
    } : null,
    wasmStats,
    name: (globalThis).name ?? '',
  };
};

/** 阶段:重置账本 → pump N 帧 → 读账本+gate */
async function samplePhase(page, frames, tag) {
  await workerEval(page, () => { const p = globalThis.__swScanProf; if (p) { for (const k of Object.keys(p)) p[k] = 0; } });
  const per = Math.max(1, Math.floor(frames / 4));
  const gateSamples = [];
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < per; k++) await nextFrame(page);
    const d = await page.evaluate(async () => {
      const lg = await import('/src/lighting/LightingEngine.ts');
      const g = window.__swGame;
      const L = g.lighting;
      return { p50: +lg.lightGateDiag.p50Ms.toFixed(2), live: lg.lightGateDiag.live };
    }).catch((e) => ({ err: String(e).slice(0, 120) }));
    gateSamples.push(d);
  }
  const wd = await workerEval(page, READ);
  const p50s = gateSamples.map((s) => s.p50).filter((v) => v > 0).sort((a, b) => a - b);
  const gateP50 = p50s.length ? p50s[p50s.length >> 1] : 0;
  console.log(`  [${tag}] worker=${JSON.stringify(wd?.prof ?? wd)} wasmStats=${JSON.stringify(wd?.wasmStats)} gateP50=${gateP50}`);
  return { wd, gateP50 };
}

const browser = await launchBrowser({});
const pageErrors = [];

async function arm(tag, urlSuffix, { bootOnly = false } = {}) {
  console.log(`\n======== ${tag} 臂(${urlSuffix}) ========`);
  const page = await openPage(browser, { errors: pageErrors });
  await page.goto(ORIGIN + '/?' + urlSuffix + '&pbust=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  let boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) {
    if (bootOnly) { console.log(`  [${tag}] 预热臂 bootstrap=${boot.why}(冷桥牺牲位,不计账)`); await page.close(); return null; }
    chk(`${tag}: bootstrap`, false, boot.why); await page.close(); return null;
  }
  if (bootOnly) { console.log(`  [${tag}] 预热臂 ok(桥已热)`); await page.close(); return null; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  if (!gen.ok) { chk(`${tag}: createGame`, false, gen.why); await page.close(); return null; }
  await godMode(page, true);
  chk(`${tag}: 游戏已建`, true);

  await workerEval(page, INSTALL);
  await nextFrame(page);
  const bootInfo = await workerEval(page, READ);
  console.log(`  [${tag}] worker name=${bootInfo?.name} 插桩=${bootInfo?.prof ? 'ok' : 'MISS'}`);

  // ---- 静置 60 帧 ----
  const idle = await samplePhase(page, 60, tag + ':静置');
  // ---- 下坠 240 帧(区域跳行最重) ----
  const winfo = await page.evaluate(() => {
    const g = window.__swGame;
    return { w: g.world.w, h: g.world.h, surf: g.world.groundLevel ?? 0 };
  });
  await teleport(page, Math.floor(winfo.w / 2) * 16, Math.max(80, (winfo.surf - 70) * 16));
  const fall = await samplePhase(page, 240, tag + ':下坠');
  await page.screenshot({ path: `${SHOT_DIR}/${tag}-fall.png` });
  // ---- zoom-out 0.5,120 帧 ----
  await page.evaluate(() => { window.__swGame.camera.zoom = 0.5; });
  const zoom = await samplePhase(page, 120, tag + ':zoom-out');
  await page.evaluate(() => { window.__swGame.camera.zoom = 1; });
  // ---- 雷雨 120 帧(FlickerClock 活跃+雨;mouseTextColor/disco/demon 呼吸恒活跃) ----
  await page.evaluate(() => {
    const g = window.__swGame;
    if (g.world.weather) { g.world.weather.raining = true; }
  });
  const rain = await samplePhase(page, 120, tag + ':雷雨');
  await page.screenshot({ path: `${SHOT_DIR}/${tag}-rain.png` });

  await page.close();
  return { idle, fall, zoom, rain };
}

try {
  // ★预热臂(探针框架已知 flake:冷臂桥等 >180s 偶发,热身后必过——先跑一次丢弃)
  await arm('WARMUP', 'lightworker=1&lightwasm=1', { bootOnly: true });
  const A1 = await arm('A1', 'lightworker=1&lightwasm=1');
  const A0 = await arm('A0', 'lightworker=1&lightwasm=0');

  console.log('\n======== 对账 ========');
  const get = (r, ph) => (r && r[ph] && r[ph].wd && r[ph].wd.prof) || null;
  const statsOf = (r, ph) => (r && r[ph] && r[ph].wd && r[ph].wd.wasmStats) || null;
  // 接通实锤:A1 scanRuns>0(每帧+1);A0 scanRuns=0
  const a1stats = statsOf(A1, 'idle'), a0stats = statsOf(A0, 'idle');
  chk('A1: worker scan 核 WASM 接通(scanRuns>0)', (a1stats?.scanRuns ?? 0) > 0, JSON.stringify(a1stats));
  chk('A0: 全 JS 态(scanRuns=0)', (a0stats?.scanRuns ?? 0) === 0, JSON.stringify(a0stats));
  chk('A1: scan 拒绝面为 0(容量/几何不拒)', (a1stats?.scanRefusals ?? 0) === 0, JSON.stringify(a1stats));
  const row = (tag, ph) => {
    const p1 = get(A1, ph), p0 = get(A0, ph);
    console.log(`  ${tag}: A1 exportTo=${p1?.exportToMs}ms blur=${p1?.blurMs}ms busy(compute)=${p1?.computeMs}ms | A0 exportTo=${p0?.exportToMs}ms blur=${p0?.blurMs}ms busy=${p0?.computeMs}ms`);
    return { p1, p0 };
  };
  const idleRow = row('静置', 'idle');
  const fallRow = row('下坠', 'fall');
  const zoomRow = row('zoom-out', 'zoom');
  const rainRow = row('雷雨', 'rain');
  if (idleRow.p1 && idleRow.p0) {
    chk('静置: exportTo 改善(WASM≤JS)', idleRow.p1.exportToMs <= idleRow.p0.exportToMs,
      `A1=${idleRow.p1.exportToMs} A0=${idleRow.p0.exportToMs}`);
  }
  if (fallRow.p1 && fallRow.p0) {
    chk('下坠: exportTo 改善', fallRow.p1.exportToMs <= fallRow.p0.exportToMs,
      `A1=${fallRow.p1.exportToMs} A0=${fallRow.p0.exportToMs}`);
  }
  if (zoomRow.p1 && zoomRow.p0) {
    chk('zoom-out: exportTo 改善', zoomRow.p1.exportToMs <= zoomRow.p0.exportToMs,
      `A1=${zoomRow.p1.exportToMs} A0=${zoomRow.p0.exportToMs}`);
  }
  if (rainRow.p1 && rainRow.p0) {
    chk('雷雨: exportTo 改善', rainRow.p1.exportToMs <= rainRow.p0.exportToMs,
      `A1=${rainRow.p1.exportToMs} A0=${rainRow.p0.exportToMs}`);
  }
  chk('全程零页面错误', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));
  console.log('\n页面错误账:', pageErrors.length, JSON.stringify(pageErrors.slice(0, 6)));
} finally {
  await browser.close();
}
const fails = results.filter((r) => !r.ok).length;
console.log(`\n[lightwasm-scan-probe] 台账: ${results.length - fails}/${results.length} PASS`);
process.exit(fails === 0 ? 0 : 2);
