// 终验（探针实证）：LoadoutShare 槽面补绘——切空配装后共享件幽灵/角标/悬停代打
// 用户报"切配装后对应格子还是空的"：机制原版本就生效，欠的是指示。本探针驱动
// 真实 UI 面板断言三件套（ItemSlot.Draw :2454-2473 + :2726-2746 的 DOM 等价物）。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = g.ui || window.__swUI;
  if (!ui) return { err: 'no ui' };
  const M = await import('/src/data/items.ts');
  const idOf = (vid) => M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[vid]];
  const helm = idOf(90), wings = idOf(492);   // 铁头盔 / 天使翅膀
  const inv = g.player.inv;
  // L0：穿铁头盔+翅膀并收藏（=共享源）——直接写 worn（等价 UI 置入+Alt 收藏终态）
  inv.armor[0] = { id: helm, stack: 1, favorited: true };
  inv.armor[3] = { id: wings, stack: 1, favorited: true };
  ui.openInventory();
  ui.refreshAllNow?.() ?? ui.refreshAll();
  await new Promise((r) => setTimeout(r, 300));
  const slotEl = (i) => document.querySelector(`.sw-slot[data-where="armor"][data-idx="${i}"]`);
  const st = {};
  // 自收藏角标：本套为共享源 → Extra_310（当前配装 0 色）
  st.ownFrameL0 = slotEl(0)?.querySelector('.sw-share-frame')?.dataset.src ?? null;
  // 切到空仓 L1：共享件对空槽生效 → 幽灵+来源角标 Extra_313 + 类型占位图抑制
  inv.trySwitchingLoadout(1, g.player.hideVisibleAccessory);
  ui.refreshAllNow?.() ?? ui.refreshAll();
  await new Promise((r) => setTimeout(r, 300));
  const s0 = slotEl(0), s3 = slotEl(3);
  st.L1_ghostVisible = s0?.querySelector('.sw-share-ghost')?.style.display ?? 'absent';
  st.L1_ghostIcon = s0?.querySelector('.sw-share-ghost')?.dataset.src ?? null;
  st.L1_ghostOpacity = s0?.querySelector('.sw-share-ghost')?.style.opacity ?? null;
  st.L1_frame = s0?.querySelector('.sw-share-frame')?.dataset.src ?? null;
  st.L1_placeholderHidden = s0?.querySelector('.sw-slot-ghost')?.style.display ?? 'no-placeholder';
  st.L1_wingsGhost = s3?.querySelector('.sw-share-ghost')?.dataset.src ?? null;
  st.L1_wingsEmpty = !s3?.querySelector('img');
  // 悬停代打：空槽 hover → tooltip 应含共享件名/「共享自配装1」行（MouseHover :3174-3178）
  s0?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  st.tooltipText = (ui.tooltip?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 120);
  st.tooltipHasSharedFrom = (ui.tooltip?.textContent ?? '').includes('共享自配装');
  st.tooltipVisible = ui.tooltip?.style.display !== 'none';
  // 置换：第二副本装入 worn[3] → 该槽幽灵消失（防叠加核心），worn[0] 仍空共享
  inv.armor[3] = { id: wings, stack: 1 };
  ui.refreshAllNow?.() ?? ui.refreshAll();
  await new Promise((r) => setTimeout(r, 300));
  st.afterEquip_ghostGone = !s3.querySelector('.sw-share-ghost');
  st.afterEquip_img = !!s3.querySelector('img');
  st.afterEquip_frameGone = !s3.querySelector('.sw-share-frame');
  st.worn0GhostStill = s0.querySelector('.sw-share-ghost')?.dataset.src ?? null;
  // 回切 L0：自收藏角标回归 Extra_310
  inv.trySwitchingLoadout(0, g.player.hideVisibleAccessory);
  ui.refreshAllNow?.() ?? ui.refreshAll();
  await new Promise((r) => setTimeout(r, 300));
  st.backOwnFrame = slotEl(0)?.querySelector('.sw-share-frame')?.dataset.src ?? null;
  st.backGhostAbsent = !slotEl(0)?.querySelector('.sw-share-ghost');
  // 挂账②：Alt 收藏 → ShowLoadoutShareHint options 持久化（DisableLoadoutShareHint）
  const OPT = await import('/src/core/Options.ts');
  st.hintBefore = OPT.options.data.showLoadoutShareHint;
  inv.armor[0].favorited = false;   // 先摘,再 Alt 重挂=ON 路径
  ui.refreshAllNow?.() ?? ui.refreshAll();
  slotEl(0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, altKey: true }));
  await new Promise((r) => setTimeout(r, 700));   // options.set 防抖 400ms
  st.hintAfterShare = OPT.options.data.showLoadoutShareHint;
  st.hintPersisted = await OPT.options.set('showLoadoutShareHint', false).then(() => OPT.options.data.showLoadoutShareHint);
  // 挂账③：misc 族 Alt 无语义（原版 canFavoriteAt/canLoadoutShareAt 均不含）
  const petSlot = document.querySelector('.sw-slot[data-where="misc"][data-idx="0"]');
  const petBefore = inv.miscEquips[0]?.favorited ?? false;
  petSlot?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, altKey: true }));
  await new Promise((r) => setTimeout(r, 200));
  st.miscAltNoToggle = (inv.miscEquips[0]?.favorited ?? false) === petBefore;
  st.miscDragArmed = ui.dragFrom?.where === 'misc';   // 落空=常规拖拽armed（原版 Alt 不抑制点击）
  ui.dragFrom = null;
  return st;
});
console.log(JSON.stringify(res, null, 2));
if (errs.length) console.log('PAGEERRORS:', errs.slice(0, 3));
await browser.close();
