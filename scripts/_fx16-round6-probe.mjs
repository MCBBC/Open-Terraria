// 反馈轮6验收探针(2026-09-13 刀16)——title 全清/自有气泡/hover 态/切换钮功能/成就卡对齐/设置钮字号
//  运行:SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_fx16-round6-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
  await sleep(800);

  // ---- 步1:材料+开包+显式 classic 网格控制+元素定位 ----
  const s1 = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ui = window.__swUI;
    const g = window.__swGame;
    document.getElementById('sw-welcome-announce')?.remove();
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('craftingGridControl', 'classic');   // 显式 classic(缺省 modern=FX41 对原版同相)
    const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
    const iidOf = (vid) => { const k = VANILLA_ITEM_KEY_BY_ID[vid]; return k !== undefined ? ITEM_BY_KEY[k] : undefined; };
    if (iidOf(9)) g.player.inv.add(iidOf(9), 99);    // Wood → 有配方可显
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await sleep(150);
    const vinv = document.querySelector('.sw-vinv');
    const rectOf = (elm) => {
      if (!elm) return null;
      const r = elm.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    const out = {};
    // ---- P1:vinv 域零原生 title ----
    out.titleEls = [...vinv.querySelectorAll('[title]')].filter((e) => e.title !== '').map((e) => ({ t: e.title.slice(0, 14), cls: (e.className || '').toString().slice(0, 20), bg: (e.style.backgroundImage || '').slice(0, 48) }));
    const tooltip = document.querySelector('.sw-tooltip') || ui.tooltip;
    out.tipElFound = !!tooltip;
    const sortBtn = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('UI_Sort'));
    out.sortFound = !!sortBtn;
    out.sortRect = rectOf(sortBtn);
    out.tabRect = rectOf(ui.vinvTabMisc);
    const togBtn = ui.vinvGridToggleImg ? ui.vinvGridToggleImg.parentElement : null;
    out.togFound = !!togBtn;
    out.togRect = rectOf(togBtn);
    out.gridHidden0 = ui.vinvCraftGridEl ? ui.vinvCraftGridEl.style.display === 'none' : null;
    // P4:附近箱钮按 DOM 查(craftNearbyToggleImg 字段只在 classic 侧登记)
    const nearEl = [...vinv.querySelectorAll('img')].find((i) => i.src.includes('UI_ChestCraft'));
    out.nearImg = !!nearEl;
    out.nearRect = rectOf(nearEl?.parentElement || nearEl);
    out.nearSrc0 = nearEl ? nearEl.src : null;
    out.cell0 = rectOf(ui.vinvCraftCellEls[0]?.el);
    out.focus0 = ui.vinvCraftFocusV;
    // P5:格顶行=槽 0(y=20)
    const slot0 = vinv.querySelector('.sw-slot[data-idx="0"][data-where="inv"]');
    out.slot0Top = slot0 ? slot0.getBoundingClientRect().top : null;
    out.advTop = ui.achAdvisorEl ? ui.achAdvisorEl.parentElement.getBoundingClientRect().top : null;
    // P6:设置钮 18px(样式属性序列化带空格,去空格匹配)
    out.settings18 = [...vinv.querySelectorAll('button')].some((b) =>
      (b.getAttribute('style') || '').replace(/\s/g, '').includes('font-size:18px')
      && (b.textContent === '设置' || b.textContent === 'Settings'));
    window.__probe = { tooltip, ui, nearEl };
    return out;
  });

  // ---- 步2:hover Sort ----
  let sortTip = null;
  if (s1.sortRect) {
    await page.mouse.move(s1.sortRect.x, s1.sortRect.y); await sleep(150);
    sortTip = await page.evaluate(() => {
      const { tooltip } = window.__probe;
      const sortBtn = [...document.querySelectorAll('.sw-vinv .vinv-btn')].find((b) => b.style.backgroundImage.includes('UI_Sort'));
      return { vis: tooltip.style.display === 'block', txt: tooltip.textContent.slice(0, 40), title: sortBtn.title };
    });
    await page.mouse.move(10, 600); await sleep(100);
  }
  const sortHidden = await page.evaluate(() => window.__probe.tooltip.style.display !== 'block');

  // ---- 步3:hover 页签 ----
  let tabTip = null;
  if (s1.tabRect) {
    await page.mouse.move(s1.tabRect.x, s1.tabRect.y); await sleep(150);
    tabTip = await page.evaluate(() => {
      const { tooltip } = window.__probe;
      return { vis: tooltip.style.display === 'block', txt: tooltip.textContent.slice(0, 30) };
    });
    await page.mouse.move(10, 600); await sleep(100);
  }

  // ---- 步4:切换钮功能(classic:左键翻转网格)+hover 气泡 ----
  let tog = null;
  if (s1.togRect) {
    await page.mouse.click(s1.togRect.x, s1.togRect.y); await sleep(250);
    const grid1 = await page.evaluate(() => ({ grid: window.__swUI.vinvPipsUseGrid, shown: window.__swUI.vinvCraftGridEl ? window.__swUI.vinvCraftGridEl.style.display !== 'none' : null }));
    await page.mouse.move(s1.togRect.x, s1.togRect.y); await sleep(150);
    const tip = await page.evaluate(() => {
      const { tooltip } = window.__probe;
      return { vis: tooltip.style.display === 'block', txt: tooltip.textContent.slice(0, 30) };
    });
    await page.mouse.click(s1.togRect.x, s1.togRect.y); await sleep(250);   // 翻回列表
    tog = await page.evaluate(() => ({ grid0: window.__swUI.vinvPipsUseGrid, cells: window.__swUI.vinvCraftCellEls.length }));
    tog.tip = tip; tog.grid1 = grid1.grid; tog.gridShown1 = grid1.shown;
  }

  // ---- 步5:附近箱钮 hover 帧 ----
  let near = null;
  if (s1.nearRect) {
    await page.mouse.move(s1.nearRect.x, s1.nearRect.y); await sleep(150);
    near = await page.evaluate(() => {
      const { tooltip, nearEl } = window.__probe;
      return { frameSwitched: /UI_ChestCraft_[13]\.png/.test(nearEl.src), tipVis: tooltip.style.display === 'block' };
    });
    await page.mouse.move(10, 600); await sleep(100);
    near.restored = await page.evaluate(() => /UI_ChestCraft_[02]\.png/.test(window.__probe.nearEl.src));
  }

  // ---- 步6:滚轮(格上/空白处)——focus0=0,下滚被钳 0,先上滚验 +2 再下滚回落 ----
  let wheel = null;
  if (s1.cell0) {
    await page.mouse.move(s1.cell0.x, s1.cell0.y);
    await page.mouse.wheel({ deltaY: -240 }); await sleep(200);
    const f1 = await page.evaluate(() => window.__swUI.vinvCraftFocusV);
    await page.mouse.move(600, 820);
    await page.mouse.wheel({ deltaY: 240 }); await sleep(200);
    const f2 = await page.evaluate(() => window.__swUI.vinvCraftFocusV);
    wheel = { cell: f1 - s1.focus0, blank: f2 - f1 };
  }

  const v = { ...s1, sortTip, sortHidden, tabTip, tog, near, wheel };
  console.log(JSON.stringify(v, null, 1));
  ok(s1.titleEls.length === 0, `P1 vinv 域零原生 title(残留=${s1.titleEls.length}: ${JSON.stringify(s1.titleEls).slice(0, 240)})`);
  ok(s1.tipElFound, 'P0 tooltip 元素存在');
  ok(s1.sortFound, 'P2a Sort 钮存在');
  if (s1.sortRect) {
    ok(sortTip.vis && (sortTip.txt || '').length > 0, `P2b Sort hover 显自有气泡("${sortTip.txt}")`);
    ok(sortTip.title === '', 'P2c Sort 无原生 title');
    ok(sortHidden, 'P2d 移出隐藏气泡');
  }
  if (s1.tabRect) ok(tabTip.vis && (tabTip.txt || '').length > 0, `P2e 页签 hover 显自有气泡("${tabTip.txt}")`);
  ok(v.tog, 'P3a 切换钮存在');
  if (v.tog) {
    ok(v.tog.grid1 === true && v.tog.gridShown1, 'P3b 左键翻转→网格视图显');
    ok(v.tog.tip.vis && (v.tog.tip.txt || '').length > 0, `P3c 切换钮 hover 气泡("${v.tog.tip.txt}")`);
    ok(v.tog.grid0 === false && v.tog.cells > 0, 'P3d 再点→回列表视图');
  }
  ok(s1.nearImg, 'P4a 附近箱钮存在');
  if (s1.nearRect) {
    ok(near.frameSwitched, 'P4b hover 帧切换');
    ok(near.tipVis, 'P4c hover 显气泡');
    ok(near.restored, 'P4d 移出帧还原');
  }
  ok(s1.slot0Top != null && s1.advTop != null && Math.abs(s1.slot0Top - s1.advTop) <= 2, `P5 成就卡顶对齐格顶(slot0=${s1.slot0Top?.toFixed(1)} adv=${s1.advTop?.toFixed(1)})`);
  ok(s1.settings18, 'P6 设置钮 18px');
  if (wheel) {
    ok(wheel.cell !== 0, `P7a 格上滚→焦点动(${wheel.cell})`);
    ok(wheel.blank !== 0, `P7b 空白处滚→焦点动(原版本相定谳 ${wheel.blank})`);
  }
  ok(errs.length === 0, `无页面错误(${errs.join(' | ')})`);
}
await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
