import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 120000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/tree-inspect.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 1200));
const res = await page.evaluate(async () => {
  const { TileStore } = await import('/src/world/TileStore.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const { drawTreeCell } = await import('/src/render/VanillaTiler.ts');
  const { renderEnv } = await import('/src/render/VanillaTiler.ts');
  const st = new TileStore(26, 44);
  const GRASS = TILE_BY_KEY['grass'];
  for (let x = 0; x < 26; x++) { st.setTile(x, 38, GRASS); for (let y = 39; y < 44; y++) st.setTile(x, y, TILE_BY_KEY['dirt']); }
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 48;
  const ctx = cv.getContext('2d');
  const atlas = window.__treeInspect ? null : null;
  // 直接取解剖台的 atlas（S 未导出——经 renderer？工具页无 renderer。改由 ensureVImage：
  // 用 SpriteAtlas）
  const { SpriteAtlas } = await import('/src/assets/SpriteAtlas.ts');
  const at = new SpriteAtlas();
  await new Promise(r => setTimeout(r, 600));   // 贴图懒加载窗口
  renderEnv.zoom = 1;
  // 干件 (0,0) 画在 (10,10)
  drawTreeCell(ctx, at, st, 13, 31, 0, 0, 10, 10, 5, false);
  await new Promise(r => setTimeout(r, 300));
  drawTreeCell(ctx, at, st, 13, 31, 0, 0, 10, 10, 5, false);
  const d = ctx.getImageData(8, 8, 24, 24).data;
  let op = 0, n = 0;
  for (let j = 3; j < d.length; j += 4) { n++; if (d[j] > 60) op++; }
  return { opRatio: +(op / n).toFixed(2), n };
});
console.log('干件 (0,0) 直绘覆盖率:', res.opRatio, '(预期 ≈0.7——20×20 件画在 24×24 采样窗)');
await browser.close();
