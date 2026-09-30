// BJ426 诊断探针①：右键链路定位（aim 映射/分派可达/tryPlace 门逐级）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const step = async (n) => { for (let i = 0; i < n; i++) { g.fixedUpdate(1 / 60); await raf(); } };
  const items = await import('/src/data/items.ts');
  const tilesMod = await import('/src/data/tiles.ts');
  const T723ID = tilesMod.TILE_BY_KEY['v_723_kite_anchor'];
  const p = g.player;
  const st = g.world.store;
  const R = { trace: [] };
  let sy = 40; for (; sy < st.h - 10 && !st.isSolid(400, sy); sy++) {}
  p.x = 400 * 16; p.y = (sy - 3) * 16; p.vx = 0; p.vy = 0;
  const KITE_VID = 4613;
  const key = items.VANILLA_ITEM_KEY_BY_ID[KITE_VID];
  const id = items.ITEM_BY_KEY[key];
  p.inv.slots.fill(null);
  p.inv.slots[0] = { id, stack: 5, prefix: 0 };
  p.inv.selected = 0;
  g.entities.enemies.length = 0;
  await step(10);
  const def = items.ITEM_DEFS[id];
  R.trace.push(`def: vid=${def?.vid} tile=${def?.tile} key=${def?.key} useStyle=${def?.useStyle ?? 'n/a'}`);
  R.trace.push(`combat: ${JSON.stringify((await import('/src/data/vanillaItemCombat.ts')).itemCombat(KITE_VID))}`);
  // aim 映射验证
  const gx = 403, gy = sy - 1;
  const [sx, sy2] = g.camera.worldToScreen(gx * 16 + 8, gy * 16 + 8);
  g.input.mouseX = sx; g.input.mouseY = sy2;
  const [bx, by] = g.camera.tileUnder(g.input.mouseX, g.input.mouseY);
  R.trace.push(`aim: worldToScreen(${gx},${gy})=(${sx.toFixed(1)},${sy2.toFixed(1)}) tileUnder=(${bx},${by}) zoom=${g.camera.zoom}`);
  // 直接调右键分派（绕过输入面）
  const before = { tile: st.type[st.idx(gx, gy)], stack: p.inv.slots[0].stack };
  const ret = g.rightClickTileNpcDispatch(gx, gy, def);
  R.trace.push(`dispatch(${gx},${gy}) -> ${ret} tile=${st.type[st.idx(gx, gy)]} stack=${p.inv.slots[0].stack} before=${JSON.stringify(before)}`);
  R.trace.push(`rec=${!!g.world.furnitureItems.find((r) => r.x === gx && r.y === gy && r.kind === 'kite_anchor')} ent=${g.leashed.kites.filter((e) => e.ax === gx && e.ay === gy && e.active).length}`);
  // 右键电平 + fixedUpdate 走真链
  st.setTile(gx, gy, 0);   // 清掉直调结果重测
  g.world.furnitureItems.length = 0;
  g.leashed.kites.length = 0;
  p.inv.slots[0] = { id, stack: 5, prefix: 0 };
  g.input.rightDown = true;
  for (let i = 0; i < 6; i++) { g.fixedUpdate(1 / 60); await raf(); }
  g.input.rightDown = false;
  R.trace.push(`after real rightDown: tile=${st.type[st.idx(gx, gy)]} stack=${p.inv.slots[0].stack} ent=${g.leashed.kites.filter((e) => e.ax === gx && e.ay === gy && e.active).length}`);
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
