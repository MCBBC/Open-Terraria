// ★FrameBeat 案②入场级联量化探针(2026-09-29;案③ regime 证据同刀采集)。
//  量化面:世界生成期→afterWorldLoad resetSampling→入场后 12s 的 beat 轨迹——
//   - resetSampling 时刻的 vsync 估计(案②机制:gen 期 delta 是否塌缩→minK 起步档);
//   - 入场后 k 轨迹(cap120+subtle:k 是否钉 ≥2,升拍余量是否拦死回程=用户可见面);
//   - 原始 rAF delta 流(菜单/生成/入世界三段分相)——案③ vsync 锁相 regime 实证流
//     (此前的真实证据只有 fire-when-free 一条;本探针补锁相侧)。
//  运行:SW_HEADED=1 SW_ORIGIN=http://localhost:5267 node tools/run-diag.mjs --timeout=600000 scripts/_framebeat-entry-cascade.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5267';
const HEADED = process.env.SW_HEADED === '1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const POST_ENTRY_MS = Number(process.env.SW_POST_MS ?? 12000);

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

// ── 观测装配(菜单期,rAF 流采样器独立于游戏 loop) ──
await page.evaluate(() => {
  const mod = { deltas: [], ts: [], states: [], resetLog: [], mark: (name) => { mod.ts.push([performance.now(), name]); } };
  window.__fbe = mod;
  // rAF delta 原始流(案③锁相证据;上限 6000 样本)
  let lt = 0;
  const sample = (t) => { if (lt) { if (mod.deltas.length < 6000) { mod.deltas.push(t - lt); mod.ts.push([t, 'raf']); } } lt = t; if (mod.deltas.length < 6000) requestAnimationFrame(sample); };
  requestAnimationFrame(sample);
  // beat 状态 100ms 采样
  const poll = () => {
    const g = window.__swGame;
    if (g && g.beat) {
      const s = g.beat.snapshot();
      mod.states.push({ t: performance.now(), ...s, painted: g._paintedFrames });
    }
    if (!window.__fbeStop) setTimeout(poll, 100);
  };
  poll();
  // resetSampling 时刻捕获(案②核心量)
  const tryWrap = () => {
    const g = window.__swGame;
    if (g && g.beat && !g.beat.__swResetWrapped) {
      g.beat.__swResetWrapped = true;
      const orig = g.beat.resetSampling.bind(g.beat);
      g.beat.resetSampling = () => {
        mod.resetLog.push({ t: performance.now(), vsyncBefore: g.beat.vsyncPeriod, kBefore: g.beat.k, winSize: g.beat.vsyncDeltas?.length ?? -1 });
        orig();
        mod.resetLog.push({ t: performance.now(), kAfter: g.beat.k, reason: g.beat.lastReason });
      };
    }
    if (!window.__fbeStop) setTimeout(tryWrap, 500);
  };
  tryWrap();
});
mod_mark:
await page.evaluate(() => window.__fbe.mark('menu-idle'));
await new Promise((r) => setTimeout(r, 2000));

// ── cap120+subtle(用户场景;须在进世界前设) ──
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  await options.set('frameCap', 120);
  await options.set('frameSkipMode', 'subtle');
});

// ── 建世界(触发生成期污染面;流程=_framebeat-v6-accept 同款双分支) ──
await page.evaluate(() => window.__fbe.mark('worldgen-begin'));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('入场级联');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('entry-cascade');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await page.evaluate(() => window.__fbe.mark('inworld'));

// ── 入场后轨迹(冻结窗/级联消化全程) ──
await new Promise((r) => setTimeout(r, POST_ENTRY_MS));
await page.evaluate(() => { window.__fbeStop = true; });
const out = await page.evaluate(() => {
  const m = window.__fbe;
  const g = window.__swGame;
  return {
    resetLog: m.resetLog,
    states: m.states,
    marks: m.ts.filter(([, n]) => n !== 'raf'),
    painted: g?._paintedFrames,
    kFinal: g?.beat?.k, reasonFinal: g?.beat?.lastReason,
    snapFinal: g?.beat?.snapshot(),
    deltas: m.deltas,
    freeze: g ? g.entryFreezeActive : null,
    refresh: (window.screen && window.screen.refreshRate) || null,
    ua: navigator.userAgent,
  };
});
console.log('=== resetSampling log ===');
console.log(JSON.stringify(out.resetLog));
console.log('=== marks ===');
console.log(JSON.stringify(out.marks));
console.log('=== screen.refreshRate ===', out.refresh, '| ua:', out.ua.slice(0, 80));
console.log('=== state trajectory (t, k, vsync, p50, p95, reason, miss) ===');
for (const s of out.states) console.log([Math.round(s.t), 'k' + s.k, 'v' + s.vsync, 'p50 ' + s.p50, 'p95 ' + s.p95, s.reason, 'miss ' + s.miss, 'paint ' + s.painted].join(' '));
console.log('=== final ===', JSON.stringify(out.snapFinal), 'freeze=', out.freeze);
// rAF delta 分相统计(案③)
const seg = (name, from, to) => {
  const ds = [];
  for (let i = 1; i < out.marks.length; i++) { /* noop */ }
  // deltas 带时间戳:重建
  return ds;
};
// 直接导出原始流供 node 侧分析
const fs = await import('node:fs');
fs.writeFileSync('/tmp/entry-cascade-out.json', JSON.stringify({ resetLog: out.resetLog, marks: out.marks, states: out.states, deltas: out.deltas, refresh: out.refresh }), () => {});
fs.writeFileSync('/tmp/entry-cascade-out.json', JSON.stringify({ resetLog: out.resetLog, marks: out.marks, states: out.states, deltas: out.deltas, refresh: out.refresh }));
console.log('raw -> /tmp/entry-cascade-out.json; deltas n=', out.deltas.length);
await browser.close();
