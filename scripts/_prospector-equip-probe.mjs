// 探针：勘探者盔甲(Prospector=UpgradedMining 5588-5590)「穿不上」实报定谳 v2。
//  A 数据面 — statOfInternal 盘上条目(s/hs/bs/ls 缺?) + armorSlotIndexOfInternal + isArmorItem
//  B 门禁面 — Inventory.armorAccepts(0/1/2, id) 逐环实测(对照:88 矿工头盔/5583 ChickenBones)
//  C 用户路径 — 背包→盔甲槽 DOM 拖放:捕捉被拒点(入槽/留包/卡光标) + 对照组入槽成功
// 附:5591-5593 船长套(UpgradedFishing)同病差集。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1500));

// ---- A+B: 数据面与门禁面(vid 直查,键名无关) ----
const ab = await page.evaluate(async () => {
  const g = window.__swGame;
  const { armorSlotIndexOfInternal, statOfInternal } = await import('/src/data/vanillaItemStats.ts');
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const inv = g.player.inv;
  const iidOfVid = (vid) => {
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const d = ITEM_DEFS[i];
      if (!d) continue;
      const v = d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
      if (v === vid) return i;
    }
    return -1;
  };
  const rows = [];
  for (const vid of [5588, 5589, 5590, 5591, 5592, 5593, 88, 410, 411, 5583]) {
    const iid = iidOfVid(vid);
    if (iid < 0) { rows.push({ vid, reg: false }); continue; }
    const stat = statOfInternal(iid);
    rows.push({
      vid, reg: true, key: ITEM_DEFS[iid].key,
      stat: stat ? JSON.stringify(stat) : null,
      slot: armorSlotIndexOfInternal(iid),
      acceptsH: inv.armorAccepts(0, iid), acceptsB: inv.armorAccepts(1, iid), acceptsL: inv.armorAccepts(2, iid),
      isArmor: (await import('/src/items/Inventory.ts')).isArmorItem(iid),
    });
  }
  return rows;
});
console.log('== A/B 数据面+门禁面 ==');
for (const r of ab) console.log(JSON.stringify(r));

// ---- C: 用户路径(DOM 拖放;捕捉卡光标) ----
const dragTest = async (vid, slotIdx, bagIdx) => page.evaluate(async (vid, slotIdx, bagIdx) => {
  const g = window.__swGame;
  const inv = g.player.inv;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  let iid = -1;
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (!d) continue;
    const v = d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    if (v === vid) { iid = i; break; }
  }
  if (iid < 0) return { fail: 'vid 未注册: ' + vid };
  // 确保面板先关(E 切换)再开,槽 58(光标镜像)清空,目标盔甲槽清空
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  window.__swUI.heldStack = null;
  inv.armor[slotIdx] = null;
  inv.slots[bagIdx] = { id: iid, stack: 1, prefix: 0 };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const srcEl = [...document.querySelectorAll('.sw-slot[data-where="inv"]')].find((s) => s.dataset.idx === String(bagIdx));
  const dstEl = [...document.querySelectorAll('.sw-slot[data-where="armor"]')].find((s) => s.dataset.idx === String(slotIdx));
  if (!srcEl || !dstEl) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    return { fail: 'DOM 槽缺失', src: !!srcEl, dst: !!dstEl };
  }
  const r1 = srcEl.getBoundingClientRect(), r2 = dstEl.getBoundingClientRect();
  srcEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: r1.x + 10, clientY: r1.y + 10, bubbles: true }));
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: r1.x + 40, clientY: r1.y + 40, bubbles: true }));
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: r2.x + 10, clientY: r2.y + 10, bubbles: true }));
  document.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: r2.x + 10, clientY: r2.y + 10, bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  const cursor = window.__swUI.heldStack;
  const res = {
    armorSlot: inv.armor[slotIdx] ? { id: inv.armor[slotIdx].id } : null,
    bag: inv.slots[bagIdx] ? { id: inv.slots[bagIdx].id, stack: inv.slots[bagIdx].stack } : null,
    cursor: cursor ? { id: cursor.id, stack: cursor.stack } : null,
    cursorIsTestItem: cursor ? cursor.id === iid : false,
  };
  // 清场
  if (inv.armor[slotIdx]?.id === iid) inv.armor[slotIdx] = null;
  window.__swUI.heldStack = null;
  inv.slots[bagIdx] = null;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  return res;
}, vid, slotIdx, bagIdx);

console.log('== C 用户路径(DOM 拖放入盔甲槽;cursor=槽58光标镜像) ==');
console.log('对照 88 矿工头盔 →armor[0] :', JSON.stringify(await dragTest(88, 0, 30)));
console.log('对照 5583 ChickenBones头 →armor[0]:', JSON.stringify(await dragTest(5583, 0, 30)));
console.log('实测 5588 勘探者头盔 →armor[0]:', JSON.stringify(await dragTest(5588, 0, 30)));
console.log('实测 5589 勘探者上衣 →armor[1]:', JSON.stringify(await dragTest(5589, 1, 30)));
console.log('实测 5590 勘探者裤装 →armor[2]:', JSON.stringify(await dragTest(5590, 2, 30)));
console.log('实测 5591 船长帽 →armor[0]     :', JSON.stringify(await dragTest(5591, 0, 30)));

if (errs.length) console.log('pageerrors:', errs.slice(0, 5));
await browser.close();
