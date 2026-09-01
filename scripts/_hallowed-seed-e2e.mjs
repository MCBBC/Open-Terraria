// 神圣种子端到端定谳探针(2026-09-02 用户报"放置只能叠方块"):
//   ①授予映射:Lang.itemName(369)='神圣种子' / internalIdOfVid(369) → def key
//   ②giveItem 真链授予 → 背包槽内出现真种子
//   ③手持真种子点泥土 → 原位转化 sheet109 + 消耗 -1(点击消费体 tryPlace)
//   ④种子点空格 → 零动作零消耗(终止通用链)
//   ⑤种子点"草块"格(非泥土基座) → 零动作(assortedPlaceOk case2|109 只吃 type0)
//   ⑥对照 place_v_109 草块点空格 → 照常铺放(本仓面板方块)
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
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
// ★worker 原始 error 嗅探(WorldGenClient 只透传 message;栈在此截获)。必须
//   evaluateOnNewDocument 于首个 goto 前,后续每次导航都注入
await page.evaluateOnNewDocument(() => {
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(url, opts) {
      super(url, opts);
      this.addEventListener('message', (e) => {
        const d = e.data;
        if (d && d.type === 'error') {
          (window.__wErr = window.__wErr || []).push(d);
        }
      });
    }
  };
});
// ★先清 Service Worker/CacheStorage(游戏壳会缓存 /src/* 模块;并行会话刚修的
//   worldgen 守卫若被旧 SW 喂回,新实例仍炸——探针必须从真源冷载)
await page.goto(ORIGIN + '/?__nocache=' + Date.now(), { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.evaluate(async () => {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    for (const r of regs) await r.unregister();
    const keys = caches ? await caches.keys() : [];
    for (const k of keys) await caches.delete(k);
  } catch { /* 无 SW 环境忽略 */ }
}).catch(() => {});
// ★页面侧全局错误栈收集(worldgen 若降级主线程,裸 process 引用会带完整栈冒到这)
await page.evaluate(() => {
  const w = window;
  w.__errStacks = [];
  window.addEventListener('error', (e) => {
    w.__errStacks.push(String((e.error && e.error.stack) || e.message).slice(0, 500));
  });
});
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
let bootError = null;
try { await page.evaluate(() => window.__swFlow.newWorld('1295198809', 4200, 1200)); }
catch (e) {
  bootError = String(e);
  const werr = await page.evaluate(() => window.__wErr ?? 'none').catch(() => 'eval-fail');
  console.log('BOOT-FAIL:', bootError);
  console.log('WORKER-ERRS:', JSON.stringify(werr, null, 2));
  await browser.close();
  process.exit(3);
}
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await page.waitForFunction(() => window.__swGame.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

const out = {};

out.grantMap = await page.evaluate(async () => {
  const g = window.__swGame;
  const LM = (await import('/src/i18n/Lang.ts')).Lang;
  const LS = await import('/src/net/leashedSync.ts');
  const DEFS = await import('/src/data/items.ts');
  const id = LS.internalIdOfVid(369);
  return {
    shownName369: LM.itemName(369),
    internalIdOfVid369: id,
    grantedDefKey: DEFS.ITEM_DEFS[id]?.key ?? null,
    defTileField: DEFS.ITEM_DEFS[id]?.tile ?? null,
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
  JPUI.giveItem(g, LS.internalIdOfVid(369), 3);
  const after = g.player.inv.slots.map(keyOf);
  let gainedAt = -1;
  for (let i = 0; i < after.length; i++) if ((after[i] ?? '') !== (before[i] ?? '')) gainedAt = i;
  if (gainedAt >= 0) g.player.inv.selected = gainedAt;
  return { gainedAt, slotKey: after[gainedAt], stack: gainedAt >= 0 ? g.player.inv.slots[gainedAt].stack : -1 };
});

const findDirtUnderAir = async () => await page.evaluate(async () => {
  const st = window.__swGame.world.store;
  const TD = await import('/src/data/tiles.ts');
  for (let y = 20; y < Math.min(st.h - 60, 900); y++) {
    for (let x = ((st.w / 2 - 300) | 0); x < ((st.w / 2 + 300) | 0); x++) {
      const sheet = TD.TILE_DEFS[st.get(x, y)]?.vanilla?.sheet;
      if (sheet === 0 && st.get(x, y - 1) === 0) return [x, y];   // ★只找真泥土(圣种唯一基座)
    }
  }
  return null;
});

out.seedOnDirt = await page.evaluate(async (target) => {
  const g = window.__swGame;
  if (!target) return { ok: false, why: 'no target found' };
  const [tx, ty] = target;
  const TD = await import('/src/data/tiles.ts');
  const DEFS = await import('/src/data/items.ts');
  const st = g.world.store;
  const keyOfT = (t) => TD.TILE_DEFS[t]?.key ?? String(t);
  g.player.x = tx * 16 + 8 - g.player.w / 2;
  g.player.y = (ty - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 200));
  const slotIdx = g.player.inv.selected;
  const heldDef = DEFS.ITEM_DEFS[g.player.inv.slots[slotIdx].id];
  const r = { ok: true, target: [tx, ty], beforeKey: keyOfT(st.get(tx, ty)) };
  r.stackBefore = g.player.inv.slots[slotIdx].stack;
  g.tryPlace(tx, ty, heldDef);
  r.afterKey = keyOfT(st.get(tx, ty));
  r.afterSheet = TD.TILE_DEFS[st.get(tx, ty)]?.vanilla?.sheet ?? null;
  r.stackAfter = g.player.inv.slots[slotIdx]?.stack;
  return r;
}, await findDirtUnderAir());

out.seedOnAir = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const tx = Math.round((p.x + p.w / 2) / 16) + 2, ty = Math.round(p.y / 16) - 3;
  if (st.get(tx, ty) !== 0) return { ok: false, note: 'probe cell not air' };
  const DEFS = await import('/src/data/items.ts');
  const heldDef = DEFS.ITEM_DEFS[g.player.inv.slots[g.player.inv.selected].id];
  const stackBefore = g.player.inv.slots[g.player.inv.selected].stack;
  g.tryPlace(tx, ty, heldDef);
  return { ok: true, tileAfter: st.get(tx, ty), stackBefore, stackAfter: g.player.inv.slots[g.player.inv.selected]?.stack };
});

out.blockOnAirCtrl = await page.evaluate(async () => {
  const g = window.__swGame;
  const DEFS = await import('/src/data/items.ts');
  let internalId = -1;
  for (const [kStr, d] of Object.entries(DEFS.ITEM_DEFS)) {
    if (d?.key === 'place_v_109_hallowed_grass_block') { internalId = +kStr; break; }
  }
  let slot = g.player.inv.slots.findIndex((s) => !s);
  if (slot < 0) slot = g.player.inv.selected;
  g.player.inv.slots[slot] = { id: internalId, stack: 5 };
  g.player.inv.selected = slot;
  const p = g.player;
  const st = g.world.store;
  const tx = Math.round((p.x + p.w / 2) / 16) + 1, ty = Math.round((p.y + p.h * 0.6) / 16);
  const wasEmpty = st.get(tx, ty) === 0;
  const TD = await import('/src/data/tiles.ts');
  if (wasEmpty) g.tryPlace(tx, ty, DEFS.ITEM_DEFS[internalId]);
  return {
    wasEmpty,
    tileNow: wasEmpty ? (TD.TILE_DEFS[st.get(tx, ty)]?.key ?? String(st.get(tx, ty))) : 'occupied',
    stackAfter: g.player.inv.slots[slot]?.stack,
  };
});

console.log(JSON.stringify(out, null, 2));
if (errs.length) console.log('PAGEERRORS:', JSON.stringify(errs.slice(0, 5)));
await browser.close();
