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
  const world = new World(300, 180, 777, 'smk-debug2');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < 300; x++) { for (let y = 95; y < 180; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  for (let i = 0; i < 40 && !window.__swItems; i++) await new Promise((r2) => setTimeout(r2, 50));
  const g = window.__swGame;
  const id = window.__swItems[window.__swVANILLA_ITEM_KEY_BY_ID[1168]];
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 99 };
  g.cb.onInventoryChanged?.();
  const deadPre = { dead: g.player.dead, hp: g.player.hp, x: g.player.x, y: g.player.y };
  if (g.player.dead) g.respawnPlayer();
  const held = g.player.inv.heldItem();
  const heldDef = held ? window.__swITEM_DEFS[held.id] : null;
  const pre = {
    heldId: held?.id, heldDefKey: heldDef?.key,
    uiBlocking: g.input.uiBlocking, dead: g.player.dead,
    fullMap: g.renderer.fullMap.open, housing: !!g.housingMode,
    ridingMount: g.player.ridingMount, useTime: g.player.useTime,
    selected: g.player.inv.selected, defTile: heldDef?.tile, defWall: heldDef?.wallId,
  };
  // 直呼 updateUse（私有仅 TS 层面）——绕过 fixedUpdate 前置消费者
  g.input.mouseX = 640; g.input.mouseY = 300;
  g.input.mouseDown = true;
  g._prevMouseDown = false;
  g.updateUse(1 / 60);
  const afterDirect = {
    stack: g.player.inv.slots[g.player.inv.selected]?.stack,
    proj196: g.entities.projectiles.filter((p) => p.projId === 196).length,
    useTime: g.player.useTime,
    projAll: g.entities.projectiles.map((p) => p.projId).slice(0, 8),
  };
  g.input.mouseDown = false;
  return { deadPre, pre, afterDirect };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
