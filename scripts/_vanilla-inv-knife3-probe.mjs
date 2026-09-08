// 刀 3 验证探针:EquipPage 状态机 + 住房页 + live 切换重建(2026-09-07)
//  运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs --timeout=540000 scripts/_vanilla-inv-knife3-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 60000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));

{
  const v = await page.evaluate(async () => {
    const ui = window.__swUI;
    const g = window.__swGame;
    document.getElementById('sw-welcome-announce')?.remove();
    ui.openInventory(true);
    await new Promise((r) => setTimeout(r, 200));
    const vinv = document.querySelector('.sw-vinv');
    const tabBtns = [...vinv.querySelectorAll('.vinv-btn')].filter((b) => b.style.backgroundImage.includes('DisplaySlots'));
    const housingTab = tabBtns.find((b) => b.style.backgroundImage.includes('DisplaySlots_4'));
    const miscTab = tabBtns.find((b) => b.style.backgroundImage.includes('DisplaySlots_2'));
    if (!housingTab || !miscTab) throw new Error('tabs missing: ' + tabBtns.map((b) => b.style.backgroundImage).join(' | '));
    const out = {};
    // ① 住房页:点住房页签 → 查询器槽(NPC_Head_0)在场,位置 (sw-92, num20)=(1508,430)
    housingTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    const qImg = [...vinv.querySelectorAll('[role="vinv-housing"] img, .sw-vinv img')].find((i) => (i.src || '').includes('NPC_Head_0'));
    const qBtn = qImg ? qImg.parentElement : null;
    out.housingQuery = qBtn ? { x: qBtn.offsetLeft, y: qBtn.offsetTop } : null;
    out.housingVisible = qBtn ? qBtn.offsetParent !== null : false;
    // ② 点击查询器 → game.housingMode = {kind:'query'}
    qBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    out.modeAfterQuery = JSON.stringify(g.housingMode);
    // 右键取消
    qBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    out.modeAfterRclick = JSON.stringify(g.housingMode);
    // ③ 自动翻页:持钩链 → 页 2;持盔甲 → 页 0;清手 → 回记忆页(住房页,因 selected=1)
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const { equipPageCapOf } = await import('/src/ui/SlotActions.ts');
    // 样本按帽扫描取(vid 硬编码易踩物品表:vid8=火把非钩链)
    const scan = (pred) => { for (let i = 0; i < ITEM_DEFS.length; i++) if (ITEM_DEFS[i] && pred(equipPageCapOf(i))) return i; return -1; };
    const hookId = scan((c) => c.projHook);
    const helmId = scan((c) => c.headSlot);
    out.hookId = hookId; out.helmId = helmId;
    // 先回装备页做基线
    miscTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    miscTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    const pageVisible = (where) => {
      const s = vinv.querySelector(`.sw-slot[data-where="${where}"]`);
      return s ? s.offsetParent !== null : false;
    };
    ui.heldStack = { id: hookId, stack: 1 };
    await ui.refreshAllAsync();   // rAF 双帧同步等待(150ms 定时在无头下偶有竞态)
    out.hookPageMisc = pageVisible('misc');
    out.hookPageEquip = pageVisible('armor');
    ui.heldStack = { id: helmId, stack: 1 };
    await ui.refreshAllAsync();

    out.helmPageEquip = pageVisible('armor');
    // 切住房记忆页:清手 → 应回住房页(selected=1)
    housingTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    ui.heldStack = null;
    await ui.refreshAllAsync();

    out.memoryHousing = qBtn.offsetParent !== null;
    // ④ 恢复装备页
    miscTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    miscTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    return out;
  });
  ok(v.housingQuery && v.housingQuery.x === 1508 && v.housingQuery.y === 430, `① 住房页查询器槽 @(sw-92,num20)=(1508,430) (got ${JSON.stringify(v.housingQuery)})`);
  ok(v.housingVisible, '① 住房页点开后可见');
  ok(v.modeAfterQuery === '{"kind":"query"}', `② 点查询器 → housingMode=query (got ${v.modeAfterQuery})`);
  ok(v.modeAfterRclick === 'null', '② 右键取消 → null');
  ok(v.hookId > 0 && v.helmId > 0, `③ internalIdOfVid(8/4) 可用 (got ${v.hookId}/${v.helmId})`);
  ok(v.hookPageMisc && !v.hookPageEquip, '③ 持钩链 → 自动翻杂项页(ItemSlot.cs:4641)');
  ok(v.helmPageEquip, '③ 持盔甲 → 自动回装备页');
  ok(v.memoryHousing, '③ 清手 → 落记忆页(住房页,EquipPageSelected=1)');
}

// ⑤ live 切换重建
{
  const v = await page.evaluate(async () => {
    const ui = window.__swUI;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const { options } = await import('/src/core/Options.ts');
    await options.set('inventoryLayout', 'classic');
    await wait(300);
    const classicState = {
      vinvGone: !document.querySelector('.sw-vinv'),
      dockBack: !!document.querySelector('.sw-eqdock'),
      hotbar: ui.hotbarEl.style.display,
    };
    await options.set('inventoryLayout', 'vanilla');
    await wait(300);
    const vanillaState = {
      vinvBack: !!document.querySelector('.sw-vinv'),
      dockGone: !document.querySelector('.sw-eqdock'),
      gridSlots: document.querySelectorAll('.sw-vinv .sw-slot[data-where="inv"]').length,
    };
    return { classicState, vanillaState };
  }).catch((e) => ({ err: String(e).slice(0, 200) }));
  if (v.err) {
    ok(false, `⑤ live 切换:动态 import 失败 ${v.err}`);
  } else {
    ok(v.classicState.vinvGone && v.classicState.dockBack && v.classicState.hotbar === '', `⑤ 切 classic:vinv 摘除/eqdock 回归/热键栏还原 (got ${JSON.stringify(v.classicState)})`);
    ok(v.vanillaState.vinvBack && v.vanillaState.dockGone && v.vanillaState.gridSlots === 58, `⑤ 切回 vanilla:重建完整 (got ${JSON.stringify(v.vanillaState)})`);
  }
}

ok(errs.length === 0, `无页面错误 ${errs.length ? JSON.stringify(errs) : ''}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
