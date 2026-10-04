// ★B2 去回声估计器活机探针:稳态拍位+帧率切换+重载三场景的 [beat] 拍迁移记录仪 A/B。
//  MODE=neo(默认,现行去回声估计器)| MODE=legacy(estimateVsync 钉旧截尾均值=活机整链红面)。
//  运行:SW_HEADED=1 SW_ORIGIN=http://localhost:5218 MODE=neo node tools/run-diag.mjs --timeout=280000 scripts/_framebeat-b2-echo.mjs
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5218';
const MODE = process.env.MODE ?? 'neo';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const T0 = Date.now();
const log = (m) => console.log(`[t+${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false,
  // ★插桩中立性:遮挡 headed 窗会触发 Chrome 后台节流(rAF 脉冲化,活机实测产生
  //   14.1% sub-7ms 连续伪族=估计器 floor 风暴的伪源)——禁两类后台化,让探针窗
  //   即使被遮挡也按前台条件产流(用户真实渲染条件=前台窗)
  args: ['--no-sandbox', '--window-size=1400,900', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const beats = [];
const allConsole = [];
page.on('console', (m) => { const t = m.text(); if (t.includes('[beat]')) beats.push({ t: performance.now(), text: t }); if (allConsole.length < 400) allConsole.push({ t: Math.round(performance.now()), type: m.type(), text: t.slice(0, 300) }); });
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
page.on('console', async (m) => {
  if (m.type() !== 'error') return;
  try {
    for (const a of m.args()) {
      const ro = a.remoteObject();
      if (ro.description) { console.log('CONSOLE-ERR-DESC:', ro.description.slice(0, 1200)); break; }
    }
  } catch { /* */ }
});
page.on('framenavigated', () => console.log('[nav] 页面导航/重载(上下文重置)'));

// 安装 instrumentation(可重入:reload/dep-优化重载后上下文被换,须重装)
async function install() {
  await page.evaluate(async (mode) => {
    const mod = window.__fb2 && window.__fb2.__ctx === performance.timeOrigin
      ? window.__fb2
      : { mode, __ctx: performance.timeOrigin, events: [], states: [], ktrans: [], deltas: [], renders: 0, endN: 0 };
    window.__fb2 = mod;
    const { FrameBeat } = await import('/src/core/FrameBeat.ts');
    const beatProto = FrameBeat.prototype;
    if (mode === 'legacy') {
      // 活机红面:估计器钉回旧截尾均值(判据/状态机全部现行=单变量 A/B)
      beatProto.estimateVsync = function () { return this.legacyEstimate(); };
    }
    // neo:不动原型(类方法 estimateVsync 即现行去回声估计式;★勿 delete——原型属性
    // delete=全实例失效,曾把帧循环第二帧打炸熔断)
    if (!mod.__wired) {
      mod.__wired = true;
      const origObs = beatProto.observeVsync;
      beatProto.observeVsync = function (now, cap) {
        if (!mod.inst) mod.inst = this;          // 捕获活实例(menu 期 __swGame 尚未挂)
        mod.obsN = (mod.obsN ?? 0) + 1;
        return origObs.call(this, now, cap);
      };
      const origBegin = beatProto.beginRender;
      beatProto.beginRender = function (now) { mod.renders++; return origBegin.call(this, now); };
      const origEnd = beatProto.endRender;
      beatProto.endRender = function (now) {
        const k0 = this.k;
        mod.endN++;
        origEnd.call(this, now);
        if (this.k !== k0) mod.ktrans.push({ t: performance.now(), from: k0, to: this.k, reason: this.lastReason, p50: this.costP50(), vsync: this.vsyncPeriod });
      };
      let lt = 0;
      const samp = (t) => { if (lt && mod.deltas.length < 20000) mod.deltas.push(t - lt); lt = t; if (mod.deltas.length < 20000) requestAnimationFrame(samp); };
      requestAnimationFrame(samp);
      const poll = () => {
        if (mod.inst) mod.states.push({ t: performance.now(), ...mod.inst.snapshot(), renders: mod.renders, endN: mod.endN, obsN: mod.obsN ?? 0 });
        if (!window.__fb2Stop) setTimeout(poll, 200);
      };
      poll();
    }
    const { options } = await import('/src/core/Options.ts');
    window.__fbMark = (n) => mod.events.push({ ev: 'mark', t: performance.now(), n, fsm: options.data.frameSkipMode, cap: options.data.frameCap });
  }, MODE);
}
async function ensureInstalled() {
  if (!(await page.evaluate(() => typeof window.__fbMark === 'function' && !!window.__fb2))) {
    console.log('[install] 上下文丢失,重装 instrumentation');
    await install();
  }
}
async function setCap(v) {
  await page.evaluate(async (v) => { const { options } = await import('/src/core/Options.ts'); await options.set('frameCap', v); }, v);
}

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.bringToFront();
// headed 窗口无焦点会触发 Game blur 门(循环停转,endN 恒 1)——window.focus + 派发 focus 事件双保险
await page.evaluate(() => { try { window.focus(); window.dispatchEvent(new FocusEvent('focus')); document.dispatchEvent(new Event('visibilitychange')); } catch { /* */ } });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));   // 给 vite dep-优化重载留窗口
await install();
await ensureInstalled();
await setCap(120);
await page.evaluate(async () => { const { options } = await import('/src/core/Options.ts'); await options.set('frameSkipMode', 'subtle'); });
await ensureInstalled();
await page.evaluate((n) => window.__fbMark(n), 'cap120-subtle'); log('cap120-subtle');
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('B2去回声');
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
  await page.keyboard.type('b2-echo');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.evaluate((n) => window.__fbMark(n), 'worldgen-begin'); log('worldgen-begin');
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 240000, polling: 1000 });
await page.evaluate((n) => window.__fbMark(n), 'inworld'); log('inworld');
// 场景A:稳态 15s(cap120 subtle)
await new Promise((r) => setTimeout(r, 15000));
await page.evaluate((n) => window.__fbMark(n), 'steady-done'); log('steady-done');
// 场景B:帧率切换 cap 120→60→30→0(各 6s)
await setCap(60);
await page.evaluate((n) => window.__fbMark(n), 'cap60'); log('cap60');
await new Promise((r) => setTimeout(r, 6000));
await setCap(30);
await page.evaluate((n) => window.__fbMark(n), 'cap30'); log('cap30');
await new Promise((r) => setTimeout(r, 6000));
await setCap(0);
await page.evaluate((n) => window.__fbMark(n), 'cap0'); log('cap0');
await new Promise((r) => setTimeout(r, 6000));
await page.evaluate((n) => window.__fbMark(n), 'switch-done'); log('switch-done');
// reload 会换上下文:先把首上下文数据捞到 node 侧
const outFirst = await page.evaluate(() => ({
  events: window.__fb2.events, ktrans: window.__fb2.ktrans, states: window.__fb2.states,
  deltas: window.__fb2.deltas, renders: window.__fb2.renders, endN: window.__fb2.endN,
}));
// 场景C:重载(页面级;cap 回 120)——估计器冷启动再收敛
await setCap(120);
await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await page.bringToFront();
await page.evaluate(() => { try { window.focus(); window.dispatchEvent(new FocusEvent('focus')); } catch { /* */ } });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 120000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
await install();
await ensureInstalled();
await page.evaluate((n) => window.__fbMark(n), 'reloaded'); log('reloaded');
// 重载后落标题页/世界皆可:beat 引擎在 menu 即活动(渲染循环同一 frame() 路径),
// 场景 C 只测估计器冷启动再收敛+拍位,无需世界入场流(点击流易碎)。
await page.waitForFunction(() => !!(window.__fb2 && window.__fb2.inst), { timeout: 30000, polling: 500 }).catch(() => {});
await page.evaluate((n) => window.__fbMark(n), 'reloaded-loop-active'); log('reloaded-loop-active');
await new Promise((r) => setTimeout(r, 12000));
await ensureInstalled();
await page.evaluate(() => { window.__fb2Stop = true; });
const out = await page.evaluate(() => ({ mode: window.__fb2.mode, events: window.__fb2.events, ktrans: window.__fb2.ktrans, states: window.__fb2.states, deltas: window.__fb2.deltas, renders: window.__fb2.renders, endN: window.__fb2.endN, inst: window.__fb2.inst ? window.__fb2.inst.snapshot() : null }));
out.firstCtx = outFirst;   // 首上下文(A/B 场景)独立保存;reload 相位(bfcache 可能同上下文)不合并
out.beats = beats; out.console = allConsole;
const { writeFileSync } = await import('node:fs');
writeFileSync(`/tmp/b2-echo-live-${MODE}.json`, JSON.stringify(out));
console.log(`=== MODE=${MODE} k 迁移(A/B 场景) ===`);
for (const k of out.firstCtx.ktrans) console.log(`t=${Math.round(k.t)} ${k.from}->${k.to} ${k.reason} p50=${k.p50?.toFixed(1)} v=${k.vsync?.toFixed(2)}`);
console.log(`=== k 迁移(reload 相位) ===`);
for (const k of out.ktrans) console.log(`t=${Math.round(k.t)} ${k.from}->${k.to} ${k.reason} p50=${k.p50?.toFixed(1)} v=${k.vsync?.toFixed(2)}`);
console.log(`=== [beat] 记录仪(${beats.length} 条) ===`);
for (const b of beats) console.log(b.text);
console.log(`=== console(非 beat,前后各 15) ===`);
for (const c of allConsole.filter((c) => !c.text.includes('[beat]')).slice(0, 15)) console.log(`c@${c.t} ${c.type}: ${c.text}`);
if (allConsole.length > 15) { console.log('...'); for (const c of allConsole.filter((c) => !c.text.includes('[beat]')).slice(-15)) console.log(`c@${c.t} ${c.type}: ${c.text}`); }
console.log(`=== marks ===`);
for (const e of out.events) console.log(JSON.stringify(e));
// 分段稳态摘要
const seg = (t0, t1) => out.states.filter((s) => s.t >= t0 && s.t < t1);
function summ(name, arr) {
  if (!arr.length) return console.log(`${name}: (无样本)`);
  const last = arr[arr.length - 1];
  let painted = 0;
  for (let i = 1; i < arr.length; i++) painted += Math.max(0, arr[i].renders - arr[i - 1].renders);
  const fps = painted / ((arr[arr.length - 1].t - arr[0].t) / 1000);
  console.log(`${name}: n=${arr.length} k=${last.k} vsync=${last.vsync} p50=${last.p50} p95=${last.p95} target=${last.target} reason=${last.reason} realizedFPS=${fps.toFixed(1)} endN=${last.endN}`);
}
const ev = Object.fromEntries(out.firstCtx.events.map((e) => [e.n, e.t]));
summ('稳态(cap120)   ', seg(ev['inworld'], ev['steady-done']));
summ('切60           ', seg(ev['cap60'], ev['cap30']));
summ('切30           ', seg(ev['cap30'], ev['cap0']));
summ('切0            ', seg(ev['cap0'], ev['switch-done']));
const ev2 = Object.fromEntries(out.events.map((e) => [e.n, e.t]));
summ('重载后          ', seg(ev2['reloaded-loop-active'] ?? ev2['reloaded'] ?? Infinity, Infinity));
const tail = out.firstCtx.deltas.slice(-2000);
const mean = tail.reduce((a, b) => a + b, 0) / (tail.length || 1);
console.log(`rAF delta 尾段: n=${tail.length} mean=${mean.toFixed(2)}ms (≈显示周期真值参照)`);
await browser.close();
