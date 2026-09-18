import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 150 && !(await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
for (let i = 0; i < 150 && !(await page.evaluate(() => !!(window.__swGame && window.__swGame.world && window.__swGame.world.store && window.__swGame.world.store.w === 4200)).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 2000));
const armed = await page.evaluate(async () => {
  const g = window.__swGame;
  const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const key = VANILLA_ITEM_KEY_BY_ID[273];
  const iid = window.__swItems[key];
  g.player.inv.add(iid, 1);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === iid);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  const it = slots[0];
  return { key, iid, defKeys: it && it.def ? { vid: it.def.vid, key: it.def.key, name: it.def.name, shoot: it.def.shoot, useAnimation: it.def.useAnimation, use: it.def.use } : null };
});
console.log('armed:', JSON.stringify(armed));
await page.evaluate(() => { window.__swGame.input.mouseDown = true; });
await new Promise((r) => setTimeout(r, 60));
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
await new Promise((r) => setTimeout(r, 100));
const dump = await page.evaluate(() => {
  const g = window.__swGame;
  const projs = (g.entities.projectiles ?? []).map((e) => ({ cls: e.constructor?.name, projId: e.projId, op: e.op, t: e.t, x: +e.x.toFixed(0), y: +e.y.toFixed(0) }));
  return { projs: projs.slice(0, 6), useTime: g.player.useTime, heldVid: g.player.heldVid ?? null };
});
console.log('dump:', JSON.stringify(dump));
await browser.close();
