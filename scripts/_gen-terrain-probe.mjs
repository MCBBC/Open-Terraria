// mod 地形生成探针:装 mod→fresh page 创建世界→扫 mod tile
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});

// ① 装 mod(首页 install+reload)
const p1 = await browser.newPage();
await p1.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 12000));
await p1.evaluate(async () => {
  const buf = await fetch('mods/dist/calamity.swmod').then(r => r.arrayBuffer());
  await window.__swMods.install(new Uint8Array(buf));
});
await p1.close();

// ② fresh page 进世界
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR: ' + String(e?.stack ?? e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errs.push('CON: ' + m.text().slice(0, 200)); });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 3000));
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.world && window.__swGame.world.store)).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 5000));

// ③ 扫描 mod tile
const r = await page.evaluate(async () => {
  const g = window.__swGame;
  if (!g || !g.world || !g.world.store) return { fail: 'world 不在' };
  const store = g.world.store;
  const wg = await import('/src/world/gen/WorldGen.ts');
  const passes = wg.getModGenPasses();
  const tiles = await import('/src/data/tiles.ts');
  const sulphSand = tiles.TILE_BY_KEY['mod_calamity_sulphurous_sand'] ?? -1;
  const astralDirt = tiles.TILE_BY_KEY['mod_calamity_astral_dirt'] ?? -1;
  let sulphCount = 0, astralCount = 0;
  const w = store.w, h = store.h;
  for (let x = 0; x < w; x += 4) {
    for (let y = 0; y < h; y += 4) {
      const t = store.get(x, y);
      if (t === sulphSand) sulphCount++;
      if (t === astralDirt) astralCount++;
    }
  }
  return {
    passCount: passes.length,
    passNames: passes.map(p => p.name),
    sulphSandId: sulphSand,
    sulphCount, astralCount,
    worldW: w, worldH: h,
  };
});
console.log(JSON.stringify(r, null, 1));
console.log('errs:', errs.slice(0, 4));
await page.screenshot({ path: '/tmp/gen-terrain-probe.png' });
await browser.close();
