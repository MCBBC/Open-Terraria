// 烟囱修复验收:载 FTW_V2 → 定位烟囱 → 连续采样 12s →
//   ①“整块消失事件”==0（修复前:周期性整体隐形）②存在动画变化（烟雾带循环）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || '/Users/vinlic/Downloads/map-FTW_V2 (10).json';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate((t) => window.__swFlow.loadJson(t), fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  g.player.x = 4131 * 16 + 8;
  g.player.y = (437 - 3) * 16;   // 站烟囱下脚灰砖上
  g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
  await new Promise((r) => setTimeout(r, 1500));   // 相机完全收敛
  const cvs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height);
  const cv = cvs[0];
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  // 屏幕锚定:玩家真实屏幕位置由 renderer 相机决定——用播放器盒投影保守框定烟囱 bbox:
  // 相机左上 ≈ playerCenter - viewport/2(跟随收敛后误差极小)
  const px = g.player.cx - cv.width / 2, py = g.player.cy - cv.height / 2;
  const sx = Math.round(4130 * 16 - px) - 6, sy = Math.round(435 * 16 - py) - 22;
  const cw = 60, chh = 44;   // 烟囱体 54×54 + 余量
  const frames = [];
  for (let k = 0; k < 360; k++) {   // 12s @30fps
    frames.push(ctx.getImageData(sx, sy, cw, chh).data.slice());
    await new Promise((r2) => setTimeout(r2, 33));
  }
  // ①“整块消失”检测:某帧的平均亮度骤升至天空量级(&&蓝色分量升高)
  const vanishEvents = [];
  const lum = [];
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k];
    let s = 0, blueEdge = 0;
    for (let o = 0; o < f.length; o += 4) { s += f[o] * 0.5 + f[o + 1] * 0.35 + f[o + 2] * 0.15; if (f[o + 2] > f[o] + 40 && f[o + 2] > 140) blueEdge++; }
    lum.push({ avg: s / (f.length / 4), blueEdge });
  }
  for (let k = 1; k < frames.length; k++) {
    const rise = lum[k].avg - lum[k - 1].avg;
    if (rise > 25) vanishEvents.push({ at: k, rise: Math.round(rise), blueJump: lum[k].blueEdge - lum[k - 1].blueEdge });
  }
  // ②动画活性:内容签名数量(>2 = 烟雾带在循环)
  const sigs = new Set(frames.map((f) => {
    let h = '';
    for (let o = 0; o < f.length; o += 97) h += String.fromCharCode(65 + ((f[o] + f[o + 2]) % 26));
    return h;
  }));
  return {
    vanishEvents: vanishEvents.slice(0, 8),
    vanishCount: vanishEvents.length,
    activeSignatures: sigs.size,
  };
});
console.log(JSON.stringify(out));
fs.writeFileSync('/tmp/chimney-fix-result.json', JSON.stringify(out));
await browser.close();
process.exit(out.vanishCount === 0 && out.activeSignatures > 2 ? 0 : 1);
