// 一次性:菜单背景揭幕冻结验证(2026-08-27 用户报"过渡图阶段背景时间已空转")——
//  splash 期间 __swMenuBg.clock.timeOfDay 应恒=初始值 0.34375(冻结);揭幕(splash
//  消失)后应开始推进。顺带回归月/日抓取(v2 口径)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

// 从脚本注入起高频采样:menuBg 出现即记 timeOfDay,直到 splash 消失
const during = await page.evaluate(() => new Promise((resolve) => {
  const samples = [];
  const t0 = performance.now();
  const iv = setInterval(() => {
    const bg = window.__swMenuBg;
    if (bg) {
      samples.push({ ms: Math.round(performance.now() - t0), t: +bg.clock.timeOfDay.toFixed(5),
        paused: !!bg.paused, splash: !!document.getElementById('sw-splash') });
    }
    if (!document.getElementById('sw-splash') && window.__swMenuBg) {
      clearInterval(iv);
      resolve(samples);
    }
  }, 120);
  setTimeout(() => { clearInterval(iv); resolve(samples); }, 60000);
}));
await new Promise((r) => setTimeout(r, 2000));
const after = await page.evaluate(() => +window.__swMenuBg.clock.timeOfDay.toFixed(5));

const duringPause = during.filter((s) => s.paused);
const frozen = duringPause.length > 0 && duringPause.every((s) => s.t === duringPause[0].t);
console.log(JSON.stringify({
  samples: during,
  pausedSamples: duringPause.length,
  frozenWhilePaused: frozen,
  afterRevealT: after,
  advanced: after > (duringPause[0]?.t ?? 0.34375),
}, null, 1));
await browser.close();
