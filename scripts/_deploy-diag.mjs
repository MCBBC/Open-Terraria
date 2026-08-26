// 角色选择跳转验证:①面板顶部无常驻角色选择器 ②房间码加入→角色选择浮层出现
// ③点角色行 → 浮层关闭、加入流程继续。
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
  const picker = panel ? [...panel.children].find((c) => c.style.display === 'block' && c.textContent?.includes('选择角色')) : null;
  return { selects: selects.length, pickerVisibleAtBoot: !!picker };
});
await p.evaluate(() => {
  const input = [...document.querySelectorAll('.sw-panel input')].find((i2) => i2.placeholder.includes('房间码'));
  input.value = '123456';
});
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('.sw-panel button')].find((b2) => b2.textContent === '加入');
  btn.click();
});
await new Promise((r) => setTimeout(r, 400));
const s2 = await p.evaluate(() => {
  const panel = [...document.querySelectorAll('.sw-panel')].find((x) => x.textContent?.includes('多人联机'));
  const picker = panel ? [...panel.children].find((c) => c.style.display === 'block' && c.textContent?.includes('选择角色')) : null;
  const rows = picker ? [...picker.querySelectorAll('div')].filter((d2) => d2.style.cursor === 'pointer').map((d2) => d2.textContent) : [];
  return { pickerVisible: !!picker, rows };
});
await p.evaluate(() => {
  const panel = [...document.querySelectorAll('.sw-panel')].find((x) => x.textContent?.includes('多人联机'));
  const picker = panel ? [...panel.children].find((c) => c.style.display === 'block') : null;
  const row = picker ? [...picker.querySelectorAll('div')].find((d2) => d2.style.cursor === 'pointer') : null;
  row?.click();
});
await new Promise((r) => setTimeout(r, 800));
const s3 = await p.evaluate(() => {
  const panel = [...document.querySelectorAll('.sw-panel')].find((x) => x.textContent?.includes('多人联机'));
  const picker = panel ? [...panel.children].find((c) => c.style.display === 'block') : null;
  return { pickerClosed: !picker || picker.style.display === 'none' };
});
console.log(JSON.stringify({ s1, s2, s3, errs: errs.length }, null, 1));
const ok = s1.selects === 1 && !s1.pickerVisibleAtBoot && s2.pickerVisible && s3.pickerClosed;
await b.close();
process.exit(ok ? 0 : 1);
