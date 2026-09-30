// ★BJ427 探针：岩浆渲染三症状复现/量化（用户实报 2026-10-01）：
//  ①屏幕底部越贴近岩浆,岩浆底部逐层半透 ②右侧液面高出两格 ③角色往下站一点恢复。
//  【机制假说（反编译定谳,见 tests/bj427-liquid-trail-band.test.ts 头注）】
//   vanilla LiquidRenderer P3 瀑布拖尾循环界 n < rectangle.Height-10（:253）——
//   最后处理行 L=窗底 ty1-8;L+1..L+len 收 opacity k<1 且永不自纠。原版靠绘制窗
//   深度（offScreenRange 12.5 格 + 5,TileDrawing.cs:6669）把带压到屏外;本仓
//   liquidDrawWindow 窗底只 +5 → 带顶三行恰好=屏底三行 sB-2..sB。
//  【本探针量化】深岩浆池（延伸到屏下）,两机位：A=池底贴屏底（病灶）,B=下移 4 格
//   （恢复）。逐世界行采样岩浆覆盖率（(R−B) 归一化,池心列均值）→ A vs B 同世界行
//   差分 = 病灶带;逐列表面/底界扫描 = 症状②独立复核。截图留档。
//  运行：SW_ORIGIN=http://localhost:5660 node tools/run-diag.mjs scripts/_bj427-lava-band.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5660';
const OUT = process.env.BJ427_OUT || '/tmp/bj427-out';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '0522', size: 'small' });
console.log('[probe] createGame', JSON.stringify(gen));
if (!gen.ok) { await browser.close(); process.exit(1); }

// ---- 场景：露天岩浆池（池体延伸到屏下;石壁石底围合=液体模拟稳定;四周清空=天空衬底）----
const scene = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player, st = g.world.store;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  const isSolidTile = (t) => t !== 0;
  // 清场（含池区上下左右大范围 → 池体背后=天空）
  for (let dx = -40; dx <= 40; dx++) for (let dy = -20; dy <= 24; dy++) st.setTile(bx + dx, by + dy, 0);
  // 石壁（左右各 2 格厚,高出锅沿）与石底（3 格厚）
  for (const wx of [-22, -21, 21, 22]) for (let dy = -3; dy <= 16; dy++) st.setTile(bx + wx, by + dy, 1);
  for (let dx = -20; dx <= 20; dx++) for (let dy = 14; dy <= 16; dy++) st.setTile(bx + dx, by + dy, 1);
  // 岩浆池：行 by..by+13（14 行深）满液 255,liquidType 2 = 岩浆（toVanillaType: 2→1）
  for (let dx = -20; dx <= 20; dx++) for (let dy = 0; dy <= 13; dy++) st.setLiquid(bx + dx, by + dy, 255, 2);
  // ★光照脏区助推：setLiquid 不派发 tile listeners → 岩浆光不重算（左半池黑块=光脏区未
  //  覆盖）。touch 池上方空气行派发 listeners → 光照重算扫描覆盖池体。
  for (let dx = -24; dx <= 24; dx++) st.setTile(bx + dx, by - 2, 0);
  // 玩家移出池区（右侧远处地面外——清场区边缘外站浮空由 no-op follow 掩蔽）
  p.x = (bx + 60) * 16 + 8; p.y = (by - 4) * 16; p.vx = 0; p.vy = 0;
  g.camera.follow = () => {};
  try {
    const w = g.world.weather;
    if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; }
    const fx = g.renderer.weatherFx;
    if (fx) { (fx.pool || []).forEach((d) => { d.active = false; }); (fx.snow || []).forEach((d) => { d.active = false; }); (fx.sand || []).forEach((d) => { d.active = false; }); }
  } catch { /* 容忍 */ }
  return { bx, by, floorRow: by + 14, surfRow: by };
});
console.log('[probe] scene', JSON.stringify(scene));
await freezeClock(page, { tod: 0.5 });
await pump(page, 120);
// ★光照脏区排干：大规模 setTile/setLiquid 后光照重算队列需足帧排干（黑块=未排干）
for (let i = 0; i < 240; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

// ---- 采样器：覆盖率 (R−B) 归一化 + 截图 + 逐列扫描 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera;
  const dpr = window.devicePixelRatio || 1;
  const z = cam.zoom;
  const cv = g.renderer.canvas;
  const work = document.createElement('canvas');
  work.width = cv.width; work.height = cv.height;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  globalThis.__bj427 = {
    setCam(x, y) { cam.x = x; cam.y = y; },
    cam() { return { x: cam.x, y: cam.y, z: cam.zoom, vw: cam.viewW, vh: cam.viewH, dpr }; },
    /** 逐世界行覆盖率：rows=[y0..y1],cols=[x0..x1]（世界 tile）。
     *  c=( (R−B) − skyRB ) / ( lavaRB − skyRB );skyRB/lavaRB 自校准（入参世界行）。 */
    profile(y0, y1, x0, x1, skyRow, lavaRows) {
      wctx.drawImage(cv, 0, 0);
      const img = wctx.getImageData(0, 0, work.width, work.height);
      const D = img.data, W = work.width;
      const topPx = cam.y - cam.viewH / 2 / z, leftPx = cam.x - cam.viewW / 2 / z;
      const s = z * dpr;
      const px = (wx, wy) => {
        const dx = Math.round((wx - leftPx) * s), dy = Math.round((wy - topPx) * s);
        if (dx < 0 || dy < 0 || dx >= W || dy >= work.height) return null;
        const o = (dy * W + dx) * 4;
        return [D[o], D[o + 1], D[o + 2]];
      };
      const rowRB = (wy) => {
        let sum = 0, n = 0;
        for (let x = x0; x <= x1; x++) {
          const c = px(x * 16 + 8, wy);
          if (c) { sum += c[0] - c[2]; n++; }
        }
        return n ? sum / n : null;
      };
      const skyRB = rowRB(skyRow * 16 + 8);
      let lavaRB = 0, lavaN = 0;
      for (const lr of lavaRows) { const v = rowRB(lr * 16 + 8); if (v !== null) { lavaRB += v; lavaN++; } }
      lavaRB /= Math.max(1, lavaN);
      const rows = [];
      for (let y = y0; y <= y1; y++) {
        const rb = rowRB(y * 16 + 8);
        rows.push({ y, rb, cov: (rb !== null && skyRB !== null) ? (rb - skyRB) / (lavaRB - skyRB) : null });
      }
      return { skyRB, lavaRB, geom: { topPx, leftPx, s, W: work.width, H: work.height, zoomNow: cam.zoom }, rows };
    },
    /** 逐列扫描：每列表面行（首个 cov>0.5）与底界行（末个 cov>0.35）。 */
    colScan(y0, y1, x0, x1, skyRow, lavaRows) {
      wctx.drawImage(cv, 0, 0);
      const img = wctx.getImageData(0, 0, work.width, work.height);
      const D = img.data, W = work.width;
      const topPx = cam.y - cam.viewH / 2 / z, leftPx = cam.x - cam.viewW / 2 / z;
      const s = z * dpr;
      const px = (wx, wy) => {
        const dx = Math.round((wx - leftPx) * s), dy = Math.round((wy - topPx) * s);
        if (dx < 0 || dy < 0 || dx >= W || dy >= work.height) return null;
        const o = (dy * W + dx) * 4;
        return [D[o], D[o + 1], D[o + 2]];
      };
      const cellRB = (x, y) => {
        let sum = 0, n = 0;
        for (const ox of [-4, 0, 4]) for (const oy of [-4, 0, 4]) {
          const c = px(x * 16 + 8 + ox, y * 16 + 8 + oy);
          if (c) { sum += c[0] - c[2]; n++; }
        }
        return n ? sum / n : null;
      };
      let skyRB = cellRB(x0, skyRow);
      let lavaRB = 0, lavaN = 0;
      for (const lr of lavaRows) { const v = cellRB(Math.round((x0 + x1) / 2), lr); if (v !== null) { lavaRB += v; lavaN++; } }
      lavaRB /= Math.max(1, lavaN);
      const cols = [];
      for (let x = x0; x <= x1; x++) {
        let surf = null, bot = null;
        for (let y = y0; y <= y1; y++) {
          const rb = cellRB(x, y);
          if (rb === null) continue;
          const cov = (rb - skyRB) / (lavaRB - skyRB);
          if (surf === null && cov > 0.5) surf = y;
          if (cov > 0.35) bot = y;
        }
        cols.push({ x, surf, bot });
      }
      return { cols };
    },
    shot() { return cv.toDataURL('image/png'); },
  };
});

const { bx, by, floorRow } = scene;
const geom = await page.evaluate(() => { const c = globalThis.__bj427.cam(); return { halfH: c.vh / 2 / c.z, halfW: c.vw / 2 / c.z }; });
const lavaRowsCal = [by + 4, by + 5, by + 6];

async function caseProfile(name, camYOffsetTiles, shot) {
  // sB（屏底 tile）= by + 12 + offset;topPx 对齐 → 屏底世界 py = (by+12+off)*16
  const sB = by + 12 + camYOffsetTiles;
  const camX = bx * 16;
  const camY = sB * 16 - geom.halfH;
  await page.evaluate(({ x, y }) => globalThis.__bj427.setCam(x, y), { x: camX, y: camY });
  await pump(page, 4);
  for (let i = 0; i < 6; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  const prof = await page.evaluate(({ y0, y1, x0, x1, skyRow, lavaRows }) =>
    globalThis.__bj427.profile(y0, y1, x0, x1, skyRow, lavaRows),
  { y0: by - 1, y1: sB, x0: bx - 12, x1: bx + 12, skyRow: by - 2, lavaRows: lavaRowsCal });
  if (shot) {
    const b64 = await page.evaluate(() => globalThis.__bj427.shot());
    writeFileSync(`${OUT}/bj427-${shot}.png`, Buffer.from(b64.split(',')[1], 'base64'));
  }
  console.log(`[probe] ${name} (sB=${sB}) skyRB=${prof.skyRB} lavaRB=${prof.lavaRB} geom=${JSON.stringify(prof.geom)} 覆盖率剖面（世界行:rb/cov）:`);
  const line = prof.rows.map((r) => `${r.y}:${r.rb === null ? '—' : r.rb.toFixed(0)}/${r.cov === null ? '—' : r.cov.toFixed(3)}`).join('  ');
  console.log(`    ${line}`);
  return { sB, prof };
}

console.log('[probe] === 机位 A：池底贴屏底（病灶预期:屏底三行逐层半透 0.84/0.73/0.42） ===');
const A = await caseProfile('A-disease', 0, 'A-disease');
console.log('[probe] === 机位 B：下移 4 格（恢复预期:全部 ≈1） ===');
const B = await caseProfile('B-recover', 4, 'B-recover');
console.log('[probe] === 机位扫描 off=0..6（病灶窗口定位） ===');
for (let off = 0; off <= 6; off++) await caseProfile(`sweep+${off}`, off, null);

// ---- 症状②独立复核：逐列表面/底界（机位 A）----
const scan = await page.evaluate(({ y0, y1, x0, x1, skyRow, lavaRows }) =>
  globalThis.__bj427.colScan(y0, y1, x0, x1, skyRow, lavaRows),
{ y0: by - 2, y1: A.sB, x0: bx - 18, x1: bx + 18, skyRow: by - 2, lavaRows: lavaRowsCal });
const surfs = scan.cols.map((c) => c.surf);
const bots = scan.cols.map((c) => c.bot);
const uniqS = [...new Set(surfs)], uniqB = [...new Set(bots)];
console.log(`[probe] 逐列表面行集合: ${JSON.stringify(uniqS)}（均匀=无右侧抬高伪影）`);
console.log(`[probe] 逐列底界行集合: ${JSON.stringify(uniqB)}（>1 值=底界参差=症状②形态）`);
writeFileSync(`${OUT}/bj427-cols.json`, JSON.stringify({ scan, A: A.prof, B: B.prof }, null, 1));
console.log(`[probe] 证据目录: ${OUT}`);
await browser.close();
console.log('[probe] done');
