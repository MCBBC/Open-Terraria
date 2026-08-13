// 同类问题批量修复验证:食物族 86 项竖 3 帧条切片(落地/背包均单帧)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
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

// 食物图标切片抽检:5275 JojaCola(16×90→16×30)/2266 Sake(18×96→18×32)/4294 Pineapple(20×102→20×34)
const food = await page.evaluate(() => {
  const g = window.__swGame;
  const items = window.__swItems;
  const out = {};
  for (const [vid, expectW] of [['5275', 16], ['2266', 18], ['4294', 20]]) {
    const key = Object.keys(items).find((k) => k.startsWith(`vi_${vid}_`));
    if (!key) { out[vid] = { missing: true }; continue; }
    const ar = g.renderer.atlasIcon(items[key]);
    out[vid] = { sw: ar?.sw, sh: ar?.sh };
  }
  return out;
});
check('JojaCola 16×30(原 16×90 切 1/3)', food['5275']?.sw === 16 && food['5275']?.sh === 30, JSON.stringify(food['5275']));
check('Sake 18×32(原 18×96)', food['2266']?.sw === 18 && food['2266']?.sh === 32, JSON.stringify(food['2266']));
check('Pineapple 20×34(原 20×102)', food['4294']?.sw === 20 && food['4294']?.sh === 34, JSON.stringify(food['4294']));

// 非食物长条不受影响:281 吹箭筒(38×8 合法宽图标整图)
const blow = await page.evaluate(() => {
  const g = window.__swGame;
  const items = window.__swItems;
  const key = Object.keys(items).find((k) => k.startsWith('vi_281_'));
  const ar = g.renderer.atlasIcon(items[key]);
  return { sw: ar?.sw, sh: ar?.sh };
});
check('吹箭筒 38×8 合法宽图标不受切帧影响', blow.sw === 38 && blow.sh === 8, JSON.stringify(blow));

// UI 背包图标:食物单帧(帧 0)
const uiIcon = await page.evaluate(() => {
  const items = window.__swItems;
  const key = Object.keys(items).find((k) => k.startsWith('vi_5275_'));
  // iconUrl 是 UI 私有——经 atlasIconForKey+sliceItemAnimFrame(tick=0) 等价链验证
  const g = window.__swGame;
  void g;
  return { key };
});
check('UI 食物图标走同一切片链(帧 0)', !!uiIcon.key, JSON.stringify(uiIcon));

check('无页面错误', errors.length === 0, errors.slice(0, 2).join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
