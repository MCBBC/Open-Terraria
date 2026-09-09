// 哥布林工匠重铸+宝箱对齐端到端探针(刀 12/13;2026-09-09)
//  运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs --timeout=560000 scripts/_reforge-e2e-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());

const v = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const iidOf = (vid) => { const k = VANILLA_ITEM_KEY_BY_ID[vid]; return k !== undefined ? ITEM_BY_KEY[k] : undefined; };
  // 哥布林重铸入口
  g.debugSpawnNpc(107, 1, false);
  await sleep(200);
  const npc = g.entities.npcs.find((n) => n.npcKey === 'goblin_tinkerer');
  if (!npc) return { noNpc: true };
  npc.x = g.player.x; npc.y = g.player.y;
  g.openNpcDialog(npc);
  await sleep(150);
  const reforgeBtn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '重铸');
  if (!reforgeBtn) { out.noBtn = true; return out; }
  reforgeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(200);
  out.reforgeOpen = ui.vinvReforgeOpen === true;
  out.noModal = ![...document.body.children].some((d) => d.style.zIndex === '1150');
  // 资源:钱/库内铜币/可重铸武器
  const platK = VANILLA_ITEM_KEY_BY_ID[74];
  if (platK !== undefined) { const pid = ITEM_BY_KEY[platK]; if (pid !== undefined) g.player.inv.add(pid, 50); }
  const copK = VANILLA_ITEM_KEY_BY_ID[71];
  if (copK !== undefined) { const cid = ITEM_BY_KEY[copK]; if (cid !== undefined) g.player.banks[0][0] = { id: cid, stack: 500 }; }
  out.bankInject = JSON.stringify(g.player.banks[0][0]);
  let wid = -1;
  for (let vid = 1; vid < 700; vid++) {
    const iid = iidOf(vid);
    if (iid !== undefined && g.canReforge({ id: iid })) { wid = iid; break; }
  }
  // 放入 + 几何
  ui.heldStack = { id: wid, stack: 1 };
  ui.vinvReforgeSlotEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await ui.refreshAllAsync();
  out.itemPlaced = !!ui.reforgeItem;
  const slot = ui.vinvReforgeSlotEl, hammer = ui.vinvReforgeHammerEl;
  out.slotPos = { x: slot.offsetLeft, y: slot.offsetTop };
  out.hammerPos = { x: hammer.offsetLeft, y: hammer.offsetTop };
  out.savingsShown = ui.vinvSavingsEl.children.length > 0;
  out.savingsHtml = ui.vinvSavingsEl.innerHTML.slice(0, 120);
  // 点锤
  const coinsBefore = g.coinsOwned();
  hammer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await ui.refreshAllAsync();
  out.prefixAfter = ui.reforgeItem?.prefix ?? null;
  out.coinsSpent = coinsBefore - g.coinsOwned();
  // 开 bank(x=-2)→ 重铸退出 + 宝箱条(Back2 黄)+ 五钮
  ui.vinvReforgeOpen = true;
  g.openChest({ x: -2, y: 0, items: (() => { const a = new Array(40).fill(null); a[0] = { id: iidOf(71), stack: 300 }; return a; })() });   // 走开箱链(x<0 豁免自动关;openChestPanel vanilla 分支置退出)
  await ui.refreshAllAsync();
  await ui.refreshAllAsync();
  await sleep(100);
  out.reforgeExitOnChest = ui.vinvReforgeOpen === false;
  out.chestStripCount = [...document.querySelectorAll('.sw-slot')].filter((s) => s.dataset.where === 'chest' && s.offsetParent !== null).length;
  const bankSlot = [...document.querySelectorAll('.sw-slot')].find((s) => s.dataset.where === 'chest' && s.dataset.idx === '0' && s.offsetParent !== null);
  out.bankTexture = bankSlot ? (bankSlot.style.getPropertyValue('--slot-bgimg').match(/Inventory_Back\d+/)?.[0] ?? null) : null;
  out.chestButtons = [...document.querySelectorAll('.vinv-txt')].filter((b) => b.offsetParent !== null && ['拿走全部', '存放全部', '快速堆叠', '补货', '排列物品'].includes((b.textContent || '').trim())).map((b) => ({ t: (b.textContent || '').trim(), y: b.offsetTop }));
  // 补货:背包木 10/99 + 箱内木 50 → 全并(999)
  const woodK = VANILLA_ITEM_KEY_BY_ID[9];
  if (woodK !== undefined) { const woodId = ITEM_BY_KEY[woodK]; if (woodId !== undefined) { g.player.inv.slots[10] = { id: woodId, stack: 10 }; ui.openChest.items[0] = { id: woodId, stack: 50 }; } }
  await ui.refreshAllAsync();
  const restockBtn = [...document.querySelectorAll('.vinv-txt')].find((b) => (b.textContent || '').trim() === '补货');
  restockBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await ui.refreshAllAsync();
  out.restockInv = g.player.inv.slots[10]?.stack;
  out.restockChest0 = ui.openChest.items[0]?.stack ?? null;
  // 排列:守恒+聚前
  const before = ui.openChest.items.filter(Boolean).length;
  const totalBefore = ui.openChest.items.filter(Boolean).reduce((s, i) => s + (i?.stack ?? 0), 0);
  const sortBtn = [...document.querySelectorAll('.vinv-txt')].find((b) => (b.textContent || '').trim() === '排列物品');
  sortBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await ui.refreshAllAsync();
  const after = ui.openChest.items.filter(Boolean).length;
  const totalAfter = ui.openChest.items.filter(Boolean).reduce((s, i) => s + (i?.stack ?? 0), 0);
  out.sortOk = after === before && totalAfter === totalBefore;
  let gap = false;
  for (let i = 0; i < ui.openChest.items.length; i++) { if (!ui.openChest.items[i]) { gap = ui.openChest.items.slice(i).some(Boolean); break; } }
  out.sortCompacted = !gap;
  // 关包 → 宝箱条隐藏
  g.closeInventory();
  await ui.refreshAllAsync();
  await ui.refreshAllAsync();
  out.chestStripHiddenAfterClose = ![...document.querySelectorAll('.sw-slot')].some((s) => s.dataset.where === 'chest' && s.offsetParent !== null);
  return out;
}).catch((e) => ({ evalFail: String(e).slice(0, 300) }));

if (v.evalFail) {
  ok(false, `evaluate 失败: ${v.evalFail}`);
} else if (v.noNpc || v.noBtn) {
  ok(false, `前置失败 ${JSON.stringify(v)}`);
} else {
  ok(v.reforgeOpen && v.noModal, `重铸:原位开启且无 modal got ${v.reforgeOpen}/${v.noModal}`);
  ok(v.itemPlaced, `重铸:放入(整件克隆) got ${v.itemPlaced}`);
  ok(v.slotPos && v.slotPos.x === 50 && v.slotPos.y === 270, `重铸:槽 (50,270) got ${JSON.stringify(v.slotPos)}`);
  ok(v.hammerPos && v.hammerPos.x === 120 && v.hammerPos.y === 310, `重铸:锤 (120,310) got ${JSON.stringify(v.hammerPos)}`);
  ok(v.savingsShown, `宝箱:储蓄显示 got ${v.savingsShown} html=${v.savingsHtml}`);
  ok(v.prefixAfter !== null && v.coinsSpent > 0, `重铸:点锤=扣费+词缀 后=${v.prefixAfter} 花=${v.coinsSpent}铜`);
  ok(v.reforgeExitOnChest, `宝箱:开箱自动退出重铸(:42277) got ${v.reforgeExitOnChest}`);
  ok(v.chestStripCount >= 40, `宝箱:40 槽叠背包下方 got ${v.chestStripCount}`);
  ok(v.bankTexture === 'Inventory_Back2', `宝箱:bank 贴图=Back2(黄,ctx4) got ${v.bankTexture}`);
  ok(v.chestButtons.length === 5, `宝箱:五钮 got ${JSON.stringify(v.chestButtons)}`);
  ok(v.restockInv === 60 && v.restockChest0 === null, `宝箱:补货=箱→包全并 got 包=${v.restockInv} 箱0=${v.restockChest0}`);
  ok(v.sortOk && v.sortCompacted, `宝箱:排列=守恒+聚前 got ${v.sortOk}/${v.sortCompacted}`);
}
ok(errs.length === 0, `无页面错误 ${errs.length ? JSON.stringify(errs.slice(0, 2)) : ''}`);

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
