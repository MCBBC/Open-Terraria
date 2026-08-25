// 一次性验证:合成列表去鱼眼 + 滚动不误预选(审完即删)
//  断言:①所有行等宽(无 transform 缩放) ②静止鼠标滚轮滚动 hoverFocus 恒 -1
//  ③慢速滚动(步间隔 200ms>滚轮门 120ms)也不预选 ④真实 mousemove 后 enter 预选生效
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
  ui.openInventory();
  await new Promise((r2) => setTimeout(r2, 300));

  const widths = () => [...ui.craftListEl.children].map((row) => Math.round(row.getBoundingClientRect().width));
  const out = {};
  // ① 行等宽(无 transform)
  out.widths = widths();
  out.equalWidth = out.widths.every((w) => Math.abs(w - out.widths[0]) <= 1);
  out.hasTransform = [...ui.craftListEl.children].some((row) => (row.style.transform ?? '') !== '');
  // ② 静止鼠标滚轮快速滚动 → 不预选
  for (let k = 0; k < 8; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  }
  await new Promise((r2) => setTimeout(r2, 400));
  out.hoverAfterFastWheel = ui.hoverFocus;
  // ③ 慢速滚动(步间隔 200ms,鼠标静止) → 不预选
  for (let k = 0; k < 4; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    await new Promise((r2) => setTimeout(r2, 200));
  }
  await new Promise((r2) => setTimeout(r2, 300));
  out.hoverAfterSlowWheel = ui.hoverFocus;
  // ④ 真实 mousemove 后 enter → 预选生效
  const row2 = ui.craftListEl.children[2];
  row2.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  row2.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  await new Promise((r2) => setTimeout(r2, 300));
  out.hoverAfterRealMove = ui.hoverFocus;
  // ⑤ 预选态下静止鼠标慢速滚动 → hover 清退且不再误选
  for (let k = 0; k < 3; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    await new Promise((r2) => setTimeout(r2, 200));
  }
  await new Promise((r2) => setTimeout(r2, 300));
  out.hoverAfterWheelPostHover = ui.hoverFocus;
  out.widthsAfter = widths();
  out.equalWidthAfter = out.widthsAfter.every((w) => Math.abs(w - out.widthsAfter[0]) <= 1);
  return out;
});
console.log(JSON.stringify(r, null, 1));
const ok = r.equalWidth && r.equalWidthAfter && !r.hasTransform
  && r.hoverAfterFastWheel === -1 && r.hoverAfterSlowWheel === -1
  && r.hoverAfterRealMove !== -1 && r.hoverAfterWheelPostHover === -1;
console.log(ok ? 'PROBE OK' : 'PROBE FAILED');
await browser.close();
process.exitCode = ok ? 0 : 1;
