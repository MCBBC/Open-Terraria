// 假人受击视觉三件套实测:挥击→截图帧动画区+飘字区像素
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
  st.setTileSilent(px + 3, gy - 1, TILE_BY_KEY['v_378_target_dummy'], 0, 0);
  g.spawnDummyAt(px + 3, gy - 1);
  for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
  const dummy = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 488);
  if (!dummy) return { err: 'no dummy' };
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const key = VANILLA_ITEM_KEY_BY_ID[3508];
  g.player.x = dummy.x - 50; g.player.y = dummy.y - 10;
  g.player.inv.slots[g.player.inv.selected] = { id: ITEM_BY_KEY[key], stack: 1 };
  g.cb.onInventoryChanged();
  const inp = g.input;
  const z = g.camera.zoom || 1;
  inp.mouseX = 640 + (dummy.cx - g.camera.x) * z;
  inp.mouseY = 400 + (dummy.cy - g.camera.y) * z;
  inp.mouseDown = true;
  const hits = [];
  for (let t = 0; t < 60; t++) {
    const before = dummy.dummyShake;
    g.fixedUpdate(1 / 60);
    if (dummy.dummyShake > before) hits.push({ t, shake: dummy.dummyShake, nums: g.dmgNumbers.length,
      numText: g.dmgNumbers[g.dmgNumbers.length - 1]?.label ?? g.dmgNumbers[g.dmgNumbers.length - 1]?.value });
  }
  inp.mouseDown = false;
  return { hits, totalNums: g.dmgNumbers.length, lastNum: g.dmgNumbers[g.dmgNumbers.length - 1] };
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('挥击命中假人(shake 跳变+飘字)', (out.hits?.length ?? 0) >= 1 && (out.hits?.[0]?.numText ?? 0) > 0, JSON.stringify(out.hits?.slice(0, 3)));
check('伤害飘字出现', (out.totalNums ?? 0) > 0, JSON.stringify(out.lastNum));
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
