// 线饰品 E2E:装备线 → equipStats.stringColor 逐色验证(数据→Player 全链)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  const idOf = (re) => { const k = Object.keys(window.__swItems).find((k) => re.test(k)); return k ? window.__swItems[k] : -1; };
  const cases = [['vi_3308_', 13], ['vi_3293_', 1], ['vi_3294_', 2], ['vi_3304_', 12], ['vi_3305_', 28], ['vi_3306_', 14], ['vi_3307_', 27], ['vi_5547_', 30]];
  const out = { results: [], none: -1 };
  for (const [re, want] of cases) {
    const id = idOf(new RegExp('^' + re));
    if (id < 0) { out.results.push({ re, err: '未注册' }); continue; }
    p.inv.armor[3] = { id, stack: 1 };
    out.results.push({ re, got: p.equipStats.stringColor, want });
  }
  p.inv.armor[3] = null;
  out.none = p.equipStats.stringColor;
  return out;
});
for (const r of res.results) {
  if (r.err) check(`${r.re} 注册`, false, r.err);
  else check(`${r.re} 装备 → stringColor=${r.want}`, r.got === r.want, `got ${r.got}`);
}
check('卸下 → stringColor=0', res.none === 0, `got ${res.none}`);
check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 150));
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
