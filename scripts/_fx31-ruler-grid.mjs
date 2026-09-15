// SW-FX31 标尺/网格门探针(2026-09-15)——用户实报「开标尺→网格也开;关标尺→网格滞留」。
// 原版逐字门:DrawInterface_4_Ruler(Main.cs:47046-47048)= rulerLine(恒真:18809)∧builderAccStatus[0]==0;
//   DrawInterface_3_LaserRuler(:47146-47148)= rulerGrid 旗(2799/3611,:12905-12909)∧builderAccStatus[1]==0;
//   toggle 写位(:48205 case0→[0] / :48227 case1→[1])互不牵连。
// 断言:①点标尺开关 → 线显/网格不变,再点 → 线隐且无网格滞留;②网格档独立显隐,标尺开关不触碰网格门。
// 运行:SW_ORIGIN=http://localhost:5221 node tools/run-diag.mjs scripts/_fx31-ruler-grid.mjs
import {
  launchBrowser, openPage, bootstrap, gotoApp, waitForBridge, createGame, ledger, front,
} from '../tools/probe/lib/index.mjs';
import { writeFileSync } from 'node:fs';

const L = ledger();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({ viewport: { width: 1100, height: 750 } });
const page = await openPage(browser, {});
const boot = await bootstrap(page, process.env.SW_ORIGIN || 'http://localhost:5199');
if (!boot.ok) { console.log('BOOT FAIL', boot); process.exit(1); }
await gotoApp(page, page.__probeOrigin || process.env.SW_ORIGIN || 'http://localhost:5199', { extraQuery: '?invlayout=vanilla', tries: 40 });
if (!(await waitForBridge(page, { timeout: 120_000 }))) { console.log('BRIDGE FAIL'); process.exit(1); }

const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('世界已建', gen.ok);
await front(page);

// ---- 页内观测器:状态面 + 主画布青色像素计数(标尺线/网格同族青调) ----
await page.evaluate(() => {
  window.__fx31snap = () => {
    const g = window.__swGame;
    const st = g.player.builderAccStatus.slice();
    const r = g.renderer.builderRulers;
    const cv = [...document.querySelectorAll('#game-root canvas')]
      .filter((c) => c.width >= 400 && !c.className)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    let cyan = 0;
    if (cv && cv.width > 0) {
      const c2 = document.createElement('canvas');
      c2.width = cv.width; c2.height = cv.height;
      const o = c2.getContext('2d');
      o.drawImage(cv, 0, 0);
      const d = o.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2], A = d[i + 3];
        if (A > 20 && G > 40 && B > 40 && B >= G && R * 2 < G) cyan++;
      }
    }
    return { status: st, rulers: r ? { lineOn: r.lineOn, gridOn: r.gridOn } : null, cyan, w: cv ? cv.width : 0 };
  };
  window.__fx31click = (bgPos) => {
    const vinv = document.querySelector('.sw-vinv');
    if (!vinv) return { found: false, why: 'no .sw-vinv' };
    const fam = [...vinv.querySelectorAll('.vinv-btn')]
      .filter((b) => (b.style.backgroundImage || '').includes('UI_BuilderIcons'));
    if (!fam.length) return { found: false, why: 'no builder icons family', fam: fam.length };
    const want = bgPos.replace(/\s/g, '');
    let btn = fam.find((b) => (b.style.backgroundPosition || '').replace(/\s/g, '') === want);
    if (!btn) {
      // DOM 重建后 bgPos 可能未重画(pos() 签名缓存)——回退:可见钮中取第一个(无配饰态=RulerLine 唯一可见)
      const vis = fam.filter((b) => b.style.display !== 'none');
      if (vis.length === 1) btn = vis[0];
    }
    if (!btn) return { found: false, why: 'bgPos miss', fam: fam.length,
      positions: fam.map((b) => b.style.backgroundPosition), displays: fam.map((b) => b.style.display) };
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    return { found: true };
  };
  window.__fx31diag = () => {
    const cans = [...document.querySelectorAll('#game-root canvas')].map((c) => ({ w: c.width, h: c.height, cls: c.className || '(none)' }));
    const vinv = document.querySelector('.sw-vinv');
    const btns = vinv ? [...vinv.querySelectorAll('.vinv-btn')] : [];
    const withPos = btns.map((b, i) => ({ i, bg: b.style.backgroundPosition, disp: b.style.display }))
      .filter((x) => x.bg);
    const g = window.__swGame;
    const atlas = g.renderer?.atlas;
    let img68 = null;
    try { const im = atlas?.ensureVImage('vanilla/Extra_68.png'); img68 = im ? { w: im.width, h: im.height } : 'null'; } catch (e) { img68 = 'err:' + e.message; }
    return { canvases: cans, hasVinv: !!vinv, btns: btns.length, withPos: withPos.slice(0, 14), img68 };
  };
  // 视区中部 12×12 像素块采样(网格普通格 16px 栅格必覆盖中心),打印非透明像素
  window.__fx31sample = () => {
    const g = window.__swGame;
    const cv = [...document.querySelectorAll('#game-root canvas')].filter((c) => c.width >= 400 && !c.className)[0];
    if (!cv) return 'no cv';
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    const o = c2.getContext('2d');
    o.drawImage(cv, 0, 0);
    const cx = Math.floor(cv.width / 2), cy = Math.floor(cv.height / 2);
    const d = o.getImageData(cx - 8, cy - 8, 16, 16).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 6) out.push(`(${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3]})`);
    }
    return { cx, cy, nonzero: out.length, samples: out.slice(0, 10) };
  };
  // drawImage 计数 hook:网格白模 18×36 / 线白模 16×80(tintedExtra scratch 随源尺寸变)
  window.__fx31hook = () => {
    const proto = CanvasRenderingContext2D.prototype;
    if (!window.__fx31origDraw) {
      window.__fx31origDraw = proto.drawImage;
      window.__fx31count = { grid: 0, line: 0 };
      proto.drawImage = function (img, ...rest) {
        try {
          if (img && img.width === 18 && img.height === 36) window.__fx31count.grid++;
          else if (img && img.width === 16 && img.height === 80) window.__fx31count.line++;
        } catch (e) { /* 像素访问失败的源忽略 */ }
        return window.__fx31origDraw.call(this, img, ...rest);
      };
    }
    window.__fx31count.grid = 0; window.__fx31count.line = 0;
    return true;
  };
  window.__fx31counts = () => window.__fx31count;
});

const snap = () => page.evaluate(() => window.__fx31snap());
const clickRuler = () => page.evaluate(() => window.__fx31click('0px -16px'));
const clickGrid = () => page.evaluate(() => window.__fx31click('-16px -16px'));
// hook 窗口:清零 → 等 3 帧 → 读计数(网格/线白模 drawImage 次数)
const counts = async () => {
  await page.evaluate(() => window.__fx31hook());
  await sleep(120);
  return page.evaluate(() => window.__fx31counts());
};

// ---- 场景 A:无 2799/3611(干净世界)——标尺开关不得牵动网格 ----
await page.evaluate(async () => {
  const ui = window.__swUI;
  ui.openInventory(true);
  await ui.refreshAllAsync();
});
await sleep(300);

const a0 = await snap();
console.log('A0(初始):', JSON.stringify(a0));
console.log('DIAG:', JSON.stringify(await page.evaluate(() => window.__fx31diag())));
L.chk('A0 标尺线缺省关(status[0]=1)', a0.status[0] === 1, `st0=${a0.status[0]}`);
L.chk('A0 网格门缺省静默(rulers=null 或 gridOn=false)', !a0.rulers || !a0.rulers.gridOn, JSON.stringify(a0.rulers));

const c1 = await clickRuler();
await sleep(150);
const a1 = await snap();
const a1c = await counts();
console.log('A1(点标尺开):', JSON.stringify(a1), 'click=', JSON.stringify(c1), 'draw=', JSON.stringify(a1c));
L.chk('A1 标尺钮命中', c1.found === true);
L.chk('A1 status[0] 翻开(=0)', a1.status[0] === 0, `st0=${a1.status[0]}`);
L.chk('A1 线门开(lineOn=true)', !!a1.rulers && a1.rulers.lineOn === true, JSON.stringify(a1.rulers));
L.chk('A1 网格门未被牵连(gridOn=false)', !!a1.rulers && a1.rulers.gridOn === false, JSON.stringify(a1.rulers));
L.chk('A1 线白模实画(line>0)', a1c.line > 0, JSON.stringify(a1c));
L.chk('A1 网格白模零绘制(grid=0)', a1c.grid === 0, JSON.stringify(a1c));

const c2 = await clickRuler();
await sleep(150);
const a2 = await snap();
const a2c = await counts();
console.log('A2(点标尺关):', JSON.stringify(a2), 'click=', JSON.stringify(c2), 'draw=', JSON.stringify(a2c));
L.chk('A2 status[0] 翻关(=1)', a2.status[0] === 1, `st0=${a2.status[0]}`);
L.chk('A2 线门关(rulers=null)', a2.rulers === null, JSON.stringify(a2.rulers));
L.chk('A2 网格无滞留(grid=0 且 line=0)', a2c.grid === 0 && a2c.line === 0, JSON.stringify(a2c));

// ---- 场景 B:注入机械标尺 2799(未注册则退 3611)——网格档独立显隐 ----
const inj = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const cands = ['vi_2799_LaserRuler', 'vi_3611_WireKite', 'vi_486_Ruler'];
  let vid = 0, key = '';
  for (const k of cands) { const id = g.itemId(k); if (id > 0) { vid = id; key = k; break; } }
  if (vid > 0) g.player.inv.add(vid, 1);
  await ui.refreshAllAsync();
  return { key, vid };
});
await sleep(300);
const b0 = await snap();
console.log('B0(注入后):', JSON.stringify(b0), 'inj=', JSON.stringify(inj));
L.chk('B0 机械标尺注入成功(2799 或 3611 注册在库)', inj.vid > 0, JSON.stringify(inj));
if (inj.vid > 0) {
  L.chk('B0 网格旗点亮(gridOn=true,缺省 status[1]=0=开)', !!b0.rulers && b0.rulers.gridOn === true, JSON.stringify(b0.rulers));
  const b0c = await counts();
  console.log('B0 draw=', JSON.stringify(b0c));
  L.chk('B0 网格白模实画(grid>0)', b0c.grid > 0, JSON.stringify(b0c));

  const c3 = await clickRuler();
  await sleep(150);
  const b1 = await snap();
  const b1c = await counts();
  console.log('B1(点标尺开):', JSON.stringify(b1), 'click=', JSON.stringify(c3), 'draw=', JSON.stringify(b1c));
  L.chk('B1 标尺钮命中', c3.found === true);
  L.chk('B1 线开但不牵连网格(lineOn∧gridOn 双真)', !!b1.rulers && b1.rulers.lineOn === true && b1.rulers.gridOn === true, JSON.stringify(b1.rulers));
  L.chk('B1 网格仍实画(grid>0)', b1c.grid > 0, JSON.stringify(b1c));

  const c4 = await clickRuler();
  await sleep(150);
  const b2 = await snap();
  const b2c = await counts();
  console.log('B2(点标尺关):', JSON.stringify(b2), 'click=', JSON.stringify(c4), 'draw=', JSON.stringify(b2c));
  L.chk('B2 关标尺后网格独立存续(gridOn 仍 true)', !!b2.rulers && b2.rulers.gridOn === true, JSON.stringify(b2.rulers));
  L.chk('B2 网格白模仍实画(grid>0)', b2c.grid > 0, JSON.stringify(b2c));

  const c5 = await clickGrid();
  await sleep(150);
  const b3 = await snap();
  const b3c = await counts();
  console.log('B3(点机械标尺关):', JSON.stringify(b3), 'click=', JSON.stringify(c5), 'draw=', JSON.stringify(b3c));
  L.chk('B3 机械标尺钮命中', c5.found === true, JSON.stringify(c5));
  L.chk('B3 status[1] 翻关(=1)', b3.status[1] === 1, `st1=${b3.status[1]}`);
  L.chk('B3 网格门关(gridOn=false)', !b3.rulers || b3.rulers.gridOn === false, JSON.stringify(b3.rulers));
  L.chk('B3 网格白模停画(grid=0)', b3c.grid === 0, JSON.stringify(b3c));

  const c6 = await clickGrid();
  await sleep(150);
  const b4 = await snap();
  const b4c = await counts();
  console.log('B4(点机械标尺开):', JSON.stringify(b4), 'click=', JSON.stringify(c6), 'draw=', JSON.stringify(b4c));
  L.chk('B4 网格档独立重开(gridOn=true)', !!b4.rulers && b4.rulers.gridOn === true, JSON.stringify(b4.rulers));
  L.chk('B4 网格白模复画(grid>0)', b4c.grid > 0, JSON.stringify(b4c));

  // 截图存档:线+网格同显时刻(重开线)
  await clickRuler();
  await sleep(200);
  await page.screenshot({ path: '/tmp/fx31-rg.png' });
  console.log('截图:/tmp/fx31-rg.png(整页)');
  const b5 = await snap();
  console.log('B5(终态 线+网格):', JSON.stringify(b5));
}

console.log('---- 结果 ----');
L.print();
browser.close().catch(() => {});
process.exit(L.exitCode());
