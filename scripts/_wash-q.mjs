// 快检:options.waveQuality 实际值 + gates + 注入计数(直接在页内打点)。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync('/Users/vinlic/Downloads/map-浮夸的羡慕顶峰 (7).json', 'utf8');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/wash-profile6',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const options = (await import('/src/core/Options.ts')).options;
  const wwMod = await import('/src/render/WaterWaves.ts');
  const ww = wwMod.waterWaves;
  const r = g.renderer;
  const warp = r.waterWarp;
  const glInfo = warp ? { mode: warp.mode, active: warp.active() } : null;
  return {
    waveQuality: options.data.waveQuality,
    quality: ww.quality,
    gates: ww.gates,
    texReady: wwMod.waveTexReady(),
    glInfo,
    cpuRender: r.isCpuRender ? r.isCpuRender() : null,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
