// BJ363 探针③:多窗口尺寸下 DOM 背包槽与信息图标条(iconRects)的几何重叠普查。
// 重叠 = DOM 槽点击(经 window 级 mousedown 传到 Input)可同时命中 canvas 侧
// hideInfo 翻转面(tickInfoAccsHover 无 inpOverDomUi/CanShow 门)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.keyboard.type('BJ363');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('363363');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));
// 带上贝壳电话保证 12 行 strip
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.armor[3] = { id: window.__swItems['vi_5358_shellphone'], stack: 1 };
  g.cb?.onInventoryChanged?.();
});
await new Promise((r) => setTimeout(r, 600));

const SIZES = [[1280, 800], [1280, 720], [1152, 640], [1024, 600], [960, 540]];
for (const [w, h] of SIZES) {
  await page.setViewport({ width: w, height: h });
  await new Promise((r) => setTimeout(r, 500));
  await page.keyboard.press('Escape');   // 开背包
  await new Promise((r) => setTimeout(r, 700));
  const r = await page.evaluate(() => {
    const g = window.__swGame;
    const rects = (g.renderer.infoAccs?.state?.iconRects ?? []).map((q) => ({ x: q.x, y: q.y, w: q.w, h: q.h, icon: q.row.icon }));
    const invOpen = g.renderer.playerInventory;
    // 收集 DOM 侧可点击槽(背包网格+装备页):有 data-i / class 含 slot 的元素
    const doms = [];
    document.querySelectorAll('div, img').forEach((el) => {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (!/(slot|inv|equip|acc)/.test(cls)) return;
      if (el.getBoundingClientRect().width <= 0) return;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === 'none') return;
      const b = el.getBoundingClientRect();
      doms.push({ cls: cls.slice(0, 30), x: b.x, y: b.y, w: b.width, h: b.height });
    });
    // 重叠普查:icon rect ∩ dom rect
    const hits = [];
    for (const ic of rects) {
      for (const d of doms) {
        const ox = Math.max(0, Math.min(ic.x + ic.w, d.x + d.w) - Math.max(ic.x, d.x));
        const oy = Math.max(0, Math.min(ic.y + ic.h, d.y + d.h) - Math.max(ic.y, d.y));
        if (ox > 2 && oy > 2) hits.push({ icon: ic.icon, ix: Math.round(ic.x), iy: Math.round(ic.y), dom: d.cls, dx: Math.round(d.x), dy: Math.round(d.y), dw: Math.round(d.w), dh: Math.round(d.h) });
      }
    }
    return { invOpen, nIcons: rects.length, nDoms: doms.length, hits: hits.slice(0, 8) };
  });
  console.log(`${w}x${h} invOpen=${r.invOpen} icons=${r.nIcons} domClickables=${r.nDoms} OVERLAPS=${r.hits.length}`);
  r.hits.forEach((h) => console.log('   ', JSON.stringify(h)));
  await page.keyboard.press('Escape');
  await new Promise((r2) => setTimeout(r2, 400));
}
await browser.close();
process.exit(0);
