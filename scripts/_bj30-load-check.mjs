// SW-BJ30: load 诊断（loadJson 是否完成/是否有弹窗）
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5217';
const MAP = process.env.SW_MAP ?? needInput(join(DOWNLOADS, 'map-Starter_World (23).json'));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 832 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (!/vite|SourceMap|Download the React/.test(t)) console.log('CONSOLE:', t.slice(0, 200)); });
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
console.log('[flow ready] loadJson start');
const p = page.evaluate(async (t) => {
  await window.__swFlow.loadJson(t);
  return 'loadJson resolved';
}, fs.readFileSync(MAP, 'utf8'));
const winner = await Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT-120s'), 120000))]);
console.log('[loadJson]:', winner);
await page.screenshot({ path: '/tmp/bj30/load-state.png' });
const state = await page.evaluate(() => ({
  hasGame: !!window.__swGame,
  hasWorld: !!(window.__swGame?.world?.store?.w),
  worldW: window.__swGame?.world?.store?.w,
  generating: window.__swGame?.world?.generating,
  dialogs: [...document.querySelectorAll('div')].filter((d) => d.textContent && /加载|失败|错误|版本|Error/i.test(d.textContent) && d.children.length < 6 && d.getBoundingClientRect().height < 400 && d.getBoundingClientRect().height > 20).slice(0, 5).map((d) => d.textContent.trim().slice(0, 120)),
}).catch((e) => ({ err: String(e).slice(0, 200) })));
console.log(JSON.stringify(state, null, 2));
await browser.close();
