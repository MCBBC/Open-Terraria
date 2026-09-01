// 带激活 buff 的长驻测试(还原用户场景):BuffState 注入再生等常用 buff,
// 真鼠标悬停含物槽位 25s,每 500ms 采样;Game 自身每秒 tick 驱动 refreshBuffs。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame?.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent === '我已知晓')?.click(); });
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 400));
  if (await page.evaluate(() => window.__swUI.inventoryOpen).catch(() => false)) break;
}
await page.evaluate(() => {
  const items = window.__swITEMS ?? [];
  let tid = 1;
  for (let id = 0; id < items.length; id++) if (/^torch/.test(items[id]?.key ?? '')) { tid = id; break; }
  window.__swGame.player.inv.slots[12] = { id: tid, stack: 50 };
  // 注入两个持久 buff 还原"有 buff 时"用户态
  // BuffType: Regeneration=4? 枚举里 Regen=4(恢复) / Ironskin=1(铁皮) —— add(type,time)
  window.__swGame.player.buffs.apply(1, 3600);   // 铁皮
  window.__swGame.player.buffs.apply(4, 3600);   // 恢复
  window.__swUI.refreshAllNow();
});
const found = await page.evaluate(() => {
  for (const s of [...window.__swUI.invPanel.querySelectorAll('.sw-slot')]) {
    const c = s.querySelector('.cnt');
    if (c && c.textContent === '50') {
      const r = s.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
  }
  return null;
});
if (!found) { console.log('FATAL no filled slot'); process.exit(1); }
// 原型钩子采样链路计数
await page.evaluate(() => {
  const proto = Object.getPrototypeOf(window.__swUI);
  proto.showTooltipFor ??= null;
  window.__showCalls = 0;
  const o = proto.showTooltipFor;
  proto.showTooltipFor = function (...a) { window.__showCalls++; return o.apply(this, a); };
});
await page.mouse.move(found.x - 70, found.y - 40);
await new Promise((r) => setTimeout(r, 200));
await page.mouse.move(found.x, found.y);
const t0 = Date.now();
let offCount = 0; const offs = [];
for (let i = 0; i < 50; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const st = await page.evaluate(() => ({
    on: getComputedStyle(window.__swUI.tooltip).display !== 'none',
    txt: (window.__swUI.tooltip.textContent || '').slice(0, 8),
    showCalls: window.__showCalls,
    buffsVisible: [...document.querySelectorAll('.sw-tooltip')].length,
  }));
  if (!st.on) { offCount++; offs.push(Date.now() - t0); }
}
console.log('STAY 25s: offFrames=', offCount, '/', 50, offs.length ? ('offs@ms=' + offs.join(',')) : '(全程点亮)');
await browser.close();
process.exit(0);
