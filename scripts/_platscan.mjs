// 扫真实世界:全部 platform 类 tile 的 frameY 分布 + isPlatform 比例
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }  });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 100)));
await page.goto('http://localhost:5206/?play=small', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const g = window.__swGame, st = g.world.store;
  const platIds = new Set();
  TILE_DEFS.forEach((d, i) => { if (d?.platform) platIds.add(i); });
  const dist = {};        // key: `${key}|fy${frameY}` → count
  const standable = {};   // key → count(isPlatform true)
  const samples = [];     // 前 20 个不可站样本
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = y * st.w + x;
      if (!st.flags[i] || !platIds.has(st.type[i])) continue;
      const key = TILE_DEFS[st.type[i]]?.key ?? '?';
      const fy = st.frameY[i];
      const fx = st.frameX[i];
      const k = `${key}|fy${fy}`;
      dist[k] = (dist[k] ?? 0) + 1;
      const ok = st.isPlatform(x, y);
      if (ok) standable[key] = (standable[key] ?? 0) + 1;
      else if (samples.length < 24) samples.push({ x, y, key, fx, fy, wire: st.wire[i] });
    }
  }
  return { totalPlatformTiles: Object.values(dist).reduce((a, b) => a + b, 0), dist, standable, samples };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
