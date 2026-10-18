// 一次性:世界列表「导入世界」E2E(2026-08-27 用户需求)——
//  标题→单人→(必要时建角)→世界列表→导入 .wld / 本仓 .json / 非法扩展名三案:
//  断言行数+1、仍停在世界列表(不进世界)、按钮 loading 态复原、toast 文案。
import { REPO_ROOT, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('sw-boot-prime') && !document.getElementById('sw-splash'), { timeout: 240000, polling: 500 });
await sleep(500);

// ---- 走到世界列表：单人 → 角色行（空则建角）----
await page.click('[data-act=sp]');
await sleep(500);
let charRows = await page.$$eval('.sw-vsel-list .sw-vitem', (xs) => xs.length).catch(() => 0);
if (!charRows) {
  await page.click('[data-act=new]');            // 角色面板新建
  await page.waitForSelector('[data-act=create]', { timeout: 10000 });
  await sleep(400);
  await page.click('[data-act=create]');
  await sleep(600);
  charRows = await page.$$eval('.sw-vsel-list .sw-vitem', (xs) => xs.length).catch(() => 0);
}
await page.click('.sw-vsel-list .sw-vitem');     // 选角色 → 世界列表
await page.waitForSelector('[data-act=import]', { timeout: 10000 });
await sleep(400);

const rows0 = await page.$$eval('.sw-vsel-list .sw-vitem', (xs) => xs.length);
const out = { rows0 };

// ---- 案1：导入 .wld ----
const wldInput = await page.$('.sw-vsel input[type=file]');
await wldInput.uploadFile(join(REPO_ROOT, 'tests/golden/wld/12345世界.wld'));
await page.waitForFunction((n) => document.querySelectorAll('.sw-vsel-list .sw-vitem').length > n,
  { timeout: 60000 }, rows0);
await sleep(300);
out.wld = {
  rows1: await page.$$eval('.sw-vsel-list .sw-vitem', (xs) => xs.length),
  stillOnList: !!(await page.$('[data-act=import]')),
  btnText: await page.$eval('[data-act=import]', (b) => b.textContent),
  btnEnabled: await page.$eval('[data-act=import]', (b) => !b.disabled),
};

// ---- 案2：导入本仓 .json（取既有世界档原文改名单上传）----
const json = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('sandboxworld', 2);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const keys = await new Promise((res, rej) => {
    const rq = db.transaction('kv').objectStore('kv').getAllKeys();
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
  const k = keys.find((x) => /^sandboxworld\.world\.\d+$/.test(x));
  if (!k) return null;
  return await new Promise((res, rej) => {
    const rq = db.transaction('kv').objectStore('kv').get(k);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
});
if (json) {
  const obj = JSON.parse(json);
  obj.header = obj.header ?? {};
  obj.header.name = '导入测试' + Date.now() % 1000;
  writeFileSync('/tmp/sw-import-test.json', JSON.stringify(obj));
  await wldInput.uploadFile('/tmp/sw-import-test.json');
  await page.waitForFunction((n) => document.querySelectorAll('.sw-vsel-list .sw-vitem').length > n,
    { timeout: 30000 }, out.wld.rows1);
  await sleep(300);
  out.json = { rows2: await page.$$eval('.sw-vsel-list .sw-vitem', (xs) => xs.length) };
}

// ---- 案3：非法扩展名 ----
writeFileSync('/tmp/sw-import-bad.txt', 'not a world');
await wldInput.uploadFile('/tmp/sw-import-bad.txt');
await sleep(500);
out.badExt = { rows3: await page.$$eval('.sw-vsel-list .sw-vitem', (xs) => xs.length) };

// ---- toast 文案抓取 ----
out.toasts = await page.evaluate(() =>
  [...document.querySelectorAll('.sw-toast, [class*="toast"]')].map((t) => t.textContent).slice(-4));
out.finalOnList = !!(await page.$('[data-act=import]'));
console.log(JSON.stringify(out, null, 1));
await browser.close();
