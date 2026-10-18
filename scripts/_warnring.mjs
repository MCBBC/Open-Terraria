// warn-once + 警告环终验：陶罐像素基线 [112,48,172,140] + 无假越界警告 + __swWarns 入 F5 报告
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const SAVE_TEXT = readFileSync(needInput(join(DOWNLOADS, 'map-12345世界 (2).json')), 'utf8');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swLoadJson, { timeout: 60000 });
await page.evaluate((t) => window.__swLoadJson(t), SAVE_TEXT);
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.chunks, { timeout: 600000, polling: 2000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 3385 * 16 - 100; g.player.y = 185 * 16; g.player.vx = 0; g.player.vy = 0;
});
await page.waitForFunction(() => !!window.__swGame.renderer.atlas.ensureVImage('vanilla/Tiles_28.png'), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

// 1) 陶罐像素 + 开关门重建后仍正确
const bakeCheck = async () => page.evaluate(() => {
  const g = window.__swGame;
  const key = (211 & 0xffff) | ((11 & 0xffff) << 16);
  const pair = g.chunks.chunks.get(key);
  if (!pair) return null;
  const ctx = pair.tile.getContext('2d');
  const cells = [];
  for (const [x, y] of [[3385,189],[3386,189],[3385,190],[3386,190]]) {
    const d = ctx.getImageData((x % 16) * 16, (y % 16) * 16, 16, 16).data;
    let op = 0;
    for (let k = 3; k < d.length; k += 4) if (d[k] > 40) op++;
    cells.push(op);
  }
  return cells;
});
const before = await bakeCheck();
// 触发一次重建(全量标脏)模拟开关门
await page.evaluate(() => window.__swGame.chunks.invalidateAll());
await new Promise((r) => setTimeout(r, 3000));
const after = await bakeCheck();
const EXPECTED = JSON.stringify([112, 48, 172, 140]);
console.log('陶罐像素 重建前:', JSON.stringify(before), JSON.stringify(before) === EXPECTED ? '✓' : '✗');
console.log('陶罐像素 重建后:', JSON.stringify(after), JSON.stringify(after) === EXPECTED ? '✓' : '✗');

// 2) 警告环：console.warn 全量入环(cap 50)
const ring = await page.evaluate(() => ({
  warnRing: (window.__swWarns ?? []).length,
  oobWarns: (window.__swWarns ?? []).filter((w) => w.msg.includes('VanillaTiler')).map((w) => w.msg.slice(0, 120)),
  errRing: (window.__swErrors ?? []).length,
}));
console.log(`警告环: ${ring.warnRing} 条(其中 VanillaTiler ${ring.oobWarns.length} 条)`);
ring.oobWarns.forEach((m) => console.log('  ⚠', m));
console.log(`错误环: ${ring.errRing} 条`);

// 3) F5 报告含 warnings 段
const report = await page.evaluate(async () => {
  const m = await import('/src/debug/DebugReport.ts');
  const r = m.collectDebugReport(window.__swGame, { screenshot: false });
  return { hasWarnings: Array.isArray(r.warnings), n: (r.warnings ?? []).length, schema: r.meta.schemaVersion };
});
console.log('F5 报告 warnings 段:', JSON.stringify(report), report.hasWarnings ? '✓' : '✗');
await browser.close();
