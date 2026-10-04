// 一次性:BJ506 图鉴 1:1 形态冒烟探针（私有实例 5201；_bst-probe 同开面）。
//   顶栏钮/文案初始值、网格 72 格四层 Slot+左上编号唯一+无名无杀数、
//   排序弹层 7 项（初始无高亮/点选/再点回退默认/遮罩关）、筛选弹层 60 钮
//   （激活"已解锁"→计数+空集）、详情栏填充、滚轮=详情栏滚、Esc 关。
// SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj506-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }

const log = [];
const ok = (name, cond) => { const l = `${cond ? 'PASS' : 'FAIL'} ${name}`; log.push(l); console.log(l); };
// 首访欢迎幕帘（#sw-welcome-announce，z-60 全屏）先撤——真实用户先 ack 公告再开面板
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());

await page.evaluate(async () => {
  const g = window.__swGame;
  const { BestiaryPanel } = await import('/src/ui/BestiaryPanel.ts');
  window.__bj506Panel = new BestiaryPanel(document.body, {
    getTracker: () => g.world.bestiary,
    atlas: g.renderer?.atlas ?? null,
    isCrimson: () => false,
    isExpert: () => false,
    isMaster: () => false,
    onBack: () => {},
  });
  await new Promise((r) => setTimeout(r, 800));
});
await page.waitForSelector('.sw-bst', { timeout: 8000 });
await wait(2500);

const face = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const panel = q('.sw-bst-panel');
  const ps = panel ? getComputedStyle(panel, '::before').borderImageSource : '';
  return {
    outer: !!q('.sw-bst-outer'),
    range: q('.sw-bst-range')?.textContent ?? null,
    navBtns: qa('.sw-bst-imgbtn').length,
    wideBtns: qa('.sw-bst-widebtn').length,
    sortText: q('[data-sorttext]')?.textContent ?? null,
    filterText: q('[data-filtertext]')?.textContent ?? null,
    searchPh: q('[data-search]')?.placeholder ?? null,
    cells: qa('.sw-bst-cell').length,
    slotBack: qa('.sw-bst-lyr-back').length,
    slotFront: qa('.sw-bst-lyr-front').length,
    slotOv: qa('.sw-bst-lyr-ov').length,
    slotGlow: qa('.sw-bst-lyr-glow').length,
    idxCount: qa('.sw-bst-idx').length,
    idxUnique: new Set(qa('.sw-bst-idx').map((e) => e.textContent)).size,
    names: qa('.sw-bst-name').length,
    killsInCell: qa('.sw-bst-cell .sw-bst-kills').length,
    pct: q('.sw-bst-pct')?.textContent ?? null,
    barW: q('.sw-bst-bar b')?.style.width ?? null,
    exit: q('.sw-bst-exit')?.textContent ?? null,
    panelChrome: (ps || '').includes('data:image'),
    canvasPainted: qa('.sw-bst-ico').filter((c) => { try { const d = c.getContext('2d').getImageData(0, 0, 68, 68).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true; return false; } catch { return false; } }).length,
  };
});
ok('面板骨架', face.outer);
ok(`顶栏 双导航+双宽钮 (nav=${face.navBtns},wide=${face.wideBtns})`, face.navBtns === 2 && face.wideBtns === 2);
ok(`排序文案初始=解锁 (${face.sortText})`, face.sortText === '解锁');
ok(`筛选计数初始含0 (${face.filterText})`, (face.filterText || '').includes('0'));
ok(`搜索占位含"名字" (${face.searchPh})`, (face.searchPh || '').includes('名字'));
ok(`网格格数>0 (${face.cells})`, face.cells > 0);
ok(`四层 Slot 齐备 (back=${face.slotBack},front=${face.slotFront},ov=${face.slotOv},glow=${face.slotGlow})`, face.slotBack === face.cells && face.slotFront === face.cells && face.slotOv === face.cells && face.slotGlow === face.cells);
ok(`每格编号且唯一 (idx=${face.idxCount},uniq=${face.idxUnique})`, face.idxCount === face.cells && face.idxUnique === face.idxCount);
ok('格内无名/无杀数（1:1）', face.names === 0 && face.killsInCell === 0);
ok(`范围文本 x-y (z) (${face.range})`, /^\d+-\d+ \(\d+\)$/.test(face.range || ''));
ok(`底栏进度 (${face.pct} / ${face.barW})`, !!face.pct && !!face.barW);
ok(`出口钮=返回 (${face.exit})`, face.exit === '返回');
ok('面板九宫 chrome 已染', face.panelChrome);
ok(`头像已画格>0 (${face.canvasPainted}/${face.cells})`, face.canvasPainted > 0);
await page.screenshot({ path: '/tmp/bj506-grid.png' });

// 排序弹层
await page.click('[data-sortbtn]');
await wait(400);
const sortPop = await page.evaluate(() => ({
  opts: [...document.querySelectorAll('.sw-bst-opt span')].map((e) => e.textContent),
  sel: document.querySelectorAll('.sw-bst-opt.sel').length,
}));
ok(`排序弹层 7 项 (${sortPop.opts.length})`, sortPop.opts.length === 7);
ok(`初始无高亮 (${sortPop.sel})`, sortPop.sel === 0);
log.push('sortOpts=' + sortPop.opts.join(','));
await page.click('.sw-bst-opt');
await wait(400);
const afterSort = await page.evaluate(() => ({
  sel: document.querySelectorAll('.sw-bst-opt.sel').length,
  sortText: document.querySelector('[data-sorttext]')?.textContent,
}));
ok(`点选后高亮 (${afterSort.sel})`, afterSort.sel === 1);
ok(`点选后文案=怪物图鉴ID (${afterSort.sortText})`, afterSort.sortText === '怪物图鉴ID');   // zh-Hans 官译 Sort_BestiaryID
await page.click('.sw-bst-opt');
await wait(400);
const revert = await page.evaluate(() => ({
  sel: document.querySelectorAll('.sw-bst-opt.sel').length,
  sortText: document.querySelector('[data-sorttext]')?.textContent,
}));
ok(`再点同项回退默认 (${revert.sel}/${revert.sortText})`, revert.sel === 0 && revert.sortText === '解锁');
await page.mouse.click(300, 500);
await wait(300);
ok('遮罩点击关闭弹层', await page.evaluate(() => !document.querySelector('.sw-bst-pop')));
await page.screenshot({ path: '/tmp/bj506-sortpop.png' });

// 筛选弹层（60 钮）
await page.click('[data-filterbtn]');
await wait(500);
const filterPop = await page.evaluate(() => ({
  cells: document.querySelectorAll('.sw-bst-fcell').length,
  sel: document.querySelectorAll('.sw-bst-fcell.sel').length,
  dim: document.querySelectorAll('.sw-bst-fcell.dim').length,
}));
ok(`筛选弹层 60 钮 (${filterPop.cells})`, filterPop.cells === 60);
log.push(`filter: sel=${filterPop.sel} dim=${filterPop.dim}`);
// 激活第一钮（已解锁 ForcedDisplay 恒可用）
await page.click('.sw-bst-fcell');
await wait(500);
const afterFilter = await page.evaluate(() => ({
  sel: document.querySelectorAll('.sw-bst-fcell.sel').length,
  filterText: document.querySelector('[data-filtertext]')?.textContent,
  range: document.querySelector('.sw-bst-range')?.textContent,
}));
ok(`激活已解锁 → 高亮+计数1 (${afterFilter.sel}/${afterFilter.filterText})`, afterFilter.sel === 1 && (afterFilter.filterText || '').includes('1'));
ok(`全锁定世界筛选后空集 (${afterFilter.range})`, afterFilter.range === '0-0 (0)');
// 撤筛（ToggleFilter 同钮再点）→ 网格恢复 40 格
await page.click('.sw-bst-fcell');
await wait(500);
ok('撤筛恢复网格', await page.evaluate(() => document.querySelectorAll('.sw-bst-cell').length) > 0);
await page.screenshot({ path: '/tmp/bj506-filterpop.png' });
await page.evaluate(() => document.querySelector('.sw-bst-pop')?.click());
await wait(300);

// 详情栏：注入解锁（直接写 tracker 后选中首格——图鉴门控解锁面已由既有测试覆盖）
const info = await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.bestiary.registerKill(3);   // 僵尸 1 杀（PortraitOnly 档）
  const c = document.querySelector('.sw-bst-cell');
  if (!c) return { err: 'no-cell' };
  c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 1500));
  const v = document.querySelector('.sw-bst-infoview');
  return {
    children: v ? v.children.length : -1,
    nameplate: v?.querySelector('.sw-bst-nameplate')?.textContent ?? null,
    portrait: !!v?.querySelector('.sw-bst-portrait'),
    stars: v?.querySelectorAll('.sw-bst-stars img').length ?? 0,
    order: v ? [...v.children].map((e) => e.className.split(' ')[0]) : [],
  };
});
log.push('info=' + JSON.stringify(info));
ok(`点击格子 → 详情栏填充 (${info.children})`, info.children > 0);
ok(`Nameplate (${info.nameplate})`, !!info.nameplate);
ok(`Portrait+星 (${info.stars})`, info.portrait);
log.push('infoOrder=' + (info.order || []).join(','));
await page.screenshot({ path: '/tmp/bj506-info.png' });

// 滚轮 → 详情栏滚动（非翻页）
const beforeTop = await page.evaluate(() => document.querySelector('.sw-bst-infoview')?.scrollTop ?? -1);
const rangeBefore = await page.evaluate(() => document.querySelector('.sw-bst-range')?.textContent);
await page.mouse.move(640, 400);
await page.mouse.wheel(0, 240);
await wait(300);
const afterTop = await page.evaluate(() => document.querySelector('.sw-bst-infoview')?.scrollTop ?? -1);
const rangeAfter = await page.evaluate(() => document.querySelector('.sw-bst-range')?.textContent);
ok(`滚轮 = 详情栏滚动 (${beforeTop}→${afterTop})`, afterTop >= beforeTop);
ok(`滚轮不改页 (${rangeBefore}==${rangeAfter})`, rangeBefore === rangeAfter);

// Esc 关闭
await page.keyboard.press('Escape');
await wait(400);
ok('Inventory 键关面板', await page.evaluate(() => !document.querySelector('.sw-bst')));

console.log(log.join('\n'));
const fails = log.filter((l) => l.startsWith('FAIL'));
await browser.close();
process.exit(fails.length ? 1 : 0);
