// SW-BJ61-d 诊断 2（一次性）：火把种子为何零发光
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: process.env.SW_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1200, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5199'}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'diag');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('diag', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, .btn, [role=button]')];
  const ok = btns.find((b) => (b.textContent || '').includes('我已知晓'));
  if (ok) ok.click();
});

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  const torchId = (tilesMod.TILE_BY_KEY ?? {})['torch'] ?? -1;
  const chestId = (tilesMod.TILE_BY_KEY ?? {})['chest'] ?? -1;
  // 密封室 + 参数带
  for (let x = 44; x <= 86; x++) for (let y = 114; y <= 136; y++) {
    st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
  }
  for (let x = 44; x <= 86; x++) { st.setTileSilent(x, 112, 1, 0, 0); st.setTileSilent(x, 113, 1, 0, 0); }
  for (let x = 46; x <= 84; x++) st.setTileSilent(x, 132, 1, 0, 0);
  g.world.groundLevel = 80; g.world.rockLevel = 60; g.world.lavaLine = 200;
  g.lighting.dirty = true;
  for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(() => r()));
  const dark = g.lighting.lightAt(58, 128);
  // 放火把 + 手动 full cycle
  st.setTileSilent(55, 131, torchId, 0, 0);
  g.lighting.dirty = true;
  g.lighting.compute(0);            // runFullCycle 同帧完成
  const lit = {
    torchCell: g.lighting.lightAt(55, 131),
    chest: g.lighting.lightAt(58, 128),
    floorMid: g.lighting.lightAt(56, 131),
  };
  // def 与格实况
  const i55 = st.idx(55, 131);
  const d = tilesMod.TILE_DEFS[torchId] ?? {};
  const cell = { type: st.type[i55], flags: st.flags[i55], sheet: d?.vanilla?.sheet, light: d?.light ?? null };
  // 再等 30 帧看是否被空闲 step 覆盖回 0
  for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(() => r()));
  const after = g.lighting.lightAt(58, 128);
  return { torchId, chestId, dark, lit, cell, after, region: { rx: g.lighting.rx, ry: g.lighting.ry, rw: g.lighting.rw, rh: g.lighting.rh } };
});
console.log('DIAG2', JSON.stringify(out, null, 1));
await browser.close();
