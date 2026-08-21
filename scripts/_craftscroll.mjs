// 合成列表滚动修复探针（用户报"无法滚动到第 7 项以后"）：
// 入场 → 木材 999 → 开背包 → 滚轮×12 → 断言 craftFocus=12 且渲染窗
// 首行 = 配方[8]（焦点居中 start=focus-4），并截图。
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
  const W = 300, H = 180;
  const world = new World(W, H, 777, 'craft-scroll-probe');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < W; x++) { for (let y = 95; y < H; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  const woodId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[9]];
  g.player.inv.add(woodId, 999);
  ui.openInventory();
  await new Promise((r2) => setTimeout(r2, 300));
  const avail = g.vanillaAvailableRecipes();
  const nameOf = (i) => {
    const k = items.vanillaItemKey ? null : null;
    return null;
  };
  // 修前/修后共用断言：滚 12 格后窗口是否跟随
  const focus0 = ui.craftFocus;
  for (let k = 0; k < 12; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  }
  await new Promise((r2) => setTimeout(r2, 400));   // rAF 合并刷新
  const focus1 = ui.craftFocus;
  const rows = [...ui.craftListEl.children].map((row) => row.innerText.split('\n')[0].slice(0, 24));
  // 配方序号定位：用 avail[i] 成品名（走同一条 itemNameByKey 链）
  const { Lang } = await import('/src/i18n/Lang.ts');
  const vr = await import('/src/data/vanillaRecipes.ts');
  const names = avail.map(({ r }) => Lang.itemNameByKey(vr.vanillaItemKey(r.create)) ?? `#${r.create}`);
  const firstRowIdx = names.findIndex((n) => rows[0] && rows[0].includes(n.slice(0, 10)));
  return {
    availCount: avail.length,
    focus0, focus1,
    renderedRows: rows.length,
    firstRows: rows.slice(0, 3),
    names0_10: names.slice(0, 10).map((n, i) => `${i}:${n.slice(0, 14)}`),
    firstRowIdx,
    // 修后期望:start=focus-4=8(焦点居中),首行应≈配方[8];修前恒 start=0(首行=配方[0])
    expect: { start: Math.max(0, focus1 - 4) },
  };
});
console.log(JSON.stringify(r, null, 1));
console.log(r.firstRowIdx >= 6 && r.firstRowIdx <= 9 ? 'PASS: 渲染窗跟随焦点' : (r.firstRowIdx <= 1 ? 'FAIL: 窗口钉死在顶部(旧bug)' : 'CHECK'));
await page.screenshot({ path: '/tmp/craft-scroll.png' });
await browser.close();
