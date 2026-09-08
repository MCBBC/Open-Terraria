// IIII220 探针C:火焰花 bloom 开关(正规 addWater 入列) + 实机视觉取证包
//   SW_ORIGIN=http://localhost:5277 node tools/run-diag.mjs --timeout=300000 scripts/_iii220-bloom.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5277';
const OUT = '/tmp/iii220-out';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.bringToFront();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 200000 });
await new Promise((r) => setTimeout(r, 1500));

const rep = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
  const sheetOf = (t) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  const s82 = TILE_BY_KEY['v_82_herbs_sprout'], m83 = TILE_BY_KEY['v_83_herbs_mature'], b84 = TILE_BY_KEY['v_84_herbs_bloom'];
  // 找 ash 平台
  let garden = null;
  for (let y = st.h - 12; y > st.h - 160 && !garden; y--) {
    let run = 0, best = 0, bx = 0;
    for (let x = 20; x < st.w - 20; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && sheetOf(st.type[i]) === 57) { run++; if (run > best) { best = run; bx = x - run + 1; } }
      else run = 0;
    }
    if (best >= 24) garden = { x: bx + 2, y: y - 1, floorY: y };
  }
  if (!garden) return { noGarden: true };
  const { x: gx, y: gy } = garden;
  // 清出工作区(3 格高气墙,防既有岩浆干扰)
  for (let xx = gx - 2; xx <= gx + 10; xx++) for (let yy = gy - 5; yy < gy; yy++) {
    const i = st.idx(xx, yy); st.liquid[i] = 0; st.liquidType[i] = 0;
    if (st.flags[i]) st.setTile(xx, yy, 0);
  }
  // 场(植株=gy 行,正贴 floorY 地基;列间 1 宽灰烬隔墙 3 高,防液体互串):
  //   A= mature+岩浆255 入株格 → 期 bloom;B= mature+岩浆10 → 期 保持 mature;
  //   C= bloom+岩浆10 → 期 退回 mature;D= mature 干燥对照
  //   ★vanilla LiquidCheck:1290 — 非水液体在【上方格】会 KillTile 下方 cut 族
  //   (含 82/83/84) → 岩浆只能入株格自身,不可堆头上(原版岩浆淹没一格格进)
  const place = (dx, t, fx) => st.setTile(gx + dx, gy, t, fx, 0);
  place(2, m83, 90); place(4, m83, 90); place(6, b84, 90); place(8, m83, 90);
  for (const wx of [3, 5, 7]) for (let yy = gy - 2; yy <= gy; yy++) st.setTile(gx + wx, yy, TILE_BY_KEY['ash'], 0, 0);
  const lava = (dx, amt) => {
    const i = st.idx(gx + dx, gy);
    st.liquidType[i] = 2; st.liquid[i] = amt;
    g.liquid?.addWater?.(gx + dx, gy);
  };
  lava(2, 255); lava(4, 10); lava(6, 10);
  // 液体入列后跑 sim(游戏 fixedUpdate 自会 step;这里额外手动 step 几拍保险)
  for (let k = 0; k < 40 && g.liquid?.step; k++) g.liquid.step();
  await wait(2500);
  for (let k = 0; k < 40 && g.liquid?.step; k++) g.liquid.step();
  const rd = (dx) => { const i = st.idx(gx + dx, gy); return { sheet: sheetOf(st.type[i]), fx: st.frameX[i], liquid: st.liquid[i] }; };
  const out = {
    garden,
    A_deepLava: { ...rd(2), expect: 's84(bloom)' },
    B_shallowLava: { ...rd(4), expect: 's83(mature 保持)' },
    C_bloomShallow: { ...rd(6), expect: 's83(退回 mature)' },
    D_dry: { ...rd(8), expect: 's83' },
  };
  // 传送视觉:玩家站田边
  p.x = (gx + 5) * 16 - 8; p.y = gy * 16 - p.h - 2; p.vx = 0; p.vy = 0;
  // 掉落物:火焰花材料+种子 撒在视觉窗口
  const fireKey = VANILLA_ITEM_KEY_BY_ID[318], seedKey = VANILLA_ITEM_KEY_BY_ID[312];
  if (g.spawnDrop) {
    g.spawnDrop((gx + 3) * 16, (gy - 4) * 16, fireKey, 1);
    g.spawnDrop((gx + 5) * 16, (gy - 4) * 16, seedKey, 1);
  }
  p.inv.add(ITEM_BY_KEY[fireKey], 999);
  p.inv.add(ITEM_BY_KEY[seedKey], 999);
  // 药草全家福行(正确基座:各自泥土) — 供族扫视觉
  const soils = [
    [2, 109], [2, 2], [60, 60], [0, 0], [53, 53], [57, 57], [147, 147],
  ];
  void soils;
  out.cam = { x: g.camera.x, y: g.camera.y, zoom: g.camera.zoom };
  window.__iii220g = { gx, gy };
  return out;
});
await new Promise((r) => setTimeout(r, 2500));   // 相机跟随+懒载+烘焙
await page.screenshot({ path: `${OUT}/shot-garden.png` }).catch(() => {});
// 放大裁剪田区(经游戏相机换算)
const clip = await page.evaluate(() => {
  const g = window.__swGame, cam = g.camera, cv = g.renderer.canvas;
  const { gx, gy } = window.__iii220g;
  const s = (wx, wy) => [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const [x0, y0] = s((window.__iii220g.gx - 2) * 16, (window.__iii220g.gy - 6) * 16);
  const [x1, y1] = s((window.__iii220g.gx + 11) * 16, (window.__iii220g.gy + 1) * 16);
  return { x: x0, y: y0, width: Math.min(x1 - x0, cv.width), height: Math.min(y1 - y0, cv.height) };
});
if (clip && clip.width > 10) await page.screenshot({ path: `${OUT}/shot-garden-clip.png`, clip }).catch(() => {});
// 背包域截图(Esc 开背包)
await page.keyboard.press('Escape').catch(() => {});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/shot-inventory.png` }).catch(() => {});
writeFileSync(`${OUT}/bloom-report.json`, JSON.stringify(rep, null, 2));
console.log('SUMMARY', JSON.stringify(rep, null, 1), 'errs:', errs.slice(0, 4));
await browser.close();
