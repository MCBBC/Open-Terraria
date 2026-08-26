// 创建房间完整链路验证(空角色库):创建房间 → CharSelect → 新建 → CharCreation
// 表单 → [data-act=create] 创建角色 → 世界列表(.sw-wsel)出现 → 点首个世界行 →
// MP 面板恢复 + 建房继续(lobby 不可达 → 失败反馈属预期)。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
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
  return { saveSelGone: !panel?.querySelector('select') };
});
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('.sw-panel button')].find((b2) => b2.textContent === '创建房间');
  btn.click();
});
await new Promise((r) => setTimeout(r, 500));
const s2 = await p.evaluate(() => ({ charSelect: !!document.querySelector('.sw-vsel') }));
await p.evaluate(() => { document.querySelector('[data-act=new]')?.click(); });
await new Promise((r) => setTimeout(r, 500));
const s3 = await p.evaluate(() => ({ charCreation: !!document.querySelector('[data-act=create]') }));
// 捏人确认([data-act=create],默认外观直接创建)
await p.evaluate(() => { document.querySelector('[data-act=create]')?.click(); });
await new Promise((r) => setTimeout(r, 1500));
const s4 = await p.evaluate(() => {
  const wsel = document.querySelector('.sw-wsel, .sw-vsel');
  const worldRows = [...document.querySelectorAll('.sw-witem')].length
    || [...document.querySelectorAll('div')].filter((d2) => /中小.*世界|世界.*\d{3,4}/.test(d2.textContent ?? '')).length;
  return { worldSelectShown: worldRows > 0, rowsSample: worldRows };
});
// 世界列表出现后点首个世界行(onPlay)
await p.evaluate(() => {
  const row = document.querySelector('.sw-witem') || [...document.querySelectorAll('div')].find((d2) => /世界/.test(d2.textContent ?? '') && d2.style.cursor === 'pointer');
  row?.click();
});
await new Promise((r) => setTimeout(r, 1500));
const s5 = await p.evaluate(() => {
  const panel = [...document.querySelectorAll('.sw-panel')].find((x) => x.textContent?.includes('多人联机'));
  const created = panel?.textContent?.match(/房间码|房间已创建|加入房间/);
  return { mpPanelBack: !!panel, roomCreateFeedback: created ? created[0] : null, holderGone: !document.querySelector('[style*="z-index: 22"]') };
});
console.log(JSON.stringify({ s1, s2, s3, s4, s5, errs: errs.length }, null, 1));
await b.close();
process.exit(0);
