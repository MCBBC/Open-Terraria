// VUI 光标层自愈验证:钉死 batch.ctx.isContextLost → 下一帧 heal 换画布 →
// 鼠标坐标跟踪恢复(batch 重建,监听用 VUI.canvas 当前引用)。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/vui-profile'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('console', (m) => { if (m.text().includes('ui-canvas')) console.log('[console]', m.text()); });
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
const before = await page.evaluate(() => {
  const VUI = window.__swVUI;
  return { node: VUI.canvas, lost: VUI.batch.ctx.isContextLost?.() ?? 'n/a' };
});
// 钉死上下文 → 触发 heal
await page.evaluate(() => {
  const VUI = window.__swVUI;
  VUI.batch.ctx.isContextLost = () => true;
});
await page.mouse.move(640, 400);
await new Promise((r) => setTimeout(r, 800));
const after = await page.evaluate(() => {
  const VUI = window.__swVUI;
  return { newNode: VUI.canvas, healed: VUI.canvas !== window.__vuiOldNode,
    lost: VUI.batch.ctx.isContextLost?.() ?? 'n/a', inDom: document.getElementById('ui-canvas') === VUI.canvas };
});
await page.evaluate(() => { window.__vuiOldNode = window.__swVUI.canvas; });
const heal1 = await page.evaluate(async () => {
  window.__vuiOldNode = window.__swVUI.canvas;
  window.__swVUI.batch.ctx.isContextLost = () => true;
  await new Promise((r) => setTimeout(r, 600));
  const VUI = window.__swVUI;
  return { replaced: VUI.canvas !== window.__vuiOldNode, lost: VUI.batch.ctx.isContextLost?.() ?? 'n/a' };
});
// 鼠标坐标跟踪(监听引用活画布)
await page.mouse.move(700, 300);
await new Promise((r) => setTimeout(r, 300));
const mouse = await page.evaluate(() => ({ x: Math.round(window.__swUIScaleMouseX ?? -1) }));
console.log(JSON.stringify({ beforeLost: before.lost, heal: heal1, mouseTracked: mouse }));
await browser.close();
