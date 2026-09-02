// 合成列表原生滚动回归探针（2026-09-02 重构验证）：
// ?play=small 真世界 + stub vanillaAvailableRecipes=200 行。
// 断言 ①容器=overflow-y:auto 原生溢出滚动（无自绘 track/thumb 残留）
//     ②滚动条常显：内容超高时 offsetWidth-clientWidth≈8（::webkit 换肤=
//       经典常显渲染；若=0 说明退回 macOS 覆盖式"滚动才现"=用户报的症状）
//     ③滚轮（trusted page.mouse.wheel）驱动 scrollTop 原生滚动
//     ④内容变化重建（count 3→5 触发签名失配）后 scrollTop 回填不归零
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: false, defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
  // ★headless(mac)强制覆盖式滚动条,::-webkit-scrollbar 常显占宽观测不到
  //  → 本探针必须 headful 跑（窗口扔屏幕外,~15s）
  args: ['--window-position=2400,2400', '--window-size=1400,900'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
// 预关首启欢迎浮层(#sw-welcome-announce 全屏 z60 罩,吞滚轮=假 FAIL)
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto((process.env.SW_ORIGIN || 'http://localhost:5202') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const base = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const raf = (n) => new Promise((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); });
  const vr = await import('/src/data/vanillaRecipes.ts');
  g.vanillaAvailableRecipes = () => vr.VANILLA_RECIPES.slice(0, 200).map((r) => ({ r, count: 3 }));
  ui.openInventory();
  await raf(8);
  const cl = ui.craftListEl;
  const cs = getComputedStyle(cl);
  const row0 = cl.children[0];
  return {
    overflowY: cs.overflowY,
    rowCount: cl.children.length,
    barW0: cl.offsetWidth - cl.clientWidth,   // 常显经典滚动条=占宽;覆盖式=0
    scrollable: cl.scrollHeight > cl.clientHeight,
    clientH: cl.clientHeight, scrollH: cl.scrollHeight,
    maxHeight: cl.style.maxHeight,
    invDisplay: ui.invPanel.style.display,
    row0H: row0 ? Math.round(row0.getBoundingClientRect().height) : -1,
    trackResidue: !!document.querySelector('.sw-craft-list > [style*="position:absolute"]'),
    hasTrackField: ('craftTrackEl' in ui) || ('craftPool' in ui),
    sbRuleLoaded: (() => { try { for (const sh of document.styleSheets) { for (const ru of sh.cssRules) { if (ru.cssText && ru.cssText.includes('-webkit-scrollbar')) return true; } } } catch (e) { return 'err:' + e.message; } return false; })(),
    sbComputedStyle: (getComputedStyle(cl).scrollbarWidth ?? '?') + '/' + (getComputedStyle(cl).scrollbarColor ?? '?'),
  };
});
const clBox = await page.evaluate(() => {
  const b = window.__swUI.craftListEl.getBoundingClientRect();
  const cx = b.x + b.width / 2, cy = b.y + Math.min(b.height / 2, 100);
  const stack = document.elementsFromPoint(cx, cy).slice(0, 6).map((e2) => `${e2.tagName}.${e2.className}`);
  const top = document.elementsFromPoint(cx, cy)[0];
  return { x: cx, y: cy, hit: stack.join(' | '), topHtml: top ? top.outerHTML.slice(0, 140) : '?', topParent: top?.parentElement ? `${top.parentElement.tagName}.${top.parentElement.className}` : '?' };
});
// ③ trusted 滚轮 → 原生滚动
await page.mouse.move(clBox.x, clBox.y);
await page.mouse.wheel({ deltaY: 600 });
await new Promise((r) => setTimeout(r, 250));
const step1 = await page.evaluate(() => {
  const cl = window.__swUI.craftListEl;
  return { scrollTop: cl.scrollTop, barW: cl.offsetWidth - cl.clientWidth };
});
await page.mouse.wheel({ deltaY: 1200 });
await new Promise((r) => setTimeout(r, 250));
// ④ 内容变化 → 真重建路径 → scrollTop 回填
await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const vr = await import('/src/data/vanillaRecipes.ts');
  g.vanillaAvailableRecipes = () => vr.VANILLA_RECIPES.slice(0, 200).map((r) => ({ r, count: 5 }));
  ui.refreshAll();
});
await new Promise((r) => setTimeout(r, 250));
const step2 = await page.evaluate(() => {
  const cl = window.__swUI.craftListEl;
  return { scrollTop: cl.scrollTop, rowCount: cl.children.length, barW: cl.offsetWidth - cl.clientWidth };
});
console.log(JSON.stringify({ ...base, clBox, step1, step2 }, null, 1));
const ok = base.overflowY === 'auto' && !base.trackResidue && !base.hasTrackField && base.invDisplay === 'block'
  && base.rowCount > 100 && base.scrollable && base.row0H === 30
  && base.barW0 === 5 && step1.barW === 5 && step2.barW === 5   // 2026-09-02 用户要求滚条细一点(8→5)
  && step1.scrollTop > 0 && step2.scrollTop > 0 && step2.rowCount > 100;
console.log(ok ? 'PASS: 原生滚动+滚动条常显+重建保位' : 'FAIL: 见上');
await page.screenshot({ path: '/tmp/craft-native-scroll.png' });
await browser.close();
