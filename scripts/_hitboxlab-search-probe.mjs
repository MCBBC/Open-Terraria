// hitbox-lab 名称搜索探针:输入"炸弹" → 候选 28 → 回车加载 → dims 显示中英名。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/hitbox-lab.html';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 等名称索引加载
await page.waitForFunction(() => document.getElementById('search-drop') !== null, { timeout: 10000 });
await page.type('#search', '炸弹');
await new Promise((r) => setTimeout(r, 300));
const dropText = await page.evaluate(() => document.getElementById('search-drop').textContent);
check('搜索"炸弹"出候选 28', dropText.includes('28') && dropText.includes('Bomb'), dropText.slice(0, 60));
check('默认加载项显示中文名(炸弹)', await page.evaluate(() => document.getElementById('dims').textContent.includes('炸弹')));

// 英文前缀 + 回车选中
await page.evaluate(() => { document.getElementById('search').value = ''; });
await page.type('#search', 'Dyna');
await new Promise((r) => setTimeout(r, 300));
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 400));
const after = await page.evaluate(() => ({
  id: document.getElementById('sheetId').value,
  dims: document.getElementById('dims').textContent,
  dropShown: document.getElementById('search-drop').style.display,
}));
check('Enter 选中 Dynamite(29)', after.id === '29', JSON.stringify(after));
check('dims 显示雷管贴图与名称', /Projectile_29.*雷管|Dynamite/.test(after.dims), after.dims);
check('回车后收起候选', after.dropShown === 'none', after.dropShown);
check('无页面错误', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
