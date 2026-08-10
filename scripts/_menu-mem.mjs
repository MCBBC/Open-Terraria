// 主菜单内存占用归因:atlas 三个图集 Map 的解码像素量 + top 榜 + DOM canvas
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
// 等 atlas 就绪(main 里 __swTiles 在进游戏才挂,这里轮询 performance 资源或直接等秒)
await new Promise(r => setTimeout(r, 12000));
const out = await page.evaluate(() => {
  const stats = (name, map) => {
    if (!map) return { name, missing: true };
    let count = 0, px = 0;
    const top = [];
    for (const [k, img] of map) {
      const el = img;
      const w = el.naturalWidth || el.width || 0, h = el.naturalHeight || el.height || 0;
      count++;
      px += w * h;
      if (el instanceof HTMLCanvasElement || w * h > 400000) top.push({ k, w, h, canvas: el instanceof HTMLCanvasElement, mb: +((w * h * 4) / 1048576).toFixed(1) });
    }
    top.sort((a, b) => b.w * b.h - a.w * a.h);
    return { name, count, decodedMB: +((px * 4) / 1048576).toFixed(0), top: top.slice(0, 12) };
  };
  // 找到全局 atlas(挂在 flow 闭包里,尝试通过游戏实例或模块重导入拿不到——
  // 但 VUI/UI 的纹理对象可达?直接从 performance 看已请求资源量)
  const res = performance.getEntriesByType('resource');
  const imgs = res.filter(r => r.name.includes('sprites/'));
  const bytes = imgs.reduce((s, r) => s + (r.transferSize || 0), 0);
  const canvases = [...document.querySelectorAll('canvas')].map(c => ({ w: c.width, h: c.height, mb: +((c.width * c.height * 4) / 1048576).toFixed(1) }));
  return {
    resourceCount: imgs.length,
    resourceMB: +(bytes / 1048576).toFixed(0),
    canvases,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : null,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
