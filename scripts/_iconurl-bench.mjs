// 背包图标 base64 管线量化(纯菜单页,零世界依赖):toDataURL 编码成本/尺寸分布
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const page = await b.newPage();
await page.goto((process.env.SW_ORIGIN || 'http://localhost:5202') + '/', { waitUntil: 'domcontentloaded' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 120000 });
await page.mouse.click(8, 8);
await sleep(1200);
const res = await page.evaluate(async () => {
  const AG = await import('/src/assets/AssetGen.ts');
  const bundle = AG.buildAssets();
  // 抽样:前 600 个有图标的 id
  const ids = [];
  for (let id = 1; id < 6200 && ids.length < 600; id++) if (bundle.itemIcon(id)) ids.push(id);
  // 编码计时
  let bytes = 0, longest = 0, shortest = 1e9;
  const t0 = performance.now();
  const urls = [];
  for (const id of ids) {
    const u = bundle.itemIcon(id).toDataURL();
    urls.push(u); bytes += u.length; longest = Math.max(longest, u.length); shortest = Math.min(shortest, u.length);
  }
  const encodeTotal = performance.now() - t0;
  // objectURL 路径对照(canvas.toBlob 是异步的,量总墙钟)
  const t1 = performance.now();
  const blobs = await Promise.all(ids.map(id => new Promise(r => bundle.itemIcon(id).toBlob(r, 'image/png'))));
  const blobUrls = blobs.map(bl => bl ? URL.createObjectURL(bl) : '');
  const blobTotal = performance.now() - t1;
  let blobBytes = 0;
  const blobSizes = await Promise.all(blobs.map(bl => bl ? bl.arrayBuffer().then(a => a.byteLength) : 0));
  blobBytes = blobSizes.reduce((a, b2) => a + b2, 0);
  blobUrls.forEach(u => URL.revokeObjectURL(u));
  // DOM img 解码首绘(24 个样本, dataURL vs objectURL)——量 tti
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;opacity:0.01;pointer-events:none';
  document.body.appendChild(probe);
  const attach = (arr) => new Promise(r => { let c = 0; arr.forEach(im => { im.onload = im.onerror = () => { if (++c === arr.length) r(); }; probe.appendChild(im); }); });
  const t2 = performance.now();
  const A = urls.slice(0, 24).map(u => { const im = new Image(); im.src = u; return im; });
  await attach(A);
  const dataUrlTti = performance.now() - t2;
  const t3 = performance.now();
  const B = blobUrls.slice(0, 24).map(u => { const im = new Image(); im.src = u; return im; });
  await attach(B);
  const blobUrlTti = performance.now() - t3;
  probe.remove();
  return { sampled: ids.length, encode: { totalMs: +encodeTotal.toFixed(1), perIconUs: Math.round(encodeTotal / ids.length * 1000) },
    dataUrlKBtotal: +(bytes / 1024).toFixed(0), longestKB: +(longest / 1024).toFixed(1), shortestKB: +(shortest / 1024).toFixed(1),
    blob: { totalMs: +blobTotal.toFixed(1), KBtotal: +(blobBytes / 1024).toFixed(0), kbVsBase64: +(bytes / Math.max(1, blobBytes)).toFixed(2) },
    tti24: { dataUrlMs: +dataUrlTti.toFixed(1), blobMs: +blobUrlTti.toFixed(1) } };
});
console.log(JSON.stringify(res, null, 1));
await b.close();
