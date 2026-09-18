// 补充探针:右键一键装备门 canSwapEquip(UI.ts:1607)+swapEquipItem 路由(UI.ts:1636)
// 与拖放门 armorAccepts(UI.ts:1661/2361/2382)——勘探者 5588-5593 vs 对照 88/5583
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 200)));
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const { armorSlotIndexOfInternal } = await import('/src/data/vanillaItemStats.ts');
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const inv = window.__swGame.player.inv;
  const ui = window.__swUI;
  const iidOfVid = (vid) => {
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const d = ITEM_DEFS[i];
      if (!d) continue;
      const v = d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
      if (v === vid) return i;
    }
    return -1;
  };
  const rows = [];
  for (const vid of [5588, 5589, 5590, 5591, 5592, 5593, 88, 410, 411, 5583, 5584, 5585]) {
    const iid = iidOfVid(vid);
    rows.push({
      vid,
      swapEquipGate: ui.canSwapEquip(iid),            // 右键一键装备门(私法,运行时可调)
      swapEquipTarget: (() => {                        // swapEquipItem 路由目标(模拟 van=false 分支)
        const s = armorSlotIndexOfInternal(iid);
        const acc = (window.__swITEMS_ST ?? null, null);
        return s >= 0 ? ('armor[' + s + ']') : 'fall-to-dye/misc→silent-return';
      })(),
      dragGate: { h: inv.armorAccepts(0, iid), b: inv.armorAccepts(1, iid), l: inv.armorAccepts(2, iid) },
    });
  }
  return rows;
});
console.log('== 右键门 canSwapEquip + 拖放门 armorAccepts ==');
for (const r of out) console.log(JSON.stringify(r));
await browser.close();
