// 一次性:背包悬停气泡"过一会自己消失"排查(2026-08-28 用户报)——
//  hover 后每 500ms 采样:tooltip display/位置 + 槽中心 elementFromPoint(找遮罩)
//  + 面板/列表几何变化。输出时间线定位消失时刻与责任元素。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], userDataDir: '/tmp/sw-pptr-f5' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 200)));
await page.setViewport({ width: 1600, height: 900 });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame?.renderer && window.__swGame.world)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent === '我已知晓')?.click(); });
await new Promise((r) => setTimeout(r, 500));
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 600));
  if (await page.evaluate(() => window.__swUI.inventoryOpen).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 400));
// 给玩家一些物品,保证悬停槽有内容
await page.evaluate(() => {
  const g = window.__swGame;
  const wid = g.itemId('vi_9_wood');
  if (wid >= 0) g.player.inv.add(wid, 50);
  const tid = g.itemId('vi_8_torch');
  if (tid >= 0) g.player.inv.add(tid, 50);
});
// hover 背包第一个有内容的槽
const slotBox = await page.evaluate(() => {
  const ui = window.__swUI;
  const slots = [...ui.invPanel.querySelectorAll('.sw-slot')];
  for (const s of slots) {
    if (s.querySelector('img')) {
      const r = s.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, cls: s.className };
    }
  }
  const any = slots[0];
  const r = any.getBoundingClientRect();
  any.dispatchEvent(new MouseEvent('mouseenter'));
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, cls: any.className, empty: true };
});
await page.mouse.move(slotBox.x, slotBox.y);
await new Promise((r) => setTimeout(r, 300));
// 时间线采样 12s
const samples = [];
for (let i = 0; i < 24; i++) {
  const s = await page.evaluate(({ x, y }) => {
    const ui = window.__swUI;
    const tip = ui.tooltip;
    const cs = getComputedStyle(tip);
    const hit = document.elementFromPoint(x, y);
    const hitCls = hit ? String(hit.className).slice(0, 40) : null;
    return {
      ms: Math.round(performance.now()),
      shown: tip.style.display,
      op: cs.opacity, z: cs.zIndex,
      hitCls,
      hitIsSlot: hit?.classList?.contains('sw-slot') ?? false,
      tipText0: (tip.textContent || '').slice(0, 10),
    };
  }, { x: slotBox.x, y: slotBox.y }).catch((e) => ({ err: String(e).slice(0, 80) }));
  samples.push(s);
  await new Promise((r) => setTimeout(r, 500));
}
console.log(JSON.stringify({ slotBox, samples }, null, 1));
await page.screenshot({ path: '/tmp/tooltip-vanish.png' });
await browser.close();
process.exit(0);
