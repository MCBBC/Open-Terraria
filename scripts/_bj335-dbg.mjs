import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Runtime.enable');
await cdp.send('HeapProfiler.enable').catch(() => {});
await page.goto('http://localhost:5201/', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 2000));
const proto = await cdp.send('Runtime.evaluate', { expression: 'HTMLElement.prototype' });
const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
const statR = await cdp.send('Runtime.callFunctionOn', {
  objectId: objects.objectId,
  functionDeclaration: `function () {
    const dets = [];
    for (const e of Array.from(this)) { try { if (e && e.nodeType === 1 && !e.isConnected) { dets.push(e); if (dets.length >= 3) break; } } catch {} }
    return { dets };
  }`,
  returnByValue: false,
});
const props = await cdp.send('Runtime.getProperties', { objectId: statR.result.objectId, ownProperties: true });
const dets = (props.result ?? []).find(p => p.name === 'dets');
const dp = await cdp.send('Runtime.getProperties', { objectId: dets.value.objectId, ownProperties: true });
const arr = (dp.result ?? []).filter(p => /^\d+$/.test(p.name));
console.log('dets idx count:', arr.length);
const one = arr[0];
console.log('one.value:', JSON.stringify(one.value).slice(0, 160));
const id = await cdp.send('HeapProfiler.getHeapObjectId', { objectId: one.value.objectId });
console.log('getHeapObjectId response:', JSON.stringify(id));
await browser.close();
process.exit(0);
