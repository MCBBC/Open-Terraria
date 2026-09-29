// ★案②探针 v2:原型级 resetSampling 捕获(实例包装未命中的修正)+ k 迁移全记录。
//  运行:SW_HEADED=1 SW_ORIGIN=http://localhost:5267 node tools/run-diag.mjs --timeout=420000 scripts/_framebeat-entry-cascade2.mjs
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5267';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false,
  args: ['--no-sandbox', '--window-size=1400,900'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(async () => {
  const mod = { events: [], states: [], ktrans: [], deltas: [] };
  window.__fb2 = mod;
  // 模块原型级包装(实例无关,菜单期即装)
  const { FrameBeat } = await import('/src/core/FrameBeat.ts');
  const beatProto = FrameBeat.prototype;
  const origReset = beatProto.resetSampling;
  beatProto.resetSampling = function () {
    const minKBefore = this.minK();
    mod.events.push({ ev: 'reset-in', t: performance.now(), vsync: this.vsyncPeriod, kBefore: this.k, minK: minKBefore, costWin: this.costWin.length, reason: this.lastReason });
    origReset.call(this);
    mod.events.push({ ev: 'reset-out', t: performance.now(), k: this.k, reason: this.lastReason });
  };
  // k 迁移记录:包 endRender
  const origEnd = beatProto.endRender;
  beatProto.endRender = function (now) {
    const k0 = this.k;
    origEnd.call(this, now);
    if (this.k !== k0) mod.ktrans.push({ t: performance.now(), from: k0, to: this.k, reason: this.lastReason, p50: this.costP50(), vsync: this.vsyncPeriod });
  };
  // 原始 rAF delta
  let lt = 0;
  const samp = (t) => { if (lt && mod.deltas.length < 8000) mod.deltas.push([t, t - lt]); lt = t; if (mod.deltas.length < 8000) requestAnimationFrame(samp); };
  requestAnimationFrame(samp);
  const poll = () => {
    const g = window.__swGame;
    if (g?.beat) mod.states.push({ t: performance.now(), ...g.beat.snapshot(), painted: g._paintedFrames, world: !!g.world, freeze: g.entryFreezeActive });
    if (!window.__fb2Stop) setTimeout(poll, 100);
  };
  poll();
  window.__fbMark = (n) => mod.events.push({ ev: 'mark', t: performance.now(), n });
});
const mark = (n) => page.evaluate((n) => window.__fbMark(n), n);
await mark('menu-idle');
await page.evaluate(async () => { const { options } = await import('/src/core/Options.ts'); await options.set('frameCap', 120); await options.set('frameSkipMode', 'subtle'); });
await mark('cap-set');
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('入场级联2');
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
  await page.keyboard.type('entry-cascade-2');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await mark('worldgen-begin');
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await mark('inworld');
await new Promise((r) => setTimeout(r, 15000));
await page.evaluate(() => { window.__fb2Stop = true; });
const out = await page.evaluate(() => ({ events: window.__fb2.events, ktrans: window.__fb2.ktrans, states: window.__fb2.states, deltas: window.__fb2.deltas }));
const { writeFileSync } = await import('node:fs');
writeFileSync('/tmp/entry-cascade2.json', JSON.stringify(out));
console.log('=== events ===');
for (const e of out.events) console.log(JSON.stringify(e));
console.log('=== k transitions ===');
for (const k of out.ktrans) console.log(`t=${Math.round(k.t)} ${k.from}->${k.to} ${k.reason} p50=${k.p50?.toFixed(1)} v=${k.vsync?.toFixed(2)}`);
console.log('states n=', out.states.length, 'deltas n=', out.deltas.length);
await browser.close();
