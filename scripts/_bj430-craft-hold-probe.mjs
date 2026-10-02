// ★BJ430 制作站长按批量复现/定谳探针（用户实报「制作栏里长按物品无法批量快速
//  制作」）。只读+计数包裹,零 src 触碰。
//
// 场景：石台布景+工作台(dx+2)+背包 60 木 → 开 ESC（缺省 vanilla 布局=vinv 鱼眼格）：
//   A 单击木平台行（create 93）→ 聚焦（首击聚焦面,vinvCraftFocusV=idx+吸附滑行）；
//   B 吸附落位后重测行矩形 → 按住（真实 CDP:down,此后【无 mousemove】=光标静止）
//     2.6s → 采样 vanillaCraft 次数/木材存量/craftHold 锚身份/isConnected/
//     matches(':hover')/矩形 → 定谳长按死臂根因（锚随格池重建销亡 + :hover 静止
//     光标不迁移,两案并列取证）；
//   C 松键终态采样。
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

  // SW_LAYOUT=classic → 运行期切旧布局（options 单例经动态 import 取同实例,
  // onChange 1047 行 watcher 重建面板;探针即用同法,免 bootstrap 查询串路径）
  if (process.env.SW_LAYOUT) {
    const flip = await page.evaluate(async (lay) => {
      const mod = await import('/src/core/Options.ts');
      const options = mod.options ?? mod.default;
      await options.set('inventoryLayout', lay);
      return { layout: options.data.inventoryLayout, built: window.__swUI._builtLayout };
    }, process.env.SW_LAYOUT);
    L.chk('layout-flip', flip.layout === process.env.SW_LAYOUT && flip.built === process.env.SW_LAYOUT, JSON.stringify(flip));
  }

  // 材料 60 木 + vanillaCraft 计数包裹
  const inst = await page.evaluate(() => {
    const g = window.__swGame, ui = window.__swUI;
    const iid = window.__swFlow?.itemByVid?.(9);   // 木 vid=9
    if (iid == null || iid < 0) return { ok: false, why: 'no-wood-item' };
    g.player.inv.slots[10] = { id: iid, stack: 60 };
    const P = window.__swBJ430 = {
      n: { vanillaCraft: 0, timesSum: 0, refresh: 0, rebuild: 0 },
      woodId: iid,
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
    wrap(UP, 'refreshVanillaCrafting', 'refresh');
    wrap(UP, 'vinvRebuildCraftCells', 'rebuild');
    return { ok: true };
  });
  L.chk('install', inst.ok, inst.why ?? '');

  await front(page);
  await sleep(300);

  // 开包（缺省 vanilla 布局=vinv 鱼眼格）
  await page.evaluate(() => window.__swUI.openInventory());
  await sleep(700);

  // SW_STATION=modern → modern 网格窗（FX41,vinv 布局内 vinvOpenModernCraft）
  if (process.env.SW_STATION === 'modern') {
    const md = await page.evaluate(() => {
      const ui = window.__swUI;
      ui.vinvOpenModernCraft(null, false);
      return { open: ui.vinvModernCraftOpen };
    });
    L.chk('modern-open', md.open === true, JSON.stringify(md));
    await sleep(700);
  }

  const findCell = () => page.evaluate(() => {
    const ui = window.__swUI;
    if (ui.vinvModernCraftOpen) {
      const idx = ui.vinvModernEntries.findIndex((e) => e.r.create === 93);
      const cell = ui.vinvModernCellEls[idx];
      if (!cell) return { mode: 'modern', idx, ok: false };
      const r = cell.el.getBoundingClientRect();
      return { mode: 'modern', idx, ok: true, x: r.x + r.width / 2, y: r.y + r.height / 2,
               hover: cell.el.matches(':hover') };
    }
    const classic = ui._builtLayout === 'classic';
    const idx = classic
      ? ui.craftAvailRef.findIndex((e) => e.r.create === 93)
      : ui.vinvCraftAvailV.findIndex((e) => e.r.create === 93);
    const el = classic ? ui.craftListEl?.children[idx] : ui.vinvCraftCellEls[idx]?.el;
    if (!el) return { mode: classic ? 'classic' : 'vinv', idx, ok: false };
    const r = el.getBoundingClientRect();
    return { mode: classic ? 'classic' : 'vinv', idx, ok: true,
             x: r.x + r.width / 2, y: r.y + r.height / 2, hover: el.matches(':hover') };
  });

  // A:单击聚焦（首击聚焦面）
  let rc = await findCell();
  L.chk('A-cell-found', rc.ok, JSON.stringify(rc));
  await page.mouse.move(rc.x, rc.y);
  await sleep(120);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
  await sleep(900);   // 吸附滑行落位
  const focus1 = await page.evaluate(() => {
    const ui = window.__swUI;
    return {
      focusV: ui.vinvCraftFocusV,
      focusCreate: ui.vinvCraftAvailV[ui.vinvCraftFocusV]?.r.create ?? null,
      n: window.__swBJ430.n,
    };
  });
  L.say(`[A-focus-click] ${JSON.stringify(focus1)}`);

  // B:吸附落位后重测矩形 → 按住 2.6s（无后续 mousemove）
  rc = await findCell();
  L.chk('B-cell-after-snap', rc.ok, JSON.stringify(rc));
  await page.mouse.move(rc.x, rc.y);
  await sleep(120);
  await savePageShot(page, `${EV}/bj430-before-hold.png`);
  await page.mouse.down();   // 二击起合成（压拍 1 件）+ 上膛
  await sleep(450);
  const mid1 = await page.evaluate(() => {
    const ui = window.__swUI, P = window.__swBJ430;
    const ch = ui.craftHold;
    if (!ch) return { ch: null, n: P.n };
    const r = ch.el.getBoundingClientRect();
    let liveEl = null;
    if (ui.vinvModernCraftOpen) {
      liveEl = ui.vinvModernCellEls[ui.vinvModernEntries.findIndex((e) => e.r.create === 93)]?.el ?? null;
    } else if (ui._builtLayout === 'classic') {
      liveEl = ui.craftListEl?.children[ui.craftAvailRef.findIndex((e) => e.r.create === 93)] ?? null;
    } else {
      liveEl = ui.vinvCraftCellEls[ui.vinvCraftAvailV.findIndex((e) => e.r.create === 93)]?.el ?? null;
    }
    return {
      ch: { kind: ch.kind, connected: ch.el.isConnected, hover: ch.el.matches(':hover'),
            isLiveCell: liveEl === ch.el,
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } },
      liveCellHover: liveEl ? liveEl.matches(':hover') : null,
      mouseX: ui.mouseX, mouseY: ui.mouseY,
      stackSplit: ui.stackSplit, superFastStack: ui.superFastStack,
      n: P.n,
    };
  });
  const woodCount = async () => page.evaluate((wid) => {
    const g = window.__swGame;
    let n = 0;
    for (const s of g.player.inv.slots) if (s && s.id === wid) n += s.stack;
    return n;
  }, (await page.evaluate(() => window.__swBJ430.woodId)));
  const wood = await woodCount();
  L.say(`[B-t0.45s] wood=${wood} ${JSON.stringify(mid1)}`);

  await sleep(1050);
  const mid2 = await page.evaluate((wid) => {
    const ui = window.__swUI, P = window.__swBJ430;
    const ch = ui.craftHold;
    let n = 0;
    for (const s of window.__swGame.player.inv.slots) if (s && s.id === wid) n += s.stack;
    return {
      hold: ch ? { connected: ch.el.isConnected, hover: ch.el.matches(':hover') } : null,
      stackSplit: ui.stackSplit, superFastStack: ui.superFastStack,
      wood: n, n: P.n,
    };
  }, (await page.evaluate(() => window.__swBJ430.woodId)));
  L.say(`[B-t1.5s] ${JSON.stringify(mid2)}`);

  await sleep(1150);
  await page.mouse.up();
  await sleep(300);
  await savePageShot(page, `${EV}/bj430-after-hold.png`);
  const final = await page.evaluate((wid) => {
    const ui = window.__swUI, P = window.__swBJ430;
    let n = 0;
    for (const s of window.__swGame.player.inv.slots) if (s && s.id === wid) n += s.stack;
    return { wood: n, n: P.n, craftHold: ui.craftHold ? 'alive' : null };
  }, (await page.evaluate(() => window.__swBJ430.woodId)));
  L.say(`[C-final] ${JSON.stringify(final)}`);

  // 定谳判据（落刀前后各跑一遍取证）：旧码预期=压拍 1 件后死臂
  L.chk('press-crafted-once', final.n.vanillaCraft >= 1, `crafts=${final.n.vanillaCraft}`);
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
