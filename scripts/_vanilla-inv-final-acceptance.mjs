// 收官综合验收探针(红蓝对抗;2026-09-08)——全部功能分支一次覆盖
//  运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs --timeout=560000 scripts/_vanilla-inv-final-acceptance.mjs
//  蓝方=逐功能分支几何/交互断言;红方=面板纯净性/热键栏还原/元素复用/无错误/classic 守恒/三档视口截图。
//  (红队 F3 清偿:原「点击穿透/Esc 链/live 切换」宣称与实际不符——穿透门机制在
//  domTargets+Game.inpOverDomUi 另有单测面,此处不再虚设;live 切换在 knife3 探针)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

// ============ 蓝+红:vanilla 档(1600×1000,K=1,mH=256,num20=430) ============
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
  await sleep(800);
  const v = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));   // 浏览器上下文本地版
    const ui = window.__swUI;
    const g = window.__swGame;
    document.getElementById('sw-welcome-announce')?.remove();
    // 材料保证合成网格非空(键制=vi_<vid>_<Name>,经 VANILLA_ITEM_KEY_BY_ID 映射)
    const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
    const iidOf = (vid) => { const k = VANILLA_ITEM_KEY_BY_ID[vid]; return k !== undefined ? ITEM_BY_KEY[k] : undefined; };
    if (iidOf(9)) g.player.inv.add(iidOf(9), 99);    // Wood
    if (iidOf(23)) g.player.inv.add(iidOf(23), 99);  // Gel
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await sleep(120);
    const vinv = document.querySelector('.sw-vinv');
    const K = 1; // 1600×1000 → K=1
    const off = (sel) => {
      const e = vinv.querySelector(sel);
      return e && e.offsetParent !== null ? { x: e.offsetLeft, y: e.offsetTop } : null;
    };
    const out = { imgs0: document.querySelectorAll('.sw-vinv img').length };
    // ---- 蓝方:几何全分支 ----
    out.slot0 = off('.sw-slot[data-idx="0"][data-where="inv"]');
    out.coin = off('.sw-slot[data-idx="50"][data-where="inv"]');
    out.ammo = off('.sw-slot[data-idx="54"][data-where="inv"]');
    out.trash = off('.sw-trash');
    out.equip = off('.sw-slot[data-idx="0"][data-where="armor"]');
    out.vanity = off('.sw-slot[data-idx="10"][data-where="armor"]');
    out.dye = off('.sw-slot[data-idx="0"][data-where="dye"]');
    out.check = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('Inventory_Tick'));
    out.checkPos = out.check ? { x: out.check.offsetLeft, y: out.check.offsetTop } : null;
    out.loadout = [...vinv.querySelectorAll('.sw-loadout-btn')].map((b) => ({ x: b.offsetLeft, y: b.offsetTop }));
    const railEl = [...vinv.querySelectorAll('div')].find((c) => c.style.width === '4px');
    out.railH = railEl ? railEl.style.height : null;
    out.defense = vinv.querySelector('[data-role="defense"]');
    out.defensePos = out.defense ? { x: out.defense.offsetLeft, y: out.defense.offsetTop } : null;
    out.pvpSword = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('UI_PVP_0'));
    out.pvpPos = out.pvpSword ? { x: out.pvpSword.offsetLeft, y: out.pvpSword.offsetTop } : null;
    // (红队 F3 清偿:原 advisor 死指标已删)
    // 杂项页
    const miscTab = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('DisplaySlots_2'));
    miscTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(120);
    out.miscSlot = off('.sw-slot[data-where="misc"]');
    out.miscDyeSlot = off('.sw-slot[data-where="miscDye"]');
    miscTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(120);
    // 住房页
    const housingTab = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('DisplaySlots_4'));
    housingTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(120);
    out.housingQuery = [...vinv.querySelectorAll('img')].some((i) => (i.src || '').includes('NPC_Head_0'));
    housingTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(120);
    // 经典竖向合成列表(adjY=(sh-600)/2=200:标题 (76,614);focus0 槽 (20,580);
    // 材料行 (80,580);CraftingUI.cs:161-287)
    const craftTitle = [...vinv.querySelectorAll('.vinv-txt')].find((c) => c.style.fontSize === '14px');
    out.craftTitle = craftTitle ? { x: craftTitle.offsetLeft, y: craftTitle.offsetTop } : null;
    const listSlots = [...vinv.querySelectorAll('.sw-slot')].filter((s) => {
      const x = s.offsetLeft, y = s.offsetTop;
      return x >= 0 && x <= 100 && y >= 380 && y <= 410 + 200 + 416;
    });
    out.craftCells = listSlots.length;
    out.focusSlot = listSlots.find((s) => s.offsetLeft === 20 && s.offsetTop === 580) ? { x: 20, y: 580 } : null;
    out.matRow = listSlots.find((s) => s.offsetLeft === 80 && s.offsetTop === 580) ? { x: 80, y: 580 } : null;
    out.craftClickCrafts = await (async () => {
      // 点焦点槽 = 合成(库存/光标变化)
      const inv = g.player.inv;
      const totalBefore = inv.slots.filter(Boolean).length;
      const focus = listSlots.find((s) => s.offsetLeft === 20 && s.offsetTop === 580);
      if (!focus) return null;
      focus.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await ui.refreshAllAsync();
      const totalAfter = inv.slots.filter(Boolean).length;
      return totalAfter > totalBefore || ui.heldStack !== null;
    })();
    // ---- 红方:面板内无非原版元素(白名单外文本钮) ----
    const whiteTexts = ['物品栏', '钱币', '弹药', '天气控制', '时间控制'];
    out.foreignTextBtns = [...vinv.querySelectorAll('button')].filter((b) => {
      const t = (b.textContent || '').trim();
      return t && !whiteTexts.includes(t) && !b.style.backgroundImage && b.className.includes('vinv-btn') === false;
    }).length;
    // (红队 F3 清偿:原此处硬编码 gapClickNoSwing=true 的伪断言已删——
    //  穿透门机制面归 domTargets/Game.inpOverDomUi 单测,本探针不虚设)
    // ---- 红方:元素复用(churn) ----
    const imgs1 = document.querySelectorAll('.sw-vinv img').length;
    g.player.inv.add(iidOf(3) ?? 0, 1);   // Stone block
    await ui.refreshAllAsync();
    await ui.refreshAllAsync();
    out.imgChurnDelta = document.querySelectorAll('.sw-vinv img').length - imgs1;
    // Esc 链(关包)
    ui.closeInventory();
    await ui.refreshAllAsync();
    out.hotbarAfterClose = ui.hotbarEl.style.display;
    ui.openInventory(true);
    await ui.refreshAllAsync();
    return out;
  }).catch((e) => ({ evalFail: String(e).slice(0, 300) }));

  if (v.evalFail) {
    ok(false, `evaluate 失败: ${v.evalFail}`);
  } else {
    ok(v.slot0 && v.slot0.x === 20 && v.slot0.y === 20, `蓝:网格起点 (20,20) got ${JSON.stringify(v.slot0)}`);
    ok(v.coin && v.coin.x === 497 && v.coin.y === 105, `蓝:钱币 (497,105) got ${JSON.stringify(v.coin)}`);
    ok(v.ammo && v.ammo.x === 534, `蓝:弹药 x=534 got ${JSON.stringify(v.ammo)}`);
    ok(v.trash && v.trash.x === 448 && v.trash.y === 258, `蓝:垃圾桶 (448,258) got ${JSON.stringify(v.trash)}`);
    ok(v.equip && v.equip.x === 1508 && v.equip.y === 430, `蓝:装备列首格 (sw-92,430)=(1508,430) got ${JSON.stringify(v.equip)}`);
    ok(v.vanity && v.vanity.x === 1461, `蓝:时装列 x=sw-139=1461 got ${JSON.stringify(v.vanity)}`);
    ok(v.dye && v.dye.x === 1414, `蓝:染料列 x=sw-186=1414 got ${JSON.stringify(v.dye)}`);
    ok(v.checkPos && v.checkPos.x === 1542 && v.checkPos.y === 574, `蓝:勾选框 (sw-58, 430-2+142+4)=(1542,574) got ${JSON.stringify(v.checkPos)}`);
    ok(v.loadout.length === 3 && v.loadout[0] && v.loadout[0].x === 1560 && v.loadout[0].y === 430 && v.loadout[2].y === 502, `蓝:配装轨 3 钮 (sw-40,430+36i) got ${JSON.stringify(v.loadout)}`);
    ok(v.railH === '380px', `蓝:配装轨高=可见行数 8 截断 380(红队 M1) got ${v.railH}`);
    ok(v.defensePos && v.defensePos.x === 1370 && v.defensePos.y === 775, `蓝:防御计数 中心(1390,793)→盒(1370,775) got ${JSON.stringify(v.defensePos)}`);
    ok(v.pvpPos && v.pvpPos.x === 1373 && v.pvpPos.y === 435, `蓝:PvP 剑 (sw-227,179+mH)=(1373,435) got ${JSON.stringify(v.pvpPos)}`);
    ok(v.miscSlot && v.miscSlot.x === 1508 && v.miscDyeSlot && v.miscDyeSlot.x === 1461, `蓝:杂项页两列 sw-92/sw-139 got ${JSON.stringify(v.miscSlot)}/${JSON.stringify(v.miscDyeSlot)}`);
    ok(v.housingQuery, '蓝:住房页查询器槽在场');
    ok(v.craftTitle && v.craftTitle.x === 76 && v.craftTitle.y === 614, `蓝:制作标题 (76,614) got ${JSON.stringify(v.craftTitle)}`);
    ok(v.craftCells >= 2, `蓝:经典列表槽位可见 got ${v.craftCells}`);
    ok(v.focusSlot, `蓝:focus0 槽 (20,580) got ${JSON.stringify(v.focusSlot)}`);
    ok(v.matRow, `蓝:材料行 (80,580) got ${JSON.stringify(v.matRow)}`);
    ok(v.craftClickCrafts !== null && v.craftClickCrafts !== false, `蓝:点焦点槽=合成(红队 M2 语义) got ${v.craftClickCrafts}`);
    ok(v.foreignTextBtns === 0, `红:面板内无白名单外文本钮 got ${v.foreignTextBtns}`);
    ok(v.hotbarAfterClose === '', '红:关包热键栏还原');
    ok(Math.abs(v.imgChurnDelta) <= 3, `红:刷新风暴 img 元素复用(Δ≤3) got ${v.imgChurnDelta}`);
  }
  // 三档视口截图
  await page.setViewport({ width: 1280, height: 800 });
  await sleep(400);
  await page.screenshot({ path: '/tmp/vinv-accept-1280x800.png' });
  await page.setViewport({ width: 1024, height: 768 });
  await sleep(400);
  await page.screenshot({ path: '/tmp/vinv-accept-t1-1024x768.png' });
  await page.setViewport({ width: 844, height: 390 });
  await sleep(400);
  await page.screenshot({ path: '/tmp/vinv-accept-t3-844x390.png' });
  ok(errs.length === 0, `红:无页面错误 ${errs.length ? JSON.stringify(errs.slice(0, 2)) : ''}`);
  await page.close();
}

// ============ 红:classic 守恒(独立启动,无 URL 覆盖) ============
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-invgrid'), { timeout: 240000, polling: 1000 });
  await sleep(500);
  const c = await page.evaluate(async () => {
    const ui = window.__swUI;
    ui.openInventory();
    await ui.refreshAllAsync();
    const vinv = !!document.querySelector('.sw-vinv');
    const dock = !!document.querySelector('.sw-eqdock');
    const grid = document.querySelectorAll('.sw-invgrid .sw-slot').length;
    const craftList = !!document.querySelector('.sw-craft-list');
    const loadouts = document.querySelectorAll('.sw-loadout-btn').length;
    ui.closeInventory();
    return { vinv, dock, grid, craftList, loadouts };
  });
  ok(!c.vinv && c.dock && c.grid === 40 && c.craftList && c.loadouts === 3, `红:classic 守恒(无 vinv/有坞/40 格/合成列表/配装钮 3) got ${JSON.stringify(c)}`);
  ok(errs.length === 0, `红:classic 无页面错误 ${errs.length ? JSON.stringify(errs.slice(0, 2)) : ''}`);
  await page.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
