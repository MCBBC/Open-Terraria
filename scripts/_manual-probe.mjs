// 说明书按钮 E2E:徽标闪烁 → 点开面板 → 我知道了熄泡 → 永久隐藏 → 设置重开
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));

// 1) 按钮在位 + 徽标闪烁(采样两帧 opacity 不同)
const st1 = await page.evaluate(async () => {
  const b = document.querySelector('.sw-manual-btn');
  const badge = document.querySelector('.sw-manual-badge');
  if (!b || !badge) return { btn: !!b, badge: !!badge };
  const o1 = getComputedStyle(badge).opacity;
  await new Promise((r) => setTimeout(r, 500));
  const o2 = getComputedStyle(badge).opacity;
  const r = b.getBoundingClientRect();
  const hb = document.querySelector('.sw-hotbar .sw-slot[data-idx="9"]')?.getBoundingClientRect();
  return { btn: true, badge: true, blink: o1 !== o2, o1, o2, rect: [r.x, r.y, r.width, r.height], slot10Right: hb ? hb.right : null };
});
console.log('STEP1', JSON.stringify(st1));
await page.screenshot({ path: '/tmp/manual-1-badge.png', clip: { x: 0, y: 0, width: 640, height: 140 } });

// 2) 点开面板
await page.click('.sw-manual-btn');
await new Promise((r) => setTimeout(r, 400));
const st2 = await page.evaluate(() => {
  const p = document.querySelector('.sw-manual-panel');
  if (!p) return { panel: false };
  const rows = p.querySelectorAll('.sw-manual-row').length;
  const secs = [...p.querySelectorAll('.sw-manual-sec')].map((s) => s.textContent);
  const paused = window.__swGame.paused;
  const ok = !!p.querySelector('.sw-manual-ok');
  const chk = !!p.querySelector('.sw-manual-hide input');
  return { panel: true, rows, secs, paused, ok, chk };
});
console.log('STEP2', JSON.stringify(st2));
await page.screenshot({ path: '/tmp/manual-2-panel.png' });

// 3) 不勾选直接"我知道了" → 面板关+徽标熄+按钮在+世界恢复
await page.click('.sw-manual-ok');
await new Promise((r) => setTimeout(r, 600));
const st3 = await page.evaluate(() => ({
  panelGone: !document.querySelector('.sw-manual-panel'),
  badgeGone: !document.querySelector('.sw-manual-badge'),
  btnKept: !!document.querySelector('.sw-manual-btn'),
  resumed: !window.__swGame.paused,
}));
console.log('STEP3', JSON.stringify(st3));

// 4) 重开面板勾"不再显示"+我知道了 → 按钮整体撤除
await page.click('.sw-manual-btn');
await new Promise((r) => setTimeout(r, 300));
await page.click('.sw-manual-hide input');
await page.click('.sw-manual-ok');
await new Promise((r) => setTimeout(r, 600));
const st4 = await page.evaluate(() => ({
  btnGone: !document.querySelector('.sw-manual-btn'),
  panelGone: !document.querySelector('.sw-manual-panel'),
}));
console.log('STEP4', JSON.stringify(st4));

// 5) 刷新重进(新世界) → 按钮仍隐藏(持久化生效)
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const st5 = await page.evaluate(() => ({ btnStillGone: !document.querySelector('.sw-manual-btn') }));
console.log('STEP5', JSON.stringify(st5));
await page.screenshot({ path: '/tmp/manual-3-hidden.png', clip: { x: 0, y: 0, width: 640, height: 140 } });
await browser.close();
