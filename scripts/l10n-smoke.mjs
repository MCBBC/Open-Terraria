// M8 验收:默认中文启动 → 设置切英文 → 标题菜单刷新 + 持久化 → 刷新仍英文 → 切回中文
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// 注意:performance resource 缓冲 250 条上限,启动素材占满会丢条目,故用请求事件计数
let l10nReqNames = [];
page.on('request', (r) => { if (r.url().includes('/l10n/')) l10nReqNames.push(r.url().split('/l10n/')[1]); });

// ① 默认启动:中文(先清残留 options,保证从默认态开始)
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => localStorage.removeItem('sandboxworld.options'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 400));
const reqCount = l10nReqNames.length;
const zhSp = await page.evaluate(() => document.querySelector('[data-act=sp]').textContent);

// ② 打开设置 → 界面栏 → 语言网格应显示"简体中文"(当前语言自述)
await page.click('[data-act=set]');
await page.waitForSelector('.sw-set-panel', { timeout: 5000 });
await page.click('[data-cat=ui]');
await new Promise((r) => setTimeout(r, 300));
const langButtons = await page.evaluate(() => [...document.querySelectorAll('.sw-set-lang-grid button')].map((b) => b.textContent));
const hasZh = langButtons.includes('简体中文');
const hasEn = langButtons.some((t) => t.includes('English'));

// ③ 点 English → 等 sw:langchange → 面板重建 + 标题菜单刷新为英文
const switched = page.evaluate(() => new Promise((res) => {
  addEventListener('sw:langchange', () => res(true), { once: true });
  setTimeout(() => res(false), 8000);
  [...document.querySelectorAll('.sw-set-lang-grid button')].find((b) => b.dataset.lang === 'en-US')?.click();
}));
const langChanged = await switched;
await new Promise((r) => setTimeout(r, 600));
const panelTitleEn = await page.evaluate(() => document.querySelector('.sw-set-title').textContent);
const spText = await page.evaluate(() => document.querySelector('[data-act=sp]').textContent);
const activeLang = await page.evaluate(() => document.querySelector('.sw-set-lang-grid button.active')?.dataset.lang ?? null);
const stored = await page.evaluate(() => localStorage.getItem('sandboxworld.options'));

// ④ 关面板 → 标题菜单按钮应已刷新为 Single Player
await page.click('.sw-set-back');
await new Promise((r) => setTimeout(r, 300));
const spAfterClose = await page.evaluate(() => document.querySelector('[data-act=sp]').textContent);

// ⑤ 刷新页面:仍英文(l10n 请求仍应只有 index+语言包 2 次,不做双 fetch)
l10nReqNames.length = 0;
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 300));
const spAfterReload = await page.evaluate(() => document.querySelector('[data-act=sp]').textContent);
const reqCount2 = l10nReqNames.length;

// ⑥ 切回简体中文,恢复默认
await page.click('[data-act=set]');
await page.waitForSelector('.sw-set-panel', { timeout: 5000 });
await page.click('[data-cat=ui]');
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => [...document.querySelectorAll('.sw-set-lang-grid button')].find((b) => b.dataset.lang === 'zh-Hans').click());
await new Promise((r) => setTimeout(r, 800));
const restored = await page.evaluate(() => document.querySelector('[data-act=sp]').textContent);

console.log(JSON.stringify({
  zhSp, reqCount, langButtons: langButtons.length, hasZh, hasEn,
  langChanged, panelTitleEn, activeLang, spText, stored, spAfterClose, spAfterReload, reqCount2, restored,
}, null, 1));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
const ok = errors.length === 0
  && zhSp === '单人模式' && reqCount === 2 // index.json + zh-Hans.json
  && hasZh && hasEn && langChanged
  && panelTitleEn === 'Settings' && activeLang === 'en-US' && spText === 'Single Player'
  && spAfterClose === 'Single Player' && spAfterReload === 'Single Player' && reqCount2 === 2
  && restored === '单人模式';
if (!ok) { console.error('L10N SMOKE FAILED'); process.exit(1); }
console.log('L10N SMOKE OK');
