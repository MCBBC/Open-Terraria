// BJ118① 实机探针：水晶碎块（tile 129）质感层取证——半透明基底（α100）+ 大簇彩虹辉光。
// 流程：boot 世界 → 洞穴层清出暗室 → 珍珠石地板放小簇(fx=0/18) + 大簇(fx=324/342)碎块
//   → 玩家落位上方 → 双时刻（间隔 3.2s ≈ 半脉动周期）同机位像素采样 + 截图落盘。
// 判读（只出数据不断言）：
//   · mean/max：各碎块格亮度（α100×全亮 → 暗室中暗淡可见;若回退不透明会显著变亮）
//   · changed：双时刻格内变化像素数——大簇辉光随 GlobalTimeWrappedHourly 脉动应 >0;
//     小簇（无辉光层、横移钟不动小簇）应 ≈0
//   · chromaMean：通道分离度（彩虹辉光=高色度;灰背景≈0）
// 截图 /tmp/bj118-shard-t0.png / t1.png 供人工比对。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

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
for (let i = 0; i < 40; i++) {                       // 欢迎弹窗轮询点掉（延迟弹出;真鼠标事件）
  const box = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /我已知晓/.test(x.textContent ?? ''));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }).catch(() => null);
  if (!box) { await new Promise((r) => setTimeout(r, 500)); continue; }
  await page.mouse.click(box.x, box.y);
  await new Promise((r) => setTimeout(r, 400));
  const still = await page.evaluate(() => !!document.getElementById('sw-welcome-announce'));
  if (!still) break;
}
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
      let ok = true;
      for (let dx = 0; dx < 6 && ok; dx++) for (let dy = 0; dy < 4 && ok; dy++) {
        if (!st.isSolid(x + dx, y + dy)) ok = false;
      }
      if (ok) { cx = x + 3; cy = y + 2; break outer; }
    }
  }
  if (cx < 0) return { error: 'no spot' };
  for (let dx = -5; dx <= 5; dx++) for (let dy = -3; dy <= 2; dy++) {
    st.setTileSilent(cx + dx, cy + dy, 0, 0, 0);
  }
  for (let dx = -5; dx <= 5; dx++) st.setTileSilent(cx + dx, cy + 3, pearlId, 0, 0);
  st.setTileSilent(cx - 3, cy + 2, shardId, 0, 0);     // 小簇 style0（地板向）
  st.setTileSilent(cx - 2, cy + 2, shardId, 18, 0);    // 小簇 style1
  st.setTileSilent(cx + 1, cy + 2, shardId, 324, 0);   // 大簇（六格横带 n=0）
  st.setTileSilent(cx + 3, cy + 2, shardId, 342, 0);   // 大簇 n=1
  g.player.x = (cx - 0.5) * 16 + 8;                  // 立于地板（两组碎块之间,不遮格）
  g.player.y = (cy + 3) * 16;                        // 脚底 = 地板顶
  g.player.vx = 0; g.player.vy = 0;
  return { cx, cy, shardId, pearlId };
});
if (stage.error) { console.log('STAGE_FAIL', JSON.stringify(stage)); await browser.close(); process.exit(1); }
console.log('STAGE', JSON.stringify(stage));
await new Promise((r) => setTimeout(r, 4000));      // 相机传送缓动+物理落定
await sample('WARMUP');                             // 预热拍（相机可能仍在缓动,不计入判读）

// ---- 采样：worldToScreen 定窗 → page.screenshot clip（GL 画布 drawImage 读回=黑,
//      必须走合成后截图）→ data URL 回灌页内 2D canvas 逐像素 ----
const TS = 16;
const WINTILE = 8, HINTILE = 3;
async function snapshotRect() {
  return page.evaluate(({ cx, cy }) => {
    const g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen((cx - 4) * 16, (cy + 1) * 16);
    const z = g.camera.zoom;
    return { x: sx, y: sy, width: 8 * 16 * z, height: 3 * 16 * z };
  }, { cx: stage.cx, cy: stage.cy });
}

async function sample(tag) {
  const rect = await snapshotRect();
  const b64 = await page.screenshot({ clip: rect, encoding: 'base64' });
  fs.writeFileSync(`/tmp/bj118-shard-window-${tag}.png`, Buffer.from(b64, 'base64'));
  const data = await page.evaluate(async ({ b64, tag }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const W = img.width, H = img.height;
    const c2 = document.createElement('canvas');
    c2.width = W; c2.height = H;
    const cx2 = c2.getContext('2d', { willReadFrequently: true });
    cx2.drawImage(img, 0, 0);
    const im = cx2.getImageData(0, 0, W, H).data;
    const tileW = W / 8, tileH = H / 3;
    const prev = window.__bj118prev;               // 跨时刻共享（T1 与 T0 比）
    const out = [];
    for (const col of [1, 2, 5, 7]) {              // 小簇×2（窗列 1/2）/ 大簇×2（5/7）
      let lit = 0, sum = 0, n = 0, chroma = 0, changed = 0;
      for (let yy = Math.floor(1 * tileH); yy < Math.floor(2 * tileH); yy++) {
        for (let xx = Math.floor(col * tileW); xx < Math.floor((col + 1) * tileW); xx++) {
          const p = (yy * W + xx) * 4;
          const r = im[p], gg = im[p + 1], b = im[p + 2];
          const l = (r + gg + b) / 3;
          if (l > 12) lit++;
          sum += l; n++;
          chroma += Math.max(r, gg, b) - Math.min(r, gg, b);
          if (prev) {
            if (Math.abs(r - prev[p]) + Math.abs(gg - prev[p + 1]) + Math.abs(b - prev[p + 2]) > 18) changed++;
          }
        }
      }
      out.push({ col, lit, mean: +(sum / n).toFixed(1), chromaMean: +(chroma / n).toFixed(1), changed });
    }
    window.__bj118prev = im;
    return { blocks: out, W, H };
  }, { b64, tag });
  console.log(tag, JSON.stringify(data));
  return data;
}

const s0 = await sample('T0');
await page.screenshot({ path: '/tmp/bj118-shard-t0.png' });
await new Promise((r) => setTimeout(r, 3200));
const s1 = await sample('T1');
await page.screenshot({ path: '/tmp/bj118-shard-t1.png' });
void s0; void s1;
console.log('DONE');
await browser.close();
