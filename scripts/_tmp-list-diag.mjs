// 一次性诊断:世界列表溢出——量 flex 链各层 computed 值
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  const ready = await page.evaluate(() => ({
    menu: !!document.querySelector('.sw-title-menu'),
    splashUp: !!document.querySelector('#sw-splash'),
  }));
  if (ready.menu && !ready.splashUp) break;
  await new Promise((r) => setTimeout(r, 100));
}
// 播种 8 行
await page.evaluate(async () => {
  const put = (key, val) => new Promise((res, rej) => {
    const req = indexedDB.open('sandboxworld', 2);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(JSON.stringify(val), key);
      tx.oncomplete = () => { db.close(); res(true); };
      tx.onerror = () => rej(tx.error);
    };
  });
  const now = Date.now();
  const rgb = (r, g, b) => ({ r, g, b });
  await put('sandboxworld.players.index', Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: '角色' + i, difficulty: 0, createdAt: now - i })));
  for (let i = 0; i < 8; i++) {
    await put(`sandboxworld.player.${i + 1}`, {
      name: '角色' + i, hair: 1, skinVariant: 0, hairColor: rgb(160, 60, 20), skinColor: rgb(255, 190, 150),
      eyeColor: rgb(60, 60, 120), shirtColor: rgb(200, 60, 50), undershirtColor: rgb(230, 230, 230),
      pantsColor: rgb(80, 90, 180), shoeColor: rgb(120, 80, 40), difficulty: 0,
    });
  }
  await put('sandboxworld.worlds.index', []);
});
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  const ready = await page.evaluate(() => ({
    menu: !!document.querySelector('.sw-title-menu'),
    splashUp: !!document.querySelector('#sw-splash'),
  }));
  if (ready.menu && !ready.splashUp) break;
  await new Promise((r) => setTimeout(r, 100));
}
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.sw-title-btn')].find((b) => /单人|Single/.test(b.textContent ?? ''));
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 800));
const m = await page.evaluate(() => {
  const cs = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(r.bottom),
      maxH: s.maxHeight, minH: s.minHeight, display: s.display, flex: s.flex, overflowY: s.overflowY,
      position: s.position };
  };
  const root = document.querySelector('.sw-vsel');
  const panel = root.querySelector('.sw-vsel-panel');
  const list = root.querySelector('.sw-vsel-list');
  return {
    innerW: innerWidth, innerH: innerHeight,
    mediaA: matchMedia('(max-width: 560px)').matches,
    mediaB: matchMedia('(max-height: 500px)').matches,
    root: cs(root), panel: cs(panel), list: cs(list),
    listScrollH: list.scrollHeight, listClientH: list.clientHeight,
    styleMatched: (() => {
      // 检查 #sw-list-style 内容是否含 min-height:0(新 CSS 已注入)
      const st = document.getElementById('sw-list-style');
      return { hasStyle: !!st, hasMinHeight0: st?.textContent.includes('min-height: 0') ?? false,
        hasMedia560: st?.textContent.includes('max-width: 560px') ?? false };
    })(),
  };
});
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: '/tmp/va-diag-list.png' });
await browser.close();
