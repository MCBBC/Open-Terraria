// M8 旅程物品浏览器 UI 探针（私有 vite 5205；JourneyPowersUI category 1 页）。
// 断言：搜索框/11 过滤器互斥单选/虚拟滚动（可见格 ≪ 全量）/半程暗槽不可取/
// 取用入包/计数行/newly 高亮。经 tools/run-diag.mjs 运行。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 860 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
let booted = null;
for (let att = 0; att < 10 && !booted; att++) {
  try {
    await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    booted = 'yes';
  } catch { await new Promise(r => setTimeout(r, 2500)); }
}
if (!booted) { console.log('GAVE UP'); await browser.close(); process.exit(1); }

const setup = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!window.__swGame?.player && Date.now() - t0 < 90000) await new Promise(r => setTimeout(r, 400));
  const g = window.__swGame;
  if (!g?.player) return 'no game';
  // 旅程身份 + 旅程世界（面板入口/力量页门）
  g.world.difficulty = 3;
  g.player.appearance = { ...(g.player.appearance ?? {}), difficulty: 3 };
  // 研究进度播种：need 表前 260 件研究满 + 3 件半程（含 2326 buff 药未满）
  const need = JSON.parse(await (await fetch('/src/data/vanilla-research.json?raw')).text()).need;
  const ids = Object.keys(need).map(Number);
  let full = 0;
  for (const id of ids) {
    if (full < 260) { g.research.setSacrificeCountDirectly(id, need[id]); full++; }
    else break;
  }
  // 半程：挑 3 个未满 id（在 full 之外）
  const partials = ids.slice(260, 263);
  for (const id of partials) g.research.setSacrificeCountDirectly(id, Math.max(0, need[id] - 1));
  // newly 高亮验证：把 2326（在 full 段内）重新跨线
  // （setSacrificeCountDirectly 不产 newly——用 sacrifice 走 RegisterItemSacrifice 链：
  //  先清到 need-1 再 sacrifice 1）
  const probeId = ids[0];
  g.research.setSacrificeCountDirectly(probeId, need[probeId] - 1);
  g.research.sacrifice(probeId, 1);
  const m = await import('/src/ui/JourneyPowersUI.ts');
  m.openJourneyPowersPanel(g);
  return { seeded: full + partials.length, probeNewly: g.research.isNewlyResearched(probeId), probeId };
});
console.log('setup:', JSON.stringify(setup));
if (typeof setup !== 'object') { await browser.close(); process.exit(1); }

// 切到复制页（主条第 1 钮 = 复制）
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sw-jp-strip button')];
  btns[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 700));

const browserState = await page.evaluate(() => {
  const input = document.querySelector('.sw-jp-search input');
  const filters = [...document.querySelectorAll('.sw-jp-filters button')];
  const scroll = document.querySelector('.sw-jp-scroll');
  const spacer = document.querySelector('.sw-jp-spacer');
  const cells = [...document.querySelectorAll('.sw-jp-cell')];
  const partials = cells.filter(c => c.classList.contains('partial'));
  const news = cells.filter(c => c.classList.contains('new'));
  return {
    hasSearch: !!input, placeholder: input?.placeholder ?? '',
    filterCount: filters.length, filterLabels: filters.map(b => b.textContent),
    filterSelCount: filters.filter(b => b.classList.contains('sel')).length,
    scrollH: scroll?.clientHeight ?? 0, spacerH: parseFloat(spacer?.style.height ?? '0'),
    cellCount: cells.length, partialCount: partials.length, newCount: news.length,
    countLine: document.querySelector('.sw-jp-note')?.textContent ?? '',
    permGrid: !!document.querySelector('.sw-jp-perm-grid'),   // 单机无权限区
  };
});
console.log('browser:', JSON.stringify(browserState));

// 搜索过滤：输入仅匹配少数物品的词
const searchTest = await page.evaluate(async () => {
  const input = document.querySelector('.sw-jp-search input');
  input.value = '铁镐';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  const cells = [...document.querySelectorAll('.sw-jp-cell')];
  return { cells: cells.length, count: document.querySelector('.sw-jp-note')?.textContent ?? '',
    titles: cells.map(c => c.title) };
});
console.log('search-zh:', JSON.stringify(searchTest));
const searchEn = await page.evaluate(async () => {
  const input = document.querySelector('.sw-jp-search input');
  input.value = 'Torch';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  return { cells: document.querySelectorAll('.sw-jp-cell').length };
});
console.log('search-en:', JSON.stringify(searchEn));

// 清空 + 过滤器单选：点武器 → 计数变化；再点同钮 = 关闭
const filterTest = await page.evaluate(async () => {
  const input = document.querySelector('.sw-jp-search input');
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  const note = document.querySelector('.sw-jp-note');
  const before = note.textContent;
  const filters = [...document.querySelectorAll('.sw-jp-filters button')];
  filters[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));   // 武器
  await new Promise(r => setTimeout(r, 200));
  const afterWeapon = note.textContent;
  const sel1 = filters[0].classList.contains('sel');
  filters[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));   // 再点关闭
  await new Promise(r => setTimeout(r, 200));
  const closed = note.textContent;
  return { before, afterWeapon, sel1, closed };
});
console.log('filter:', JSON.stringify(filterTest));

// 取用：首个非 partial 格点击 → 背包 +1；shift → 整堆
const takeTest = await page.evaluate(() => {
  const g = window.__swGame;
  const before = g.player.inv.slots.reduce((n, s) => n + (s ? 1 : 0), 0);
  const cell = document.querySelector('.sw-jp-cell:not(.partial)');
  const title = cell.title;
  cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  const after1 = g.player.inv.slots.reduce((n, s) => n + (s ? 1 : 0), 0);
  cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true }));
  const held = g.player.inv.slots.find(s => s);
  return { before, after1, heldStack: held?.stack ?? 0, title };
});
console.log('take:', JSON.stringify(takeTest));

// 虚拟滚动：滚到底 → 首格变化且可见数受控
const scrollTest = await page.evaluate(async () => {
  const scroll = document.querySelector('.sw-jp-scroll');
  const input = document.querySelector('.sw-jp-search input');
  input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  const countAt = (sel) => document.querySelectorAll(sel).length;
  const top0 = [...document.querySelectorAll('.sw-jp-cell')].map(c => c.title)[0];
  scroll.scrollTop = scroll.scrollHeight;
  await new Promise(r => setTimeout(r, 300));
  const top1 = [...document.querySelectorAll('.sw-jp-cell')].map(c => c.title)[0];
  return {
    total: parseInt(document.querySelector('.sw-jp-spacer').style.height, 10) / 44,
    visible: countAt('.sw-jp-cell'),
    scrolled: scroll.scrollTop > 0, topChanged: top0 !== top1, top1,
  };
});
console.log('scroll:', JSON.stringify(scrollTest));
await page.screenshot({ path: '/tmp/journey-browser.png' });
await browser.close();
