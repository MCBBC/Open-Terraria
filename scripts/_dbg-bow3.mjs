import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 400_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.player.cy / 16);
  while (gy < st.h - 4 && !st.isSolid(px, gy)) gy++;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  st.setTileSilent(px + 10, gy - 1, TILE_BY_KEY['v_378_target_dummy'], 0, 0);
  g.spawnDummyAt(px + 10, gy - 1);
  for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
  const dummy = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 488);
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const inv = g.player.inv;
  inv.slots[54] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[40]], stack: 99 };
  inv.slots[g.player.inv.selected] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3504]], stack: 1 };
  g.cb.onInventoryChanged();
  // 玩家站到与假人同高、正后方 6 格(消除弹道落差/障碍变量)
  g.player.x = dummy.x - 100; g.player.y = dummy.y;
  const inp = g.input;
  const z = g.camera.zoom || 1;
  inp.mouseX = 640 + (dummy.cx - g.camera.x) * z;
  inp.mouseY = 400 + (dummy.cy - g.camera.y) * z;
  inp.mouseDown = true;
  let arrowSeen = null;
  const trace = [];
  for (let t = 0; t < 40; t++) {
    g.fixedUpdate(1 / 60);
    if (t % 5 === 0) trace.push(`t${t}: player@${Math.round(g.player.cx)},${Math.round(g.player.cy)} useTime=${g.player.useTime} heldKey=${(await import('/src/data/items.ts')).ITEM_DEFS[g.player.inv.slots[g.player.inv.selected]?.id]?.key} projs=${g.entities.projectiles.length}`);
    const arrows = g.entities.projectiles.filter((p) => p.projId === 1);
    if (arrows.length && !arrowSeen) arrowSeen = arrows[0];
    if (arrowSeen) {
      trace.push(`ARROW t${t}: @${Math.round(arrowSeen.x)},${Math.round(arrowSeen.y)} dead=${arrowSeen.dead}`);
      if (arrowSeen.dead) break;
    }
  }
  return { trace: trace.slice(0, 12), shake: dummy.dummyShake, nums: g.dmgNumbers.length,
    py: Math.round(g.player.y), dy: Math.round(dummy.y) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
