// BJ86 定谳探针:右击站点出宫格(PipsUseGrid)在两种 craftingGridControl 下的行为面。
// A=classic 用户主诉路径:「已关宫格」→ 右击工作台 → 宫格是否复开(原版 CraftingUI.cs:157
//   无条件 true = 三态开关);关宫格(切换钮左键)→ 再右击 → 复开?;宫格开态再右击 → LOUD 全收。
// B=modern:右击工作台 → modern 窗开,宫格是否出现(原版 NewCraftingUI 不碰 PipsUseGrid)。
// C=残留面(债④):classic 网格开 → 切换钮右键切 modern(原版不清 PipsUseGrid)→ 右击站点
//   = 窗+网格双开(原版 Main.cs:42449 门无 !NewCraftingUI.Visible 同相,登记不判复证)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

const boot = async (page, mode) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
  await sleep(700);
  await page.evaluate(async (m) => {
    document.getElementById('sw-welcome-announce')?.remove();
    const options = (await import('/src/core/Options.ts')).options;
    window.__bj86opts = options;
    await options.set('craftingGridControl', m);
    await options.set('inventoryLayout', 'vanilla');
    window.__swUI.closeInventory();
    for (const npc of [...(window.__swGame.entities?.npcs ?? [])]) {
      try { npc.x = window.__swGame.player.x + 3000; npc.y = (window.__swGame.world.groundLevel - 4) * 16; } catch { /* 空守卫 */ }
    }
    window.__swGame.closeNpcDialog?.(true);
  }, mode);
  await sleep(200);
  return errs;
};

const placeWorkbench = (page, dx = 3) => page.evaluate((d) => {
  const g = window.__swGame, st = g.world.store;
  const wb = window.__swTiles['workbench'];
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor((g.player.y + g.player.h) / 16);
  const tx = ptx + d, ty = pty - 1;
  st.setTileSilent(tx, ty, wb, 0, 0);
  st.setTileSilent(tx + 1, ty, wb, 18, 0);
  window.__bj86wb = { tx, ty, wx: tx * 16 + 16, wy: ty * 16 + 8 };
  return window.__bj86wb;
}, dx);

const rightClickWorld = async (page, wx, wy) => {
  const p = await page.evaluate(([x, y]) => {
    const [sx, sy] = window.__swGame.camera.worldToScreen(x, y);
    return { sx, sy };
  }, [wx, wy]);
  await page.mouse.move(p.sx, p.sy);
  await sleep(120);
  await page.mouse.down({ button: 'right' });
  await sleep(500);
  await page.mouse.up({ button: 'right' });
  await sleep(300);
};

const leftClickToggle = (page) => page.evaluate(() => {
  const btn = window.__swUI.vinvGridToggleImg?.parentElement;
  if (!btn) return false;
  btn.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
  return true;
});

const rightClickToggle = (page) => page.evaluate(() => {
  const btn = window.__swUI.vinvGridToggleImg?.parentElement;
  if (!btn) return false;
  btn.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true }));
  return true;
});

const snap = (page, tag) => page.evaluate((t) => {
  const ui = window.__swUI, g = window.__swGame;
  const vis = (e) => e ? (e.offsetParent !== null && e.getBoundingClientRect().width > 0) : false;
  const gridEl = ui.vinvCraftGridEl;
  const r = gridEl && vis(gridEl) ? gridEl.getBoundingClientRect() : null;
  const vw = window.innerWidth, vh = window.innerHeight;
  return {
    tag: t,
    control: window.__bj86opts?.data?.craftingGridControl ?? null,
    panel: ui.invPanel?.style.display ?? 'x',
    modernOpen: ui.vinvModernCraftOpen,
    winVisible: vis(ui.vinvModernCraftEl),
    pipsUseGrid: ui.vinvPipsUseGrid,
    gridVisible: vis(gridEl),
    gridRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
    gridCenter: r ? { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), vw, vh } : null,
    dialogOpen: !!document.querySelector('.sw-npc-dialog'),
    running: !!g?.running,
  };
}, tag);

// ============ A:classic 用户主诉路径 ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'classic');
  const wb = await placeWorkbench(page);
  const s0 = await snap(page, 'A0-rest');
  console.log('[A0]', JSON.stringify(s0));
  ok(!s0.pipsUseGrid && !s0.gridVisible, `A-0 静息态=已关宫格(pips=${s0.pipsUseGrid} grid=${s0.gridVisible})——用户起点`);
  ok(s0.panel !== 'block', `A-0b 包关态(panel=${s0.panel})`);

  await rightClickWorld(page, wb.wx, wb.wy);                 // ①用户操作:右击工作台
  const s1 = await snap(page, 'A1-open');
  console.log('[A1]', JSON.stringify(s1));
  ok(s1.panel === 'block', `A-1 包开(panel=${s1.panel})`);
  ok(s1.pipsUseGrid && s1.gridVisible, `A-2 宫格开(pips=${s1.pipsUseGrid} grid=${s1.gridVisible})——=原版 CraftingUI.cs:157`);
  if (s1.gridCenter) {
    const { cx, cy, vw, vh } = s1.gridCenter;
    ok(cx > vw * 0.25 && cx < vw * 0.85 && cy > vh * 0.3 && cy < vh * 0.95,
      `A-3 宫格居中(${cx},${cy} / ${vw}x${vh})——=用户所见"中间宫格"`);
  } else ok(false, 'A-3 宫格矩形未捕获');

  await leftClickToggle(page);                               // ②用户操作:切换钮左键"关闭宫格"
  await sleep(400);
  const s2 = await snap(page, 'A2-off');
  console.log('[A2]', JSON.stringify(s2));
  ok(!s2.pipsUseGrid && !s2.gridVisible, `A-4 已关宫格(pips=${s2.pipsUseGrid} grid=${s2.gridVisible})`);
  ok(s2.panel === 'block', `A-4b 包仍开(panel=${s2.panel})——滚动列表在(列表无 PipsUseGrid 门=原版 :42425)`);

  await rightClickWorld(page, wb.wx, wb.wy);                 // ③用户操作:再右击工作台
  const s3 = await snap(page, 'A3-reopen');
  console.log('[A3]', JSON.stringify(s3));
  ok(s3.pipsUseGrid && s3.gridVisible, `A-5 宫格复开(pips=${s3.pipsUseGrid} grid=${s3.gridVisible})——=原版三态开臂无条件 :157【定谳面】`);

  await rightClickWorld(page, wb.wx, wb.wy);                 // ④宫格开态再右击
  const s4 = await snap(page, 'A4-closeall');
  console.log('[A4]', JSON.stringify(s4));
  ok(!s4.pipsUseGrid && !s4.gridVisible, `A-6 三态收臂=全收(pips=${s4.pipsUseGrid} grid=${s4.gridVisible})——原版 :148-153`);
  ok(errs.length === 0, `A-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ B:modern 模式(右击站点应开 modern 窗,无宫格) ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'modern');
  const wb = await placeWorkbench(page);
  const s0 = await snap(page, 'B0-rest');
  ok(!s0.pipsUseGrid && !s0.gridVisible, `B-0 静息态无网格(pips=${s0.pipsUseGrid})`);
  await rightClickWorld(page, wb.wx, wb.wy);
  const s1 = await snap(page, 'B1-open');
  console.log('[B1]', JSON.stringify(s1));
  ok(s1.modernOpen && s1.winVisible, `B-1 modern 窗开(modern=${s1.modernOpen} vis=${s1.winVisible})`);
  ok(!s1.pipsUseGrid && !s1.gridVisible, `B-2 无宫格(pips=${s1.pipsUseGrid} grid=${s1.gridVisible})——=原版 NewCraftingUI.OpenCloseFilter 不碰 PipsUseGrid`);
  // 关包重开(净态链):关包清位(Main.cs:43934 同相)→再右击仍无宫格
  await page.evaluate(() => window.__swUI.closeInventory());
  await sleep(300);
  const s2 = await snap(page, 'B2-closed');
  ok(!s2.pipsUseGrid && !s2.gridVisible, `B-3 关包净态(pips=${s2.pipsUseGrid})——Main.cs:43934 同相`);
  await rightClickWorld(page, wb.wx, wb.wy);
  const s3 = await snap(page, 'B3-reopen');
  ok(s3.modernOpen && !s3.gridVisible, `B-4 再右击:窗开+无宫格(modern=${s3.modernOpen} grid=${s3.gridVisible})`);
  ok(errs.length === 0, `B-9 无页面错误(${errs.join(' | ')})`);
  await page.screenshot({ path: '/tmp/bj86-modern.png' });
  await page.close();
}

// ============ C:残留面(债④)——classic 网格开 → 切 modern → 右击站点 ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'classic');
  const wb = await placeWorkbench(page);
  await rightClickWorld(page, wb.wx, wb.wy);                  // 网格开
  const s0 = await snap(page, 'C0-grid');
  ok(s0.pipsUseGrid && s0.gridVisible, `C-0 网格开(pips=${s0.pipsUseGrid})`);
  await rightClickToggle(page);                               // 切换钮右键:classic→modern(原版不清 PipsUseGrid)
  await sleep(400);
  const s1 = await snap(page, 'C1-switched');
  console.log('[C1]', JSON.stringify({ control: s1.control, pips: s1.pipsUseGrid, grid: s1.gridVisible }));
  ok(s1.control === 'modern' && s1.pipsUseGrid, `C-1 已切 modern 但网格态残留(control=${s1.control} pips=${s1.pipsUseGrid})——原版 :322-331 同相`);
  await rightClickWorld(page, wb.wx, wb.wy);                  // modern 臂右击站点
  const s2 = await snap(page, 'C2-both');
  console.log('[C2]', JSON.stringify(s2));
  ok(s2.modernOpen && s2.pipsUseGrid, `C-2 窗+网格双开(modern=${s2.modernOpen} pips=${s2.pipsUseGrid})——=债④原版 Main.cs:42449 同相(登记不判)`);
  ok(errs.length === 0, `C-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

await browser.close();
if (fails.length) { console.error(`\nBJ86 ${fails.length} FAIL`); process.exit(1); }
console.log('\nBJ86 ALL PASS');
