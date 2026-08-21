// 光晕方片复现:seed 12345 小世界 → 黄昏 → 连续抓帧,检测大面积半透明白矩形
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5311') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
const r = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!(window.__swGame?.player && window.__swGame.world)) {
    if (Date.now() - t0 > 180000) return { fatal: 'timeout' };
    await new Promise((res) => setTimeout(res, 300));
  }
  const g = window.__swGame;
  // 等资源 warm 完成(或超时继续——贴图可能懒载)
  for (let i = 0; i < 60; i++) {
    const st = window.__swAssetCache?.state?.();
    if (!st || (st.done >= st.total && !st.warming)) break;
    await new Promise((res) => setTimeout(res, 1000));
  }
  // 时间快进到黄昏(timeOfDay≈0.7 报告值)
  g.world.clock.timeOfDay = 0.698;
  // 传送到报告玩家位置
  const st2 = g.world.store;
  const tx = 2254, ty = 235;
  g.player.x = tx * 16; g.player.y = ty * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  await new Promise((res) => setTimeout(res, 1500));
  // 连续 600 帧检测:抓主画布,找半透明白矩形(行内长平台亮度高于两侧 25+)
  const cv = g.renderer.canvas;
  const ctx = cv.getContext('2d');
  const hits = [];
  for (let f = 0; f < 600; f++) {
    g.frame(performance.now());
    const W = cv.width, H = cv.height;
    const img = ctx.getImageData(0, 0, W, H).data;
    const lum = (x, y) => { const o = (y * W + x) * 4; return (img[o] + img[o + 1] + img[o + 2]) / 3; };
    // 扫描行:找长平台(>200px 内亮度方差极小且与左右邻差 >20)
    for (let y = 100; y < H - 100; y += 40) {
      for (let x = 100; x < W - 400; x += 40) {
        const a = lum(x, y), b = lum(x + 200, y), c = lum(x + 260, y);
        const mid = (lum(x + 80, y) + lum(x + 120, y) + lum(x + 160, y)) / 3;
        if (Math.abs(mid - a) > 22 && Math.abs(mid - b) < 6 && Math.abs(b - c) > 22 && mid > 60) {
          hits.push({ f, y, x });
          break;
        }
      }
      if (hits.length > 3) break;
    }
    if (hits.length > 3) break;
  }
  // 命中即截图 + dump 绘制层清单(哪个子系统在画白块)
  if (hits.length) {
    const shot = document.createElement('canvas');
    shot.width = cv.width; shot.height = cv.height;
    shot.getContext('2d').drawImage(cv, 0, 0);
    window.__haloShot = shot.toDataURL('image/png');
  }
  const dump = {
    hits: hits.slice(0, 4),
    time: g.world.clock.timeOfDay,
    entities: {
      enemies: g.entities.enemies.filter((e) => !e.dead).map((e) => ({ vid: e.vanillaId, x: Math.round(e.x), y: Math.round(e.y) })),
      projectiles: g.entities.projectiles.filter((p) => !p.dead).map((p) => ({ projId: p.projId ?? (p.constructor?.name), x: Math.round(p.x), y: Math.round(p.y) })),
      npcs: g.entities.npcs.map((n) => ({ key: n.key ?? n.npcKey, x: Math.round(n.x) })),
      critters: g.entities.critters.length,
    },
  };
  return { ...dump, shot: window.__haloShot ?? null };
}, { timeout: 300000 });
console.log(JSON.stringify(r));
await browser.close();
