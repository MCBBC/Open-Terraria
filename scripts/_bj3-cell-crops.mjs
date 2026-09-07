// SW-BJ3 逐格 4x 放大裁剪：平台四态（平/坡1/坡2/半砖）×代表型，判读渲染形态
// （坡面补片 198/306/324、半砖 plank 在格下半——旧实现此格曾整格隐形）。
// 运行：SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj3-cell-crops.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const OUT = '/tmp/bj3-platform-shots';
fs.mkdirSync(OUT, { recursive: true });
// 每型一行;两型一组便于对比：wood0 / palm17(海边) / frozen35(原缺) / team427 / planter380s1
const TYPES = [[94, 'wood0'], [2518, 'palm17'], [3908, 'frozen35'], [3622, 'team427'], [3216, 'planter380s1']];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5207/', { waitUntil: 'domcontentloaded', timeout: 180000 });
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
await page.evaluate(() => window.__swFlow.newWorld('bj3c', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async (TYPES) => {
  const g = window.__swGame;
  const st = g.world.store;
  const items = await import('/src/data/items.ts');
  const tiles = await import('/src/data/tiles.ts');
  const ITEM_DEFS = items.ITEM_DEFS, TILE_BY_KEY = tiles.TILE_BY_KEY;
  const defOfVid = (vid) => ITEM_DEFS.find((d) => { const m = /^vi_(\d+)_/.exec(d.key); return m && Number(m[1]) === vid; });
  const DIRT = TILE_BY_KEY['dirt'];
  const setPlayer = (tx, ty) => {
    g.player.x = tx * 16 + 2; g.player.y = ty * 16 - 44;
    g.player.vx = 0; g.player.vy = 0; g.player.hp = g.player.maxHp; g.player.dead = false;
    g.player.cx = g.player.x; g.player.cy = g.player.y;
  };
  const place = (cx, cy, item) => { g.lastMineHitTick = -999; g.hammerPoundRelease = true; g.player.useTime = 0; g.tryPlace(cx, cy, item); };
  const hammer = (cx, cy) => { g.hammerPoundRelease = true; g.lastMineHitTick = -999; g.player.useTime = 0; g.tryMine(cx, cy, 0, 'hammer', 20); };

  const shots = [];
  for (let row = 0; row < TYPES.length; row++) {
    const [vid, name] = TYPES[row];
    const item = defOfVid(vid);
    const py = 110 + row * 8;
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
    for (let x = 30; x < 66; x++) st.setTileSilent(x, strip + 6, DIRT, 0, 0);  // 行间走道
    shots.push({ name, row, py, itemStyle: item.placeStyle ?? 0 });
  }
  g.chunks.markDirtyArea(28, 105, 68, 175);
  await new Promise((r) => setTimeout(r, 1500));
  const cam = g.camera, zoom = cam.zoom ?? 1.25;
  const crops = [];
  for (const s of shots) {
    setPlayer(42, s.py + 1);
    await new Promise((r) => setTimeout(r, 900));
    for (const [k, cx] of [['flat', 36], ['slope1', 40], ['slope2', 44], ['half', 48]]) {
      const [sx, sy] = cam.worldToScreen((cx - 1) * 16, (s.py - 1) * 16);
      const W = Math.round(3 * 16 * zoom), H = Math.round(3 * 16 * zoom);
      const png = (() => {
        const cv = g.renderer.canvas;
        const off = document.createElement('canvas');
        off.width = W * 4; off.height = H * 4;
        const octx = off.getContext('2d');
        octx.imageSmoothingEnabled = false;
        octx.drawImage(cv, Math.round(sx), Math.round(sy), W, H, 0, 0, W * 4, H * 4);
        return off.toDataURL('image/png');
      })();
      crops.push({ name: s.name, cell: k, png });
    }
  }
  return crops;
}, TYPES);

for (const c of out) fs.writeFileSync(`${OUT}/cell-${c.name}-${c.cell}.png`, Buffer.from(c.png.split(',')[1], 'base64'));
console.log('DONE', out.length, 'crops ->', OUT);
await browser.close();
