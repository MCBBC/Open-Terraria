// ★v5 判据自洽刃(2026-09-29)用户实档验收探针:导入用户真实世界(map-Starter_World
//  (37).json)+角色(Vinlic (1).plr),进世界后 cap120 实测 FrameBeat 拍轨迹与帧距稳定性。
//  与 _framebeat-accept.mjs(新世界)不同:用户实档光影/液体负载才是真实帧耗面
//  (用户明示"初始世界没那么大光影压力")。判别面:
//   - beat.snapshot() 轨迹(k/p50/p95/vsync/reason):用户档真实成本分布下 v5 的拍选择;
//   - 真实渲染帧 stamps 帧距统计(稳态后半 FPS/p50/std/jumps)=用户所见 FPS 读数稳定性。
//  须 SW_HEADED=1 有头跑;SW_WORLD/SW_PLR 指定文件路径。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5265';
const HEADED = process.env.SW_HEADED === '1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RUN_MS = Number(process.env.SW_RUN_MS ?? 20000);
const WORLD = process.env.SW_WORLD ?? needInput(join(DOWNLOADS, 'map-Starter_World (37).json'));
const PLR = process.env.SW_PLR ?? needInput(join(DOWNLOADS, 'Vinlic (1).plr'));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: HEADED ? false : 'new',
  args: HEADED ? ['--no-sandbox', '--window-size=1400,900'] : ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
page.on('console', async (m) => {
  const texts = await Promise.all(m.args().map((a) => a.jsonValue().then((v) => String(v)).catch(() => '<unser>')));
  const line = `${m.type()}: ${texts.join(' ')}`;
  if (/error|fail/i.test(line)) console.log('[console]', line.slice(0, 300));
});

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));

// ── 1) 角色导入(.plr)──
{
  const input = await page.$('.sw-vsel input[type=file]');
  if (!input) throw new Error('char select file input not found');
  await input.uploadFile(PLR);
  await page.waitForFunction(() => document.querySelectorAll('.sw-vsel .sw-vitem').length > 0, { timeout: 30000, polling: 500 });
  await new Promise((r) => setTimeout(r, 800));
  const names = await page.evaluate(() => [...document.querySelectorAll('.sw-vsel .sw-vitem')].map((v) => v.textContent?.slice(0, 40)));
  console.log('char items after import:', JSON.stringify(names));
}

// ── 2) 进世界选择面(点角色行进入钮)──
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));

// ── 3) 世界导入(.json)──
{
  const input = await page.$('.sw-vsel input[type=file]');
  if (!input) throw new Error('world select file input not found');
  await input.uploadFile(WORLD);
  await page.waitForFunction(() => (document.querySelectorAll('.sw-vsel .sw-vitem').length > 0), { timeout: 60000, polling: 500 });
  await new Promise((r) => setTimeout(r, 1500));
  const names = await page.evaluate(() => [...document.querySelectorAll('.sw-vsel .sw-vitem')].map((v) => v.textContent?.slice(0, 40)));
  console.log('world items after import:', JSON.stringify(names));
}

// ── 4) 进入导入的世界 ──
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
console.log('loading world (user map, may take a while)...');
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 4000));   // 入场视口掀幕/烘焙沉降
console.log('in world; injecting observation...');

// ── 5) 观测注入 + cap120 实测(v5 现行码)──
await page.evaluate(() => {
  const g = window.__swGame;
  const mod = { stamps: [], trace: [] };
  window.__fb = mod;
  const origRender = g.render.bind(g);
  g.render = function (...a) {
    mod.stamps.push(performance.now());
    return origRender.apply(this, a);
  };
});

await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  await options.set('frameCap', 120);
  const g = window.__swGame;
  g.beat.resetSampling?.();                     // 与进世界采样面对齐
  const mod = window.__fb;
  mod.t0 = performance.now();
  mod.traceTimer = setInterval(() => {
    const g = window.__swGame;
    mod.trace.push({ t: Math.round(performance.now() - mod.t0), ...(g.beat?.snapshot?.() ?? {}) });
  }, 500);
});
await new Promise((r) => setTimeout(r, 800));
await page.evaluate((ms) => { window.__fb.t0 = performance.now(); window.__fb.runMs = ms; }, RUN_MS);
await new Promise((r) => setTimeout(r, RUN_MS + 500));
await page.evaluate(() => clearInterval(window.__fb.traceTimer));
const trace = await page.evaluate(() => window.__fb.trace ?? []);
console.log(`trace[user-world]: ${trace.map((s) => `${s.t}:k${s.k}/p50${s.p50}/p95${s.p95}/vs${s.vsync}/${s.reason}`).join(' ')}`);

const out = await page.evaluate(() => {
  const mod = window.__fb;
  const stamps = mod.stamps.slice();
  const gaps = [];
  for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
  const s = [...gaps].sort((a, b) => a - b);
  const q = (p) => s[Math.floor(p * (s.length - 1))] ?? 0;
  const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
  const std = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / (gaps.length || 1));
  let jumps = 0;
  for (let i = 1; i < gaps.length; i++) if (Math.abs(gaps[i] - gaps[i - 1]) > 4) jumps++;
  const beatSnap = (window.__swGame.beat && window.__swGame.beat.snapshot) ? window.__swGame.beat.snapshot() : null;
  const half = stamps.slice(Math.floor(stamps.length / 2));
  const gaps2 = [];
  for (let i = 1; i < half.length; i++) gaps2.push(half[i] - half[i - 1]);
  const s2 = [...gaps2].sort((a, b) => a - b);
  const fps = 1000 / (gaps2.reduce((a, b) => a + b, 0) / (gaps2.length || 1));
  // 稳态帧距直方图(0.5ms 桶 top10)——判双峰/混样
  const hist = {};
  for (const g2 of gaps2) { const b = Math.round(g2 * 2) / 2; hist[b] = (hist[b] ?? 0) + 1; }
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    n: gaps.length, p50: q(0.5), p95: q(0.95), std, jumps, beat: beatSnap,
    halfP50: s2[Math.floor(s2.length / 2)] ?? 0, halfFps: fps, frames: stamps.length,
    histTop: top.map(([b, c]) => `${b}ms:${c}`).join(' '),
  };
});
console.log(`[user-world] frames=${out.frames} gapP50=${Number(out.p50).toFixed(2)} gapP95=${Number(out.p95).toFixed(2)} 稳态后半:P50=${Number(out.halfP50).toFixed(2)} FPS=${out.halfFps.toFixed(1)} std=${Number(out.std).toFixed(2)} jumps=${out.jumps}`);
console.log(`[user-world] 稳态帧距直方图: ${out.histTop}`);
console.log(`[user-world] beat=${JSON.stringify(out.beat)}`);
console.log('=== USER-ACCEPT SUMMARY ===');
console.log(`稳态FPS=${Number(out.halfFps).toFixed(1)} gapP50=${Number(out.halfP50).toFixed(2)}ms beatK=${out.beat?.k} reason=${out.beat?.reason} p50cost=${out.beat?.p50} p95cost=${out.beat?.p95}`);
await browser.close();