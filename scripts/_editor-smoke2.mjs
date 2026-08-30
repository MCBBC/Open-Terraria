import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1500, height: 900 }, protocolTimeout: 180000 });
const page = await browser.newPage();
await page.goto(ORIGIN + '/npc-box-editor.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('#list .row').length > 600, { timeout: 30000 });
// 选 EoS #6(ay=26 非零)
await page.evaluate(() => [...document.querySelectorAll('#list .row')].find((r) => r.dataset.id === '6').click());
await new Promise((r) => setTimeout(r, 700));
const st = await page.evaluate(() => {
  const cv = document.getElementById('stage');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let uniq = new Set();
  for (let i = 0; i < d.length; i += 97 * 4) uniq.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
  return {
    uniqColors: uniq.size,
    nonBgPixels: (() => { let n = 0; for (let i = 0; i < d.length; i += 16 * 4) { if (!(d[i]<60&&d[i+1]<60&&d[i+2]<70)) n++; } return n; })(),
    info: document.getElementById('info').textContent,
  };
});
console.log(JSON.stringify(st));
const du = await page.evaluate(() => {
  const cv = document.getElementById('stage');
  const d = cv.getContext('2d').getImageData(cv.width >> 2, 40, cv.width - (cv.width >> 1), cv.height - 80);
  const oc = document.createElement('canvas'); oc.width = d.width; oc.height = d.height;
  oc.getContext('2d').putImageData(d, 0, 0);
  return oc.toDataURL('image/png');
});
writeFileSync('/tmp/npc-audit/editor-eos.png', Buffer.from(du.split(',')[1], 'base64'));
// 导出 EoS 检查 base.by
await page.evaluate(() => document.getElementById('exportBtn').click());
const ex = await page.evaluate(() => JSON.parse(document.getElementById('expTa').value).edits.filter((e) => !e.delta.dw && !e.delta.dh && !e.delta.dx && !e.delta.dy).length); // 未改动不应出现
console.log('未改动的 EoS 出现在导出中?', ex);
await browser.close();
