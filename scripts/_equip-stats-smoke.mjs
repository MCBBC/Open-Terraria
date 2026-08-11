// 装备属性生效冒烟：vi_ 盔甲可装备+防御 / 配饰词缀效益 / 再生手环回复（scripts/_equip-stats-smoke.mjs）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
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
  await page.keyboard.type('equip测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise(r => setTimeout(r, 200));
await page.click('[data-act=create]');
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

const res = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const out = {};
  // 1. vi_ 盔甲直穿 + 防御
  const helm = g.itemId('vi_37_Goggles');       // 护目镜 头+1 防
  const legs = g.itemId('vi_77_IronGreaves');   // 铁护胫 腿+2 防
  g.player.inv.armor[0] = { id: helm, stack: 1 };
  g.player.inv.armor[2] = { id: legs, stack: 1 };
  out.defenseAfterEquip = g.player.defense; // 期望 3
  // 2. 配饰 + Warding 词缀（65 → 防+4）
  const band = g.itemId('vi_49_BandofRegeneration');
  g.player.inv.armor[3] = { id: band, stack: 1, prefix: 65 };
  out.defWithWarding = g.player.defense;   // 期望 7
  out.hpPerSec = g.player.equipStats.hpPerSec; // 期望 1（life2/2）
  // 3. 赫尔墨斯靴 → 移速 ×2
  const hermes = g.itemId('vi_54_HermesBoots');
  g.player.inv.armor[4] = { id: hermes, stack: 1 };
  out.moveMult = g.player.equipStats.moveMult; // 期望 2
  // 4. 星力手环 → 魔力 40
  const star = g.itemId('vi_111_BandofStarpower');
  g.player.inv.armor[5] = { id: star, stack: 1 };
  out.maxMana = g.player.maxMana; // 期望 40
  // 5. 右键一键装备 vi_ 盔甲（从背包）
  g.player.inv.armor[0] = null;
  g.player.inv.add(helm, 1);
  ui.refreshAll();
  let idx = -1;
  for (let i = 0; i < 58; i++) if (g.player.inv.slots[i]?.id === helm) { idx = i; break; }
  const slot = document.querySelector(`.sw-slot[data-idx="${idx}"][data-where="inv"]`);
  slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
  out.rightClickEquipVi = g.player.inv.armor[0]?.id === helm;
  return out;
});
console.log('EQUIP_STATS', JSON.stringify(res));
console.log('ERRORS', JSON.stringify(errs.slice(0, 4)));
await browser.close();
