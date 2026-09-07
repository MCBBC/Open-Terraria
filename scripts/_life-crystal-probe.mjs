// 生命水晶三症状定谳:①挖 crystal_heart 掉什么(def/key/名) ②破坏音 ③tile 发光
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5206') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) { await new Promise(r => setTimeout(r, 5000)); if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player))) break; }
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const TBK = tiles.TILE_BY_KEY;
  const heartId = TBK['crystal_heart'];
  const def = tiles.TILE_DEFS[heartId];
  const r = { heartId, drop: def.drop, light: def.light ?? null };
  // ③发光:亮处放水晶→清周围→lightAt 读该格
  const px = 400, py = 300; // 挖空区
  st.setTile(px, py, heartId, 0, 0);
  g.lighting.dirty = true;
  for (let i = 0; i < 3; i++) g.fixedUpdate(1 / 60);
  r.lightAtCrystal = g.lighting.lightAt(px, py);
  r.lightAtBeside = g.lighting.lightAt(px + 1, py);
  // ①②挖掉:监听 drop/sfx
  const drops = [];
  const sfx = [];
  const origDrop = g.spawnDrop ? g.spawnDrop.bind(g) : null;
  if (origDrop) g.spawnDrop = (...a) => { const d = origDrop(...a); drops.push(a[0]); return d; };
  const origSfx = g.sfx.play.bind(g.sfx);
  g.sfx.play = (k, ...a) => { sfx.push(k); return origSfx(k, ...a); };
  const origFile = g.playSfxFile?.bind(g);
  if (g.playSfxFile) g.playSfxFile = (k, ...a) => { sfx.push('file:' + k); return origFile(k, ...a); };
  g.breakTile(px, py);
  for (let i = 0; i < 5; i++) g.fixedUpdate(1 / 60);
  g.sfx.play = origSfx;
  if (origFile) g.playSfxFile = origFile;
  r.brokeSfx = sfx;
  // 掉落物实体的 def/key
  r.drops = drops;
  const dropEnts = [];
  for (const e of g.entities.all?.() ?? []) {
    if (e.key || e.itemId || e.def) dropEnts.push({ key: e.key, itemId: e.itemId, def: e.def, stack: e.stack });
    if (dropEnts.length > 6) break;
  }
  r.dropEnts = dropEnts;
  // ②使用音:生命水晶物品若存在,读其 func UseSound
  const items = await import('/src/data/items.ts');
  const r2 = {};
  for (let i = 0; i < items.ITEM_DEFS.length; i++) {
    const d = items.ITEM_DEFS[i];
    if (d && /^vi_29_/.test(d.key ?? '')) r2.vi29def = { i, key: d.key };
  }
  r.vi29 = r2.vi29def ?? null;
  const vc = await import('/src/data/vanillaItemCombat.ts');
  r.ic29 = vc.itemCombat(29) ?? null;
  const vf = await import('/src/data/vanillaItemFunc.ts');
  r.if29 = vf.itemFuncOfVid(29) ?? null;
  return r;
});
console.log('LC=' + JSON.stringify(out));
await browser.close();
