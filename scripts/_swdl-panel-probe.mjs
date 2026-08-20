// 下载详情面板探针:清缓存→等徽标→点开面板→断言 MB 文案格式/单调递增/门槛 MB 口径
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, e = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${e ? '  ' + e : ''}`); ok ? pass++ : fail++; };
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5311') + '/?sw=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
await sleep(2500);
await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
// 等徽标出现并点开面板
let clicked = false;
for (let i = 0; i < 40 && !clicked; i++) {
  await sleep(1500);
  clicked = await page.evaluate(() => {
    const b = document.querySelector('.sw-asset-badge');
    if (!b) return false;
    b.click();
    return !!document.querySelector('.sw-asset-panel');
  }).catch(() => false);
}
check('① 徽标可点开详情面板', clicked);
const mbRe = /^(\d+(?:\.\d+)?) MB \/ (\d+(?:\.\d+)?) MB$/;
let snapA = null, snapB = null;
for (let i = 0; i < 12; i++) {
  snapA = await page.evaluate(() => ({
    mb: document.querySelector('.sw-asset-panel .sw-asset-mb')?.textContent ?? '',
    pct: document.querySelector('.sw-asset-panel .sw-asset-pct')?.textContent,
    bar: document.querySelector('.sw-asset-panel .slot > div')?.style.width,
    note: document.querySelector('.sw-asset-panel .sw-asset-note')?.textContent ?? '',
  })).catch(() => null);
  if (snapA?.mb && mbRe.test(snapA.mb.split('·')[0].trim())) break;
  await sleep(2000);
}
check('② 面板 MB 文案格式(已下载 X MB / 目标 Y MB)', !!snapA && mbRe.test(snapA.mb.split('·')[0].trim()), JSON.stringify(snapA).slice(0, 140));
await sleep(2500);
snapB = await page.evaluate(() => ({
  mb: document.querySelector('.sw-asset-panel .sw-asset-mb')?.textContent ?? '',
  done: window.__swAssetCache?.state?.()?.bytesDone ?? -1,
  total: window.__swAssetCache?.state?.()?.bytesTotal ?? -1,
})).catch(() => null);
const a = parseFloat(snapA?.mb?.split(' ')[0] ?? '0');
const b = parseFloat(snapB?.mb?.split(' ')[0] ?? '0');
check('③ 下载中 MB 实时递增', b > a, `${a} MB → ${b} MB (state ${snapB?.done}/${snapB?.total})`);
check('④ 目标 MB 与分片 zip 总量同量级(>200MB)', snapB ? snapB.total > 200 * 1048576 : false, `bytesTotal=${snapB?.total}`);
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
