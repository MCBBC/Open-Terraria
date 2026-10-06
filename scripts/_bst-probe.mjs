// 一次性:图鉴面板回归探针（★BJ-C4-F6 2026-10-06 现役形态重写,原版门控回归后）
//   ① 未解锁条目点击 → 详情 "???"（NameplateInfoElement NotKnown 臂;无 .sw-bst-lock 类——
//      BJ506 起锁定=Icon_Locked×0.15 画进 ico,不泄轮廓）
//   ② 滚轮 = 详情栏滚动（UIBestiaryTest :850-854）——★BJ506 改判:原版无滚轮翻页,
//      旧「滚轮换页」期望退役;翻页只走 ◀▶ 钮（OffsetLibraryByPages）。滚动臂需
//      详情内容可溢出 → Boss 筛选后选中满档 EoC 再滚。
//   ③ 筛选弹层（[data-filterbtn] → .sw-bst-pop .sw-bst-fcell,BESTIARY_FILTER_DEFS 序）
//      boss 过滤收窄;可用性 = UpdateAvailability（无已解锁命中条目 → dim 且点击无效）
//   ④ 排序弹层 .sw-bst-opt（BESTIARY_SORT_OPTIONS 7 步）
// SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bst-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
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
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { BestiaryPanel } = await import('/src/ui/BestiaryPanel.ts');
  const panel = new BestiaryPanel(document.body, {
    getTracker: () => g.world.bestiary,
    atlas: g.renderer?.atlas ?? null,
    isCrimson: () => false,
    onBack: () => {},
  });
  await new Promise((r) => setTimeout(r, 600));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const cells = $$('.sw-bst-cell').length;
  const idxs = $$('.sw-bst-idx').length;
  const pct = $('.sw-bst-pct')?.textContent;
  const range0 = $('.sw-bst-range')?.textContent;
  // ① 点第一个格（新世界全未解锁）→ 详情标题应为 ???
  $('.sw-bst-cell')?.click();
  await new Promise((r) => setTimeout(r, 200));
  const lockedInfo = $('.sw-bst-nameplate')?.textContent ?? null;
  // ② 前置：解锁 Boss 快速档（1 杀 EoC=DropsWithRates）→ boss 筛选钮转可用（UpdateAvailability）
  g.world.bestiary.registerKill(4);
  $('[data-filterbtn]')?.click();
  await new Promise((r) => setTimeout(r, 150));
  const fcells = $$('.sw-bst-pop .sw-bst-fcell').length;
  const fcellsDim = $$('.sw-bst-pop .sw-bst-fcell.dim').length;
  const bossDim = $$('.sw-bst-pop .sw-bst-fcell')[1]?.classList.contains('dim') ?? null;
  // boss = BESTIARY_FILTER_DEFS[1]（unlocked/boss/rare/…注册序）
  $$('.sw-bst-pop .sw-bst-fcell')[1]?.click();
  await new Promise((r) => setTimeout(r, 150));
  $('[data-filterbtn]')?.click();               // 关弹层 → refresh
  await new Promise((r) => setTimeout(r, 250));
  const bossNarrow = {
    cells: $$('.sw-bst-cell').length,
    range: $('.sw-bst-range')?.textContent,
    hasEoc: $$('.sw-bst-cell').some((c) => c.dataset.credit === 'EyeofCthulhu'),
  };
  // 满档 EoC：详情真值（DropsWithRates → 属性非 ???、掉落带率）→ 详情可溢出
  $$('.sw-bst-cell').find((c) => c.dataset.credit === 'EyeofCthulhu')?.click();
  await new Promise((r) => setTimeout(r, 250));
  const eocInfo = {
    name: $('.sw-bst-nameplate')?.textContent ?? null,
    stats: $$('.sw-bst-stat span').map((s) => s.textContent),
    drops: $$('.sw-bst-drop .rt').map((r) => r.textContent),
  };
  // ③ 滚轮 = 详情栏滚动（scrollTop 推进,范围不动=不翻页;基线=滚前即时快照——
  //   筛选收窄已改写 range,与 range0 差异非滚轮所致）
  const info = $('.sw-bst-infoview');
  info.scrollTop = 0;
  const rangeBeforeWheel = $('.sw-bst-range')?.textContent;
  $('.sw-bst').dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 250));
  const infoScrolled = info.scrollTop;
  const rangeAfterWheel = $('.sw-bst-range')?.textContent;
  // ④ ▶ 钮翻页（OffsetLibraryByPages）——boss 筛选下收窄集分页（25>40? 否→边界:
  //   25 条单页放不下 40 → ▶ 空滚;先撤筛选回全集）
  $('[data-filterbtn]')?.click();
  await new Promise((r) => setTimeout(r, 150));
  $$('.sw-bst-pop .sw-bst-fcell')[1]?.click();   // 撤 boss 筛选（再点同项=取消,ClickOption :227-236）
  await new Promise((r) => setTimeout(r, 150));
  $('[data-filterbtn]')?.click();
  await new Promise((r) => setTimeout(r, 250));
  const rangeBeforePaging = $('.sw-bst-range')?.textContent;
  $('[data-nav="1"]')?.click();
  await new Promise((r) => setTimeout(r, 250));
  const rangePaged = $('.sw-bst-range')?.textContent;
  $('[data-nav="-1"]')?.click();
  await new Promise((r) => setTimeout(r, 250));
  // ⑤ 排序弹层（.sw-bst-opt 7 步;点 Alphabetical = options[1]）
  $('[data-sortbtn]')?.click();
  await new Promise((r) => setTimeout(r, 150));
  const opts = $$('.sw-bst-pop .sw-bst-opt').length;
  $$('.sw-bst-pop .sw-bst-opt')[1]?.click();
  await new Promise((r) => setTimeout(r, 250));
  const sortLabel = document.querySelector('[data-sorttext]')?.textContent;
  panel.close();
  return {
    cells, idxs, pct, range0, lockedInfo,
    fcells, fcellsDim, bossDim, bossNarrow, eocInfo,
    infoScrolled, rangeAfterWheel, wheelPaged: rangeAfterWheel !== rangeBeforeWheel,
    rangeBeforePaging, rangePaged,
    opts, sortLabel,
  };
});
console.log(JSON.stringify(out, null, 1));
const pass =
  out.lockedInfo === '???'
  && out.fcells >= 14 && out.bossDim === false
  && out.bossNarrow.cells > 0 && out.bossNarrow.cells < 30 && out.bossNarrow.hasEoc
  && out.eocInfo.name === '克苏鲁之眼'
  && out.eocInfo.stats.length >= 4 && out.eocInfo.stats.every((v) => v !== '???')
  && out.eocInfo.drops.length > 0 && out.eocInfo.drops.every((r) => !r.includes('???'))
  && out.infoScrolled > 0 && !out.wheelPaged
  && out.rangePaged !== out.rangeBeforePaging
  && out.opts === 7;
console.log(pass ? '\n== ALL PASS ==' : '\n== FAIL ==');
if (!pass) process.exitCode = 1;
await browser.close();
