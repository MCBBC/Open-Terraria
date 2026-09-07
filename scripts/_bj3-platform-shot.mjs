// SW-BJ3 2026-09-06 平台族矩阵视觉核验探针 v3（一次性诊断）：
// 真实 Game 链放置（tryPlace,玩家贴位过射程门）+ 真实 tryMine 锤整形（闩节拍）。
// 逐型行 = 平/坡1/坡2/半砖四态;导出 = 游戏 canvas 直读裁剪（页面截图被
// sw-boot-prime 遮罩挡住,z=10000,headless 下不自愈）。
// ★世界来源 = 合成空 World（patch WorldGenClient:本机 load≈12,worldgen worker 3min 超时）。
// 运行：SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj3-platform-shot.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = '/tmp/bj3-platform-shots';
fs.mkdirSync(OUT, { recursive: true });
const TYPES = [
  [94, 'wood0'], [2518, 'palm17'], [5162, 'coral45'], [2627, 'steampunk21'],
  [3908, 'frozen35'], [5812, 'snow57'], [6125, 'boulder69'],
  [3622, 'team427'], [3638, 'team435'], [3216, 'planter380s1'],
];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj3-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj3', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));

const result = await page.evaluate(async (TYPES) => {
  const g = window.__swGame;
  const st = g.world.store;
  const items = await import('/src/data/items.ts');
  const tiles = await import('/src/data/tiles.ts');
  const ITEM_DEFS = items.ITEM_DEFS, TILE_BY_KEY = tiles.TILE_BY_KEY, TILE_DEFS = tiles.TILE_DEFS;
  const defOfVid = (vid) => ITEM_DEFS.find((d) => { const m = /^vi_(\d+)_/.exec(d.key); return m && Number(m[1]) === vid; });
  const DIRT = TILE_BY_KEY['dirt'];
  const setPlayer = (tx, ty) => {
    g.player.x = tx * 16 + 2; g.player.y = ty * 16 - 44;
    g.player.vx = 0; g.player.vy = 0; g.player.hp = g.player.maxHp; g.player.dead = false;
    g.player.cx = g.player.x; g.player.cy = g.player.y;
  };
  const place = (cx, cy, item) => {
    g.lastMineHitTick = -999; g.hammerPoundRelease = true; g.player.useTime = 0;
    g.tryPlace(cx, cy, item);
  };
  const hammer = (cx, cy) => {
    g.hammerPoundRelease = true; g.lastMineHitTick = -999; g.player.useTime = 0;
    g.tryMine(cx, cy, 0, 'hammer', 20);
  };

  const report = [];
  for (let row = 0; row < TYPES.length; row++) {
    const [vid, name] = TYPES[row];
    const item = defOfVid(vid);
    if (!item) { report.push({ name, err: 'no def' }); continue; }
    const py = 110 + row * 5;
    const strip = py + 1;
    for (let x = 34; x < 62; x++) st.setTileSilent(x, strip, DIRT, 0, 0);
    const cells = { flat: 36, slope1: 40, slope2: 44, half: 48 };
    setPlayer(39, strip);
    for (const k of ['flat', 'slope1']) place(cells[k], py, item);
    hammer(cells.slope1, py);
    setPlayer(47, strip);
    for (const k of ['slope2', 'half']) place(cells[k], py, item);
    for (let b = 0; b < 2; b++) hammer(cells.slope2, py);
    for (let b = 0; b < 3; b++) hammer(cells.half, py);
    for (const [k, cx] of Object.entries(cells)) {
      const i = st.idx(cx, py);
      report.push({
        name, cell: k, x: cx, y: py,
        type: st.type[i], sheet: TILE_DEFS[st.type[i]]?.vanilla?.sheet, style: (item.placeStyle ?? 0),
        fx: st.frameX[i], fy: st.frameY[i], slope: st.slope[i], half: st.half[i] ? 1 : 0,
      });
    }
  }
  // 玩家落脚地板（矩阵下方,防坠崖）
  for (let x = 30; x < 66; x++) st.setTileSilent(x, 164, DIRT, 0, 0);
  g.chunks.markDirtyArea(28, 105, 68, 168);
  await new Promise((r) => setTimeout(r, 1500));   // 懒载表 + chunk 重烘

  const cam = g.camera, zoom = cam.zoom ?? 1.25;
  const crops = [];
  for (let row = 0; row < TYPES.length; row++) {
    const py = 110 + row * 5;
    setPlayer(42, py + 1);                          // 站条上（缝隙列 42,不压目标格）
    await new Promise((r) => setTimeout(r, 900));   // 相机跟随收敛
    const [sx, sy] = cam.worldToScreen(34 * 16, (py - 2) * 16);
    const W = Math.round(20 * 16 * zoom), H = Math.round(6 * 16 * zoom);
    const png = (() => {
      const cv = g.renderer.canvas;
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const octx = off.getContext('2d');
      octx.imageSmoothingEnabled = false;
      octx.drawImage(cv, Math.round(sx), Math.round(sy), W, H, 0, 0, W, H);
      return off.toDataURL('image/png');
    })();
    crops.push({ name: TYPES[row][1], row, png });
  }
  return { report, crops, zoom };
}, TYPES);

fs.writeFileSync(OUT + '/report.json', JSON.stringify(result.report, null, 1));
console.log('REPORT-LEN', result.report.length);
for (const c of result.crops) {
  fs.writeFileSync(`${OUT}/row-${String(c.row).padStart(2, '0')}-${c.name}.png`, Buffer.from(c.png.split(',')[1], 'base64'));
}
console.log('DONE ->', OUT);
await browser.close();
