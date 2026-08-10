import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/?play=small&pass=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const TBK = g.tileByKey;
  const CLOSED = TBK['v_388_tall_gate_closed'];
  const OPEN = TBK['v_389_tall_gate_open'];
  const FURNACE = TBK['furnace'];
  const x = Math.floor(g.player.cx / 16) + 10, y = Math.floor(g.player.cy / 16);
  for (let dx = -2; dx <= 2; dx++) st.setTile(x + dx, y + 1, 2);
  for (let dy = 0; dy < 5; dy++) st.setTile(x, y - 4 + dy, CLOSED, 0, dy * 18);
  st.setTile(x + 3, y - 1, FURNACE, 0, 0);
  st.setTile(x + 4, y - 1, FURNACE, 18, 0);
  st.setTile(x + 3, y, FURNACE, 0, 18);
  st.setTile(x + 4, y, FURNACE, 18, 18);
  return { x, y, CLOSED, OPEN, FURNACE, solidCheck: { gate: st.isSolid(x, y - 2), furnace: st.isSolid(x + 3, y - 1) } };
});
await page.evaluate((o) => {
  const g = window.__swGame;
  g.player.x = o.x * 16 - 4; g.player.y = (o.y - 3) * 16;
}, res);
await new Promise((r) => setTimeout(r, 600));
const opened = await page.evaluate((o) => {
  const st = window.__swGame.world.store;
  return { gateNow: st.get(o.x, o.y - 2), openId: o.OPEN };
}, res);
await page.evaluate((o) => {
  const g = window.__swGame;
  g.player.x = (o.x + 6) * 16;
}, res);
await new Promise((r) => setTimeout(r, 800));
const closed2 = await page.evaluate((o) => {
  const st = window.__swGame.world.store;
  return { gateNow: st.get(o.x, o.y - 2), closedId: o.CLOSED };
}, res);
console.log(JSON.stringify({ solidBefore: res.solidCheck, opened, closed2, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
