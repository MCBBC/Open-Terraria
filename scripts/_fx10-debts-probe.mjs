// SW-FX10 补债批探针(2026-09-10)——债④⑥⑨⑩⑪ 实机面
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_fx10-debts-probe.mjs
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

{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
  await sleep(800);
  const out = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ui = window.__swUI;
    const g = window.__swGame;
    document.getElementById('sw-welcome-announce')?.remove();
    const o = {};
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await sleep(150);
    const vinv = document.querySelector('.sw-vinv');
    const btns = [...vinv.querySelectorAll('.vinv-btn')];

    // ---- 债⑪ 热键锁图标：位置 (0,21)，未锁贴图 Lock_1 ----
    const lock = btns.find((b) => b.style.backgroundImage.includes('Lock_1'));
    o.lockFound = !!lock;
    o.lockPos = lock ? { x: lock.offsetLeft, y: lock.offsetTop } : null;
    o.lockTitle = lock?.title ?? '';
    // 点击翻转 → Lock_0 + hbLocked=true
    lock?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(80);
    const lock2 = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('Lock_0'));
    o.lockToggled = !!lock2 && g.player.hbLocked === true;
    o.lockTitle2 = lock2?.title ?? '';

    // 关包态：快捷栏格挂透传属性；点格不换选中、不拾取
    ui.closeInventory();
    await sleep(120);
    o.passthroughOn = document.querySelectorAll('.sw-hotbar .sw-slot[data-sw-world-passthrough="1"]').length === 10;
    const before = g.player.inv.selected;
    const slot0 = document.querySelector('.sw-hotbar .sw-slot[data-idx="0"]');
    slot0?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, cancelable: true }));
    slot0?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    await sleep(80);
    o.selectBlocked = g.player.inv.selected === before;
    o.noPickup = !ui.heldStack;
    // 解锁 → 属性摘除,点击恢复选中
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await sleep(120);
    const lock3 = [...document.querySelector('.sw-vinv').querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('Lock_0'));
    lock3?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(80);
    o.unlockedBack = g.player.hbLocked === false;
    ui.closeInventory();
    await sleep(120);
    o.passthroughOff = document.querySelectorAll('.sw-hotbar .sw-slot[data-sw-world-passthrough="1"]').length === 0;
    const slot1 = document.querySelector('.sw-hotbar .sw-slot[data-idx="1"]');
    slot1?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, cancelable: true }));
    slot1?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    await sleep(80);
    o.selectRestored = g.player.inv.selected === 1;
    g.player.inv.selected = before;

    // ---- 债⑥ 相机页签：title=inter(81)，点击 active=true，menuOpen ----
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await sleep(120);
    const vinv2 = document.querySelector('.sw-vinv');
    const cam = [...vinv2.querySelectorAll('.vinv-btn')].find((b) => (b.title || '').length > 0 && b.style.backgroundImage.includes('DisplaySlots_8'));
    o.camFound = !!cam;
    o.camTitle = cam?.title ?? '';
    const cm = g.renderer.captureMode;
    const wasActive = cm.active;
    cam?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(120);
    o.camActivated = !wasActive && cm.active === true;
    cm.toggleCamera(false);   // 复位(探针内直接收界面)
    await sleep(80);
    o.camReset = cm.active === false;

    // ---- 债⑨ mH 联动：mapStyle 1→0 后页签 y 上移 256 ----
    const tabMisc = [...vinv2.querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('DisplaySlots_2'));
    const y1 = tabMisc.offsetTop;
    const mH1 = g.renderer.mapStyle;
    g.renderer.mapStyle = 0;
    await sleep(200);
    const y2 = tabMisc.offsetTop;
    g.renderer.mapStyle = mH1;
    await sleep(200);
    const y3 = tabMisc.offsetTop;
    o.mhShift = { y1, y2, y3, delta: y1 - y2, deltaBack: y3 - y2 };
    o.mhLinked = y1 - y2 === 256 && y3 === y1;

    // ---- 债⑩ 矿车开关：未解锁不画;解锁后画 Extra_255,点翻 Extra_256 ----
    const vinv3 = document.querySelector('.sw-vinv');
    const tabM = [...vinv3.querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('DisplaySlots_2'));
    tabM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(150);
    const cartBtn = () => [...document.querySelector('.sw-vinv').querySelectorAll('.vinv-btn')]
      .find((b) => (b.style.backgroundImage.includes('Extra_255') || b.style.backgroundImage.includes('Extra_256'))
        && b.offsetParent !== null);
    o.cartHiddenLocked = !cartBtn();
    g.world.flags.superCart = true;
    await ui.refreshAllAsync();
    await sleep(200);
    const cb = cartBtn();
    o.cartShownUnlocked = !!cb;
    o.cartIconOn = cb?.style.backgroundImage.includes('Extra_255') ?? false;
    o.cartTitleOn = cb?.title ?? '';
    cb?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(80);
    const cb2 = cartBtn();
    o.cartToggledOff = g.player.enabledSuperCart === false
      && cb2?.style.backgroundImage.includes('Extra_256') === true;
    o.cartTitleOff = cb2?.title ?? '';
    cb2?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(80);
    o.cartReenabled = g.player.enabledSuperCart === true;
    // 解锁态回退(不污染世界档——本探针世界为内存档,仍还原)
    tabM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(120);

    // ---- 债④ 页2 buff 列：加 buff → 页2 列内出现块,位置=sw-84 起列 ----
    const { BuffType } = await import('/src/stats/Buffs.ts');
    g.player.buffs.apply(BuffType.Ironskin, 180);
    g.player.buffs.apply(BuffType.Regen, 180);
    await sleep(300);
    const tabM2 = [...document.querySelector('.sw-vinv').querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('DisplaySlots_2'));
    if (document.querySelector('.sw-vinv') && tabM2) {
      // 上一步已回页0,重新进页2
      tabM2.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await sleep(200);
    }
    const col = ui.miscBuffCol;
    o.colExists = !!col;
    const blocks = col ? [...col.children].filter((c) => c.style.display !== 'none') : [];
    o.colCount = blocks.length;
    o.colFirstPos = blocks[0] ? { x: blocks[0].offsetLeft, y: blocks[0].offsetTop } : null;
    o.colSecondPos = blocks[1] ? { x: blocks[1].offsetLeft, y: blocks[1].offsetTop } : null;
    // 行数门(1600×1000,K=1 → sh=1000,minimapOn=true → 阈值 890/940/990 → 6 行/列):
    // 2 个 buff 同列 y=0/46,x=0
    o.colGeomOk = blocks.length >= 2
      && blocks[0].offsetLeft === 0 && blocks[0].offsetTop === 0
      && blocks[1].offsetLeft === 0 && blocks[1].offsetTop === 46;
    // 右键取消列内块 → buff 移除
    blocks[0]?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await sleep(200);
    o.colRightClickRemove = [...(ui.miscBuffCol?.children ?? [])].filter((c) => c.style.display !== 'none').length === blocks.length - 1;
    // 回页0 → 块回流 buffBar(HUD 栏;开包态 buffBar 隐藏但块在栏内)
    tabM2?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(150);
    o.reflowBack = [...(ui.buffBar?.children ?? [])].some((c) => c.style.display !== 'none');
    o.pageErrors = [];
    return o;
  });
  out.pageErrors = errs;   // pageerror 由 Node 侧监听收集(evaluate 上下文隔离)
  for (const [k, v] of Object.entries(out)) {
    if (k !== 'pageErrors') console.log(`  ${k} = ${JSON.stringify(v)}`);
  }
  ok(out.lockFound && out.lockPos && out.lockPos.x === 0 && out.lockPos.y === 21, '债⑪ 锁图标 @(0,21) 未锁 Lock_1');
  ok(out.lockToggled, '债⑪ 点击翻转 hbLocked=true → Lock_0');
  ok(out.passthroughOn, '债⑪ 关包+锁 → 10 格挂透传属性');
  ok(out.selectBlocked && out.noPickup, '债⑪ 锁定关包点格:不换选中不拾取(Main.cs:44357)');
  ok(out.unlockedBack, '债⑪ 再点解锁 hbLocked=false');
  ok(out.passthroughOff, '债⑪ 解锁+关包 → 透传属性摘除');
  ok(out.selectRestored, '债⑪ 解锁后点格恢复选中语义');
  ok(out.camFound && out.camTitle.length > 0, '债⑥ 相机页签在位,title=inter(81)');
  ok(out.camActivated, '债⑥ 点击开 M6 拍照模式(CaptureManager.Active 等价)');
  ok(out.camReset, '债⑥ 探针复位 active=false');
  ok(out.mhLinked, `债⑨ mapStyle 1↔0 → 页签 y 位移 ±256(实测 ${JSON.stringify(out.mhShift)})`);
  ok(out.cartHiddenLocked, '债⑩ 未解锁:矿车开关不画(Main.cs:41963 flag2)');
  ok(out.cartShownUnlocked && out.cartIconOn, '债⑩ 解锁:画 Extra_255(enabled)');
  ok(out.cartToggledOff, '债⑩ 点击翻转 enabledSuperCart=false → Extra_256');
  ok(out.cartTitleOff.includes('Normal') || out.cartTitleOff.length > 0, `债⑩ 悬停名翻面(${out.cartTitleOff})`);
  ok(out.cartReenabled, '债⑩ 再点复原 true');
  ok(out.colExists && out.colCount >= 2, `债④ 页2 buff 列在位且 ${out.colCount} 块(Main.cs:42008-42046)`);
  ok(out.colGeomOk, `债④ 列几何 x=0,y=0/46(sh=1000,mapStyle1 → 6 行/列)(实测 ${JSON.stringify([out.colFirstPos, out.colSecondPos])})`);
  ok(out.colRightClickRemove, '债④ 列内右键取消(DrawBuffIcon→TryRemovingBuff 同相)');
  ok(out.reflowBack, '债④ 回页0 块回流 buffBar(reflow 双向)');
  ok(out.pageErrors.length === 0, '红方:零页面错误');
  for (const e of out.pageErrors) console.log(`  pageError: ${e}`);
  await page.close();
}
await browser.close();
console.log(fails.length === 0 ? 'ALL PASS' : `FAILED: ${fails.length}`);
process.exit(fails.length === 0 ? 0 : 1);
