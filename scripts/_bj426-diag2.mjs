// BJ426 诊断探针②：位置门矩阵 + 飞行态右键 + 连发面。
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
  const R = { trace: [], cases: [] };
  let sy = 40; for (; sy < st.h - 10 && !st.isSolid(400, sy); sy++) {}
  const KITE_VID = 4613;
  const key = items.VANILLA_ITEM_KEY_BY_ID[KITE_VID];
  const id = items.ITEM_BY_KEY[key];
  const give = (stack) => { p.inv.slots.fill(null); p.inv.slots[0] = { id, stack, prefix: 0 }; p.inv.selected = 0; };
  const pin = () => { p.x = 400 * 16; p.y = (sy - 3) * 16; p.vx = 0; p.vy = 0; };
  g.entities.enemies.length = 0;
  pin(); give(99);
  await step(10);
  const aim = (tx_, ty_) => {
    const [sx, sy2] = g.camera.worldToScreen(tx_ * 16 + 8, ty_ * 16 + 8);
    g.input.mouseX = sx; g.input.mouseY = sy2;
  };
  const rc = async (tx_, ty_, frames = 5) => {
    aim(tx_, ty_);
    g.input.rightDown = true;
    for (let i = 0; i < frames; i++) { pin(); g.fixedUpdate(1 / 60); await raf(); g.entities.enemies.length = 0; }
    g.input.rightDown = false;
    for (let i = 0; i < 2; i++) { pin(); g.fixedUpdate(1 / 60); await raf(); }
  };
  const state = (x, y) => ({
    tile: st.type[st.idx(x, y)],
    placed: st.type[st.idx(x, y)] === T723ID,
    rec: !!g.world.furnitureItems.find((r) => r.x === x && r.y === y && r.kind === 'kite_anchor'),
    ent: g.leashed.kites.filter((e) => e.ax === x && e.ay === y && e.active).length,
    stack: p.inv.slots[0]?.stack ?? 0,
  });
  const clearAll = () => {
    g.world.furnitureItems.length = 0;
    g.leashed.kites.length = 0;
    for (let x = 390; x < 480; x++) for (let y = sy - 30; y < sy + 5; y++) {
      if (st.inBounds(x, y) && st.type[st.idx(x, y)] === T723ID) st.setTile(x, y, 0);
    }
  };

  // ①a 远距离（>5 格）空中
  give(99); clearAll(); await step(2);
  await rc(430, sy - 6);
  R.cases.push({ c: 'far-air(30格远)', ...state(430, sy - 6) });
  // ①b 近距空中无支撑
  clearAll();
  await rc(403, sy - 6);
  R.cases.push({ c: 'near-air(近距空中)', ...state(403, sy - 6) });
  // ①c 近距空中+背后墙
  clearAll();
  st.wall[st.idx(403, sy - 6)] = 1;
  await rc(403, sy - 6);
  R.cases.push({ c: 'near-air+wall', ...state(403, sy - 6) });
  st.wall[st.idx(403, sy - 6)] = 0;
  // ①d 侧邻实心（AnchorLeft/Right 原版档）
  clearAll();
  {
    const ax = 403, ay = sy - 3;                       // 空中,左邻 (402,ay) 置实心
    st.setTile(402, ay, 1, 0, 0);
    await rc(ax, ay);
    R.cases.push({ c: 'side-solid(左邻实心)', x: ax, y: ay, ...state(ax, ay) });
    st.setTile(402, ay, 0);
  }
  // ①e 吊顶（AnchorTop 原版档：上方实心）
  clearAll();
  {
    const ax = 403, ay = sy - 3;
    st.setTile(403, ay - 1, 1, 0, 0);
    await rc(ax, ay);
    R.cases.push({ c: 'ceiling(上方实心)', x: ax, y: ay, ...state(ax, ay) });
    st.setTile(403, ay - 1, 0);
  }
  // ①f 平台顶（AnchorBottom SolidWithTop）
  clearAll();
  {
    const ax = 403, ay = sy - 3;
    st.setTile(403, ay + 1, 19, 0, 0);                 // 平台
    await rc(ax, ay);
    R.cases.push({ c: 'platform-top(平台支撑)', x: ax, y: ay, ...state(ax, ay) });
    st.setTile(403, ay + 1, 0);
  }
  // ①g 草面（tileCut 目标——原版 CanPlace 豁免+清格）
  clearAll();
  {
    const ax = 403, ay = sy - 1;
    if (st.inBounds(ax, ay)) {
      st.setTile(ax, ay + 1, 1, 0, 0);                 // 下方泥
      st.setTile(ax, ay, 3, 0, 0);                     // 目标草(tileCut)
      await rc(ax, ay);
      R.cases.push({ c: 'grass-target(草面)', x: ax, y: ay, ...state(ax, ay) });
      st.setTile(ax, ay + 1, 0);
    }
  }
  // ①h 按住右键拖动连放（多桩面）
  clearAll(); give(99);
  {
    aim(403, sy - 1);
    g.input.rightDown = true;
    for (const dx of [0, 2, 4, 6]) {
      aim(403 + dx, sy - 1);
      for (let i = 0; i < 4; i++) { pin(); g.fixedUpdate(1 / 60); await raf(); }
    }
    g.input.rightDown = false;
    await step(3);
    let n = 0;
    for (let x = 395; x < 415; x++) if (st.type[st.idx(x, sy - 1)] === T723ID) n++;
    R.cases.push({ c: 'hold-drag(按住连放4点位)', placedCount: n, stack: p.inv.slots[0]?.stack ?? 0 });
  }
  clearAll();
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
