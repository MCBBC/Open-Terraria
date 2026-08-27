// 一次性:钱币升面验证——满槽 EmergencyStacking 合并银 60+60 → 100 → 升金币 stack=1
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1200, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', (e.stack || e.message).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const vc = await import('/src/data/vanillaItemCombat.ts');
  const raf = (n) => new Promise((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); });
  const vidOf = (d) => vc.viIdFromKey(items.ITEM_DEFS[d.itemId]?.key ?? '');
  const px = Math.floor(g.player.cx / 16);
  const X = px + 6, Y = Math.floor(g.world.groundLevel) - 2;
  const st = g.world.store;
  g.player.x = (X - 3) * 16; g.player.y = (Y - 3) * 16;
  for (let y = Y - 6; y <= Y + 2; y++) for (let x = X - 4; x <= X + 6; x++) if (st.inBounds(x, y)) st.setTile(x, y, 0);
  const drops0 = g.entities.drops;
  drops0.length = 0;                       // 清场(含实体桶直清)
  const spawn = (vid, x, y, n = 1) => {
    const k = items.VANILLA_ITEM_KEY_BY_ID[vid];
    return k ? g.spawnDrop(x * 16, y * 16, k, n) : null;
  };
  // 银 60+60 → 398 个 maxStack=1 石门占槽 → 共 400
  const s1 = spawn(72, X, Y, 60);
  const s2 = spawn(72, X + 1, Y, 60);
  for (let i = 0; i < 398; i++) {
    const xx = X - 12 + (i % 20), yy = Y - 6 - Math.floor(i / 20);
    spawn(4415, xx, yy, 1);
  }
  await raf(3);
  // 第 401 件触发满槽链:pickup(银)age<1200 不可回收 → EmergencyStacking → 银对合并
  spawn(4415, X + 3, Y, 1);
  await raf(30);
  const silverAfter = drops0.filter((d) => !d.dead && vidOf(d) === 72).map((d) => d.stack);
  const gold = drops0.find((d) => !d.dead && vidOf(d) === 73);
  return {
    silverAfter,
    goldStack: gold ? gold.stack : null,
    promotedOK: !!gold && gold.stack === 1,
    total: drops0.filter((d) => !d.dead).length,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
