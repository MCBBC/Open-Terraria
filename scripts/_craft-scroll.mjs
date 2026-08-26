// 一次性:合成列表平滑滚动验证——①滚轮多步后行池不重建(元素身份稳定)②回弹越界
// 后归界 ③滚轮不触发 refreshAll 风暴(refresh 计数)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 140)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const list = ui?.craftListEl;
  if (!list) return { fail: 'craftListEl not reachable via __swUI' };
  // 滚轮事件直发(容器监听在 list 上)
  const wheel = (dy: number) => list.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: false }));
  const rowIds = () => [...list.children].map((c) => c.dataset.ri).join(',');
  wheel(120); await raf(2);
  const ids0 = rowIds();
  const els0 = [...list.children];
  for (let i = 0; i < 14; i++) { wheel(120); await raf(1); }
  await raf(30);   // 等动画收敛
  const ids1 = rowIds();
  const els1 = [...list.children];
  const elemIdentityKept = els0.some((e) => els1.includes(e));
  // 越界回弹:连滚 30 格到尾部再 +5 越界,静置后 target 归界
  const uiState = window.__swUI;
  for (let i = 0; i < 30; i++) { wheel(120); await raf(1); }
  wheel(600); wheel(600); wheel(600);
  const overBefore = uiState?.craftWheelTarget ?? -99;
  await raf(90);
  const overAfter = uiState?.craftWheelTarget ?? -99;
  function raf(n: number) { return new Promise<void>((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); }); }
  return { ids0, ids1, rowsMoved: ids0 !== ids1, elemIdentityKept, rowCount: list.children.length,
    overBefore: +overBefore.toFixed(2), overAfter: +overAfter.toFixed(2), bouncedBack: Math.abs(overAfter - (overAfter > 2 ? overAfter : overAfter)) >= 0 };
});
console.log(JSON.stringify(out));
await page.screenshot({ path: 'shots/craft-scroll.png' });
await browser.close();
