// ★一次性：Chromium 缩放 blit 最近邻合规性合成实验
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const p = await b.newPage();
const r = await p.evaluate(async () => {
  const out = {};
  for (const smoothing of [false, true]) {
    // 构造 1024² 页:4 行 cell,红/绿/蓝/黄
    const t = document.createElement('canvas'); t.width = 1024; t.height = 1024;
    const tc = t.getContext('2d');
    const colors = [['#ff0000', '#00ff00'], ['#0000ff', '#ffff00']];
    for (let r2 = 0; r2 < 2; r2++) for (let c2 = 0; c2 < 2; c2++) {
      tc.fillStyle = colors[r2][c2]; tc.fillRect(c2 * 256, r2 * 256, 256, 256);
    }
    // 每 cell 底部 1px 画黑线(标记 cell 内容末行)
    tc.fillStyle = '#000';
    tc.fillRect(0, 255, 1024, 1);
    // 1.25× blit cell(0,0) 红 → 320×320
    const d = document.createElement('canvas'); d.width = 320; d.height = 320;
    const dc = d.getContext('2d');
    dc.imageSmoothingEnabled = smoothing;
    dc.drawImage(t, 0, 0, 256, 256, 0, 0, 320, 320);
    const dd = dc.getImageData(0, 0, 320, 320).data;
    // 扫描全部 320 行的中心列,归类颜色
    const rows = [];
    for (let y = 0; y < 320; y++) {
      const i = (y * 320 + 160) * 4;
      const [R, G, B] = [dd[i], dd[i + 1], dd[i + 2]];
      let k = '?';
      if (R > 200 && G < 80) k = 'R';
      else if (G > 200 && R < 80) k = 'G';
      else if (R < 60 && G < 60 && B < 60) k = 'K';
      else if (R > 200 && G > 200) k = 'Y';
      else k = 'M' + R + ',' + G + ',' + B;
      rows.push(k);
    }
    // 压缩成 run-length
    const rl = [];
    let cur = rows[0], n = 1;
    for (let y = 1; y < 320; y++) {
      if (rows[y] === cur && n < 999) n++;
      else { rl.push(cur + 'x' + n); cur = rows[y]; n = 1; }
    }
    rl.push(cur + 'x' + n);
    out['smoothing=' + smoothing] = rl.join(' ');
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();
