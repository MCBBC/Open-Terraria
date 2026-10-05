// ★B2 去回声回归定谳探针(2026-10-05 用户实报:cap=120 fps 飘 120-130+ 持续抖动/动画抖)。
//  逐回调遥测:delta/work/est/famLo/dispWin/corr/engaged/candidate——拿真实数据定谳
//  「famLo 锚定收敛 7.7-7.8<真 vsync」是否在用户场景(cap=120 稳态轻载)复现。
//  MODE=neo(默认,现行估计器)| MODE=legacy(estimateVsync 钉旧截尾均值=活机红面)。
//  运行:SW_HEADED=1 SW_ORIGIN=http://localhost:5218 MODE=neo node tools/run-diag.mjs --timeout=280000 scripts/_framebeat-b2-regress.mjs
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5218';
const MODE = process.env.MODE ?? 'neo';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const T0 = Date.now();
const log = (m) => console.log(`[t+${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false,
  // 插桩中立性:禁后台化(遮挡 headed 窗会触发 rAF 节流脉冲=伪族源,v9.1 有案)
  args: ['--no-sandbox', '--window-size=1400,900', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const beats = [];
const allConsole = [];
page.on('console', (m) => { const t = m.text(); if (t.includes('[beat]')) beats.push({ t: performance.now(), text: t }); if (allConsole.length < 400) allConsole.push({ t: Math.round(performance.now()), type: m.type(), text: t.slice(0, 300) }); });
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
page.on('framenavigated', () => console.log('[nav] 页面导航/重载(上下文重置)'));

async function install() {
  await page.evaluate(async (mode) => {
    const mod = window.__fbr && window.__fbr.__ctx === performance.timeOrigin
      ? window.__fbr
      : { mode, __ctx: performance.timeOrigin, events: [], states: [], ktrans: [], deltas: [], tel: [], renderT: [], gameFps: [] };
    window.__fbr = mod;
    const { FrameBeat } = await import('/src/core/FrameBeat.ts');
    const beatProto = FrameBeat.prototype;
    if (mode === 'legacy') {
      beatProto.estimateVsync = function () { return this.legacyEstimate(); };
    }
    if (!mod.__wired) {
      mod.__wired = true;
      const origObs = beatProto.observeVsync;
      beatProto.observeVsync = function (now, cap) {
        if (!mod.inst) mod.inst = this;
        const d = mod.lastVsyncTs !== undefined && mod.lastVsyncTs >= 0 ? now - mod.lastVsyncTs : null;
        mod.lastVsyncTs = now;
        mod.obsN = (mod.obsN ?? 0) + 1;
        const r = origObs.call(this, now, cap);
        // 逐回调遥测(前 8000 条;之后每 8 条抽 1 防爆内存)
        if (mod.obsN <= 8000 || mod.obsN % 8 === 0) {
          const inst = this;
          const ec = inst.echoCosts, ed = inst.echoDeltas;
          let corr = null, resid = null;
          if (ec.length >= 12) {
            const n = ec.length;
            const mc = ec.reduce((a, b) => a + b, 0) / n, md = ed.reduce((a, b) => a + b, 0) / n;
            let scc = 0, sdd = 0, scd = 0;
            for (let i = 0; i < n; i++) { const a = ec[i] - mc, b = ed[i] - md; scc += a * a; sdd += b * b; scd += a * b; }
            if (scc >= 0.25 * n && sdd >= 0.25 * n) corr = scd / Math.sqrt(scc * sdd);
            const rs = ed.map((v, i) => v - ec[i]);
            const mr = rs.reduce((a, b) => a + b, 0) / n;
            resid = Math.sqrt(rs.reduce((a, b) => a + (b - mr) ** 2, 0) / n);
          }
          mod.tel.push({ i: mod.obsN, t: Math.round(now), d: d === null ? null : Math.round(d * 100) / 100,
            work: Math.round(inst.legacyEstimate() * 1000) / 1000, est: Math.round(inst.vsyncPeriod * 1000) / 1000,
            famLo: inst.famLo === Infinity ? null : Math.round(inst.famLo * 1000) / 1000,
            nD: inst.dispWin.length, since: inst.sinceAdmit, corr: corr === null ? null : Math.round(corr * 1000) / 1000,
            resid: resid === null ? null : Math.round(resid * 1000) / 1000,
            eng: inst.echoEngaged(), k: inst.k });
        }
        return r;
      };
      const origBegin = beatProto.beginRender;
      beatProto.beginRender = function (now) { mod.renders = (mod.renders ?? 0) + 1; if (mod.renderT.length < 60000) mod.renderT.push(now); return origBegin.call(this, now); };
      const origEnd = beatProto.endRender;
      beatProto.endRender = function (now) {
        const k0 = this.k;
        mod.endN = (mod.endN ?? 0) + 1;
        origEnd.call(this, now);
        if (this.k !== k0) mod.ktrans.push({ t: performance.now(), from: k0, to: this.k, reason: this.lastReason, p50: this.costP50(), vsync: this.vsyncPeriod });
      };
      const poll = () => {
        if (mod.inst) mod.states.push({ t: performance.now(), ...mod.inst.snapshot(), renders: mod.renders ?? 0, endN: mod.endN ?? 0, obsN: mod.obsN ?? 0 });
        try { if (window.__swGame) mod.gameFps.push({ t: performance.now(), fps: window.__swGame.fps }); } catch { /* */ }
        if (!window.__fbrStop) setTimeout(poll, 200);
      };
      poll();
    }
    const { options } = await import('/src/core/Options.ts');
    window.__fbMark = (n) => mod.events.push({ ev: 'mark', t: performance.now(), n, fsm: options.data.frameSkipMode, cap: options.data.frameCap });
  }, MODE);
}
async function ensureInstalled() {
  if (!(await page.evaluate(() => typeof window.__fbMark === 'function' && !!window.__fbr))) {
    console.log('[install] 上下文丢失,重装 instrumentation');
    await install();
  }
}
async function setCap(v) {
  await page.evaluate(async (v) => { const { options } = await import('/src/core/Options.ts'); await options.set('frameCap', v); }, v);
}

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.bringToFront();
await page.evaluate(() => { try { window.focus(); window.dispatchEvent(new FocusEvent('focus')); document.dispatchEvent(new Event('visibilitychange')); } catch { /* */ } });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
await install();
await ensureInstalled();
await setCap(120);
await page.evaluate(async () => { const { options } = await import('/src/core/Options.ts'); await options.set('frameSkipMode', 'subtle'); });
await ensureInstalled();
await page.evaluate((n) => window.__fbMark(n), 'cap120-subtle-menu'); log('cap120-subtle-menu');
// 场景A:菜单稳态 10s(cap120,轻载=帧耗小,用户场景的"无重载"端点)
await new Promise((r) => setTimeout(r, 10000));
await page.evaluate((n) => window.__fbMark(n), 'menu-steady-done'); log('menu-steady-done');
// 入世界
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('B2回归');
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
  await page.keyboard.type('b2-regress');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.evaluate((n) => window.__fbMark(n), 'worldgen-begin'); log('worldgen-begin');
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 240000, polling: 1000 });
await page.evaluate((n) => window.__fbMark(n), 'inworld'); log('inworld');
// 场景B:世界内稳态 25s(cap120 subtle,用户实报场景)
await new Promise((r) => setTimeout(r, 25000));
await page.evaluate((n) => window.__fbMark(n), 'steady-done'); log('steady-done');
// reload 会换上下文:先捞首上下文数据
const outFirst = await page.evaluate(() => ({
  events: window.__fbr.events, ktrans: window.__fbr.ktrans, states: window.__fbr.states,
  deltas: window.__fbr.deltas, tel: window.__fbr.tel, renderT: window.__fbr.renderT,
  gameFps: window.__fbr.gameFps, renders: window.__fbr.renders, endN: window.__fbr.endN,
}));
// 场景C:重载(冷启动再收敛;cap 已是 120)
await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await page.bringToFront();
await page.evaluate(() => { try { window.focus(); window.dispatchEvent(new FocusEvent('focus')); } catch { /* */ } });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 120000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
await install();
await ensureInstalled();
await page.evaluate((n) => window.__fbMark(n), 'reloaded'); log('reloaded');
await page.waitForFunction(() => !!(window.__fbr && window.__fbr.inst), { timeout: 30000, polling: 500 }).catch(() => {});
await page.evaluate((n) => window.__fbMark(n), 'reloaded-loop-active'); log('reloaded-loop-active');
await new Promise((r) => setTimeout(r, 12000));
await ensureInstalled();
await page.evaluate(() => { window.__fbrStop = true; });
const out = await page.evaluate(() => ({ mode: window.__fbr.mode, events: window.__fbr.events, ktrans: window.__fbr.ktrans, states: window.__fbr.states, tel: window.__fbr.tel, renderT: window.__fbr.renderT, gameFps: window.__fbr.gameFps, renders: window.__fbr.renders, endN: window.__fbr.endN, inst: window.__fbr.inst ? window.__fbr.inst.snapshot() : null }));
out.firstCtx = outFirst; out.beats = beats; out.console = allConsole;
const { writeFileSync } = await import('node:fs');
writeFileSync(`/tmp/b2-regress-live-${MODE}.json`, JSON.stringify(out));
console.log(`=== MODE=${MODE} k 迁移(A/B 场景) ===`);
for (const k of out.firstCtx.ktrans) console.log(`t=${Math.round(k.t)} ${k.from}->${k.to} ${k.reason} p50=${k.p50?.toFixed(1)} v=${k.vsync?.toFixed(2)}`);
console.log(`=== k 迁移(reload 相位) ===`);
for (const k of out.ktrans) console.log(`t=${Math.round(k.t)} ${k.from}->${k.to} ${k.reason} p50=${k.p50?.toFixed(1)} v=${k.vsync?.toFixed(2)}`);
console.log(`=== [beat] 记录仪(${beats.length} 条) ===`);
for (const b of beats) console.log(b.text);
console.log(`=== marks ===`);
for (const e of out.events) console.log(JSON.stringify(e));
// 分段摘要
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
summ('菜单稳态(cap120)', seg(ev['cap120-subtle-menu'], ev['menu-steady-done']));
summ('世界内稳态(cap120)', seg(ev['inworld'], ev['steady-done']));
const ev2 = Object.fromEntries(out.events.map((e) => [e.n, e.t]));
summ('重载后(菜单)     ', seg(ev2['reloaded-loop-active'] ?? ev2['reloaded'] ?? Infinity, Infinity));
console.log(`final inst snapshot: ${JSON.stringify(out.inst)}`);
await browser.close();
