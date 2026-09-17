// 用户实报两处重叠取证/回归探针(2026-09-16):
//   A 重铸态 vs 左侧配方列表 —— 原版 Main.cs:42418 `else if (!InReforgeMenu && …)`:
//     重铸开启 = DrawRecipesList/标题/材料行/经典锚切换钮【整支不画】(带互斥,非移位)。
//     断言:重铸槽 (50,270)/文字 (100,270) 原位;重铸开启时标题+材料行+全部列表格
//     display:none(修前=格压槽可见 FAIL→修后 PASS);关闭后列表回归。
//   B modern 窗向导态 材料格 vs 需求行 —— 原版 NewCraftingUI.cs:440-487 逐字几何:
//     需求行 = vector+(52,36) → 绝对 (96,421);材料行 = (116+34j,391) 槽 52×0.7=36.4
//     → 槽底 427.4。原版 1 材料态 raw 带即压 6.4px(可见框底 426 vs 字顶 ~423=相切级),
//     断言改为【与原版逐字全等】(四值 ±1)而非"不相交"——原版同款观感=登记不动刀。
// 运行:SW_ORIGIN=http://localhost:5259 node tools/run-diag.mjs scripts/_vinv-reforge-guide-overlap.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5259';
const SHOT = process.env.SHOT_PREFIX ?? '/tmp/reforge-overlap';
const fails = [];
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(600);
await page.evaluate(() => {
  document.getElementById('sw-welcome-announce')?.remove();
  window.__swUI.closeInventory();
});
await sleep(200);

const measure = () => page.evaluate(() => {
  const ui = window.__swUI;
  const root = document.querySelector('.sw-vinv');
  const tr = getComputedStyle(root).transform;
  const K = tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1;
  const rr = root.getBoundingClientRect();
  const rel = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: +((b.y - rr.top) / K).toFixed(1), b: +((b.bottom - rr.top) / K).toFixed(1), l: +((b.x - rr.left) / K).toFixed(1), r: +((b.right - rr.left) / K).toFixed(1), shown: b.width > 0 && el.style.display !== 'none' }; };
  const cells = ui.vinvCraftCellEls.map((c, i) => ({ i, ...rel(c.el) }));
  const visibleCells = cells.filter((c) => c.shown);
  const detail = ui.vinvModernDetailEl;
  const slots = detail ? [...detail.querySelectorAll('.sw-slot')].map((s) => rel(s)) : [];
  const inter = (a, b) => !a || !b ? 0 : Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  return {
    K,
    reforge: {
      slot: rel(ui.vinvReforgeSlotEl), text: rel(ui.vinvReforgeTextEl),
      hammer: rel(ui.vinvReforgeHammerEl), sav: rel(ui.vinvSavingsEl),
    },
    list: {
      title: rel(ui.vinvCraftTitleEl), mats: rel(ui.vinvCraftMatEl),
      cells, visibleCellYs: visibleCells.map((c) => c.t),
      titleShown: ui.vinvCraftTitleEl ? ui.vinvCraftTitleEl.style.display !== 'none' : null,
      matsShown: ui.vinvCraftMatEl ? ui.vinvCraftMatEl.style.display !== 'none' : null,
    },
    guide: { open: ui.vinvGuideMenuOpen, reforgeOpen: ui.vinvReforgeOpen, modern: ui.vinvModernCraftOpen },
    detail: {
      shown: !!detail && detail.style.display !== 'none' && detail.children.length > 0,
      slots,
      req: rel(ui.vinvGuideModernReqEl), reqText: ui.vinvGuideModernReqEl?.textContent ?? null,
      cap: rel(ui.vinvGuideModernCaptionEl), gslot: rel(ui.vinvGuideSlotModernEl),
    },
    _inter: (a, b) => inter(a, b),
  };
});
const interH = (a, b) => (a && b ? Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) : 0);

// ============================================================ 场景 A:重铸态 vs 配方列表
await page.evaluate(async () => {
  const ui = window.__swUI, g = window.__swGame;
  ui.openInventory(true);
  await ui.refreshAllAsync?.();
  const wid = g.itemId('vi_9_Wood');
  if (wid > 0) g.player.inv.add(wid, 300);
  const gid = g.itemId('vi_9_Gel');
  if (gid > 0) g.player.inv.add(gid, 100);
  await ui.refreshAllAsync?.();
});
await sleep(300);
// ★复现用户截图相位:列表格探入 270-350 重铸带 = 视口/滚动相位(本仓 adjY=(sh-600)/2,
//   sh≥780 ⇒ focus 格 ≥470,自然态不入带)。探针以 adjY 补丁(-100)确定性放置格带
//   (等于原版 sh=600 时 adjY=46·下滚数行的带相位;结构断言与 adjY 无关——修后列表整隐)
await page.evaluate(() => {
  const ui = window.__swUI;
  ui.vinvCraftAdjY = () => -100;   // 探针相位补丁(实例影子;收尾 delete 还原原型方法)
  ui.vinvLayoutSig = '';
  ui.layoutVanilla();
});
await sleep(250);
const A0 = await measure();
ok(A0.list.titleShown && A0.list.visibleCellYs.length > 0, 'A0 前置:经典列表画(标题+格;focus=3 上方格入 270-350 带)', `cells=${A0.list.visibleCellYs.length} ys=${JSON.stringify(A0.list.visibleCellYs.slice(0, 6))}`);
const bandCell = A0.list.visibleCellYs.some((y) => y < 350 && y + 40 > 270);
ok(bandCell, 'A0b 前置:确有格探入 270-350 重铸带(复现用户截图相位)', JSON.stringify(A0.list.visibleCellYs));
await page.screenshot({ path: `${SHOT}-A-before-reforge.png` });

// 开重铸(真实链:哥布林+对话+reforge 钮)
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
// 会话建立(抗 NPC 游走/flaky=FX41b 同款护栏):钮可见才点,点后未开重试
let refOpen = false;
for (let attempt = 0; attempt < 3 && !refOpen; attempt++) {
  await page.evaluate(() => {
    const g = window.__swGame, gob = window.__ovGoblin;
    gob.dead = false;
    gob.x = g.player.x + 30; gob.y = g.player.y;   // 游走回收:钳回玩家旁
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
const A1 = await measure();
ok(A1.guide.reforgeOpen && !!A1.reforge.slot?.shown, 'A1 重铸开启 → 槽画(会话保持链)', `open=${A1.guide.reforgeOpen} slot=${JSON.stringify(A1.reforge.slot)}`);
ok(A1.reforge.slot && Math.abs(A1.reforge.slot.l - 50) <= 1 && Math.abs(A1.reforge.slot.t - 270) <= 1, 'A2 重铸槽 = (50,270) 原版原位(Main.cs:42270;非右移)', `got=(${A1.reforge.slot?.l},${A1.reforge.slot?.t})`);
ok(A1.reforge.text && Math.abs(A1.reforge.text.l - 100) <= 1 && Math.abs(A1.reforge.text.t - 270) <= 1, 'A3 重铸文案 = (100,270) 原版原位(:42321 num53+50)', `got=(${A1.reforge.text?.l},${A1.reforge.text?.t})`);
// ★核心断言:重铸开启 = 列表整支不画(Main.cs:42418 else-if !InReforgeMenu 带互斥)
ok(!A1.list.titleShown, 'A4 重铸开启 → 制作标题不画(else-if 整支)', `display=${A1.list.titleShown}`);
ok(!A1.list.matsShown, 'A5 重铸开启 → 经典材料行不画', `display=${A1.list.matsShown}`);
ok(A1.list.visibleCellYs.length === 0, 'A6 重铸开启 → 全部列表格不画(带互斥;修前=格压槽 FAIL)', `visible=${A1.list.visibleCellYs.length}`);
const slotRect = A1.reforge.slot;
const anyInter = A1.list.cells.filter((c) => c.shown && interH({ t: c.t, b: c.b }, { t: slotRect.t, b: slotRect.b }) > 0).length;
ok(anyInter === 0, 'A7 可见列表格 ∩ 重铸槽 = 空集', `intersecting=${anyInter}`);
await page.screenshot({ path: `${SHOT}-A-after-reforge.png` });

// 关闭重铸(走远链)→ 列表回归
await page.evaluate(() => { window.__swGame.closeNpcDialog(false); });
await page.waitForFunction(() => window.__swUI.vinvReforgeOpen === false, { timeout: 8000, polling: 120 });
await sleep(300);
const A2 = await measure();
ok(A2.list.titleShown && A2.list.visibleCellYs.length > 0, 'A8 重铸关闭 → 列表回归(标题+格复画)', `cells=${A2.list.visibleCellYs.length} title=${A2.list.titleShown}`);
await page.evaluate(() => { delete window.__swUI.vinvCraftAdjY; window.__swUI.vinvLayoutSig = ''; window.__swUI.layoutVanilla(); });   // 还原 adjY 原型方法

// ============================================================ 场景 B:modern 窗向导态(材料格 vs 需求行)
await page.evaluate(() => { window.__swUI.vinvCloseModernCraft?.(true); });
await page.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window.__ovGuide) {
    const guide = new TownNPC('guide', g.player.x - 40, g.world.groundLevel * 16 - 48);
    guide.home = null;
    g.entities.add(guide, 'npcs');
    window.__ovGuide = guide;
  }
  const guide = window.__ovGuide;
  guide.dead = false;
  const st = g.world.store;
  const col = Math.floor(guide.cx / 16);
  let gy = Math.max(0, Math.floor((guide.y + guide.h + 2) / 16));
  let solid = st.get(col, gy) !== 0 && st.hasTile(col, gy);
  for (let k = 0; k < 40 && !solid; k++) { gy++; solid = st.get(col, gy) !== 0 && st.hasTile(col, gy); }
  g.player.x = guide.cx - g.player.w / 2;
  g.player.y = gy * 16 - g.player.h - 1;
  if (!g.npcDialogActive) g.openNpcDialog(guide);
});
await sleep(300);
// 会话建立(抗 flaky 护栏,同上)
let gOpen = false;
for (let attempt = 0; attempt < 3 && !gOpen; attempt++) {
  await page.evaluate(() => {
    const g = window.__swGame, guide = window.__ovGuide;
    guide.dead = false;
    guide.x = g.player.x + 30; guide.y = g.player.y;
    if (!g.npcDialogActive || !g.dialogNpc) g.openNpcDialog(guide);
  });
  await page.waitForFunction(() => {
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="craft"]');
    return !!b && b.getBoundingClientRect().width > 0;
  }, { timeout: 10000, polling: 120 }).catch(() => {});
  await page.evaluate(() => { window.__swGame.npcDialogButton('craft'); });
  await sleep(450);
  gOpen = await page.evaluate(() => !!window.__swUI.vinvGuideMenuOpen && !!window.__swUI.vinvModernCraftOpen);
}
await page.waitForFunction(() => window.__swUI.vinvGuideMenuOpen && window.__swUI.vinvModernCraftOpen, { timeout: 10000, polling: 120 });
await sleep(300);
// 向导槽放木材 → 点选首格 → 详情浮层画(3 材料配方域)
await page.evaluate(() => {
  const ui = window.__swUI, g = window.__swGame;
  const wid = g.itemId('vi_9_Wood');
  ui.heldStack = { id: wid, stack: 300 };
  ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
});
await page.waitForFunction(() => window.__swUI.vinvModernEntries.length > 0 && !!window.__swUI.vinvModernGridList?.querySelector('.sw-slot'), { timeout: 15000, polling: 120 });
await sleep(300);
// 选一个【多材料】配方格(点网格第 0 格;详情浮层材料行 = 选中配方的 requiredItem)
await page.evaluate(() => {
  const cell = window.__swUI.vinvModernGridList.querySelector('.sw-slot');
  cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
});
await sleep(400);
const B1 = await measure();
ok(B1.detail.shown, 'B0 向导态点选 → 详情浮层画', `slots=${B1.detail.slots.length}`);
ok(B1.detail.gslot && Math.abs(B1.detail.gslot.l - 44) <= 1 && Math.abs(B1.detail.gslot.t - 443) <= 1, 'B1 向导槽 = (44,443) 原版逐字(vector+(0,58))', `got=(${B1.detail.gslot?.l},${B1.detail.gslot?.t})`);
ok(B1.detail.req && Math.abs(B1.detail.req.l - 96) <= 1 && Math.abs(B1.detail.req.t - 421) <= 1, 'B2 需求行 = (96,421) 原版逐字(vector+(52,36);win 相对 (76,109))', `got=(${B1.detail.req?.l},${B1.detail.req?.t})`);
const m0 = B1.detail.slots[1];
ok(m0 && Math.abs(m0.l - 116) <= 1 && Math.abs(m0.t - 391) <= 1, 'B3 材料格[0] = (116,391) 原版逐字(vector+(72,22-16))', `got=(${m0?.l},${m0?.t})`);
const m0h = m0 ? +(m0.b - m0.t).toFixed(1) : 0;
ok(m0 && Math.abs(m0h - 36.4) <= 0.8, 'B4 材料格视觉高 = 36.4(52×0.7 drawScale 已乘;52px 未缩放=443 底=本仓无此偏差)', `h=${m0h}`);
ok(m0 && Math.abs(m0.b - 427.4) <= 1, 'B5 材料格底 = 427.4(原版 1 材料态实际 y)', `b=${m0?.b}`);
ok(!!B1.detail.reqText && B1.detail.reqText.length > 0, 'B6 需求行有文案(点选后画,:452-456)', JSON.stringify((B1.detail.reqText ?? '').slice(0, 20)));
// ★原版同款判定:raw 带交叠 = 原版逐字(421 vs 427.4 → 6.4px);断言与原版【全等】,
//   修刀判据=指纹全等零修刀(#98 判例)——本仓若与原版差值>1px 才是真偏差
const kiss = interH(B1.detail.req, m0);   // req.t=421 vs m0.b=427.4 → 原版 raw 带交叠 6.4px
ok(Math.abs(kiss - 6.4) <= 1, 'B7 需求行∩材料格 = 6.4px 原版同款 raw 带(登记观感;可见框底 426 vs 字顶 ~423=相切级)', `kiss=${kiss.toFixed(1)}`);
await page.screenshot({ path: `${SHOT}-B-guide.png` });

console.log('截图:', `${SHOT}-A-before-reforge.png`, `${SHOT}-A-after-reforge.png`, `${SHOT}-B-guide.png`);
if (errs.length) console.log('页面错误:', errs.slice(0, 5));
await browser.close();
if (fails.length) { console.log(`\n${fails.length} 项 FAIL`); process.exit(1); }
console.log('\n全部 PASS');
