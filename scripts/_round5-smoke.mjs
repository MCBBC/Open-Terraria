// 五轮冒烟：天界石复合/十字项链无敌帧/宝藏磁石/蛙腿跳速/折扣卡重铸（scripts/_round5-smoke.mjs）
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
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('五轮测试');
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
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

const res = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const out = {};
  // 天界石：def+4/全系伤+10%/暴+2%
  p.inv.armor[3] = { id: g.itemId('vi_1865_CelestialStone'), stack: 1 };
  const st = p.equipStats;
  out.skyStone = { def: st.def, dmg: st.dmgMelee, crit: st.critMagic, life: st.hpPerSec };
  // 十字项链：iframes 翻倍
  p.inv.armor[4] = { id: g.itemId('vi_554_CrossNecklace'), stack: 1 };
  p.hp = 100; p.iframes = 0;
  p.damage(5, 0, 0, false);
  out.iframes = p.iframes;
  // 宝藏磁石：拾取范围 +94
  p.inv.armor[5] = { id: g.itemId('vi_5010_TreasureMagnet'), stack: 1 };
  out.grab = p.grabRangeBonus;
  // 蛙腿：jumpSpd 1.6
  p.inv.armor[6] = { id: g.itemId('vi_2423_FrogLeg'), stack: 1 };
  out.jumpSpd = p.equipStats.jumpSpd;
  // 折扣卡：重铸 8 折（铁阔剑 600 → 480）
  p.inv.armor[7] = { id: g.itemId('vi_5107_Magiluminescence'), stack: 1 }; // 占位（无折扣）
  const sword = g.itemId('vi_4_IronBroadsword');
  out.costNoDiscount = g.reforgeCost({ id: sword, stack: 1 });
  const disc = Object.keys(g.itemId) && null;
  void disc;
  // 找折扣卡 id：优惠卡 DiscountCard → 用 accfx 查？直接扫装备生效：手动给出 vi_854_DiscountCard
  try {
    p.inv.armor[7] = { id: g.itemId('vi_854_DiscountCard'), stack: 1 };
    out.costDiscount = g.reforgeCost({ id: sword, stack: 1 });
    out.discount = p.equipStats.discount;
  } catch { out.discountKey = 'missing'; }
  // 攀壁钉鞋（忍者大师 984）
  p.inv.armor[8] = { id: g.itemId('vi_984_MasterNinjaGear'), stack: 1 };
  out.spikedBoots = p.equipStats.spikedBoots;
  return out;
});
console.log('ROUND5', JSON.stringify(res));
console.log('ERRORS', JSON.stringify(errs.slice(0, 4)));
await browser.close();
