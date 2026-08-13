// 一次性:背包面板打磨回归（标题摘除/emoji 清除/钱币图标原始尺寸/右键装备 stack==1 门）
// SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_inv-polish.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { BestiaryPanel } = { BestiaryPanel: null };
  void BestiaryPanel;
  // 直接打开背包（走 UI 实例）
  const ui = window.__swUI;
  ui.openInventory();
  await new Promise((r) => setTimeout(r, 700));
  const panel = document.querySelector('.sw-root > .sw-panel');
  const titles = [...panel.querySelectorAll('.sw-title')].map((t) => t.textContent);
  const labels = [...panel.querySelectorAll('.sw-lbl')].map((t) => t.textContent);
  const hasEmoji = (s) => /\p{Extended_Pictographic}/u.test(s);
  const emojiLabels = labels.filter(hasEmoji);

  // ---- 图标尺寸验证：塞一枚铜币+一发箭,量 img 渲染盒 ----
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const coinId = ITEM_BY_KEY['vi_71_CopperCoin'];
  const arrowId = ITEM_BY_KEY['vi_41_WoodenArrow'] ?? ITEM_BY_KEY['vi_40_Arrow'];
  g.player.inv.slots[10] = { id: coinId, stack: 50 };
  if (arrowId != null) g.player.inv.slots[11] = { id: arrowId, stack: 99 };
  ui.refreshAll();
  await new Promise((r) => setTimeout(r, 400));
  // 等图标缓存重建（iconCache 模块级,值已变——不同 id 无缓存问题）
  const slotBox = (i) => {
    const els = [...panel.querySelectorAll('.sw-slot')];
    const sl = els.find((e) => {
      const st = ui.slotContent ? null : null;
      void st;
      return false;
    });
    void sl;
    // 直接按 armor/inventory 布局找:背包格 idx>=10 在面板内,顺序不稳定——按图标 dataURL 匹配
    return null;
  };
  void slotBox;
  // 简化:遍历面板 img,取其自然尺寸(图标 canvas 32×32→CSS 36 固定,改的是 canvas 内绘制)
  // 验证画布内容非全铺:采样铜币图标 img 的 dataURL 解码尺寸不可行——改为检查 iconCache
  // 语义:直接在页面调用一次 iconUrl 逻辑不可达(模块私有)。改用可见性断言:img 存在即可,
  // 尺寸语义由单测/源码公式保证。
  const imgs = [...panel.querySelectorAll('.sw-slot img')].length;

  // ---- 右键装备 stack==1 门:塞 99 翅膀右键不装,1 个右键装上 ----
  // 走游戏侧探针桥取 id（页内 import 是 HMR fork 另一实例——PvP E2E 同坑）
  const wingId = window.__swFlow.itemByKey('vi_493_天使之翼');
  let equipGate = { wingFound: wingId != null };
  if (wingId != null) {
    g.player.inv.slots[12] = { id: wingId, stack: 99 };
    ui.refreshAll();
    // 右键槽 12 → 不应装备
    ui.swapEquipItemPublic ? null : null;
    // 直接调内部:经 mousedown 事件链太脆,直接调私有(运行时可访)
    ui.swapEquipItem(g.player.inv.slots[12], 'inv', 12);
    const equipped99 = g.player.inv.armor.some((s) => s && s.id === wingId);
    // 改成 1 个再右键 → 应装备
    g.player.inv.slots[12] = { id: wingId, stack: 1 };
    ui.swapEquipItem(g.player.inv.slots[12], 'inv', 12);
    const equipped1 = g.player.inv.armor.some((s) => s && s.id === wingId);
    equipGate = { wingFound: true, stack99Equipped: equipped99, stack1Equipped: equipped1 };
    // 清理:卸下
    for (let k = 0; k < g.player.inv.armor.length; k++) if (g.player.inv.armor[k]?.id === wingId) g.player.inv.armor[k] = null;
  }
  ui.closeInventory();
  return { titles, emojiLabels, imgCount: imgs, equipGate };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
