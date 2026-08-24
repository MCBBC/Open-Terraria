// 探针：角标文字闪现回归（2026-08-24 用户报"文字先全显,背景入场才隐藏渐显"）。
//  黑场期(前 1.5s)文字必须隐藏(opacity≈0)，随场景同曲线渐显。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
const samples = [];
for (const at of [600, 1200, 2500, 4000]) {
  const wait = at - samples.reduce((a, s) => a + s.waited, 0);
  await new Promise((r) => setTimeout(r, Math.max(0, wait)));
  const o = await page.evaluate(() => {
    const ch = document.getElementById('sw-title-chrome');
    return ch ? parseFloat(getComputedStyle(ch).opacity) : null;
  }).catch(() => null);
  samples.push({ at, opacity: o, waited: Math.max(0, wait) });
}
console.log(JSON.stringify(samples));
const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(samples[0].opacity !== null && samples[0].opacity < 0.05, `黑场期文字应隐藏: ${samples[0].opacity}`);
A(samples[1].opacity < 0.05, `1.2s(渐显未启动)文字应仍隐藏: ${samples[1].opacity}`);
A(samples[2].opacity > 0.02 && samples[2].opacity < 0.6, `2.5s 渐显中应部分可见: ${samples[2].opacity}`);
A(samples[3].opacity > samples[2].opacity, `4s 应比 2.5s 更亮(单调渐显): ${samples[2].opacity} -> ${samples[3].opacity}`);
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
