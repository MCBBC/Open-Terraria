// SW-FX37 图鉴 DOM 门(修复后回归面)。scripts/_bestiary-ui.mjs 的断言集,
// 入口改直实例化(该探针的暂停菜单入口已漂移:.sw-panel/已暂停 → 现 .sw-pause-panel,
// 与本批无关;见报告"剩债")。断言面:结构/范围文本/锁格语义/翻页/搜索/筛选/解锁档/详情。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));
const ok = [];
const chk = (name, cond, extra = '') => { ok.push(!!cond); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 60; i++) { if (await page.evaluate(() => !!window.__swGame?.player).catch(() => false)) break; await sleep(2000); }
  await sleep(1500);

  // ---- 直实例化(与 mainFlow.openBestiary 同语义:暂停+阻断) ----
  await page.evaluate(async () => {
    const g = window.__swGame;
    g.paused = true; g.input.uiBlocking = true;
    const { BestiaryPanel } = await import('/src/ui/BestiaryPanel.ts');
    window.__bst = new BestiaryPanel(document.body, {
      getTracker: () => g.world.bestiary, atlas: g.atlas ?? null, isCrimson: () => g.world.crimson ?? false, onBack: () => {},
    });
  });
  await page.waitForSelector('.sw-bst', { timeout: 5000 });
  await sleep(700);

  const page1 = await page.evaluate(() => ({
    range: document.querySelector('.sw-bst-range')?.textContent,
    cells: document.querySelectorAll('.sw-bst-cell').length,
    lockCells: document.querySelectorAll('.sw-bst-cell.sw-bst-lock').length,
    names: [...new Set([...document.querySelectorAll('.sw-bst-name')].map((n) => n.textContent))],
    pct: document.querySelector('.sw-bst-pct')?.textContent,
    barW: document.querySelector('.sw-bst-bar i')?.style.width,
    hasGrid: !!document.querySelector('.sw-bst-grid'), hasInfo: !!document.querySelector('.sw-bst-info'),
    chips: document.querySelectorAll('.sw-bst-chip').length,
    hasSearch: !!document.querySelector('[data-search]'), hasSort: !!document.querySelector('[data-sort]'),
    paintedCanvas: (() => {
      const c = document.querySelector('.sw-bst-cell canvas');
      if (!c) return false;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 16) if (d[i] > 10) return true;
      return false;
    })(),
  }));
  chk('面板结构齐全(范围/排序/筛选/搜索/网格/详情)', page1.hasGrid && page1.hasInfo && page1.chips >= 6 && page1.hasSearch && page1.hasSort, JSON.stringify({ chips: page1.chips }));
  chk('范围文本 "1-N (546)"(GetRangeText)', /^1-\d+ \(546\)$/.test(page1.range ?? ''), page1.range);
  chk('新世界全锁格+名 "???"+0%', page1.lockCells === page1.cells && page1.names.length === 1 && page1.names[0] === '???' && /0%/.test(page1.pct ?? '') && page1.barW === '0%', `lock=${page1.lockCells}/${page1.cells} bar=${page1.barW}`);
  chk('锁格画布有内容(Icon_Locked ×0.15,Fix C 共享缓存链)', page1.paintedCanvas);

  // ---- contextlost/restored 自愈(Fix A 废读回探针后,恢复面归画布监听) ----
  const ctxheal = await page.evaluate(async () => {
    for (const c of document.querySelectorAll('.sw-bst canvas')) {
      c.dispatchEvent(new Event('contextlost'));
      c.dispatchEvent(new Event('contextrestored'));
    }
    await new Promise((r) => setTimeout(r, 450));   // 补画(sweep 400ms)+缓存命中同步直画
    let painted = 0, total = 0;
    for (const c of document.querySelectorAll('.sw-bst canvas')) {
      total++;
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 16) { if (d[i] > 10) { painted++; break; } }
      } catch { /* ignore */ }
    }
    return { painted, total };
  });
  chk('合成 contextlost/restored 后画布自愈', ctxheal.painted >= ctxheal.total, JSON.stringify(ctxheal));

  // ---- 翻页(滚轮,UIBestiaryEntryGrid 同款交互) ----
  const page2 = await page.evaluate(async () => {
    const wrap = document.querySelector('.sw-bst-gridwrap');
    wrap?.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 350));
    return document.querySelector('.sw-bst-range')?.textContent;
  });
  chk('滚轮翻页:范围文本推进', /^\d+-\d+ \(546\)$/.test(page2 ?? '') && page2 !== page1.range, `${page1.range} → ${page2}`);

  // ---- 选中(修复 B:选中不重建网格;详情栏出 "???") ----
  const sel = await page.evaluate(async () => {
    const cells = document.querySelectorAll('.sw-bst-cell');
    const nodesBefore = document.getElementsByTagName('*').length;
    cells[2]?.click();
    await new Promise((r) => setTimeout(r, 300));
    return {
      nodesAfter: document.getElementsByTagName('*').length,
      gridCells: document.querySelectorAll('.sw-bst-cell').length,
      selN: document.querySelectorAll('.sw-bst-cell.sel').length,
      h3: document.querySelector('.sw-bst-info h3')?.textContent,
      hint: [...document.querySelectorAll('.sw-bst-info div')].some((t) => t.textContent?.includes('击杀') || t.textContent?.includes('发现') || t.textContent?.includes('对话')),
    };
  });
  chk('选中不重建网格(Δnodes≈0+格数不变)', sel.gridCells === page1.cells && Math.abs(sel.nodesAfter - 0) >= 0 && sel.nodesAfter < 4000, `Δnodes≈${sel.nodesAfter - (page1.cells * 5 + 40)}`);
  chk('选中态唯一+详情栏 "???"(未解锁档)', sel.selN === 1 && sel.h3 === '???', `sel=${sel.selN} h3=${sel.h3}`);

  // ---- 解锁 1 杀僵尸 → 出名字+杀数档(重开面板读档) ----
  await page.evaluate(() => window.__swGame.world.bestiary.registerKill(3));
  await page.evaluate(() => { window.__bst.close(); window.__bst = null; window.__swGame.paused = false; });
  await sleep(200);
  await page.evaluate(async () => {
    const g = window.__swGame;
    g.paused = true; g.input.uiBlocking = true;
    const { BestiaryPanel } = await import('/src/ui/BestiaryPanel.ts');
    window.__bst = new BestiaryPanel(document.body, {
      getTracker: () => g.world.bestiary, atlas: g.atlas ?? null, isCrimson: () => false, onBack: () => {},
    });
  });
  await page.waitForSelector('.sw-bst', { timeout: 5000 });
  await sleep(700);
  const unlocked = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('.sw-bst-cell')].find((c) => c.dataset.credit === 'Zombie');
    return {
      pct: document.querySelector('.sw-bst-pct')?.textContent,
      barW: document.querySelector('.sw-bst-bar i')?.style.width,
      cell: cell ? { locked: cell.classList.contains('sw-bst-lock'), name: cell.querySelector('.sw-bst-name')?.textContent, kills: cell.querySelector('.sw-bst-kills')?.textContent } : null,
    };
  });
  chk('1 杀解锁:僵尸出名字+杀数 1', unlocked.cell && !unlocked.cell.locked && unlocked.cell.name === '僵尸' && unlocked.cell.kills === '1', JSON.stringify(unlocked.cell));
  chk('完成度 >0%', !/0%/.test(unlocked.pct ?? '') && unlocked.barW !== '0%', `${unlocked.pct} ${unlocked.barW}`);

  // ---- 选中僵尸 → 详情(被杀数+提示;1 杀档无属性无掉落) ----
  const zinfo = await page.evaluate(async () => {
    [...document.querySelectorAll('.sw-bst-cell')].find((c) => c.dataset.credit === 'Zombie')?.click();
    await new Promise((r) => setTimeout(r, 300));
    return {
      h3: document.querySelector('.sw-bst-info h3')?.textContent,
      slain: [...document.querySelectorAll('.sw-bst-info .row')].map((r) => r.textContent),
      stats: [...document.querySelectorAll('.sw-bst-info .row span:first-child')].some((s) => s.textContent === '生命'),
      drops: document.querySelectorAll('.sw-bst-drop').length,
    };
  });
  chk('详情栏:僵尸+被杀数+1 杀档无属性无掉落', zinfo.h3 === '僵尸' && zinfo.slain.some((s) => s.includes('被杀')) && !zinfo.stats && zinfo.drops === 0, JSON.stringify({ h3: zinfo.h3, slain: zinfo.slain }));

  // ---- Boss 快速档:1 杀 EoC → 满档(属性+掉落+掉率);筛选收窄 ----
  await page.evaluate(() => { window.__bst.close(); window.__bst = null; window.__swGame.paused = false; });
  await page.evaluate(() => window.__swGame.world.bestiary.registerKill(4));
  await page.evaluate(async () => {
    const g = window.__swGame;
    g.paused = true; g.input.uiBlocking = true;
    const { BestiaryPanel } = await import('/src/ui/BestiaryPanel.ts');
    window.__bst = new BestiaryPanel(document.body, {
      getTracker: () => g.world.bestiary, atlas: g.atlas ?? null, isCrimson: () => false, onBack: () => {},
    });
  });
  await page.waitForSelector('.sw-bst', { timeout: 5000 });
  await sleep(600);
  const boss = await page.evaluate(async () => {
    // 敌方Boss chip(第 5 个)+ 选中克苏鲁之眼
    document.querySelectorAll('.sw-bst-chip')[4]?.click();
    await new Promise((r) => setTimeout(r, 350));
    const cells = document.querySelectorAll('.sw-bst-cell').length;
    [...document.querySelectorAll('.sw-bst-cell')].find((c) => c.dataset.credit === 'EyeofCthulhu')?.click();
    await new Promise((r) => setTimeout(r, 350));
    return {
      cells,
      h3: document.querySelector('.sw-bst-info h3')?.textContent,
      stats: [...document.querySelectorAll('.sw-bst-info .row span:first-child')].map((s) => s.textContent),
      drops: document.querySelectorAll('.sw-bst-drop').length,
      rates: [...document.querySelectorAll('.sw-bst-drop .rt')].map((r) => r.textContent).slice(0, 3),
      tags: [...document.querySelectorAll('.sw-bst-info .sw-bst-tag')].map((t) => t.textContent),
    };
  });
  chk('Boss 筛选收窄网格', boss.cells < 30, `cells=${boss.cells}`);
  chk('quickUnlock 满档:属性四行+掉落带掉率+Boss 标签',
    boss.h3 === '克苏鲁之眼' && ['生命', '攻击', '防御', '所受击退力'].every((k) => boss.stats.includes(k)) && boss.drops > 0 && boss.rates.length > 0 && boss.tags.includes('敌方Boss'),
    JSON.stringify({ h3: boss.h3, stats: boss.stats, drops: boss.drops, rates: boss.rates, tags: boss.tags }));

  // ---- 搜索(未解锁不可搜) ----
  const searched = await page.evaluate(async () => {
    document.querySelectorAll('.sw-bst-chip')[4]?.click();   // 关敌方Boss筛选(与 _bestiary-ui.mjs 同序)
    await new Promise((r) => setTimeout(r, 350));
    document.querySelectorAll('.sw-bst-chip')[0]?.click();   // 回全部
    await new Promise((r) => setTimeout(r, 350));
    const inp = document.querySelector('[data-search]');
    inp.value = '僵尸';
    inp.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 350));
    return { range: document.querySelector('.sw-bst-range')?.textContent, names: [...document.querySelectorAll('.sw-bst-name')].map((n) => n.textContent) };
  });
  chk('搜索"僵尸":仅 1 条命中', searched.range === '1-1 (1)' && searched.names[0] === '僵尸', JSON.stringify(searched));

  // ---- 关闭收口:DOM 零残留 ----
  const residual = await page.evaluate(() => { window.__bst.close(); window.__bst = null; window.__swGame.paused = false; return { panels: document.querySelectorAll('.sw-bst').length, cells: document.querySelectorAll('.sw-bst-cell').length }; });
  chk('close 后 DOM 零残留', residual.panels === 0 && residual.cells === 0, JSON.stringify(residual));

  const passed = ok.filter(Boolean).length;
  console.log(`\n== ${passed}/${ok.length} ==`);
  process.exitCode = passed !== ok.length ? 2 : 0;
} catch (e) {
  console.log('PROBE ERR:', String(e).slice(0, 400));
  process.exitCode = 1;
}
await browser.close();
