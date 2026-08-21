// 极光顶点数据量测：直接读 computeBand 输出的 sTopY/sBotY/sBotX → 
// 对比公式预期（带高度/弯曲度/跨度），定位几何偏差
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 220000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const { AuroraSky } = await import('/src/render/AuroraSky.ts');
  const aur = new AuroraSky();
  aur.setActive(true);
  // 满月模式，月位同原版 image7 (0.25, 0.05)
  const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1080;
  const ctx = cv.getContext('2d');
  const gt = 500;  // 固定 globalTime
  for (let f = 0; f < 120; f++) {
    aur.draw(ctx, 1920, 1080, {
      nightTicks: 9000, isDay: false, moonPhase: 0,
      camTopTiles: -5, surfaceTiles: 20,
      moonFrac: { x: 0.25, y: 0.05 }, dtSec: 1 / 60, globalTime: gt + f,
    });
    if (f % 30 === 29) await new Promise(r => setTimeout(r, 30));
  }
  // 读顶点数据（通过渲染一帧后从内部数组取）
  // sBotX/sBotY/sTopX/sTopY 是 private —— 通过遍历带内像素反推
  // 简化：直接量测渲染结果的带高度
  const d = ctx.getImageData(0, 0, 1920, 1080).data;
  // 扫描每列的极光像素 Y 范围（亮度 > 阈值）
  const columns = [];
  for (let x = 100; x < 1900; x += 100) {
    let yMin = -1, yMax = -1;
    for (let y = 0; y < 1080; y++) {
      const i = (y * 1920 + x) * 4;
      const brightness = d[i] + d[i+1] + d[i+2];
      if (brightness > 60) { if (yMin < 0) yMin = y; yMax = y; }
    }
    columns.push({ x, yMin, yMax, height: yMax - yMin });
  }
  // 总体统计
  const heights = columns.filter(c => c.height > 0).map(c => c.height);
  const yMins = columns.filter(c => c.yMin >= 0).map(c => c.yMin);
  return {
    columns: columns.filter((_, i) => i % 2 === 0),
    avgHeight: heights.length ? Math.round(heights.reduce((a,b)=>a+b,0)/heights.length) : 0,
    maxHeight: heights.length ? Math.max(...heights) : 0,
    yMinRange: yMins.length ? [Math.min(...yMins), Math.max(...yMins)] : [0,0],
    expected: '原版: 带高 100-250px, yMin 100-400 (1080p), S弯 yMin 随 x 变化 >100px',
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
