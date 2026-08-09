import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.type('input', 'feat4');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, { timeout: 300000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player;
  const tiles = window.__swTiles;
  for (const n of g.entities.npcs) { n.x = (Math.floor(p.cx / 16) - 300) * 16; n.y = p.y; }
  const px = Math.floor(p.cx / 16), py = Math.floor((p.y + p.h) / 16);
  const SW = tiles['v_136_switch'];
  const sx = px + 3, sy = py - 2;
  st.setTile(sx, sy, SW, 0, 0);
  const placedType = st.get(sx, sy);
  const held = p.inv.heldItem();
  const heldKey = held ? window.__swItems && Object.entries(window.__swItems).find(([, v]) => v === held.id)?.[0] : null;
  const vw = g.camera.viewW, vh = g.camera.viewH;
  g.input.mouseX = (sx * 16 + 8 - g.camera.x) * g.camera.zoom + vw / 2;
  g.input.mouseY = (sy * 16 + 8 - g.camera.y) * g.camera.zoom + vh / 2;
  g.input.rightDown = true;
  await sleep(120);
  const rightDownAfter = g.input.rightDown;
  g.input.rightDown = false;
  await sleep(100);
  return {
    placedType, heldKey, selected: p.inv.selected,
    tileUnderMouse: g.camera ? [Math.floor((g.input.mouseX - vw / 2) / g.camera.zoom / 16 + g.camera.x / 16), Math.floor((g.input.mouseY - vh / 2) / g.camera.zoom / 16 + g.camera.y / 16)] : null,
    frameAfter: st.frameX[st.idx(sx, sy)],
    rightDownAfter,
    px, py,
  };
});
console.log(JSON.stringify(out));
await browser.close();
