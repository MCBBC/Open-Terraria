// 跨类型合并族修复验证——tile 层 alpha 直测(比合成画布测背景色稳健:无云/光照/背景干扰)。
// 度量 = chunk tile 层指定世界px矩形内 alpha<16 的像素数(=透出背景的像素)。
// 期望: 跨类型交界 == 同型对照(同几何,残余=原版圆角美术自带缺口,两侧一致)。
// 场景(全在清空空中区,无墙):
//   A: 地牢砖full×3|沙half×6|地牢砖full×3  —— 用户报障场景
//   A2 同型对照: 地牢砖full×3|地牢砖half×6|地牢砖full×3
//   B: 沙×6|地牢砖×6 全砖交界;对照=沙|沙
//   C: 水池 石壁|沙底 交界;对照=沙|沙(水下)
// 用法: SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs --timeout=300000 scripts/_crossmerge-alpha-probe.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/crossmerge-profile4',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const K = window.__swTileByKey;
  const sand = K('sand'), dbrick = K('v_41_blue_brick'), stone = K('stone');
  const sx = 2082, sy = Math.floor(g.world.groundLevel) - 26;
  for (let x = sx - 16; x < sx + 34; x++) for (let y = sy - 12; y < sy + 6; y++) { st.setTile(x, y, 0, 0); st.setWall(x, y, 0); }
  const put = (x, y, t, half) => { st.setTile(x, y, t, 0); if (half) st.setHalfBrick(x, y, true); };
  // A: brick full | sand half 交界(用户场景):brick 在 sx+0..2,沙半砖 sx+3..8,brick sx+9..11
  for (let k = 0; k < 3; k++) put(sx + k, sy, dbrick, false);
  for (let k = 3; k < 9; k++) put(sx + k, sy, sand, true);
  for (let k = 9; k < 12; k++) put(sx + k, sy, dbrick, false);
  // A2 同型对照(brick full|brick half):y=sy-3
  for (let k = 0; k < 3; k++) put(sx + k, sy - 3, dbrick, false);
  for (let k = 3; k < 9; k++) put(sx + k, sy - 3, dbrick, true);
  for (let k = 9; k < 12; k++) put(sx + k, sy - 3, dbrick, false);
  // B: 沙×6|地牢砖×6(y=sy-7);对照 沙|沙 在 run 内部
  for (let k = 0; k < 6; k++) put(sx + k, sy - 7, sand, false);
  for (let k = 6; k < 12; k++) put(sx + k, sy - 7, dbrick, false);
  // C: 水池(石壁|沙底):壁 sx+13 列 sy-1..sy+2,沙底 sy+2 行 sx+14..23,水满两格
  for (let j = 0; j < 4; j++) put(sx + 13, sy - 1 + j, stone, false);
  for (let k = 0; k < 10; k++) put(sx + 14 + k, sy + 2, sand, false);
  for (let j = 0; j < 4; j++) put(sx + 24, sy - 1 + j, stone, false);
  for (let x = sx + 14; x < sx + 24; x++) { st.setLiquid(x, sy - 1, 255, 1); st.setLiquid(x, sy, 255, 1); }
  // D: 全 brick×12(y=sy-10) —— brick|brick 同型对照
  for (let k = 0; k < 12; k++) put(sx + k, sy - 10, dbrick, false);
  g.player.x = (sx + 12) * 16; g.player.y = (sy - 14) * 16;
  window.__sx = sx; window.__sy = sy;
});
await new Promise((r) => setTimeout(r, 6000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const sx = window.__sx, sy = window.__sy;
  const S = 256; // CHUNK*TILE
  /** 世界px矩形内 tile 层透明像素数(矩形须落在单 chunk 内) */
  const alphaCount = (x0, y0, w, h) => {
    const cx = Math.floor(x0 / S), cy = Math.floor(y0 / S);
    const p = g.chunks.get(cx, cy);
    const c2 = p.tile.getContext('2d');
    const d = c2.getImageData(x0 - cx * S + p.sx, y0 - cy * S + p.sy, w, h).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 16) n++;
    return n;
  };
  /** 单 tile 透明像素;half=true 时剔除上半 8px(半砖合法留空) */
  const tileA = (tx, ty, half) => {
    const total = alphaCount(tx * 16, ty * 16, 16, 16);
    return half ? total - alphaCount(tx * 16, ty * 16, 16, 8) : total;
  };
  // 逐 tile 对拍: 同一 tile 类型,邻居=同型 vs 邻居=跨类型 → 修复后须相等
  return {
    // A 用户场景: brick full(右邻=沙半砖) vs brick full(右邻=砖半砖)
    A_brick_nextSandHalf: tileA(sx + 2, sy, false),
    A2_brick_nextBrickHalf_ctrl: tileA(sx + 2, sy - 3, false),
    // 沙半砖(右邻=brick full) vs 沙半砖(右邻=沙半砖)
    A_sandHalf_nextBrick: tileA(sx + 8, sy, true),
    A_sandHalf_nextSandHalf_ctrl: tileA(sx + 4, sy, true),
    // 砖半砖对照(右邻=砖 full)
    A2_brickHalf_nextBrick_ctrl: tileA(sx + 8, sy - 3, true),
    // B 全砖: 沙(右邻=brick) vs 沙(右邻=沙);brick(左邻=沙) vs brick(左邻=brick)
    B_sand_nextBrick: tileA(sx + 5, sy - 7, false),
    B_sand_nextSand_ctrl: tileA(sx + 2, sy - 7, false),
    B_brick_nextSand: tileA(sx + 6, sy - 7, false),
    D_brick_nextBrick_ctrl: tileA(sx + 6, sy - 10, false),
    // C 水池: 石(右邻=沙+水) vs 石(右邻=石);沙(左邻=石) vs 沙(左邻=沙)
    C_stone_nextSand: tileA(sx + 13, sy + 2, false),
    C_stone_nextStone_ctrl: tileA(sx + 13, sy + 1, false),
    C_sand_nextStone: tileA(sx + 14, sy + 2, false),
    C_sand_nextSand_ctrl: tileA(sx + 17, sy + 2, false),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
