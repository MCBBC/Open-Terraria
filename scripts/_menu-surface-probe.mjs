// 菜单期表面预算复验(#perf2026-08-28 修订后):idle 停留 12s,期间
// · __swCanvasWatch 累计出生数
// · document 全量 canvas 节点数
// · WebGL 上下文存活探针(经 WebGLRenderingContext.prototype 包装计数——风险已证,
//   改用特征:统计带 'webgl' id 的全局?退而用 CreationContext 不可测→间接法:
//   document.querySelectorAll('canvas') 中 width>0 的最大张数 + 控制台无 [VUI] heal 警告)
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 },   // ★模拟 DPR=2 弱机压力面
});
const page = await browser.newPage();
const warns = [];
page.on('console', (m) => { const t = m.text(); if (/VUI|canvas哨兵|contextlost|上下文死亡/.test(t)) warns.push(t.slice(0, 140)); });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
const samples = [];
for (let i = 0; i < 6; i++) {
  await new Promise(r => setTimeout(r, 2000));
  samples.push(await page.evaluate(() => ({
    t: Math.round(performance.now() / 1000),
    canvases: document.querySelectorAll('canvas').length,
    watch: window.__swCanvasWatch?.() ?? null,
  })));
}
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-vsel', { timeout: 6000 }).catch(() => {});
}
samples.push(await page.evaluate(() => ({ t: Math.round(performance.now() / 1000), canvases: document.querySelectorAll('canvas').length, watch: window.__swCanvasWatch?.() ?? null })));
console.log(JSON.stringify(samples, null, 1));
console.log('WARNINGS:', JSON.stringify(warns.slice(0, 10), null, 1));
await browser.close();
