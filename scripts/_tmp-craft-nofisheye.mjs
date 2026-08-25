// 一次性验证:合成列表去鱼眼+滚动不预选不改选中+hover高亮不闪(审完即删)
//  ①行等宽无 transform ②静止鼠标滚轮 hoverFocus 恒 -1 且 craftFocus 不变
//  ③真实 mousemove 后 enter:预览生效 + 行带 .hov ④滚步重建后 .hov 按配方补回(不闪机制)
//  ⑤选中后滚动 craftFocus 不动 ⑥容器移出清高亮
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
const port = process.env.SW_PORT ?? '5199';
await page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const W = 300, H = 180;
  const world = new World(W, H, 777, 'craft-nofisheye');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < W; x++) { for (let y = 95; y < H; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  const woodId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[9]];
  g.player.inv.add(woodId, 999);
  const vr = await import('/src/data/vanillaRecipes.ts');
  const fake = vr.VANILLA_RECIPES.slice(0, 40).map((r) => ({ r, count: 1 }));
  g.vanillaAvailableRecipes = () => fake;
  ui.openInventory();
  await new Promise((r2) => setTimeout(r2, 500));
  if (!ui.craftListEl || ui.craftListEl.children.length < 3) {
    return { bail: true, rows: ui.craftListEl?.children.length ?? -1 };
  }
  const widths = () => [...ui.craftListEl.children].map((row) => Math.round(row.getBoundingClientRect().width));
  const out = { focus0: ui.craftFocus };
  // ① 行等宽无 transform
  out.widths = widths();
  out.equalWidth = out.widths.every((w) => Math.abs(w - out.widths[0]) <= 1);
  out.hasTransform = [...ui.craftListEl.children].some((row) => (row.style.transform ?? '') !== '');
  // ② 静止鼠标滚轮 → 不预选 + 选中不变
  for (let k = 0; k < 8; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  }
  await new Promise((r2) => setTimeout(r2, 400));
  out.hoverAfterFastWheel = ui.hoverFocus;
  out.focusAfterFastWheel = ui.craftFocus;
  // ③ 真实 mousemove + enter → 预览 + .hov(hover 中部行,滚 1 步后仍在窗内)
  const row1 = ui.craftListEl.children[6];
  const hoveredName = row1.textContent;
  row1.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  row1.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  await new Promise((r2) => setTimeout(r2, 400));
  out.hoverAfterRealMove = ui.hoverFocus;
  out.hovAfterEnter = row1.classList.contains('hov') || [...ui.craftListEl.children].some((c) => c.classList.contains('hov'));
  // ④ 滚步重建后 .hov 按配方补回 + 预选清退 + 选中不变
  ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  await new Promise((r2) => setTimeout(r2, 400));
  await new Promise((r2) => setTimeout(r2, 400));
  const sameRow = [...ui.craftListEl.children].find((c) => c.textContent === hoveredName);
  out.hovRestoredOnSameRecipe = !!sameRow && sameRow.classList.contains('hov');
  out.hoverClearedByWheel = ui.hoverFocus === -1;
  out.focusStillInitial = ui.craftFocus === out.focus0;
  // ⑤ 点击行 → 选中;随后滚动选中不动
  const firstRow = ui.craftListEl.children[0];
  firstRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise((r2) => setTimeout(r2, 300));
  const focusAtClick = ui.craftFocus;
  const scrollAtClick = ui.craftScroll;
  for (let k = 0; k < 3; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    await new Promise((r2) => setTimeout(r2, 200));
  }
  await new Promise((r2) => setTimeout(r2, 300));
  out.focusUnchangedByWheel = ui.craftFocus === focusAtClick;
  out.scrollMoved = ui.craftScroll > scrollAtClick;
  // ⑥ 容器移出清高亮
  ui.craftListEl.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
  await new Promise((r2) => setTimeout(r2, 300));
  out.hovClearedOnLeave = ![...ui.craftListEl.children].some((c) => c.classList.contains('hov'));
  return out;
});
console.log(JSON.stringify(r, null, 1));
const ok = !r.bail && r.equalWidth && !r.hasTransform
  && r.hoverAfterFastWheel === -1 && r.focusAfterFastWheel === r.focus0
  && r.hoverAfterRealMove !== -1 && r.hovAfterEnter
  && r.hovRestoredOnSameRecipe && r.hoverClearedByWheel && r.focusStillInitial
  && r.focusUnchangedByWheel && r.scrollMoved
  && r.hovClearedOnLeave;
console.log(ok ? 'PROBE OK' : 'PROBE FAILED');
await browser.close();
process.exitCode = ok ? 0 : 1;
