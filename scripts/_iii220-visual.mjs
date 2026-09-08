// IIII220 探针E:照明视觉终审包 — 7 香草全家福(正确基座) + 火焰花三态 + 岩浆池芽 + 掉落 + 背包
//   SW_ORIGIN=http://localhost:5277 node tools/run-diag.mjs --timeout=280000 scripts/_iii220-visual.mjs
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
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 200000 });
await new Promise((r) => setTimeout(r, 1500));
// 排除欢迎 dialog(点"我已知晓")
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const ok = btns.find((b) => /我已知晓/.test(b.textContent ?? ''));
  ok?.click();
});
await new Promise((r) => setTimeout(r, 400));

const rep = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
  const sheetOf = (t) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  const T = (k) => TILE_BY_KEY[k];
  const s82 = T('v_82_herbs_sprout'), m83 = T('v_83_herbs_mature'), b84 = T('v_84_herbs_bloom');
  // ① 地表找平地(白天草地,光照天然):y=地表上方找 7 连平草
  const surf = Math.floor(g.world.worldSurface ?? 0);
  let flat = null;
  outer:
  for (let y = 40; y < st.h - 40; y++) {
    for (let x = 100; x < st.w - 120; x++) {
      let ok = true;
      for (let k = 0; k < 26; k++) {
        const gi = st.idx(x + k, y), ai = st.idx(x + k, y - 1), ai2 = st.idx(x + k, y - 2), ai3 = st.idx(x + k, y - 3);
        if (!st.flags[gi] || !TILE_DEFS[st.type[gi]]?.solid || st.flags[ai] || st.flags[ai2] || st.flags[ai3]) { ok = false; break; }
      }
      if (ok) { flat = { x, y }; break outer; }
    }
  }
  if (!flat) return { noFlat: true };
  const { x: fx0, y: fy } = flat;
  // ② 7 香草全家福:各自正确基座(2 草/60 丛草/0 泥/23 腐草/53 沙/57 灰/147 冰) + 上方 3 格清空
  const soilSheets = [2, 60, 0, 23, 53, 57, 147];
  const soilKeys = { 2: 'grass', 60: 'v_60_jungle_grass_block', 0: 'dirt', 23: 'v_23_corrupt_grass_block', 53: 'sand', 57: 'ash', 147: 'snow' };
  for (let s = 0; s < 7; s++) {
    const x = fx0 + 2 + s * 3;
    for (let yy = fy - 4; yy < fy; yy++) { const i = st.idx(x, yy); if (st.flags[i]) st.setTile(x, yy, 0); const j = st.idx(x + 1, yy); if (st.flags[j]) st.setTile(x + 1, yy, 0); }
    st.setTile(x, fy, TILE_BY_KEY[soilKeys[soilSheets[s]]] ?? TILE_BY_KEY['dirt'], 0, 0);
    st.setTile(x + 1, fy, TILE_BY_KEY[soilKeys[soilSheets[s]]] ?? TILE_BY_KEY['dirt'], 0, 0);
    // mature + bloom 双株( style=s )
    st.setTile(x, fy - 1, m83, 18 * s, 0);
    st.setTile(x + 1, fy - 1, b84, 18 * s, 0);
  }
  // ③ 火把布景(照明):柱间顶放火把(tile 4, style 0)
  for (let s = 0; s < 8; s++) {
    const x = fx0 + 1 + s * 3;
    const ti = st.idx(x, fy - 3);
    if (!st.flags[ti]) st.setTile(x, fy - 3, TILE_BY_KEY['v_4_torches'] ?? TILE_BY_KEY['torch'] ?? 0, 0, 0);
  }
  // ④ 火焰花专区:芽(82)+mature+bloom 各一(灰烬基座,干燥) — 全家福第 6 列已有,补三态行
  // ⑤ 掉落物:材料 318 + 种子 312 各一,撒在全家福上方光照域
  if (g.spawnDrop) {
    g.spawnDrop((fx0 + 6) * 16, (fy - 3) * 16, VANILLA_ITEM_KEY_BY_ID[318], 1);
    g.spawnDrop((fx0 + 9) * 16, (fy - 3) * 16, VANILLA_ITEM_KEY_BY_ID[312], 1);
  }
  // ⑥ 背包:材料 999 + 全 7 材料 + 全 7 种子 各 1
  for (const vid of [318, 312, 313, 314, 315, 316, 317, 307, 308, 309, 310, 311]) {
    const k = VANILLA_ITEM_KEY_BY_ID[vid];
    if (k && ITEM_BY_KEY[k] !== undefined) p.inv.add(ITEM_BY_KEY[k], vid === 318 ? 999 : 1);
  }
  // ⑦ 玩家站景前
  p.x = (fx0 + 10) * 16 - 8; p.y = (fy - 1) * 16 - p.h - 2; p.vx = 0; p.vy = 0;
  void s82; void b84;
  window.__iii220v = { fx0, fy };
  return { flat, surf, readback: soilSheets.map((ss, s) => {
    const i1 = st.idx(fx0 + 2 + s * 3, fy - 1), i2 = st.idx(fx0 + 3 + s * 3, fy - 1);
    return { s, soil: ss, m: sheetOf(st.type[i1]), b: sheetOf(st.type[i2]), mfx: st.frameX[i1], bfx: st.frameX[i2] };
  }) };
});
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${OUT}/shot-family.png` }).catch(() => {});
// 放大裁剪全家福带
const clip = await page.evaluate(() => {
  const g = window.__swGame, cam = g.camera, cv = g.renderer.canvas;
  const { fx0, fy } = window.__iii220v;
  const s = (wx, wy) => [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const [x0, y0] = s(fx0 * 16, (fy - 5) * 16);
  const [x1, y1] = s((fx0 + 24) * 16, (fy + 1) * 16);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
});
if (clip && clip.width > 10 && clip.x >= 0) await page.screenshot({ path: `${OUT}/shot-family-clip.png`, clip }).catch(() => {});
// 背包热键栏特写
await page.keyboard.press('Escape').catch(() => {});
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: `${OUT}/shot-inv2.png` }).catch(() => {});
writeFileSync(`${OUT}/visual-report.json`, JSON.stringify(rep, null, 2));
console.log('SUMMARY', JSON.stringify(rep, null, 1), 'errs:', errs.slice(0, 4));
await browser.close();
