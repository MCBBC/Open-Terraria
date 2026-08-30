// 全量动画族健康扫描:每个有 RATE 注册的 sheet,检查其渲染像素是否在多帧间有意义地变化
// 症状判定:某些 sheet 只在部分帧间变化、或某帧变透明、或始终不变 → 有 bug
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || '/Users/vinlic/Downloads/map-FTW_V2 (10).json';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate((t) => window.__swFlow.loadJson(t), fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 4131 * 16 + 8; g.player.y = (437 - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
});
await new Promise((r) => setTimeout(r, 1800));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const cam = g.camera;
  const cvs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height);
  const ctx = cvs[0].getContext('2d', { willReadFrequently: true });
  // 收集所有 RATE 注册的 sheets,在当前视口内找对应 tile
  const TA = await import('/src/render/TileAnim.ts');
  const results = [];
  // 直接逐帧采样整个视口,比对帧间差异来确定哪些区域在循环
  const regions = [];
  const ticks_per_sample = 40;   // 每 40 tick 一拍 ≈ 覆盖一个完整动画周期的 1/N
  for (let k = 0; k < 60; k++) {
    // 手动推进 tick 以确保覆盖完整周期
    await new Promise((r) => setTimeout(r, 33));
    const id = ctx.getImageData(0, 0, cv.width, cv.height);
    // 计算 CRC 与差异分布
    const sig = (() => { let h = 0; const d = id.data; for (let o = 0; o < d.length; o += 397) h = ((h << 5) - h + d[o]) | 0; return h >>> 0; })();
    // 记录亮度直方图摘要
    const lit = [];
    for (let o = 0; o < Math.min(d.length||id.data.length, 10000); o += 1000) {
      lit.push(id.data[o*4] + id.data[o*4+1] + id.data[o*2]);
    }
    regions.push({ tick: k, sig: sig.toString(36), sum: lit.reduce((a,b)=>a+b,0) % 100000 });
    void lit;
    void id;
  }
  void regions;
  return regions;
});
console.log(JSON.stringify(out));
fs.writeFileSync('/tmp/full-scan.json', JSON.stringify(out));
await browser.close();
