// 一次性:UI 对齐截图链(分阶段精确导航)——标题→角色选择→创建角色。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 1200));

const visibleTexts = () => page.evaluate(() =>
  [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && e.textContent.trim().length > 0 && e.textContent.length < 24)
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((e) => `${e.className.toString().split(' ')[0] || e.tagName}::${e.textContent.trim().slice(0, 14)}`)
    .slice(0, 20));
const clickVisible = (txt) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && e.textContent.trim().includes(t));
  const el = els.find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (el) { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el.click(); return true; }
  return false;
}, txt);
const shot = (n) => page.screenshot({ path: `/tmp/ui-${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await shot('title');
console.log('[1] click 单人模式:', await clickVisible('单人模式'));
await wait(1500);
console.log('[1] visible:', JSON.stringify(await visibleTexts()));
await shot('charselect');

// 角色选择 → 新建（footer 第二个 sw-vbtn；空列表也应有）
console.log('[2] click 新建:', await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sw-vsel-footer .sw-vbtn')];
  const b = btns.find((x) => !x.textContent.includes('返回')) ?? btns[1];
  if (!b) return false;
  b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  b.click();
  return b.textContent.trim();
}));
await wait(1500);
console.log('[2] visible:', JSON.stringify(await visibleTexts()));
await shot('charcreate');

// [3] 创建角色(默认外观) → 回角色选择 → 点行进入 → 世界选择
console.log('[3] click 创建:', await page.evaluate(() => {
  const b = document.querySelector('.sw-char-panel [data-act=create]');
  if (!b) return false;
  b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  b.click();
  return true;
}));
await wait(1800);
await page.evaluate(() => {
  const row = document.querySelector('.sw-vsel-list .sw-vitem');
  row?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  row?.click();
});
await wait(1500);
console.log('[3] visible:', JSON.stringify(await visibleTexts()));
await shot('worldselect');
// [4] 世界选择 footer 新建 → 世界创建页(精确选 footer,避开 legacy shim 同文案钮)
console.log('[4] click 新建:', await page.evaluate(() => {
  const b = [...document.querySelectorAll('.sw-vsel-footer .sw-vbtn')].find((x) => !x.textContent.includes('返回'));
  if (!b) return false;
  b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  b.click();
  return b.textContent.trim();
}));
await wait(1500);
console.log('[4] visible:', JSON.stringify(await visibleTexts()));
await shot('worldcreate');
// [5] 创建世界 → 生成期预览(等微光 pass 后截图)
console.log('[5] click 创建:', await page.evaluate(() => {
  const b = document.querySelector('.sw-wc-footer [data-act=create]');
  if (!b) return false;
  b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  b.click();
  return true;
}));
await wait(1200);
const genState = await page.evaluate(() => {
  const cvs = [...document.querySelectorAll('canvas')].filter((c) => c.width > 200 && c.height > 40 && c.height < c.width);
  return { canvases: cvs.length, texts: [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /生成|微光|%./.test(e.textContent)).map((e) => e.textContent.trim().slice(0, 20)).slice(0, 6) };
});
console.log('[5] gen:', JSON.stringify(genState));
await wait(15000);
await shot('genpreview');
const genState2 = await page.evaluate(() =>
  [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /生成|微光/.test(e.textContent || '')).map((e) => e.textContent.trim().slice(0, 20)).slice(0, 6));
console.log('[5] gen-late:', JSON.stringify(genState2));
if (errors.length) console.log('ERRORS:', errors.slice(0, 5).join('\n'));
await browser.close();
