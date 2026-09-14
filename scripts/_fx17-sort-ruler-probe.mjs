// 反馈轮7取证:①Sort 按钮行为(点击排序/再点/帧恢复/glow 面向)②标尺图标列几何③切换钮左键网格后经典列表并存取证
//  运行:SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_fx17-sort-ruler-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
  await sleep(800);

  // ==== A. 标尺图标列几何 ====
  const geo = await page.evaluate(async () => {
    const ui = window.__swUI;
    const g = window.__swGame;
    document.getElementById('sw-welcome-announce')?.remove();
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 150));
    const vinv = document.querySelector('.sw-vinv');
    const out = {};
    const baccBtns = [...vinv.querySelectorAll('button')].filter((b) => (b.style.backgroundImage || '').includes('UI_BuilderIcons'));
    out.rulerIcons = baccBtns.map((b) => {
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100, w: r.width, h: r.height, bg: b.style.backgroundPosition, title: b.title, bound: b.dataset.swTipBound ?? '' };
    });
    const blockRep = [...vinv.querySelectorAll('button')].find((b) => (b.style.backgroundImage || '').includes('UI_BlockReplace'));
    out.blockRep = blockRep ? blockRep.getBoundingClientRect().toJSON() : null;
    const slot10 = vinv.querySelector('.sw-slot[data-idx="10"][data-where="inv"]');
    const slot0 = vinv.querySelector('.sw-slot[data-idx="0"][data-where="inv"]');
    out.slot10 = slot10?.getBoundingClientRect().toJSON();
    out.slot0 = slot0?.getBoundingClientRect().toJSON();
    // 炬神旗开 → 列应 +24
    g.world.flags.unlockedBiomeTorches = true;
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 120));
    out.rulerIconsTorch = [...vinv.querySelectorAll('button')].filter((b) => (b.style.backgroundImage || '').includes('UI_BuilderIcons')).map((b) => Math.round(b.getBoundingClientRect().y * 100) / 100);
    const torchBtn = [...vinv.querySelectorAll('button')].find((b) => (b.style.backgroundImage || '').includes('Extra_211'));
    out.torchIcon = torchBtn ? { x: torchBtn.getBoundingClientRect().x, y: torchBtn.getBoundingClientRect().y } : null;
    g.world.flags.unlockedBiomeTorches = false;
    await ui.refreshAllAsync();
    return out;
  });
  console.log('A-几何:', JSON.stringify(geo, null, 1));

  // ==== B. Sort 行为 ====
  const sortSetup = await page.evaluate(async () => {
    const ui = window.__swUI;
    const g = window.__swGame;
    const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
    const iidOf = (vid) => { const k = VANILLA_ITEM_KEY_BY_ID[vid]; return k !== undefined ? ITEM_BY_KEY[k] : undefined; };
    // 清空背包 10-49,注入乱序样本
    for (let i = 10; i < 50; i++) g.player.inv.slots[i] = null;
    const vids = [9, 23, 169, 171, 172, 8, 22, 110, 3199, 757, 975, 31, 28, 41, 46, 1326];
    vids.forEach((vid, k) => { const it = iidOf(vid); if (it) g.player.inv.add(it, 1 + (k * 7) % 40); });
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 150));
    const names = [];
    for (let i = 10; i < 50; i++) { const s = g.player.inv.slots[i]; names.push(s ? s.id : 0); }
    return { order: names.join(','), glow: ui.slotGlowState.size };
  });
  // 找 Sort 钮并真点击
  const sortRect = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.sw-vinv .vinv-btn')].find((x) => (x.style.backgroundImage || '').includes('UI_Sort'));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, frame0: b.style.backgroundImage };
  });
  let sortResult = { sortRect };
  if (sortRect) {
    await page.mouse.move(sortRect.x, sortRect.y); await sleep(120);
    const hoverFrame = await page.evaluate(() => [...document.querySelectorAll('.sw-vinv .vinv-btn')].find((x) => (x.style.backgroundImage || '').includes('UI_Sort'))?.style.backgroundImage);
    await page.mouse.click(sortRect.x, sortRect.y); await sleep(250);
    sortResult = await page.evaluate(() => {
      const ui = window.__swUI;
      const g = window.__swGame;
      const names = [];
      for (let i = 10; i < 50; i++) { const s = g.player.inv.slots[i]; names.push(s ? s.id : 0); }
      const sortBtn = [...document.querySelectorAll('.sw-vinv .vinv-btn')].find((x) => (x.style.backgroundImage || '').includes('UI_Sort'));
      return { orderAfter: names.join(','), glow: ui.slotGlowState.size, frameAfterClick: sortBtn?.style.backgroundImage };
    });
    sortResult.hoverFrame = hoverFrame;
    await page.mouse.move(700, 700); await sleep(120);
    sortResult.frameAway = await page.evaluate(() => [...document.querySelectorAll('.sw-vinv .vinv-btn')].find((x) => (x.style.backgroundImage || '').includes('UI_Sort'))?.style.backgroundImage);
    // 再点一次(幂等性)
    await page.mouse.click(sortRect.x, sortRect.y); await sleep(200);
    sortResult.orderTwice = await page.evaluate(() => {
      const g = window.__swGame;
      const names = [];
      for (let i = 10; i < 50; i++) { const s = g.player.inv.slots[i]; names.push(s ? s.id : 0); }
      return names.join(',');
    });
  }

  // ==== C. 切换钮:网格开后经典列表并存(原版 :42425+:42449 双画取证) ====
  const gridState = await page.evaluate(async () => {
    const ui = window.__swUI;
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('craftingGridControl', 'classic');
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 100));
    const tog = ui.vinvGridToggleImg.parentElement;
    const r = tog.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  let cState = null;
  if (gridState) {
    await page.mouse.click(gridState.x, gridState.y); await sleep(250);
    cState = await page.evaluate(() => {
      const ui = window.__swUI;
      const vinv = document.querySelector('.sw-vinv');
      const grid = ui.vinvCraftGridEl;
      const listCells = ui.vinvCraftCellEls.filter((c) => c.el.isConnected).length;
      const gridCells = grid ? [...grid.children].length : 0;
      const gridRect = grid ? grid.getBoundingClientRect().toJSON() : null;
      const focusSlot = ui.vinvCraftFocusV;
      return { pipsGrid: ui.vinvPipsUseGrid, gridDisplay: grid?.style.display, gridCells, listCells, gridRect, focus: focusSlot };
    });
    await page.mouse.click(gridState.x, gridState.y); await sleep(200);   // 翻回
  }

  console.log('B-Sort:', JSON.stringify(sortResult, null, 1));
  console.log('C-网格并存:', JSON.stringify(cState, null, 1));
  console.log('errs:', errs.length ? errs.join(' | ') : 'none');
  // 保存截图参考
  await page.screenshot({ path: '/tmp/fx17-vinv-leftedge.png', clip: { x: 0, y: 0, width: 300, height: 500 } });
}
await browser.close();
console.log('done');
