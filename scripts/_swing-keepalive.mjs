// 一次性:autoReuse 保活修复复验——①挥击到期不再崩(原 held.vid/key 实例误读)
// ②autoReuse 武器按住保活 t=1 ③非 autoReuse 正常归 null
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let crashed = null;
page.on('pageerror', (e) => { crashed = crashed ?? e.message; console.error('PAGEERROR:', e.message.slice(0, 160)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const { itemCombat, viIdFromKey } = await import('/src/data/vanillaItemCombat.ts');
  let arIdx = -1, plainIdx = -1;
  items.ITEM_DEFS.forEach((d, i) => {
    if (!d || d.tool) return;
    const c = itemCombat(d.vid ?? viIdFromKey(d.key));
    if (!c?.melee) return;
    if (arIdx < 0 && c.autoReuse) arIdx = i;
    if (plainIdx < 0 && !c.autoReuse) plainIdx = i;
  });
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 4;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  for (let dy = -14; dy <= 1; dy++) for (let dx = -20; dx <= 20; dx++) st.setTile(px + dx, gy + dy, 0);
  for (let dx = -20; dx <= 20; dx++) st.setTile(px + dx, gy + 1, 2);
  g.player.x = px * 16; g.player.y = (gy - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  g.player.hp = g.player.maxHp;
  const res = {};
  const swingOnce = (idx, hold) => {
    g.player.inv.selected = 0;
    g.player.inv.slots[0] = { id: idx, stack: 1 };
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < hold; i++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };
  // A: autoReuse 武器按住 120t → swing 恒保活(t 钳 1),无崩
  swingOnce(arIdx, 120);
  res.autoReuse = { key: items.ITEM_DEFS[arIdx]?.key, swingAlive: !!g.swing, t: g.swing?.t ?? null };
  // B: 非 autoReuse 挥一次,到期后归 null,无崩
  for (let i = 0; i < 8; i++) g.fixedUpdate(1 / 60);
  swingOnce(plainIdx, 6);
  const tMid = g.swing?.t ?? null;
  for (let i = 0; i < 80; i++) g.fixedUpdate(1 / 60);
  res.plain = { key: items.ITEM_DEFS[plainIdx]?.key, tMid, expiredToNull: g.swing === null };
  res.noCrash = true;
  return res;
});
console.log(JSON.stringify({ ...out, pageCrashed: crashed }, null, 1));
await browser.close();
