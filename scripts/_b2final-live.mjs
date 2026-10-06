// ★v9.5 终局裁决活机验证探针(2026-10-06,B2 全系清退后)。
//  判据(清退态语义,对照 Trace-20261006T033001 用户机病灶数字):
//   ①cap120 世界内稳态:零引擎 skip(回调数=渲染数)、帧距无 13ms+ 长帧距簇、
//     fps 读数稳(120 穿越率 <1/s)、k 恒 1 零迁移([beat] 仅冷启动 floor/upgrade);
//   ②cap60/cap30 段:k 地板照常(2/4),帧距恒定零跳变;
//   ③重载往返:读档回世界后稳态复判。
//  ★本机(Dev Mac)ticker 恒 ≈8.30(反馈环不复现,v9.4 时代探针同注)——超速带
//  断环行为由 trace 回放定谳(0 skip/126.7 恒/0.52 穿越,见报告);本机=非回归面。
//  运行:SW_HEADED=1 SW_ORIGIN=http://localhost:5218 node tools/run-diag.mjs --timeout=280000 scripts/_b2final-live.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5218';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const T0 = Date.now();
const log = (m) => console.log(`[t+${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false,
  // 插桩中立性:禁后台化(遮挡 headed 窗会触发 rAF 节流脉冲=伪族源,v9.1 有案)
  args: ['--no-sandbox', '--window-size=1400,900', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const beats = [];
page.on('console', (m) => { const t = m.text(); if (t.includes('[beat]')) beats.push({ t: performance.now(), text: t }); });
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.bringToFront();
await page.evaluate(() => { try { window.focus(); window.dispatchEvent(new FocusEvent('focus')); document.dispatchEvent(new Event('visibilitychange')); } catch { /* */ } });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(async () => {
  const mod = window.__fbfinal && window.__fbfinal.__ctx === performance.timeOrigin
    ? window.__fbfinal
    : { __ctx: performance.timeOrigin, renderT: [], obsT: [], events: [] };
  window.__fbfinal = mod;
  const beatProto = (await import('/src/core/FrameBeat.ts')).FrameBeat.prototype;
  if (!mod.__wired) {
    mod.__wired = true;
    const origObs = beatProto.observeVsync;
    beatProto.observeVsync = function (now, cap) {
      if (mod.obsT.length < 200000) mod.obsT.push(now);
      return origObs.call(this, now, cap);
    };
    const origBegin = beatProto.beginRender;
    beatProto.beginRender = function (now) {
      if (mod.renderT.length < 200000) mod.renderT.push(now);
      return origBegin.call(this, now);
    };
  }
  const { options } = await import('/src/core/Options.ts');
  window.__fbMark = (n) => mod.events.push({ ev: 'mark', t: performance.now(), n, fsm: options.data.frameSkipMode, cap: options.data.frameCap });
  window.__fbPoll = () => { try { return window.__swGame ? window.__swGame.fps : null; } catch { return null; } };
});
const mark = (n) => page.evaluate((n) => window.__fbMark(n), n);
const setCap = (v) => page.evaluate(async (v) => { const { options } = await import('/src/Options.ts').catch(() => import('/src/core/Options.ts')); await options.set('frameCap', v); }, v).catch(async () => page.evaluate(async (v) => { const { options } = await import('/src/core/Options.ts'); await options.set('frameCap', v); }, v));

await mark('boot');
await setCap(120);
await page.evaluate(async () => { const { options } = await import('/src/core/Options.ts'); await options.set('frameSkipMode', 'subtle'); });
await mark('cap120-subtle-menu');
// 菜单稳态 8s
await new Promise((r) => setTimeout(r, 8000));
await mark('menu-done'); log('menu-done');
// 入世界(seed=b2-final)
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('裁决探针');
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
  await page.keyboard.type('b2-final');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await mark('worldgen-begin'); log('worldgen-begin');
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 240000, polling: 1000 });
await mark('inworld'); log('inworld');
// 场景A:世界内稳态 25s(cap120 subtle)
const fpsSeries = [];
for (let i = 0; i < 125; i++) {
  fpsSeries.push(await page.evaluate(() => ({ t: performance.now(), fps: window.__fbPoll() })));
  await new Promise((r) => setTimeout(r, 200));
}
await mark('steady-done'); log('steady-done');
// 场景B:cap60 12s → cap30 10s(k 地板回归)
await setCap(60);
await mark('cap60-begin');
await new Promise((r) => setTimeout(r, 12000));
await mark('cap60-done');
await setCap(30);
await mark('cap30-begin');
await new Promise((r) => setTimeout(r, 10000));
await mark('cap30-done');
// 场景C:回 cap120(重载往返语义:恢复稳态复判)
await setCap(120);
await mark('cap120-again');
await new Promise((r) => setTimeout(r, 8000));
await mark('done'); log('done');

const out = await page.evaluate(() => ({ renderT: window.__fbfinal.renderT, obsT: window.__fbfinal.obsT, events: window.__fbfinal.events }));
console.log('RESULT_JSON_START');
console.log(JSON.stringify({ ...out, beats, fpsSeries }));
console.log('RESULT_JSON_END');
await browser.close();
