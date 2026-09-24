// ★BJ335 diag:游离树活诊断——queryObjects 取游离元素(诊断态,单发)→
//  DOMDebugger.getEventListeners 逐监听取 handler → [[FunctionLocation]](源码行)
//  + [[Scopes]](闭包槽) → 定「谁在游离树上留了活监听」。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('Runtime.enable');
await cdp.send('DOM.enable').catch(() => {});
await cdp.send('Debugger.enable').catch(() => {});
await cdp.send('HeapProfiler.enable').catch(() => {});
const gc = async () => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await new Promise((r) => setTimeout(r, 400)); await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await new Promise((r) => setTimeout(r, 500)); };
const poll = async (expr, ms) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await page.evaluate(expr); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 500)); } };
const WORLD = () => !!(window).__swGame && !!(window).__swGame.world && !!(window).__swGame.liquid;

await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
if (!await poll(WORLD, 300000)) throw new Error('enter 超时');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__swFlow.quitToMenu());
if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
await new Promise((r) => setTimeout(r, 1500));
await gc();

// 取游离元素代表(每类一个):sw-slot / vinv-btn / vshop-cell / canvas / img / div
const proto = await cdp.send('Runtime.evaluate', { expression: 'HTMLElement.prototype' });
const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
const pick = await cdp.send('Runtime.callFunctionOn', {
  objectId: objects.objectId,
  functionDeclaration: `function () {
    const fams = ['sw-slot', 'vinv-btn', 'vshop-cell', 'sw-title', 'vinv-txt'];
    const out = {};
    for (const e of Array.from(this)) {
      try {
        if (!e || e.nodeType !== 1 || e.isConnected) continue;
        const cls = String(e.className || '');
        for (const f of fams) {
          if (!out[f] && (cls.includes(f) || (f === 'sw-title' && cls.includes('sw-title')))) out[f] = e;
        }
        if (!out.__canvas && e.tagName === 'CANVAS') out.__canvas = e;
        if (!out.__img && e.tagName === 'IMG') out.__img = e;
        if (!out.__div && e.tagName === 'DIV' && !cls) out.__div = e;
      } catch {}
    }
    return out;
  }`,
  returnByValue: false,
});
const props = await cdp.send('Runtime.getProperties', { objectId: pick.result.objectId, ownProperties: true });
const famProps = (props.result ?? []).filter((p) => p.value?.objectId && p.name !== '__proto__');
console.log('picked families:', famProps.map((p) => p.name).join(','));
const reported = new Set();
for (const p of famProps) {
  try {
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: p.value.objectId });
    if (!listeners.length) { console.log(`\n[${p.name}] 0 listeners`); continue; }
    console.log(`\n[${p.name}] ${listeners.length} listeners`);
    for (const li of listeners.slice(0, 4)) {
      const key = li.type + '|' + (li.handler?.objectId ?? '?');
      if (reported.has(key)) continue;
      reported.add(key);
      console.log(`  ${li.type} useCapture=${li.useCaption ?? li.useCapture} passive=${li.passive}`);
      if (!li.handler?.objectId) continue;
      const pr = await cdp.send('Runtime.getProperties', { objectId: li.handler.objectId, internalProperties: true });
      const loc = (pr.internalProperties ?? []).find((x) => x.name === '[[FunctionLocation]]');
      if (loc?.value?.value) {
        const { scriptId, lineNumber } = loc.value.value;
        const { scriptSource } = await cdp.send('Debugger.getScriptSource', { scriptId }).catch(() => ({ scriptSource: null }));
        const line = scriptSource ? (scriptSource.split('\n')[lineNumber] ?? '').trim().slice(0, 140) : '(no source)';
        console.log(`    loc served:${lineNumber + 1} → ${line}`);
      }
      // Scopes:closure 槽位
      const scopes = (pr.internalProperties ?? []).find((x) => x.name === '[[Scopes]]');
      if (scopes?.value?.objectId) {
        const sp = await cdp.send('Runtime.getProperties', { objectId: scopes.value.objectId, ownProperties: true });
        for (const s of (sp.result ?? []).slice(0, 3)) {
          if (!s.value?.objectId) continue;
          const cp = await cdp.send('Runtime.getProperties', { objectId: s.value.objectId, ownProperties: true });
          const names = (cp.result ?? []).map((x) => x.name).filter((x) => x !== '__proto__' && x !== 'this').slice(0, 12);
          const thisVal = (cp.result ?? []).find((x) => x.name === 'this');
          let thisDesc = '';
          if (thisVal?.value?.className) thisDesc = ' this=' + thisVal.value.className;
          console.log(`    scope[${s.value.description ?? s.value.type}] slots: ${names.join(',')}${thisDesc}`);
        }
      }
    }
  } catch (e) { console.log(`[${p.name}] err ${String(e).slice(0, 100)}`); }
}
await browser.close();
process.exit(0);
