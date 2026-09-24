import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('Runtime.enable');
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
const proto = await cdp.send('Runtime.evaluate', { expression: 'HTMLElement.prototype' });
const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
const pick = await cdp.send('Runtime.callFunctionOn', {
  objectId: objects.objectId,
  functionDeclaration: `function () {
    for (const e of Array.from(this)) { try { if (e && e.nodeType === 1 && !e.isConnected && String(e.className||'').includes('vinv-btn')) return e; } catch {} }
    return null;
  }`,
  returnByValue: false,
});
console.log('picked:', JSON.stringify(pick.result).slice(0, 120));
const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: pick.result.objectId });
console.log('listener count:', listeners.length);
console.log('raw first listener:', JSON.stringify(listeners[0], null, 1).slice(0, 500));
const li = listeners[0];
if (li.handler?.objectId) {
  const pr = await cdp.send('Runtime.getProperties', { objectId: li.handler.objectId, internalProperties: true });
  const loc = (pr.internalProperties ?? []).find((x) => x.name === '[[FunctionLocation]]');
  console.log('loc:', JSON.stringify(loc?.value?.value));
  if (loc?.value?.value) {
    const { scriptId, lineNumber } = loc.value.value;
    const { scriptSource } = await cdp.send('Debugger.getScriptSource', { scriptId }).catch(() => ({ scriptSource: null }));
    console.log('line:', (scriptSource?.split('\n')[lineNumber] ?? '').trim().slice(0, 140));
  }
  const scopes = (pr.internalProperties ?? []).find((x) => x.name === '[[Scopes]]');
  if (scopes?.value?.objectId) {
    const sp = await cdp.send('Runtime.getProperties', { objectId: scopes.value.objectId, ownProperties: true });
    for (const s of (sp.result ?? []).slice(0, 4)) {
      if (!s.value?.objectId) continue;
      const cp = await cdp.send('Runtime.getProperties', { objectId: s.value.objectId, ownProperties: true });
      const names = (cp.result ?? []).map((x) => x.name).filter((x) => x !== '__proto__').slice(0, 14);
      console.log(`scope[${s.value.description ?? s.value.type}]:`, names.join(','));
    }
  }
}
await browser.close();
process.exit(0);
