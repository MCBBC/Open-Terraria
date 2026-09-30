// ★开图 CDP trace 捕获:围绕冷开/热开各 2.5s 采 DevTools trace,交 trace-x-ray 分解
// 用法: SW_ORIGIN=http://localhost:5208 node tools/run-diag.mjs scripts/_map-open-trace.mjs
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const MAP = process.env.MAP_PATH ?? '/Users/vinlic/Downloads/map-天真的钴最高点 (1).json';
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 120)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5208', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const res = await page.evaluate(async (mapText) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(400);
  await window.__swLoadJson(mapText);
  for (let i = 0; i < 300 && !(window.__swGame?.world); i++) await wait(200);
  if (!window.__swGame?.world) return { fail: 'world not ready' };
  await wait(5000);
  return { ok: true };
}, mapText);
if (!res.ok) { console.log(JSON.stringify(res)); await browser.close(); process.exit(1); }
console.log('world ready — start trace');
await page.tracing.start({ path: '/tmp/map-open-trace.json', categories: ['devtools.timeline', 'v8.execute', 'disabled-by-default-devtools.timeline.frame', 'gpu'] });
await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(800);                    // 基线
  window.__swGame.toggleFullMap();    // 冷开
  await wait(2500);                   // 开图+缓动+稳态
  window.__swGame.toggleFullMap();    // 关
  await wait(800);
  window.__swGame.toggleFullMap();    // 热开
  await wait(2000);
  window.__swGame.toggleFullMap();
  await wait(400);
});
await page.tracing.stop();
console.log('trace saved → /tmp/map-open-trace.json');
await browser.close();
