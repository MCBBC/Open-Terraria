// ★BJ213 探针第五波（终极）：真实 DOM 鼠标事件全链复现用户操作
//  vinv(vanilla) 布局；两段点击（点背包槽拿起 → 点箱槽放下）；两种关箱方式分组测。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const boot = async (tag) => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/?play=small&bj213e' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let ok = false;
  for (let i = 0; i < 90 && !ok; i++) {
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ok) throw new Error(tag + ' 未进游戏');
  await new Promise((r) => setTimeout(r, 9500));
  return { browser, page, errors };
};

const runCase = async (closeMode) => {
  const { browser, page, errors } = await boot('DOM-' + closeMode);
  const fx = await page.evaluate(async () => {
    const g = window.__swGame;
    const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    g.world.flags.hardMode = true;
    const st = g.world.store;
    const ptx = Math.round(g.player.cx / 16), pty = Math.round(g.player.cy / 16);
    const tx = ptx + 4, ty = pty - 2;
    for (let dx = -1; dx <= 6; dx++) for (let dy = -4; dy <= 1; dy++) {
      if (st.inBounds(ptx + dx, pty + dy)) st.setTile(ptx + dx, pty + dy, 0);
    }
    const fx = 28 * 36;
    st.setTile(tx, ty, TILE_BY_KEY['chest'], fx, 0);
    st.setTile(tx + 1, ty, TILE_BY_KEY['chest'], fx + 18, 0);
    st.setTile(tx, ty + 1, TILE_BY_KEY['chest'], fx, 18);
    st.setTile(tx + 1, ty + 1, TILE_BY_KEY['chest'], fx + 18, 18);
    const chestData = { x: tx, y: ty, items: new Array(10).fill(null) };
    g.world.chests.push(chestData);
    const keyIid = invIndexOfVanilla(3092);
    g.player.inv.slots[10] = { id: keyIid, stack: 1 };
    window.__swUI.openChestPanel(chestData);
    return { idx: g.world.chests.length - 1, keyIid };
  });
  await new Promise((r) => setTimeout(r, 400));
  // vinv 布局坐标：优先 data-sw 布局槽；vinv 槽由 paint 循环定位——等 paint 后读 rect
  const coords = await page.evaluate(() => {
    const q = (sel) => {
      const els = [...document.querySelectorAll(sel)];
      return els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, vis: r.width > 0 && r.height > 0 }; });
    };
    return {
      inv10: q('.sw-slot[data-where="inv"][data-idx="10"]')[0] ?? null,
      chest0: q('.sw-slot[data-where="chest"][data-idx="0"]')[0] ?? null,
    };
  });
  const res = { coords: { inv10: coords.inv10, chest0: coords.chest0 } };
  if (coords.inv10?.vis && coords.chest0?.vis) {
    // 两段点击：拿起背包钥匙 → 点箱槽放下（真实 UI 事件）
    await page.mouse.move(coords.inv10.x, coords.inv10.y);
    await page.mouse.down(); await page.mouse.up();
    await new Promise((r) => setTimeout(r, 120));
    const afterPick = await page.evaluate((fx) => ({ held: window.__swUI.heldStack?.id ?? null, keyIid: fx.keyIid }), fx);
    await page.mouse.move(coords.chest0.x, coords.chest0.y);
    await page.mouse.down(); await page.mouse.up();
    await new Promise((r) => setTimeout(r, 120));
    const state = await page.evaluate((fx) => {
      const ui = window.__swUI;
      const c = window.__swGame.world.chests[fx.idx];
      return { held: ui.heldStack?.id ?? null, chestItem0: c.items[0]?.id ?? null };
    }, fx);
    res.afterPick = afterPick; res.state = state;
    // 关箱
    if (closeMode === 'esc') await page.keyboard.press('Escape');
    else await page.evaluate(() => window.__swUI.closeInventory());
    await new Promise((r) => setTimeout(r, 1300));
    res.verdict = await page.evaluate((fx) => {
      const g = window.__swGame;
      const mimic = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 475);
      return {
        chestGone: !g.world.chests[fx.idx] || g.world.chests[fx.idx].items[0] === undefined ? true : false,
        mimic475: mimic ? { x: Math.round(mimic.x), hp: mimic.hp } : null,
      };
    }, fx);
  } else {
    res.skip = 'slot coords not visible';
    res.verdict = { note: 'fallback programmatic', ...(await page.evaluate((fx) => {
      const g = window.__swGame; const ui = window.__swUI;
      const c = g.world.chests[fx.idx];
      if (ui.openChest === c) { ui.pickUp(10, 'inv'); ui.placeHeld(0, 'chest'); ui.closeChest(); }
      return { openOk: ui.openChest === c };
    }, fx)) };
  }
  res.errors = errors;
  await browser.close();
  return res;
};

const out = { esc: await runCase('esc'), closeInv: await runCase('closeInv') };
console.log(JSON.stringify(out, null, 1));
