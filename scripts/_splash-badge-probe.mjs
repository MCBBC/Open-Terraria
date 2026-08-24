// 探针：下载等待期徽标（生产 preview）——文案已翻译、浮于 splash 上、放行原因
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
let badgeText = null;
let badgeAboveSplash = null;
let shot = false;
const t0 = Date.now();
for (;;) {
  const st = await page.evaluate(() => {
    const badge = document.querySelector('.sw-asset-badge');
    const splash = document.getElementById('sw-splash');
    return {
      splash: !!splash,
      badge: badge ? badge.textContent : null,
      badgeZ: badge ? getComputedStyle(badge).zIndex : null,
      splashZ: splash ? getComputedStyle(splash).zIndex : null,
      title: !!document.querySelector('.sw-title-menu'),
    };
  }).catch(() => ({ splash: false, badge: null, title: false }));
  const t = Date.now() - t0;
  if (st.badge && badgeText === null) {
    badgeText = st.badge;
    badgeAboveSplash = st.badgeZ !== null && st.splashZ !== null && Number(st.badgeZ) > Number(st.splashZ);
    if (!shot) { shot = true; await page.screenshot({ path: '/tmp/splash-badge.png' }); }
  }
  if ((st.title && !st.splash) || t > 60000) {
    console.log(JSON.stringify({ releasedAtMs: t, badgeText, badgeAboveSplash, badgeTextAtEnd: st.badge, splashAtEnd: st.splash }, null, 1));
    break;
  }
  await new Promise((r) => setTimeout(r, 150));
}
const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(badgeText !== null, '下载徽标未出现（等待期应挂出）');
A(!/Mods\.SandboxWorld/.test(badgeText ?? ''), `徽标文案未翻译: ${badgeText}`);
A(badgeAboveSplash, '徽标层级未浮于 splash 之上');
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
