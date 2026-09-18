// BJ165 修后验证探针:①成功反馈=飘字无 toast ②金条随重铸态整隐 ③锤悬停「重铸」应答。
// 运行:SW_ORIGIN=http://localhost:5242 node tools/run-diag.mjs --timeout=300000 scripts/_bj165-reforge-verify.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5242';
const SHOT = process.env.SHOT_PREFIX ?? '/tmp/bj165-after';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e.stack || e.message).slice(0, 300)));
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(600);
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); window.__swUI.closeInventory(); });
await sleep(200);

// 真实链开重铸
await page.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window.__ovGoblin) {
    const gob = new TownNPC('goblin_tinkerer', g.player.x + 40, g.world.groundLevel * 16 - 48);
    gob.home = null;
    g.entities.add(gob, 'npcs');
    window.__ovGoblin = gob;
  }
  const gob = window.__ovGoblin;
  gob.dead = false;
  const st = g.world.store;
  const col = Math.floor(gob.cx / 16);
  let gy = Math.max(0, Math.floor((gob.y + gob.h + 2) / 16));
  let solid = st.get(col, gy) !== 0 && st.hasTile(col, gy);
  for (let k = 0; k < 40 && !solid; k++) { gy++; solid = st.get(col, gy) !== 0 && st.hasTile(col, gy); }
  g.player.x = gob.cx - g.player.w / 2;
  g.player.y = gy * 16 - g.player.h - 1;
  g.player.vx = 0; g.player.vy = 0;
  if (!g.npcDialogActive) g.openNpcDialog(gob);
});
await sleep(300);
let refOpen = false;
for (let attempt = 0; attempt < 3 && !refOpen; attempt++) {
  await page.evaluate(() => {
    const g = window.__swGame, gob = window.__ovGoblin;
    gob.dead = false;
    gob.x = g.player.x + 30; gob.y = g.player.y;
    if (!g.npcDialogActive || !g.dialogNpc) g.openNpcDialog(gob);
  });
  await page.waitForFunction(() => {
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="reforge"]');
    return !!b && b.getBoundingClientRect().width > 0;
  }, { timeout: 10000, polling: 120 }).catch(() => {});
  await page.evaluate(() => { window.__swGame.npcDialogButton('reforge'); });
  await sleep(450);
  refOpen = await page.evaluate(() => !!window.__swUI.vinvReforgeOpen);
}
console.log(refOpen ? 'PASS reforge open' : 'FAIL reforge open');

// 放入物品
await page.evaluate(async () => {
  const ui = window.__swUI;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const id = Number(ITEM_BY_KEY['vi_98_Minishark'] ?? ITEM_BY_KEY['vi_24_WoodenSword']);
  window.__refId = id;
  ui.reforgeItem = { id, stack: 1, prefix: 0 };
  ui.refreshAll();
  await new Promise((r) => setTimeout(r, 400));
});
await sleep(400);

// ---- 断言②:重铸态指示条整隐(金渐变 canvas) ----
const barCheck = await page.evaluate(() => {
  const ui = window.__swUI;
  // 指示条 = vinvLayoutItems 中 canvas 元素(重构面唯一 canvas)
  const items = ui.vinvLayoutItems.filter((it) => it.el.tagName === 'CANVAS');
  return items.map((it) => {
    const r = it.el.getBoundingClientRect();
    return { tag: it.el.tagName, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), display: it.el.style.display || '(default)' };
  });
});
console.log('reforge-open crafting-bar canvases =', JSON.stringify(barCheck), '(width 0/display none = 整隐 ✓)');
await page.screenshot({ path: `${SHOT}-1-reforge-open-no-bar.png` });

// ---- 断言③:锤悬停=「重铸」应答 ----
const hammerBox = await page.evaluate(() => {
  const h = window.__swUI.vinvReforgeHammerEl;
  const r = h.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, shown: r.width > 0 };
});
console.log('hammer shown =', hammerBox.shown, JSON.stringify({ x: hammerBox.x, y: hammerBox.y }));
await page.mouse.move(hammerBox.x, hammerBox.y);
await sleep(400);
const hover = await page.evaluate(() => {
  const t = document.querySelector('.sw-tooltip');
  return t && t.style.display !== 'none' ? { text: t.textContent, x: Math.round(t.getBoundingClientRect().x), y: Math.round(t.getBoundingClientRect().y) } : null;
});
console.log('hammer hover tooltip =', JSON.stringify(hover), '(「重铸」= vanilla inter[19] 应答面 ✓)');
await page.screenshot({ path: `${SHOT}-2-hammer-hover.png` });
await page.mouse.move(900, 500);
await sleep(300);

// ---- 断言③b:钱不足点击=静默(原版同相) ----
await page.evaluate(() => { window.__swGame.coinsOwned = () => 0; });
await page.evaluate(() => { window.__swUI.vinvReforgeHammerHit(); });
await sleep(300);
const poorToast = await page.evaluate(() => document.querySelector('.sw-toast')?.textContent ?? null);
console.log('poor-click toast =', JSON.stringify(poorToast), '(null=静默=原版 BuyItem 假同相)');

// ---- 断言①:有钱点击 → 无 toast,飘字出玩家头顶 ----
const rich = await page.evaluate(async () => {
  const ui = window.__swUI, g = window.__swGame;
  g.coinsOwned = () => 9999999;
  g.spendCopper = () => true;
  ui.vinvReforgeHammerHit();
  await new Promise((r) => setTimeout(r, 200));
  // 飘字池扫描(dmgNumbers label 支 = PopupText 对齐链)
  const labels = (g.dmgNumbers ?? []).filter((d) => d.label).map((d) => ({ label: d.label, color: d.color, x: Math.round(d.x), y: Math.round(d.y) }));
  return { toast: document.querySelector('.sw-toast')?.textContent ?? null, labels, newPrefix: ui.reforgeItem?.prefix };
});
console.log('rich-click toast =', JSON.stringify(rich.toast), '(null=自创 toast 退役 ✓)');
console.log('popup labels =', JSON.stringify(rich.labels), '(AffixName 飘字=原版 PopupText.ItemReforge 语义 ✓) newPrefix =', rich.newPrefix);
await page.screenshot({ path: `${SHOT}-3-rich-click-popup.png` });

// ---- 关对话 → 指示条回归(classic 锚复画) ----
await page.evaluate(() => { window.__swGame.closeNpcDialog(false); });
await page.waitForFunction(() => window.__swUI.vinvReforgeOpen === false, { timeout: 8000, polling: 120 });
await sleep(300);
const barBack = await page.evaluate(() => {
  const items = window.__swUI.vinvLayoutItems.filter((it) => it.el.tagName === 'CANVAS');
  return items.map((it) => { const r = it.el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; });
});
console.log('after-close crafting-bar canvases =', JSON.stringify(barBack), '(复画=classic 锚回归 ✓)');
await page.screenshot({ path: `${SHOT}-4-closed-bar-back.png` });

await browser.close();
