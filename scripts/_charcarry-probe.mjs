// 角色随身态(.plr 语义)E2E:角色甲在世界1拿到标记物存档退出 →
// 同角色创建全新世界2 → 背包/血量随身携带(新世界不再白手起家)。
// 标记物 vi_250 鱼缸(稳定 id≠内部下标,顺带验 playerFromDiskForm 映射)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newWorldViaUI() {
  await page.evaluate(() => { document.querySelector('.sw-list-footer [data-act=new]')?.click(); });
  await sleep(500);
  await page.evaluate(() => { document.querySelector('[data-g=size] .sw-wc-opt')?.click?.(); });   // 最小档
  await page.evaluate(() => { document.querySelector('.sw-wc-footer [data-act=create]')?.click?.(); });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player,
    { timeout: 420000, polling: 2000 });
  await sleep(2000);
}

try {
  // ---- 角色甲:创建 → 进 → 世界1 ----
  await page.evaluate(() => window.__swFlow.showCharSelect());
  await sleep(400);
  await page.evaluate(() => { document.querySelector('.sw-list-footer [data-act=new]')?.click(); });
  await sleep(400);
  await page.evaluate(() => {
    const i = document.querySelector('input[type=text]');
    if (i) { i.value = '甲'; i.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.evaluate(() => { document.querySelector('[data-act=create]')?.click?.(); });
  await sleep(600);
  await page.evaluate(() => { document.querySelectorAll('.sw-item')[0]?.querySelector('.ops button.primary')?.click?.(); });
  await sleep(700);
  console.log('  [步骤] 生成世界1…');
  await newWorldViaUI();
  console.log('  [步骤] 世界1进入,注入标记物并存档');

  // 注入标记物 + 血量特征,存档(charState 同步),退出
  const inj = await page.evaluate(() => {
    const g = window.__swGame;
    const key = Object.keys(window.__swItems).find((k) => k.startsWith('vi_250_'));
    const id = key ? window.__swItems[key] : -1;
    for (let i = 0; i < 10; i++) g.player.inv.slots[i] = null;
    g.player.inv.slots[0] = { id, stack: 7 };
    g.player.baseMaxHp = 160; g.player.hp = 137;      // 生命水晶扩容特征值
    g.cb.onInventoryChanged();
    return id;
  });
  check('世界1标记物注入(id>0)', inj > 0, `id=${inj}`);
  await page.evaluate(() => window.__swFlow.doSave());
  await sleep(5000);            // 等 worker 存档 + charState 同步
  await page.evaluate(() => window.__swFlow.quitToMenu());
  await sleep(2000);

  // ---- 同角色甲 → 全新世界2:随身携带断言 ----
  await page.evaluate(() => window.__swFlow.showCharSelect());
  await sleep(500);
  await page.evaluate(() => { document.querySelectorAll('.sw-item')[0]?.querySelector('.ops button.primary')?.click?.(); });
  await sleep(800);
  console.log('  [步骤] 生成世界2(同角色)…');
  await newWorldViaUI();
  console.log('  [步骤] 世界2进入,采样随身态');

  const sig = await page.evaluate(() => {
    const inv = window.__swGame.player.inv.slots;
    const key = (id) => Object.keys(window.__swItems).find((k) => window.__swItems[k] === id);
    return {
      items: inv.filter(Boolean).slice(0, 4).map((s) => ({ key: key(s.id), stack: s.stack })),
      hp: window.__swGame.player.hp, maxHp: window.__swGame.player.baseMaxHp,
    };
  });
  const carried = sig.items.length === 1 && /vi_250/.test(String(sig.items[0].key)) && sig.items[0].stack === 7;
  check('新世界背包随身携带(鱼缸×7,快捷栏其余为空)', carried, JSON.stringify(sig.items));
  check('生命扩容/血量随身(baseMaxHp=160/hp=137)', sig.maxHp === 160 && sig.hp === 137, `hp=${sig.hp}/${sig.maxHp}`);
} catch (e) {
  check('流程执行', false, String(e).slice(0, 140));
}
check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
