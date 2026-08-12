// 公告/聊天列位置核对：注入消息 → 量 DOM 几何 vs 原版 (x=88, bottom=58, 行距21, 新在底)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 120000 });
for (let a = 0; a < 3; a++) {
  try { await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); }); break; }
  catch { await new Promise((r) => setTimeout(r, 1500)); }
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
const out = await page.evaluate(() => {
  const ui = window.__swUI;
  ui.chatMessage('第一条测试', 175, 75, 255);
  ui.chatMessage('第二条测试（新消息应在底部）', 50, 255, 130);
  const bar = document.querySelector('.sw-chat');
  const lines = [...document.querySelectorAll('.sw-chat-line')];
  const r = bar.getBoundingClientRect();
  const lr = lines.map((l) => {
    const b = l.getBoundingClientRect();
    return { text: l.textContent.slice(0, 12), x: Math.round(b.x), top: Math.round(b.top), bottom: Math.round(b.y + b.height) };
  });
  return {
    bar: { x: Math.round(r.x), bottomGap: Math.round(window.innerHeight - r.bottom) },
    lineCount: lines.length,
    lines: lr,
    colors: lines.map((l) => l.style.color),
    // 原版期望: x=88; 底行 bottomGap = 800-58 行底 → line1(第一条,上) bottomGap≈58+21
    expect: { x: 88, newestBottomGap: 58, pitch: 21 },
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
