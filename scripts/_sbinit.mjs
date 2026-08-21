// 滚动条初始可见性探针：openInventory 后【不滚动】读 track display/几何
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
  const world = new World(300, 180, 777, 'sb-init');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < 300; x++) { for (let y = 95; y < 180; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  world.store.setTile(152, 93, 13);
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  g.player.inv.add(items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[9]], 999);
  ui.openInventory();
  let t0 = Date.now();
  while (ui.craftListEl.children.length < 8 && Date.now() - t0 < 3000) await new Promise((r2) => setTimeout(r2, 100));
  await new Promise((r2) => setTimeout(r2, 400));
  const trk = ui.craftTrackEl, thb = ui.craftThumbEl;
  const avail = g.vanillaAvailableRecipes();
  return {
    availLen: avail.length,
    display: trk.style.display || '(empty)',
    trackH: Math.round(trk.getBoundingClientRect().height),
    thumbTop: thb.style.top, thumbH: thb.style.height,
    listH: Math.round(ui.craftListEl.getBoundingClientRect().height),
    meta: { ...ui.craftScrollMeta },
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
