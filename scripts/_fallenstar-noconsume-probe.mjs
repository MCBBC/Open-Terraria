// 坠落星 75 / 彩带 1345 不可消耗运行时探针（2026-09-25 翻案刀验证）：
// 热栏 0=坠落星×3 / 1=彩带×3,各选中点击 40 tick（覆盖 useTime17/20 冷却+起手拍）,
// 断言 stack 零减少;记录 useTime 峰值（举持冷却在位=动画面未被误摘）与挥摆登记。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) {
  await new Promise(r => setTimeout(r, 5000));
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player))) break;
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const inv = g.player.inv;
  const IBK = (id) => {
    for (const [k, v] of Object.entries(g.cb?.items ?? {})) {}
    return null;
  };
  const itemsMod = null;
  return { keysProbe: true };
});
// items 索引在模块里——经 import 拿
const out2 = await page.evaluate(async () => {
  const g = window.__swGame;
  const inv = g.player.inv;
  const items = await import('/src/data/items.ts');
  const DEFS = items.ITEM_DEFS, IBK = items.ITEM_BY_KEY;
  const idOf = (k) => IBK[k] ?? DEFS.findIndex((d) => d?.key === k);
  const starId = idOf('vi_75_fallen_star');
  const confId = idOf('vi_1345_Confetti');
  if (starId < 0 || confId < 0) return { fail: 'def id not found', starId, confId };
  inv.slots[0] = { id: starId, stack: 3 };
  inv.slots[1] = { id: confId, stack: 3 };
  const res = {};
  // —— 坠落星：选中热栏 0,点击 12t（一次起手）,再按住 60t（验证边沿门:不重复响/不再耗）——
  g.player.selectedSlot = 0;
  g.input.mouseX = 800; g.input.mouseY = 400; g.input.mouseDown = true; g.input.rightDown = false;
  let useTimePeak = 0, swingSeen = false;
  for (let i = 0; i < 72; i++) {
    g.fixedUpdate(1 / 60);
    useTimePeak = Math.max(useTimePeak, g.player.useTime);
    if (g.swing && g.swing.item != null) swingSeen = true;
  }
  g.input.mouseDown = false;
  g.fixedUpdate(1 / 60);
  res.star = {
    stackBefore: 3, stackAfter: inv.slots[0]?.stack ?? 0,
    useTimePeak, swingSeen,
  };
  // —— 彩带：热栏 1,按住 65t（autoReuse=原版按住连挥,仍不应消耗）——
  g.player.selectedSlot = 1;
  g.input.mouseDown = true;
  let confUsePeak = 0, confSwings = 0;
  for (let i = 0; i < 65; i++) {
    g.fixedUpdate(1 / 60);
    confUsePeak = Math.max(confUsePeak, g.player.useTime);
    if (g.swing && g.swing.t > 0) confSwings++;
  }
  g.input.mouseDown = false;
  g.fixedUpdate(1 / 60);
  res.confetti = { stackBefore: 3, stackAfter: inv.slots[1]?.stack ?? 0, useTimePeak: confUsePeak, swingFrames: confSwings };
  // —— 对照:坠落星弹面板仍可作为星星炮弹药（useAmmo=75 数据面在,不在本探针实射）——
  return res;
});
console.log(JSON.stringify(out2, null, 1));
await browser.close();
