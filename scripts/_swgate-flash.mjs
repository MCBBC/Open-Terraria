// 门槛闪现探针:完整下载一轮 → reload → 立刻点单人 → 记录 gate 是否出现/时长/版本键
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5311';
// A: 首轮完整下载
await page.goto(origin + '/?sw=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
await sleep(2500);
await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i = 0; i < 90; i++) {
  await sleep(2000);
  const st = await page.evaluate(() => window.__swAssetCache?.state?.() ?? null).catch(() => null);
  if (st && st.done >= st.total && !st.warming) break;
}
const done1 = await page.evaluate(() => ({
  flagKeys: Object.keys(localStorage).filter((k) => k.startsWith('swAssetsComplete')),
  state: window.__swAssetCache?.state?.(),
}));
console.log('首轮完成:', JSON.stringify(done1));
// B: reload → 每毫秒级采样 gate 出现情况,并在菜单出现瞬间点单人
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
let gateSeen = 0, gateFirstAt = 0, gateLastAt = 0, clickedAt = 0, enteredAt = 0;
const t0 = Date.now();
for (let i = 0; i < 600; i++) {
  const r = await page.evaluate(() => {
    const gate = !!document.querySelector('.sw-asset-gate');
    const sp = document.querySelector('[data-act=sp]');
    const charPanel = !!document.querySelector('.sw-list-panel');
    if (sp && !sp.dataset.clk) { sp.dataset.clk = '1'; sp.click(); }
    return { gate, sp: !!sp, charPanel };
  }).catch(() => ({ gate: false }));
  if (r.gate) { gateSeen++; if (!gateFirstAt) gateFirstAt = Date.now() - t0; gateLastAt = Date.now() - t0; }
  if (r.charPanel && !enteredAt) enteredAt = Date.now() - t0;
  if (enteredAt && gateSeen) break;
  await sleep(50);
}
console.log(`B: gate出现=${gateSeen > 0} 采样次数=${gateSeen} 首次=${gateFirstAt}ms 末次=${gateLastAt}ms 进入面板=${enteredAt}ms`);
// C: 完整缓存 reload → 5s 内徽标是否出现(应零出现)
let badgeSeen = 0;
for (let i = 0; i < 50; i++) {
  const has = await page.evaluate(() => !!document.querySelector('.sw-asset-badge')).catch(() => false);
  if (has) badgeSeen++;
  await sleep(100);
}
console.log(`C: 完整缓存 reload 徽标出现采样=${badgeSeen}/50(应 0)`);
await browser.close();
