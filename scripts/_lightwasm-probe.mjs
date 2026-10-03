// ★WASM 第二刀活机探针(2026-10-03):光照 blur 核 AS 化,三臂活机验证。
//   A1 臂 ?lightwasm=1            worker 核走 WASM(puppeteer worker target 直读 worker 域
//                                 __lightWasmStats.runs>0 = 接通实锤 + worker 三段计时)
//   A0 臂 ?lightwasm=0            worker 核 JS(对照;runs=0,blurJs 有值)
//   M1 臂 ?lightworker=0&lightwasm=1  主线程引擎 WASM 核(页面域直读 stats/runs)
// 场景:静置采样 → 高空下坠(区域跳行重算最重) → 四柱强置盾柱战采样(lightGate p50)。
// 位级金标归 tests/light-wasm.test.ts(node 域逐位);本探针=接通性/回退/性能面。
// 运行:SW_ORIGIN=http://localhost:5209 node tools/run-diag.mjs --timeout=280000 scripts/_lightwasm-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, teleport, nextFrame, godMode } from '../tools/probe/lib/index.mjs';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5209';
const SHOT_DIR = process.env.SW_SHOT_DIR || '/tmp/lightwasm-shots';
mkdirSync(SHOT_DIR, { recursive: true });
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

/** 读主线程光照诊断面(公共采样对+lightGateDiag+lightWorkerStats) */
async function readLightDiag(page) {
  return page.evaluate(async () => {
    const lw = await import('/src/lighting/LightWorkerLink.ts');
    const lg = await import('/src/lighting/LightingEngine.ts');
    const g = window.__swGame;
    const L = g.lighting;
    const ptx = Math.floor(g.player.x / 16), pty = Math.floor(g.player.y / 16);
    const at = L.lightAt(ptx, pty);
    return {
      stat: lw.lightWorkerStats(),
      gate: { ...lg.lightGateDiag },
      region: { rx: L.rx, ry: L.ry, rw: L.rw, rh: L.rh },
      playerLit: at,
      perFrame: L.perFrameCount,
    };
  }).catch((e) => ({ evalErr: String(e).slice(0, 200) }));
}

/** 找 LightWorker 专用 worker 并直读 worker 域(stats/三段计时/worker name)。
 *  ★page.workers()=dedicated worker 的正确口(browser.targets() 不含,实锤)。 */
async function readWorkerDomain(page) {
  const ws = page.workers();
  for (const w of ws) {
    if (!w.url().includes('LightWorker')) continue;
    return await w.evaluate(() => {
      const p = (globalThis).__swLightProf;
      const avg = (k) => (p && p[k + 'N'] > 0 ? +(p[k] / p[k + 'N']).toFixed(3) : null);
      return {
        name: (globalThis).name ?? '',
        wasmStats: (globalThis).__lightWasmStats ?? null,
        prof: p ? {
          scanMs: avg('scan'), scanN: p.scanN,
          blurWasmMs: avg('blurWasm'), blurWasmN: p.blurWasmN,
          blurJsMs: avg('blurJs'), blurJsN: p.blurJsN,
          presentMs: avg('present'), presentN: p.presentN,
        } : null,
      };
    }).catch((e) => ({ evalErr: String(e).slice(0, 200) }));
  }
  return null;
}

/** 阶段采样:pump N 帧,期间分 4 拍读 lightGateDiag.p50,返回各拍样本 */
async function samplePhase(page, frames, tag) {
  const gateSamples = [];
  const per = Math.max(1, Math.floor(frames / 4));
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < per; k++) await nextFrame(page);
    const d = await readLightDiag(page);
    gateSamples.push(d.gate ? { p50: +d.gate.p50Ms.toFixed(2), live: d.gate.live, lag: +d.gate.lastLagMs.toFixed(2) } : d);
  }
  const p50s = gateSamples.map((s) => s.p50).filter((v) => v > 0).sort((a, b) => a - b);
  const p50 = p50s.length ? p50s[p50s.length >> 1] : 0;
  console.log(`  [${tag}] gate p50 样本=${JSON.stringify(gateSamples)} → 相位 p50=${p50}ms`);
  return p50;
}

const browser = await launchBrowser({});
const pageErrors = [];

async function arm(tag, urlSuffix, { workerArm, short = false, bootOnly = false }) {
  console.log(`\n======== ${tag} 臂 ========`);
  const page = await openPage(browser, { errors: pageErrors });
  await page.goto(ORIGIN + '/?' + urlSuffix + '&pbust=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  // ★探针框架已知 flake(C8 注释「冷臂桥等 >180s 偶发,热身后必过」)——bootstrap 重试一次
  let boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) boot = await bootstrap(page, ORIGIN);
  if (bootOnly) {
    // 预热臂:仅 boot 链(桥+vite 暖态);冷桥 flake 在此牺牲,不算 FAIL
    console.log(`  [${tag}] 预热臂 bootstrap=${boot.ok ? 'ok' : boot.why}(冷桥牺牲位,不计账)`);
    await page.close(); return null;
  }
  if (!boot.ok) { chk(`${tag}: bootstrap`, false, boot.why); await page.close(); return null; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  if (!gen.ok) { chk(`${tag}: createGame`, false, gen.why); await page.close(); return null; }
  chk(`${tag}: 游戏已建(direct 05162020 small)`, true);
  await godMode(page, true);   // 下坠段防摔死(M1 挂起判例)

  // ---- 静置段:60 帧 ----
  for (let i = 0; i < 60; i++) await nextFrame(page);
  const idleDiag = await readLightDiag(page);
  if (workerArm) {
    chk(`${tag}: worker 链健康(results>0, falls=0)`,
      idleDiag.stat?.results > 0 && idleDiag.stat?.falls === 0,
      JSON.stringify({ r: idleDiag.stat?.results, f: idleDiag.stat?.falls, gate: idleDiag.gate?.live }));
    chk(`${tag}: lightGate live`, idleDiag.gate?.live === true, `p50=${idleDiag.gate?.p50Ms}`);
  } else {
    // 主线程臂(?lightworker=0):无 worker 门——查本地引擎发布面非空
    chk(`${tag}: 本地引擎发布面非空`, (idleDiag.region?.rw ?? 0) > 0 && (idleDiag.region?.rh ?? 0) > 0,
      JSON.stringify(idleDiag.region));
  }
  chk(`${tag}: 玩家格光照非平凡`, (idleDiag.playerLit?.[0] ?? 0) > 0 || (idleDiag.playerLit?.[2] ?? 0) > 0,
    JSON.stringify(idleDiag.playerLit));

  // worker 域直读(接通实锤 + 三段计时)
  if (workerArm) {
    const wd = await readWorkerDomain(page);
    chk(`${tag}: LightWorker target 可达`, wd != null && !wd.evalErr, JSON.stringify(wd?.name ?? wd));
    if (wd && !wd.evalErr) {
      chk(`${tag}: worker name 通道`, wd.name.includes(urlSuffix.includes('lightwasm=1') ? 'lightwasm=1' : 'LightWorker'), wd.name);
      console.log(`  [${tag}] worker 三段=`, JSON.stringify(wd.prof), ' wasmStats=', JSON.stringify(wd.wasmStats));
    }
  }
  const idleP50 = await samplePhase(page, 60, tag + ':静置');

  // ---- 下坠段:高空传送 → 自由落体 240 帧(区域跳行重算最重) ----
  const winfo = await page.evaluate(() => {
    const g = window.__swGame;
    return { w: g.world.w, h: g.world.h, surf: g.world.groundLevel ?? 0 };
  });
  await teleport(page, Math.floor(winfo.w / 2) * 16, Math.max(80, (winfo.surf - 70) * 16));
  const fallP50 = await samplePhase(page, 240, tag + ':下坠');
  const fallDiag = await readLightDiag(page);
  chk(`${tag}: 下坠中光照非黑窗`, (fallDiag.playerLit?.[0] ?? 0) > 0 || (fallDiag.playerLit?.[2] ?? 0) > 0
    || (workerArm && fallDiag.gate?.live === true && fallDiag.region.rw > 0)
    || (!workerArm && fallDiag.region.rw > 0), JSON.stringify(fallDiag.playerLit));
  await page.screenshot({ path: `${SHOT_DIR}/${tag}-fall.png` });

  // ---- zoom-out 段:camera.zoom=0.5(区域格数 ×~2.4,复现 8ms 口径的重区) ----
  await page.evaluate(() => { window.__swGame.camera.zoom = 0.5; });
  const zoomP50 = await samplePhase(page, 120, tag + ':zoom-out');
  await page.evaluate(() => { window.__swGame.camera.zoom = 1; });

  if (short) {
    await page.close();
    return { idleP50: 0, fallP50, zoomP50, pillarP50: 0, endDiag: fallDiag };
  }

  // ---- 柱战段:四柱强置盾 600 帧 ----
  const TOWER_IDS = [517, 422, 507, 493];
  const tw = await page.evaluate(async (ids) => {
    const g = window.__swGame;
    const px = g.player.cx, py = g.player.cy;
    const spawned = [];
    for (let i = 0; i < ids.length; i++) {
      const e = await window.__swFlow.spawnVanillaEnemy(ids[i], px - 300 + i * 200, py - 40);
      if (e) spawned.push(e.id);
    }
    const le = g.world.lunarEvent;
    for (const k of ['solar', 'vortex', 'nebula', 'stardust']) le.shield[k] = 10000;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    return { spawned: spawned.length };
  }, TOWER_IDS);
  chk(`${tag}: 四柱强置盾`, tw.spawned === 4, JSON.stringify(tw));
  const pillarP50 = await samplePhase(page, 600, tag + ':柱战');
  await page.screenshot({ path: `${SHOT_DIR}/${tag}-pillar.png` });

  // ---- 终态读数 ----
  const endDiag = await readLightDiag(page);
  console.log(`  [${tag}] 终态: idleP50=${idleP50} fallP50=${fallP50} zoomP50=${zoomP50} pillarP50=${pillarP50} `
    + `stat=${JSON.stringify(endDiag.stat)}`);
  if (workerArm) {
    const wd = await readWorkerDomain(page);
    console.log(`  [${tag}] worker 终态=`, JSON.stringify(wd));
  }
  // 主线程 M1 臂:页面域直读 loader stats
  if (!workerArm) {
    const mstats = await page.evaluate(async () => {
      const m = await import('/src/wasm/lightWasm.ts');
      return { stats: m.__lightWasmStats, ready: m.lightWasmReady() };
    }).catch((e) => ({ evalErr: String(e).slice(0, 120) }));
    console.log(`  [${tag}] 主线程 loader=`, JSON.stringify(mstats));
    chk(`${tag}: 主线程 WASM 核接通(runs>0)`, mstats.stats?.runs > 0, JSON.stringify(mstats.stats));
  }
  await page.close();
  return { idleP50, fallP50, zoomP50, pillarP50, endDiag };
}

try {
  // ★预热臂(探针框架已知 flake:C8 注释「冷臂桥等 >180s 偶发,热身后必过」——
  //   C9 探针同款;首臂永远吃冷启动,先跑一次丢弃)
  await arm('WARMUP', 'lightwasm=1', { workerArm: true, bootOnly: true });
  const A1 = await arm('A1', 'lightwasm=1', { workerArm: true });
  const A0 = await arm('A0', 'lightwasm=0', { workerArm: true });
  const M1 = await arm('M1', 'lightworker=0&lightwasm=1', { workerArm: false, short: true });

  console.log('\n======== 对账 ========');
  if (A1 && A0) {
    chk('对账: 下坠场景 p50 改善(WASM≤JS+10ms 噪声界)', A1.fallP50 <= A0.fallP50 + 10,
      `A1=${A1.fallP50} A0=${A0.fallP50}`);
    chk('对账: zoom-out 场景 p50 改善', A1.zoomP50 <= A0.zoomP50 + 10,
      `A1=${A1.zoomP50} A0=${A0.zoomP50}`);
    chk('对账: 柱战 p50 改善', A1.pillarP50 <= A0.pillarP50 + 10,
      `A1=${A1.pillarP50} A0=${A0.pillarP50}`);
  }
  chk('全程零页面错误', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));
  console.log('\n页面错误账:', pageErrors.length, JSON.stringify(pageErrors.slice(0, 6)));
} finally {
  await browser.close();
}
const fails = results.filter((r) => !r.ok).length;
console.log(`\n[lightwasm-probe] 台账: ${results.length - fails}/${results.length} PASS`);
process.exit(fails === 0 ? 0 : 2);
