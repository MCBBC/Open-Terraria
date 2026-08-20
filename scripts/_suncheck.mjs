// 撤回后黄昏截图:确认方片框消失+横向光带仍在(来自耀斑链 pointblurry)
import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/sunchk',
  args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 383 * 16; g.player.y = 228 * 16; g.player.debugGod = true;
  g.world.clock.timeOfDay = 0.72;
});
await new Promise((r) => setTimeout(r, 3500));
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/8405c930/tmp/wl-horizon/dusk-final.png' });
console.log('done');
await browser.close();
