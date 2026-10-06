import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${ORIGIN}/?invlayout=legacy`, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  const _s = document.querySelector('select');
  _s.selectedIndex = 0;
  _s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.debugGod = true;
  g.player.inv.slots[0] = { id: g.itemId('vi_9_Wood'), stack: 500 };
});
await page.evaluate(() => { window.__swUI.openInventory(true); });
await new Promise((r) => setTimeout(r, 800));
const peek = await page.evaluate(() => {
  const r = document.querySelector('.sw-recipe');
  const b = r.getBoundingClientRect();
  const cx = Math.round(b.x + b.width / 2), cy = Math.round(b.y + b.height / 2);
  const stack = [];
  let e = document.elementFromPoint(cx, cy);
  const chain = [];
  while (e && chain.length < 6) { chain.push(`${e.tagName}.${e.className}`.slice(0, 80)); e = e.parentElement; }
  // 从行往上找遮挡:列出 233,334 命中元素的全链与行自己的 rect
  const rects = [...document.querySelectorAll('.sw-recipe')].map((r) => { const b = r.getBoundingClientRect(); return { txt: r.textContent.slice(0, 20), x: b.x, y: b.y, w: b.width, h: b.height }; });
  const hit = document.elementFromPoint(cx, cy);
  const bodyKids = [...document.body.children].map((k) => {
    const b = k.getBoundingClientRect?.() ?? {};
    return { tag: k.tagName, cls: (k.className?.baseVal ?? k.className ?? '').toString().slice(0, 40), id: k.id, r: [Math.round(b.x ?? -1), Math.round(b.y ?? -1), Math.round(b.width ?? -1), Math.round(b.height ?? -1)].join(','), pe: getComputedStyle(k).pointerEvents };
  }).filter((k) => k.r !== '-1,-1,-1,-1' || k.tag === 'DIV');
  return { cx, cy, at: `${hit?.tagName}.${hit?.className}`.slice(0, 100), hitStyle: hit ? { pe: getComputedStyle(hit).pointerEvents, z: getComputedStyle(hit).zIndex, pos: getComputedStyle(hit).position } : null, bodyKids, chain, rects, stack };
});
console.log(JSON.stringify(peek, null, 1));
await browser.close();
