// FX41b 合并后两遗留取证探针(2026-09-16,只读取证,零源码改动):
//   缺陷1 材料格双层计数叠字 —— 白 cnt(需求数,.sw-slot .cnt 格内左下) vs 绿拥有数
//         div(detail 系 mcraftOwnedCountPos)几何相交面取证。
//   缺陷2 搜索 input 打不了字 —— 真实 click+keyboard.type 链:value/过滤/焦点/
//         elementFromPoint 覆盖层/事件拦截链取证。
// 运行:SW_ORIGIN=http://localhost:5249 node tools/run-diag.mjs scripts/_fx48b-modern-two.mjs
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

// ---- 开 modern 窗(normal 态) ----
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

// ============================================================ 缺陷1:两计数几何取证
{
  const M = await page.evaluate(() => {
    const ui = window.__swUI;
    const detail = ui.vinvModernDetailEl;
    if (!detail || detail.style.display === 'none') return { shown: false };
    const info = [...detail.children].map((c) => {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      return {
        tag: c.tagName, cls: c.className, text: (c.textContent || '').slice(0, 12),
        x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        color: cs.color, pe: cs.pointerEvents, styleCss: (c.getAttribute('style') || '').slice(0, 160),
      };
    });
    return { shown: true, n: detail.children.length, info };
  });
  console.log('detail children:', JSON.stringify(M.info, null, 1));
  if (M.shown) {
    // 白 cnt(span.cnt) vs 绿拥有数(div, color 144,238,144 / 255,140,160)
    const spans = M.info.filter((c) => c.cls === 'cnt');
    const greens = M.info.filter((c) => c.color.includes('144, 238, 144') || c.color.includes('255, 140, 160'));
    ok(spans.length > 0, 'M0 需求数 span 存在(需 stack>1 配方)', `spans=${spans.length}`);
    ok(greens.length > 0, 'M1 拥有数 div 存在', `greens=${greens.length}`);
    if (spans.length && greens.length) {
      const s = spans[0], g0 = greens[0];
      const ix = Math.max(0, Math.min(s.x + s.w, g0.x + g0.w) - Math.max(s.x, g0.x));
      const iy = Math.max(0, Math.min(s.y + s.h, g0.y + g0.h) - Math.max(s.y, g0.y));
      console.log(`白cnt rect=(${s.x},${s.y} ${s.w}x${s.h}) 绿 rect=(${g0.x},${g0.y} ${g0.w}x${g0.h}) 相交=${(ix * iy).toFixed(1)}px²`);
      ok(ix * iy < 1, 'M2 两计数几何不相交(rect 无叠)', `area=${(ix * iy).toFixed(1)}px²`);
      ok(g0.y >= s.y + s.h - 1, 'M3 拥有数在需求数下带(格下缘)', `green.t=${g0.y} white.b=${s.y + s.h}`);
    }
  } else {
    ok(false, 'M- 详情浮层未画(无选中配方,缺陷1 无法取证)');
  }
}

// ============================================================ 缺陷2:input 打字链取证
{
  const I1 = await page.evaluate(() => {
    const ui = window.__swUI;
    const input = ui.vinvModernSearchInput;
    if (!input) return { has: false };
    const r = input.getBoundingClientRect();
    const cs = getComputedStyle(input);
    // 覆盖层检测:input 中心 elementFromPoint
    input.scrollIntoView = input.scrollIntoView; // noop
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    input.setAttribute('data-probe', '1');
    const hit = document.elementFromPoint(cx, cy);
    input.removeAttribute('data-probe');
    // 事件拦截链监视(捕获阶段 window→…):记录 stop*/preventDefault 调用
    window.__evLog = [];
    const log = (tag) => (e) => { window.__evLog.push({ tag, tgt: e.target.tagName + '.' + (e.target.className || ''), def: e.defaultPrevented }); };
    ['keydown', 'keypress', 'textInput', 'input', 'keyup'].forEach((t) => window.addEventListener(t, log(t), { capture: true, once: false }));
    return {
      has: true, inDom: input.isConnected,
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      pe: cs.pointerEvents, disp: cs.display, vis: cs.visibility,
      hitTag: hit ? hit.tagName + '.' + (hit.className || '') : null,
      hitIsInputOrChild: hit === input || (hit && input.contains(hit)),
      readOnly: input.readOnly, disabled: input.disabled,
      entriesBefore: ui.vinvModernEntries.length,
    };
  });
  console.log('input state:', JSON.stringify(I1));
  ok(I1.has && I1.inDom, 'I0 input 在 DOM(vinvModernSearchInput 引用活)');
  ok(I1.hitIsInputOrChild, 'I1 input 中心命中 = input 自身(无透明覆盖层)', `hit=${I1.hitTag}`);

  // 路径①:直点 input
  if (I1.has && I1.rect.w > 0) {
    await page.mouse.click(I1.rect.x + I1.rect.w / 2, I1.rect.y + I1.rect.h / 2);
    await sleep(120);
    const focused = await page.evaluate(() => ({
      ae: document.activeElement ? document.activeElement.tagName + '.' + (document.activeElement.className || '') : null,
      isInput: document.activeElement === window.__swUI.vinvModernSearchInput,
    }));
    ok(focused.isInput, 'I2 直点 input → activeElement = input', `ae=${focused.ae}`);
    await page.keyboard.type('a', { delay: 30 });
    await sleep(250);
    const T = await page.evaluate(() => {
      const ui = window.__swUI;
      return {
        value: ui.vinvModernSearchInput?.value, search: ui.vinvModernSearch,
        entriesAfter: ui.vinvModernEntries.length,
        evLog: (window.__evLog || []).map((e) => `${e.tag}@${e.tgt}${e.def ? '(prevented)' : ''}`),
      };
    });
    console.log('type-a:', JSON.stringify(T));
    ok(T.value === 'a', 'I3 直点后键入 a → input.value = "a"', `value=${JSON.stringify(T.value)}`);
    ok(T.entriesAfter !== I1.entriesBefore || (T.search === 'a'), 'I4 字符触发配方过滤(条目池变化/搜索域写入)', `entries ${I1.entriesBefore}→${T.entriesAfter} search=${T.search}`);
    console.log('evLog:', T.evLog.join(' | ') || '(empty)');
  }

  // 路径②:🔍 钮 focus
  const B = await page.evaluate(() => {
    const row = window.__swUI.vinvModernSearchRowEl;
    const btn = row ? row.querySelector('button') : null;
    if (!btn) return { has: false };
    const r = btn.getBoundingClientRect();
    return { has: true, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (B.has) {
    await page.evaluate(() => { window.__swUI.vinvModernSearchInput.value = ''; window.__swUI.vinvModernSearchInput.blur(); window.__swUI.vinvModernSearch = ''; window.__swUI.vinvModernResetRecipes(); window.__swUI.vinvUpdateModernCraft(); });
    await sleep(120);
    await page.mouse.click(B.x, B.y);
    await sleep(120);
    const F = await page.evaluate(() => ({ isInput: document.activeElement === window.__swUI.vinvModernSearchInput, ae: document.activeElement?.tagName }));
    ok(F.isInput, 'I5 🔍 钮 mousedown → focus 落 input(Click_SearchArea)', `ae=${F.ae}`);
    await page.keyboard.type('b', { delay: 30 });
    await sleep(200);
    const T2 = await page.evaluate(() => ({ value: window.__swUI.vinvModernSearchInput?.value, search: window.__swUI.vinvModernSearch }));
    ok(T2.value === 'b', 'I6 🔍 聚焦后键入 b → value = "b"', `value=${JSON.stringify(T2.value)}`);
  }
  // 还原搜索域(不污染后续场景)
  await page.evaluate(() => {
    const ui = window.__swUI;
    if (ui.vinvModernSearchInput) ui.vinvModernSearchInput.value = '';
    ui.vinvModernSearch = '';
    ui.vinvModernResetRecipes(); ui.vinvUpdateModernCraft();
  });
}

await page.screenshot({ path: '/tmp/fx48b-before.png', fullPage: false });
ok(errs.length === 0, `E1 零页面错误(${errs.slice(0, 2).join(' | ')})`);
await page.close();
await browser.close();
console.log(fails.length ? `\nPROBE FAILURES: ${fails.length}\n- ${fails.join('\n- ')}` : '\nPROBE ALL PASS');
process.exit(fails.length ? 1 : 0);
