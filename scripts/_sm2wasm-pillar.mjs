// ★SM2 WASM 试点活机探针(2026-10-03;k2-pillar-ab 同款四柱强置盾场景)。
// A 臂:?sm2wasm=1&ffgl=0(强置 2D 产物链,SM2 冷跑真身)→ wasmRuns 增量>0、
//   2 分钟柱战零页面错误+帧面+截图;产物级 WASM vs JS 引擎逐像素闸(真 Perlin 现场复核)。
// B 臂:缺省旗(回退路径)→ wasmRuns 增量===0 且 sm2Runs 照常增(回退零变化)+截图。
// 运行:SW_ORIGIN=http://localhost:5205 node tools/run-diag.mjs --timeout=280000 scripts/_sm2wasm-pillar.mjs
import { launchBrowser, openPage, bootstrap, waitForBridge, createGame, sleep } from '../tools/probe/lib/index.mjs';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5205';
const SHOT_DIR = process.env.SW_SHOT_DIR || '/tmp/sm2wasm-shots';
mkdirSync(SHOT_DIR, { recursive: true });
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const TOWER_IDS = [517, 422, 507, 493];   // Solar/Vortex/Nebula/Stardust(LunarEvent.ts)

async function setupTowers(page) {
  return page.evaluate(async (ids) => {
    const g = window.__swGame;
    if (!g?.world) return { ok: false, why: 'no game' };
    const px = g.player.cx, py = g.player.cy;
    const spawned = [];
    for (let i = 0; i < ids.length; i++) {
      const e = await window.__swFlow.spawnVanillaEnemy(ids[i], px - 300 + i * 200, py - 40);
      if (e) spawned.push(e.id);
    }
    const le = g.world.lunarEvent;
    for (const k of ['solar', 'vortex', 'nebula', 'stardust']) le.shield[k] = 10000;
    // 相机贴玩家+帧自耗包裹(k2-pillar-ab 同款)
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    if (!g.__origFrame) {
      const st = { durs: [], n: 0 };
      g.__origFrame = g.frame;
      g.frame = function (...a) {
        const t0 = performance.now();
        const r = g.__origFrame.apply(this, a);
        st.durs.push(performance.now() - t0); st.n++;
        return r;
      };
      window.__frameSt = st;
    }
    return { ok: true, spawned: spawned.length, px, py };
  }, TOWER_IDS);
}

async function readStats(page) {
  return page.evaluate(async () => {
    const m = await import('/src/fx/ForceFieldBubble.ts');   // 与游戏同实例(vite 模块缓存)
    const s = m.__forceFieldBubbleStats;
    return { sm2Runs: s.sm2Runs, wasmRuns: s.wasmRuns, cacheHits: s.cacheHits, glEmits: s.glEmits, glFails: s.glFails };
  });
}

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });

// ================= A 臂:?sm2wasm=1&ffgl=0 =================
await bootstrap(page, ORIGIN);
await page.goto(ORIGIN + '/?sm2wasm=1&ffgl=0&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
await waitForBridge(page, { timeout: 120_000 });
const gA = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
chk('A臂:游戏已建(direct 05162020 small)', gA.ok === true, JSON.stringify(gA).slice(0, 120));

const boot = await setupTowers(page);
chk('A臂:四柱强置盾成功(2D 产物链)', boot.ok === true && boot.spawned === 4, JSON.stringify(boot).slice(0, 160));

// 产物级现场复核:真 Perlin 上 WASM vs JS 引擎逐像素(活机页面环境)
const liveGate = await page.evaluate(async () => {
  const smMod = await import('/src/fx/SM2Effect.ts');
  const wMod = await import('/src/wasm/sm2Wasm.ts');
  await wMod.ensureSm2Wasm();
  const W = 128, H = 128;
  const img = new Image();
  img.src = 'sprites/vanilla/Misc_Perlin.png';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('perlin fail')); });
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, W, H);
  const perlin = cx.getImageData(0, 0, W, H);
  const pass = smMod.getPass('ForceField');
  const mkU = (t, c) => { const u = smMod.defaultUniforms(); u.uTime = t; u.uColor = c; u.uSourceRect = [0, 0, W, H]; u.uImageSize0 = [W, H]; return u; };
  let maxd = 0;
  for (const t of [0, 0.2, 3.4, 13.7, 3600.2]) {
    for (const c of [[1, 1, 1], [2, 2, 2]]) {
      const a = new Uint8ClampedArray(perlin.data);
      smMod.runPassOnImageData(pass, a, W, H, mkU(t, c));
      const b = new Uint8ClampedArray(perlin.data);
      wMod.wasmRunPassOnImageData(pass, b, W, H, mkU(t, c));
      for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > maxd) maxd = d; }
    }
  }
  return { maxd, flagOn: wMod.sm2WasmEnabled(), ready: wMod.sm2WasmReady() };
});
chk('A臂:活机产物闸 WASM vs JS 引擎 maxd≤2/255', liveGate.maxd <= 2, `maxd=${liveGate.maxd} flagOn=${liveGate.flagOn} ready=${liveGate.ready}`);

// 计数快照→ 泡 2 分钟(真 rAF 实时)→ 计数增量+帧面+截图
const a0 = await readStats(page);
const SOAK_MS = 120_000;
await sleep(SOAK_MS);
const a1 = await readStats(page);
const aFrame = await page.evaluate(() => {
  const st = window.__frameSt;
  const s = st ? [...st.durs] : [];
  s.sort((a, b) => a - b);
  const mean = s.length ? s.reduce((p, x) => p + x, 0) / s.length : 0;
  return { frames: s.length, mean, p50: s.length ? s[Math.floor(s.length / 2)] : 0, p95: s.length ? s[Math.floor(s.length * 0.95)] : 0, max: s.length ? s[s.length - 1] : 0 };
});
chk('A臂:wasmRuns 增量>0(产物真走 WASM)', a1.wasmRuns - a0.wasmRuns > 0,
  `wasmRuns ${a0.wasmRuns}→${a1.wasmRuns}(Δ${a1.wasmRuns - a0.wasmRuns}) sm2Runs Δ${a1.sm2Runs - a0.sm2Runs} cacheHits Δ${a1.cacheHits - a0.cacheHits}`);
chk('A臂:2 分钟柱战帧面(>3000 帧,p95<100ms,零页错主判据)', aFrame.frames > 3000 && aFrame.p95 < 100,
  `frames=${aFrame.frames} mean=${aFrame.mean.toFixed(2)}ms p50=${aFrame.p50.toFixed(2)} p95=${aFrame.p95.toFixed(2)} max=${aFrame.max.toFixed(2)}`);
await page.screenshot({ path: SHOT_DIR + '/pillar-sm2wasm-on-120s.png' });
console.log(`[shot] ${SHOT_DIR}/pillar-sm2wasm-on-120s.png`);

// ================= B 臂:缺省旗(回退路径零变化) =================
// ★新开页面:A 臂世界存活时 BJ280 UnloadGuard 的 beforeunload 会挂起同页导航。
const pageB = await openPage(browser, {});
const pageErrorsB = [];
pageB.on('pageerror', (e) => pageErrorsB.push('PAGEERROR(B): ' + e.message));
pageB.on('console', (m) => { if (m.type() === 'error') pageErrorsB.push('CONSOLE.error(B): ' + m.text()); });
await bootstrap(pageB, ORIGIN);
await pageB.goto(ORIGIN + '/?ffgl=0&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
await waitForBridge(pageB, { timeout: 120_000 });
const gB = await createGame(pageB, { mode: 'direct', seed: '05162020', size: 'small' });
chk('B臂:游戏已建(direct 05162020 small)', gB.ok === true, JSON.stringify(gB).slice(0, 120));
const bootB = await setupTowers(pageB);
chk('B臂:四柱强置盾成功(缺省旗回退链)', bootB.ok === true && bootB.spawned === 4, JSON.stringify(bootB).slice(0, 160));
const b0 = await readStats(pageB);
await sleep(30_000);
const b1 = await readStats(pageB);
const bGate = await pageB.evaluate(async () => {
  const wMod = await import('/src/wasm/sm2Wasm.ts');
  return { flagOn: wMod.sm2WasmEnabled() };   // 缺省:import 期快照+现读皆无旗
});
chk('B臂:缺省旗 sm2WasmEnabled()=false', bGate.flagOn === false, JSON.stringify(bGate));
chk('B臂:回退路径零变化(wasmRuns 增量=0,sm2Runs 照常冷跑)', b1.wasmRuns - b0.wasmRuns === 0 && b1.sm2Runs - b0.sm2Runs > 0,
  `wasmRuns Δ${b1.wasmRuns - b0.wasmRuns} sm2Runs Δ${b1.sm2Runs - b0.sm2Runs} cacheHits Δ${b1.cacheHits - b0.cacheHits}`);
await pageB.screenshot({ path: SHOT_DIR + '/pillar-default-30s.png' });
console.log(`[shot] ${SHOT_DIR}/pillar-default-30s.png`);

chk('全程页面零错误(A+B 臂)', pageErrors.length === 0 && pageErrorsB.length === 0,
  (pageErrors.concat(pageErrorsB)).slice(0, 3).join(' | '));

const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
