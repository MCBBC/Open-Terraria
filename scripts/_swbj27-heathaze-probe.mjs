// SW-BJ27 2026-09-07 视觉探针：沙漠高温热扭曲（HeatDistortion 沙漠支）。
// 判据三态：① 沙漠白天 → scene.zoneDesert && heatActive && heatVisible（强度≈2）
//          ② 沙漠深夜 → heatActive 仍在、强度弱（num9=天空亮度,原版无硬昼夜门）
//          ③ 非沙漠白天 → heatActive=false
// 视觉佐证：视平线带时域差分（扭曲=场景边缘逐帧摆动）沙漠白天 > 非沙漠对照。
// 世界来源：__swFlow.createWorldProbe()（真实创建流,seed 424242 小世界）——
// 注：__swLoadJson 的 json 腿在 worker saveParse 里已死（worldGen.worker.ts:154
// 只读 kvGetIdb(req.key),注释所称"json=小档/调试"三源仅剩 key 一源,探针桥债登记）。
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[sw-diag]') || t.includes('[load]') || t.toLowerCase().includes('error') || t.includes('worker')) {
    console.log('PAGE:', t.slice(0, 260));
  }
});
console.log('[step] goto');
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5214', { waitUntil: 'domcontentloaded', timeout: 60000 });
// ★不走 sp/vsel 点击（无角色状态下进创建流会在 afterWorldLoad/waterCheck 崩——
//   genprogress-smoke 同款直呼 createWorldProbe）
console.log('[step] wait __swFlow');
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld, { timeout: 180000 });
console.log('[step] create world via __swFlow.createWorldProbe');
const res = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (s) => console.log('[sw-diag]', s);
  await wait(400);
  const flow = window.__swFlow;
  if (!flow?.createWorldProbe) return { fail: 'no __swFlow.createWorldProbe' };
  log('calling createWorldProbe');
  const genP = flow.createWorldProbe().catch((e) => { log('create threw: ' + String(e).slice(0, 200)); throw e; });
  for (let i = 0; i < 360 && !(window.__swGame?.world); i++) {
    await Promise.race([genP, wait(1000)]);
  }
  log('poll done, world=' + !!window.__swGame?.world);
  if (!window.__swGame?.world) return { fail: 'world not ready after createWorldProbe' };
  log('world ready');
  await wait(2000);
  return { ok: true };
});
if (!res.ok) { console.log(JSON.stringify(res)); await browser.close(); process.exit(1); }

// ---------- 页内主测 ----------
const out = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const st = g.world.store;
  // 内部沙 id 集（vanilla SceneMetrics.cs:620 SandTileCount 的 12 个 sheet）
  const { TILE_DEFS } = await import('/src/data/tiles.ts?t=' + Date.now());
  const SAND_SHEETS = new Set([53, 112, 116, 234, 397, 398, 402, 399, 396, 400, 403, 401]);
  const sandIds = new Set();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const sh = TILE_DEFS[i]?.vanilla?.sheet;
    if (sh !== undefined && SAND_SHEETS.has(sh)) sandIds.add(i);
  }
  const surf = g.world.groundLevel;
  // 粗扫找沙漠：60×16 bin 计沙,找近地表（surf±60）bin 沙量最大且 ≥3000 的簇
  const BW = 60, BH = 16;
  const bins = [];
  for (let bx = 0; bx + BW <= st.w; bx += BW) {
    let c = 0;
    const y0 = Math.max(0, Math.floor(surf) - 60), y1 = Math.min(st.h, Math.floor(surf) + 40);
    for (let y = y0; y < y1; y++) {
      const row = y * st.w;
      for (let x = bx; x < bx + BW; x++) if (sandIds.has(st.type[row + x]) && st.flags[row + x]) c++;
    }
    bins.push({ bx, c });
  }
  // 平滑：连续 3 bin 窗口总沙 ≥ 6000 → 取中心
  let best = null;
  for (let i = 0; i + 2 < bins.length; i++) {
    const s = bins[i].c + bins[i + 1].c + bins[i + 2].c;
    if (s >= 6000 && (!best || s > best.s)) best = { s, x: bins[i + 1].bx + BW / 2 };
  }
  if (!best) {
    // 兜底：无天然沙漠 → 在近地表铺一段 240×50 沙（store 直写;scene 扫描直接吃 store,
    // 渲染 chunk 缓存可能滞后——本探针判据吃 scene/滤镜态,不受影响）
    const topBin = bins.slice().sort((a, b) => b.c - a.c)[0];
    const cx = Math.max(120, Math.min(st.w - 120, topBin ? topBin.bx + 30 : Math.floor(st.w / 2)));
    const sandId = [...sandIds][0];
    const yA = Math.max(1, Math.floor(surf) - 6), yB = Math.min(st.h - 1, Math.floor(surf) + 44);
    for (let y = yA; y < yB; y++) {
      for (let x = cx - 120; x < cx + 120; x++) {
        const i = y * st.w + x;
        st.type[i] = sandId;
        st.flags[i] |= 1;
      }
    }
    best = { s: -1, x: cx };
  }
  const desertX = Math.round(best.x);
  // 找该列地表行（自 surf-30 向下第一个实心）
  const groundRow = (x) => {
    for (let y = Math.max(1, Math.floor(surf) - 30); y < Math.min(st.h - 1, surf + 60); y++) {
      const i = y * st.w + x;
      if (st.flags[i] && st.type[i] !== 0) return y;
    }
    return -1;
  };
  const cv = [...document.querySelectorAll('#game-root canvas, body > canvas')]
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const scratch = document.createElement('canvas');
  const grab = (x, y, w, h) => {
    scratch.width = w; scratch.height = h;
    const sc = scratch.getContext('2d', { willReadFrequently: true });
    sc.drawImage(cv, x, y, w, h, 0, 0, w, h);
    return sc.getImageData(0, 0, w, h).data;
  };
  const meanAbsDiff = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i += 4) {
      s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    }
    return s / (a.length / 4 * 3);
  };
  const clearWeather = () => {
    const w = g.world.weather;
    w.cloudAlpha = 0; w.raining = false;
    if (w.sandstorm) { w.sandstorm.happening = false; w.sandstorm.severity = 0; }
  };
  const setTime = (tod) => { g.world.clock.timeOfDay = tod; };
  const teleport = (tx) => {
    const gy = groundRow(tx);
    g.player.x = tx * 16 - g.player.w / 2;
    g.player.y = (gy - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    for (let i = 0; i < 40; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  };
  const horizonDiff = async (pairs = 3, gapMs = 250) => {
    await wait(60);
    const W = 500, H = 160;
    const x0 = Math.floor(cv.width / 2 - W / 2), y0 = Math.floor(cv.height / 2 - H / 2);
    let s = 0;
    for (let p = 0; p < pairs; p++) {
      const a = grab(x0, y0, W, H);
      await wait(gapMs);
      const b = grab(x0, y0, W, H);
      s += meanAbsDiff(a, b);
    }
    return s / pairs;
  };
  const shot = () => cv.toDataURL('image/png');
  const state = () => {
    const mf = g.renderer.monoFilters;
    return {
      zoneDesert: !!g.scene?.zoneDesert, zoneRain: !!g.scene?.zoneRain,
      zoneSandstorm: !!g.scene?.zoneSandstorm, tileY: g.scene?.tileY,
      groundLevel: g.world.groundLevel,
      heatActive: mf.heatActive, heatIntensity: +mf.heatIntensity.toFixed(4),
      heatOpacity: +mf.heatOpacity.toFixed(3), heatVisible: mf.heatVisible,
      timeOfDay: +g.world.clock.timeOfDay.toFixed(3),
      isDay: g.world.clock.isDay,
      cloudAlpha: g.world.weather.cloudAlpha,
    };
  };
  const shots = {};
  // ---- ① 沙漠白天 ----
  clearWeather(); setTime(0.5);
  teleport(desertX);
  await wait(1800);   // scene 扫描 + 1/s 斜坡到满
  const day = state(); day.horizonDiff = +((await horizonDiff()).toFixed(3));
  shots.desertDay = shot();
  // ---- ② 沙漠深夜 ----
  setTime(0.02);      // 午夜过一点,isDay=false
  await wait(1200);
  const night = state(); night.horizonDiff = +((await horizonDiff()).toFixed(3));
  shots.desertNight = shot();
  // ---- ③ 非沙漠白天（低沙量列;避开海边 400 格的沙滩）----
  let controlX = Math.floor(st.w / 2);
  const inner = bins.filter((b) => b.bx > 400 && b.bx < st.w - 460);
  if (inner.length) controlX = inner.reduce((a, b) => (a.c <= b.c ? a : b)).bx + 30;
  if (Math.abs(controlX - desertX) < 400) controlX = Math.max(460, Math.min(st.w - 460, desertX - 500));
  setTime(0.5);
  teleport(controlX);
  await wait(1800);
  const forest = state(); forest.horizonDiff = +((await horizonDiff()).toFixed(3));
  shots.forestDay = shot();
  return { desertX, best: best.s, day, night, forest, shots };
});
if (out.fail) { console.log(JSON.stringify(out)); await browser.close(); process.exit(1); }
for (const [k, data] of Object.entries(out.shots)) {
  writeFileSync(`/tmp/swbj27-${k}.png`, Buffer.from(data.split(',')[1], 'base64'));
}
const { shots, ...report } = out;
console.log(JSON.stringify(report, null, 1));
const ok1 = report.day.zoneDesert && report.day.heatActive && report.day.heatVisible && report.day.heatIntensity > 1.5;
const ok2 = report.night.heatActive && report.night.heatIntensity > 0 && report.night.heatIntensity < 1 && report.night.heatVisible;
const ok3 = !report.forest.heatActive && !report.forest.heatVisible;
const ok4 = report.day.horizonDiff > report.forest.horizonDiff;
console.log(`VERDICT day=${ok1} nightWeak=${ok2} forestOff=${ok3} diffCorroborates=${ok4}`);
await browser.close();
process.exit(ok1 && ok2 && ok3 ? 0 : 2);
