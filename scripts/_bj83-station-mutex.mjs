// BJ83 行为面终验:MX=两窗互斥(modern 窗开着切 classic 右击站点=窗收网格开) /
// DL=对话面(对话开着右击站点=原版先收话再开窗 NewCraftingUI.cs:886-890) /
// MG=FX30 烤档迁移(classic 无旗重载→modern;显式 classic 有旗重载→保留)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

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
  window.__bj83wb = { tx, ty, wx: tx * 16 + 16, wy: ty * 16 + 8 };
  return window.__bj83wb;
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

const snap = (page, tag) => page.evaluate((t) => {
  const ui = window.__swUI, g = window.__swGame;
  const vis = (e) => e ? (e.offsetParent !== null && e.getBoundingClientRect().width > 0) : false;
  const gridEl = ui.vinvCraftGridEl;
  return {
    tag: t,
    control: window.__bj83opts?.data?.craftingGridControl ?? null,
    migrated: window.__bj83opts?.data?.craftingGridControlMigrated ?? null,
    panel: ui.invPanel?.style.display ?? 'x',
    modernOpen: ui.vinvModernCraftOpen,
    winVisible: vis(ui.vinvModernCraftEl),
    pipsUseGrid: ui.vinvPipsUseGrid,
    gridVisible: vis(gridEl),
    dialogOpen: !!document.querySelector('.sw-npc-dialog'),
    dialogSession: !!g?.dialogNpc,
    running: !!g?.running,
  };
}, tag);

// ============ MX:两窗互斥 ============
{
  const page = await browser.newPage();
  const errs = await boot(page, 'modern');
  const wb = await placeWorkbench(page);
  await rightClickWorld(page, wb.wx, wb.wy);              // modern 窗开
  const s0 = await snap(page, 'MX-pre');
  ok(s0.modernOpen && s0.winVisible, `MX-0 modern 窗已开(modern=${s0.modernOpen} vis=${s0.winVisible})`);
  await page.evaluate(async () => { await window.__bj83opts.set('craftingGridControl', 'classic'); });
  await sleep(150);
  await rightClickWorld(page, wb.wx, wb.wy);              // classic 右击 → 互斥面
  const s = await snap(page, 'MX');
  console.log('[MX]', JSON.stringify(s));
  ok(!s.modernOpen && !s.winVisible, `MX-1 modern 窗收(modern=${s.modernOpen} vis=${s.winVisible})——双开防互斥`);
  ok(s.pipsUseGrid && s.gridVisible, `MX-2 网格开(pips=${s.pipsUseGrid} vis=${s.gridVisible})`);
  ok(s.panel === 'block', `MX-3 包开(display=${s.panel})`);
  ok(errs.length === 0, `MX-9 无页面错误(${errs.join(' | ')})`);
  await page.screenshot({ path: '/tmp/bj83-mx.png' });
  await page.close();
}

// ============ DL:对话面(对话开着右击站点=先收话再开窗) ============
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
  await sleep(500);
  await page.evaluate(() => {
    const g = window.__swGame, guide = window.__bj83guide;
    g.player.x = guide.cx - 30; g.player.y = guide.cy - 8; g.player.vx = 0; g.player.vy = 0;
    g.openNpcDialog(guide);
  });
  await sleep(300);
  const d0 = await snap(page, 'DL-dialog');
  console.log('[DL-dialog]', JSON.stringify({ dialogOpen: d0.dialogOpen, session: d0.dialogSession, panel: d0.panel }));
  ok(d0.dialogOpen, 'DL-0 对话面板开');
  // 工作台重落向导右侧 5 格(帧盒外,FX23 R5 同位)
  await page.evaluate(() => {
    const g = window.__swGame, st = g.world.store, wb = window.__swTiles['workbench'];
    // 站点落 AdjTiles 扫描盒内(player−4 格,原版点击 reach ⊂ 扫描盒=无秒杀带)且
    // 向导帧盒(≈player+2 格)外
    const ptx = Math.floor(g.player.cx / 16), pty = Math.floor((g.player.y + g.player.h) / 16);
    const ntx = ptx - 4, nty = pty - 1;
    st.setTileSilent(ntx, nty, wb, 0, 0); st.setTileSilent(ntx + 1, nty, wb, 18, 0);
    window.__bj83wb = { tx: ntx, ty: nty, wx: ntx * 16 + 16, wy: nty * 16 + 8 };
  });
  await sleep(200);
  const wb = await page.evaluate(() => window.__bj83wb);
  await rightClickWorld(page, wb.wx, wb.wy);
  const s = await snap(page, 'DL');
  console.log('[DL]', JSON.stringify(s));
  ok(!s.dialogOpen && !s.dialogSession, `DL-1 对话收(session=${s.dialogSession})——NewCraftingUI.cs:886-890 CloseAll 面`);
  ok(s.panel === 'block', `DL-2 包开(display=${s.panel})`);
  ok(s.modernOpen && s.winVisible, `DL-3 modern 窗开(modern=${s.modernOpen} vis=${s.winVisible})`);
  ok(!s.pipsUseGrid && !s.gridVisible, `DL-4 网格不开(pips=${s.pipsUseGrid} vis=${s.gridVisible})`);
  await page.screenshot({ path: '/tmp/bj83-dl.png' });
  ok(errs.length === 0, `DL-9 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ MG:烤档 classic 存续(RB29 迁移退役面,2026-09-15) ============
// ★RB29:BJ83 一次性迁移退役(没收用户显式 classic=回归1,见 Options.ts 迁移位注)——
// 本相由「烤档 classic→迁移 modern」翻转为「classic 无条件存续,load 卫门零冲写」。
{
  const page = await browser.newPage();
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(500);
  // 烤档模拟:写入 classic+无旗(FX30 窗口期存档形态),重载
  await page.evaluate(async () => {
    const { kvSet, kvGet } = await import('/src/save/KvStore.ts');
    const KEY = 'sandboxworld.options';
    const raw = JSON.parse((await kvGet(KEY)) ?? '{}');
    raw.craftingGridControl = 'classic';
    delete raw.craftingGridControlMigrated;
    await kvSet(KEY, JSON.stringify(raw));
  });
  await sleep(300);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  const mg = await page.evaluate(async () => {
    const options = (await import('/src/core/Options.ts')).options;
    window.__bj83opts = options;
    return { control: options.data.craftingGridControl, migrated: options.data.craftingGridControlMigrated };
  });
  console.log('[MG-baked]', JSON.stringify(mg));
  ok(mg.control === 'classic' && mg.migrated == null, `MG-1 存档 classic(无旗)重载=原样存续,零迁移(RB29,${mg.control}/${mg.migrated})`);

  // 显式 classic 持久化→重载=仍保留(与 MG-1 同相=显式/烤档一律不没收)
  await page.evaluate(async () => { await window.__bj83opts.set('craftingGridControl', 'classic'); });
  await sleep(500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  const mg2 = await page.evaluate(async () => {
    const options = (await import('/src/core/Options.ts')).options;
    return { control: options.data.craftingGridControl, migrated: options.data.craftingGridControlMigrated };
  });
  console.log('[MG-explicit]', JSON.stringify(mg2));
  ok(mg2.control === 'classic', `MG-2 显式 classic 重载保留(${mg2.control}/${mg2.migrated})`);
  // 复原 modern(不污染下相)
  await page.evaluate(async () => {
    const options = (await import('/src/core/Options.ts')).options;
    await options.set('craftingGridControl', 'modern');
  });
  await page.close();
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
