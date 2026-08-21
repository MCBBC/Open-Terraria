// tooltip 首行换行探针：铜短剑(vid 3507? 铜短剑=3507? Copper Shortsword=3507)——
// 用 VANILLA_ITEM_KEY_BY_ID 反查：铜短剑 id=3507。断言 innerText 首行=纯名称。
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
  const world = new World(300, 180, 777, 'tt-line');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < 300; x++) { for (let y = 95; y < 180; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  const { Lang } = await import('/src/i18n/Lang.ts');
  // 铜短剑 vid 3507；木弓 vid 3504? 用铜镐 3503（有伤害+镐力多行）
  for (const vid of [3507, 3503]) {
    const key = items.VANILLA_ITEM_KEY_BY_ID[vid];
    const id = items.ITEM_BY_KEY[key];
    if (!id) continue;
    g.player.inv.slots[0] = { id, stack: 1 };
    g.player.inv.selected = 0;
    ui.showTooltipFor(0, 'inv');
    await new Promise((r2) => setTimeout(r2, 200));
    const lines = ui.tooltip.innerText.split('\n');
    const name = Lang.itemNameByKey(key);
    return { vid, name, lines: lines.slice(0, 4), firstIsName: lines[0] === name, joined: lines[0].includes(name) && lines[0] !== name };
  }
  return { why: 'no item' };
});
console.log(JSON.stringify(r, null, 1));
console.log(r.firstIsName ? 'PASS: 首行=纯名称,参数独立成行' : 'FAIL: 参数拼在名称行');
await browser.close();
