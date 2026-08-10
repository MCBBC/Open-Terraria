// 时间调整按钮 E2E：点 ± 开面板 → +1小时 → 午夜预设 → 验证 clock.timeOfDay
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
await p.setViewport({ width: 800, height: 600 });
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));

const res = {};
res.t0 = await p.evaluate(() => {
  const c = window.__swGame.world.clock;
  return { t: c.timeOfDay, open: window.__swGame.renderer.timePanelOpen };
});
// ± 按钮（ox=800-292=508 → 按钮 726..746, 342..362 → 中心 736,352）
await p.mouse.click(736, 352, { delay: 120 });
await new Promise(r => setTimeout(r, 300));
res.afterToggle = await p.evaluate(() => ({
  open: window.__swGame.renderer.timePanelOpen,
  hover: window.__swGame.renderer.timeUiHover,
}));
// +1 小时（盒 664..740, 374..396 → 中心 702,385）
const tBefore = await p.evaluate(() => window.__swGame.world.clock.timeOfDay);
await p.mouse.click(702, 385, { delay: 120 });
await new Promise(r => setTimeout(r, 300));
res.plus1h = await p.evaluate((before) => {
  const t = window.__swGame.world.clock.timeOfDay;
  return { before, after: t, delta: ((t - before + 1.5) % 1) - 0.5 };
}, tBefore);
// 午夜预设（盒 686..738, 404..424 → 中心 712,414）
await p.mouse.click(712, 414, { delay: 120 });
await new Promise(r => setTimeout(r, 300));
res.midnight = await p.evaluate(() => {
  const c = window.__swGame.world.clock;
  return { t: c.timeOfDay, text: `${String(Math.floor(c.hourFloat)).padStart(2, '0')}:${String(Math.floor((c.hourFloat % 1) * 60)).padStart(2, '0')}` };
});
// 再点 ± 关面板
await p.mouse.click(736, 352, { delay: 120 });
await new Promise(r => setTimeout(r, 300));
res.closed = await p.evaluate(() => window.__swGame.renderer.timePanelOpen);

console.log(JSON.stringify(res));
await b.close();
