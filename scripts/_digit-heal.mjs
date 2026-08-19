// 数字键自愈验证:Digit 切栏 → recreateMainCanvas(自愈路径) → Digit 再切栏应仍生效。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/digit-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2500));
const step = async (label) => {
  const sel = await page.evaluate(() => window.__swGame.player.inv.selected);
  console.log(label, 'selected =', sel);
  return sel;
};
await step('[前置]');
await page.keyboard.press('Digit3');
await new Promise((r) => setTimeout(r, 300));
const a = await step('[Digit3]');
await page.evaluate(() => { window.__swGame.renderer.recreateMainCanvas(); });  // 走 onCanvasRecreated 重绑路径
await new Promise((r) => setTimeout(r, 300));
await page.keyboard.press('Digit5');
await new Promise((r) => setTimeout(r, 300));
const b = await step('[重建后 Digit5]');
console.log(a === 2 && b === 4 ? 'PASS 数字键自愈' : `FAIL a=${a} b=${b}`);
await browser.close();
process.exit(a === 2 && b === 4 ? 0 : 1);
