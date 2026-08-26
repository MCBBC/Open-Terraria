// 角色选择跳转终验:①面板顶部无角色选择器(select 仅建房存档一个) ②刷新按钮在
// 房间列表下方 ③输码点加入 → CharSelect 覆盖层出现(.sw-vsel) ④点角色行 → 覆盖层
// 移除、加入流程继续(lobby 不可达的失败反馈属预期)。
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
const s1 = await p.evaluate(() => {
  const panel = [...document.querySelectorAll('.sw-panel')].find((x) => x.textContent?.includes('多人联机'));
  const selects = panel ? [...panel.querySelectorAll('select')] : [];
  const refreshIdx = panel ? [...panel.children].findIndex((c) => (c.textContent ?? '') === '刷新房间') : -1;
  const listIdx = panel ? [...panel.children].findIndex((c) => c.style.minHeight?.includes('60')) : -1;
  return { selects: selects.length, refreshIdx, listIdx, refreshBelowList: refreshIdx > listIdx };
});
await p.evaluate(() => {
  const input = [...document.querySelectorAll('.sw-panel input')].find((i2) => i2.placeholder.includes('房间码'));
  input.value = '123456';
});
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('.sw-panel button')].find((b2) => b2.textContent === '加入');
  btn.click();
});
await new Promise((r) => setTimeout(r, 500));
const s2 = await p.evaluate(() => ({
  charSelectVisible: !!document.querySelector('.sw-vsel'),
  charRows: document.querySelectorAll('.sw-vitem').length,
}));
await p.evaluate(() => { document.querySelector('.sw-vitem')?.click(); });
await new Promise((r) => setTimeout(r, 800));
const s3 = await p.evaluate(() => ({ charSelectGone: !document.querySelector('.sw-vsel') }));
console.log(JSON.stringify({ s1, s2, s3, errs: errs.length }, null, 1));
const ok = s1.selects === 1 && s1.refreshBelowList && s2.charSelectVisible && s3.charSelectGone;
await b.close();
process.exit(ok ? 0 : 1);
