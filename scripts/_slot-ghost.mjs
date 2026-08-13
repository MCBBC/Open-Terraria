// 一次性:装备槽幽灵图 + 防御计数器位置/叠加验证
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
const out = await page.evaluate(async () => {
  const ui = window.__swUI;
  ui.openInventory();
  await new Promise((r) => setTimeout(r, 700));
  // 1) 幽灵图:各装备槽空时应显示 .sw-slot-ghost
  const ghosts = [...document.querySelectorAll('.sw-slot .sw-slot-ghost')];
  const visible = ghosts.filter((g) => getComputedStyle(g).display !== 'none');
  // 头盔/胸甲/护腿槽帧采样（background-position 应分别为 0 0 / -34 0 / 0 -68）
  const armorGhost = (idx) => {
    const slot = document.querySelector(`[data-idx="${idx}"][data-where="armor"] .sw-slot-ghost`);
    return slot ? getComputedStyle(slot).backgroundPosition : null;
  };
  const miscGhost = (idx) => {
    const slot = document.querySelector(`[data-idx="${idx}"][data-where="misc"] .sw-slot-ghost`);
    return slot ? getComputedStyle(slot).backgroundPosition : null;
  };
  // 2) 装上头盔 → 幽灵应隐藏
  const g = window.__swGame;
  const helmetId = window.__swFlow.itemByKey('vi_268_diving_helmet');
  g.player.inv.armor[0] = { id: helmetId, stack: 1 };
  ui.refreshAll();
  await new Promise((r) => setTimeout(r, 200));
  const helmetGhostHidden = (() => {
    const s = document.querySelector('[data-idx="0"][data-where="armor"] .sw-slot-ghost');
    return s ? getComputedStyle(s).display === 'none' : null;
  })();
  g.player.inv.armor[0] = null;
  ui.refreshAll();
  // 3) 防御计数器:在面板内 + 数字叠加在盾上 + 显示玩家防御
  const defEl = document.querySelector('[data-role="defense"]');
  const defRect = defEl ? defEl.getBoundingClientRect() : null;
  const num = defEl?.querySelector('span');
  const numRect = num ? num.getBoundingClientRect() : null;
  const shieldCv = defEl?.querySelector('canvas');
  const shieldRect = shieldCv ? shieldCv.getBoundingClientRect() : null;
  const centered = numRect && shieldRect
    ? Math.abs((numRect.left + numRect.right) / 2 - (shieldRect.left + shieldRect.right) / 2) < 3 : false;
  // 防御计数器在装备列（面板左区）内：取面板最左 40% 高度 30-70% 区间
  const panel = document.querySelector('.sw-root > .sw-panel');
  const pr = panel.getBoundingClientRect();
  const inLeftArea = defRect ? (defRect.left - pr.left) < pr.width * 0.45 : false;
  // 悬停 tooltip
  defEl.dispatchEvent(new MouseEvent('mouseenter'));
  await new Promise((r) => setTimeout(r, 150));
  const tip = document.querySelector('.sw-tooltip, [class*="tooltip"]');
  const tipText = tip ? tip.textContent : null;
  defEl.dispatchEvent(new MouseEvent('mouseleave'));
  ui.closeInventory();
  return {
    ghostCount: ghosts.length, ghostVisible: visible.length,
    helmetPos: armorGhost(0), chestPos: armorGhost(1), legsPos: armorGhost(2),
    accPos: armorGhost(3), vanityHelmPos: armorGhost(10), dyePos: armorGhost?.(0) ?? null,
    petPos: miscGhost(0), hookPos: miscGhost(4),
    helmetGhostHidden,
    defNum: num?.textContent, defCenteredOnShield: centered, defInLeftArea: inLeftArea,
    tipText,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
