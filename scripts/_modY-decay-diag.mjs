// 一次性:modY 残留衰减对拍(2026-08-27 用户报"不灵敏/得点月亮上方才有效")——
//  复现:正午拖太阳(终点在太阳上方 200px=modY 残留 -200)→ 跳子夜抓月亮。
//  旧 bug:画布 (short) 截断衰减 ~4s 归零,DOM 纯浮点 ~90s → 命中层长时间悬在
//  月亮上方。修后:两侧同 decayCelestialModY,偏差应 ~3-4s 收敛到 0,期间在
//  可见月亮中心真按应咬合。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
// ★硬门:向日葵幕不撤=点击全被 z10000 吃掉(每次冷profile=SW全量重下)——不许静默放行
await page.waitForFunction(() => !document.getElementById('sw-boot-prime') && !document.getElementById('sw-splash'), { timeout: 240000, polling: 500 });
await new Promise((r) => setTimeout(r, 600));

await page.evaluate(() => { window.__swMenuBg.setClockT(0.5); });   // 正午,太阳高位
// 等 tick 真跑起来(揭幕解冻)且 sunScreen 就位
for (let i = 0; i < 50; i++) {
  const ok = await page.evaluate(() => !window.__swMenuBg.paused && !!window.__swMenuBg.sky.sunScreen).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 300));
}
// 拖太阳:按下→向右上方拖 200px→松手(留下 modY≈-200 残留,画布侧写 sunModY)
const sun = await page.evaluate(() => ({ x: window.__swMenuBg.sky.sunScreen.x, y: window.__swMenuBg.sky.sunScreen.y }));
let dragLatch = false;
for (let tryN = 0; tryN < 3 && !dragLatch; tryN++) {
  await page.mouse.move(sun.x, sun.y);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 100));
  dragLatch = await page.evaluate(() => document.querySelector('.sw-title-celestial').classList.contains('grabbing'));
  if (!dragLatch) { await page.mouse.up(); await new Promise((r) => setTimeout(r, 2000)); }
}
const tBefore = await page.evaluate(() => +window.__swMenuBg.clock.timeOfDay.toFixed(4));
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(sun.x + i * 40, Math.max(0, sun.y - i * 20));
  await new Promise((r) => setTimeout(r, 30));
}
const tAfter = await page.evaluate(() => +window.__swMenuBg.clock.timeOfDay.toFixed(4));
const modYProbe = await page.evaluate(() => {
  const m = window.__swMenuBg.sky.moonScreen; const s = window.__swMenuBg.sky.sunScreen;
  const dr = document.querySelector('.sw-title-celestial').getBoundingClientRect();
  return { sunCy: s ? +(dr.y + dr.height / 2 - s.y).toFixed(1) : null, moonCy: m ? +(dr.y + dr.height / 2 - m.y).toFixed(1) : null };
});
await page.mouse.up();
console.log('DRAG', JSON.stringify({ dragLatch, tBefore, tAfter, modYProbe }));
// 跳子夜:画布月 moonModY=0(残留记在 sunModY),DOM 命中层带同一份 modY 残留
await page.evaluate(() => { window.__swMenuBg.setClockT(0.05); });
let nightDump = null;
for (let i = 0; i < 200; i++) {
  nightDump = await page.evaluate(() => {
    const bg = window.__swMenuBg;
    return { t: +bg.clock.timeOfDay.toFixed(4), dayTime: bg.dayTime, paused: bg.paused,
      moonScreen: !!bg.sky.moonScreen, moonTexW: bg.sky.moonTexs?.[0]?.width ?? null };
  }).catch(() => null);
  if (nightDump && nightDump.moonScreen) break;
  await new Promise((r) => setTimeout(r, 300));
}
if (!nightDump?.moonScreen) console.log('NIGHT-DUMP', JSON.stringify(nightDump));
await new Promise((r) => setTimeout(r, 200));

const samples = [];
for (let i = 0; i < 14; i++) {
  const s = await page.evaluate(() => {
    const bg = window.__swMenuBg;
    const m = bg.sky.moonScreen;
    const dr = document.querySelector('.sw-title-celestial').getBoundingClientRect();
    return { off: m ? +(dr.y + dr.height / 2 - m.y).toFixed(1) : null,
      offX: m ? +(dr.x + dr.width / 2 - m.x).toFixed(1) : null,
      dayTime: bg.dayTime, t: +bg.clock.timeOfDay.toFixed(3) };
  });
  samples.push(s);
  await new Promise((r) => setTimeout(r, 500));
}
// 收敛后在可见月亮中心真按验闩(月亮若已翻回昼,重跳夜再取)
await page.evaluate(() => { if (window.__swMenuBg.dayTime) window.__swMenuBg.setClockT(0.05); });
await new Promise((r) => setTimeout(r, 400));
const latchPos = await page.evaluate(() => window.__swMenuBg.sky.moonScreen);
let latch = false;
if (latchPos) {
  await page.mouse.move(latchPos.x, latchPos.y);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 100));
  latch = await page.evaluate(() => document.querySelector('.sw-title-celestial').classList.contains('grabbing'));
  await page.mouse.up();
}
console.log(JSON.stringify({ samples, latchAtVisibleMoon: latch }, null, 1));
await browser.close();
