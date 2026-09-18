// ★SW-BJ154 探针：道具搜索池全量对齐目视（用户实报：搜"史莱姆"看不到史莱姆鞍/粘鞍）。
// 运行：SW_ORIGIN=http://localhost:5248 node tools/run-diag.mjs scripts/_bj154-itemsearch-pool-shot.mjs
// 产出：/tmp/bj154-search-slime.png（搜"史莱姆"含粘鞍）、/tmp/bj154-search-slimy.png（搜 slimy）、
//       /tmp/bj154-browse-full.png（空查询全量滚动底,粘鞍在列）
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5248';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));
const ok = [];
const chk = (name, cond, extra = '') => {
  ok.push(!!cond);
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`);
};

try {
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('sbw.itemSearchConfirmed', '1');
  });
  await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__swGame?.player, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1500));

  const clickBtn = async (text) => {
    await page.waitForFunction((t) =>
      [...document.querySelectorAll('button')].some((b) => b.textContent === t),
      { timeout: 8000 }, text);
    await page.evaluate((t) => {
      [...document.querySelectorAll('button')].find((b) => b.textContent === t)?.click();
    }, text);
  };
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === '设置');
    btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await clickBtn('开发者选项');
  await clickBtn('道具搜索');
  await page.waitForSelector('.sw-itemsearch', { timeout: 5000 });

  const panelSel = '.sw-itemsearch';
  const listSel = `${panelSel} > div:last-child`;   // 虚拟滚动列表容器(spacer 的父)

  // ---- 计数行:空查询=池总数 ----
  await new Promise((r) => setTimeout(r, 400));
  const count0 = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(`${sel} .sw-lbl`)];
    return els.map((e) => e.textContent).find((t) => /共 \d/.test(t)) ?? '';
  }, panelSel);
  chk('空查询计数行=全量池(共 N 件)', /共 \d{4,} 件/.test(count0), count0);

  // ---- 搜"史莱姆" → 命中"粘鞍"(官方 zh 名) 目视 ----
  await page.type(`${panelSel} input`, '史莱姆');
  await new Promise((r) => setTimeout(r, 400));
  const slimeHits = await page.evaluate((sel) => {
    const rows = [...document.querySelectorAll(`${sel} > div:last-child > div > div > div`)];
    return { n: rows.length, names: rows.map((r) => r.querySelector('span')?.textContent ?? '') };
  }, panelSel);
  const hasSaddle = slimeHits.names.includes('粘鞍');
  chk('搜"史莱姆"命中行数>0', slimeHits.n > 0, `n=${slimeHits.n}`);
  chk('搜"史莱姆"含粘鞍(2430,用户实报件)', hasSaddle, slimeHits.names.slice(0, 6).join('/'));
  await page.screenshot({ path: '/tmp/bj154-search-slime.png' });

  // ---- 搜"slimy"同样命中(英文名桥不回退) ----
  await page.evaluate(() => { const i = document.querySelector('.sw-itemsearch input'); i.value = ''; });
  await page.type(`${panelSel} input`, 'slimy');
  await new Promise((r) => setTimeout(r, 400));
  const slimyNames = await page.evaluate((sel) => {
    const rows = [...document.querySelectorAll(`${sel} > div:last-child > div > div > div`)];
    return rows.map((r) => r.querySelector('span')?.textContent ?? '');
  }, panelSel);
  chk('搜"slimy"含粘鞍', slimyNames.includes('粘鞍'), slimyNames.join('/'));

  // ---- 空查询:全量虚拟滚动,滚到池序 464(2430 处)可视 ----
  await page.evaluate(() => { const i = document.querySelector('.sw-itemsearch input'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await new Promise((r) => setTimeout(r, 400));
  const virt = await page.evaluate((sel) => {
    const list = document.querySelector(sel);
    const spacer = list?.firstElementChild;
    return { h: spacer?.style?.height ?? '', rendered: list?.querySelectorAll('img').length ?? 0 };
  }, listSel);
  chk('空查询 spacer 总高≈全量两列滚动域(>40000px=旧 80 封顶废止)', parseInt(virt.h) > 40000, `spacer.h=${virt.h}`);
  chk('可视窗渲染条目数受虚拟化钳制(<120,旧全量 DOM 不可行)', virt.rendered > 0 && virt.rendered < 120, `rendered=${virt.rendered}`);
  // 滚动到 2430(池序 ~464 → row≈232 → top≈232*36≈8352) 应在可视 DOM 出现粘鞍
  await page.evaluate((sel) => {
    const list = document.querySelector(sel);
    list.scrollTop = 8352;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, listSel);
  await new Promise((r) => setTimeout(r, 400));
  const browseNames = await page.evaluate((sel) => {
    const rows = [...document.querySelectorAll(`${sel} > div:last-child > div > div > div`)];
    return rows.map((r) => r.querySelector('span')?.textContent ?? '');
  }, panelSel);
  chk('滚动浏览(池序464处)目视粘鞍', browseNames.includes('粘鞍'), `附近行:${browseNames.slice(0, 4).join('/')}`);
  await page.screenshot({ path: '/tmp/bj154-browse-full.png' });

  // ---- 搜"slimy"截图留档(粘鞍+菲娅坐骑? 单件即可) ----
  await page.evaluate(() => { const i = document.querySelector('.sw-itemsearch input'); i.value = ''; });
  await page.type(`${panelSel} input`, 'slimy');
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: '/tmp/bj154-search-slimy.png' });

  console.log(ok.every(Boolean) ? 'ALL PASS' : 'SOME FAIL');
} finally {
  await browser.close();
}
