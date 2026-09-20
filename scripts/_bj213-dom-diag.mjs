import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(ORIGIN + '/?play=small&bj213f' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 9500));
const diag = await page.evaluate(async () => {
  const g = window.__swGame;
  const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  g.world.flags.hardMode = true;
  const st = g.world.store;
  const ptx = Math.round(g.player.cx / 16), pty = Math.round(g.player.cy / 16);
  const tx = ptx + 4, ty = pty - 2;
  for (let dx = -1; dx <= 6; dx++) for (let dy = -4; dy <= 1; dy++) if (st.inBounds(ptx + dx, pty + dy)) st.setTile(ptx + dx, pty + dy, 0);
  const fx = 28 * 36;
  st.setTile(tx, ty, TILE_BY_KEY['chest'], fx, 0); st.setTile(tx + 1, ty, TILE_BY_KEY['chest'], fx + 18, 0);
  st.setTile(tx, ty + 1, TILE_BY_KEY['chest'], fx, 18); st.setTile(tx + 1, ty + 1, TILE_BY_KEY['chest'], fx + 18, 18);
  const chestData = { x: tx, y: ty, items: new Array(10).fill(null) };
  g.world.chests.push(chestData);
  g.player.inv.slots[10] = { id: invIndexOfVanilla(3092), stack: 1 };
  window.__swUI.openChestPanel(chestData);
  return { idx: g.world.chests.length - 1 };
});
await new Promise((r) => setTimeout(r, 500));
const hit = await page.evaluate(() => {
  const invSlot = document.querySelector('.sw-slot[data-where="inv"][data-idx="10"]');
  const r = invSlot.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const at = document.elementFromPoint(cx, cy);
  const chain = [];
  let e = at;
  while (e && chain.length < 6) { chain.push(`${e.tagName}.${(e.className ?? '').toString().slice(0, 40)}`); e = e.parentElement; }
  // 全部 inv10 槽（classic+vinv 双份?）
  const all = [...document.querySelectorAll('.sw-slot[data-where="inv"][data-idx="10"]')].map((e) => {
    const rr = e.getBoundingClientRect();
    const st = getComputedStyle(e);
    let p = e.parentElement, hidden = false;
    while (p) { const ps = getComputedStyle(p); if (ps.display === 'none') { hidden = true; break; } p = p.parentElement; }
    return { x: rr.x, y: rr.y, w: rr.width, vis: rr.width > 0, disp: st.display, hiddenByParent: hidden, parent: e.parentElement?.className?.slice?.(0, 30) };
  });
  return { cx, cy, hitChain: chain, allInv10: all, invPanelDisplay: window.__swUI.invPanel?.style?.display, layout: window.__swUI._builtLayout };
});
console.log(JSON.stringify(hit, null, 1));
await browser.close();
