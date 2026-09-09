// SW-BJ41 以太(Aether/ZoneShimmer)实机探针：
// 合成地下微光湖(≥300 微光液格在 169×124 判定窗内) → 实测
//   ① scene.zoneShimmer / shimmerTileCount / undergroundForShimmering（判定链）
//   ② renderer.monoFilters.shimmerAlpha（表现驱动位,SceneState.UpdateShimmer）
//   ③ 表现面落点：星空/black overlay 消费端存在性
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj41-aether-probe.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ41');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.keyboard.type('1');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const worldSurface = g.world.groundLevel;
  const h = st.h;
  // 深度带：worldSurface+84 < tileY < maxTilesY-396（SceneMetrics.cs:711）
  const bandTop = Math.ceil(worldSurface + 84) + 10;
  const bandBottom = h - 396 - 10;
  if (bandBottom <= bandTop + 40) return { fail: `depth band too small: ${bandTop}..${bandBottom}` };
  const cy = Math.floor((bandTop + Math.min(bandBottom, bandTop + 120)) / 2);
  // 找空旷列（玩家落点）：用地表 x（玩家当前 x）
  const px = Math.floor(g.player.cx / 16);
  // 合成洞穴腔体：32 宽 × 20 高，清 tile + 清 wall?（wall 无关判定）→ 底部铺微光液
  // 微光液 20 宽 × 16 深 = 320 格 ≥ 300（窗口 169×124 内）
  const W = 32, AIRH = 8, LIQH = 16;
  const x0 = px - W / 2, x1 = px + W / 2;
  const floorY = cy + AIRH / 2;            // 腔底
  for (let x = x0; x <= x1; x++) {
    for (let y = cy - AIRH; y <= cy + LIQH + 2; y++) st.setTile(x, y, 0);
    for (let y = cy; y < cy + LIQH; y++) st.setLiquid(x, y, 255, 4);   // 4 = LIQUID_TYPE.SHIMMER
    // 腔底与四壁封砖防液体流动
    st.setTile(x, cy + LIQH + 1, 1, 0, 0);
    st.setTile(x, cy + LIQH + 2, 1, 0, 0);
  }
  for (let y = cy - AIRH; y <= cy + LIQH; y++) {
    st.setTile(x0 - 1, y, 1, 0, 0);
    st.setTile(x1 + 1, y, 1, 0, 0);
  }
  // 玩家传送到液面上方
  const tx = (px * 16), ty = (cy - 4) * 16;
  g.player.x = tx; g.player.y = ty; g.player.vx = 0; g.player.vy = 0;
  if (g.player.position) { g.player.position.x = tx; g.player.position.y = ty; }
  await new Promise((r) => setTimeout(r, 100));
  // 等 3s：scanScene per tick + shimmerAlpha 0.025/帧 → 40 帧到 1
  await new Promise((r) => setTimeout(r, 3000));
  const mf = g.renderer?.monoFilters;
  const sc = g.scene;
  return {
    ok: true,
    worldSurface, h, cy, px,
    depthBand: { top: bandTop, bottom: bandBottom },
    scene: sc ? {
      tileY: sc.tileY,
      shimmerTileCount: sc.shimmerTileCount,
      undergroundForShimmering: sc.undergroundForShimmering,
      zoneShimmer: sc.zoneShimmer,
      zoneDungeon: sc.zoneDungeon,
    } : null,
    mono: mf ? {
      shimmerAlpha: mf.shimmerAlpha,
      shimmerDarken: mf.shimmerDarken,
      delay: mf.shimmerBrightenDelay,
    } : null,
    liquidProbe: (() => {
      let n = 0;
      for (let x = x0; x <= x1; x++) for (let y = cy; y < cy + LIQH; y++) {
        const i = st.idx(x, y);
        if (st.liquid[i] > 0 && st.liquidType[i] === 4 && !st.flags[i]) n++;
      }
      return n;
    })(),
  };
});
console.log(JSON.stringify(out, null, 1));
// 截图取证（背景表现）
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/bj41-aether-after.png' });
await browser.close();
