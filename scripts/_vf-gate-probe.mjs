// vf 转正门态探针:验证默认开/?vf=0 强制关/localStorage 持久关 三种门态。
// VFP_CASE=default|url0|ls0
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const CASE = process.env.VFP_CASE ?? 'default';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
if (CASE === 'ls0') {
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('sw_vanilla_framing', '0'); } catch {} });
}
await p.goto(`${ORIGIN}/?nosw${CASE === 'url0' ? '&vf=0' : ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
for (let i = 0; i < 30; i++) {
  const ok = await p.evaluate(async () => {
    try { const m = await import('/src/render/VanillaTiler.ts'); return typeof m.isVanillaFramingEnabled === 'function'; } catch { return false; }
  });
  if (ok) break;
  await sleep(1000);
}
const on = await p.evaluate(async () => {
  const m = await import('/src/render/VanillaTiler.ts');
  return m.isVanillaFramingEnabled();
});
console.log(JSON.stringify({ case: CASE, enabled: on }));
await b.close();
