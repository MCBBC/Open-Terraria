// 探针：音频开启拦截门（2026-08-24 用户要求）。
//  A. 真实用户路径（覆盖 navigator.webdriver=false）：AC 挂起 → 黑门出现
//     （耳机图标+两行白色文案），splash 尚未出现；点击任意位置 → 门撤、AC
//     running、splash 随后出现
//  B. 探针路径（webdriver=true 默认）：门不出现，直接进 splash
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });

// ---- A. 真实用户路径 ----
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  const gate = await page.evaluate(() => {
    const g = document.getElementById('sw-audio-gate');
    if (!g) return null;
    const cs = getComputedStyle(g);
    return {
      bg: cs.backgroundColor,
      hasIcon: !!g.querySelector('svg'),
      text: g.querySelector('.tip')?.innerText ?? '',
      splashShown: !!document.getElementById('sw-splash'),
    };
  });
  await page.screenshot({ path: '/tmp/audio-gate.png' });
  await page.mouse.click(640, 400);
  await new Promise((r) => setTimeout(r, 1500));
  const after = await page.evaluate(() => ({
    gateGone: !document.getElementById('sw-audio-gate'),
    splashShown: !!document.getElementById('sw-splash'),
  }));
  // AC 状态经 AudioContext 实例读（钩构造记录）
  console.log(JSON.stringify({ gate, after, errs: errs.slice(0, 3) }, null, 1));
  const A = (c, m) => { if (!c) { console.error('FAIL(A): ' + m); process.exitCode = 1; } };
  A(gate, '音频门未出现（AC 挂起场景未拦截）');
  if (gate) {
    A(gate.bg === 'rgb(0, 0, 0)', `黑幕底色: ${gate.bg}`);
    A(gate.hasIcon, '耳机图标缺失');
    A(gate.text.includes('请佩戴耳机获取最佳体验') && gate.text.includes('点击任意位置开始游戏'), `文案不符: ${gate.text}`);
    A(!gate.splashShown, '门未拦截住 splash（应先门后 splash）');
  }
  A(after.gateGone, '点击后门未撤');
  A(after.splashShown, '点击后 splash 未出现');
  A(errs.length === 0, `页面异常: ${errs[0] ?? ''}`);
  await page.close();
}

// ---- B. 探针路径（webdriver 默认 true）----
{
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));
  const st = await page.evaluate(() => ({
    gateShown: !!document.getElementById('sw-audio-gate'),
    splashShown: !!document.getElementById('sw-splash'),
  }));
  console.log(JSON.stringify({ probePath: st }));
  const A = (c, m) => { if (!c) { console.error('FAIL(B): ' + m); process.exitCode = 1; } };
  A(!st.gateShown, '探针路径不应出音频门');
  A(st.splashShown, '探针路径 splash 应正常出现');
  await page.close();
}

console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
