// 微光发声面实流探针 v3（2026-09-17 普查批验收）：
//   每次运行在全新列段从零搭台（防同档世界的历史编辑残留）：
//     · 干燥站台（row R）→ 竖井微光池（液体 2 行=32px<玩家 42px,头顶格露空 →
//       不挂 buff 353,出水溅花不被 :28081 !shimmering 门拦）
//   断言面：① 入池 Splash_2（Player.cs:28016）② 出池 Splash_3（:28110）
//           ③ 物品入池 Splash_4（WorldItem.cs:921）+ 转化 Item_176（:1697）
//   一次性诊断脚本（_ 前缀），经 tools/run-diag.mjs 运行。
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  const has = await page.evaluate(() => !!document.querySelector('select')).catch(() => false);
  if (has) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  const g = window.__swGame;
  const st = g.world.store;
  const rec = window.__swAudioRec;
  if (!rec) return { error: 'no __swAudioRec' };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const isSolid = (x, y) => st.inBounds(x, y) && st.isSolid(x, y);
  const idx = (x, y) => st.idx(x, y);

  // ---- 全新列段搭台：spawn 东侧 400+ 列（按分钟抖动,避开历次 run 的残留）----
  const bx0 = g.world.spawnX + 400 + (Math.floor(Date.now() / 60000) % 300);
  const R = Math.max(60, Math.floor(g.world.groundLevel) + 30);
  // 台面 row R：站台列实心,池口列（bx0..bx0+7）留空
  for (let x = bx0 - 10; x <= bx0 + 10; x++) {
    st.setTile(x, R, x >= bx0 && x <= bx0 + 7 ? 0 : 1);
    st.setLiquid(x, R, 0, 0);
  }
  // 竖井 R+1..R+4：外墙实心,池内 bx0..bx0+7 空气,池底 R+4 实心
  for (let x = bx0 - 1; x <= bx0 + 8; x++) {
    for (let y = R + 1; y <= R + 4; y++) st.setTile(x, y, 1);
    st.setLiquid(x, R + 1, 0, 0); st.setLiquid(x, R + 4, 0, 0);
  }
  for (let x = bx0; x <= bx0 + 7; x++) {
    st.setTile(x, R + 1, 0); st.setTile(x, R + 2, 0); st.setTile(x, R + 3, 0);
    st.setLiquid(x, R + 1, 0, 0); st.setLiquid(x, R + 2, 255, 4); st.setLiquid(x, R + 3, 255, 4);
  }
  // 玩家锚定干燥站台（row R 面 = R*16）
  const dryStand = { x: (bx0 - 8) * 16, y: R * 16 - 44 };
  g.player.x = dryStand.x; g.player.y = dryStand.y;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  let anchorTicks = 0;
  for (let i = 0; i < 40 && (g.player.wetSticky || g.player.splashShimmerWet || g.player.wetCount > 0); i++) { anchorTicks++; await wait(120); }
  await wait(400);
  const anchored = { wet: g.player.wetSticky, sw: g.player.splashShimmerWet, wc: g.player.wetCount, anchorTicks };
  const liquidOK = [0, 1, 2, 3].every((i) => st.liquid[idx(bx0 + i, R + 2)] === 255 && st.liquidType[idx(bx0 + i, R + 2)] === 4);

  const snapshot = () => (rec.tail(200, 0).sfx ?? [])
    .filter((e) => e.k === 'wav')
    .map((e) => ({ f: e.d?.f, x: e.d?.x, y: e.d?.y, o: e.d?.o }));
  const before = snapshot();

  // ---- ① 玩家入池：掉入竖井 → Splash_2（Player.cs:28016 shimmerWet 支 style 2）----
  g.player.x = (bx0 + 4) * 16; g.player.y = R * 16 - 46;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  await wait(2400);
  const afterIn = snapshot().slice(before.length);
  const inSplash2 = afterIn.filter((e) => e.f === 'Splash_2');

  // ---- ② 玩家出池：传回站台 → Splash_3（Player.cs:28110 shimmerWet 支 style 3）----
  g.player.x = dryStand.x; g.player.y = dryStand.y;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  await wait(2200);
  const afterOut = snapshot().slice(before.length + afterIn.length);
  const outSplash3 = afterOut.filter((e) => e.f === 'Splash_3');

  // ---- ③ 物品入池 → Splash_4（WorldItem.cs:921）+ 转化 Item_176（:1697 → ShimmerEffect）----
  let itemFace = { splash4: 0, item176: 0 };
  try {
    const items = await import('/src/data/items.ts');
    const torchKey = items.VANILLA_ITEM_KEY_BY_ID[8];
    g.player.x = g.world.spawnX * 16 + 8; g.player.y = (Math.floor(g.world.groundLevel) - 4) * 16;
    g.camera.x = g.player.x; g.camera.y = g.player.y;
    await wait(400);
    const d = g.spawnDrop ? g.spawnDrop((bx0 + 4) * 16, (R + 1) * 16 - 8, torchKey, 1) : null;
    if (d) {
      await wait(5200);
      const seg = snapshot().slice(before.length + afterIn.length + afterOut.length);
      itemFace.splash4 = seg.filter((e) => e.f === 'Splash_4').length;
      itemFace.item176 = seg.filter((e) => e.f === 'Item_176').length;
    } else itemFace = { skipped: 'no g.spawnDrop' };
  } catch (e) { itemFace = { skipped: String(e) }; }

  return {
    basin: { bx0, R }, anchored, liquidOK,
    counts: { before: before.length, afterIn: afterIn.length, afterOut: afterOut.length },
    playerIn_Splash2: inSplash2.length,
    playerOut_Splash3: outSplash3.length,
    itemFace,
    segIn: afterIn.map((e) => e.f),
    segOut: afterOut.map((e) => e.f),
  };
});

console.log(JSON.stringify(out, null, 1));
await browser.close();
