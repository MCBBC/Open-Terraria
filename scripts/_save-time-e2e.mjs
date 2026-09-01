// 累计 playtime E2E v3:flow.doSave 真桥两次保存 → quicksave header.playTimeMs 单调累计
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (23).json';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 600000,
});
const page = await browser.newPage();
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const flow = (window).__swFlow;
  const g = (window).__swGame;
  const kvMod = await import('/src/save/KvStore.ts');
  const QUICK = 'sandboxworld.quicksave';
  const ptNow = async () => {
    const j = await kvMod.kvGet(QUICK);
    if (!j) return null;
    const parsed = JSON.parse(j);
    return { pt: parsed.header?.playTimeMs ?? null, worldName: parsed.header?.name ?? null };
  };
  const p0 = await ptNow();
  flow.doSave(false);
  await new Promise((r) => setTimeout(r, 1000));
  const s1 = await ptNow();
  await new Promise((r) => setTimeout(r, 800));
  flow.doSave(false);
  await new Promise((r) => setTimeout(r, 1000));
  const s2 = await ptNow();
  return {
    p0, s1, s2,
    monotonicGrow: !!(p0 && s1 && s2 && s1.pt > p0.pt && s2.pt > s1.pt),
    sameWorld: !!s1 && !!s2 && s1.worldName === s2.worldName,
  };
});
fs.writeFileSync('/tmp/save-time.json', JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
