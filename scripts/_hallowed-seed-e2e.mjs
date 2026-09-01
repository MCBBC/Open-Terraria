// 神圣种子端到端定谳探针(2026-09-02 用户报"放置只能叠方块"):
//   ①授予映射:Lang.itemName(369) + internalIdOfVid(369) → def key
//   ②giveItem 真链授予 → 背包新增槽 key
//   ③手持真种子点泥土格 → 原位转化为 sheet109 + 消耗 -1
//   ④种子点空格 → 零动作零消耗(终止通用链)
//   ⑤对照 place_v_109 草块点空格 → from 0 铺放
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 1200, height: 862 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });

await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
// audio/资源门吞首击 → 轮询重试直至面板出现
for (let i = 0; i < 10 && !(await page.$('.sw-list-panel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
}
await page.waitForSelector('.sw-list-panel', { timeout: 20000 });
{
  const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
  if (!hasChar) {
    await page.click('.sw-list-footer [data-act=new]');
    await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 400));
    await page.click('[data-act=create]');
    await page.waitForSelector('.sw-item', { timeout: 10000 });
  }
}
await new Promise((r) => setTimeout(r, 500));
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
{
  const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
  if (!hasWorld) {
    await page.click('.sw-list-footer [data-act=new]');
    await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 400));
    await page.click('[data-act=create]');
  } else {
    await page.click('.sw-list-panel .sw-item');
  }
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

const out = {};

out.grantMap = await page.evaluate(async () => {
  const g = window.__swGame;
  const LM = (await import('/src/i18n/Lang.ts')).Lang;
  const shownName = LM.itemName(369);
  const LS = await import('/src/net/leashedSync.ts');
  const JPUI = await import('/src/ui/JourneyPowersUI.ts');
  const DEFS = await import('/src/data/items.ts');
  const id = JPUI.giveItem && LS.internalIdOfVid(369);
  return {
    shownName,
    internalIdOfVid369: id,
    grantedDefKey: DEFS.ITEM_DEFS[id]?.key ?? null,
    poolHas369: g.research.resolvedIdsWithProgress().includes(369),
  };
});

out.grantAndSelect = await page.evaluate(async () => {
  const g = window.__swGame;
  const JPUI = await import('/src/ui/JourneyPowersUI.ts');
  const LS = await import('/src/net/leashedSync.ts');
  const DEFS = await import('/src/data/items.ts');
  const keyOf = (s) => (s ? (DEFS.ITEM_DEFS[s.id]?.key ?? `?${s.id}`) : null);
  const before = g.player.inv.slots.map(keyOf);
  JPUI.giveItem(g, LS.internalIdOfVid(369), 1);
  const after = g.player.inv.slots.map(keyOf);
  let gainedAt = -1;
  for (let i = 0; i < after.length; i++) {
    if ((after[i] ?? '') !== (before[i] ?? '')) gainedAt = i;
  }
  if (gainedAt >= 0) g.player.inv.selected = gainedAt;
  return { gainedAt, slotKey: after[gainedAt], selectedOk: gainedAt >= 0 };
});

// ---- 手持真种子,找空气上泥,挪玩家,g.tryPlace(=点击消费体) ----
out.seedOnDirt = await page.evaluate(async () => {
  const g = window.__swGame;
  const TD = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const keysOf = (t) => TD.TILE_DEFS[t]?.key ?? String(t);
  let target = null;
  outer:
  for (let y = 20; y < Math.min(st.h - 60, 800); y += 1) {
    for (let x = ((st.w / 2 - 200) | 0); x < ((st.w / 2 + 200) | 0); x++) {
      if (x < 5 || x >= st.w - 5) continue;
      const t = st.get(x, y);
      const sheet = TD.TILE_DEFS[t]?.vanilla?.sheet;
      if ((sheet === 0 || sheet === 2) && st.get(x, y - 1) === 0) { target = [x, y]; break outer; }
    }
  }
  if (!target) return { ok: false, why: 'no dirt-under-air found' };
  const [tx, ty] = target;
  g.player.x = tx * 16 + 8 - g.player.w / 2;
  g.player.y = (ty - 3) * 16;
  g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 150));
  const heldSlot = g.player.inv.slots[g.player.inv.selected];
  const DEFS = await import('/src/data/items.ts');
  const heldDef = DEFS.ITEM_DEFS[heldSlot.id];
  const beforeKey = keysOf(st.get(tx, ty));
  const stackBefore = heldSlot.stack;
  g.tryPlace(tx, ty, heldDef);
  return {
    ok: true, target: [tx, ty],
    beforeKey, afterKey: keysOf(st.get(tx, ty)),
    afterSheet: TD.TILE_DEFS[st.get(tx, ty)]?.vanilla?.sheet ?? null,
    stackBefore, stackAfter: g.player.inv.slots[g.player.inv.selected]?.stack,
    selectedKeyNow: DEFS.ITEM_DEFS[g.player.inv.slots[g.player.inv.selected]?.id]?.key,
  };
});

// ---- 种子点空格:空气中一格 ----
out.seedOnAir = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  // 找一块身前空气格
  const tx = Math.round((p.x + p.w / 2) / 16) + 2, ty = Math.round(p.y / 16) - 2;
  if (st.get(tx, ty) !== 0) return { ok: false, note: 'not air at probe cell', got: st.get(tx, ty) };
  const slot = g.player.inv.slots[g.player.inv.selected];
  const stackBefore = slot ? slot.stack : 0;
  const DEFS = await import('/src/data/items.ts');
  g.tryPlace(tx, ty, DEFS.ITEM_DEFS[slot.id]);
  return { ok: true, tileAfter: st.get(tx, ty), stackBefore, stackAfter: slot?.stack };
});

// ---- 对照:place_v_109 塞槽+选中+点空格 ----
out.blockOnAir = await page.evaluate(async () => {
  const g = window.__swGame;
  const DEFS = await import('/src/data/items.ts');
  let internalId = -1;
  for (const [kStr, d] of Object.entries(DEFS.ITEM_DEFS)) {
    void kStr;
    if (d?.key === 'place_v_109_hallowed_grass_block') { internalId = +kStr; break; }
  }
  let slot = g.player.inv.slots.findIndex((s) => !s);
  if (slot < 0) slot = g.player.inv.selected;
  g.player.inv.slots[slot] = { id: internalId, stack: 5 };
  g.player.inv.selected = slot;
  const p = g.player;
  const tx = Math.round((p.x + p.w / 2) / 16) + 1, ty = Math.round(p.y / 16) - 6;
  const st = g.world.store;
  const wasEmpty = st.get(tx, ty) === 0;
  const heldDef = DEFS.ITEM_DEFS[internalId];
  if (wasEmpty) g.tryPlace(tx, ty, heldDef);
  const TD = await import('/src/data/tiles.ts');
  return {
    wasEmpty, tileNow: wasEmpty ? TD.TILE_DEFS[st.get(tx, ty)]?.key : 'occupied',
    stackAfter: g.player.inv.slots[slot]?.stack,
  };
});

console.log(JSON.stringify(out, null, 2));
if (errs.length) console.log('PAGEERRORS:', JSON.stringify(errs.slice(0, 5)));
await browser.close();
