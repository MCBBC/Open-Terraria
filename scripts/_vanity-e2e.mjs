// 一次性:时装装备浏览器实测（右键 FamiliarShirt→社交胸甲位 / AngelHalo→社交配饰位）
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
  // 游戏侧桥取 id（勿用页内 import——HMR fork 双实例坑）
  const shirt = window.__swFlow.itemByKey('vi_269_FamiliarShirt');
  const halo = window.__swFlow.itemByKey('vi_1987_AngelHalo');
  const boots = window.__swFlow.itemByKey('vi_54_hermes_boots');
  // ① 右键时装衬衫 → 社交胸甲位 armor[11]
  inv.slots[20] = { id: shirt, stack: 1 };
  ui.swapEquipItem(inv.slots[20], 'inv', 20);
  const shirtPlaced = { slot11: inv.armor[11]?.id === shirt, functionalClean: inv.armor[1] == null };
  // ② 右键天使光环（纯社交配饰）→ 社交配饰位 armor[13]
  inv.slots[21] = { id: halo, stack: 1 };
  ui.swapEquipItem(inv.slots[21], 'inv', 21);
  const haloPlaced = { slot13: inv.armor[13]?.id === halo, functionalClean: inv.armor[3] == null };
  // ③ 右键赫尔墨斯靴（功能配饰）→ 功能位 armor[3]
  inv.slots[22] = { id: boots, stack: 1 };
  ui.swapEquipItem(inv.slots[22], 'inv', 22);
  const bootsPlaced = { slot3: inv.armor[3]?.id === boots };
  // ④ 拖拽路径预校验（armorAccepts 直查）
  const accepts = {
    shirtTo11: inv.armorAccepts(11, shirt),
    haloTo13: inv.armorAccepts(13, halo),
    haloTo3: inv.armorAccepts(3, halo),
  };
  // 清理
  inv.armor[11] = null; inv.armor[13] = null; inv.armor[3] = null;
  ui.refreshAll();
  return { shirtPlaced, haloPlaced, bootsPlaced, accepts };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
