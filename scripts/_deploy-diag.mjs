// 背景透出验证:CharSelect 覆盖层打开时 ①多人面板隐藏 ②holder 无不透明底
// ③游戏天空画布可见(背景与单人进角色列表同观感) ④选角后流程继续。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuOk = false;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 500));
  menuOk = await p.evaluate(() => !!document.querySelector('[data-act=mp]')).catch(() => false);
  if (menuOk) break;
}
await p.evaluate(() => { document.querySelector('[data-act=mp]').click(); });
await new Promise((r) => setTimeout(r, 800));
await p.evaluate(() => {
  const input = [...document.querySelectorAll('.sw-panel input')].find((i2) => i2.placeholder.includes('房间码'));
  input.value = '123456';
});
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('.sw-panel button')].find((b2) => b2.textContent === '加入');
  btn.click();
});
await new Promise((r) => setTimeout(r, 500));
const s = await p.evaluate(() => {
  const vsel = document.querySelector('.sw-vsel');
  const holder = vsel?.parentElement;
  const mpPanel = [...document.querySelectorAll('.sw-panel')].find((x) => x.textContent?.includes('多人联机'));
  const skyCanvasVisible = [...document.querySelectorAll('canvas')].some((c) => {
    const st = getComputedStyle(c);
    return c.width > 300 && st.display !== 'none' && st.visibility !== 'hidden';
  });
  return {
    charSelect: !!vsel,
    holderBg: holder ? getComputedStyle(holder).backgroundColor : 'n/a',
    holderBgTransparent: holder ? getComputedStyle(holder).backgroundColor === 'rgba(0, 0, 0, 0)' : false,
    mpPanelHidden: mpPanel ? getComputedStyle(mpPanel).display === 'none' : 'panel-gone',
    skyCanvasVisible,
  };
});
console.log(JSON.stringify(s, null, 1));
const ok = s.charSelect && s.holderBgTransparent && s.mpPanelHidden === true && s.skyCanvasVisible;
await b.close();
process.exit(ok ? 0 : 1);
