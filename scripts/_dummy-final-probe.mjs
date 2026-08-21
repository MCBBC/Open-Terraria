// 假人受击全链:放置→近战挥击→查 shake/飘字/帧动画
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 400_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[PAGEERR]', String(e).slice(0, 200)));
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
  st.setTileSilent(px + 4, gy - 1, TILE_BY_KEY['v_378_target_dummy'], 0, 0);
  g.spawnDummyAt(px + 4, gy - 1);
  for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
  const dummy = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 488);
  if (!dummy) return { err: 'no dummy' };
  const { ITEM_BY_KEY, ITEM_DEFS } = await import('/src/data/items.ts');
  // 用真阔剑(3508 copper broadsword? 查 key)——3507 是短剑(spear 161)
  const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const key = VANILLA_ITEM_KEY_BY_ID[3508] ?? 'vi_3507_copper_shortsword';   // 铜阔剑(真近战 kind)
  const id = ITEM_BY_KEY[key];
  const def = ITEM_DEFS[id];
  const { combatWeapon } = await import('/src/data/vanillaItemCombat.ts');
  const cw = combatWeapon(def);
  g.player.x = dummy.x - 55; g.player.y = dummy.y - 10;
  g.player.vx = 0; g.player.vy = 0;
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 1 };
  g.cb.onInventoryChanged();
  const inp = g.input;
  const z = g.camera.zoom || 1;
  inp.mouseX = 640 + (dummy.cx - g.camera.x) * z;
  inp.mouseY = 400 + (dummy.cy - g.camera.y) * z;
  inp.mouseDown = true;
  const trace = [];
  for (let t = 0; t < 45; t++) {
    g.fixedUpdate(1 / 60);
    if (t % 6 === 0) trace.push(`t${t}: swing=${!!g.swing} shake=${dummy.dummyShake} nums=${g.dmgNumbers.length} iframes=${dummy.iframes}`);
  }
  inp.mouseDown = false;
  return { key, cwKind: cw?.kind ?? 'NULL', cwDmg: cw?.damage, trace,
    shake: dummy.dummyShake, nums: g.dmgNumbers.length,
    playerToDummy: Math.round(dummy.cx - g.player.cx), dummyW: dummy.w };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
