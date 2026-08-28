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
const pre = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const world = new World(300, 180, 777, 'clickchk');
  world.spawnX = 150; world.spawnY = 90;
  for (let x = 0; x < 300; x++) { for (let y = 95; y < 180; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  for (let i = 0; i < 40 && !window.__swItems; i++) await new Promise((r2) => setTimeout(r2, 50));
  const el = document.elementFromPoint(300, 600);
  const chain = [];
  let n = el;
  while (n && n !== document.documentElement) {
    const cs = getComputedStyle(n);
    chain.push({ tag: n.tagName, cls: (n.className || '').toString().slice(0, 40), pe: cs.pointerEvents, pos: cs.position, z: cs.zIndex,
      rect: (() => { const r = n.getBoundingClientRect(); return [r.x | 0, r.y | 0, r.width | 0, r.height | 0]; })() });
    n = n.parentElement;
  }
  return { chain, delayUse: window.__swGame.input.delayUseItem };
});
console.log('pre:', JSON.stringify(pre));
await page.mouse.click(300, 600);
const post = await page.evaluate(() => {
  const g = window.__swGame;
  return { md: g.input.mouseDown, delayUse: g.input.delayUseItem,
    atPoint: (() => { const el = document.elementFromPoint(300, 600); return el?.tagName + '.' + el?.className; })() };
});
console.log('post:', JSON.stringify(post));
await browser.close();
