// ★BJ621 明胶水晶放置态贴图复验探针 v2（v1 探针 bug 修正：hardMode 门未刷新+投影错位）。
// v1 结论留档：B 面绘制端到端=凝胶格 fx=324 全相位 sx∈{324..414}×{0,72}（绘制面无罪续证）。
// v2 修：①直设 evo.hardMode=true（同 BJ586 T1 口径）②像素投影走 camera.toScreen
//   ③对照格存活性回读 ④真实 fixedUpdate 驱动段（演化采样骨架真机链）。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });

await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj621-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj621', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player && !!window.__swGame?.evolution, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));

await page.evaluate(() => {
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  window.__bj621 = { rec: [] };
  proto.drawImage = function (img, sx, sy, sw, sh, ...rest) {
    try {
      if (img && img.width === 432 && img.height === 144) window.__bj621.rec.push({ sx, sy, sw, sh });
    } catch { /* ignore */ }
    return orig.apply(this, arguments);
  };
});

// ── A 面：写入面端到端 ──
const A = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const w = g.world;
  w.flags.hardMode = true;
  const tilesMod = await import('/src/data/tiles.ts');
  const S = (sheet) => {
    for (let id = 0; id < tilesMod.TILE_DEFS.length; id++) {
      if (tilesMod.TILE_DEFS[id]?.vanilla?.sheet === sheet) return id;
    }
    return -1;
  };
  const pearlId = S(117), crystalId = S(129);
  const rockJ = Math.floor(w.rockLevel) + 20;
  for (let x = 60; x < 90; x++) st.setTileSilent(x, rockJ, pearlId, 0, 0);
  for (let x = 120; x < 150; x++) st.setTileSilent(x, rockJ, pearlId, 0, 0);
  g.chunks.markDirtyArea(50, rockJ - 6, 160, rockJ + 6);
  const evo = g.evolution;
  evo.hardMode = true;                             // ★v2 修正：直设（真机链由 update() 头刷新）
  const scan = () => {
    const out = [];
    for (let x = 0; x < st.w; x++) for (let y = 0; y < st.h; y++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === crystalId) out.push({ x, y, fx: st.frameX[i], fy: st.frameY[i] });
    }
    return out;
  };
  const hardUW = evo['hardUpdateWorld'].bind(evo);
  for (let n = 0; n < 6000; n++) {
    hardUW(60 + (n % 30), rockJ);
    hardUW(120 + (n % 30), rockJ);
  }
  const cells = scan();
  const gel = cells.filter((c) => c.fx >= 324);
  const shard = cells.filter((c) => c.fx < 324);
  const preGel = gel.map((c) => `${c.x},${c.y}:${c.fx}`).join('|');
  // 级联稳定段 1：真实演化采样骨架 update() ×90
  for (let n = 0; n < 90; n++) evo.update();
  const mid = scan();
  // 级联稳定段 2：真实 fixedUpdate（rAF 3s，Game 全链）
  await new Promise((res) => setTimeout(res, 3000));
  const after = scan();
  const fxMap = new Map(after.map((c) => [`${c.x},${c.y}`, c.fx]));
  const killed = cells.filter((c) => !fxMap.has(`${c.x},${c.y}`)).length;
  const mutated = cells.filter((c) => {
    const fx = fxMap.get(`${c.x},${c.y}`);
    return fx !== undefined && fx !== c.fx;
  }).length;
  return {
    rockLevel: w.rockLevel, rockJ,
    totals: { writes: cells.length, shard: shard.length, gel: gel.length },
    gelFx: gel.map((c) => c.fx), shardFxSample: shard.slice(0, 8).map((c) => c.fx),
    midTotal: mid.length, midGel: mid.filter((c) => c.fx >= 324).length,
    afterCascade: { total: after.length, gel: after.filter((c) => c.fx >= 324).length, killed, mutated },
    gelCells: gel.slice(0, 4).map((c) => ({ x: c.x, y: c.y, fx: c.fx, fy: c.fy })),
    preGel,
  };
});
console.log('A_WRITE:', JSON.stringify(A, null, 1));

// ── B 面：绘制面端到端（对照格 fx=0 vs fx=324 + 呈现层像素）──
const B = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  const S = (sheet) => {
    for (let id = 0; id < tilesMod.TILE_DEFS.length; id++) {
      if (tilesMod.TILE_DEFS[id]?.vanilla?.sheet === sheet) return id;
    }
    return -1;
  };
  const crystalId = S(129), stoneId = S(1);
  const rockJ = Math.floor(g.world.rockLevel) + 40;
  for (let x = 200; x < 220; x++) st.setTileSilent(x, rockJ, stoneId, 0, 0);
  st.setTile(210, rockJ - 1, crystalId, 0, 0);     // 对照：碎块域 style0
  st.setTile(211, rockJ - 1, crystalId, 324, 0);   // 实验：凝胶域 phase0
  g.chunks.markDirtyArea(205, rockJ - 5, 216, rockJ + 2);
  g.player.x = 210.5 * 16; g.player.y = (rockJ - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  g.player.cx = g.player.x; g.player.cy = g.player.y;
  window.__bj621.rec.length = 0;
  await new Promise((res) => setTimeout(res, 2500));
  const rec = window.__bj621.rec.slice();
  const ia = st.idx(210, rockJ - 1), ib = st.idx(211, rockJ - 1);
  const cam = g.camera;
  const pa = cam.worldToScreen(210 * 16 + 8, (rockJ - 1) * 16 + 8);
  const pb = cam.worldToScreen(211 * 16 + 8, (rockJ - 1) * 16 + 8);
  return {
    recCount: rec.length,
    rec: rec.slice(0, 400),
    shardAlive: { active: !!st.flags[ia], fx: st.frameX[ia], fy: st.frameY[ia] },
    gelAlive: { active: !!st.flags[ib], fx: st.frameX[ib], fy: st.frameY[ib] },
    proj: { a: { x: pa[0], y: pa[1] }, b: { x: pb[0], y: pb[1] }, zoom: cam.zoom, viewW: cam.viewW },
  };
});
console.log('B_STATE:', JSON.stringify({ shardAlive: B.shardAlive, gelAlive: B.gelAlive, recCount: B.recCount }));
const sxHist = {};
for (const r of B.rec) { const k = `x${r.sx}_y${r.sy}`; sxHist[k] = (sxHist[k] || 0) + 1; }
console.log('B_SX_HIST:', JSON.stringify(sxHist));

// 呈现层像素
const shot = await page.screenshot({ type: 'png' });
const { PNG } = await import('pngjs');
const png = PNG.sync.read(shot);
const analyze = (cx, cy, z) => {
  let opaque = 0, tot = 0, rs = 0, gs = 0, bs = 0;
  const half = Math.max(4, Math.round(8 * z));
  for (let dy = -half; dy < half; dy++) for (let dx = -half; dx < half; dx++) {
    const px = Math.round(cx + dx), py = Math.round(cy + dy);
    if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
    const idx = (py * png.width + px) * 4;
    tot++;
    if (png.data[idx + 3] > 10) { opaque++; rs += png.data[idx]; gs += png.data[idx + 1]; bs += png.data[idx + 2]; }
  }
  return { opaqueRate: tot ? +(opaque / tot).toFixed(3) : 0, avg: opaque ? [Math.round(rs / opaque), Math.round(gs / opaque), Math.round(bs / opaque)] : null };
};
console.log('PIX_SHARD(fx=0):', JSON.stringify(analyze(B.proj.a.x, B.proj.a.y, B.proj.zoom)));
console.log('PIX_GEL(fx=324):', JSON.stringify(analyze(B.proj.b.x, B.proj.b.y, B.proj.zoom)));

// ── C 面：凝胶格真实渲染闭环 ──
if (A.gelCells?.length) {
  const C = await page.evaluate(async (cell) => {
    const g = window.__swGame;
    const st = g.world.store;
    g.player.x = (cell.x + 0.5) * 16; g.player.y = (cell.y - 4) * 16; g.player.cx = g.player.x; g.player.cy = g.player.y;
    g.chunks.markDirtyArea(cell.x - 4, cell.y - 4, cell.x + 4, cell.y + 4);
    window.__bj621.rec.length = 0;
    await new Promise((res) => setTimeout(res, 1800));
    const rec = window.__bj621.rec.slice();
    const i = st.idx(cell.x, cell.y);
    return { rec, storeNow: { type: st.type[i], fx: st.frameX[i], fy: st.frameY[i], active: !!st.flags[i] } };
  }, A.gelCells[0]);
  const cGel = C.rec.filter((r) => r.sx >= 324).length;
  const cShard = C.rec.filter((r) => r.sx < 324).length;
  console.log('C_STORE:', JSON.stringify(C.storeNow));
  console.log('C_RENDER_SPLIT: gel=', cGel, ' shard=', cShard);
  console.log('C_SX_HIST:', JSON.stringify(C.rec.reduce((m, r) => { const k = `x${r.sx}y${r.sy}`; m[k] = (m[k] || 0) + 1; return m; }, {})));
} else {
  console.log('C_SKIP: no gel cell from evolution');
}

await browser.close();
console.log('BJ621 PROBE DONE');
