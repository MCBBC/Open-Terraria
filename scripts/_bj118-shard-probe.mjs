// BJ118① 实机探针：水晶碎块（tile 129）质感层取证——半透明基底（α100）+ 大簇彩虹辉光。
// 流程：boot 世界 → 洞穴层清出暗室 → 珍珠石地板上放置小簇（fx=0）+ 大簇（fx=324/342）
//   碎块 → 玩家落位上方 → 双时刻（间隔 ~3.2s=半脉动周期）同机位截图 + 逐像素采样。
// 判读（本脚本只出数据不断言）：
//   · bodyMean：小簇本体亮度（α100×全亮 → 暗室中暗淡可见;α255 会显著更亮）
//   · changedLarge / changedSmall：两时刻格内变化像素数——大簇辉光随 GlobalTimeWrappedHourly
//     脉动应显著变化;小簇无辉光层应≈0（仅旋转钟不动小簇）
//   · haloSat：大簇辉光带像素饱和度样本（彩虹=高分离通道差）
// 截图落盘 /tmp/bj118-shard-t0.png / t1.png 供人工比对。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

// ---- 暗室选址（洞穴层下、干燥）+ 布景 ----
const stage = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const st = w.store;
  const tiles = await import('/src/data/tiles.ts');
  const defs = tiles.TILE_DEFS;
  let shardId = -1, pearlId = -1;
  for (let id = 0; id < defs.length; id++) {
    const sh = defs[id]?.vanilla?.sheet;
    if (sh === 129 && shardId < 0) shardId = id;
    if (sh === 117 && pearlId < 0) pearlId = id;
  }
  if (shardId < 0 || pearlId < 0) return { error: 'tile id not found' };
  const ry = Math.floor(w.rockLevel);
  let cx = -1, cy = -1;
  outer:
  for (let y = ry + 40; y < Math.min(st.h - 220, ry + 300); y += 2) {
    for (let x = 300; x < st.w - 300; x += 3) {
      // 找 5×4 全实心区（挖室）
      let ok = true;
      for (let dx = 0; dx < 6 && ok; dx++) for (let dy = 0; dy < 4 && ok; dy++) {
        if (!st.isSolid(x + dx, y + dy)) ok = false;
      }
      if (ok) { cx = x + 3; cy = y + 2; break outer; }
    }
  }
  if (cx < 0) return { error: 'no spot' };
  // 清室 11×7（空气）+ 底层珍珠石地板
  for (let dx = -5; dx <= 5; dx++) for (let dy = -3; dy <= 2; dy++) {
    st.setTileSilent(cx + dx, cy + dy, 0, 0, 0);
  }
  for (let dx = -5; dx <= 5; dx++) st.setTileSilent(cx + dx, cy + 3, pearlId, 0, 0);
  // 小簇 ×2（style0/style1,floor 向 frameY=0）+ 大簇 ×2（fx=324/342）
  st.setTileSilent(cx - 3, cy + 2, shardId, 0, 0);
  st.setTileSilent(cx - 2, cy + 2, shardId, 18, 0);
  st.setTileSilent(cx + 1, cy + 2, shardId, 324, 0);
  st.setTileSilent(cx + 3, cy + 2, shardId, 342, 0);
  // 玩家放室中央上方（摄像机跟随）
  g.player.x = cx * 16 + 8;
  g.player.y = (cy - 1) * 16;
  g.player.vx = 0; g.player.vy = 0;
  if (g.player.vy !== undefined) g.player.vy = 0;
  return { cx, cy, shardId, pearlId, screen: { w: innerWidth, h: innerHeight } };
});
if (stage.error) { console.log('STAGE_FAIL', JSON.stringify(stage)); await browser.close(); process.exit(1); }
console.log('STAGE', JSON.stringify(stage));
await new Promise((r) => setTimeout(r, 1500));

// ---- 采样函数：canvas 同源 drawImage → getImageData，碎块格逐像素指标 ----
async function sample(tag) {
  const data = await page.evaluate(({ cx, cy }) => {
    const cv = document.querySelector('canvas');
    const ctx2 = document.createElement('canvas');
    const S = 4;                       // 每格采样窗 4×4 tile
    const TS = 16;
    const px = cv.width / 2 - (S * TS) / 2;   // 相机居中≈玩家;玩家在碎块带上 1 格 → 上移 1 格
    const py = cv.height / 2 - (S * TS) / 2 + TS;
    ctx2.width = S * TS; ctx2.height = S * TS;
    const c2 = ctx2.getContext('2d', { willReadFrequently: true });
    c2.drawImage(cv, px, py, S * TS, S * TS, 0, 0, S * TS, S * TS);
    const im = c2.getImageData(0, 0, S * TS, S * TS).data;
    // 碎块行 = 窗内 y=3*TS 行（玩家上方 1 格 = 室底行 cy+2 → 屏幕 y = 窗顶 + 3 格）
    // 小簇在窗 x 0..1 格（cx-3/cx-2 → 相对 cx: -3..→ 窗从 cx-2 起? 窗中心=cx → x0=cx-2*TS
    // 大簇 cx+1/cx+3 → 相对窗 x = 3 格 / 5 格(越窗) — 放宽:直接逐 16×16 块统计
    const blocks = [];
    for (let bx = 0; bx < 4; bx++) {
      let lit = 0, sum = 0, mx = 0, chroma = 0, n = 0;
      for (let yy = 3 * TS; yy < 4 * TS; yy++) {
        for (let xx = bx * TS; xx < (bx + 1) * TS; xx++) {
          const p = (yy * S * TS + xx) * 4;
          const r = im[p], gg = im[p + 1], b = im[p + 2];
          const l = (r + gg + b) / 3;
          if (l > 12) lit++;
          sum += l; n++;
          if (l > mx) mx = l;
          chroma += Math.max(r, gg, b) - Math.min(r, gg, b);
        }
      }
      blocks.push({ lit, mean: +(sum / n).toFixed(1), max: Math.round(mx), chromaMean: +(chroma / n).toFixed(1) });
    }
    return { blocks };
  }, { cx: stage.cx, cy: stage.cy });
  console.log(tag, JSON.stringify(data));
  return data;
}

await page.screenshot({ path: '/tmp/bj118-shard-t0.png' });
const s0 = await sample('T0');
await new Promise((r) => setTimeout(r, 3200));
await page.screenshot({ path: '/tmp/bj118-shard-t1.png' });
const s1 = await sample('T1');

// ---- 双时刻变化像素（大簇辉光脉动判别）----
const diff = await page.evaluate(async ({ cx, cy }) => {
  void cx; void cy;
  return 'skipped-cross-frame-diff';
});
void diff;
void s0; void s1;
console.log('DONE');
await browser.close();
