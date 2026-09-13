// 调试:设置钮/勾选框title/切换钮/附近箱钮 四点取证
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', (e.stack || e.message).slice(0, 120)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
await new Promise((r) => setTimeout(r, 800));
const v = await page.evaluate(async () => {
  const ui = window.__swUI;
  const g = window.__swGame;
  const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
  const iidOf = (vid) => { const k = VANILLA_ITEM_KEY_BY_ID[vid]; return k !== undefined ? ITEM_BY_KEY[k] : undefined; };
  if (iidOf(9)) g.player.inv.add(iidOf(9), 99);
  ui.openInventory(true);
  await ui.refreshAllAsync();
  await new Promise((r) => setTimeout(r, 150));
  const vinv = document.querySelector('.sw-vinv');
  const out = {};
  out.vinvRootClass = ui.vinvRoot?.className;
  out.vinvRootIsQuery = vinv === ui.vinvRoot;
  // 设置钮
  const sBtn = [...vinv.querySelectorAll('button')].find((b) => b.textContent === '设置' || b.textContent === 'Settings');
  out.settingsBtn = sBtn ? { text: sBtn.textContent, style: (sBtn.getAttribute('style') || '').slice(0, 80), visible: sBtn.offsetParent !== null } : null;
  out.any18 = [...vinv.querySelectorAll('*')].filter((e) => (e.getAttribute('style') || '').includes('font-size:18px')).length;
  // 全部 title
  out.titles = [...vinv.querySelectorAll('[title]')].filter((e) => e.title !== '').map((e) => ({ t: e.title.slice(0, 14), bg: (e.style.backgroundImage || e.style.backgroundPosition || '').slice(0, 44) }));
  // 切换钮
  const togImg = ui.vinvGridToggleImg;
  out.tog = togImg ? { parentVis: togImg.parentElement.offsetParent !== null, rect: togImg.parentElement.getBoundingClientRect().toJSON(), disp: togImg.parentElement.style.display } : null;
  out.gridCtl = (window.__swOptions || {}).craftingGridControl;
  // 附近箱钮:查 vinv 内 UI_ChestCraft 图
  out.nearImgs = [...vinv.querySelectorAll('img')].filter((i) => i.src.includes('UI_ChestCraft')).length;
  out.craftNearbyToggleImg = !!ui.craftNearbyToggleImg;
  // 经典列表可见性
  out.cells = ui.vinvCraftCellEls.length;
  out.classicVisible = ui.vinvClassicCraftVisible ? ui.vinvClassicCraftVisible() : 'n/a';
  out.listElVisible = ui.vinvCraftListEl ? 'has-field' : 'no-field';
  return out;
});
console.log(JSON.stringify(v, null, 1));
await browser.close();
