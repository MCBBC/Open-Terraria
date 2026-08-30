import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1500, height: 900 }, protocolTimeout: 180000 });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
await page.goto(ORIGIN + '/npc-box-editor.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('#list .row').length > 600, { timeout: 30000 });
await page.evaluate(() => [...document.querySelectorAll('#list .row')].find((r) => r.dataset.id === '22').click());
await new Promise((r) => setTimeout(r, 800));
const st = await page.evaluate(() => ({ biasShown: document.querySelector('#stage') !== null }));
// 直接读内部状态 footBias
const fb = await page.evaluate(() => { const m = window; return (window.__footBiasProbe ?? null); });
void fb;
console.log(JSON.stringify({ errs }), '\n截图落盘…');
const du = await page.evaluate(() => {
  const cv = document.getElementById('stage');
  const d = cv.getContext('2d').getImageData(cv.width >> 2, 40, cv.width - (cv.width >> 1), cv.height - 120);
  const oc = document.createElement('canvas'); oc.width = d.width; oc.height = d.height;
  oc.getContext('2d').putImageData(d, 0, 0);
  return oc.toDataURL('image/png');
});
writeFileSync('/tmp/npc-audit/editor-guide-bias.png', Buffer.from(du.split(',')[1], 'base64'));
console.log('done');
await browser.close();
