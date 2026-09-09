import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202' + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 800));
console.log(await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  document.getElementById('sw-welcome-announce')?.remove();
  const st = g.world.store;
  const tx = Math.min(st.w - 2, Math.floor(g.player.x / 16) + 2);
  const ty = Math.min(st.h - 2, Math.floor(g.player.y / 16));
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  st.type[st.idx(tx, ty)] = TILE_BY_KEY['chest'];
  let chest = g.world.chests.find((c) => c.x === tx && c.y === ty);
  if (!chest) { chest = { x: tx, y: ty, items: new Array(40).fill(null) }; g.world.chests.push(chest); }
  ui.openChest = chest;   // 直设(开箱链同效)
  window.__swUI.refreshAll();
  await new Promise((r) => setTimeout(r, 200));
  return JSON.stringify({
    openChest: !!ui.openChest,
    txts: [...document.querySelectorAll('.vinv-txt')].map((b) => ({ t: (b.textContent || '').slice(0, 8), x: b.offsetLeft, y: b.offsetTop, d: b.style.display, op: !!b.offsetParent })),
  });
}));
await browser.close();
