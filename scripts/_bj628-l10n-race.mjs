// ★BJ628 探针：主菜单 l10n 键名直出竞态窗（用户实报图 99 复现+修复验证）。
// 机制：页面级 fetch 包装在 SW 之前拦截 l10n/* 请求——按模式注入失败窗：
//   fail2  = 前两次 l10n fetch reject（旧启动链两次 Lang.init 全撞失败=键名粘滞；
//            新链 ensureReady 第 3 次重试成功=菜单中文）
//   heal   = l10n fetch 持续 reject 直到 window.__swL10nGo=true（旧=键名永不自愈；
//            新=预算放行+后台自愈循环,放行后 2.5s 内 emit→renderTexts 免刷新自愈）
//   off    = 无注入（对照：正常进菜单恒中文）
// 断言面 = .sw-title-btn[data-act=sp]（LegacyMenu.12）与 [data-act=buy]
//（Mods.SandboxWorld.Menu.BuyTerraria）——用户截图键名直出的同两枚。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const mode = process.env.BJ628_MODE ?? 'off';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument((m) => {
  const orig = window.fetch.bind(window);
  let n = 0;
  window.__swL10nGo = false;
  window.__swL10nFetches = 0;
  window.fetch = (input, init) => {
    const u = typeof input === 'string' ? input : (input && input.url) || '';
    if (u.includes('l10n/')) {
      window.__swL10nFetches++;
      const block = m === 'fail2' ? n < 2 : (m === 'heal' ? !window.__swL10nGo : false);
      n++;
      if (block) return Promise.reject(new TypeError('BJ628 simulated flaky network'));
    }
    return orig(input, init);
  };
}, mode);

await page.goto(origin, { waitUntil: 'networkidle2', timeout: 60000 });
// 菜单 DOM 在 splash 幕后即建好（showTitle），轮询等它出现（warm 缓存下数秒内）
const grab = () => page.evaluate(() => {
  const q = (sel) => document.querySelector(sel);
  const sp = q('.sw-title-btn[data-act=sp]');
  const buy = q('.sw-title-btn[data-act=buy]');
  return {
    menu: !!sp,
    sp: sp ? sp.textContent : null,
    buy: buy ? buy.textContent : null,
    fetches: window.__swL10nFetches,
  };
});
let out = {};
for (let i = 0; i < 40; i++) {
  out = await grab();
  if (out.menu) break;
  await new Promise((r) => setTimeout(r, 500));
}
out.phase1 = out.menu ? 'menu-up' : 'timeout';
if (out.menu && mode === 'heal') {
  // 刀后语义：就绪窗口菜单文字 = 内联兜底(单人模式/购买原版,非键名),同时
  // ensureReady 重试+自愈循环持续打 fetch(计数持续增长);放行网络后装载真包
  // 并停手(计数封口)。全程任何时刻不得出现裸键名。
  await new Promise((r) => setTimeout(r, 9000));   // 越过门①②预算,自愈已挂
  const mid = await grab();
  const c0 = mid.fetches;
  await new Promise((r) => setTimeout(r, 3000));   // 未放行,自愈应继续打
  const mid2 = await grab();
  await page.evaluate(() => { window.__swL10nGo = true; });
  let end = null;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    end = await grab();
    if (end.fetches > mid2.fetches) break;         // 自愈成功装载真包
  }
  const nAfterGo = end.fetches;
  await new Promise((r) => setTimeout(r, 3000));   // 数个自愈周期
  const fin = await grab();
  out.midBeforeGo = mid.sp;
  out.midRetryActive = mid2.fetches > c0;          // 放行前自愈在续(计数增长)
  out.healedNoReload = nAfterGo > mid2.fetches;    // 放行后装载发生
  out.healStopped = fin.fetches === nAfterGo;      // 成功即停手
  out.fetchesEnd = fin.fetches;
}
console.log(JSON.stringify({ mode, ...out }, null, 1));
await browser.close();

const A = (c, m2) => { if (!c) { console.error('FAIL: ' + m2); process.exitCode = 1; } };
const KEYLIKE = /^(LegacyMenu|Mods)\.[A-Za-z0-9.]+$/;
if (mode === 'fail2') {
  A(out.menu, '菜单未出现');
  A(out.fetches >= 3, `fail2: 新链应有第 3 次重试 fetch,实得 ${out.fetches}`);
  A(!KEYLIKE.test(out.sp || ''), `fail2(修复后): sp=「${out.sp}」仍键名直出`);
  A(!KEYLIKE.test(out.buy || ''), `fail2(修复后): buy=「${out.buy}」仍键名直出`);
} else if (mode === 'heal') {
  A(out.menu, '菜单未出现');
  A(out.midBeforeGo === '单人模式' && !KEYLIKE.test(out.midBeforeGo), `heal: 放行前应为内联兜底文案(非键名),实得「${out.midBeforeGo}」`);
  A(out.midRetryActive, 'heal: 放行前重试/自愈应持续在打(计数增长)');
  A(out.healedNoReload, 'heal: 放行后免刷新装载失败');
  A(out.healStopped, 'heal: 成功后自愈未停手');
  A(!KEYLIKE.test(out.sp || '') && !KEYLIKE.test(out.buy || ''), 'heal: 终态仍键名');
} else if (mode === 'off') {
  A(out.menu, '菜单未出现');
  A(!KEYLIKE.test(out.sp || ''), `off(对照): sp=「${out.sp}」键名直出=环境异常`);
}
