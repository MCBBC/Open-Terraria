// 一次性:堆叠/表情钮迁移 + 右键bug断言(2026-08-27 用户报)——
//  ①堆叠/表情钮在垃圾桶正下方;②右键堆叠钮=只切模式不堆叠(spy 计数);
//  ③左键=堆叠一次。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 300; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((x) => x.textContent === '我已知晓');
  btn?.click();
});
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-panel .sw-slot')).catch(() => false)) break;
}
const out = await page.evaluate(() => {
  const ui = window.__swUI;
  // spy:包装 quickStackAllChests 计数
  let stackCalls = 0;
  const orig = window.__swGame.quickStackAllChests.bind(window.__swGame);
  window.__swGame.quickStackAllChests = () => { stackCalls++; orig(); };
  window.__swQsSpy = () => stackCalls;
  const trash = document.querySelector('.sw-trash');
  const qs = ui.quickStackBtn;
  const emote = qs.nextElementSibling;
  const r = (el) => el.getBoundingClientRect();
  const trashR = r(trash), qsR = r(qs);
  // 杂项眼图标 = 配饰眼同款 Inventory_Tick_*
  const petEye = document.querySelector('.sw-peteye');
  const petEyeIcon = (petEye?.style.backgroundImage || '').includes('Inventory_Tick_');
  // PvP 列与钩爪行间距
  const pvp = [...document.querySelectorAll('button')].find((b) => (b.style.background || '').includes('UI_PVP_0'));
  const pvpRail = pvp.parentElement;
  const advRail = pvpRail.parentElement;
  const miscRail = petEye.parentElement.parentElement.parentElement;   // 眼→槽→pair→miscCol→miscRail
  const pvpGap = pvpRail.getBoundingClientRect().top - miscRail.getBoundingClientRect().bottom;
  return {
    qsBelowTrash: qsR.top >= trashR.bottom - 2,
    emoteBelowTrash: r(emote).top >= trashR.bottom - 2,
    sameColumn: Math.abs(qsR.left - trashR.left) < 40,
    petEyeIcon,
    pvpGapPx: +pvpGap.toFixed(0),
    mode0: window.__swGame.quickStackMode(),
    stackCalls0: stackCalls,
    _qs: qs, _emote: emote,
  };
});
// 右键堆叠钮 → 只切模式
const qsBox = await page.evaluate(() => { const r = window.__swUI.quickStackBtn.getBoundingClientRect(); return { x: r.x + 15, y: r.y + 15 }; });
await page.mouse.click(qsBox.x, qsBox.y, { button: 'right' });
await new Promise((r) => setTimeout(r, 300));
out.afterRight = await page.evaluate(() => ({
  modeChanged: window.__swGame.quickStackMode(),
  stackCalls: window.__swQsSpy(),
}));
// 左键 → 堆叠一次
await page.mouse.click(qsBox.x, qsBox.y, { button: 'left' });
await new Promise((r) => setTimeout(r, 300));
out.afterLeft = await page.evaluate(() => ({
  stackCalls: window.__swQsSpy(),
  modeUnchanged: window.__swGame.quickStackMode(),
}));
delete out._qs; delete out._emote;
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/qs-moved.png' });
await browser.close();
