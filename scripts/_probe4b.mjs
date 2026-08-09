import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
page.on('console', m => { const t = m.text(); if (t.includes('trap') || t.includes('Dart')) console.log('CON:', t.slice(0,200)); });
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'feat4');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player;
  const tiles = window.__swTiles;
  for (const n of g.entities.npcs) { n.x = (Math.floor(p.cx/16) - 300) * 16; n.y = p.y; }
  const px = Math.floor(p.cx / 16), py = Math.floor((p.y + p.h) / 16);
  const LEVER = tiles['v_132_lever'], TRAP = tiles['v_137_traps'];
  const lx = px - 3, ly = py - 2, tx2 = px - 8, ty2 = py - 2;
  for (let x = lx; x >= tx2; x--) { if (st.isActive(x, ly)) st.setTile(x, ly, 0); if (st.isActive(x, ly+1)) st.setTile(x, ly+1, 0); }
  st.setTile(lx, ly, LEVER, 0, 0);
  st.setTile(tx2, ty2, TRAP, 0, 0);
  const leverPlaced = st.get(lx, ly), trapPlaced = st.get(tx2, ty2);
  const vw = g.camera.viewW, vh = g.camera.viewH;
  g.input.mouseX = (lx * 16 + 8 - g.camera.x) * g.camera.zoom + vw / 2;
  g.input.mouseY = (ly * 16 + 8 - g.camera.y) * g.camera.zoom + vh / 2;
  g.input.rightDown = true;
  await sleep(200);
  g.input.rightDown = false;
  await sleep(300);
  const leverFrame = st.frameX[st.idx(lx, ly)];
  const darts = g.entities.projectiles.map(e => e.constructor.name);
  const before = g.entities.projectiles.length;
  return { leverPlaced, trapPlaced, leverFrame, darts, before };
});
console.log(JSON.stringify(out));
await browser.close();
