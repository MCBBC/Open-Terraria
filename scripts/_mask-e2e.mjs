// 一次性:克苏鲁之眼面具(2112)穿戴浏览器实测
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const inv = g.player.inv;
  // 游戏侧 id（桥）——面具走 vi_2112_EyeMask
  const mask = window.__swFlow.itemByKey('vi_2112_EyeMask');
  if (mask == null || mask < 0) return { err: 'mask id 未取到', mask };
  // ① 右键一键装备 → 社交头盔位 armor[10]
  inv.slots[20] = { id: mask, stack: 1 };
  ui.swapEquipItem(inv.slots[20], 'inv', 20);
  const rightClick = { slot10: inv.armor[10]?.id === mask, functionalHeadClean: inv.armor[0] == null };
  // 卸下再来
  inv.armor[10] = null;
  // ② armorAccepts 直查
  const accepts = { to10: inv.armorAccepts(10, mask), to0: inv.armorAccepts(0, mask), to1: inv.armorAccepts(1, mask) };
  // ③ 同款互斥:功能头位已有同面具 → 社交位拒
  inv.armor[0] = { id: mask, stack: 1 };
  const mutex = { socialBlocked: inv.armorAccepts(10, mask) === false };
  inv.armor[0] = null;
  // ④ UI 可见性:开背包,社交头盔格应显示面具图标(非幽灵)
  ui.openInventory();
  return { mask, rightClick, accepts, mutex };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
