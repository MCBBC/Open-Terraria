// ★BJ430 制作列表站长按批量复现/定谳探针（用户实报「制作栏里长按物品无法批量快速
//  制作」）。只读+计数包裹,零 src 触碰。
//
// 场景：石台布景+工作台(dx+2)+背包 60 木 → 开 ESC（SW classic 列表站）：
//   A 定位木平台行（create 93,1 木@工作台）→ 真实 CDP 压按（move+down,无后续
//     mousemove=光标静止）按住 2.6s → 采样 vanillaCraft 调用数/木材存量/
//     craftHold 锚的 matches(':hover')/元素身份 → 定谳「:hover 在行重建后死链」
//     假说（BJ391 长按臂 runCraftArm 的悬停复核面）；
//   B :hover 迁移微实验——压按触发重建后,新行（同几何位）matches(':hover') 直测；
//   C 松键后单击二击面采样（压拍即合成=旧语义,首击聚焦=新语义,由落刀前后对比读）。
// 运行:node tools/probe.mjs run scripts/_bj430-craft-hold-probe.mjs --vite=<PORT>
import { launchBrowser, openPage, bootstrap, createGame, stage, sleep, ledger, savePageShot, front } from '../tools/probe/lib/index.mjs';

const L = ledger();
const EV = '/Users/vinlic/Project/GLM/SandboxWorld/game/docs/evidence/bj430';
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');

  const st = await stage(page, {
    w: 90, h: 26, platform: { key: 'stone' }, light: 'torch',
    tiles: [{ dx: 2, dy: -1, key: 'workbench' }],
    player: true, camera: true,
  });
  L.chk('stage', st.ok, st.why ?? '');

  // 材料 60 木 + vanillaCraft 计数包裹
  const inst = await page.evaluate(() => {
    const g = window.__swGame, ui = window.__swUI;
    const iid = window.__swFlow?.itemByVid?.(9);   // 木 vid=9
    if (iid == null || iid < 0) return { ok: false, why: 'no-wood-item' };
    g.player.inv.slots[10] = { id: iid, stack: 60 };
    const P = window.__swBJ430 = {
      n: { vanillaCraft: 0, timesSum: 0, rebuild: 0 },
      woodId: iid,
      hoverProbe: null,
    };
    const GP = Object.getPrototypeOf(g), UP = Object.getPrototypeOf(ui);
    const wrap = (o, name, tag, note) => {
      const orig = o[name];
      if (typeof orig !== 'function') return `miss:${name}`;
      o[name] = function (...a) {
        P.n[tag]++;
        if (note === 'craft') P.n.timesSum += (a[1] ?? 1);
        return orig.apply(this, a);
      };
      return 'ok';
    };
    wrap(GP, 'vanillaCraft', 'vanillaCraft', 'craft');
    wrap(UP, 'refreshVanillaCrafting', 'rebuild');
    return { ok: true };
  });
  L.chk('install', inst.ok, inst.why ?? '');

  await front(page);
  await sleep(300);

  // 开包（缺省 vanilla 布局:vinv 鱼眼格 vinvCraftAvailV/classic 旧布局=craftListEl 行）
  await page.evaluate(() => window.__swUI.openInventory());
  await sleep(700);

  // 布局面检测
  const face = await page.evaluate(() => {
    const ui = window.__swUI;
    return {
      builtLayout: ui._builtLayout,
      craftAvailV: ui.vinvCraftAvailV?.length ?? -1,
      pipsUseGrid: ui.vinvPipsUseGrid,
      modernOpen: ui.vinvModernCraftOpen,
      focusV: ui.vinvCraftFocusV,
      classicRows: ui.craftListEl ? ui.craftListEl.children.length : -1,
      classicAvail: ui.craftAvailRef?.length ?? -1,
    };
  });
  L.say(`[face] ${JSON.stringify(face)}`);
  L.chk('face-has-recipes', (face.craftAvailV ?? 0) > 0 || (face.classicAvail ?? 0) > 0, JSON.stringify(face));

  // A:定位木平台行几何（vinv 鱼眼格=vinvCraftAvailV 池格;classic=craftListEl 行）
  const rowInfo = await page.evaluate(() => {
    const ui = window.__swUI, P = window.__swBJ430;
    const isVinv = (ui.vinvCraftAvailV?.length ?? 0) > 0;
    let idx, row;
    if (isVinv) {
      idx = ui.vinvCraftAvailV.findIndex((e) => e.r.create === 93);
      if (idx < 0) return { ok: false, why: 'no-platform-row-vinv', rows: ui.vinvCraftAvailV.map((e) => e.r.create) };
      row = ui.vinvCraftCellEls[idx]?.el;
      if (!row) return { ok: false, why: 'no-cell-el', idx };
    } else {
      idx = ui.craftAvailRef.findIndex((e) => e.r.create === 93);
      if (idx < 0) return { ok: false, why: 'no-platform-row', rows: ui.craftAvailRef.map((e) => e.r.create) };
      row = ui.craftListEl.children[idx];
      if (!row) return { ok: false, why: 'no-dom-row', idx };
    }
    const r = row.getBoundingClientRect();
    return {
      ok: true, idx, vinv: isVinv, rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      cx: r.x + r.width / 2, cy: r.y + r.height / 2,
      sig: row.outerHTML.length,
      hover0: row.matches(':hover'),
    };
  });
  L.chk('A-locate-row', rowInfo.ok, JSON.stringify(rowInfo).slice(0, 200));
  if (!rowInfo.ok) { process.exit(L.exitCode()); }

  // B:压按（真实 CDP:move→down,此后【无任何 mousemove】=光标静止按住 2.6s）
  await page.mouse.move(rowInfo.cx, rowInfo.cy);
  await sleep(120);
  const hoverAfterMove = await page.evaluate(() => {
    const ui = window.__swUI;
    const isVinv = (ui.vinvCraftAvailV?.length ?? 0) > 0;
    const row = isVinv
      ? ui.vinvCraftCellEls[ui.vinvCraftAvailV.findIndex((e) => e.r.create === 93)]?.el
      : ui.craftListEl.children[ui.craftAvailRef.findIndex((e) => e.r.create === 93)];
    return { hover: row?.matches(':hover') ?? null, mouseX: ui.mouseX, mouseY: ui.mouseY };
  });
  await savePageShot(page, `${EV}/bj430-before-press.png`);
  await page.mouse.down();                     // 按住起点（压拍=旧语义合成 1）
  await sleep(400);

  // C:按住中段采样（重建后新行 :hover 直测 + 锚身份 + 矩形）
  const mid = await page.evaluate(() => {
    const ui = window.__swUI, P = window.__swBJ430;
    const ch = ui.craftHold;
    if (!ch) return { ch: null };
    const r = ch.el.getBoundingClientRect();
    let sameEl = null;
    if (ch.kind === 'fisheye') {
      sameEl = ui.vinvCraftCellEls[ui.vinvCraftAvailV.findIndex((e) => e.r.create === 93)]?.el === ch.el;
    } else if (ch.kind === 'list') {
      sameEl = ui.craftListEl.children[ui.craftAvailRef.findIndex((e) => e.r.create === 93)] === ch.el;
    }
    return {
      ch: { kind: ch.kind, connected: ch.el.isConnected, hover: ch.el.matches(':hover'),
            rect: { x: r.x, y: r.y, w: r.width, h: r.height } },
      sameEl, mouseX: ui.mouseX, mouseY: ui.mouseY,
      stackSplit: ui.stackSplit, superFastStack: ui.superFastStack,
    };
  });
  await sleep(1100);
  const mid2 = await page.evaluate(() => {
    const ui = window.__swUI, P = window.__swBJ430;
    const ch = ui.craftHold;
    return {
      hover: ch?.el.matches(':hover') ?? null,
      connected: ch?.el.isConnected ?? null,
      stackSplit: ui.stackSplit, superFastStack: ui.superFastStack,
    };
  });
  await sleep(1100);
  await page.mouse.up();
  await sleep(300);
  await savePageShot(page, `${EV}/bj430-after-hold.png`);

  const final = await page.evaluate(() => {
    const g = window.__swGame, ui = window.__swUI, P = window.__swBJ430;
    let wood = 0;
    for (const s of g.player.inv.slots) if (s && s.id === P.woodId) wood += s.stack;
    return {
      n: P.n,
      wood,
      craftHold: ui.craftHold ? { kind: ui.craftHold.kind } : null,
      stackSplit: ui.stackSplit, superFastStack: ui.superFastStack,
    };
  });
  L.say(`[hold-2.6s] n=${JSON.stringify(final.n)} wood=${final.wood}`);
  L.say(`[hover-after-move] ${JSON.stringify(hoverAfterMove)}`);
  L.say(`[mid-0.4s] ${JSON.stringify(mid)}`);
  L.say(`[mid-1.5s] ${JSON.stringify(mid2)}`);
  L.say(`[final] ${JSON.stringify(final)}`);

  // 定谳判据（探针自身不设红绿——落刀前后各跑一遍取证）：
  //  旧语义预期:vanillaCraft 次数=1（压拍 1 次,:hover 死臂无连做）或 ≥2（hover 活）
  L.chk('hold-produced-crafts', final.n.vanillaCraft >= 1, `crafts=${final.n.vanillaCraft}`);
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
