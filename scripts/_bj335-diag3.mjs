// ★BJ335 diag3:游离树全监听handler源码行普查(去重)
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
const statR = await cdp.send('Runtime.callFunctionOn', {
  objectId: objects.objectId,
  functionDeclaration: `function () {
    const dets = [];
    for (const e of Array.from(this)) { try { if (e && e.nodeType === 1 && !e.isConnected) { dets.push(e); if (dets.length >= 120) break; } } catch {} }
    return dets;
  }`,
  returnByValue: false,
});
const dprops = await cdp.send('Runtime.getProperties', { objectId: statR.result.objectId, ownProperties: true });
const dets = (dprops.result ?? []).filter((p) => /^\d+$/.test(p.name));
const srcCache = new Map();
const lineOf = async (scriptId, lineNo) => {
  if (!srcCache.has(scriptId)) {
    const { scriptSource } = await cdp.send('Debugger.getScriptSource', { scriptId }).catch(() => ({ scriptSource: null }));
    srcCache.set(scriptId, scriptSource ? scriptSource.split('\n') : null);
  }
  const lines = srcCache.get(scriptId);
  return lines ? (lines[lineNo] ?? '').trim().slice(0, 130) : '(no src)';
};
const agg = new Map();
let withL = 0, withoutL = 0;
for (const p of dets.slice(0, 120)) {
  let ls;
  try { ls = (await cdp.send('DOMDebugger.getEventListeners', { objectId: p.value.objectId })).listeners; } catch { continue; }
  if (!ls.length) { withoutL++; continue; }
  withL++;
  for (const li of ls) {
    const key = `${li.scriptId}:${li.lineNumber}`;
    agg.set(key, (agg.get(key) ?? 0) + 1);
  }
}
console.log(`游离样本 ${dets.length}: 有监听 ${withL}, 无监听 ${withoutL}`);
console.log('\n游离树监听 handler 源码行(按数量):');
for (const [k, n] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24)) {
  const [sid, ln] = k.split(':');
  const line = await lineOf(sid, Number(ln));
  console.log(`  ×${n} script${sid}:${Number(ln) + 1} → ${line}`);
}
await browser.close();
process.exit(0);
