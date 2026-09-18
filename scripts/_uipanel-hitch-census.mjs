// 开背包/宝箱/制作菜单 hitch 画像普查探针(只读+归因包裹,零 src 触碰;BJ77 census 同框架)。
// 场景:①空地开背包 ②开 1 箱 ③10 满料箱开背包+制作菜单(modern 窗)——帧时长/hitch 触发拍/手动分段归因。
// ★纪律:GPU 页禁 trace(channels.trace=false);profile 通道照 BJ77 census 先例;窗内禁 pump。
// 运行:node tools/probe.mjs run scripts/_uipanel-hitch-census.mjs --seed=05162020 --size=small --vite=5232
import { writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, stage, sleep, ledger, front,
  armPerfInstrumentation, installFrameProbe, createPerfRecorder } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  await armPerfInstrumentation(page, {});
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await installFrameProbe(page);

  // ---- 平整布景(清带+石地板,照明;玩家居中) ----
  const staged = await stage(page, { w: 90, h: 26, platform: { key: 'stone' }, light: 'torch', player: true, camera: true });
  L.chk('stage', staged.ok, staged.why ?? '');

  // ---- 归因包裹(手动分段计时采样器;原型级包裹=跨重建存活;try/finally 保语义) ----
  const inst = await page.evaluate(function swUiPerfInstall() {
    const g = window.__swGame;
    const ui = window.__swUI;
    if (!g || !ui) return { ok: false, why: 'no-game-or-ui' };
    const P = window.__swUiPerf = { m: {}, env: {}, actions: [] };
    P.reset = () => { for (const k of Object.keys(P.m)) { P.m[k].n = 0; P.m[k].ms = 0; P.m[k].max = 0; } };
    P.mark = (label) => { P.actions.push({ label, t: performance.now() }); };
    const GP = Object.getPrototypeOf(g);
    const UP = Object.getPrototypeOf(ui);
    const wrap = (obj, name, tag) => {
      const orig = obj?.[name];
      if (typeof orig !== 'function') return `miss:${name}`;
      obj[name] = function (...a) {
        const t0 = performance.now();
        try { return orig.apply(this, a); }
        finally {
          const dt = performance.now() - t0;
          const e = (P.m[tag] ??= { n: 0, ms: 0, max: 0 });
          e.n++; e.ms += dt; if (dt > e.max) e.max = dt;
        }
      };
      return `ok:${name}`;
    };
    const res = [];
    // Game 侧:配方扫描族
    res.push(wrap(GP, 'vanillaAvailableRecipes', 'G.vanillaAvailableRecipes'));
    res.push(wrap(GP, 'vanillaCraftOwned', 'G.vanillaCraftOwned'));
    res.push(wrap(GP, 'vanillaNearbyStations', 'G.vanillaNearbyStations'));
    res.push(wrap(GP, '_craftSourcesCache', 'G._craftSourcesCache'));
    res.push(wrap(GP, 'craftSources', 'G.craftSources'));
    // UI 侧:面板构建/刷新族
    res.push(wrap(UP, 'refreshAllNow', 'UI.refreshAllNow'));
    res.push(wrap(UP, 'refreshCrafting', 'UI.refreshCrafting(classicBuilder)'));
    res.push(wrap(UP, 'refreshVanillaCrafting', 'UI.refreshVanillaCrafting(classicList)'));
    res.push(wrap(UP, 'paintVanillaInvSlots', 'UI.paintVanillaInvSlots'));
    res.push(wrap(UP, 'layoutVanilla', 'UI.layoutVanilla'));
    res.push(wrap(UP, 'vinvRefreshCraft', 'UI.vinvRefreshCraft'));
    res.push(wrap(UP, 'vinvRebuildCraftCells', 'UI.vinvRebuildCraftCells'));
    res.push(wrap(UP, 'vinvUpdateCraftList', 'UI.vinvUpdateCraftList'));
    res.push(wrap(UP, 'vinvUpdateCraftMaterials', 'UI.vinvUpdateCraftMaterials'));
    res.push(wrap(UP, 'vinvUpdateCraftGrid', 'UI.vinvUpdateCraftGrid'));
    res.push(wrap(UP, 'vinvUpdateModernCraft', 'UI.vinvUpdateModernCraft'));
    res.push(wrap(UP, 'vinvRebuildModernCells', 'UI.vinvRebuildModernCells'));
    res.push(wrap(UP, 'vinvUpdateModernDetail', 'UI.vinvUpdateModernDetail'));
    res.push(wrap(UP, 'vinvModernOwnedOf', 'UI.vinvModernOwnedOf'));
    res.push(wrap(UP, 'refreshBuffs', 'UI.refreshBuffs'));
    res.push(wrap(UP, 'vinvUpdateChestName', 'UI.vinvUpdateChestName'));
    res.push(wrap(UP, 'vinvRefreshHousing', 'UI.vinvRefreshHousing'));
    res.push(wrap(UP, 'paintVanillaDefense', 'UI.paintVanillaDefense'));
    res.push(wrap(UP, 'openInventory', 'UI.openInventory'));
    res.push(wrap(UP, 'openChestPanel', 'UI.openChestPanel'));
    res.push(wrap(UP, 'closeInventory', 'UI.closeInventory'));
    P.env.layout = ui._builtLayout;
    P.env.chests = g.world.chests.length;
    return { ok: true, res: res.filter((r) => String(r).startsWith('miss')), env: P.env };
  });
  L.chk('attr-wrap', inst.ok, JSON.stringify(inst.res ?? inst));

  // ---- 帧窗切片工具(action 时间戳→hitch 帧) ----
  const snapFrames = () => page.evaluate(() => {
    const P = window.__swPerf;
    return { n: P.frames.length, last: P.frameAt.length ? P.frameAt[P.frameAt.length - 1] : 0 };
  });
  const hitchReport = async (mark0) => page.evaluate((mark0) => {
    const P = window.__swPerf;
    const i0 = P.frameAt.findIndex((t) => t >= mark0);
    const dts = i0 >= 0 ? P.frames.slice(i0) : [];
    const sorted = [...dts].sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    let max = 0, maxAt = -1;
    dts.forEach((d, i) => { if (d > max) { max = d; maxAt = i; } });
    const over = (th) => dts.filter((d) => d > th).length;
    // 触发拍:action 后前 12 帧逐帧 dt(开瞬间画像)
    return {
      frames: dts.length, median: +med.toFixed(1), max: +max.toFixed(1), maxFrame: maxAt,
      over33: over(33), over50: over(50), over100: over(100),
      first12: dts.slice(0, 12).map((d) => +d.toFixed(1)),
      top8: [...dts].sort((a, b) => b - a).slice(0, 8).map((d) => +d.toFixed(1)),
    };
  }, mark0);

  const attrReport = () => page.evaluate(() => {
    const P = window.__swUiPerf;
    return Object.entries(P.m)
      .filter(([, v]) => v.n > 0)
      .map(([k, v]) => ({ tag: k, n: v.n, total: +v.ms.toFixed(1), max: +v.max.toFixed(1), avg: +(v.ms / v.n).toFixed(2) }))
      .sort((a, b) => b.total - a.total);
  });

  const rec = createPerfRecorder(page, {
    outDir: process.env.SW_PROBE_OUT || '/tmp/probe-out/uipanel', scenario: 'hitch-census',
    channels: { profile: true, trace: false, metrics: true },
  });

  // ---- 纯扫描微基准(配方扫描/箱内容聚合——隔离 DOM 面) ----
  const micro = async (label) => {
    const r = await page.evaluate(async (label) => {
      const g = window.__swGame;
      const nChest = g.world.chests.length;
      // 同 tick 内 _craftSourcesCache 命中缓存 → vanillaAvailableRecipes 循环只付配方扫描+聚合
      const t0 = performance.now();
      let last = 0;
      for (let i = 0; i < 30; i++) last = g.vanillaAvailableRecipes().length;
      const tScan = (performance.now() - t0) / 30;
      const t1 = performance.now();
      for (let i = 0; i < 100; i++) g.vanillaCraftOwned();
      const tOwned = (performance.now() - t1) / 100;
      const t2 = performance.now();
      g._craftSourcesCache && (g._craftSourcesCache.tick = -1);   // 强制重扫 craftSources(全箱迭代)
      for (let i = 0; i < 20; i++) { g._craftSourcesCache.tick = -1; g.vanillaCraftOwned(); }
      const tSrc = (performance.now() - t2) / 20;
      return { label, nChest, msAvail: +tScan.toFixed(2), msOwned: +tOwned.toFixed(2), msSrcPlusOwned: +tSrc.toFixed(2), avail: last };
    }, label);
    L.say(`[micro ${label}] chests=${r.nChest} vanillaAvailableRecipes=${r.msAvail}ms vanillaCraftOwned=${r.msOwned}ms craftSources+owned=${r.msSrcPlusOwned}ms availLen=${r.avail}`);
    return r;
  };

  // ---- 开/关动作驱动器 ----
  const openInv = async () => { await page.evaluate(() => { window.__swUiPerf.mark('openInventory'); window.__swUI.openInventory(); }); };
  const closeInv = async () => { await page.evaluate(() => { window.__swUiPerf.mark('closeInventory'); window.__swUI.closeInventory(); }); };
  const toggleModern = async () => { await page.evaluate(() => { window.__swUiPerf.mark('toggleModern'); window.__swUI.vinvToggleModernCraft(false); }); };

  const seg = async (name, ms, action, post, actionIdx = 0) => {
    await front(page);
    await page.evaluate(() => { window.__swUiPerf.reset(); });
    await rec.startSegment(name, {});
    await action();
    await sleep(ms);
    const s = await rec.endSegment();
    const mark0 = await page.evaluate((i) => {
      const acts = window.__swUiPerf.actions;
      return acts.length ? acts[Math.min(i, acts.length - 1)].t : 0;
    }, actionIdx);
    const h = await hitchReport(mark0);
    const a = await attrReport();
    const m = s?.metrics?.delta ?? {};
    const lt = s?.longtasks ?? {};
    L.say(`[${name}] fps.mean=${s?.fps?.mean} p95=${s?.fps?.p95}ms max=${s?.fps?.max}ms | longtask n=${lt.count} max=${lt.maxMs}ms | style/layout Δ recalc=${m.RecalcStyleCount} layout=${m.LayoutCount} nodes=${m.Nodes} | hitch@action: median=${h.median}ms max=${h.max}ms@frame+${h.maxFrame} over50=${h.over50} over100=${h.over100} first12=[${h.first12.join(',')}] top8=[${h.top8.join(',')}]`);
    for (const r0 of a.slice(0, 12)) L.say(`  attr ${r0.tag}: n=${r0.n} total=${r0.total}ms max=${r0.max}ms avg=${r0.avg}ms`);
    for (const t of (s?.profile?.funcs ?? []).slice(0, 10)) L.say(`  hot ${t.selfPct}% ${t.fn} ${t.url}:${t.line}`);
    if (post) await post();
    await sleep(600);
    return { name, fps: s?.fps, hitch: h, attr: a };
  };

  const results = {};

  // ① 空地:基线(关包静立) + 开背包
  await micro('empty');
  results.seg0 = await seg('seg0-baseline-closed', 2500, async () => {});
  results.seg1 = await seg('seg1-open-empty', 2500, openInv, closeInv);

  // ② 1 箱(30 种材料×999)在玩家 4 格旁 → 开箱
  await page.evaluate(() => {
    const g = window.__swGame, st = g.world.store;
    const tid = window.__swTiles['chest'];
    const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
    let gy = pty; while (gy < st.h - 2 && !st.isSolid(ptx, gy)) gy++;
    const cx = ptx + 4, cy = gy - 2;   // 2x2 箱:锚左上 (cx, gy-2),底行 gy-1 蹲地板
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) st.setTile(cx + dx, cy + dy, tid, dx ? 18 : 0, dy ? 18 : 0);
    window.__swChest1 = { x: cx, y: cy, items: Array(40).fill(null) };
    g.world.chests.push(window.__swChest1);
    return { cx, cy, gy };
  });
  const fill1 = await page.evaluate(async () => {
    const { VANILLA_RECIPES } = await import('/src/data/vanillaRecipes.ts');
    const mats = [...new Set(VANILLA_RECIPES.flatMap((r) => r.items.map((q) => q.id)).filter((v) => v < 1000000))];
    const chest = window.__swChest1;
    let filled = 0;
    for (let i = 0; i < chest.items.length && i < mats.length; i++) {
      const iid = window.__swFlow.itemByVid(mats[i]);
      if (iid == null || iid < 0) continue;
      chest.items[i] = { id: iid, stack: 999 };
      filled++;
    }
    return { filled, mats: mats.length };
  });
  L.say(`chest1 filled ${fill1.filled}/${fill1.mats} slots`);
  await micro('1chest');
  results.seg2 = await seg('seg2-open-chest1', 2500, async () => {
    await page.evaluate(() => { window.__swUiPerf.mark('openChestPanel'); window.__swUI.openChestPanel(window.__swChest1); });
  }, closeInv);

  // ③ 10 箱环绕(全部材料聚合最坏面) → 开背包 → 开制作菜单(modern) → 关/开制作菜单
  const ring = await page.evaluate(async () => {
    const g = window.__swGame, st = g.world.store;
    const tid = window.__swTiles['chest'];
    const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
    let gy = pty; while (gy < st.h - 2 && !st.isSolid(ptx, gy)) gy++;
    const { VANILLA_RECIPES } = await import('/src/data/vanillaRecipes.ts');
    const mats = [...new Set(VANILLA_RECIPES.flatMap((r) => r.items.map((q) => q.id)).filter((v) => v < 1000000))];
    const placed = [];
    const spots = [-20, -16, -12, -8, -4, 4, 8, 12, 16, 20];   // ±20 格 ≈ ±320px ≪ 600px
    for (let k = 0; k < spots.length; k++) {
      const cx = ptx + (spots[k] < 0 ? spots[k] - 1 : spots[k]), cy = gy - 2;
      if (cx < 1 || cy < 1) continue;
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
        if (!st.isSolid(cx + dx, gy)) st.setTile(cx + dx, gy, window.__swTiles['stone'], 0, 0);   // 支撑地板
        st.setTile(cx + dx, cy + dy, tid, dx ? 18 : 0, dy ? 18 : 0);
      }
      const chest = { x: cx, y: cy, items: Array(40).fill(null) };
      let filled = 0;
      const base = k * 40;
      for (let i = 0; i < 40 && base + i < mats.length; i++) {
        const iid = window.__swFlow.itemByVid(mats[base + i]);
        if (iid == null || iid < 0) continue;
        chest.items[i] = { id: iid, stack: 999 };
        filled++;
      }
      g.world.chests.push(chest);
      placed.push({ x: cx, y: cy, filled });
    }
    return { placed, totalChests: g.world.chests.length };
  });
  L.say(`ring placed ${ring.placed.length} chests, total=${ring.totalChests} filled=${JSON.stringify(ring.placed.map((c) => c.filled))}`);
  const srcCheck = await page.evaluate(async () => {
    const g = window.__swGame;
    const { craftSourcesFor } = await import('/src/data/vanillaRecipes.ts');
    const p = g.player;
    return { sources: craftSourcesFor(g.world.chests, p.x, p.y, {}).length, chests: g.world.chests.length };
  });
  L.say(`craft sources in range=${srcCheck.sources} (world chests=${srcCheck.chests})`);
  // 站台三件套(workbench/furnace/anvil)贴玩家——满站台面 avail 极大化(用户场景=基地仓库)
  const stations = await page.evaluate(() => {
    const g = window.__swGame, st = g.world.store;
    const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
    let gy = pty; while (gy < st.h - 2 && !st.isSolid(ptx, gy)) gy++;
    const out = [];
    const put = (key, dx, dy) => {
      const tid = window.__swTiles[key];
      if (tid == null) { out.push(`${key}:miss`); return; }
      st.setTile(ptx + dx, gy + dy, tid, 0, 0);
      out.push(`${key}:ok@${ptx + dx},${gy + dy}`);
    };
    put('workbench', 1, -1);
    put('furnace', 24, -1);
    put('anvil', -26, -1);
    return out;
  });
  L.say(`stations: ${stations.join(' ')}`);
  await micro('10chests');
  results.seg3 = await seg('seg3-open-10chests', 2500, openInv);
  results.seg4 = await seg('seg4-craftmenu-open', 3000, toggleModern);
  // 制作菜单关→开(条目池已热的重开面)
  results.seg5 = await seg('seg5-craftmenu-reopen', 2500, async () => {
    await page.evaluate(() => { window.__swUiPerf.mark('toggleModernClose'); window.__swUI.vinvToggleModernCraft(false); });
    await sleep(700);
    await page.evaluate(() => { window.__swUiPerf.mark('toggleModernOpen'); window.__swUI.vinvToggleModernCraft(false); });
  }, null, 2);
  await closeInv();

  // ---- 逐像素零差基线:采集开包态 UI 指纹(修前后对比用;池形状无关——按索引算位) ----
  // ★站台复验:世界模拟偶发削掉贴身站台(tile 级联/嵌入清理),avail 池掉档(767→212)
  //  会污染跨 run 指纹可比面——指纹前重放站台+复验 availN。
  const stationReassert = await page.evaluate(() => {
    const g = window.__swGame, st = g.world.store, ui = window.__swUI;
    const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
    let gy = pty; while (gy < st.h - 2 && !st.isSolid(ptx, gy)) gy++;
    const put = (key, dx, dy) => {
      const tid = window.__swTiles[key];
      if (tid == null) return `${key}:miss`;
      if (st.get(ptx + dx, gy + dy) !== tid) st.setTile(ptx + dx, gy + dy, tid, 0, 0);
      return `${key}:${st.get(ptx + dx, gy + dy) === tid ? 'ok' : 'fail'}@${ptx + dx},${gy + dy}`;
    };
    const r0 = [put('workbench', 1, -1), put('furnace', 24, -1), put('anvil', -26, -1)];   // 炉/砧原位(±5 reach 域外,池面=手+工作台 767,与 base 可比)
    ui.refreshAll();
    const availN = g.vanillaAvailableRecipes().length;
    return { r0, availN };
  });
  L.say(`station-reassert: ${stationReassert.r0.join(' ')} availN=${stationReassert.availN}`);
  await sleep(400);
  const fp = await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    const avail = g.vanillaAvailableRecipes().map((e) => `${e.r.create}:${e.count}`);
    const slots = [];
    for (const [k, el] of ui.vinvSlots) {
      slots.push(`${k}|${el.style.getPropertyValue('--slot-bgimg')}|${el.style.opacity}|${el.style.display}`);
    }
    slots.sort();
    // 列表格:只指纹【窗内格】(pos=null=窗外不绘,两修同不绘=零差;窗外物化差不算像素面)
    const cells = [];
    let mat = 0, inWin = 0;
    for (let i = 0; i < ui.vinvCraftAvailV.length; i++) {
      const pos = ui.vinvCraftCellPos(i);
      if (!pos) continue;
      inWin++;
      const h = ui.vinvCraftCellEls[i];
      if (h) {
        mat++;
        cells.push(`${i}:${pos.x},${pos.y}|el:${h.el.style.left},${h.el.style.top},${h.el.style.opacity},${h.el.style.display},${h.el.style.transform},${h.el.style.getPropertyValue('--slot-bgimg')}`);
      } else {
        cells.push(`${i}:${pos.x},${pos.y}|no-el`);
      }
    }
    // modern 窗条目池指纹(条目序+格样式窗内面)
    const mcells = [];
    if (ui.vinvModernEntries) {
      for (let i = 0; i < ui.vinvModernEntries.length; i++) {
        const e = ui.vinvModernEntries[i];
        mcells.push(`${e.r.create}:${e.count}`);
      }
    }
    const open = ui.invPanel.style.display;
    const focus = ui.vinvCraftFocusV;
    const glide = ui.vinvCraftGlideY;
    return {
      open, focus, glide, availHash: avail.join('|'), availN: avail.length,
      slotsHash: slots.join('|'), cellsHash: cells.join('|'), cellsWin: inWin, cellsMat: mat,
      modernHash: mcells.join('|'), modernN: mcells.length,
      modernOpen: ui.vinvModernCraftOpen, modernSel: ui.vinvModernSelected ? ui.vinvModernSelected.create : null,
    };
  });
  L.say(`UI-fingerprint(open=${fp.open} focus=${fp.focus} availN=${fp.availN} cellsWin=${fp.cellsWin} cellsMat=${fp.cellsMat} modernN=${fp.modernN} modernOpen=${fp.modernOpen})`);
  writeFileSync(`${rec.dir}/ui-fingerprint.json`, JSON.stringify(fp, null, 2));
  // 开包+制作菜单态整页截图(修前后像素 diff 用)
  const { savePageShot } = await import('../tools/probe/lib/shot.mjs');
  await page.evaluate(() => { window.__swUI.openInventory(); });
  await sleep(400);
  await savePageShot(page, `${rec.dir}/ui-open-state.png`);
  L.say(`page shot saved ${rec.dir}/ui-open-state.png`);
  // ---- 制作菜单开态指纹(modern 窗格池/条目/选中/滚动面) ----
  await page.evaluate(() => { window.__swUI.vinvToggleModernCraft(false); });
  await sleep(400);
  const fp2 = await page.evaluate(async () => {
    const ui = window.__swUI;
    const { mcraftGridGeometry, mcraftCellXY } = await import('/src/ui/modernCrafting.ts');
    const c = ui.vinvLayoutCtx;
    const g = mcraftGridGeometry(c.sh, Math.max(1, ui.vinvModernEntries.length), ui.vinvGuideMenuOpen);
    const cells = [];
    let mat = 0, inWin = 0;
    const viewTop = ui.vinvModernViewPos - 44, viewBot = ui.vinvModernViewPos + g.list.h + 44;
    for (let i = 0; i < ui.vinvModernEntries.length; i++) {
      const pos = mcraftCellXY(g, i);
      const offTop = pos.y - g.list.y;
      const visible = offTop + 44 > viewTop && offTop < viewBot;
      if (!visible) continue;
      inWin++;
      const h = ui.vinvModernCellEls[i];
      if (h) {
        mat++;
        cells.push(`${i}:${pos.x - g.list.x},${pos.y - g.list.y}|el:${h.el.style.left},${h.el.style.top},${h.el.style.display},${h.el.style.transform},${h.el.style.getPropertyValue('--slot-bgimg')},${h.el.style.getPropertyValue('--slot-tint')},${(h.el.querySelector('img')?.getAttribute('src') ?? '').slice(-28)},${h.el.dataset.unavail ?? ''},${h.el.children.length}`);
      } else {
        cells.push(`${i}:${pos.x - g.list.x},${pos.y - g.list.y}|no-el`);
      }
    }
    return {
      modernOpen: ui.vinvModernCraftOpen, modernN: ui.vinvModernEntries.length,
      modernSel: ui.vinvModernSelected ? ui.vinvModernSelected.create : null,
      focus: ui.vinvCraftFocusV, viewPos: ui.vinvModernViewPos,
      cellsWin: inWin, cellsMat: mat, cellsHash: cells.join('|'),
      entriesHash: ui.vinvModernEntries.map((e) => `${e.r.create}:${e.count}`).join('|'),
    };
  });
  L.say(`modern-fingerprint(open=${fp2.modernOpen} n=${fp2.modernN} sel=${fp2.modernSel} focus=${fp2.focus} cellsWin=${fp2.cellsWin} cellsMat=${fp2.cellsMat})`);
  writeFileSync(`${rec.dir}/modern-fingerprint.json`, JSON.stringify(fp2, null, 2));
  await savePageShot(page, `${rec.dir}/ui-craftmenu-state.png`);
  L.say(`page shot saved ${rec.dir}/ui-craftmenu-state.png`);
  await page.evaluate(() => { window.__swUI.closeInventory(); });

  L.say('probe-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}
