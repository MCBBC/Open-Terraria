// P5 冒烟：染料列/杂项页/Loadout/重铸/向导反查/现代合成网格（scripts/_p5-smoke.mjs）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 500));
// 标题 → 角色列表
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 900));
// 无角色则新建
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('p5测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 800));
}
// 选角色 → 世界列表
await page.click('.sw-item');
await page.waitForFunction(() => {
  const t = document.querySelector('.sw-list-title');
  return t && t.textContent === '选择世界';
}, { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
// 新建世界（小世界）
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise(r => setTimeout(r, 200));
await page.click('[data-act=create]');
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2500));

// ===== 1. 背包面板结构：染料列/杂项页签/Loadout 按钮 =====
await page.keyboard.press('KeyE');
await new Promise(r => setTimeout(r, 500));
const structure = await page.evaluate(() => {
  const ui = window.__swUI;
  return {
    dyeSlots: document.querySelectorAll('.sw-slot[data-where="dye"]').length,
    miscSlots: document.querySelectorAll('.sw-slot[data-where="misc"]').length,
    miscDyeSlots: document.querySelectorAll('.sw-slot[data-where="miscDye"]').length,
    loadoutBtns: ui.loadoutBtns?.length,
    armorSlots: document.querySelectorAll('.sw-slot[data-where="armor"]').length,
    craftSearch: !!ui.craftSearchEl,
  };
});
console.log('STRUCTURE', JSON.stringify(structure));

// ===== 2. 染料右键一键装备 → dye[0] =====
const dyeEquip = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const id = g.itemId('vi_1007_RedDye');
  const left = g.player.inv.add(id, 1);
  let idx = -1;
  for (let i = 0; i < 58; i++) if (g.player.inv.slots[i]?.id === id) { idx = i; break; }
  ui.refreshAll();
  if (idx >= 0) {
    const slot = document.querySelector(`.sw-slot[data-idx="${idx}"][data-where="inv"]`);
    slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
  }
  const dye0 = g.player.inv.dye[0];
  return { left, idx, dye0Ok: dye0 ? dye0.id === id : false };
});
console.log('DYE_EQUIP', JSON.stringify(dyeEquip));

// ===== 3. 宠物/钩爪右键 → miscEquips[0]/[4] =====
const miscEquip = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const rightEquip = (key) => {
    const id = g.itemId(key);
    const left = g.player.inv.add(id, 1);
    let idx = -1;
    for (let i = 0; i < 58; i++) if (g.player.inv.slots[i]?.id === id) { idx = i; break; }
    if (idx < 0) return left;
    const slot = document.querySelector(`.sw-slot[data-idx="${idx}"][data-where="inv"]`);
    slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    return left;
  };
  const pet = g.itemId('vi_1169_BoneKey');
  const hook = g.itemId('vi_84_GrapplingHook');
  const lp = rightEquip('vi_1169_BoneKey');
  const lh = rightEquip('vi_84_GrapplingHook');
  return {
    lp, lh,
    petOk: g.player.inv.miscEquips[0]?.id === pet,
    hookOk: g.player.inv.miscEquips[4]?.id === hook,
  };
});
console.log('MISC_EQUIP', JSON.stringify(miscEquip));

// ===== 4. Loadout 切换 =====
const loadout = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const armor0 = g.player.inv.armor[0];
  ui.loadoutBtns[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return {
    cur: g.player.inv.currentLoadout,
    swappedOff: !g.player.inv.armor[0],
    stored: !!g.player.inv.loadouts[0].armor[0] || !armor0,
  };
});
console.log('LOADOUT', JSON.stringify(loadout));

// ===== 5. 重铸：判定 + 滚词缀 + 扣费 =====
const reforge = await page.evaluate(() => {
  const g = window.__swGame;
  const sword = g.itemId('vi_4_IronBroadsword');
  const coin = g.itemId('vi_71_CopperCoin');
  g.player.inv.add(coin, 3000);
  const left = g.player.inv.add(sword, 1);
  let idx = -1;
  for (let i = 0; i < 58; i++) if (g.player.inv.slots[i]?.id === sword) { idx = i; break; }
  const before = g.coinsOwned();
  const can = g.canReforge({ id: sword });
  const cost = g.reforgeCost({ id: sword, stack: 1 });
  const np = idx >= 0 ? g.doReforge(g.player.inv.slots[idx]) : -2;
  const after = g.coinsOwned();
  return { left, idx, can, cost, np, paid: before - after, prefix: idx >= 0 ? g.player.inv.slots[idx]?.prefix : undefined };
});
console.log('REFORGE', JSON.stringify(reforge));

// ===== 6. 向导反查打开 =====
const guide = await page.evaluate(() => {
  const ui = window.__swUI;
  ui.openGuideSearch();
  const input = document.querySelector('input[placeholder^="材料"]');
  input.value = 'wood';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return { open: !!ui.guideEl };
});
console.log('GUIDE_OPEN', JSON.stringify(guide));
await page.evaluate(() => window.__swUI.closeGuideSearch());

// ===== 7. 现代合成网格：搜索 + 材料格放入 + 合成 =====
const grid = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const wood = g.itemId('vi_9_Wood');
  const gel = g.itemId('vi_23_Gel');
  g.player.inv.add(wood, 50); g.player.inv.add(gel, 20);
  ui.craftSearchEl.value = '火把';
  ui.craftSearchEl.dispatchEvent(new Event('input', { bubbles: true }));
  ui.refreshAll();
  const chips = ui.craftGridEl ? ui.craftGridEl.querySelectorAll('.sw-slot').length : 0;
  return { chips, rows: document.querySelectorAll('.sw-recipe').length };
});
console.log('GRID', JSON.stringify(grid));
const gridCraft = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const chips = Array.from(ui.craftGridEl.querySelectorAll('.sw-slot'));
  for (const c of chips) c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  ui.refreshAll();
  const btn = Array.from(ui.craftGridEl.querySelectorAll('button')).find((b) => b.textContent.includes('合成'));
  const before = g.player.inv.countOf(g.itemId('vi_8_Torch'));
  btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  const after = g.player.inv.countOf(g.itemId('vi_8_Torch'));
  return { torchBefore: before, torchAfter: after, hasBtn: !!btn };
});
console.log('GRID_CRAFT', JSON.stringify(gridCraft));

// ===== 8. 页签切换杂项页 =====
const pageSwitch = await page.evaluate(() => {
  const ui = window.__swUI;
  ui.setEquipPage(1);
  const miscVisible = getComputedStyle(ui.miscPageEl).display;
  ui.setEquipPage(0);
  return { miscVisible };
});
console.log('PAGE_SWITCH', JSON.stringify(pageSwitch));

console.log('ERRORS', JSON.stringify(errs.slice(0, 6)));
await browser.close();
