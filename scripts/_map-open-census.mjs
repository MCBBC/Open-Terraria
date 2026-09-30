// ★开图帧耗取证探针（2026-09-30）：冷开/热开两轮 toggleFullMap,逐帧 rAF 节拍+
//  控制台 [mm]/[rload] 事件+渲染账（minimap/bglPathStats/opresent）三源对齐——
//  归因开图瞬态大帧的成本源（mm 全幅上传/迷雾首建/哨兵 readPixel/洪峰溢出）。
// 用法: SW_ORIGIN=http://localhost:5208 node tools/run-diag.mjs scripts/_map-open-census.mjs
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const MAP = process.env.MAP_PATH ?? '/Users/vinlic/Downloads/map-天真的钴最高点 (1).json';
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
const consoleEvents = [];
page.on('console', (m) => {
  const t = m.text();
  if (/\[mm\]|\[rload\]|\[mem\]|Violation|洪峰|readback|prewarm/.test(t)) {
    consoleEvents.push({ t: performance.now(), text: t.slice(0, 160) });
  }
});
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5208', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const res = await page.evaluate(async (mapText) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(400);
  if (!window.__swLoadJson) return { fail: 'no __swLoadJson' };
  await window.__swLoadJson(mapText);
  for (let i = 0; i < 300 && !(window.__swGame?.world); i++) await wait(200);
  if (!window.__swGame?.world) return { fail: 'world not ready' };
  await wait(4000);   // 进图后 settle(烘焙/编译/首簇)
  return { ok: true };
}, mapText);
if (!res.ok) { console.log(JSON.stringify(res)); await browser.close(); process.exit(1); }
console.log('world ready, settle done');

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const rdr = g.renderer;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // rAF 逐帧记录（注册在游戏 rAF 之后=每帧末采样）
  const frames = [];
  let on = 0, rec = true;
  const tick = () => {
    if (rec) frames.push(performance.now());
    on = requestAnimationFrame(tick);
  };
  on = requestAnimationFrame(tick);
  const snap = (tag) => ({
    tag,
    t: Math.round(performance.now()),
    mm: rdr.minimap ? {
      needsFullUpload: !!rdr.minimap.needsFullUpload,
      flushedRects: rdr.minimap.flushedPixelRects?.length ?? -1,
      uid: rdr.minimap.uid,
    } : null,
    path: { ...rdr.bglPathStats },
    opresent: rdr.opresentStats ? { ...rdr.opresentStats } : null,
    fm: { open: rdr.fullMap.open, zoom: +rdr.fullMap.zoom.toFixed(2) },
  });
  const phases = [];
  const mark = (tag) => { phases.push({ ...snap(tag), frameIdx: frames.length }); };

  mark('baseline-start');
  await wait(2000);
  mark('baseline-end / cold-open前');
  g.toggleFullMap();                       // 冷开（本会话首开:zoom 0.5→2 缓动+mm 全幅）
  mark('cold-open 切换帧');
  await wait(1200);
  mark('cold-open+缓动完成');
  await wait(1500);                        // 开图稳态(缩放后静置)
  mark('open-steady-end');
  g.toggleFullMap();                       // 关图
  await wait(2000);
  mark('closed settled / warm-open前');
  g.toggleFullMap();                       // 热开
  await wait(1200);
  mark('warm-open+缓动完成');
  await wait(1500);
  mark('warm-steady-end');
  g.toggleFullMap();
  rec = false;
  cancelAnimationFrame(on);
  return { frames, phases, consoleEvents: window.__evShim ?? null };
}, MAP && undefined);
// 控制台事件（node 侧取）
const evs = consoleEvents.filter((e) => e.t > 0);
// 节拍分析:逐帧 gap,标出 >20ms 大帧及其相位归属
const gaps = [];
for (let i = 1; i < out.frames.length; i++) {
  gaps.push({ i, gap: out.frames[i] - out.frames[i - 1], t: Math.round(out.frames[i]) });
}
const big = gaps.filter((x) => x.gap > 20);
const phaseOf = (t) => {
  let last = 'pre';
  for (const p of out.phases) if (p.t <= t) last = p.tag;
  return last;
};
const bigByPhase = {};
for (const b of big) {
  const ph = phaseOf(b.t);
  (bigByPhase[ph] ??= []).push(Math.round(b.gap));
}
console.log(`总帧=${gaps.length} 大帧(>20ms)=${big.length}`);
for (const [ph, arr] of Object.entries(bigByPhase)) {
  console.log(`  [${ph}] ${arr.length} 帧: ${arr.join(',')}`);
}
console.log('phases:');
for (const p of out.phases) console.log(`  [${p.frameIdx}] ${p.tag} mm=${JSON.stringify(p.mm)} fm=${JSON.stringify(p.fm)}`);
console.log('path delta 热点:', (() => {
  const a = out.phases.find((p) => p.tag === 'baseline-end / cold-open前').path;
  const b = out.phases[out.phases.length - 1].path;
  const o = {};
  for (const k of Object.keys(b)) { const d = b[k] - (a[k] ?? 0); if (d > 0) o[k] = d; }
  return o;
})());
console.log('console 事件:');
for (const e of evs.slice(0, 40)) console.log(`  t=${Math.round(e.t)} ${e.text}`);
await browser.close();
