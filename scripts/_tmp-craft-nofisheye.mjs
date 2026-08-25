// 一次性验证:合成列表去鱼眼 + 滚动不预选不改选中(审完即删)
//  ①行等宽无 transform ②静止鼠标滚轮(快/慢)hoverFocus 恒 -1 且 craftFocus 不变
//  ③真实 mousemove 后 enter 预览生效 ④点击行设选中 ⑤选中后滚动 craftFocus 不动、craftScroll 动
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
  // 猴补配方源为 40 条真实配方(世界搭工作台太绕)——专测列表机制
  const vr = await import('/src/data/vanillaRecipes.ts');
  const fake = vr.VANILLA_RECIPES.slice(0, 40).map((r) => ({ r, count: 1 }));
  g.vanillaAvailableRecipes = () => fake;
  ui.openInventory();
  await new Promise((r2) => setTimeout(r2, 500));
  if (!ui.craftListEl || ui.craftListEl.children.length < 3) {
    return { bail: true, hasListEl: !!ui.craftListEl, rows: ui.craftListEl?.children.length ?? -1,
      avail: g.vanillaAvailableRecipes().length, playerX: g.player.x, playerY: g.player.y };
  }

  const widths = () => [...ui.craftListEl.children].map((row) => Math.round(row.getBoundingClientRect().width));
  const out = { focus0: ui.craftFocus, scroll0: ui.craftScroll };
  // ① 行等宽无 transform
  out.widths = widths();
  out.equalWidth = out.widths.every((w) => Math.abs(w - out.widths[0]) <= 1);
  out.hasTransform = [...ui.craftListEl.children].some((row) => (row.style.transform ?? '') !== '');
  // ② 静止鼠标快速滚轮 → 不预选 + 选中不变
  for (let k = 0; k < 8; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  }
  await new Promise((r2) => setTimeout(r2, 400));
  out.hoverAfterFastWheel = ui.hoverFocus;
  out.focusAfterFastWheel = ui.craftFocus;
  out.scrollAfterFastWheel = ui.craftScroll;
  // ③ 慢速滚动(步间隔 200ms,鼠标静止) → 不预选
  for (let k = 0; k < 4; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    await new Promise((r2) => setTimeout(r2, 200));
  }
  await new Promise((r2) => setTimeout(r2, 300));
  out.hoverAfterSlowWheel = ui.hoverFocus;
  // ④ 真实 mousemove 后 enter → 预览生效
  const row2 = ui.craftListEl.children[2];
  row2.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  row2.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  await new Promise((r2) => setTimeout(r2, 300));
  out.hoverAfterRealMove = ui.hoverFocus;
  // ⑤ 点击第 1 行 → 选中 = 窗首 idx;随后滚动选中不动
  const firstRow = ui.craftListEl.children[0];
  firstRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise((r2) => setTimeout(r2, 300));
  const scrollAtClick = ui.craftScroll;
  out.focusAfterClick = ui.craftFocus;
  out.expectFocusAfterClick = scrollAtClick;   // start = scroll-4 钳 0;首行 idx=start
  for (let k = 0; k < 3; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    await new Promise((r2) => setTimeout(r2, 200));
  }
  await new Promise((r2) => setTimeout(r2, 300));
  out.focusAfterWheelPostClick = ui.craftFocus;
  out.scrollAfterWheelPostClick = ui.craftScroll;
  out.hoverAfterWheelPostClick = ui.hoverFocus;
  out.equalWidthAfter = widths().every((w, _, a) => Math.abs(w - a[0]) <= 1);
  return out;
});
console.log(JSON.stringify(r, null, 1));
const ok = r.equalWidth && r.equalWidthAfter && !r.hasTransform
  && r.hoverAfterFastWheel === -1 && r.focusAfterFastWheel === r.focus0
  && r.hoverAfterSlowWheel === -1
  && r.hoverAfterRealMove !== -1
  && r.focusAfterClick === r.expectFocusAfterClick
  && r.focusAfterWheelPostClick === r.focusAfterClick
  && r.scrollAfterWheelPostClick > r.scrollAtClick
  && r.hoverAfterWheelPostClick === -1;
console.log(ok ? 'PROBE OK' : 'PROBE FAILED');
await browser.close();
process.exitCode = ok ? 0 : 1;
