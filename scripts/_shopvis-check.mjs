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
  const world = new World(300, 180, 777, 'shopvis');
  world.spawnX = 150; world.spawnY = 90;
  for (let x = 0; x < 300; x++) { for (let y = 95; y < 180; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  for (let i = 0; i < 40 && !window.__swItems; i++) await new Promise((r2) => setTimeout(r2, 50));
  if (!document.getElementById('sw-npc-style')) {
    const { NpcDialog } = await import('/src/ui/NpcDialog.ts');
    new NpcDialog(document.body, () => {});
  }
  const ui = window.__swUI;
  ui.showNpcShop('vis', [{ key: '', vanillaId: 859, name: 'test', price: 1 }], 999999);
  await new Promise((r2) => setTimeout(r2, 500));
  const panel = document.querySelector('.sw-npc-shop');
  const rootEl = panel?.closest('.sw-root');
  const cs = panel ? getComputedStyle(panel) : null;
  const csRoot = rootEl ? getComputedStyle(rootEl) : null;
  const center = document.elementFromPoint(640, 400);
  return {
    panelExists: !!panel,
    panelRect: panel ? panel.getBoundingClientRect().toJSON() : null,
    panelDisplay: cs?.display, panelVisibility: cs?.visibility, panelOpacity: cs?.opacity, panelZ: cs?.zIndex,
    rootDisplay: csRoot?.display, rootZ: csRoot?.zIndex,
    centerTag: center?.tagName, centerCls: center?.className,
    parentChain: (() => { let c = [], n = panel; while (n && n !== document.body) { c.push((n.className || n.tagName) + ''); n = n.parentElement; } return c; })(),
  };
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: '/tmp/shopvis.png' });
await browser.close();
