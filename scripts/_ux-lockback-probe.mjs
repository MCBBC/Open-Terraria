// UX 探针:跨标签页世界锁拒绝 → 应回世界列表(非裸背景死态)。
// 页 A 进入世界;页 B(同 profile/同 IDB/同 WebLocks 域)点同一世界的 Play →
// 锁 busy → toast + 断言页 B 回到世界列表面板(.sw-vsel 在场且有世界条目)。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const LOG = fs.openSync('/tmp/ux-lockback.log', 'w');
const log = (t) => { fs.writeSync(LOG, t + '\n'); console.log(t); };

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  userDataDir: '/tmp/ux-lockback-' + Date.now() % 100000,
  args: ['--no-proxy-server'],
  defaultViewport: { width: 1400, height: 860 },
});
const pageA = await browser.newPage();
const pageB = await browser.newPage();
pageA.on('pageerror', (e) => log(`A PAGE-EXC ${String(e).slice(0, 160)}`));
pageB.on('pageerror', (e) => log(`B PAGE-EXC ${String(e).slice(0, 160)}`));

// 两页共用同一 profile → 先在 A 打开(B 稍后再开,共享 IDB/locks)
await pageA.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await pageA.waitForFunction(() => document.body && document.body.innerText.includes('单人模式'), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1200));
const clickText = (page, txt) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === t && e.offsetParent);
  if (!els.length) return false;
  els[els.length - 1].click();
  return true;
}, txt);

// A:单人 → 新建角色 → 创建 → 选角色 → 新建世界 → 创建 → 进世界
log(`A boot: ${await clickText(pageA, '单人模式')}`);
await new Promise((r) => setTimeout(r, 1200));
log(`A 新建(角色): ${await clickText(pageA, '新建')}`);
await new Promise((r) => setTimeout(r, 1500));
await pageA.evaluate(() => {
  const b = document.querySelector('[data-act="create"]');
  if (b && b.offsetParent) b.click();
});
await new Promise((r) => setTimeout(r, 1500));
await pageA.evaluate(() => {
  const row = document.querySelector('.sw-vitem.sw-vpanel-item');
  if (row && row.offsetParent) row.click();
});
await new Promise((r) => setTimeout(r, 1500));
log(`A 新建(世界): ${await clickText(pageA, '新建')}`);
await new Promise((r) => setTimeout(r, 1200));
log(`A 创建世界: ${await clickText(pageA, '创建世界')}`);
await new Promise((r) => setTimeout(r, 900));
log(`A 创建: ${await clickText(pageA, '创建')}`);
await pageA.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 420000, polling: 2000 });
log('A IN-GAME');

// B:同 profile 开页(共享 WebLocks 域) → 走到世界列表 → Play 同一世界
await pageB.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await pageB.waitForFunction(() => document.body && document.body.innerText.includes('单人模式'), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1200));
log(`B boot: ${await clickText(pageB, '单人模式')}`);
await new Promise((r) => setTimeout(r, 1200));
// B 的角色列表:上一角色为 last-char —— 直接点第一行进入
await pageB.evaluate(() => {
  const row = document.querySelector('.sw-vitem.sw-vpanel-item');
  if (row && row.offsetParent) row.click();
});
await new Promise((r) => setTimeout(r, 1500));
const hasWorlds = await pageB.evaluate(() => document.querySelectorAll('.sw-vsel .sw-vitem').length);
log(`B 世界条目: ${hasWorlds}`);
if (!hasWorlds) { log('FATAL: B 未到世界列表'); process.exit(1); }
// 点第一个世界的 Play
await pageB.evaluate(() => {
  const item = document.querySelector('.sw-vsel .sw-vitem');
  const play = [...(item?.querySelectorAll('img') ?? [])].find((i) => (i.getAttribute('src') ?? '').includes('UI_ButtonPlay'));
  const btn = play?.closest('.sw-vico') ?? play?.parentElement;
  (btn ?? item).dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 3000));
// 断言:toast 出现 + 世界列表回退(非裸背景)
const st = await pageB.evaluate(() => ({
  toast: [...document.querySelectorAll('[class*=toast],[class*=Toast]')].map((d) => d.textContent?.trim()).filter(Boolean).slice(0, 2),
  bodyHasList: !!document.querySelector('.sw-vsel .sw-vitem'),
  bodyText: document.body.innerText.slice(0, 120).replace(/\n+/g, '|'),
}));
log(`B 失败后状态: ${JSON.stringify(st)}`);
const ok = st.bodyHasList && (st.toast.join('').includes('标签页') || st.toast.join('').length > 0);
log(ok ? 'UX-OK: 拒载后已回世界列表' : 'UX-BAD: 未回世界列表');
await pageB.screenshot({ path: '/tmp/las-shots/ux-lockback.png' });

await browser.close();
log('UX-PROBE-DONE');
process.exit(ok ? 0 : 2);
