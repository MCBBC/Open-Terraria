// BJ219 world-load instrument（菜单→__swLoadJson 全程 console 进度）
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (12).json';
const browser = await puppeteer.launch({ protocolTimeout: 900000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('console', async (m) => {
  const t = m.text();
  if (/sw219/i.test(t)) { console.log('PAGE:', t.slice(0, 160)); return; }
  if (m.type() === 'error') {
    for (const a of m.args()) { try { console.log('ERR:', JSON.stringify(await a.jsonValue()).slice(0, 300)); } catch { console.log('ERR:<unserializable>'); } }
  }
});
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 160)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5204') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 180000 });
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); break; }
  catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const out = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  console.log('sw219: loadJson start');
  await window.__swLoadJson(t);
  console.log('sw219: loadJson done');
  for (let i = 0; i < 600 && !window.__swGame?.world; i++) await wait(200);
  console.log('sw219: world=' + !!window.__swGame?.world);
  return window.__swGame?.world ? { ok: true } : { fail: 'world' };
}, mapText);
console.log('RESULT:' + JSON.stringify(out));
await browser.close();
