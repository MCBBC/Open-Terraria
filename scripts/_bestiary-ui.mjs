// 图鉴 UI 面板探针（BestiaryPanel DOM 结构/分页/解锁档/入口接线）。
// 运行：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bestiary-ui.mjs
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

try {
  await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__swGame?.player, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1500));

  // ---- 入口 1：暂停菜单 图鉴 按钮 ----
  await page.keyboard.press('Escape');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.sw-panel')].some((p) => p.textContent?.includes('已暂停')), { timeout: 5000 });
  const pauseBtn = await page.evaluate(() => {
    const pause = [...document.querySelectorAll('.sw-panel')].find((p) => p.textContent?.includes('已暂停'));
    return [...pause.querySelectorAll('button')].some((b) => b.textContent === '图鉴');
  });
  chk('暂停菜单含图鉴按钮', pauseBtn);
  await page.evaluate(() => {
    const pause = [...document.querySelectorAll('.sw-panel')].find((p) => p.textContent?.includes('已暂停'));
    [...pause.querySelectorAll('button')].find((b) => b.textContent === '图鉴')?.click();
  });
  await page.waitForSelector('.sw-bst', { timeout: 5000 });

  // ---- 面板结构（UIBestiaryTest：顶栏/网格/详情/进度条）----
  const structure = await page.evaluate(() => ({
    hasRange: !!document.querySelector('.sw-bst-range'),
    hasSort: !!document.querySelector('[data-sort]'),
    chips: document.querySelectorAll('.sw-bst-chip').length,
    hasSearch: !!document.querySelector('[data-search]'),
    hasGrid: !!document.querySelector('.sw-bst-grid'),
    hasInfo: !!document.querySelector('.sw-bst-info'),
    hasBar: !!document.querySelector('.sw-bst-bar i'),
  }));
  chk('面板结构齐全（范围/排序/筛选chip/搜索/网格/详情/进度条）',
    structure.hasRange && structure.hasSort && structure.chips >= 6 && structure.hasSearch
    && structure.hasGrid && structure.hasInfo && structure.hasBar,
    JSON.stringify(structure));

  // ---- 全量 546 条：范围文本与分页 ----
  const page1 = await page.evaluate(() => ({
    range: document.querySelector('.sw-bst-range')?.textContent,
    cells: document.querySelectorAll('.sw-bst-cell').length,
    cols: document.querySelector('.sw-bst-grid')?.style.gridTemplateColumns || '',
    perPageFromSize: (() => {
      const w = document.querySelector('.sw-bst-gridwrap')?.clientWidth ?? 0;
      const h = document.querySelector('.sw-bst-gridwrap')?.clientHeight ?? 0;
      return Math.max(1, Math.floor(w / 72)) * Math.max(1, Math.floor(h / 72));
    })(),
  }));
  chk('范围文本 "1-N (546)"（GetRangeText 格式）', /^1-\d+ \(546\)$/.test(page1.range ?? ''), page1.range);
  chk('网格单元数 = 容器尺寸/72（GetEntriesToShow）',
    page1.cells === page1.perPageFromSize,
    `cells=${page1.cells} perPage=${page1.perPageFromSize} cols=${page1.cols}`);

  // ---- 新世界全未解锁：全部剪影 + ??? + 0% ----
  const locked = await page.evaluate(() => ({
    lockCells: document.querySelectorAll('.sw-bst-cell.sw-bst-lock').length,
    names: [...new Set([...document.querySelectorAll('.sw-bst-name')].map((n) => n.textContent))],
    pct: document.querySelector('.sw-bst-pct')?.textContent,
    barW: document.querySelector('.sw-bst-bar i')?.style.width,
  }));
  chk('未遇条目全剪影且名 "???"', locked.lockCells === page1.cells && locked.names.length === 1 && locked.names[0] === '???',
    `lock=${locked.lockCells}/${page1.cells} names=${JSON.stringify(locked.names)}`);
  chk('完成度 0%（已收集0%）', /0%/.test(locked.pct ?? '') && locked.barW === '0%', `${locked.pct} ${locked.barW}`);

  // ---- 翻页：范围文本推进（OffsetLibraryByPages）----
  await page.evaluate(() => document.querySelectorAll('.sw-bst-nav')[1]?.click());
  const page2 = await page.evaluate(() => document.querySelector('.sw-bst-range')?.textContent);
  chk('翻页后范围文本推进', /^\d+-\d+ \(546\)$/.test(page2 ?? '') && page2 !== page1.range, `${page1.range} → ${page2}`);

  // ---- 关闭（Esc）→ 记 1 杀 → 重开：解锁档显示 ----
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.sw-bst'), { timeout: 5000 });
  chk('Esc 关闭面板', true);
  await page.evaluate(() => window.__swGame.world.bestiary.registerKill(3));
  await page.evaluate(() => {
    const pause = [...document.querySelectorAll('.sw-panel')].find((p) => p.textContent?.includes('已暂停'));
    [...pause.querySelectorAll('button')].find((b) => b.textContent === '图鉴')?.click();
  });
  await page.waitForSelector('.sw-bst', { timeout: 5000 });
  const unlocked = await page.evaluate(() => {
    const pct = document.querySelector('.sw-bst-pct')?.textContent;
    const cell = [...document.querySelectorAll('.sw-bst-cell')].find((c) => c.dataset.credit === 'Zombie');
    return {
      pct, barW: document.querySelector('.sw-bst-bar i')?.style.width,
      cell: cell ? {
        locked: cell.classList.contains('sw-bst-lock'),
        name: cell.querySelector('.sw-bst-name')?.textContent,
        kills: cell.querySelector('.sw-bst-kills')?.textContent,
      } : null,
    };
  });
  chk('1 杀解锁：僵尸出名字+杀数档', unlocked.cell && !unlocked.cell.locked && unlocked.cell.name === '僵尸' && unlocked.cell.kills === '1',
    JSON.stringify(unlocked.cell));
  chk('完成度 >0% 且进度条推进', !/0%/.test(unlocked.pct ?? '') && unlocked.barW !== '0%', `${unlocked.pct} ${unlocked.barW}`);

  // ---- 条目卡点击 → 详情栏（名字/杀数/未到档提示；PortraitOnly 无属性无掉落）----
  await page.evaluate(() =>
    document.querySelector('.sw-bst-cell[data-credit="Zombie"]')?.click());
  const info = await page.evaluate(() => ({
    h3: document.querySelector('.sw-bst-info h3')?.textContent,
    slain: [...document.querySelectorAll('.sw-bst-info .row')].map((r) => r.textContent),
    hint: [...document.querySelectorAll('.sw-bst-info div')].map((d) => d.textContent).find((t) => t?.includes('继续击杀')),
    hasStats: [...document.querySelectorAll('.sw-bst-info .row span:first-child')].some((s) => s.textContent === '生命'),
    drops: [...document.querySelectorAll('.sw-bst-drop')].length,
    tagBoss: [...document.querySelectorAll('.sw-bst-tag')].map((t) => t.textContent),
  }));
  chk('详情栏：名字+被杀数+继续击杀提示（1 杀档无属性无掉落）',
    info.h3 === '僵尸' && info.slain.some((s) => s.includes('被杀')) && !!info.hint && !info.hasStats && info.drops === 0,
    JSON.stringify({ h3: info.h3, slain: info.slain, hint: info.hint }));

  // ---- Boss 快速档：杀 1 只 EoC → 满档（属性+掉落+掉率）----
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.sw-bst'), { timeout: 5000 });
  await page.evaluate(() => window.__swGame.world.bestiary.registerKill(4));
  await page.evaluate(() => {
    const pause = [...document.querySelectorAll('.sw-panel')].find((p) => p.textContent?.includes('已暂停'));
    [...pause.querySelectorAll('button')].find((b) => b.textContent === '图鉴')?.click();
  });
  await page.waitForSelector('.sw-bst', { timeout: 5000 });
  await page.evaluate(() => document.querySelectorAll('.sw-bst-chip')[4]?.click()); // 敌方Boss 筛选
  const bossPage = await page.evaluate(() => ({
    range: document.querySelector('.sw-bst-range')?.textContent,
    cells: document.querySelectorAll('.sw-bst-cell').length,
  }));
  await page.evaluate(() => {
    const cell = [...document.querySelectorAll('.sw-bst-cell')].find((c) => c.dataset.credit === 'EyeofCthulhu');
    cell?.click();
  });
  const bossInfo = await page.evaluate(() => ({
    h3: document.querySelector('.sw-bst-info h3')?.textContent,
    stats: [...document.querySelectorAll('.sw-bst-info .row span:first-child')].map((s) => s.textContent),
    drops: document.querySelectorAll('.sw-bst-drop').length,
    rates: [...document.querySelectorAll('.sw-bst-drop .rt')].map((r) => r.textContent).slice(0, 3),
    tags: [...document.querySelectorAll('.sw-bst-info .sw-bst-tag')].map((t) => t.textContent),
  }));
  chk('Boss 筛选收窄网格', bossPage.cells < 30, `range=${bossPage.range} cells=${bossPage.cells}`);
  chk('quickUnlock 满档：属性四行+掉落带掉率+Boss 标签',
    bossInfo.h3 === '克苏鲁之眼' && ['生命', '攻击', '防御', '所受击退力'].every((k) => bossInfo.stats.includes(k))
    && bossInfo.drops > 0 && bossInfo.rates.length > 0 && bossInfo.tags.includes('敌方Boss'),
    JSON.stringify({ h3: bossInfo.h3, stats: bossInfo.stats, drops: bossInfo.drops, rates: bossInfo.rates, tags: bossInfo.tags }));

  // ---- 搜索（BySearch：未解锁不可搜）----
  await page.evaluate(() => {
    document.querySelectorAll('.sw-bst-chip')[4]?.click(); // 关掉敌方Boss筛选
    document.querySelectorAll('.sw-bst-chip')[0]?.click(); // 全部
    const inp = document.querySelector('[data-search]');
    inp.value = '僵尸';
    inp.dispatchEvent(new Event('input'));
  });
  const searched = await page.evaluate(() => ({
    range: document.querySelector('.sw-bst-range')?.textContent,
    names: [...document.querySelectorAll('.sw-bst-name')].map((n) => n.textContent),
  }));
  chk('搜索"僵尸"：仅 1 条命中（其余未解锁不可搜）',
    searched.range === '1-1 (1)' && searched.names[0] === '僵尸', JSON.stringify(searched));

  // ---- E 关闭 + 入口 2：背包面板图鉴按钮（BestiaryMenuButton 位）----
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => !document.querySelector('.sw-bst'), { timeout: 5000 });
  chk('E 关闭面板', true);
  await page.keyboard.press('KeyE'); // 开背包
  const invBtn = await page.evaluate(() => {
    const panel = document.querySelector('.sw-panel[style*="translate"]');
    return [...document.querySelectorAll('button')].filter((b) => b.textContent === '图鉴').length;
  });
  chk('背包面板含图鉴按钮', invBtn >= 1, `buttons=${invBtn}`);

  const passed = ok.filter(Boolean).length;
  console.log(`\n== ${passed}/${ok.length} ==`);
  if (passed !== ok.length) process.exitCode = 1;
} catch (e) {
  console.log('PROBE ERR:', String(e).slice(0, 500));
  process.exitCode = 1;
}
await browser.close();
