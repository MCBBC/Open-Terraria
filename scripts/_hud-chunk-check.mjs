// 1+3 验证:防御盾 img 化(不再有 52×48 canvas)+ MAX_CHUNKS 192(页数 ≤2×12)。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/hudcheck-profile'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  // 开背包面板(触发防御计数器构建+刷新)
  await new Promise((r) => setTimeout(r, 3000));
  // 找防御盾 img 与残留 52×48 canvas
  const canvases = [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`);
  const shieldImg = document.querySelector('img[style*="39px"]');
  return {
    canvases, has52x48: canvases.filter((s) => s === '52x48').length,
    shieldImg: shieldImg ? { src: (shieldImg.src || '').slice(0, 30), loaded: shieldImg.complete && shieldImg.naturalWidth > 0 } : null,
    maxChunks: g.chunks.constructor.MAX_CHUNKS,
    pageCount: g.chunks.pageCount,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
