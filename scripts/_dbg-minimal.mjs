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
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  // bank 注入粘性
  const iid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[71]];
  g.player.banks[0][0] = { id: iid, stack: 500 };
  const immediate = JSON.stringify(g.player.banks[0][0]);
  // 真箱
  const st = g.world.store;
  const tx = Math.min(st.w - 2, Math.floor(g.player.x / 16) + 2);
  const ty = Math.min(st.h - 2, Math.floor(g.player.y / 16));
  st.type[st.idx(tx, ty)] = 22;   // 先试 22?
  return 'SKIP';
}).catch((e) => 'err: ' + String(e).slice(0, 100)));
await browser.close();
