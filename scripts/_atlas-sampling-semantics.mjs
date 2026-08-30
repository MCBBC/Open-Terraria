// 纯引擎实验：同一 256² 位图放置在共享大图不同 (sx,sy)，imageSmoothingEnabled=false
// 下放大到 320 绘制——输出是否随页内位置而变？(Chromium 最近邻取样的页邻域敏感性)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 400, height: 400 } });
const page = await browser.newPage();
const out = await page.evaluate(() => {
  const mkPage = () => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 1024;
    return c;
  };
  // 源图案：典型 tile 内容——内部实色 + 1px 抗锯齿边缘（alpha 渐变）
  const pat = document.createElement('canvas');
  pat.width = 256; pat.height = 256;
  {
    const pc = pat.getContext('2d');
    pc.fillStyle = '#808080';
    pc.fillRect(2, 2, 252, 252);
    pc.fillStyle = 'rgba(128,128,128,0.35)';
    pc.fillRect(1, 1, 254, 254);       // 半透明边带（真实 blend/margin 类像素常態）
  }
  const slots = [[64, 64], [288, 64], [64, 288], [544, 132], [640, 384]];
  const results = [];
  for (const zz of [1.25, 1.5, 2.0]) {
    let base = [];
    let differsAt = null;
    for (let i = 0; i < slots.length; i++) {
      const pg = mkPage();
      const g = pg.getContext('2d');
      g.clearRect(0, 0, 1024, 1024);
      // 邻域污染：页面其他位置放满随机噪声（模拟真实页上其它 chunk）
      const noise = document.createElement('canvas');
      noise.width = 256; noise.height = 256;
      const nc = noise.getContext('2d');
      const idata = nc.createImageData(256, 256);
      for (let q = 0; q < idata.data.length; q += 4) {
        idata.data[q] = (q * 7919) % 255; idata.data[q + 3] = 255;
      }
      nc.putImageData(idata, 0, 0);
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) {
        if (xx * 256 === slots[i][0] && yy * 256 === slots[i][1]) continue;
        g.drawImage(noise, xx * 256, yy * 256);
      }
      g.drawImage(pat, slots[i][0], slots[i][1]);
      // 放大到目标
      const dst = document.createElement('canvas');
      dst.width = Math.round(256 * zz); dst.height = Math.round(256 * zz);
      const dc = dst.getContext('2d');
      dc.imageSmoothingEnabled = false;
      dc.drawImage(pg, slots[i][0], slots[i][1], 256, 256, 0, 0, dst.width, dst.height);
      const d = dc.getImageData(0, 0, dst.width, dst.height).data;
      if (i === 0) { base = d; continue; }
      let nDiff = 0, mx = 0;
      for (let q = 0; q < d.length; q += 4) {
        const dd = Math.max(Math.abs(d[q] - base[q]), Math.abs(d[q + 1] - base[q + 1]), Math.abs(d[q + 2] - base[q + 2]));
        if (dd > 0) { nDiff++; if (dd > mx) mx = dd; }
      }
      results.push({ zoom: zz, slotB: slots[i], pixDiffs: nDiff, maxD: mx });
    }
    void differsAt;
  }
  return results;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(out.some(r => r.pixDiffs > 0) ? 0 : 1);
