// 射击武器(弓+箭/枪+弹)打假人端到端:真实 PickAmmo 链
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
  st.setTileSilent(px + 10, gy - 1, TILE_BY_KEY['v_378_target_dummy'], 0, 0);
  g.spawnDummyAt(px + 10, gy - 1);
  for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
  const dummy = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 488);
  if (!dummy) return { err: 'no dummy' };
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } = await import('/src/data/items.ts');
  // 木弓 3503? 查 bow key
  const bowKey = VANILLA_ITEM_KEY_BY_ID[3504] ?? VANILLA_ITEM_KEY_BY_ID[388];   // 3504 铜弓(useAmmo 40 真远程)
  const arrowKey = VANILLA_ITEM_KEY_BY_ID[40];
  const r = { bowKey, arrowKey, bowId: ITEM_BY_KEY[bowKey], arrowId: ITEM_BY_KEY[arrowKey] };
  if (r.bowId == null || r.arrowId == null) return { ...r, err: 'missing bow/arrow' };
  // 弹药塞进背包(找空格)
  const inv = g.player.inv;
  inv.slots[54] = { id: r.arrowId, stack: 99 };   // 弹药栏 54-57(PickAmmo 首扫)
  inv.slots[g.player.inv.selected] = { id: r.bowId, stack: 1 };
  g.cb.onInventoryChanged();
  // 玩家退到距假人 ~8 格
  g.player.x = dummy.x - 130; g.player.y = dummy.y - 8;
  g.player.vx = 0; g.player.vy = 0;
  const inp = g.input;
  const z = g.camera.zoom || 1;
  inp.mouseX = 640 + (dummy.cx - g.camera.x) * z;
  inp.mouseY = 400 + (dummy.cy - g.camera.y) * z;
  const hits = [];
  for (let shot = 0; shot < 3; shot++) {
    inp.mouseDown = true;
    const nums0 = g.dmgNumbers.length;
    for (let t = 0; t < 35; t++) {
      g.fixedUpdate(1 / 60);
      if (g.dmgNumbers.length > nums0) { hits.push({ shot, t, shake: dummy.dummyShake,
        num: g.dmgNumbers[g.dmgNumbers.length - 1]?.value }); break; }
    }
    inp.mouseDown = false;
    for (let t = 0; t < 30 && g.player.useTime > 0; t++) g.fixedUpdate(1 / 60);
  }
  return { ...r, hits, nums: g.dmgNumbers.length, ammoLeft: inv.slots[54]?.stack,
    bowDef: { vid: ITEM_DEFS[r.bowId]?.vid, kind: (await import('/src/data/vanillaItemCombat.ts')).combatWeapon(ITEM_DEFS[r.bowId])?.kind } };
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('弓箭命中假人 ≥1 次(shake 跳变)', (out.hits?.length ?? 0) >= 1, JSON.stringify(out.hits?.slice(0, 3)));
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
