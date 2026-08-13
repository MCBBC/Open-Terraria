// 一次性探针:F6 面板召唤 Boss 的左下角世界消息公告(ChatMonitor)
//  1) 搜 4 召唤克眼 → .sw-chat-line 末行含"已苏醒"且色 rgb(175,75,255)
//  2) 搜 668 召唤鹿角怪 → 同款公告
//  3) 血月事件触发 → misc[8] 公告行(绿 50,255,130)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&f6ann=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });

const summonById = async (id) => page.evaluate((v) => {
  const g = window.__swGame;
  g.summonPanel?.close();
  g.toggleSummonPanel();
  const q = document.querySelector('[data-role=q]');
  q.value = String(v);
  q.dispatchEvent(new Event('input', { bubbles: true }));
  const row = document.querySelector('[data-role=list] > div');
  if (!row) return { err: 'no row' };
  row.click();
  return {};
}, id);

const chatLines = () => page.evaluate(() =>
  [...document.querySelectorAll('.sw-chat-line')].map((l) => ({ t: l.textContent, c: l.style.color })));

// 1) 克眼(4)
await summonById(4);
let lines = await chatLines();
const eoc = lines.filter((l) => l.t.includes('已苏醒'));
ok('eoc-awoken', eoc.length > 0, { last: lines.at(-1) });
ok('eoc-color-boss', eoc.some((l) => l.c === 'rgb(175, 75, 255)'), { eoc });
// Boss 槽接管 + 场上存在
const boss1 = await page.evaluate(() => ({ b: window.__swGame.boss?.vanillaId }));
ok('eoc-boss-slot', boss1.b === 4, boss1);
// 清怪再召下一个
await page.evaluate(() => window.__swGame.debugClearEnemies());

// 2) 鹿角怪(668):vanilla-npcs.json 提取自 1405(1.4.3 才有 668)→ 列表无匹配
//    (如实记录缺口;数据+AI_123 同批落地后改回"已苏醒"断言)
await summonById(668);
const deerRow = await page.evaluate(() => document.querySelector('[data-role=list] > div')?.textContent ?? '');
ok('deer-no-data-gap', deerRow.includes('无匹配'), { deerRow });
await page.evaluate(() => window.__swGame.debugClearEnemies());

// 3) 血月事件 → misc[8]("血月正在升起…")绿字(summonById 结束后面板开着,勿再 toggle)
await page.evaluate(() => {
  const g = window.__swGame;
  if (!g.summonPanel?.open) g.toggleSummonPanel();
});
const bmBtn = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('[data-role=events] button')].find((b) => b.textContent === '血月');
  if (!btn) return { err: 'no btn' };
  btn.click();
  return {};
});
lines = await chatLines();
const bm = lines.find((l) => l.t.includes('血月'));
ok('bloodmoon-announce', !!bm && bm.c === 'rgb(50, 255, 130)', { bm });

const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
