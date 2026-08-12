// 背包 UI 对齐冒烟（scripts/_invui-smoke.mjs）：
//   1. 逐 context 槽底贴图（装备/染料=Back13、杂项=Back3/12、箱=Back5、垃圾桶=Back7、收藏=Back10）
//   2. Loadout 三色染色（装备列 rgb(50,106,64)）+ 切套换色 + 白闪类
//   3. 金币跳字动画（CoinSlot 表驱动：img transform 非空 / 自旋层出现）
//   4. 转移 glow 层（setSlotGlow → .sw-glow-overlay + Back13 纹理）
//   5. 金币/弹药槽 31px（0.6 缩放）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('UI测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (!hasWorld) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const inv = g.player.inv;
  const res = {};
  // 打开背包
  ui.openInventory();
  await new Promise(r => setTimeout(r, 300));

  const bgOf = (i, where) => {
    const el = document.querySelector(`[data-idx="${i}"][data-where="${where}"]`);
    return el ? getComputedStyle(el).backgroundImage : null;
  };
  const tintOf = (i, where) => {
    const el = document.querySelector(`[data-idx="${i}"][data-where="${where}"]`);
    return el ? el.style.getPropertyValue('--slot-tint') : null;
  };
  res.armorBg13 = (bgOf(0, 'armor') ?? '').includes('Inventory_Back13');
  res.vanityBg13 = (bgOf(10, 'armor') ?? '').includes('Inventory_Back13');
  res.dyeBg13 = (bgOf(0, 'dye') ?? '').includes('Inventory_Back13');
  res.invBgDefault = (bgOf(10, 'inv') ?? '').includes('Inventory_Back.png');
  res.trashBg7 = !!document.querySelector('.sw-trash') && getComputedStyle(document.querySelector('.sw-trash')).backgroundImage.includes('Inventory_Back7');
  // 收藏 → Back10
  inv.slots[10] = { id: g.itemId('vi_8_torch'), stack: 1, favorited: true };
  ui.refreshAll();
  res.favBg10 = (bgOf(10, 'inv') ?? '').includes('Inventory_Back10');
  inv.slots[10] = null;

  // Loadout 染色（默认套 0：装备 rgb(50,106,64) / 时装 rgb(46,106,98) / 染料 rgb(45,85,105)）
  res.tintArmor0 = tintOf(0, 'armor');
  res.tintVanity0 = tintOf(10, 'armor');
  res.tintDye0 = tintOf(0, 'dye');
  // 切到套 1 → 三列换色 + 白闪类
  ui.invPanel.classList.add('x'); // noop 触发 layout
  inv.trySwitchingLoadout(1);
  ui.refreshAll();
  res.tintArmor1 = tintOf(0, 'armor');
  res.tintDye1 = tintOf(0, 'dye');
  // Loadout 按钮图集（Extra_259 背景 + 选中列 1）
  const btn = document.querySelector('.sw-loadout-btn[data-lo="1"]');
  res.loadoutBtnAtlas = btn ? getComputedStyle(btn).backgroundImage.includes('Extra_259') : false;
  res.loadoutBtnSel = btn ? btn.style.backgroundPosition : null;
  inv.trySwitchingLoadout(0);
  ui.refreshAll();

  // 金币跳字：给金币 → 检测 img transform / 自旋层
  inv.slots[50] = null; ui.refreshAll();
  await new Promise(r => setTimeout(r, 80));
  inv.slots[50] = { id: g.itemId('vi_71_copper_coin'), stack: 50 };
  ui.refreshAll();
  await new Promise(r => setTimeout(r, 260));
  const coinEl = document.querySelector('[data-idx="50"][data-where="inv"]');
  const coinImg = coinEl?.querySelector('img');
  res.coinJumpTransform = coinImg ? coinImg.style.transform : 'none';
  res.coinCountText = coinEl?.querySelector('.cnt')?.textContent ?? null;
  await new Promise(r => setTimeout(r, 600)); // 动画结束自清理
  res.coinJumpCleaned = coinImg ? coinImg.style.transform === '' : false;

  // 金币/弹药槽 31px
  res.coinSmall = coinEl ? getComputedStyle(coinEl).width : null;
  const ammoEl = document.querySelector('[data-idx="54"][data-where="inv"]');
  res.ammoSmall = ammoEl ? getComputedStyle(ammoEl).width : null;

  // glow 层
  ui.setSlotGlow('inv', 12, 0.31);
  const glowEl = document.querySelector('[data-idx="12"][data-where="inv"]');
  res.glowOverlay = !!glowEl?.querySelector('.sw-glow-overlay');
  res.glowBg13 = glowEl ? glowEl.style.backgroundImage.includes('Inventory_Back13') : false;
  res.glowColor = glowEl?.querySelector('.sw-glow-overlay')?.style.getPropertyValue('--glow') ?? null;
  await new Promise(r => setTimeout(r, 5200)); // 5s 后自动清理
  res.glowCleaned = !!glowEl && !glowEl.querySelector('.sw-glow-overlay') && glowEl.style.backgroundImage.includes('Inventory_Back.png');

  ui.closeInventory();
  return res;
});

console.log(JSON.stringify(out, null, 1));
console.log('ERRORS', JSON.stringify(errs));
await browser.close();
