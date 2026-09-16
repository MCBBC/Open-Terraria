// FX41b 合并后两遗留「修后验证」探针(2026-09-16):
//   缺陷1 材料格双层计数 —— 断言:需求数(ctx43 抬格 left5/bottom7,墨底 45u)格内;
//         拥有数 (3,32)·num = 槽底缘下带;两计数 rect 不相交(0.5px 原版堆叠缝);
//         num<1 多材料支同相。缺陷2 搜索输入 —— 断言:🔍 钮/直点/盒体衬域三路聚焦,
//         键入 'a'/'b' 落 value 且配方过滤触发(OnSearchContentsChanged 链)。
// 运行:SW_ORIGIN=http://localhost:5249 node tools/run-diag.mjs scripts/_fx48b-modern-verify.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5249';
const fails = [];
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(600);
await page.evaluate(() => {
  document.getElementById('sw-welcome-announce')?.remove();
  window.__swUI.closeInventory();
});
await sleep(200);

// ---- 开 modern 窗 + 给料 ----
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  ui.openInventory(true);
  await ui.refreshAllAsync();
  const wid = g.itemId('vi_9_Wood');
  if (wid > 0) g.player.inv.add(wid, 300);
  await ui.refreshAllAsync();
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(300);
});
await page.waitForFunction(() => window.__swUI.vinvModernCraftOpen === true, { timeout: 15000, polling: 120 });
await sleep(400);

// ---- 强制选中「材料 stack>1」配方(工作台 10 木;不在池则报警) ----
await page.evaluate(() => {
  const ui = window.__swUI;
  const hit = ui.vinvModernEntries.find((e) => (e.r.items?.[0]?.stack ?? 1) > 1);
  window.__fx48bStacky = hit ?? null;
  if (hit) { ui.vinvModernSelected = hit.r; ui.vinvUpdateModernDetail(ui.vinvModernEntries); }
});

// ============================================================ 缺陷1:两计数几何
{
  const M = await page.evaluate(() => {
    const ui = window.__swUI;
    const detail = ui.vinvModernDetailEl;
    if (!detail || detail.style.display === 'none' || !window.__fx48bStacky) return { ready: false };
    const box = detail.querySelector('.sw-slot:nth-of-type(1)') ? null : null;
    // 材料格 = detail.children 中第 3 个起(0 成品槽/1 锤/2 材料格)
    const kids = [...detail.children];
    const matBox = kids.find((c) => c.classList.contains('sw-slot') && kids.indexOf(c) >= 2);
    const span = matBox ? matBox.querySelector('.cnt') : null;
    const green = kids.find((c) => {
      const col = getComputedStyle(c).color;
      return c.tagName === 'DIV' && !c.className && (col.includes('144, 238, 144') || col.includes('255, 140, 160'));
    });
    const rb = (el2) => { const r = el2.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const mc = window.__fx48bStacky.r;
    return {
      ready: true, n: kids.length,
      stack: mc.items?.[0]?.stack ?? null, matCount: mc.items?.length ?? null,
      spanStyle: span ? { left: span.style.left, bottom: span.style.bottom } : null,
      greenStyle: green ? (green.getAttribute('style') || '') : null,
      greenText: green ? green.textContent : null,
      box: matBox ? rb(matBox) : null, span: span ? rb(span) : null, green: green ? rb(green) : null,
      scale: matBox ? getComputedStyle(matBox).transform : null,
    };
  });
  ok(M.ready && M.span && M.green && M.box, 'V1 选中 stack>1 配方 → 白需求数+绿拥有数同现', `ready=${M.ready} stack=${M.stack} span=${!!M.span} green=${!!M.green}`);
  if (M.ready && M.span && M.green && M.box) {
    ok(M.spanStyle?.left === '5px' && M.spanStyle?.bottom === '7px', 'V2 需求数 ctx43 抬格 = left5/bottom7(ItemSlot.cs:2683-2691)', JSON.stringify(M.spanStyle));
    const num = 1; // 2 材料内 num=1(工作台单料)
    const expGx = M.box.x + 3 * num, expGy = M.box.y + 32 * num;
    ok(Math.abs(M.green.x - expGx) <= 1.2 && Math.abs(M.green.y - expGy) <= 1.2, 'V3 拥有数 = 槽+(3,32)·num(格底缘下带,:556 mscale=num)', `got=(${M.green.x},${M.green.y}) exp=(${expGx},${expGy})`);
    const ix = Math.max(0, Math.min(M.span.x + M.span.w, M.green.x + M.green.w) - Math.max(M.span.x, M.green.x));
    const iy = Math.max(0, Math.min(M.span.b, M.green.y + M.green.h) - Math.max(M.span.y, M.green.y));
    ok(ix * iy < 0.5, 'V4 两计数 rect 不相交(0.5px 原版堆叠缝)', `area=${(ix * iy).toFixed(2)}px² white.b=${M.span.b} green.t=${M.green.y}`);
    const expSpanB = M.box.y + 45 * 0.7;
    ok(Math.abs(M.span.b - expSpanB) <= 1.2, 'V5 需求数墨底 = 45/52u·0.7(格内下带;原版白字位)', `got=${M.span.b} exp=${expSpanB.toFixed(1)}`);
    const greenBelowSlot = M.green.y >= M.box.y + 52 * 0.7 - 6;
    ok(greenBelowSlot, 'V6 拥有数起笔于槽底缘带(视觉=格下方)', `green.t=${M.green.y} slot.b=${(M.box.y + 52 * 0.7).toFixed(1)}`);
  }
}

// ============================================================ 缺陷2:三路聚焦+键入+过滤
{
  const input = await page.evaluate(() => {
    const ui = window.__swUI;
    const input = ui.vinvModernSearchInput;
    const row = ui.vinvModernSearchRowEl;
    if (!input || !row || !input.isConnected) return { has: false };
    const r = input.getBoundingClientRect();
    const box = row.children[1];
    const br = box.getBoundingClientRect();
    const btn = row.querySelector('button');
    const btnR = btn.getBoundingClientRect();
    return {
      has: true, inDom: input.isConnected,
      ix: r.x + Math.min(40, r.width / 2), iy: r.y + r.height / 2,
      bx: br.x + br.width - 14, by: br.y + br.height / 2,   // 盒体右衬域(✕ 左侧避让)
      btnX: btnR.x + btnR.width / 2, btnY: btnR.y + btnR.height / 2,
      entriesBefore: ui.vinvModernEntries.length,
    };
  });
  ok(input.has && input.inDom, 'V7 input 引用活(重建路径零死引用)', `inDom=${input.inDom}`);
  if (input.has) {
    // 路径①🔍 钮
    await page.mouse.click(input.btnX, input.btnY);
    await sleep(120);
    const f1 = await page.evaluate(() => document.activeElement === window.__swUI.vinvModernSearchInput);
    ok(f1, 'V8 🔍 钮 mousedown → 焦点落 input(preventDefault 压 button 缺省抢焦)', `ae=${await page.evaluate(() => document.activeElement?.tagName)}`);
    await page.keyboard.type('a', { delay: 25 });
    await sleep(220);
    const t1 = await page.evaluate(() => ({ v: window.__swUI.vinvModernSearchInput?.value, s: window.__swUI.vinvModernSearch, n: window.__swUI.vinvModernEntries.length }));
    ok(t1.v === 'a', 'V9 🔍 聚焦后键入 a → value="a"', `value=${JSON.stringify(t1.v)}`);
    ok(t1.s === 'a' && t1.n !== input.entriesBefore, 'V10 字符触发配方过滤(OnSearchContentsChanged 链)', `search=${t1.s} entries ${input.entriesBefore}→${t1.n}`);
    // 路径②✕ 钮(原版冒泡 Click_SearchArea 域:UIWrappedSearchBar.cs:136/:151)
    await page.evaluate(() => { const ui = window.__swUI; ui.vinvModernSearchInput.value = ''; ui.vinvModernSearchInput.blur(); ui.vinvModernSearch = ''; ui.vinvModernResetRecipes(); ui.vinvUpdateModernCraft(); });
    await sleep(150);
    await page.mouse.click(input.bx, input.by);
    await sleep(120);
    const f2 = await page.evaluate(() => document.activeElement === window.__swUI.vinvModernSearchInput);
    ok(f2, 'V11 ✕ 钮点击 → 焦点落 input(冒泡 Click_SearchArea 等价面)', `ae=${await page.evaluate(() => document.activeElement?.tagName)}`);
    // 路径③直点 input
    await page.evaluate(() => { window.__swUI.vinvModernSearchInput.blur(); });
    await sleep(80);
    await page.mouse.click(input.ix, input.iy);
    await sleep(120);
    const f3 = await page.evaluate(() => document.activeElement === window.__swUI.vinvModernSearchInput);
    ok(f3, 'V12 直点 input → 聚焦(无覆盖层/无焦点抢占回归)', `ae=${await page.evaluate(() => document.activeElement?.tagName)}`);
    await page.keyboard.type('b', { delay: 25 });
    await sleep(200);
    const t2 = await page.evaluate(() => ({ v: window.__swUI.vinvModernSearchInput?.value, s: window.__swUI.vinvModernSearch, n: window.__swUI.vinvModernEntries.length }));
    ok(t2.v === 'b' && t2.s === 'b', 'V13 直点后键入 b → value="b" 且搜索域同步', JSON.stringify(t2));
    // 复原
    await page.evaluate(() => { const ui = window.__swUI; ui.vinvModernSearchInput.value = ''; ui.vinvModernSearch = ''; ui.vinvModernResetRecipes(); ui.vinvUpdateModernCraft(); });
  }
  // 恢复预选面(截图 = 常规选中态)
  await page.evaluate(() => {
    const ui = window.__swUI;
    ui.vinvModernSelected = ui.vinvModernEntries[0]?.r ?? null;
    ui.vinvUpdateModernDetail(ui.vinvModernEntries);
  });
  await sleep(150);
}

await page.screenshot({ path: '/tmp/fx48-modern.png', fullPage: false });
console.log('截图: /tmp/fx48-modern.png');
ok(errs.length === 0, `V14 零页面错误(${errs.slice(0, 2).join(' | ')})`);
await page.close();
await browser.close();
console.log(fails.length ? `\nVERIFY FAILURES: ${fails.length}\n- ${fails.join('\n- ')}` : '\nVERIFY ALL PASS');
process.exit(fails.length ? 1 : 0);
