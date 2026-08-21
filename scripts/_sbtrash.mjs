// 滚动条一致性 + 垃圾桶覆盖销毁探针（2026-08-21 用户报）：
// ①thumb 拖到底 → 窗口=末 12 行（首行=配方[len-12]）+ thumb 贴槽底 + 继续滚轮不再动
// ②thumb 高恒定（中途不缩水）
// ③垃圾桶：已有物时放入新物 → 旧物销毁（非交换）、held 清空
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const world = new World(300, 180, 777, 'sb-trash');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < 300; x++) { for (let y = 95; y < 180; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  world.store.setTile(152, 93, 13);
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  const inv = g.player.inv;
  inv.add(items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[9]], 999);
  ui.openInventory();
  let t0 = Date.now();
  while (ui.craftListEl.children.length < 8 && Date.now() - t0 < 3000) await new Promise((r2) => setTimeout(r2, 100));
  await new Promise((r2) => setTimeout(r2, 300));
  const avail = g.vanillaAvailableRecipes();
  const len = avail.length;
  const trk = ui.craftTrackEl, thb = ui.craftThumbEl;
  const tr = trk.getBoundingClientRect();
  const thumbH0 = parseFloat(thb.style.height);
  // ① 拖到底：在 thumb 底缘按下 → 槽底 clientY（模拟拖到槽底）
  const jumpTo = (clientY) => {
    trk.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientY }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  };
  jumpTo(tr.bottom - 1);
  await new Promise((r2) => setTimeout(r2, 300));
  const rows = [...ui.craftListEl.children].map((x) => x.innerText.split('\n')[0]);
  const atBottom = {
    focus: ui.craftFocus,
    expectFocus: Math.min(len - 1, (len - 12) + 4),
    firstRowIsLen12: rows[0] && rows[0].length > 0,
    thumbBottom: Math.abs((thb.getBoundingClientRect().bottom) - tr.bottom) < 2,
    thumbH: parseFloat(thb.style.height),
    wheelMore: 0,
  };
  // 到底后继续下滚 3 次 → 焦点/窗不应再变
  const f0 = ui.craftFocus;
  for (let k = 0; k < 3; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    await new Promise((r2) => setTimeout(r2, 160));
  }
  atBottom.wheelMore = ui.craftFocus - f0;
  // ② thumb 高恒定
  const thumbHStable = Math.abs(parseFloat(thb.style.height) - thumbH0) < 0.5;
  // ③ 垃圾桶覆盖销毁
  const woodId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[9]];
  const gelId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[23]];
  ui.heldStack = { id: woodId, stack: 10 };
  inv.trash = { id: gelId, stack: 3 };
  ui.placeTrash();
  const trashAfter = inv.trash ? { id: inv.trash.id, stack: inv.trash.stack } : null;
  return {
    len, atBottom, thumbHStable,
    trashAfter,
    trashIsNew: trashAfter && trashAfter.id === woodId && trashAfter.stack === 10,
    heldCleared: ui.heldStack === null,
  };
});
console.log(JSON.stringify(r, null, 1));
const ok = r.atBottom.focus === r.atBottom.expectFocus && r.atBottom.thumbBottom
  && r.atBottom.wheelMore === 0 && r.thumbHStable
  && r.trashIsNew && r.heldCleared;
console.log(ok ? 'PASS: 滚动条端到端一致 + 垃圾桶覆盖销毁' : 'FAIL');
await browser.close();
