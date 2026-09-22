// ★BJ269 配方列表逐帧刷新探针（用户实报「ESC 开着时配方列表不随工作台距离实时
// 刷新」双向失效 → 修复面证据）。只读+计数包裹,零 src 触碰。
//
// 场景：石台布景+工作台(dx+2)+背包 6 木 → 开 ESC（原版布局经典列表）：
//   A 进站:列表含木平台(create 93,1 木 @ 工作台)；
//   B 直传 40 格外（无任何 UI 事件）→ ≤1s 内列表摘除 93（修复前滞留）,
//     vinvRefreshCraft 计数自增（探针经 onInventoryChanged→refreshAll 驱动）；
//   C 传回 → 93 复现,计数再增（双向）；
//   D 阴性对照:站邻域内挪 2 格 → 签名不变 → 计数不增（防伪刷新）。
// 运行:node tools/probe.mjs run scripts/_bj269-craft-refresh-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, stage, sleep, ledger, front } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');

  // 布景:石地板+火把+工作台(玩家右手 2 格),玩家居中
  const st = await stage(page, {
    w: 90, h: 26, platform: { key: 'stone' }, light: 'torch',
    tiles: [{ dx: 2, dy: -1, key: 'workbench' }],
    player: true, camera: true,
  });
  L.chk('stage', st.ok, st.why ?? '');

  // 材料 + 计数包裹
  const inst = await page.evaluate(() => {
    const g = window.__swGame, ui = window.__swUI;
    const iid = window.__swFlow?.itemByVid?.(9);   // 木 vid=9
    if (iid == null || iid < 0) return { ok: false, why: 'no-wood-item' };
    g.player.inv.slots[10] = { id: iid, stack: 6 };
    const P = window.__swBJ269 = { n: { vinvRefreshCraft: 0, refreshAllNow: 0, vanillaNearbyStations: 0, probe: 0 } };
    const GP = Object.getPrototypeOf(g), UP = Object.getPrototypeOf(ui);
    const wrap = (o, name, tag) => {
      const orig = o[name];
      if (typeof orig !== 'function') return `miss:${name}`;
      o[name] = function (...a) { P.n[tag]++; return orig.apply(this, a); };
      return 'ok';
    };
    wrap(UP, 'vinvRefreshCraft', 'vinvRefreshCraft');
    wrap(UP, 'refreshAllNow', 'refreshAllNow');
    wrap(GP, 'vanillaNearbyStations', 'vanillaNearbyStations');
    // 探针本体直读：frame() 每帧调用面在 Game 实例上(private → 原型链可达)
    if (typeof g.probeCraftListRefresh !== 'function') return { ok: false, why: 'no-probe-method' };
    return { ok: true };
  });
  L.chk('install', inst.ok, inst.why ?? '');

  const sample = (tag) => page.evaluate((tag) => {
    const g = window.__swGame, ui = window.__swUI, P = window.__swBJ269;
    const creates = ui.vinvCraftAvailV.map((e) => e.r.create);
    const inv = g.player.inv.slots
      .map((s, i) => (s ? `${i}:${s.id}x${s.stack}` : null))
      .filter(Boolean);
    return {
      tag,
      open: window.__swUI.inventoryOpen,
      rows: ui.vinvCraftAvailV.length,
      creates: creates.join(','),
      hasPlatform: creates.includes(93),
      hasChair: creates.includes(25),
      inv: inv.join(' '),
      n: { ...P.n },
      px: Math.floor(g.player.cx / 16),
    };
  }, tag);

  await front(page);
  await sleep(300);

  // A:开包(站旁)——开包路径事件刷新,列表应含木平台
  await page.evaluate(() => window.__swUI.openInventory());
  await sleep(700);
  const A = await sample('A:open-near-station');
  L.say(`[A] rows=${A.rows} creates=[${A.creates}] inv=[${A.inv}] px=${A.px} n=${JSON.stringify(A.n)}`);
  L.chk('A-near-has-recipe', A.hasPlatform && A.hasChair, `rows=${A.rows} platform=${A.hasPlatform} chair=${A.hasChair}`);

  // 帧频快照:站旁 600ms 探针扫描次数(≈60Hz 钳)
  await page.evaluate(() => { window.__swBJ269.n.vanillaNearbyStations = 0; });
  await sleep(600);
  const cadence = await page.evaluate(() => window.__swBJ269.n.vanillaNearbyStations);
  L.say(`[cadence] vanillaNearbyStations in 600ms = ${cadence} (期望≈36=60Hz 钳)`);

  // B:直传 40 格外(零 UI 事件)——探针应驱动刷新摘除配方
  await page.evaluate(() => { window.__swGame.player.x += 40 * 16; window.__swGame.player.vx = 0; window.__swGame.player.vy = 0; });
  await sleep(800);
  const B = await sample('B:teleport-far');
  L.say(`[B] rows=${B.rows} creates=[${B.creates}] inv=[${B.inv}] px=${B.px} n=${JSON.stringify(B.n)}`);
  L.chk('B-far-refresh-fired', B.n.vinvRefreshCraft > A.n.vinvRefreshCraft, '探针未驱动 vinvRefreshCraft');
  L.chk('B-far-recipe-removed', !B.hasPlatform && !B.hasChair, `rows=${B.rows} platform=${B.hasPlatform}`);

  // C:传回站旁——配方复现(双向)
  await page.evaluate(() => { window.__swGame.player.x -= 40 * 16; window.__swGame.player.vx = 0; window.__swGame.player.vy = 0; });
  await sleep(800);
  const C = await sample('C:teleport-back');
  L.say(`[C] rows=${C.rows} creates=[${C.creates}] inv=[${C.inv}] px=${C.px} n=${JSON.stringify(C.n)}`);
  L.chk('C-back-refresh-fired', C.n.vinvRefreshCraft > B.n.vinvRefreshCraft, '探针未驱动回程刷新');
  L.chk('C-back-has-recipe', C.hasPlatform && C.hasChair, `rows=${C.rows} platform=${C.hasPlatform}`);

  // D:阴性对照——站邻域内挪 2 格,签名不变 → 不发伪刷新
  await page.evaluate(() => { window.__swGame.player.x += 2 * 16; window.__swGame.player.vx = 0; });
  await sleep(600);
  const D = await sample('D:move-within-reach');
  L.say(`[D] rows=${D.rows} platform=${D.hasPlatform} px=${D.px} n=${JSON.stringify(D.n)}`);
  L.chk('D-within-no-spurious', D.n.vinvRefreshCraft === C.n.vinvRefreshCraft && D.hasPlatform, '邻域内挪动发了伪刷新(签名失真)');

  L.say('probe-done');
  process.exit(L.exitCode());
} finally {
  await browser.close().catch(() => {});
}
