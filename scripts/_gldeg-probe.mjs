// 复现地图退化块:开图后每 2s 采样,发现 #362CFF 族像素时转储三层数据源
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 200)));
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => { const r = await fetch('/tmp-glpar-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
await p.evaluate(() => {
  const g = window.__swGame;
  const fm = g.renderer.fullMap;
  fm.open = true; fm.zoom = 1.25; fm.zoomTarget = 1.25; fm.panX = 0; fm.panY = 0;
  // 模拟用户操作:F4 全图点亮(迷雾整幅重建风暴)
  g.world.explored.fill(1);
  g.world.exploredDirty = null;
  g.world.exploredVersion++;
});
// 激活脏块链:开图状态下持续改格子(模拟挖掘/探索)
await p.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const cx = Math.floor(g.player.cx / 16), cy = Math.floor(g.player.cy / 16);
  let i = 0;
  window.__mut = setInterval(() => {
    // 在玩家周围撒变化(30 格范围)
    const x = cx + (i % 7) - 3, y = cy + Math.floor(i / 7) - 2;
    if (x > 2 && y > 2 && x < g.world.w - 2 && y < g.world.h - 2) st.setTile(x, y, i % 3 === 0 ? 0 : 2, 0, 0);
    i++;
  }, 100);
});
let found = null;
for (let t = 0; t < 12; t++) {
  await new Promise(r => setTimeout(r, 2000));
  const r = await p.evaluate(() => {
    const g = window.__swGame;
    const c = g.renderer.canvas;
    const ctx = c.getContext('2d');
    // 全屏扫 32×18 网格找蓝紫块(b>200 且 r,g<120)
    const hits = [];
    for (let j = 0; j < 18; j++) for (let i = 0; i < 32; i++) {
      const d = ctx.getImageData(Math.floor((i + 0.5) * c.width / 32), Math.floor((j + 0.5) * c.height / 18), 1, 1).data;
      if (d[2] > 200 && d[0] < 130 && d[1] < 130) hits.push([i, j, d[0], d[1], d[2]]);
    }
    if (!hits.length) return { n: 0 };
    // 命中点映射回地图源坐标(fm 语义:cx0 + worldPx×zoom)
    const fm = g.renderer.fullMap;
    const viewW = c.width, viewH = c.height;
    const mapW = g.world.w * fm.zoom, mapH = g.world.h * fm.zoom;
    const cx0 = viewW / 2 - mapW / 2 + fm.panX, cy0 = viewH / 2 - mapH / 2 + fm.panY;
    const h = hits[0];
    const sx = Math.floor(((h[0] + 0.5) * c.width / 32 - cx0) / fm.zoom);
    const sy = Math.floor(((h[1] + 0.5) * c.height / 18 - cy0) / fm.zoom);
    // 三层源采样:主画布命中点 / 小地图画布同源点 / 迷雾画布
    const mm = g.renderer.minimap;
    const mmd = mm ? mm.ctx.getImageData(sx, sy, 1, 1).data : null;
    const fog = g.renderer['fogCanvas'];
    let fogd = null;
    if (fog && sx >= 0 && sy >= 0) {
      const fsx = Math.floor(sx / 2), fsy = Math.floor(sy / 2);
      if (fsx < fog.width && fsy < fog.height) fogd = [...fog.getContext('2d').getImageData(fsx, fsy, 1, 1).data];
    }
    return {
      n: hits.length, first: h, src: [sx, sy], mmPx: mmd ? [mmd[0], mmd[1], mmd[2], mmd[3]] : null, fogPx: fogd,
      fogVer: g.renderer['fogVersion'], fogRow: g.renderer['fogRebuildRow'], explored: g.world.exploredVersion,
    };
  });
  console.log(`t+${(t + 1) * 2}s:`, JSON.stringify(r));
  if (r.n > 0) { found = r; break; }
}
await p.evaluate(() => clearInterval(window.__mut));
if (found) {
  await p.screenshot({ path: join(HOME, '.claude/jobs/8405c930/tmp/map_degraded.png') });
  console.log('已截图 map_degraded.png');
} else console.log('12s 内未复现退化块');
await b.close(); process.exit(0);
