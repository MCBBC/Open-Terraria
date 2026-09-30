import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5630';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 860 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
console.log('[dbg] launching'); await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 }); console.log('[dbg] goto done');
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
console.log('[dbg] flow ok'); await page.evaluate(() => window.__swFlow.newWorld('bj424', 1200, 400)); console.log('[dbg] world gen done');
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
console.log('[dbg] entering evaluate'); const out = await page.evaluate(async () => {
  console.log('[dbg-in] start');
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const M = await import('/src/data/items.ts');
  const idOf = (vid) => M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[vid]];
  const p = g.player;
  const scythe = idOf(164);
  p.inv.slots[0] = { id: scythe, stack: 1 };
  p.inv.selected = 0;
  g.fixedUpdate(1/60);
  const held = p.inv.slots[p.inv.selected];
  const def = M.ITEM_DEFS[held?.id];
  const before = g.entities.projectiles.length;
  const [sx, sy] = g.camera.worldToScreen(p.cx + 130, p.cy);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let t = 0; t < 45; t++) g.fixedUpdate(1/60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  await wait(200);
  return {
    itemKey: def?.key, vid: def?.vid, kind: def?.kind, mana: def?.mana, useTime: def?.useTime,
    selected: p.inv.selected, mouseDownWasSet: g.input.mouseDown, sx, sy,
    projBefore: before, projAfter: g.entities.projectiles.length,
    projIds: g.entities.projectiles.slice(-6).map((q) => q.projId),
    itemAnimation: p.itemAnimation, manaNow: Math.round(p.mana), useStylePath: p.useTime,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
