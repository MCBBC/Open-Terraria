import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 140)));
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 3000));
// 实测:willReadFrequently 画布 vs 普通画布的行为差异
const r = await p.evaluate(() => {
  // 1) Chrome 是否遵守 willReadFrequently?(读回速度对比)
  const test = (wrf) => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = wrf ? c.getContext('2d', { willReadFrequently: true }) : c.getContext('2d');
    ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, 256, 256);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) ctx.getImageData(0, 0, 1, 1);
    return performance.now() - t0;
  };
  const normal = test(false);
  const wrf = test(true);
  // 2) 检查 context 属性是否保留
  const c2 = document.createElement('canvas');
  const ctx2 = c2.getContext('2d', { willReadFrequently: true });
  const attrs = c2.getContext('2d');  // 二次调用返回同一 context
  // 3) 当前 renderer 的主画布实际状态
  const g = window.__swGame;
  const mainCtx = g?.renderer?.ctx;
  const mainWrf = mainCtx ? mainCtx.canvas.getAttribute('data-wrf') : 'unknown';
  const cpuMode = g?.renderer ? g.renderer.isCpuRender() : 'no game';
  return {
    readbackNormal: `${normal.toFixed(2)}ms`,
    readbackWrf: `${wrf.toFixed(2)}ms`,
    speedup: `${(normal / wrf).toFixed(1)}x`,
    cpuMode,
    glfxNull: g?.renderer?.glfx === null,
    chunkCpuRender: (await0 = g) ? 'skip' : 'skip',
  };
});
console.log('willReadFrequently 实测:', JSON.stringify(r));
await b.close(); process.exit(0);
