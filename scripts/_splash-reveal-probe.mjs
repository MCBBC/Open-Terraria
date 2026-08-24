// 探针：splash 渐显/渐隐终态（2026-08-24 用户三连要求）。
//  1. 角标文字（版本/署名）随 splash 渐显入场（同曲线，单调不回退）
//  2. 渐隐段 splash 底透明——场景淡出透出菜单（截图验证菜单在渐隐中可见）
//  3. 揭幕后文字满亮、菜单完整、零报错
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });

// t≈4s：渐显中——文字应部分可见（opacity 0<x<1），场景渐显中
await new Promise((r) => setTimeout(r, 4000));
const mid = await page.evaluate(() => {
  const ch = document.getElementById('sw-title-chrome');
  const splash = document.getElementById('sw-splash');
  return {
    chrome: !!ch,
    chromeOpacity: ch ? getComputedStyle(ch).opacity : null,
    splashBg: splash ? getComputedStyle(splash).backgroundColor : null,
    version: ch?.querySelector('.sw-title-version')?.textContent ?? null,
  };
});
await page.screenshot({ path: '/tmp/reveal-midin.png' });

// t≈9.9s：渐隐中——splash 底应已透明，截图看菜单透出
await new Promise((r) => setTimeout(r, 5900));
const midout = await page.evaluate(() => {
  const splash = document.getElementById('sw-splash');
  return {
    present: !!splash,
    splashBg: splash ? getComputedStyle(splash).backgroundColor : null,
  };
});
await page.screenshot({ path: '/tmp/reveal-midout.png' });

// 揭幕后：文字满亮 + 菜单在 + 变量已摘
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 300));
  const done = await page.evaluate(() => !document.getElementById('sw-splash') && !!document.querySelector('.sw-title-menu')).catch(() => false);
  if (done) break;
}
await new Promise((r) => setTimeout(r, 800));
const after = await page.evaluate(() => {
  const ch = document.getElementById('sw-title-chrome');
  return {
    chromeOpacity: ch ? getComputedStyle(ch).opacity : null,
    varCleared: getComputedStyle(document.documentElement).getPropertyValue('--sw-splash-alpha').trim() === '',
    menu: !!document.querySelector('.sw-title-menu'),
  };
});
await page.screenshot({ path: '/tmp/reveal-after.png' });
console.log(JSON.stringify({ mid, midout, after, errs: errs.slice(0, 3) }, null, 1));

const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(errs.length === 0, `页面异常: ${errs[0] ?? ''}`);
A(mid.chrome, '角标层未挂载');
A(mid.chromeOpacity !== null && parseFloat(mid.chromeOpacity) > 0 && parseFloat(mid.chromeOpacity) < 1,
  `渐显中文字应部分透明: ${mid.chromeOpacity}`);
A(midout.present && midout.splashBg === 'rgba(0, 0, 0, 0)', `渐隐中 splash 底应透明: ${midout.splashBg}`);
A(after.chromeOpacity === '1', `揭幕后文字应满亮: ${after.chromeOpacity}`);
A(after.varCleared, 'splash alpha 变量未摘除');
A(after.menu, '菜单未揭幕');
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
