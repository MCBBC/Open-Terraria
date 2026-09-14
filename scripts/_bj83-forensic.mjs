// BJ83 取证 v2:P3(为何无事)/P4(秒关凶手栈)/P7(对话共存+右击帧盒外)/
// P8(切换钮右击是否双吃世界右击)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

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

const clearNpcs = (page) => page.evaluate(() => {
  const g = window.__swGame;
  let n = 0;
  for (const npc of [...(g.entities?.npcs ?? [])]) {
    try { npc.x = g.player.x + 3000; npc.y = (g.world.groundLevel - 4) * 16; n++; } catch { /* 空守卫 */ }
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
  const gridEl = ui.vinvCraftGridEl;
  return {
    tag: t,
    control: window.__bj83opts?.data?.craftingGridControl ?? null,
    panel: ui.invPanel?.style.display ?? 'x',
    modernOpen: ui.vinvModernCraftOpen,
    modernFilter: ui.vinvModernCraftFilter ? ui.vinvModernCraftFilter.kind : null,
    winVisible: vis(ui.vinvModernCraftEl),
    pipsUseGrid: ui.vinvPipsUseGrid,
    gridVisible: vis(gridEl),
    gridDisplay: gridEl?.style.display ?? 'no-el',
    guideMenu: ui.vinvGuideMenuOpen,
    dialogOpen: !!document.querySelector('.sw-npc-dialog'),
    dialogSession: !!g?.dialogNpc,
    running: !!g?.running,
    log: (window.__bj83log ?? []).splice(0),
  };
}, tag);

const instrument = (page) => page.evaluate(() => {
  const ui = window.__swUI, g = window.__swGame;
  window.__bj83log = [];
  const rec = (e) => window.__bj83log.push(e);
  const wrap = (obj, key, tag, withStack) => {
    if (typeof obj[key] !== 'function') { rec({ tag: tag + ':MISSING' }); return; }
    const orig = obj[key];
    obj[key] = function (...a) {
      const e = {
        tag,
        control: window.__bj83opts?.data?.craftingGridControl,
        arg: a[0]?.kind ?? (typeof a[0] === 'number' ? a[0] : null),
        pips: ui.vinvPipsUseGrid, modern: ui.vinvModernCraftOpen,
      };
      if (withStack) e.stack = (new Error().stack || '').split('\n').slice(2, 9).map((s) => s.trim().replace(/^at /, '').replace(/\?v=[^ ]*/, '').replace(/:\d+:\d+$/, '')).join(' <- ');
      rec(e);
      return orig.apply(this, a);
    };
  };
  wrap(ui, 'openCraftingStationFilter', 'stationHook');
  wrap(ui, 'vinvOpenCloseModernCraftFilter', 'modernOCF');
  wrap(ui, 'vinvOpenModernCraft', 'modernOpen');
  wrap(ui, 'vinvCloseModernCraft', 'modernClose', true);
  wrap(ui, 'openInventory', 'openInventory');
  wrap(ui, 'closeInventory', 'closeInventory', true);
  wrap(g, 'interactAt', 'interactAt');
  wrap(g, 'openNpcDialog', 'openNpcDialog');
  wrap(g, 'closeNpcDialog', 'closeNpcDialog');
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

// ============ P3:classic → 右击(v1 曾无事;全 log) ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'classic');
  const wb = await page.evaluate(() => window.__bj83wb);
  const hit = await rightClickWorld(page, wb.wx, wb.wy);
  const s = await snap(page, 'P3');
  console.log('[P3-hit]', JSON.stringify(hit));
  console.log('[P3]', JSON.stringify({ ...s, log: undefined }));
  console.log('[P3-log]', JSON.stringify(s.log));
  ok(s.pipsUseGrid && s.gridVisible, `P3-1 classic 右击=网格开(pips=${s.pipsUseGrid} vis=${s.gridVisible})`);
  ok(errs.length === 0, `P3-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ P4:modern × 秒关取证(工作台在 reach 边界外 8 格) ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'modern');
  // 工作台挪到 8 格外(reach=5 之外)
  await page.evaluate(() => {
    const g = window.__swGame, st = g.world.store, wb = window.__swTiles['workbench'];
    const { tx, ty } = window.__bj83wb;
    st.setTileSilent(tx, ty, 0, 0, 0); st.setTileSilent(tx + 1, ty, 0, 0, 0);
    const ntx = Math.floor(g.player.cx / 16) + 8, nty = ty;
    st.setTileSilent(ntx, nty, wb, 0, 0); st.setTileSilent(ntx + 1, nty, wb, 18, 0);
    window.__bj83wb = { tx: ntx, ty, wx: ntx * 16 + 16, wy: ty * 16 + 8 };
  });
  await sleep(150);
  const wb = await page.evaluate(() => window.__bj83wb);
  const hit = await rightClickWorld(page, wb.wx, wb.wy);
  const s = await snap(page, 'P4');
  console.log('[P4-hit]', JSON.stringify(hit));
  console.log('[P4]', JSON.stringify({ ...s, log: undefined }));
  console.log('[P4-log]', JSON.stringify(s.log));
  ok(errs.length === 0, `P4-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ P7:modern × 对话强开(g.openNpcDialog)× 包关 → 右击帧盒外工作台 ============
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
    g.openNpcDialog(guide);
  });
  await sleep(300);
  const d0 = await snap(page, 'P7-dialog');
  console.log('[P7-dialog]', JSON.stringify({ dialogOpen: d0.dialogOpen, panel: d0.panel, session: d0.dialogSession }));
  ok(d0.dialogOpen, 'P7-0 对话面板开(g.openNpcDialog 直开)');
  const wb = await page.evaluate(() => window.__bj83wb);
  const hit = await rightClickWorld(page, wb.wx, wb.wy);
  const s = await snap(page, 'P7');
  console.log('[P7-hit]', JSON.stringify(hit));
  console.log('[P7]', JSON.stringify({ ...s, log: undefined }));
  console.log('[P7-log]', JSON.stringify(s.log));
  ok(s.panel === 'block', `P7-1 物品栏开(display=${s.panel})`);
  ok(s.modernOpen && s.winVisible, `P7-2 modern 窗开(modern=${s.modernOpen} vis=${s.winVisible})`);
  ok(!s.pipsUseGrid && !s.gridVisible, `P7-3 网格不开(pips=${s.pipsUseGrid} vis=${s.gridVisible})`);
  ok(s.dialogOpen, `P7-4 对话共存(${s.dialogOpen})`);
  await page.screenshot({ path: '/tmp/bj83-p7.png' });
  ok(errs.length === 0, `P7-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ P8:切换钮右击是否双吃世界右击(钮恰在工作台屏位) ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'modern');
  await page.evaluate(() => window.__swUI.openInventory(true));
  await sleep(250);
  // 把工作台屏位挪到切换钮 (94,450+adjY) 正上:改玩家位置使工作台 worldToScreen ≈ 钮位
  const moved = await page.evaluate(() => {
    const g = window.__swGame, ui = window.__swUI;
    const btn = ui.vinvGridToggleImg?.parentElement;
    if (!btn) return { err: 'no-btn' };
    const r = btn.getBoundingClientRect();
    const [wx, wy] = g.camera.screenToWorld(r.x + r.width / 2, r.y + r.height / 2);
    const st = g.world.store, wb = window.__swTiles['workbench'];
    const ntx = Math.floor(wx / 16), nty = Math.floor(wy / 16);
    st.setTileSilent(ntx, nty, wb, 0, 0); st.setTileSilent(ntx + 1, nty, wb, 18, 0);
    window.__bj83wb = { tx: ntx, ty: nty, wx: ntx * 16 + 16, wy: nty * 16 + 8 };
    const reach = g.tileReach ? g.tileReach(0) : null;
    return { btn: { x: r.x, y: r.y }, tile: { tx: ntx, ty: nty }, reach };
  });
  console.log('[P8-pre]', JSON.stringify(moved));
  await sleep(200);
  const wb = await page.evaluate(() => window.__bj83wb);
  // 右键钮中心=工作台格
  const p = await page.evaluate(() => {
    const btn = window.__swUI.vinvGridToggleImg.parentElement;
    const r = btn.getBoundingClientRect();
    return { sx: r.x + r.width / 2, sy: r.y + r.height / 2 };
  });
  await page.mouse.move(p.sx, p.sy);
  await sleep(120);
  await page.mouse.down({ button: 'right' });
  await sleep(500);
  await page.mouse.up({ button: 'right' });
  await sleep(300);
  const s = await snap(page, 'P8');
  console.log('[P8]', JSON.stringify({ ...s, log: undefined }));
  console.log('[P8-log]', JSON.stringify(s.log));
  console.log(`[P8-FACT] 右击钮后 control=${s.control}(modern=未被翻转;classic=被翻转) modern=${s.modernOpen} pips=${s.pipsUseGrid} stationHook 调用=${s.log.filter((e) => e.tag === 'stationHook').length}`);
  ok(errs.length === 0, `P8-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
