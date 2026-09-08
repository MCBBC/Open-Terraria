// ★IIIII218 logo 诊断：标题屏基线截图+img 态；生成期（zenith）同读 img 态+截图。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5275';
const OUT = '/tmp/iii218-out';
import { writeFileSync } from 'node:fs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.bringToFront().catch(() => {});
await new Promise((r) => setTimeout(r, 2500));

const imgState = () => page.evaluate(() => {
  const logo = document.querySelector('.sw-title-logo');
  const day = document.querySelector('.logo-day');
  const night = document.querySelector('.logo-night');
  const r = logo?.getBoundingClientRect();
  return {
    logoRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    logoStyle: logo?.getAttribute('style') ?? null,
    day: day ? { src: day.src.split('/').pop(), complete: day.complete, nw: day.naturalWidth, op: getComputedStyle(day).opacity } : null,
    night: night ? { src: night.src.split('/').pop(), complete: night.complete, nw: night.naturalWidth, op: getComputedStyle(night).opacity } : null,
  };
}).catch((e) => ({ err: String(e) }));

console.log('TITLE', JSON.stringify(await imgState()));
await page.screenshot({ path: `${OUT}/shot-iii218-title-baseline.png` }).catch(() => {});

await page.evaluate((cfg) => {
  void window.__swFlow.createWorldProbe(cfg)?.catch?.(() => {});
}, { seed: 'get fixed boi', size: 0, name: 'iii218l', difficulty: 0, evil: 0 });
await new Promise((r) => setTimeout(r, 20000));
console.log('GEN20S', JSON.stringify(await imgState()));
await page.screenshot({ path: `${OUT}/shot-iii218-genscreen-diag.png` }).catch(() => {});
await browser.close();
