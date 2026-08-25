// 画布抓取诊断：列出页面全部 canvas + worldToScreen 往返，验证坐骑区像素采样
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 600000, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[dbg]')) console.log(t); });
await page.goto(ORIGIN, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 300000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 420000, polling: 1000 });
await new Promise(r => setTimeout(r, 1500));
await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  const cans = [...document.querySelectorAll('canvas')].map((c, i) => ({
    i, w: c.width, h: c.height, cw: c.clientWidth, id: c.id, cls: c.className,
  }));
  console.log('[dbg] canvases ' + JSON.stringify(cans));
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const [sx, sy] = g.camera.worldToScreen(p.cx, p.cy);
  console.log(`[dbg] player screen css=(${sx.toFixed(1)},${sy.toFixed(1)}) canvas=${cv.width}x${cv.height} client=${cv.clientWidth}x${cv.clientHeight} dpr=${window.devicePixelRatio}`);
  const kx = cv.width / cv.clientWidth;
  const c2 = document.createElement('canvas');
  const W = 160, H = 160;
  c2.width = W; c2.height = H;
  const cx2 = c2.getContext('2d');
  cx2.drawImage(cv, sx * kx - W / 2, sy * kx - H / 2, W, H, 0, 0, W, H);
  const d = cx2.getImageData(0, 0, W, H).data;
  let opaque = 0, bright = 0, sum = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 40) opaque++; if (d[i] + d[i + 1] + d[i + 2] > 90) bright++; sum += d[i] + d[i + 1] + d[i + 2]; }
  console.log(`[dbg] grab around player: opaque=${opaque} bright=${bright} avg=${(sum / d.length).toFixed(1)}`);
  // 全画布对照
  const c3 = document.createElement('canvas');
  c3.width = 200; c3.height = 200;
  const cx3 = c3.getContext('2d');
  cx3.drawImage(cv, 0, 0, 200, 200);
  const d3 = cx3.getImageData(0, 0, 200, 200).data;
  let op3 = 0;
  for (let i = 0; i < d3.length; i += 4) if (d3[i + 3] > 40) op3++;
  console.log(`[dbg] grab corner(0,0,200,200): opaque=${op3}`);
});
await browser.close();
