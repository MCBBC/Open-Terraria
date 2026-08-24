// 一次性:昼态黑屏 DOM 堆叠诊断——elementFromPoint + 全覆盖层清单(day vs night)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
for (let i = 0; i < 120; i++) {
  const gone = await page.evaluate(() => !document.querySelector('.layer.back')).catch(() => true);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 1500));
const dump = () => page.evaluate(() => {
  const desc = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return `${el.tagName}.${(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || ''}` +
      ` z=${cs.zIndex} pos=${cs.position} bg=${cs.backgroundColor} op=${cs.opacity} disp=${cs.display}` +
      ` rect=${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)} filter=${cs.filter.slice(0,40)}`;
  };
  const out = { at: [], covering: [] };
  const el = document.elementFromPoint(640, 300);
  let cur = el;
  while (cur && cur !== document.body) { out.at.push(desc(cur)); cur = cur.parentElement; }
  if (el === document.body) out.at.push('BODY');
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (r.width >= 1270 && r.height >= 790 && cs.position !== 'static') {
      out.covering.push(desc(e));
    }
  }
  const mb = window.__swMenuBg;
  out.state = { dayTime: mb.dayTime, vTime: Math.round(mb.vTime) };
  return out;
});
console.log('DAY:', JSON.stringify(await dump(), null, 1));
await page.evaluate(() => { const mb = window.__swMenuBg; mb.dayTime = false; mb.vTime = 16200; });
await new Promise((r) => setTimeout(r, 1500));
console.log('NIGHT:', JSON.stringify(await dump(), null, 1));
await browser.close();
