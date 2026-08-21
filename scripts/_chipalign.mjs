// 材料格图标对齐探针（用户报"配方的每个材料的图标有错位"）：
// 断言每个 .sw-slot.chip 的 img 矩形完全落在格子矩形内（修前 inset8/36×36
// 在 38px 格里向右下溢出 6px）。
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
  const world = new World(W, H, 777, 'chip-align');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < W; x++) { for (let y = 95; y < H; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  world.store.setTile(152, 93, 13);   // 工作台
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  g.player.inv.add(items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[9]], 999);
  g.player.inv.add(items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[23]], 99);   // 凝胶(vid23)→火把(凝胶+木)双材料配方入池
  ui.openInventory();
  let t0 = Date.now();
  while (ui.craftListEl.children.length === 0 && Date.now() - t0 < 3000) await new Promise((r2) => setTimeout(r2, 100));
  // 焦点配方须为多材料（烈焰箭=木箭+火把）：滚轮找 materials>=2 的焦点
  const vr = await import('/src/data/vanillaRecipes.ts');
  const { Lang } = await import('/src/i18n/Lang.ts');
  const avail = g.vanillaAvailableRecipes();
  let multi = -1;
  for (let i = 0; i < avail.length; i++) if (avail[i].r.items.length >= 2) { multi = i; break; }
  if (multi < 0) return { why: 'no multi-material recipe' };
  ui.craftFocus = multi;
  ui.refreshAll();
  await new Promise((r2) => setTimeout(r2, 300));
  const chips = [...ui.craftGridEl.querySelectorAll('.sw-slot.chip')];
  const report = chips.map((c) => {
    const cr = c.getBoundingClientRect();
    const img = c.querySelector('img');
    const ir = img ? img.getBoundingClientRect() : null;
    return {
      chip: [Math.round(cr.width), Math.round(cr.height)],
      img: ir ? [Math.round(ir.left - cr.left), Math.round(ir.top - cr.top), Math.round(ir.width), Math.round(ir.height)] : null,
      inside: ir ? ir.left >= cr.left - 0.5 && ir.top >= cr.top - 0.5
        && ir.right <= cr.right + 0.5 && ir.bottom <= cr.bottom + 0.5 : 'no-img',
    };
  });
  return { focusMulti: multi, name: Lang.itemNameByKey(vr.vanillaItemKey(avail[multi].r.create)), chipCount: chips.length, report };
});
console.log(JSON.stringify(r, null, 1));
const ok = r.report && r.report.length >= 2 && r.report.every((x) => x.inside === true);
console.log(ok ? 'PASS: 图标全部落在格内' : 'FAIL: 仍有溢出');
await page.screenshot({ path: '/tmp/chip-align.png' });
await browser.close();
