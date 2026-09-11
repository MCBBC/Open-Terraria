// SW-RB13b 探针(2026-09-11)——FX28×FX30 互踩四态矩阵实机面(红蓝审计批)。
// 场景:开箱态 × PipsUseGrid 翻转/格点选/modern 左键 —— ChestUI.cs:81 吞箱条三门
// +ChestOrShopUIVisible(Main.cs:3035-3046) 变体回位 + 双写者一致化后的网格几何。
// 运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_rb13b-chest-grid-matrix.mjs
import puppeteer from 'puppeteer-core';

const CHROME = process.env.SW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  defaultViewport: { width: 1600, height: 1000 },   // K=1:vanillaScaleFor(1600,1000)=1
});

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
    // 给料(木 300):空包徒手域=0 配方,格点选场景需 avail≥1(同 _fx30-grid-probe 场景 0)
    const woodVid = g.itemId('vi_9_Wood');
    if (woodVid > 0) g.player.inv.add(woodVid, 300);
    const vinv = document.querySelector('.sw-vinv');
    const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
    const gridEl = ui.vinvCraftGridEl;
    const chestSlots = () => [...vinv.querySelectorAll('.sw-slot')].filter((s) => s.dataset.idx !== undefined && ui.vinvSlots.get(`chest:0`) === s);
    const vis = (el) => el && el.style.display !== 'none' && el.offsetParent !== null;

    // ---- 开箱(真箱:tile 16 + world.chests 登记,假箱会被 tickChestAutoClose 秒关) ----
    const w = g.world;
    const px = Math.floor(g.player.cx), py = Math.floor(g.player.cy);
    const cx = Math.min(px + 3, w.width - 3), cy = Math.min(py + 1, w.height - 3);
    const st = w.store;
    const setT = (x, y, fx, fy) => st.setTileSilent(x, y, 16, fx, fy);
    setT(cx, cy, 0, 0); setT(cx + 1, cy, 18, 0); setT(cx, cy + 1, 0, 18); setT(cx + 1, cy + 1, 18, 18);
    const chest = { x: cx, y: cy, items: Array.from({ length: 40 }, (_, i) => (i < 2 ? { id: 1, stack: 1 } : null)) };
    w.chests.push(chest);
    g.tryOpenChest?.(chest) ?? g.openChest?.(chest);
    await sleep(300);
    o.chestOpen = !!ui.openChest;
    o.s0_stripName = vis(ui.vinvChestNameEl);
    o.s0_slot0 = vis(ui.vinvSlots.get('chest:0'));
    o.s0_btn0 = vis(ui.vinvChestBtnEls[0]);
    // 态①开箱+网格关:箱条在位;垃圾桶让位 (453,426) 0.755
    o.s0_trashXY = (() => { const t = ui.vinvTrashEl; return [t.offsetLeft, t.offsetTop, t.style.transform]; })();
    o.s0_trashDisplaced = o.s0_trashXY[0] === 453 && o.s0_trashXY[1] === 426;
    o.s0_bestiaryXY = (() => { const b = ui.vinvBestiaryBtn; return [b.offsetLeft, b.offsetTop]; })();

    // ---- 态②切换钮开网格(开箱态):箱条三门吞 + 变体回位 + 网格在 (310,340) ----
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(150);
    o.s1_pips = ui.vinvPipsUseGrid === true;
    o.s1_stripSwallowed = !vis(ui.vinvChestNameEl) && !vis(ui.vinvSlots.get('chest:0')) && !vis(ui.vinvChestBtnEls[0]);
    o.s1_gridXY = [gridEl.style.left, gridEl.style.top];
    o.s1_gridVisible = vis(gridEl);
    o.s1_trashBack = (() => { const t = ui.vinvTrashEl; return [t.offsetLeft, t.offsetTop, t.style.transform]; })();
    o.s1_trashReverted = o.s1_trashBack[0] === 448 && o.s1_trashBack[1] === 258 && o.s1_trashBack[2] === 'scale(0.85)';
    o.s1_bestiaryBack = (() => { const b = ui.vinvBestiaryBtn; return [b.offsetLeft, b.offsetTop]; })()[1] === 278;
    o.s1_quickHidden = vis(ui.vinvQuickBtn) === false;   // :42548 chest==-1 裸门(不随 PipsUseGrid 回现)
    o.s1_chestStillOpen = !!ui.openChest;

    // ---- 态③关网格:箱条复现,垃圾桶回让位 ----
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(150);
    o.s2_stripBack = vis(ui.vinvChestNameEl) && vis(ui.vinvSlots.get('chest:0')) && vis(ui.vinvChestBtnEls[0]);
    o.s2_trashDisplacedAgain = ui.vinvTrashEl.offsetLeft === 453 && ui.vinvTrashEl.offsetTop === 426;

    // ---- 态④再开网格 → 格点选(关网格+开箱条复现) ----
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(150);
    const cell = gridEl.querySelector('.sw-slot');
    cell?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(200);
    o.s3_pipsAfterCell = ui.vinvPipsUseGrid === false;
    o.s3_stripBackAfterCell = vis(ui.vinvSlots.get('chest:0'));

    // ---- 态⑤开箱清网格(重开箱强制 PipsUseGrid=false 面) ----
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(120);
    ui.openChestPanel?.(chest);
    await sleep(200);
    o.s4_pipsClearedByChest = ui.vinvPipsUseGrid === false;
    o.s4_gridHidden = !vis(gridEl);

    // ---- 态⑥modern 左键副效应(:310-315):classic 开网格→右键切 modern→左键关网格 ----
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(120);
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));   // 切 modern
    await sleep(80);
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));   // modern 左键
    await sleep(150);
    o.s5_modernClickClosedGrid = ui.vinvPipsUseGrid === false;
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));   // 切回 classic
    await sleep(80);
    return o;
  });
  for (const [k, v] of Object.entries(out)) console.log(`  ${k} = ${JSON.stringify(v)}`);
  ok(out.chestOpen && out.s0_stripName && out.s0_slot0 && out.s0_btn0, '态① 开箱:箱条名/槽/钮在位');
  ok(out.s0_trashDisplaced, '态① 垃圾桶让位 (453,426) 0.755');
  ok(out.s1_pips && out.s1_gridVisible && out.s1_gridXY[0] === '310px' && out.s1_gridXY[1] === '340px', '态② 网格态:容器 @(310,340) 可见(双写者一致化)');
  ok(out.s1_stripSwallowed, '态② 网格态吞箱条三门(ChestUI.cs:81 名/槽/钮全隐)');
  ok(out.s1_trashReverted, '态② ChestOrShopUIVisible=false:垃圾桶回位 (448,258) 0.85');
  ok(out.s1_bestiaryBack, '态② 图鉴回位 y=278(Main.cs:43103 谓词含 !PipsUseGrid)');
  ok(out.s1_quickHidden, '态② 堆叠/排列钮仍隐(:42548 chest==-1 裸门不折 PipsUseGrid)');
  ok(out.s1_chestStillOpen, '态② 箱仍开(chest!=1,仅绘制面吞)');
  ok(out.s2_stripBack && out.s2_trashDisplacedAgain, '态③ 关网格:箱条复现+垃圾桶回让位');
  ok(out.s3_pipsAfterCell && out.s3_stripBackAfterCell, '态④ 格点选:关网格+箱条复现(CraftingUI.cs:520-527)');
  ok(out.s4_pipsClearedByChest && out.s4_gridHidden, '态⑤ 开箱清网格(Player.cs:33787)');
  ok(out.s5_modernClickClosedGrid, '态⑥ modern 左键副效应 PipsUseGrid=false(CraftingUI.cs:310-315)');
  ok(errs.length === 0, '红方:零页面错误' + (errs.length ? ` :: ${errs[0]}` : ''));
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
}
await browser.close();
process.exit(fails.length ? 1 : 0);
