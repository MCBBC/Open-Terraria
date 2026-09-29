// BJ401 菜单链诊断：逐步点并 dump DOM 状态
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 }, protocolTimeout: 600000 });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 300000, polling: 500 });
await new Promise(r => setTimeout(r, 3000));
const dump = async (tag) => {
  const s = await page.evaluate(() => ({
    title: !!document.querySelector('.sw-title-btn'),
    vsel: !!document.querySelector('.sw-vsel'),
    vselEmpty: !!document.querySelector('.sw-vsel-empty'),
    vitems: document.querySelectorAll('.sw-vsel .sw-vitem').length,
    acts: [...document.querySelectorAll('[data-act]')].map((e) => e.getAttribute('data-act')).slice(0, 20),
    game: !!(window.__swGame?.player),
    bodyText: document.body.innerText.slice(0, 200).replace(/\n/g, '|'),
  }));
  console.log(tag, JSON.stringify(s));
};
await dump('t0');
const clickSel = async (sel) => {
  const e = await page.$(sel);
  if (e) { await e.click(); await new Promise(r => setTimeout(r, 1500)); return true; }
  console.log('MISS', sel);
  return false;
};
if (!(await page.$('.sw-vsel'))) await clickSel('[data-act="sp"]');
await dump('t1-after-sp');
if (await page.$('.sw-vsel-empty')) { await clickSel('[data-act="new"]'); await dump('t2-after-new'); }
// 世界创建表单：找 create 按钮/表单控件
await dump('t3-controls');
const btns = await page.evaluate(() => [...document.querySelectorAll('button, [data-act], .sw-btn')].map((e) => ({ cls: e.className.slice(0, 40), act: e.getAttribute('data-act'), txt: (e.textContent || '').slice(0, 24) })).slice(0, 30));
console.log('BTNS', JSON.stringify(btns));
await clickSel('[data-act="create"]');
await dump('t4-after-create');
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const inGame = await page.evaluate(() => !!(window.__swGame?.player)).catch(() => 'ERR');
  if (inGame === true) { console.log('IN-GAME after', (i + 1) * 5, 's'); break; }
  if (i % 6 === 5) await dump('wait' + i);
}
await dump('final');
await browser.close();
