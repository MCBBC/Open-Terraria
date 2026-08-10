// Buff 栏原版布局冒烟：施加 buff → 等 Game 每秒 onBuffsChanged 刷新 → DOM 检查
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 120000 });
for (let a = 0; a < 3; a++) {
  try { await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); }); break; }
  catch { await new Promise((r) => setTimeout(r, 1500)); }
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  // BuffType 数值：Honey=6, Regen=4
  g.player.buffs.apply(6, 95);
  g.player.buffs.apply(4, 30);
  await new Promise((r) => setTimeout(r, 1300)); // 等下一秒刷新
  const bar = document.querySelector('div[style*="top:76px"]');
  const blocks = [...document.querySelectorAll('.sw-buff')].filter((b) => b.style.display !== 'none');
  const info = blocks.map((b) => {
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: r.width, h: r.height, text: b.querySelector('span')?.textContent, title: b.title?.split('：')[0] };
  });
  const barStyle = bar ? { x: Math.round(bar.getBoundingClientRect().x), y: Math.round(bar.getBoundingClientRect().y) } : null;
  // 右键取消蜂蜜
  const honeyBlock = blocks.find((b) => b.title?.startsWith('蜂蜜'));
  let removed = false;
  if (honeyBlock) {
    honeyBlock.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    removed = !g.player.buffs.has(6);
  }
  return { barStyle, count: blocks.length, info, removed };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
