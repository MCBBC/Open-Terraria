// SW-FX36 标尺族实机探针(2026-09-11)——Ruler 档测量线+W×H 计数 / 机械标尺档网格 /
// 图标列开关归属 / 背包∪装备判定域。
// 运行:node tools/probe.mjs run scripts/_fx36.mjs --size=small --vite=auto
import {
  launchBrowser, openPage, bootstrap, gotoApp, waitForBridge, createGame,
  ledger, front, pump, nextFrame, savePageShot, resolveShotPath,
} from '../tools/probe/lib/index.mjs';

const fails = [];
const L = ledger();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const page = await openPage(browser, {});
const boot = await bootstrap(page, process.env.SW_ORIGIN || 'http://localhost:5199');
if (!boot.ok) { console.log('BOOT FAIL', boot); process.exit(1); }
await gotoApp(page, page.__probeOrigin || process.env.SW_ORIGIN || 'http://localhost:5199', { extraQuery: '?invlayout=vanilla', tries: 40 });
if (!(await waitForBridge(page, { timeout: 120_000 }))) { console.log('BRIDGE FAIL'); process.exit(1); }

const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('世界已建', gen.ok);
await front(page);
await pump(page, 30);
// 开背包(vanilla 布局,图标列/布局随帧刷)
await page.evaluate(async () => { window.__swUI.openInventory(true); await window.__swUI.refreshAllAsync?.(); });
await sleep(300);

// 页内助手:读标尺注入面 + 图标列可见面(backgroundPosition 只在 pos() 成功=可见时写)
const readState = () => page.evaluate(() => {
  const g = window.__swGame;
  const br = g.renderer.builderRulers;
  const icons = [...document.querySelectorAll('.vinv-btn')]
    .filter((b) => (b.style.backgroundImage || '').includes('UI_BuilderIcons'))
    .map((b) => ({ idx: b.style.backgroundPosition, title: b.title }))
    .filter((b) => b.idx !== '');
  return {
    status: [...g.player.builderAccStatus],
    br: br ? {
      lineOn: br.lineOn, gridOn: br.gridOn,
      feetTx: br.feetTx, feetTy: br.feetTy, nudge: br.nudge,
      mouseTx: br.mouseTx, mouseTy: br.mouseTy,
      speed: br.speed, gridDist: br.gridDist,
    } : null,
    readout: g.renderer.rulerReadout ? g.renderer.rulerReadout.text : null,
    iconIdx: icons.map((b) => b.idx.split('px')[0]).join(','),
    iconTitles: icons.map((b) => b.title),
  };
});

// ---- 场景 0:空配饰——线旗恒真(:18809),Ruler 档图标人人可见,开关缺省关 ----
let s = await readState();
L.chk('缺省 status[0]=1(ctor :56749)=线关', s.status[0] === 1, `st0=${s.status[0]}`);
L.chk('空配饰:builderRulers=null(线缺省关+无网格旗)', s.br === null, JSON.stringify(s.br));
L.chk('空配饰:图标列含 Ruler 档(恒可见,FX36)+无网格档',
  s.iconIdx.split(',').includes('0') && !s.iconIdx.split(',').includes('-16'), `idx=${s.iconIdx}`);
// 图标位图源序 = 8,9,0,1,2,3,4,5,6,7 每档 X=idx*16:Ruler 档 idx=0 → bgposX=0
// 网格档 idx=1 → -16。空配饰可见面={8(无透镜,不显),9(不显),0(恒显),1(不显)}+方块替换(另源)

// ---- 场景 1:开线(点 Ruler 图标)→ 测量线+W×H 计数直读 ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.builderAccStatus[0] = 0;      // =点图标 toggleBuilderAccBit 后态
});
await page.mouse.move(760, 420);        // 光标落玩家侧下方,保证跨度非 1×1
await sleep(150);
await nextFrame(page); await nextFrame(page);
s = await readState();
L.chk('线开:builderRulers.lineOn=true/gridOn=false', !!s.br && s.br.lineOn === true && s.br.gridOn === false, JSON.stringify(s.br));
// W×H 期望值(镜像 Renderer 公式:ddx=mouseTx−(feetTx+(≠则+nudge)),ddy=mouseTy−feetTy)
const expectText = (br) => {
  const ddx = br.mouseTx - (br.feetTx + (br.feetTx !== br.mouseTx ? br.nudge : 0));
  const ddy = br.mouseTy - br.feetTy;
  const w = Math.abs(ddx) + 1, h = Math.abs(ddy) + 1;
  return (w > 1 || h > 1) ? `${w}x${h}` : null;
};
L.chk('W×H 计数直读=跨度+1 闭区间', s.readout === expectText(s.br), `got=${s.readout} want=${s.br ? expectText(s.br) : '-'} br=${JSON.stringify(s.br)}`);
L.chk('静止 α 满幅:speed≤2', s.br.speed <= 2, `speed=${s.br.speed}`);
await savePageShot(page, resolveShotPath('fx36-line-readout.png'));

// ---- 场景 2:鼠标挪远 → 计数变化(直读第二次) ----
await page.mouse.move(900, 650);
await sleep(120); await nextFrame(page); await nextFrame(page);
s = await readState();
L.chk('挪鼠后计数随跨度变(第二次直读)', s.readout === expectText(s.br), `got=${s.readout} want=${expectText(s.br)}`);
await savePageShot(page, resolveShotPath('fx36-line-readout2.png'));

// ---- 场景 3:背包装 2799 机械标尺 → 网格档亮(背包∪装备判定域,不装备!) ----
const gaveKey = await page.evaluate(() => {
  const g = window.__swGame;
  for (const k of ['vi_2799_LaserRuler', 'vi_2799_MechanicalRuler']) {
    const id = g.itemId(k);
    if (id > 0) { g.player.inv.slots[10] = { id, stack: 1 }; return k; }
  }
  return null;
});
L.chk('2799 键解析+入背包格 10', !!gaveKey, String(gaveKey));
await page.evaluate(async () => { await window.__swUI.refreshAllAsync(); });  // 生产等价:拾取事件 → refreshAll
await nextFrame(page); await nextFrame(page);
s = await readState();
L.chk('背包持 2799(未装备):gridOn=true(判定域=背包∪装备,FX36)', !!s.br && s.br.gridOn === true, `gridOn=${s.br && s.br.gridOn}`);
L.chk('图标列出现网格档(bgpos -16)', s.iconIdx.includes('-16'), `idx=${s.iconIdx}`);
L.chk('网格淡出驱动=残影滞后(静止≈0 → 满幅)', s.br.gridDist < 4, `gridDist=${s.br.gridDist}`);
await savePageShot(page, resolveShotPath('fx36-grid.png'));

// ---- 场景 4:开关四态遍历(线×网) ----
const want = [[0, 0, true, true], [0, 1, true, false], [1, 0, false, true], [1, 1, false, false]];
for (const [a, b, wl, wg] of want) {
  await page.evaluate(([a2, b2]) => {
    const g = window.__swGame;
    g.player.builderAccStatus[0] = a2;
    g.player.builderAccStatus[1] = b2;
  }, [a, b]);
  await nextFrame(page); await nextFrame(page);
  s = await readState();
  L.chk(`四态(${a},${b}):lineOn=${wl} gridOn=${wg}`, !!s.br === (wl || wg)
    && (!s.br || (s.br.lineOn === wl && s.br.gridOn === wg)), JSON.stringify(s.br));
}

// ---- 场景 5:3611 宏伟蓝图 → wires 档整组亮(6 图标);5126 → 仅 autoPaint ----
await page.evaluate(() => {
  const g = window.__swGame;
  for (const k of ['vi_3611_WireKite', 'vi_3611_TheGrandDesign']) {
    const id = g.itemId(k);
    if (id > 0) { g.player.inv.slots[11] = { id, stack: 1 }; return k; }
  }
  return null;
});
await page.evaluate(async () => { await window.__swUI.refreshAllAsync(); });
await nextFrame(page); await nextFrame(page);
s = await readState();
L.chk('3611 背包:线材可见度档亮(bgpos 含 -128=idx8 或 wire 族)', s.iconIdx.split(',').some((x) => x === '-128'), `idx=${s.iconIdx}`);
await page.evaluate(() => {
  const g = window.__swGame;
  for (const k of ['vi_5126_HandOfCreation']) {
    const id = g.itemId(k);
    if (id > 0) { g.player.inv.slots[12] = { id, stack: 1 }; return k; }
  }
});
await page.evaluate(async () => { await window.__swUI.refreshAllAsync(); });
await nextFrame(page); await nextFrame(page);
s = await readState();
L.chk('5126:无独立 Ruler/网格档新增(归属=autoPaint 档),手绘档 bgpos -48(idx3 autoPaint) 在列',
  s.iconIdx.includes('-48'), `idx=${s.iconIdx}`);
await savePageShot(page, resolveShotPath('fx36-icon-column.png'));

// ---- 场景 6:线关闭+网格关 → builderRulers=null(读数区清空) ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.builderAccStatus[0] = 1;
  g.player.builderAccStatus[1] = 1;
});
await nextFrame(page); await nextFrame(page);
s = await readState();
L.chk('双关:builderRulers=null ∧ rulerReadout=null', s.br === null && s.readout === null, `br=${JSON.stringify(s.br)} ro=${s.readout}`);

console.log('\n==== SW-FX36 探针汇总 ====');
L.print();
const bad = L.exitCode();
await browser.close();
process.exit(bad);
