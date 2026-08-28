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
  const world = new World(300, 180, 777, 'pigdbg2');
  world.spawnX = 150; world.spawnY = 90;
  for (let x = 0; x < 300; x++) { for (let y = 95; y < 180; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  for (let i = 0; i < 40 && !window.__swItems; i++) await new Promise((r2) => setTimeout(r2, 50));
  const g = window.__swGame;
  if (g.player.dead) g.respawnPlayer?.();
  const { FlyingPiggyBank } = await import('/src/entities/FlyingPiggyBank.ts');
  g.player.inv.slots[0] = { id: window.__swItems[window.__swVANILLA_ITEM_KEY_BY_ID[3213]], stack: 1 };
  g.cb.onInventoryChanged?.();
  g.input.mouseX = 640; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const pig = g.entities.projectiles.find((e) => e instanceof FlyingPiggyBank);
  for (let i = 0; i < 120 && pig && pig.phase === 0; i++) g.fixedUpdate(1 / 60);
  const [sx, sy] = g.camera.worldToScreen(pig.cx, pig.cy);
  g.input.mouseX = sx; g.input.mouseY = sy;
  const hit = g.containerPetHit ? g.containerPetHit() : 'no-method';
  const [wx, wy] = g.camera.screenToWorld(sx, sy);
  return {
    pigRect: { x: pig.x, y: pig.y, w: pig.w, h: pig.h, cx: pig.cx, cy: pig.cy },
    mouseWorld: [wx, wy], mouseScreen: [sx, sy],
    hit: hit ? (hit.kind) : null,
    contains: wx >= pig.x && wx < pig.x + pig.w && wy >= pig.y && wy < pig.y + pig.h,
    inRange: g.inTileRange(Math.floor(pig.cx / 16), Math.floor(pig.cy / 16)),
    pigBucketIdx: g.entities.projectiles.indexOf(pig),
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
