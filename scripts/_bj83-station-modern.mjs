// BJ83 复现 v2:右击制作台无视 craftingGridControl 设置强制 classic 宫格(用户实报)。
// 站点钩链:Game 右击尾臂(:25582 craftingFilterForTile)→ cb.onCraftingStationOpen →
// UI.openCraftingStationFilter(:8714 三分支:classic+vanilla 布局→FX30 网格链 /
// vanilla 布局→FX41 modern 窗四支状态机 / else→只开包)。
// v1 结论:P1/P3/P5 行为全对;P2 被自然向导挡击(dialogOpen=true)。v2 修正:
// 清自然城镇 NPC+记 elementFromPoint+control 走模块实例。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

/** 落一个工作台在玩家右前方 3 格(地面上),返回世界像素中心 */
const placeWorkbench = (page) => page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const wb = window.__swTiles['workbench'];
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor((g.player.y + g.player.h) / 16);
  const tx = ptx + 3, ty = pty - 1;
  st.setTileSilent(tx, ty, wb, 0, 0);
  st.setTileSilent(tx + 1, ty, wb, 18, 0);
  window.__bj83wb = { tx, ty, wx: tx * 16 + 16, wy: ty * 16 + 8 };
  return window.__bj83wb;
});

/** 清自然城镇 NPC(传送远离,防帧盒闩吞右击)+收对话 */
const clearNpcs = (page) => page.evaluate(() => {
  const g = window.__swGame;
  let n = 0;
  const npcs = g.entities?.npcs;
  if (npcs) {
    for (const npc of [...npcs]) {
      try { npc.x = g.player.x + 3000; npc.y = (g.world.groundLevel - 4) * 16; n++; } catch { /* 空守卫 */ }
    }
  }
  g.closeNpcDialog?.(true);
  return n;
});

const rightClickWorld = async (page, wx, wy) => {
  const p = await page.evaluate(([x, y]) => {
    const [sx, sy] = window.__swGame.camera.worldToScreen(x, y);
    const el = document.elementFromPoint(sx, sy);
    return { sx, sy, under: el ? `${el.tagName}.${(el.className || '').toString().slice(0, 40)}` : 'none' };
  }, [wx, wy]);
  await page.mouse.move(p.sx, p.sy);
  await sleep(120);
  await page.mouse.down({ button: 'right' });
  await sleep(500);
  await page.mouse.up({ button: 'right' });
  await sleep(300);
  return p;
};

const snap = (page, tag) => page.evaluate((t) => {
  const ui = window.__swUI, g = window.__swGame;
  const vis = (e) => e ? (e.offsetParent !== null && e.getBoundingClientRect().width > 0) : false;
  const rectOf = (e) => { if (!e) return null; const r = e.getBoundingClientRect().toJSON(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const gridEl = ui.vinvCraftGridEl;
  return {
    tag: t,
    control: window.__bj83opts?.data?.craftingGridControl ?? null,
    panel: ui.invPanel?.style.display ?? 'x',
    modernOpen: ui.vinvModernCraftOpen,
    modernFilter: ui.vinvModernCraftFilter ? ui.vinvModernCraftFilter.kind : null,
    winVisible: vis(ui.vinvModernCraftEl),
    winRect: rectOf(ui.vinvModernCraftEl),
    pipsUseGrid: ui.vinvPipsUseGrid,
    gridVisible: vis(gridEl),
    gridDisplay: gridEl?.style.display ?? 'no-el',
    gridRect: rectOf(gridEl),
    guideMenu: ui.vinvGuideMenuOpen,
    classicListVisible: vis(ui.vinvCraftTitleEl),
    dialogOpen: !!document.querySelector('.sw-npc-dialog'),
    running: !!g?.running,
    log: (window.__bj83log ?? []).splice(0),
  };
}, tag);

const instrument = (page) => page.evaluate(() => {
  const ui = window.__swUI, g = window.__swGame;
  window.__bj83log = [];
  const rec = (e) => window.__bj83log.push(e);
  const wrap = (obj, key, tag) => {
    if (typeof obj[key] !== 'function') { rec({ tag: tag + ':MISSING' }); return; }
    const orig = obj[key];
    obj[key] = function (...a) {
      rec({ tag, control: window.__bj83opts?.data?.craftingGridControl, arg: a[0]?.kind ?? (typeof a[0] === 'number' ? a[0] : null) });
      return orig.apply(this, a);
    };
  };
  wrap(ui, 'openCraftingStationFilter', 'stationHook');
  wrap(ui, 'vinvOpenCloseModernCraftFilter', 'modernOCF');
  wrap(ui, 'vinvOpenModernCraft', 'modernOpen');
  wrap(ui, 'vinvCloseModernCraft', 'modernClose');
  wrap(ui, 'openInventory', 'openInventory');
  wrap(g, 'interactAt', 'interactAt');
  wrap(g, 'openNpcDialog', 'openNpcDialog');
});

const boot = async (page, mode) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 300000, polling: 1000 }, '.sw-vinv');
  await sleep(700);
  await page.evaluate(async (m) => {
    document.getElementById('sw-welcome-announce')?.remove();
    const options = (await import('/src/core/Options.ts')).options;
    window.__bj83opts = options;
    await options.set('craftingGridControl', m);
    await options.set('inventoryLayout', 'vanilla');
    window.__swUI.closeInventory();
  }, mode);
  await sleep(150);
  await instrument(page);
  await clearNpcs(page);
  await placeWorkbench(page);
  await sleep(150);
  return errs;
};

// ============ P1:modern × 包关 → 右击工作台 ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'modern');
  const wb = await page.evaluate(() => window.__bj83wb);
  const hit = await rightClickWorld(page, wb.wx, wb.wy);
  const s = await snap(page, 'P1');
  console.log('[P1-hit]', JSON.stringify(hit));
  console.log('[P1]', JSON.stringify({ ...s, log: undefined }));
  console.log('[P1-log]', JSON.stringify(s.log));
  ok(s.control === 'modern', `P1-0 设置保持 modern(${s.control})`);
  ok(s.panel === 'block', `P1-1 物品栏开(display=${s.panel})`);
  ok(s.modernOpen && s.winVisible, `P1-2 modern 窗开且 DOM 显(modern=${s.modernOpen} vis=${s.winVisible})`);
  ok(!s.pipsUseGrid && !s.gridVisible, `P1-3 网格不开(pips=${s.pipsUseGrid} vis=${s.gridVisible} disp=${s.gridDisplay})`);
  ok(s.modernFilter === 'station', `P1-4 站点滤器入窗(${s.modernFilter})`);
  ok(!s.dialogOpen, `P1-5 无对话(${s.dialogOpen})`);
  ok(errs.length === 0, `P1-9 无页面错误(${errs.join(' | ')})`);
  await page.screenshot({ path: '/tmp/bj83-p1.png' });
  await page.close();
}

// ============ P2:modern × 包开(窗关) → 右击 ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'modern');
  await page.evaluate(() => window.__swUI.openInventory(true));
  await sleep(250);
  const wb = await page.evaluate(() => window.__bj83wb);
  const hit = await rightClickWorld(page, wb.wx, wb.wy);
  const s = await snap(page, 'P2');
  console.log('[P2-hit]', JSON.stringify(hit));
  console.log('[P2]', JSON.stringify({ ...s, log: undefined }));
  console.log('[P2-log]', JSON.stringify(s.log));
  ok(s.modernOpen && s.winVisible, `P2-1 包开态右击=modern 窗开(modern=${s.modernOpen} vis=${s.winVisible})`);
  ok(!s.pipsUseGrid && !s.gridVisible, `P2-2 网格不开(pips=${s.pipsUseGrid} vis=${s.gridVisible})`);
  ok(!s.dialogOpen, `P2-3 无对话(${s.dialogOpen})`);
  ok(errs.length === 0, `P2-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ P3:classic 基线 → 右击 = 网格开(既有语义) ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'classic');
  const wb = await page.evaluate(() => window.__bj83wb);
  const hit = await rightClickWorld(page, wb.wx, wb.wy);
  const s = await snap(page, 'P3');
  console.log('[P3-hit]', JSON.stringify(hit));
  console.log('[P3]', JSON.stringify({ ...s, log: undefined }));
  ok(s.pipsUseGrid && s.gridVisible, `P3-1 classic 右击=网格开(pips=${s.pipsUseGrid} vis=${s.gridVisible})`);
  ok(!s.modernOpen, `P3-2 modern 窗不开(${s.modernOpen})`);
  ok(errs.length === 0, `P3-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ P4:modern × 向导对话共存 → 右击帧盒外工作台(用户截图场景) ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'modern');
  await page.evaluate(async () => {
    const g = window.__swGame;
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
    guide.home = null;
    g.entities.add(guide, 'npcs');
    window.__bj83guide = guide;
  });
  await sleep(400);
  // 先右键向导开对话(真实链);工作台重落到向导右侧 5 格(帧盒外)
  await page.evaluate(() => {
    const g = window.__swGame, guide = window.__bj83guide;
    g.player.x = guide.cx - 30; g.player.y = guide.cy - 8; g.player.vx = 0; g.player.vy = 0;
    const st = g.world.store, wb = window.__swTiles['workbench'];
    const { tx, ty } = window.__bj83wb;
    st.setTileSilent(tx, ty, 0, 0, 0); st.setTileSilent(tx + 1, ty, 0, 0, 0);
    const ntx = Math.floor(guide.cx / 16) + 5, nty = Math.floor((g.player.y + g.player.h) / 16) - 1;
    st.setTileSilent(ntx, nty, wb, 0, 0); st.setTileSilent(ntx + 1, nty, wb, 18, 0);
    window.__bj83wb = { tx: ntx, ty: nty, wx: ntx * 16 + 16, wy: nty * 16 + 8 };
  });
  await sleep(200);
  const gp = await page.evaluate(() => {
    const guide = window.__bj83guide;
    const [sx, sy] = window.__swGame.camera.worldToScreen(guide.cx, guide.y + 12);
    return { sx, sy };
  });
  await page.mouse.move(gp.sx, gp.sy);
  await sleep(120);
  await page.mouse.down({ button: 'right' });
  await sleep(500);
  await page.mouse.up({ button: 'right' });
  await sleep(300);
  const d = await snap(page, 'P4-dialog');
  console.log('[P4-dialog]', JSON.stringify({ dialogOpen: d.dialogOpen, panel: d.panel }));
  ok(d.dialogOpen, 'P4-0 右键向导=对话开');
  const wb = await page.evaluate(() => window.__bj83wb);
  const hit = await rightClickWorld(page, wb.wx, wb.wy);
  const s = await snap(page, 'P4');
  console.log('[P4-hit]', JSON.stringify(hit));
  console.log('[P4]', JSON.stringify({ ...s, log: undefined }));
  console.log('[P4-log]', JSON.stringify(s.log));
  ok(s.panel === 'block', `P4-1 物品栏开(display=${s.panel})`);
  ok(s.modernOpen && s.winVisible, `P4-2 modern 窗开(modern=${s.modernOpen} vis=${s.winVisible})`);
  ok(!s.pipsUseGrid && !s.gridVisible, `P4-3 网格不开(pips=${s.pipsUseGrid} vis=${s.gridVisible})`);
  ok(s.dialogOpen, `P4-4 对话共存不互斥(${s.dialogOpen})`);
  await page.screenshot({ path: '/tmp/bj83-p4-dialog.png' });
  ok(errs.length === 0, `P4-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ P6:classic 网格残留 → 切 modern → 右击(残留双窗检查) ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'classic');
  const wb = await page.evaluate(() => window.__bj83wb);
  await rightClickWorld(page, wb.wx, wb.wy);
  const pre = await snap(page, 'P6-pre');
  ok(pre.pipsUseGrid, `P6-0 classic 网格已开(pips=${pre.pipsUseGrid})`);
  await page.evaluate(async () => { await window.__bj83opts.set('craftingGridControl', 'modern'); });
  await sleep(150);
  const hit = await rightClickWorld(page, wb.wx, wb.wy);
  const s = await snap(page, 'P6');
  console.log('[P6-hit]', JSON.stringify(hit));
  console.log('[P6]', JSON.stringify({ ...s, log: undefined }));
  ok(s.modernOpen && s.winVisible, `P6-1 modern 窗开(modern=${s.modernOpen} vis=${s.winVisible})`);
  console.log(`[P6-FACT] 残留网格 pips=${s.pipsUseGrid} vis=${s.gridVisible}(原版 Main.cs:42448 同相域,登记不判)`);
  await page.screenshot({ path: '/tmp/bj83-p6.png' });
  ok(errs.length === 0, `P6-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
