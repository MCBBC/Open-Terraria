// 一次性探针:F6 召唤面板"事件触发"行——验证按钮齐备 + 各事件走自然入口
//  1) 面板打开 → 事件行 6 按钮
//  2) 血月 → bloodMoon=true(晷冷却清零)
//  3) 日食夜按 → 拦下(红字提示);昼按 → eclipse=true
//  4) 陨石 → meteorPending=true → 推进到午夜后 → 消费(落点/保护门走原链)
//  5) 哥布林(hp<200) → 拦下
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&f6evt=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });

// 打开面板 + 事件行按钮
const panel = await page.evaluate(() => {
  const g = window.__swGame;
  g.toggleSummonPanel();
  const btns = [...document.querySelectorAll('[data-role=events] button')].map((b) => b.textContent);
  return { open: g.summonPanel.open, btns };
});
ok('panel-events-6', panel.open && panel.btns.length === 6, panel);

const clickEvt = (label) => page.evaluate((t) => {
  const btn = [...document.querySelectorAll('[data-role=events] button')].find((b) => b.textContent === t);
  if (!btn) return { clicked: false };
  btn.click();
  const msg = document.querySelector('[data-role=msg]');
  return { clicked: true, msg: msg?.textContent ?? '', color: msg?.style.color ?? '' };
}, label);

// 血月
let r = await clickEvt('血月');
const bm = await page.evaluate(() => ({ bm: window.__swGame.world.clock.bloodMoon, sun: window.__swGame.world.sundialCooldown }));
ok('bloodmoon-flag', bm.bm === true && bm.sun === 0, { r, bm });

// 日食:先置夜 → 拦下;再置昼 → 成功
await page.evaluate(() => { window.__swGame.world.clock.timeOfDay = 0.9; });   // 夜
r = await clickEvt('日食');
const eclNight = await page.evaluate(() => ({ e: window.__swGame.world.clock.eclipse, msg: document.querySelector('[data-role=msg]')?.textContent }));
ok('eclipse-night-blocked', eclNight.e === false && eclNight.msg.includes('夜晚'), eclNight);
await page.evaluate(() => { window.__swGame.world.clock.timeOfDay = 0.5; });   // 昼(正午)
r = await clickEvt('日食');
const eclDay = await page.evaluate(() => window.__swGame.world.clock.eclipse);
ok('eclipse-day-set', eclDay === true, { r });

// 陨石:置 pending → 推进到午夜后(timeOfDay 0.05)跑几帧 → 消费
await page.evaluate(() => { window.__swGame.world.clock.timeOfDay = 0.9; });   // 夜(午夜前)——此刻不消费
r = await clickEvt('陨石坠落');
const pend = await page.evaluate(() => window.__swGame.meteorPending);
ok('meteor-pending', pend === true, { r });
await new Promise((r2) => setTimeout(r2, 300));   // 午夜前跑几帧,仍应 pending
const pendBeforeMid = await page.evaluate(() => window.__swGame.meteorPending);
ok('meteor-waits-midnight', pendBeforeMid === true, {});
await page.evaluate(() => { window.__swGame.world.clock.timeOfDay = 0.05; });  // 越过午夜
await new Promise((r2) => setTimeout(r2, 800));
const meteorAfter = await page.evaluate(() => {
  const g = window.__swGame;
  // 数地表陨石块(全图粗扫太慢,扫最近落点邻域不可知——直接扫浅层)
  const st = g.world.store;
  const M = g.tileByKey['ore_meteorite'];
  let n = 0;
  for (let x = 0; x < st.w; x += 1) {
    for (let y = 0; y < g.world.groundLevel + 20; y++) { if (st.type[st.idx(x, y)] === M) n++; }
  }
  return { pending: g.meteorPending, ore: n };
});
ok('meteor-consumed-after-midnight', meteorAfter.pending === false, meteorAfter);
ok('meteor-ore-placed', meteorAfter.ore > 0, meteorAfter);

// 哥布林:maxHp 100 < 200 → 拦下
r = await clickEvt('哥布林入侵');
const gob = await page.evaluate(() => ({ msg: document.querySelector('[data-role=msg]')?.textContent, inv: window.__swGame.world.invasionType }));
ok('goblin-blocked-lowhp', gob.inv === 0 && gob.msg.includes('无法开启'), gob);

const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
