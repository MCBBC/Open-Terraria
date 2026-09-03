import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 8;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  const py = gy - 6;
  g.player.x = px * 16; g.player.y = (py - 4) * 16;
  const key = items.VANILLA_ITEM_KEY_BY_ID[3509];
  g.player.inv.selected = 0; g.player.inv.slots[0] = { id: items.ITEM_BY_KEY[key], stack: 1 };
  const sx = g.camera.worldToScreen((px + 4) * 16 + 8, (py + 1) * 16 + 8);
  g.input.mouseX = sx[0]; g.input.mouseY = sx[1];
  const p = g.player;
  const log = [];
  const d = Object.getOwnPropertyDescriptor(p, 'cursorItemIconEnabled');
  Object.defineProperty(p, 'cursorItemIconEnabled', {
    get() { return d.get.call(this); },
    set(v) { log.push((new Error().stack || '').split('\n').filter(l => l.includes('src/')).slice(0, 2).join(' <- ') + ' => ' + v); d.set.call(this, v); },
    configurable: true,
  });
  g.fixedUpdate(1 / 60);
  const after1 = p.cursorItemIconEnabled;
  Object.defineProperty(p, 'cursorItemIconEnabled', d);
  return { log, after1, uiBlocking: g.input.uiBlocking, dead: p.dead, def: g.player.inv.slots[0] };
});
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
await browser.close();
