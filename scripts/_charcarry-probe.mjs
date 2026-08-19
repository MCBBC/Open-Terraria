// 角色随身态(.plr 语义)E2E:两角色共用一世界——
// A) 角色1带物品存档退出;B) 新角色2(无随身态)进同一世界=回退世界内嵌(旧语义);
// C) 角色2换物品存档退出再进=随身态覆盖内嵌(.plr 优先级)。
// 标记物:vi_ 250 鱼缸(稳定 id≠内部下标,顺带验 playerFromDiskForm 映射)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 工具:驱动 DOM 面板 ----
async function createChar(name) {
  await page.evaluate(() => window.__swFlow.showCharSelect());
  await sleep(300);
  await page.click('.sw-list-footer [data-act=new]');   // 角色选择页 → 新建
  await sleep(300);
  await page.evaluate((n) => {
    const inp = document.querySelector('.sw-char-row input[type=text], input[type=text]');
    if (inp) { inp.value = n; inp.dispatchEvent(new Event('input', { bubbles: true })); }
  }, name);
  await page.click('[data-act=create]');                 // 创建角色
  await sleep(400);
}
async function enterChar(idx) {
  await page.evaluate(() => window.__swFlow.showCharSelect());
  await sleep(300);
  await page.evaluate((i) => {
    const items = document.querySelectorAll('.sw-item');
    items[i]?.querySelector('.ops button.primary')?.click();   // 进入
  }, idx);
  await sleep(300);
}
async function enterWorld(idx) {
  await sleep(300);
  await page.evaluate((i) => {
    // 世界选择页 = .sw-list-panel,条目 = .sw-item(ops 首钮=进入)
    const entry = document.querySelectorAll('.sw-list-panel .sw-item')[i];
    entry?.querySelector('.ops button')?.click();
  }, idx);
  console.log('  [步骤] 点击世界条目,等待进游戏…');
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 240000 }).catch((e) => { throw new Error('enterWorld 等待失败: ' + e.message); });
  await sleep(2500);
}
async function quitToMenu() {
  await page.evaluate(() => window.__swFlow.quitToMenu());
  await sleep(1200);
}
async function setMarker(vid, stack) {
  return page.evaluate(([v, s]) => {
    const g = window.__swGame;
    const key = Object.keys(window.__swItems).find((k) => k === `vi_${v}_` || k.startsWith(`vi_${v}_`));
    const id = key ? window.__swItems[key] : -1;
    // 清空快捷栏前 10 格 + 放标记物(便于断言"整包替换"而非叠加)
    for (let i = 0; i < 10; i++) g.player.inv.slots[i] = null;
    g.player.inv.slots[0] = { id, stack: s };
    g.cb.onInventoryChanged();
    return id;
  }, [vid, stack]);
}
const invSig = () => page.evaluate(() => {
  const inv = window.__swGame.player.inv.slots;
  return inv.map((s) => (s ? { key: (window.__swItems && Object.keys(window.__swItems).find((k) => window.__swItems[k] === s.id)) || s.id, stack: s.stack } : null)).filter(Boolean).slice(0, 6);
});

try {
  // ---- 世界 1:角色甲带入标记 A(鱼缸) → 存档退出 ----
  await createChar('甲');
  await enterChar(0);
  await sleep(300);
  // 世界选择页 → 新建世界
  await page.click('.sw-list-footer [data-act=new], [data-act=new]');
  await sleep(400);
  await page.evaluate(() => {
    // 最小世界(4200×1200):size 组第一个选项
    document.querySelector('[data-g=size] .sw-wc-opt')?.click?.();
  });
  await page.click('.sw-wc-footer [data-act=create]');
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
  await sleep(2500);
  const A = await setMarker(250, 7);
  check('标记物注入(id>0)', A > 0, `id=${A}`);
  await page.evaluate(() => window.__swFlow.doSave());
  await sleep(3500);          // 等 worker 存档 + charState 同步
  console.log('  [步骤] 存档后退出菜单');
  await quitToMenu();

  // ---- B) 新角色乙(无随身态)进同一世界:回退世界内嵌 → 应见标记 A ----
  await createChar('乙');
  await enterChar(1);
  await enterWorld(0);
  const sigB = await invSig();
  check('无随身态角色 → 回退世界内嵌(见甲的标记)', sigB.length === 1 && /vi_250/.test(String(sigB[0].key)) && sigB[0].stack === 7, JSON.stringify(sigB));

  // ---- C) 乙换标记 B(星星)存档退出再进:随身态覆盖内嵌 ----
  await setMarker(75, 3);     // vi_75 fallen star
  await page.evaluate(() => window.__swFlow.doSave());
  await sleep(3500);
  await quitToMenu();
  await enterChar(1);
  await enterWorld(0);
  const sigC = await invSig();
  check('乙重进:随身态覆盖(只剩乙的星星,甲的鱼缸被替换)', sigC.length === 1 && /vi_75/.test(String(sigC[0].key)) && sigC[0].stack === 3, JSON.stringify(sigC));

  // ---- D) 甲再进:甲的随身态仍是鱼缸(.plr 各自独立) ----
  await quitToMenu();
  await enterChar(0);
  await enterWorld(0);
  const sigD = await invSig();
  check('甲重进:甲的随身态(鱼缸)不受乙影响', sigD.length === 1 && /vi_250/.test(String(sigD[0].key)), JSON.stringify(sigD));
} catch (e) {
  check('流程执行', false, String(e).slice(0, 120));
}
check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
