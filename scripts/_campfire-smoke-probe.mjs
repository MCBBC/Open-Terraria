// 篝火烟柱偏移探针（2026-08-31 用户报"烟柱不对应火苗/过宽→修复后偏移更严重"）。
// 实测三件事：①活格子帧布局 ②emitTileParticles 产出的粒子世界坐标相对火堆左缘
// 的分布 ③世界→屏幕映射 + 截图（复现用户视角）。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 900, height: 640 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 1200));
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const campfire = tiles.TILE_DEFS.find((d) => d.vanilla?.sheet === 215);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const X = g.world.spawnX + 20;
  const Y = Math.floor(g.world.groundLevel);
  // 清空 7×6 工作区并铺地面
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -5; dy <= -1; dy++) if (st.get(X + dx, Y + dy) !== 0) st.setTile(X + dx, Y + dy, 0, 0, 0);
    st.setTile(X + dx, Y, tiles.TILE_BY_KEY['grass'], 0, 0);
  }
  // 放 3×2 篝火（原版存储：顶行 fy=0 fx=0/18/36，底行 fy=18）
  for (let k = 0; k < 3; k++) {
    st.setTile(X + k, Y - 2, campfire.id, k * 18, 0);
    st.setTile(X + k, Y - 1, campfire.id, k * 18, 18);
  }
  // 相机/玩家挪过去，等烘焙
  g.player.x = X * 16; g.player.y = (Y - 4) * 16;
  await sleep(800);

  // ① 活格子帧布局
  const cells = [];
  for (let k = 0; k < 3; k++) for (let dy = 0; dy < 2; dy++) {
    const cx = X + k, cy = Y - 2 + dy, i = st.idx(cx, cy);
    cells.push({ cx, cy, type: st.type[i], fx: st.frameX[i], fy: st.frameY[i] });
  }

  // ② 连发采样：直接调私有发射器（TS private 仅编译期），每次前清空粒子
  const samples = [];
  const r215 = (await import('/src/render/TileParticles.ts')).TILE_PARTICLE_RULES.get(215);
  for (let it = 0; it < 400; it++) {
    g.particles.length = 0;
    g.tickCount = it * 3;            // 过 %3 门
    g.emitTileParticles();
    for (const p of g.particles) {
      if (Math.abs(p.y - (Y - 2) * 16) < 24) samples.push({ ox: +(p.x - X * 16).toFixed(2), oy: +(p.y - (Y - 2) * 16).toFixed(2) });
    }
  }
  const oxs = samples.map((s) => s.ox).sort((a, b) => a - b);
  const hist = {};
  for (const v of oxs) { const b = Math.floor(v / 4) * 4; hist[b] = (hist[b] ?? 0) + 1; }

  // ③ 屏幕映射：火堆格矩形 vs 一次真实发射的粒子屏幕坐标
  g.particles.length = 0; g.tickCount = 999 * 3; g.emitTileParticles();
  const cam = g.camera;
  const w2s = (wx, wy) => { const s = cam.worldToScreen(wx, wy); return [Math.round(s[0]), Math.round(s[1])]; };
  const fireRect = w2s(X * 16, (Y - 2) * 16).concat(w2s((X + 3) * 16, Y * 16));
  const partsScreen = g.particles.slice(0, 12).map((p) => ({ s: w2s(p.x, p.y), ox: +(p.x - X * 16).toFixed(1) }));

  return {
    campfireDef: { id: campfire.id, key: campfire.key, fw: campfire.fw, fh: campfire.fh, sheet: campfire.vanilla.sheet },
    cells, rules215: r215.map((r) => ({ fx0: r.fx0, fy0: r.fy0, prob: r.prob, dxBox: r.dxBox, dyBox: r.dyBox })),
    sampleCount: samples.length, hist,
    oxMin: oxs[0], oxMax: oxs[oxs.length - 1], oxMean: +(oxs.reduce((a, b) => a + b, 0) / oxs.length).toFixed(2),
    fireRectScreen: fireRect, partsScreen,
    zoom: cam.zoom, wind: (await import('/src/render/VanillaTiler.ts')).renderEnv.wind,
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/campfire-probe.png' });
await browser.close();
