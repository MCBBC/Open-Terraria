// 终验:①挖滴水装饰零掉落 ②crystal_heart 发光
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
  const r = {};
  // ①挖滴水装饰→掉落数
  const dx = 420, dy = 300;
  st.setTile(dx, dy, TBK['v_373_water_drip'], 0, 0);
  const typeCheck = st.type[st.idx(dx, dy)];
  const dropLog = [];
  const origDrop = g.spawnDrop?.bind(g);
  if (origDrop) g.spawnDrop = (...a) => { dropLog.push(String(a[2])); return origDrop(...a); };
  const origSpawnItem = g.spawnItemDrop?.bind(g);
  if (origSpawnItem) g.spawnItemDrop = (...a) => { dropLog.push('SID:' + a[0]); return origSpawnItem(...a); };
  g.breakTile(dx, dy);
  for (let i = 0; i < 5; i++) g.fixedUpdate(1 / 60);
  if (origDrop) g.spawnDrop = origDrop;
  if (origSpawnItem) g.spawnItemDrop = origSpawnItem;
  r.typeCheck = typeCheck;
  // 映射审计:TBK['v_373_water_drip'] vs TILE_DEFS 实际索引
  let dripDefIdx = -1;
  for (let i = 0; i < tiles.TILE_DEFS.length; i++) {
    if (tiles.TILE_DEFS[i]?.key === 'v_373_water_drip') { dripDefIdx = i; break; }
  }
  r.mapAudit = {
    tbkV373: TBK['v_373_water_drip'],
    dripDefIdx,
    def144: tiles.TILE_DEFS[144]?.key ?? null,
  };
  r.dripDropLog = dropLog;
  const items = await import('/src/data/items.ts');
  r.dropDefs = dropLog.map((id) => { const d = items.ITEM_DEFS[id]; return d ? `${id}:${d.key}` : `${id}:?`; });
  // 地面残留掉落物实体
  const left = [];
  for (const e of g.entities.all?.() ?? []) {
    if ((e.key ?? '').includes('3182') || (e.key ?? '').includes('373') || (e.itemId ?? -1) === 3182) left.push({ key: e.key, itemId: e.itemId, x: e.x, y: e.y });
  }
  r.leftDrops = left;
  // ②crystal_heart 发光:扫世界原生水晶(worldgen 洞穴内),读其格光
  const heartId = TBK['crystal_heart'];
  let cx = -1, cy = -1;
  for (let y = 100; y < st.h - 200 && cx < 0; y += 3) {
    for (let x = 200; x < st.w - 200; x += 3) {
      if (st.type[st.idx(x, y)] === heartId) { cx = x; cy = y; break; }
    }
  }
  r.foundNative = cx >= 0 ? { cx, cy } : null;
  if (cx < 0) return r;
  g.player.x = cx * 16 - g.player.w / 2; g.player.y = (cy - 4) * 16;
  g.lighting.dirty = true;
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  // 火把照明(六邻放火把)→光传播→数水晶 64px 内闪光粒子(400t)→拆火把暗场对照
  const torchId = TBK['torch'];
  const near = [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1],[cx+1,cy-1],[cx-1,cy+1]];
  for (const [tx, ty] of near) if (!st.type[st.idx(tx, ty)]) st.setTile(tx, ty, torchId, 0, 0);
  g.lighting.dirty = true;
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  r.lightAtHeartWithTorch = g.lighting.lightAt(cx, cy);
  r.torchDiag = {
    torchCells: near.filter(([tx, ty]) => st.type[st.idx(tx, ty)] === torchId),
    lightAtTorchTile: g.lighting.lightAt(cx + 1, cy),
    torchTypeAt: st.type[st.idx(cx + 1, cy)],
    engineRx0: g.lighting.r ? g.lighting.r.length : -1,
  };
  g.particles.length = 0;
  for (let i = 0; i < 400; i++) g.fixedUpdate(1 / 60);
  const ccx = cx * 16 + 16, ccy = cy * 16 + 16;
  r.sparklesWithTorch = g.particles.filter((pt) => Math.hypot(pt.x - ccx, pt.y - ccy) < 64).length;
  r.particleTotal = g.particles.length;
  for (const [tx, ty] of near) if (st.type[st.idx(tx, ty)] === torchId) st.setTile(tx, ty, 0, 0, 0);
  g.lighting.dirty = true;
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  r.lightAtHeartDark = g.lighting.lightAt(cx, cy);
  g.particles.length = 0;
  for (let i = 0; i < 400; i++) g.fixedUpdate(1 / 60);
  r.sparklesDark = g.particles.filter((pt) => Math.hypot(pt.x - ccx, pt.y - ccy) < 64).length;
  r.heartType = st.type[st.idx(cx, cy)];
  r.defLightOnTile = tiles.TILE_DEFS[TBK['crystal_heart']].light ?? null;
  // 扫描器内部状态直诊
  const scanner = g.lighting.scanner ?? g.lighting._scanner ?? g.lighting.tileScanner ?? null;
  const heartIdLocal = TBK['crystal_heart'];
  if (scanner) {
    r.diag = {
      typeAt: st.type[st.idx(cx, cy)],
      heartId: heartIdLocal,
      hasLight: scanner.hasLightById?.[heartIdLocal],
      idxEq: !!scanner.hasLightById,
      flagsAt: st.flags[st.idx(cx, cy)],
    };
  } else {
    r.diag = { scannerKeys: Object.keys(g.lighting).slice(0, 12) };
  }
  return r;
});
console.log('FINAL3=' + JSON.stringify(out));
await browser.close();
