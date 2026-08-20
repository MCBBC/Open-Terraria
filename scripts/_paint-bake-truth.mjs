// 油漆烘焙真值对拍探针（scripts/_paint-bake-truth.mjs）：
// ChunkCache.tintRegion 逐像素走 TileShader.cso 真值（applyPaintTint/Special）验证。
// 用法：SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_paint-bake-truth.mjs
// 场景（chunk 0,0 row0，均为 external 目标 cell=-1 烘焙）：
//   (0,0) 泥土+红漆1     → 表内 DefaultDirt：棕底入窗 invert → 保原色（特判组分发的阴性证明）
//   (1,0) 石块+白漆26    → 表外普通组：中灰 128 → 白漆提亮曲线 ≈192（旧 multiply 乘白=恒等 128）
//   (2,0) 草块+红漆1     → 表内 DefaultDirt：左半绿入漆 / 右半棕保色（同格双态）
//   (3,0) 草块+深红13    → 深层不吃特判组 → 普通深红档
//   (4,0) 泥土+棕漆28    → 表外…泥土是表内!但 28>12 → 普通棕档 (hi,.7hi,.49hi)
//   (5,0) 石块+负相30    → 普通瓦片档反转
//   墙(6,0) 负相30墙漆   → Pass44 墙档 max(1.5-2c,0)
// 断言：painted 逐像素 === truth(base)（base=同源无漆烘焙），另加硬编码期望锚点。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 600));

const out = await page.evaluate(async () => {
  const { ChunkCache } = await import('/src/render/ChunkCache.ts');
  const { applyPaintTint, applyPaintTintSpecial } = await import('/src/world/Paint.ts');
  const { TileStore } = await import('/src/world/TileStore.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');

  const TILE = 16;
  const st = new TileStore(24, 8);
  const world = { store: st, treeX: [], treeStyle: [0, 0, 0, 0], treeTops: [], groundLevel: 2, w: st.w };

  // 素材桩：solid/single 画布。草块用左右分色（绿|棕）验特判门双态。
  const baseCanvas = (r, g, b, half) => {
    const c = document.createElement('canvas'); c.width = c.height = TILE;
    const x = c.getContext('2d');
    x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, TILE, TILE);
    if (half) { x.fillStyle = half; x.fillRect(0, 0, TILE / 2, TILE); }
    return c;
  };
  const sheets = new Map();
  const DIRT = TILE_BY_KEY['dirt'], STONE = TILE_BY_KEY['stone'], GRASS = TILE_BY_KEY['grass'];
  sheets.set(DIRT, { canvas: baseCanvas(151, 107, 75), kind: 'single' });            // 泥土棕
  sheets.set(STONE, { canvas: baseCanvas(128, 128, 128), kind: 'single' });          // 中灰
  sheets.set(GRASS, { canvas: baseCanvas(151, 107, 75, 'rgb(28,216,94)'), kind: 'single' }); // 右绿左棕

  const wallStub = {
    hasTexture: () => true,
    draw: (c, _st, _x, _y, _id, _tr, px, py) => { c.fillStyle = 'rgb(100,150,200)'; c.fillRect(px, py, TILE, TILE); },
  };

  const cells = [
    { x: 0, layer: 'tile', type: DIRT, paint: 1, special: true,  note: '泥土+红1:特判保棕' },
    { x: 1, layer: 'tile', type: STONE, paint: 26, special: false, note: '中灰+白26:提亮≈192' },
    { x: 2, layer: 'tile', type: GRASS, paint: 1, special: true,  note: '草+红1:绿染棕留' },
    { x: 3, layer: 'tile', type: GRASS, paint: 13, special: false, note: '草+深红13:普通深档' },
    { x: 4, layer: 'tile', type: DIRT, paint: 28, special: false, note: '泥土+棕28:普通棕档' },
    { x: 5, layer: 'tile', type: STONE, paint: 30, special: false, note: '石+负相30:瓦片档' },
    { x: 6, layer: 'wall', type: 0, paint: 30, special: false, note: '墙+负相30:Pass44' },
  ];

  const bake = (painted) => {
    for (const c of cells) {
      if (c.layer === 'tile') st.setPaintSilent(c.x, 0, painted ? c.paint : 0);
      else st.setPaintWallSilent(c.x, 0, painted ? c.paint : 0);
    }
    const wallPage = document.createElement('canvas'); wallPage.width = wallPage.height = 256;
    const tilePage = document.createElement('canvas'); tilePage.width = tilePage.height = 256;
    const cc = new ChunkCache(world, sheets, null, wallStub);
    cc.bakeChunkInto(0, 0, wallPage, tilePage, -1);
    return c => (c.layer === 'tile' ? tilePage : wallPage).getContext('2d').getImageData(c.x * TILE, 0, TILE, TILE).data;
  };

  // 布置世界（一次；bake 只翻漆位）
  for (const c of cells) {
    if (c.layer === 'tile') st.setTileSilent(c.x, 0, c.type);
    else st.setWallSilent(c.x, 0, 1);
  }
  const base = bake(false);
  const tinted = bake(true);

  // 硬编码 DefaultDirt 设置（探针侧独立于 getTilePaintSettings，防同源假阳）
  const defaultDirt = { hueTestOffset: Math.fround(0), minHue: Math.fround(0.03), maxHue: Math.fround(0.08),
    minSat: Math.fround(0.38), maxSat: Math.fround(0.53), invert: true };

  const res = { cells: [], mismatches: 0 };
  for (const c of cells) {
    const b = base(c), t = tinted(c);
    let bad = 0, first = null;
    for (let p = 0; p < b.length; p += 4) {
      if (b[p + 3] === 0) { if (t[p + 3] !== 0) { bad++; } continue; } // 透明保透明
      const e = c.special
        ? applyPaintTintSpecial(b[p], b[p + 1], b[p + 2], c.paint, defaultDirt)
        : applyPaintTint(b[p], b[p + 1], b[p + 2], c.paint, c.layer === 'wall');
      if (t[p] !== e[0] || t[p + 1] !== e[1] || t[p + 2] !== e[2]) {
        bad++;
        if (!first) first = `px${p / 4}: got(${t[p]},${t[p + 1]},${t[p + 2]}) want(${e[0]},${e[1]},${e[2]}) base(${b[p]},${b[p + 1]},${b[p + 2]})`;
      }
    }
    res.cells.push({ x: c.x, note: c.note, bad, first });
    res.mismatches += bad;
  }

  // 锚点抽样（硬编码期望，非真值函数回声）
  const px = (d, x, y) => [d[(y * TILE + x) * 4], d[(y * TILE + x) * 4 + 1], d[(y * TILE + x) * 4 + 2]];
  const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  const t0 = tinted(cells[0]), b0 = base(cells[0]);
  const t1 = tinted(cells[1]), t2 = tinted(cells[2]), b2 = base(cells[2]);
  const t3 = tinted(cells[3]), t4 = tinted(cells[4]), t5 = tinted(cells[5]), t6 = tinted(cells[6]);
  res.anchors = {
    dirtRedKeepBrown: eq(px(t0, 8, 8), [151, 107, 75]) && eq(px(t0, 8, 8), px(b0, 8, 8)), // 特判组保棕
    grayWhiteBrighten: eq(px(t1, 8, 8), [192, 192, 192]) && px(t1, 8, 8)[0] !== 128,      // 提亮曲线(手算锚)；旧 multiply 乘白恒等 128
    grassSplit: eq(px(t2, 3, 8), [216, 28, 28]) && eq(px(t2, 11, 8), px(b2, 11, 8)),      // 左绿染(hi,lo,lo) 右棕留
    grassDeepPlain: eq(px(t3, 3, 8), [...applyPaintTint(28, 216, 94, 13)]),               // 深层走普通档
    dirtBrownPlain: eq(px(t4, 8, 8), [...applyPaintTint(151, 107, 75, 28)]),              // 28>12 特判不生效
    stoneNegative: eq(px(t5, 8, 8), [...applyPaintTint(128, 128, 128, 30)]),
    wallNegative: eq(px(t6, 8, 8), [...applyPaintTint(100, 150, 200, 30, true)]),         // Pass44 墙档
  };
  res.grassRedLeftPx = px(t2, 3, 8);
  res.grayWhitePx = px(t1, 8, 8);
  return res;
});
if (errs.length) { console.log('PAGE ERRORS:', errs); }
console.log(JSON.stringify(out, null, 2));
const ok = out && out.mismatches === 0 && Object.values(out.anchors).every(Boolean);
console.log(ok ? 'RESULT: PASS (bake pixels === TileShader truth)' : 'RESULT: FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
