// 图鉴 UI 面板探针（BestiaryPanel DOM 结构/分页/解锁档/入口接线）。
// ★BJ-C4-F6（2026-10-06）现役形态重写：旧版选择器/流程停在 BJ506 大域对齐刀之前
// （.sw-bst-chip/.sw-bst-lock/.sw-bst-name/.sw-bst-nav/[data-sort]/.sw-bst-bar i/
//   .sw-bst-info h3/.row/sw-bst-tag/暂停菜单图鉴钮/滚轮换页——全数退役），本版对齐
//   现役形态（BJ506/BJ507 后）：
//   · 入口 = 背包顶栏图鉴书钮（暂停菜单图鉴钮 2026-09-14 已摘,UI.ts showPause 注）
//   · 排序/筛选 = 弹层（[data-sortbtn]/[data-filterbtn] → .sw-bst-pop .sw-bst-fcell/.sw-bst-opt）
//   · 网格格层 = .sw-bst-cell[data-credit]（绝对定位 72²）+ .sw-bst-idx 编号;未解锁
//     = Icon_Locked×0.15 画进 .sw-bst-ico（无 lock 类,不泄轮廓——R24/BJ506）
//   · 进度条 = .sw-bst-bar b（i 为壳）;完成度文案 = prettifyPercentDisplay（0 → "%"）
//   · 详情栏 = .sw-bst-nameplate/.sw-bst-kills/.sw-bst-stat（值在 span,标签在悬停
//     气泡)/.sw-bst-drop(.rt 掉率)/.sw-bst-cond——旧 h3/.row/tag 面拆除
//   · 滚轮 = 详情栏滚动（UIBestiaryTest :850-854,原版无滚轮翻页——翻页只走 ◀▶ 钮）
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bestiary-ui.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 400)));
const ok = [];
const chk = (name, cond, extra = '') => {
  ok.push(!!cond);
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 背包顶栏图鉴书钮（vanilla 布局 = UI.ts vinvBestiaryBtn:vinv-btn + 贴图
// UI_Bestiary.png,悬停名走 vinvBindHoverTip 无 title 属性;classic 布局 =
// bestiaryBtn title="图鉴"——双布局双定位器都认）。
// 图鉴=DOM 覆层不收背包（RB15d-②）——背包已开时直接点钮,未开先 E。
const findBstBtnSrc = `(() => [...document.querySelectorAll('button')].find((b) =>
  (b.style.backgroundImage || '').includes('UI_Bestiary.png')
  || b.title === '图鉴' || (b.title || '').includes('Bestiary')))()`;
const openBestiaryViaInv = async () => {
  const hasBtn = await page.evaluate(findBstBtnSrc);
  if (!hasBtn) { await page.keyboard.press('KeyE'); await sleep(600); }
  // 入口钮监听 mousedown（vinv-btn 惯例）——合成 .click() 不派发 mousedown,须显式派发
  await page.evaluate(`${findBstBtnSrc}?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
  await page.waitForSelector('.sw-bst', { timeout: 5000 });
  await sleep(200);                             // refresh rAF 合并拍
};
const closeBestiary = async () => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.sw-bst'), { timeout: 5000 });
};

try {
  await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  // 就绪轮询（_ach-entry 惯例）——waitForFunction 定时器在冷启动/资产首载下会伪超时
  let inGame = false;
  for (let i = 0; i < 150 && !inGame; i++) {
    inGame = await page.evaluate(() =>
      !!(window.__swGame?.player && window.__swGame?.renderer)).catch(() => false);
    if (!inGame) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!inGame) { console.error('未进游戏'); process.exit(1); }
  await new Promise((r) => setTimeout(r, 1500));

  // ---- 入口：背包顶栏图鉴书钮（BestiaryMenuButton 位,暂停菜单钮已摘）----
  await openBestiaryViaInv();

  // ---- 面板结构（UIBestiaryTest：顶栏/网格/详情/进度条）----
  const structure = await page.evaluate(() => ({
    hasRange: !!document.querySelector('.sw-bst-range'),
    hasSortBtn: !!document.querySelector('[data-sortbtn]'),
    hasFilterBtn: !!document.querySelector('[data-filterbtn]'),
    hasSearch: !!document.querySelector('[data-search]'),
    hasGrid: !!document.querySelector('.sw-bst-grid'),
    hasInfo: !!document.querySelector('.sw-bst-info'),
    hasBarFill: !!document.querySelector('.sw-bst-bar b'),
  }));
  chk('面板结构齐全（范围/排序钮/筛选钮/搜索/网格/详情/进度条）',
    structure.hasRange && structure.hasSortBtn && structure.hasFilterBtn && structure.hasSearch
    && structure.hasGrid && structure.hasInfo && structure.hasBarFill,
    JSON.stringify(structure));

  // ---- 全量 546 条：范围文本与分页（72² 格层 = gridwrap/72²）----
  const page1 = await page.evaluate(() => ({
    range: document.querySelector('.sw-bst-range')?.textContent,
    cells: document.querySelectorAll('.sw-bst-cell').length,
    idxs: document.querySelectorAll('.sw-bst-idx').length,
    perPageFromSize: (() => {
      const w = document.querySelector('.sw-bst-gridwrap')?.clientWidth ?? 0;
      const h = document.querySelector('.sw-bst-gridwrap')?.clientHeight ?? 0;
      return Math.max(1, Math.floor(w / 72)) * Math.max(1, Math.floor(h / 72));
    })(),
  }));
  chk('范围文本 "1-N (546)"（GetRangeText 格式）', /^1-\d+ \(546\)$/.test(page1.range ?? ''), page1.range);
  chk('网格单元数 = 容器尺寸/72²（GetEntriesToShow）且每格带编号',
    page1.cells === page1.perPageFromSize && page1.idxs === page1.cells,
    `cells=${page1.cells} perPage=${page1.perPageFromSize} idxs=${page1.idxs}`);

  // ---- 新世界全未解锁：无 lock 类（锁形图画进 ico）、进度 0、点格详情 "???" ----
  const locked = await page.evaluate(() => {
    const pctTxt = document.querySelector('.sw-bst-pct')?.textContent ?? '';
    return {
      pctTxt, barW: document.querySelector('.sw-bst-bar b')?.style.width,
      lockCls: document.querySelectorAll('.sw-bst-lock').length,      // 退役类=应为 0
      chips: document.querySelectorAll('.sw-bst-chip').length,        // 退役类=应为 0
    };
  });
  chk('退役类零残留（.sw-bst-lock/.sw-bst-chip）', locked.lockCls === 0 && locked.chips === 0,
    `lock=${locked.lockCls} chips=${locked.chips}`);
  chk('完成度 0%（prettifyPercentDisplay(0)="%" 习癖 + 条宽 0%）',
    locked.pctTxt.endsWith('%') && !/\d/.test(locked.pctTxt) && locked.barW === '0%',
    `${locked.pctTxt} ${locked.barW}`);
  await page.evaluate(() => document.querySelector('.sw-bst-cell')?.click());
  await sleep(200);
  const lockedInfo = await page.evaluate(() => ({
    name: document.querySelector('.sw-bst-nameplate')?.textContent,
    stats: [...document.querySelectorAll('.sw-bst-stat span')].map((s) => s.textContent),
  }));
  chk('未解锁条目点击 → 详情名 "???"（NameplateInfoElement NotKnown 臂）',
    lockedInfo.name === '???', JSON.stringify(lockedInfo));

  // ---- 翻页：▶ 钮推进范围文本（OffsetLibraryByPages;滚轮=详情滚动不翻页）----
  const rangeBefore = await page.evaluate(() => document.querySelector('.sw-bst-range')?.textContent);
  await page.evaluate(() => document.querySelector('[data-nav="1"]')?.click());
  await sleep(200);
  const page2 = await page.evaluate(() => ({
    range: document.querySelector('.sw-bst-range')?.textContent,
    infoTop: document.querySelector('.sw-bst-infoview')?.scrollTop ?? 0,
  }));
  chk('▶ 钮翻页后范围文本推进', /^\d+-\d+ \(546\)$/.test(page2.range ?? '') && page2.range !== rangeBefore,
    `${rangeBefore} → ${page2.range}`);
  await page.evaluate(() => document.querySelector('[data-nav="-1"]')?.click());
  await sleep(200);

  // ---- 关闭（Esc）→ 记 1 杀 → 重开：解锁档显示 ----
  await closeBestiary();
  chk('Esc 关闭面板', true);
  await page.evaluate(() => window.__swGame.world.bestiary.registerKill(3));   // 僵尸
  await openBestiaryViaInv();
  const unlocked = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('.sw-bst-cell')].find((c) => c.dataset.credit === 'Zombie');
    return {
      pct: document.querySelector('.sw-bst-pct')?.textContent,
      barW: document.querySelector('.sw-bst-bar b')?.style.width,
      cellFound: !!cell,
    };
  });
  chk('僵尸格在网格（data-credit 定位）', unlocked.cellFound);
  chk('完成度 >0% 且进度条推进', /\d/.test(unlocked.pct ?? '') && unlocked.barW !== '0%',
    `${unlocked.pct} ${unlocked.barW}`);
  await page.evaluate(() =>
    [...document.querySelectorAll('.sw-bst-cell')].find((c) => c.dataset.credit === 'Zombie')?.click());
  await sleep(200);
  const zInfo = await page.evaluate(() => ({
    name: document.querySelector('.sw-bst-nameplate')?.textContent,
    kills: document.querySelector('.sw-bst-kills span')?.textContent,
    stats: [...document.querySelectorAll('.sw-bst-stat span')].map((s) => s.textContent),
    drops: document.querySelectorAll('.sw-bst-drop').length,
  }));
  chk('1 杀僵尸：名字亮 + 击杀数 1（NPCKillCounterInfoElement）',
    zInfo.name === '僵尸' && zInfo.kills === '1', JSON.stringify(zInfo));
  chk('1 杀档（PortraitOnly）：属性全 "???" 无掉落（:125-129/:20-22）',
    zInfo.stats.length > 0 && zInfo.stats.every((v) => v === '???') && zInfo.drops === 0,
    JSON.stringify({ stats: zInfo.stats, drops: zInfo.drops }));

  // ---- Boss 快速档：杀 1 只 EoC → 满档（属性真值+掉落带掉率）----
  await closeBestiary();
  await page.evaluate(() => window.__swGame.world.bestiary.registerKill(4));   // 克苏鲁之眼
  await openBestiaryViaInv();
  // 筛选弹层：[data-filterbtn] → .sw-bst-pop .sw-bst-fcell（BESTIARY_FILTER_DEFS 序,
  // index 1 = boss 'BestiaryInfo.IsBoss'）
  await page.evaluate(() => document.querySelector('[data-filterbtn]')?.click());
  await sleep(150);
  const bossCells = await page.evaluate(() => ({
    fcells: document.querySelectorAll('.sw-bst-pop .sw-bst-fcell').length,
    dim: document.querySelectorAll('.sw-bst-pop .sw-bst-fcell.dim').length,
  }));
  chk('筛选弹层出格（Icon_Tags_Shadow 帧 30²,12/行）', bossCells.fcells >= 14, JSON.stringify(bossCells));
  await page.evaluate(() => {
    const fc = document.querySelectorAll('.sw-bst-pop .sw-bst-fcell')[1];   // defs[1]=boss
    fc?.click();
  });
  await sleep(150);
  await page.evaluate(() => document.querySelector('[data-filterbtn]')?.click());   // 关弹层→refresh
  await sleep(200);
  const bossPage = await page.evaluate(() => ({
    range: document.querySelector('.sw-bst-range')?.textContent,
    cells: document.querySelectorAll('.sw-bst-cell').length,
  }));
  chk('Boss 筛选收窄网格', bossPage.cells > 0 && bossPage.cells < 30,
    `range=${bossPage.range} cells=${bossPage.cells}`);
  await page.evaluate(() => {
    const cell = [...document.querySelectorAll('.sw-bst-cell')].find((c) => c.dataset.credit === 'EyeofCthulhu');
    cell?.click();
  });
  await sleep(200);
  const bossInfo = await page.evaluate(() => ({
    name: document.querySelector('.sw-bst-nameplate')?.textContent,
    stats: [...document.querySelectorAll('.sw-bst-stat span')].map((s) => s.textContent),
    drops: document.querySelectorAll('.sw-bst-drop').length,
    rates: [...document.querySelectorAll('.sw-bst-drop .rt')].map((r) => r.textContent).slice(0, 3),
  }));
  chk('quickUnlock 满档（Boss 1 杀=DropsWithRates）：属性真值四行',
    bossInfo.name === '克苏鲁之眼' && bossInfo.stats.length >= 4 && bossInfo.stats.every((v) => v !== '???'),
    JSON.stringify({ name: bossInfo.name, stats: bossInfo.stats }));
  chk('掉落带真掉率（DropsWithRates → dropRateText）',
    bossInfo.drops > 0 && bossInfo.rates.length > 0 && bossInfo.rates.every((r) => !r.includes('???')),
    JSON.stringify({ drops: bossInfo.drops, rates: bossInfo.rates }));

  // ---- 滚轮 = 详情栏滚动（UIBestiaryTest :850-854），范围不动（满档 EoC 详情可溢出）----
  const wheel = await page.evaluate(async () => {
    const panel = document.querySelector('.sw-bst');
    const info = document.querySelector('.sw-bst-infoview');
    const range0 = document.querySelector('.sw-bst-range')?.textContent;
    info.scrollTop = 0;
    panel.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 150));
    return { range1: document.querySelector('.sw-bst-range')?.textContent, scrolled: info.scrollTop };
  });
  chk('滚轮=详情栏滚动且范围不动（原版无滚轮翻页,BJ506 改判）',
    wheel.range1 === bossPage.range && wheel.scrolled > 0, JSON.stringify(wheel));

  // ---- 撤 Boss 筛选（再点同项=取消,ClickOption :227-236）→ 回全集 ----
  await page.evaluate(() => document.querySelector('[data-filterbtn]')?.click());
  await sleep(150);
  await page.evaluate(() => {
    const fc = document.querySelectorAll('.sw-bst-pop .sw-bst-fcell')[1];
    fc?.click();
  });
  await sleep(150);
  await page.evaluate(() => document.querySelector('[data-filterbtn]')?.click());
  await sleep(200);
  const fullRange = await page.evaluate(() => ({
    range: document.querySelector('.sw-bst-range')?.textContent,
    cells: document.querySelectorAll('.sw-bst-cell').length,
  }));
  chk('撤 Boss 筛选回全集（0-56 页窗/56 格）', fullRange.cells === page1.cells, JSON.stringify(fullRange));

  // ---- 搜索（BySearch：未解锁不可搜）----
  await page.evaluate(() => {
    const inp = document.querySelector('[data-search]');
    inp.value = '僵尸';
    inp.dispatchEvent(new Event('input'));
  });
  await sleep(200);
  const searched = await page.evaluate(() => ({
    range: document.querySelector('.sw-bst-range')?.textContent,
    cells: document.querySelectorAll('.sw-bst-cell').length,
  }));
  chk('搜索"僵尸"：仅 1 条命中（其余未解锁不可搜）',
    searched.range === '1-1 (1)' && searched.cells === 1, JSON.stringify(searched));

  // ---- 关面板回背包（图鉴覆层不收背包=背包仍开,入口钮在）→ E 收背包 ----
  await closeBestiary();
  await sleep(200);
  const invBtn = await page.evaluate(() => {
    const findBstBtn = () =>
      [...document.querySelectorAll('button')].find((b) =>
        (b.style.backgroundImage || '').includes('UI_Bestiary.png')
        || b.title === '图鉴' || (b.title || '').includes('Bestiary'));
    return findBstBtn() ? 1 : 0;
  });
  chk('背包面板含图鉴书钮（BestiaryMenuButton 位）', invBtn >= 1, `buttons=${invBtn}`);
  await page.keyboard.press('KeyE');            // 收背包（尾态复位）

  const passed = ok.filter(Boolean).length;
  console.log(`\n== ${passed}/${ok.length} ==`);
  if (passed !== ok.length) process.exitCode = 1;
} catch (e) {
  console.log('PROBE ERR:', String(e).slice(0, 500));
  process.exitCode = 1;
}
await browser.close();
