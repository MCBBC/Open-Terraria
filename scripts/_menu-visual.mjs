// 一次性:菜单云 GL/2D 双路径视觉校验(截图+云带覆盖率+控制台错误)。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_menu-visual.mjs
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';

async function run(tag, url) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 200)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('!!window.__swMenuBg', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));
  const info = await page.evaluate(async () => {
    const mb = window.__swMenuBg;
    const gl = mb.sky.cloudGlLayer;
    const glState = gl ? { unavailable: gl.unavailable, cloudFxOK: gl.cloudFxOK, canvas: [gl.canvas.width, gl.canvas.height] } : null;
    // 白天态截图
    mb.setClockT(0.35);   // 上午,天色稳定
    await new Promise((r) => setTimeout(r, 1200));
    const dayCanvas = mb.canvas;
    const dayShot = dayCanvas.toDataURL('image/png');
    // 夜晚态(星+月)
    mb.setClockT(0.9);
    await new Promise((r) => setTimeout(r, 1200));
    const nightShot = dayCanvas.toDataURL('image/png');
    // 云带覆盖率(白天帧,顶部 45% 高度带内非天空色像素占比,粗略)
    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 200;
    const cx = cv.getContext('2d');
    const img = new Image();
    img.src = dayShot;
    await new Promise((r) => { img.onload = r; });
    cx.drawImage(img, 0, 0, 320, 200);
    const d = cx.getImageData(0, 0, 320, 90).data;   // 顶部带
    let nonBlue = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r0, g0, b0] = [d[i], d[i + 1], d[i + 2]];
      if (!(b0 > r0 + 20 && b0 > 100)) nonBlue++;   // 非蓝天 = 云/山
    }
    return { glState, cloudBandNonBluePct: +(100 * nonBlue / (d.length / 4)).toFixed(1), dayShot, nightShot };
  });
  fs.writeFileSync(`/tmp/menu-${tag}-day.png`, Buffer.from(info.dayShot.split(',')[1], 'base64'));
  fs.writeFileSync(`/tmp/menu-${tag}-night.png`, Buffer.from(info.nightShot.split(',')[1], 'base64'));
  console.log(tag, JSON.stringify({ glState: info.glState, cloudBandNonBluePct: info.cloudBandNonBluePct, errors: errors.slice(0, 5) }));
  await browser.close();
}

await run('gl', ORIGIN + '/');
await run('2d', ORIGIN + '/?cloudgl=0');
