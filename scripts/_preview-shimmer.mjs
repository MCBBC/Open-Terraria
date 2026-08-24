// 一次性:世界预览微光湖断点定位——生成小世界,查 shimmer 点的 store 态与 mapColor24。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
// 走到世界创建并生成一个小世界(带预览),等生成完成
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sw-title-btn')];
  const sp = btns.find((b) => b.textContent.includes('单人'));
  sp?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1500));
// 逐页点:角色选择→选角色→世界选择→创建世界(按现有 UI 结构探测按钮)
const clickByText = async (txt) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('button, .sw-title-btn, [class*="btn"], [class*="item"]')];
  const el = els.find((b) => b.textContent && b.textContent.includes(t));
  if (el) { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el.click?.(); return true; }
  return false;
}, txt);
for (const t of ['选择', '创建']) {
  const ok = await clickByText(t);
  console.log('click', t, ok);
  await new Promise((r) => setTimeout(r, 800));
}
// 直接调生成入口(绕 UI 细节):查 mainFlow 是否暴露
const genInfo = await page.evaluate(() => {
  const w = window;
  return { hasGame: !!w.__swGame, hasMenuBg: !!w.__swMenuBg, flowKeys: w.__swFlow ? Object.keys(w.__swFlow) : null };
});
console.log('GENINFO:', JSON.stringify(genInfo));
if (errors.length) console.log('ERRORS:', errors.slice(0, 4).join('\n'));
await browser.close();
