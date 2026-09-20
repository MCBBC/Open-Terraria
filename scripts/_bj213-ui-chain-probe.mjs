// ★BJ213 探针第二波：UI 状态机 + update 自动链 + DOM 真实鼠标 + 存档 round-trip
//  第一波结论：快捷链（手动 openChestRef+chestChangeEvents）全绿 → 断环在 UI/用户域。
//  S4 = 真实 UI 状态机（ui.openChestPanel → ui.pickUp → ui.placeHeld → ui.closeChest）
//       + 【不手动调 chestChangeEvents】靠 update 每拍自动跑 → 关箱拍判别
//  S5 = DOM 真实鼠标事件全链（page.mouse: 背包槽 mousedown 拾取 → 移到箱槽 → mouseup 落下）
//  S6 = 存档 round-trip 后钥匙 id 域（ITEM_STABLE_OF_INTERNAL 反解面）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const boot = async (tag) => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/?play=small&bj213b' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let ok = false;
  for (let i = 0; i < 90 && !ok; i++) {
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ok) throw new Error(tag + ' 未进游戏');
  await new Promise((r) => setTimeout(r, 9000));
  return { browser, page, errors };
};

/** 页内夹具：hardmode + 王朝木箱（placeStyle28）+ 背包光明钥匙 */
async function setup(page) {
  return page.evaluate(async () => {
    const g = window.__swGame;
    const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    g.world.flags.hardMode = true;
    const st = g.world.store;
    const tx = Math.round(g.player.cx / 16) + 100, ty = Math.round(g.player.cy / 16) - 30;
    const fx = 28 * 36;
    st.setTile(tx, ty, TILE_BY_KEY['chest'], fx, 0);
    st.setTile(tx + 1, ty, TILE_BY_KEY['chest'], fx + 18, 0);
    st.setTile(tx, ty + 1, TILE_BY_KEY['chest'], fx, 18);
    st.setTile(tx + 1, ty + 1, TILE_BY_KEY['chest'], fx + 18, 18);
    const chestData = { x: tx, y: ty, items: new Array(10).fill(null) };
    g.world.chests.push(chestData);
    const keyIid = invIndexOfVanilla(3092);
    g.player.inv.slots[10] = { id: keyIid, stack: 1 };   // 背包第一格塞钥匙
    return { chestData, keyIid, chestRef: g.world.chests[g.world.chests.length - 1] };
  });
}

const out = {};

// ================= S4：UI 状态机 + update 自动链 =================
{
  const { browser, page, errors } = await boot('S4');
  const fx = await setup(page);
  out.S4 = await page.evaluate(async (fx) => {
    const g = window.__swGame;
    const ui = window.__swUI;
    const chestData = fx.chestData;
    // 真实面板打开（private 但 JS 可调）
    ui.openChestPanel(chestData);
    await new Promise((r) => setTimeout(r, 100));
    const openState1 = {
      uiOpenChest: ui.openChest === chestData,
      refReturns: (g.openChestRef ? g.openChestRef() : 'no-ref') === chestData,
      invOpen: ui.invPanel?.style?.display,
    };
    // UI 状态机放置：拿起背包 10 号槽钥匙 → 放到箱槽 0
    ui.pickUp(10, 'inv');
    const midState = { held: ui.heldStack ? { id: ui.heldStack.id, stack: ui.heldStack.stack } : null };
    ui.placeHeld(0, 'chest');
    const chestItemsAfter = chestData.items.map((it) => it ? { id: it.id, stack: it.stack } : null);
    // 关箱（真实 closeChest,不开 closeInventory 全链）
    ui.closeChest();
    // 等 update 自动跑 chestChangeEvents（不手动调!）
    await new Promise((r) => setTimeout(r, 1200));
    const mimic = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 475);
    return {
      openState1, midState, chestItemsAfter,
      chestGone: !g.world.chests.includes(chestData),
      mimic475: mimic ? { x: Math.round(mimic.x), hp: mimic.hp } : null,
      lastChestOpenNow: (() => { try { return ui ? 'ui-inaccessible' : null; } catch { return 'err'; } })(),
    };
  }, fx);
  out.S4.errors = errors;
  await browser.close();
}

// ================= S5：DOM 真实鼠标 =================
{
  const { browser, page, errors } = await boot('S5');
  const fx = await setup(page);
  await page.evaluate((fx) => {
    const ui = window.__swUI;
    ui.openChestPanel(fx.chestData);
  }, fx);
  await new Promise((r) => setTimeout(r, 300));
  // 背包槽 10 与箱槽 0 的屏幕坐标（vinv vanilla 布局/布局不定,直接查 DOM）
  const coords = await page.evaluate(() => {
    const invSlot = document.querySelector('.sw-slot[data-where="inv"][data-idx="10"]');
    const chestSlot = document.querySelector('.sw-slot[data-where="chest"][data-idx="0"]');
    const r1 = invSlot?.getBoundingClientRect();
    const r2 = chestSlot?.getBoundingClientRect();
    return {
      inv: r1 ? { x: r1.x + r1.width / 2, y: r1.y + r1.height / 2 } : null,
      chest: r2 ? { x: r2.x + r2.width / 2, y: r2.y + r2.height / 2 } : null,
      chestVisible: chestSlot ? getComputedStyle(chestSlot).display : 'no-el',
      layout: window.__swUI?._builtLayout ?? null,
    };
  });
  if (coords.inv && coords.chest) {
    await page.mouse.move(coords.inv.x, coords.inv.y);
    await page.mouse.down();
    await page.mouse.move(coords.chest.x, coords.chest.y, { steps: 8 });
    await page.mouse.up();
  }
  const afterDrop = await page.evaluate((fx) => {
    const ui = window.__swUI;
    return {
      chestItems: fx.chestData.items.map((it) => it ? { id: it.id, stack: it.stack } : null),
      heldNow: ui.heldStack ? { id: ui.heldStack.id, stack: ui.heldStack.stack } : null,
      keyIid: fx.keyIid,
    };
  }, fx);
  // 关箱走真实路径：再点一次箱子?简单化——ui.closeInventory()
  await page.evaluate(() => window.__swUI.closeInventory());
  await new Promise((r) => setTimeout(r, 1200));
  out.S5 = await page.evaluate((fx) => {
    const g = window.__swGame;
    const mimic = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 475);
    return {
      coords: 'consumed', afterDrop: fx.afterDropRef,
      chestGone: !g.world.chests.includes(fx.chestData),
      mimic475: mimic ? { x: Math.round(mimic.x), hp: mimic.hp } : null,
    };
  }, { ...fx, afterDropRef: afterDrop });
  out.S5.afterDrop = afterDrop;
  out.S5.coords = coords;
  out.S5.errors = errors;
  await browser.close();
}

// ================= S6：存档 round-trip 钥匙 id 域 =================
{
  const { browser, page, errors } = await boot('S6');
  const fx = await setup(page);
  out.S6 = await page.evaluate(async (fx) => {
    const g = window.__swGame;
    const { ITEM_STABLE_OF_INTERNAL, ITEM_DEFS } = await import('/src/data/items.ts');
    const { viIdFromKey } = await import('/src/data/vanillaItemCombat.ts');
    const stable = ITEM_STABLE_OF_INTERNAL[fx.keyIid];
    const keyDef = ITEM_DEFS[fx.keyIid];
    // 走 Game 存档域（若可达）:serialize world → 反解。直接查稳定表+反查函数
    // 反查面：找 load 侧 stable→internal 的表
    const mods = await import('/src/data/items.ts');
    const reverse = Object.entries(ITEM_STABLE_OF_INTERNAL).find(([, v]) => v === stable)?.[0];
    // 模拟读档反解:如果存在反查 api
    let internalAfterLoad = null;
    for (const k of Object.keys(mods)) {
      const v = mods[k];
      if (v && typeof v === 'object' && v[stable] !== undefined && k.toUpperCase().includes('INTERNAL')) {
        internalAfterLoad = v[stable]; break;
      }
    }
    return {
      keyIid: fx.keyIid, keyDefKey: keyDef?.key,
      vidOfKey: keyDef ? viIdFromKey(keyDef.key) : null,
      stableId: stable,
      reverseHit: reverse ?? null,
      internalAfterLoad,
      chestItemsSerialized: fx.chestData.items,
    };
  }, fx);
  out.S6.errors = errors;
  await browser.close();
}

console.log(JSON.stringify(out, null, 1));
