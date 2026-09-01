import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));
const res = await p.evaluate(() => {
  function mkPage(flagged) {
    const c = document.createElement('canvas');
    c.width = 2048; c.height = 1024;
    const x = c.getContext('2d', flagged ? { willReadFrequently: true } : undefined);
    const d = x.createImageData(c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = (i * 7) & 255; d.data[i+1] = (i*13)&255; d.data[i+2] = (i*29)&255; d.data[i+3] = 255;
    }
    x.putImageData(d, 0, 0);
    return x;
  }
  function bench(ctx, n) {
    // 同 bake 行为:随机页内偏移读 16×16
    let acc = 0;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const rx = (i * 53) % (2048 - 17), ry = ((i * 29) % (1024 - 17));
      acc += ctx.getImageData(rx, ry, 16, 16).data[0];
    }
    return [(performance.now() - t0) / n * 1000, acc];   // µs/read
  }
  const gpu = mkPage(false);
  bench(gpu, 50);                                        // 预热
  const [gpuUs] = bench(gpu, 400);
  const cpu = mkPage(true);
  bench(cpu, 50);
  const [cpuUs] = bench(cpu, 400);
  return { gpuPerRead_us: +gpuUs.toFixed(1), cpuPerRead_us: +cpuUs.toFixed(1),
           gpuFor300cells_ms: +(gpuUs * 300 / 1000).toFixed(1),
           gpuFor800cells_ms: +(gpuUs * 800 / 1000).toFixed(1) };
});
console.log(JSON.stringify(res));
await b.close();
