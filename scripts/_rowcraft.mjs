// 行点击即合成探针（用户要求"合成按钮去除,点击配方就是合成"）：
// ①craftGridEl 无按钮 ②点击火把行 → 背包 凝胶-1/木材-1/火把+3
// ③材料格存料后点击行 → 仍合成（格料先归还再统一扣）
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
  const world = new World(300, 180, 777, 'row-craft');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < 300; x++) { for (let y = 95; y < 180; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  world.store.setTile(152, 93, 13);
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  const inv = g.player.inv;
  const woodId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[9]];
  const gelId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[23]];
  const torchId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[8]];
  inv.add(woodId, 100); inv.add(gelId, 50);
  ui.openInventory();
  let t0 = Date.now();
  while (ui.craftListEl.children.length === 0 && Date.now() - t0 < 3000) await new Promise((r2) => setTimeout(r2, 100));
  const cnt = (id) => inv.countOf(id);
  // ① 无按钮
  const hasBtn = !!ui.craftGridEl.querySelector('button');
  // ② 点击火把行直接合成
  const vr = await import('/src/data/vanillaRecipes.ts');
  const avail = g.vanillaAvailableRecipes();
  let torchIdx = avail.findIndex(({ r }) => r.create === 8);
  if (torchIdx < 0) return { why: 'no torch recipe' };
  ui.craftFocus = torchIdx;
  ui.refreshAll();
  await new Promise((r2) => setTimeout(r2, 300));
  const row = ui.craftListEl.children[ui.craftFocus - Math.max(0, ui.craftFocus - 4)];  // 渲染行=配方号-窗start
  const w0 = cnt(woodId), g0 = cnt(gelId), t0c = cnt(torchId);
  row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await new Promise((r2) => setTimeout(r2, 300));
  const craft1 = { wood: cnt(woodId) - w0, gel: cnt(gelId) - g0, torch: cnt(torchId) - t0c };
  // ③ 格子存料后点击行仍合成：先放料入格（木1+凝胶1），背包再各减到不足?——
  //    简化:放料后背包 wood=craft后值,格里有1木1凝胶;点行 → 格料归还再扣,净效果同②
  const chips = ui.craftGridEl.querySelectorAll('.sw-slot.chip');
  chips.forEach((c) => c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })));
  await new Promise((r2) => setTimeout(r2, 200));
  const gridStored = [...ui.craftGrid.values()].reduce((s, n) => s + n, 0);
  const w1 = cnt(woodId), g1 = cnt(gelId);
  row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await new Promise((r2) => setTimeout(r2, 300));
  const craft2 = { wood: cnt(woodId) - w1, gel: cnt(gelId) - g1, torch: cnt(torchId) - t0c };
  const gridAfter = [...ui.craftGrid.values()].reduce((s, n) => s + n, 0);
  return { hasBtn, craft1, gridStored, craft2, gridAfter,
    torchStack: avail[torchIdx].r.createStack };
});
console.log(JSON.stringify(r, null, 1));
const ok = r.hasBtn === false
  && r.craft1.wood === -1 && r.craft1.gel === -1 && r.craft1.torch === r.torchStack
  && r.gridStored >= 2
  && r.craft2.torch === r.torchStack * 2      // 累计口径:craft1+craft2 各 +3
  && r.craft2.wood === 0 && r.craft2.gel === 0    // 相对 w1(存料后)净 0=吃格料,不动背包
  && r.gridAfter === 0;
console.log(ok ? 'PASS: 无按钮,行点击即合成,格料归还后统一扣' : 'FAIL');
await browser.close();
