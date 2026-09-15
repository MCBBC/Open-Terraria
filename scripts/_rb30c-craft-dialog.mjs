// RB30c 红队探针:制作/对话域未审修复面四路(FX36b 站点替身闭包 / FX37+FX38b 群系炬·营火·.plr /
//   FX41b+RB29 modern 窗可见性矩阵 / FX27 对话字号+收包·minimize 链)
// 跑法:SW_ORIGIN=http://localhost:5247 node tools/run-diag.mjs scripts/_rb30c-craft-dialog.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5247';
const fails = [];
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.stack || e.message).slice(0, 260)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 180)); });
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(700);
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); window.__swUI.closeInventory(); });
await sleep(250);

// ============ A. FX36b 站点替身闭包(反向假阳性/传递链/多站并存/映射覆盖) ============
{
  const r = await page.evaluate(async () => {
    const g = window.__swGame, p = g.player, st = g.world.store, ui = window.__swUI;
    const vr = await import('/src/data/vanillaRecipes.ts');
    const cg = await import('/src/ui/craftingGrid.ts');
    const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const idOfVid = (vid) => ITEM_DEFS.findIndex((d) => d.key.startsWith('vi_' + vid + '_'));
    const setOf = (s) => [...s].sort((a, b) => a - b);

    // --- A1/A2/A3 数据面 ---
    const sat17 = setOf(vr.stationSatisfierTiles(17));
    const sat16 = setOf(vr.stationSatisfierTiles(16));
    const sat13 = setOf(vr.stationSatisfierTiles(13));
    const sat215 = setOf(vr.stationSatisfierTiles(215));
    const sat86 = setOf(vr.stationSatisfierTiles(86));
    const acc77 = setOf(cg.stationAcceptTypes(77));
    const acc17 = setOf(cg.stationAcceptTypes(17));
    const acc133 = setOf(cg.stationAcceptTypes(133));
    // 映射覆盖:全配方 requiredTile 的替身集是否都存在内部 tile(def.vanilla.sheet 命中)
    const reqTiles = new Set(vr.VANILLA_RECIPES.map((x) => x.tile).filter((t) => t >= 0));
    const missing = []; const dupSheets = new Map();
    for (const d of TILE_DEFS) { const sh = d?.vanilla?.sheet; if (typeof sh === 'number') dupSheets.set(sh, (dupSheets.get(sh) ?? 0) + 1); }
    const dupList = [...dupSheets.entries()].filter(([, n]) => n > 1).map(([s]) => s);
    for (const R of reqTiles) {
      for (const t of vr.stationSatisfierTiles(R)) {
        const n = dupSheets.get(t) ?? 0;
        if (n === 0) missing.push({ R, t });
      }
    }
    const chainDepth = vr.expandStationTiles(133).length;   // 133→77→17→215 = 4

    // --- A4/A5 世界面 ---
    const raf = (n) => new Promise((res) => { const s = () => { if (--n <= 0) res(); else requestAnimationFrame(s); }; requestAnimationFrame(s); });
    const wait = (ms) => new Promise((x) => setTimeout(x, ms));
    let grantSlot = 10;
    const grant = (vid, n) => { const i = idOfVid(vid); if (i >= 0) p.inv.slots[grantSlot++ % 18] = { id: i, stack: n }; };
    const grantAll = (pairs) => { for (const [v, n] of pairs) grant(v, n); };
    const tileBySheet = (sh) => { const i = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sh); return i >= 0 ? i : undefined; };
    const clearMats = () => { for (let i = 10; i < 18; i++) p.inv.slots[i] = null; };
    const hasVid = (list, vid) => list.some((v) => v === vid);   // near() 已映射为 create id
    const clearBox = (x0, x1, y0, y1) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setTile(x, y, 0); };
    const floorAt = (x0, x1, y) => { for (let x = x0; x <= x1; x++) st.setTile(x, y, TILE_BY_KEY['stone']); };
    const put3x2 = (tileId, x, y) => { for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) st.setTile(x + dx, y + dy, tileId); };
    const put1x1 = (tile, x, y) => st.setTile(x, y, tile);
    const px = Math.floor(p.x / 16), py = Math.floor((p.y + p.h) / 16);
    const reset = () => { clearBox(px - 8, px + 8, py - 6, py + 2); floorAt(px - 8, px + 8, py + 2); clearMats(); };
    const near = () => { g.vanillaNearbyStations(); return [...g.vanillaAvailableRecipes()].map((e) => e.r.create); };
    const out = { sat17, sat16, sat13, sat215, sat86, acc77, acc17, acc133, missing, dupList: dupList.slice(0, 8), chainDepth, world: {} };

    // 地狱熔炉 → 熔炉系(381 钴锭/170 玻璃)可做;marshmallow(215)沿 77→17→215 链也可做
    reset();
    put3x2(tileBySheet(77), px - 4, py);
    grantAll([[364, 3], [169, 2], [2290, 1]]);
    await raf(3); await wait(150);
    let list = near();
    out.world.hellforge = { cobalt: hasVid(list, 381), glass: hasVid(list, 170), marshmallow: hasVid(list, 5537) };
    // 只放营火:熔炉系消失, marshmallow(5537)出现(215 配方);营火不解锁熔炉 = 反向假阳性闸
    clearBox(px - 4, px - 2, py, py + 1);
    put3x2(tileBySheet(215), px - 4, py);
    grantAll([[2290, 1]]);
    await raf(3); await wait(150);
    list = near();
    out.world.campfireOnly = { cobalt: hasVid(list, 381), glass: hasVid(list, 170), marshmallow: hasVid(list, 5537) };
    // 熔炉(17):沿 17→215 链解锁 marshmallow(原版怪癖),且 381/170 可做;三站并存
    clearBox(px - 4, px - 2, py, py + 1);
    put3x2(tileBySheet(17), px - 4, py);
    put3x2(tileBySheet(215), px + 1, py);
    put1x1(tileBySheet(14), px - 6, py + 1);
    grantAll([[364, 3], [169, 2], [2290, 1], [9, 10]]);   // 各站材料
    await raf(3); await wait(150);
    list = near();
    out.world.furnacePlus = { cobalt: hasVid(list, 381), glass: hasVid(list, 170), marshmallow: hasVid(list, 5537) };
    // 玻璃窑(302→17):170 可做(替身闭包深度);清熔炉后 381(纯 17 配方)仍应可(302∈sat17)
    clearBox(px - 4, px - 2, py, py + 1); clearBox(px + 1, px + 3, py, py + 1);
    put3x2(tileBySheet(302), px - 4, py);
    grantAll([[364, 3], [169, 2]]);
    await raf(3); await wait(150);
    list = near();
    out.world.glassKilnOnly = { cobalt: hasVid(list, 381), glass: hasVid(list, 170) };
    reset();
    return out;
  });
  ok(r.sat17.join(',') === '17,77,133,302', 'A1 stationSatisfierTiles(17)={17,77,133,302}', r.sat17.join(','));
  ok(r.sat16.join(',') === '16,134', 'A1 satisfier(16)={16,134}', r.sat16.join(','));
  ok(r.sat13.join(',') === '13,355,699', 'A1 satisfier(13)={13,355,699}', r.sat13.join(','));
  ok(r.sat215.join(',') === '17,77,96,133,215,302', 'A1 satisfier(215)={17,77,96,133,215,302}(17→215 链)', r.sat215.join(','));
  ok(r.sat86.join(',') === '86,304', 'A1 satisfier(86)={86,304}', r.sat86.join(','));
  ok(r.acc77.join(',') === '17,77,215', 'A2 stationAcceptTypes(77)={77,17,215} 前向链', r.acc77.join(','));
  ok(r.acc17.join(',') === '17,215', 'A2 stationAcceptTypes(17)={17,215}(不含 133/302)', r.acc17.join(','));
  ok(r.acc133.join(',') === '17,77,133,215', 'A2 stationAcceptTypes(133)={133,77,17,215}', r.acc133.join(','));
  ok(r.chainDepth === 4, 'A2 expandStationTiles(133) 深度=4(133→77→17→215)', String(r.chainDepth));
  ok(r.missing.length === 0, 'A3 替身集→内部 tile 映射零缺(假阴性域)', JSON.stringify(r.missing.slice(0, 6)));
  ok(r.world.hellforge.cobalt && r.world.hellforge.glass,
    'A4 地狱熔炉解锁熔炉系配方(381/170)', JSON.stringify(r.world.hellforge));
  ok(r.world.hellforge.marshmallow === true,
    'A4 地狱熔炉沿 77→17→215 链解锁 marshmallow(替身集 215∋77 深度)', JSON.stringify(r.world.hellforge));
  ok(!r.world.campfireOnly.cobalt && !r.world.campfireOnly.glass && r.world.campfireOnly.marshmallow,
    'A4 营火不解锁熔炉配方(反向假阳性)+marshmallow 可做', JSON.stringify(r.world.campfireOnly));
  ok(r.world.furnacePlus.cobalt && r.world.furnacePlus.marshmallow,
    'A5 熔炉沿 17→215 解锁 marshmallow(原版怪癖)+多站并存', JSON.stringify(r.world.furnacePlus));
  ok(!r.world.campfireOnly.cobalt && r.world.campfireOnly.marshmallow,
    'A4b 营火不解锁熔炉配方(反向假阳性闸)', JSON.stringify(r.world.campfireOnly));
  ok(r.world.glassKilnOnly.cobalt && r.world.glassKilnOnly.glass,
    'A5 玻璃窑(302∈sat17)替身闭包深度正确', JSON.stringify(r.world.glassKilnOnly));
}

// ============ B. FX37/FX38b 群系炬·营火·块换·.plr ============
{
  const r = await page.evaluate(async () => {
    const g = window.__swGame, p = g.player, st = g.world.store, w = g.world;
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const Torch = await import('/src/world/Torch.ts');
    const Plr = await import('/src/save/PlrImport.ts');
    const CII = await import('/src/render/CursorItemIcon.ts');
    const defOfVid = (vid) => ITEM_DEFS.find((d) => d.key.startsWith('vi_' + vid + '_'));
    const px = Math.floor(p.x / 16), py = Math.floor((p.y + p.h) / 16);
    for (let x = px - 8; x <= px + 8; x++) { for (let y = py - 6; y <= py + 2; y++) st.setTile(x, y, 0); st.setTile(x, py + 2, TILE_BY_KEY['stone']); }
    const clearZones = () => { for (const k of ['zoneShimmer', 'zoneDungeon', 'zoneTemple', 'zoneGlowshroom', 'zoneHallow', 'zoneCorrupt', 'zoneCrimson', 'zoneSnow', 'zoneJungle', 'zoneDesert', 'zoneUndergroundDesert']) g.scene[k] = false; g.scene.belowSurface = false; };
    const zone = (name) => { clearZones(); g.scene[name] = true; };
    const heldSet = (vid) => {
      const i = ITEM_DEFS.findIndex((d) => d.key.startsWith('vi_' + vid + '_'));
      p.inv.slots[0] = i >= 0 ? { id: i, stack: 99 } : null;
      p.inv.selected = 0;
      return i >= 0;
    };
    const out = {};
    // B1 usingBiomeTorches 双域(unlockedBiomeTorches ∧ builderAccStatus[11]==0)
    w.flags.unlockedBiomeTorches = true; p.builderAccStatus[11] = 0;
    out.b1_on = g.usingBiomeTorches();
    p.builderAccStatus[11] = 1; out.b1_toggleOff = g.usingBiomeTorches();
    p.builderAccStatus[11] = 0; w.flags.unlockedBiomeTorches = false;
    out.b1_unlockedOff = g.usingBiomeTorches();
    w.flags.unlockedBiomeTorches = true;
    const torch = defOfVid(8), snowTorch = defOfVid(974), waterTorch = defOfVid(523);
    const campfire = defOfVid(966), snowCamp = defOfVid(3048);
    const place = (def, tx, ty) => {
      heldSet(Number(def.key.match(/^vi_(\d+)_/)[1]));
      p.useTime = 0; p.itemTime = 0;
      g.tryPlace(tx, ty, def);
      return st.get(tx, ty) ? { frameX: st.frameX[st.idx(tx, ty)], frameY: st.frameY[st.idx(tx, ty)] } : null;
    };
    // B2 火把放置转换
    zone('zoneSnow');
    out.torch_snow_flagOn = place(torch, px - 2, py + 1);
    w.flags.unlockedBiomeTorches = false;
    out.torch_snow_flagOff = place(torch, px - 1, py + 1);
    w.flags.unlockedBiomeTorches = true;
    out.snowTorch_item = place(snowTorch, px, py + 1);
    zone('zoneShimmer');
    out.torch_shimmer = place(torch, px - 4, py + 1);
    // 水下特支:普通炬拒;转换炬(9 非水炬)拒;水炬(8)许
    zone('zoneSnow');
    st.liquid[st.idx(px + 1, py + 1)] = 220; st.liquidType[st.idx(px + 1, py + 1)] = 1;
    out.torch_water_snow = place(torch, px + 1, py + 1);
    out.waterTorch_inWater = place(waterTorch, px + 1, py + 1);
    st.liquid[st.idx(px + 1, py + 1)] = 0;
    const torchInternal = st.get(px - 2, py + 1);
    // B3 营火放置转换(清掉已放火把+两行残格+残液——B2 试水会被液体模拟扩散过来)
    const dryRow = () => { for (let x = px - 7; x <= px + 3; x++) for (const dy of [-1, 0, 1]) { const ii = st.idx(x, py + dy); if (st.get(x, py + dy)) st.setTile(x, py + dy, 0); st.liquid[ii] = 0; st.liquidType[ii] = 0; } };
    dryRow();
    zone('zoneSnow');
    out.camp_snow_flagOn = place(campfire, px - 2, py + 1);
    w.flags.unlockedBiomeTorches = false;
    out.camp_snow_flagOff = place(campfire, px + 1, py + 1);
    w.flags.unlockedBiomeTorches = true;
    dryRow();
    out.camp_snowItem = place(snowCamp, px - 2, py + 1);
    const campInternal = st.get(px - 2, py + 1);
    // B4 块换双面(verdict 与写面同转换)。★镐门(GetBestPickaxe :40165)是真门——补镐
    // 镐门域:vanilla-itemfunc.json 无 pick 位——直接按 itemFuncOfVid().pick>0 拣第一把
    const { itemFuncOfVid } = await import('/src/data/vanillaItemFunc.ts');
    let pickIdx = -1, pickPower = null, pickKey = null;
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const d = ITEM_DEFS[i];
      const m = /^vi_(\d+)_/.exec(d.key);
      const vid = m ? Number(m[1]) : -1;
      const pk = vid >= 0 ? itemFuncOfVid(vid)?.pick ?? 0 : 0;
      if (pk > 0) { pickIdx = i; pickPower = pk; pickKey = d.key; break; }
    }
    if (pickIdx >= 0) p.inv.slots[40] = { id: pickIdx, stack: 1 };
    out.pickProbe = { pickIdx, pickPower, pickKey };
    const clearRow = dryRow;
    zone('zoneSnow');
    // ★群系位是 SceneMetrics 每拍按玩家真实位置重算的——zone() 后必须【同拍】消费,
    // 任何 settle/await 都会让 tick 清回 forest(取证:gateProbe.zones.snow=false)
    const replaceLog = [];
    const origReplace = g.replaceTileInPlace?.bind(g);
    if (origReplace) g.replaceTileInPlace = (tx2, ty2, id, st2) => { replaceLog.push({ id, st: st2 }); return origReplace(tx2, ty2, id, st2); };
    clearRow();
    zone('zoneSnow');
    st.setTile(px - 2, py + 1, torchInternal, 0, 9 * 22);       // 目标=雪炬(style9)
    heldSet(8); p.useTime = 0; p.itemTime = 0; g.tryPlace(px - 2, py + 1, torch);
    out.swap_sameStyle = { target: { t: st.get(px - 2, py + 1), fy: st.frameY[st.idx(px - 2, py + 1)] }, held: torch?.key, replaceLog: [...replaceLog] };
    clearRow();
    zone('zoneSnow');
    st.setTile(px - 2, py + 1, torchInternal, 0, 18 * 22);      // 目标=腐化炬(style18)
    zone('zoneSnow');
    out.gateProbe = {
      using: g.usingBiomeTorches(), flag: w.flags.unlockedBiomeTorches,
      acc11: p.builderAccStatus[11], zones: g.biomeTorchZonesAt(),
      heldStyle: p.inv.heldItem()?.placeStyle, heldId: p.inv.heldItem()?.id,
      heldKey: ITEM_DEFS[p.inv.heldItem()?.id]?.key ?? null,
    };
    heldSet(8); p.useTime = 0; p.itemTime = 0; g.tryPlace(px - 2, py + 1, torch);
    out.swap_diffStyle = { t: st.get(px - 2, py + 1), fy: st.frameY[st.idx(px - 2, py + 1)] };
    if (origReplace) g.replaceTileInPlace = origReplace;
    clearRow();
    zone('zoneSnow');
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) st.setTile(px - 2 + dx, py + dy, campInternal, 3 * 54 + dx * 18, dy * 18); // 目标=雪营火(style3)
    heldSet(966); p.useTime = 0; p.itemTime = 0; g.tryPlace(px - 2, py + 1, campfire);
    out.swap_campSame = { t: st.get(px - 2, py + 1), fx: st.frameX[st.idx(px - 2, py + 1)] };
    clearRow();
    p.inv.slots[40] = null;
    // B6 表序判别(纯数据):glowshroom+dungeon — 炬=dungeon(13) 先,营火=glowshroom(14) 先
    const z = (o) => ({ shimmer: false, dungeon: false, temple: false, underworld: false, glowshroom: false, hallow: false, corrupt: false, crimson: false, snow: false, jungle: false, desert: false, undergroundDesert: false, aboveSurface: true, remixWorld: false, ...o });
    out.zoneTables = {
      torchSnow: Torch.biomeTorchPlaceStyle(z({ snow: true })),
      campSnow: Torch.biomeCampfirePlaceStyle(z({ snow: true })),
      torchDungeonOnly: Torch.biomeTorchPlaceStyle(z({ dungeon: true })),
      torchTempleOnly: Torch.biomeTorchPlaceStyle(z({ temple: true })),
      torchGlowDungeon: Torch.biomeTorchPlaceStyle(z({ glowshroom: true, dungeon: true })),
      campGlowDungeon: Torch.biomeCampfirePlaceStyle(z({ glowshroom: true, dungeon: true })),
      campDungeonOnly: Torch.biomeCampfirePlaceStyle(z({ dungeon: true })),
      campTempleOnly: Torch.biomeCampfirePlaceStyle(z({ temple: true })),
      campUnderworld: Torch.biomeCampfirePlaceStyle(z({ underworld: true })),
      desertUnderground: Torch.biomeTorchPlaceStyle(z({ desert: true, aboveSurface: false })),
      desertSurface: Torch.biomeTorchPlaceStyle(z({ desert: true, aboveSurface: true })),
    };
    out.hold = {
      torchSnow: CII.biomeTorchHoldStyle(8, { shimmer: false, dungeon: false, temple: false, underworld: false, glowshroom: false, hallow: false, corrupt: false, crimson: false, snow: true, jungle: false, desertSurface: false, undergroundDesert: false, desertRemix: false }),
      torchJungle: CII.biomeTorchHoldStyle(8, { shimmer: false, dungeon: false, temple: true, underworld: false, glowshroom: false, hallow: false, corrupt: false, crimson: false, snow: false, jungle: true, desertSurface: false, undergroundDesert: false, desertRemix: false }),
      campSnow: CII.biomeCampfireHoldStyle(966, { shimmer: false, dungeon: false, temple: false, underworld: false, glowshroom: false, hallow: false, corrupt: false, crimson: false, snow: true, jungle: false, desertSurface: false, undergroundDesert: false, desertRemix: false }),
      campTemple: CII.biomeCampfireHoldStyle(966, { shimmer: false, dungeon: false, temple: true, underworld: false, glowshroom: false, hallow: false, corrupt: false, crimson: false, snow: false, jungle: false, desertSurface: false, undergroundDesert: false, desertRemix: false }),
    };
    // B5 .plr round-trip:exportPlr→parsePlr(全文件 AES-ECB,先冻 Date.now 消除时间戳噪声)
    const realNow = Date.now;
    Date.now = () => 1750000000000;
    const baseState = { armor: [], dye: [], inventory: [], miscEquips: [], miscDyes: [], banks: [[], [], [], []], buffs: [], hbLocked: false, hideInfo: [], team: 0, permanentUpgrades: {}, unlockedBiomeTorches: true, builderAccStatus: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] };
    const appearance = { name: 'RB30', difficulty: 0, hair: 0, skinVariant: 0, hairColor: { r: 1, g: 2, b: 3 }, skinColor: { r: 1, g: 2, b: 3 }, eyeColor: { r: 1, g: 2, b: 3 }, shirtColor: { r: 1, g: 2, b: 3 }, undershirtColor: { r: 1, g: 2, b: 3 }, pantsColor: { r: 1, g: 2, b: 3 }, shoeColor: { r: 1, g: 2, b: 3 } };
    const a = JSON.parse(JSON.stringify(baseState)); a.unlockedBiomeTorches = true;
    const b = JSON.parse(JSON.stringify(baseState)); b.unlockedBiomeTorches = false;
    const ea = Plr.exportPlr(appearance, a), eb = Plr.exportPlr(appearance, b);
    const diff = []; for (let i = 0; i < Math.max(ea.length, eb.length); i++) if (ea[i] !== eb[i]) diff.push(i);
    const pa = Plr.parsePlr(ea), pb = Plr.parsePlr(eb);
    Date.now = realNow;
    out.plr = {
      diffBlocks: [...new Set(diff.map((i) => Math.floor(i / 16)))],
      lenEq: ea.length === eb.length,
      flagOn: pa?.playerState?.unlockedBiomeTorches, flagOff: pb?.playerState?.unlockedBiomeTorches,
      // UsingBiomeTorches 位死数据判:文件里恒 false,但 [11] 位面从数组域读出(1→toggle off 保真)
      acc11: pa?.playerState?.builderAccStatus?.[11],
    };
    clearZones();
    return out;
  });
  ok(r.b1_on === true && r.b1_toggleOff === false && r.b1_unlockedOff === false, 'B1 usingBiomeTorches 双域(unlocked ∧ [11]==0)', JSON.stringify({ on: r.b1_on, tOff: r.b1_toggleOff, uOff: r.b1_unlockedOff }));
  const tyOf = (o, exp) => o ? o.frameY === exp : false;
  ok(tyOf(r.torch_snow_flagOn, 198), 'B2 雪原+旗开:普通炬转换 style9(frameY=198)', JSON.stringify(r.torch_snow_flagOn));
  ok(tyOf(r.torch_snow_flagOff, 0), 'B2 旗关:不转换(frameY=0)', JSON.stringify(r.torch_snow_flagOff));
  ok(tyOf(r.snowTorch_item, 198), 'B2 显式雪炬物品直落 style9(不受旗门)', JSON.stringify(r.snowTorch_item));
  ok(tyOf(r.torch_shimmer, 23 * 22), 'B2 微光群系转换 style23', JSON.stringify(r.torch_shimmer));
  ok(r.torch_water_snow === null, 'B2 水下:雪原转换炬(9 非水炬)拒', JSON.stringify(r.torch_water_snow));
  ok(r.waterTorch_inWater && r.waterTorch_inWater.frameY === 8 * 22, 'B2 水炬(523)水中可放 style8', JSON.stringify(r.waterTorch_inWater));
  const cfx = (o, exp) => o ? Math.floor(o.frameX / 54) === exp : false;
  ok(cfx(r.camp_snow_flagOn, 3), 'B3 雪原+旗开:普通营火转换 style3(frameX/54)', JSON.stringify(r.camp_snow_flagOn));
  ok(cfx(r.camp_snow_flagOff, 0), 'B3 旗关:营火不转换 style0', JSON.stringify(r.camp_snow_flagOff));
  ok(cfx(r.camp_snowItem, 3), 'B3 显式雪营火(3048)直落 style3', JSON.stringify(r.camp_snowItem));
  ok(r.swap_sameStyle.target.fy === 198, 'B4 块换 verdict:雪原普通炬→雪炬=转换后同 style 拒(目标帧零扰动)', JSON.stringify(r.swap_sameStyle));
  console.log('  [B4 取证] replaceTileInPlace 调用序列:', JSON.stringify(r.swap_sameStyle.replaceLog ?? null), ' 镐:', JSON.stringify(r.pickProbe ?? null), ' 门探针:', JSON.stringify(r.gateProbe ?? null));
  ok(r.swap_diffStyle.fy === 198, 'B4 块换写面:普通炬→腐化炬(18)成功且写转换 style9', JSON.stringify(r.swap_diffStyle));
  ok(Math.floor(r.swap_campSame.fx / 54) === 3, 'B4 块换 verdict:普通营火→雪营火=转换后同 style 拒', JSON.stringify(r.swap_campSame));
  ok(r.zoneTables.torchSnow === 9 && r.zoneTables.campSnow === 3, 'B6 雪原:炬 9/营火 3', JSON.stringify({ t: r.zoneTables.torchSnow, c: r.zoneTables.campSnow }));
  ok(r.zoneTables.torchDungeonOnly === 13 && r.zoneTables.torchTempleOnly === 21, 'B6 炬表:dungeon 13 先于 temple 21(各自单真)', JSON.stringify({ d: r.zoneTables.torchDungeonOnly, t: r.zoneTables.torchTempleOnly }));
  ok(r.zoneTables.campDungeonOnly === 7 && r.zoneTables.campTempleOnly === 13, 'B6 营火表:dungeon 7/temple 13(值域与炬异)', JSON.stringify({ d: r.zoneTables.campDungeonOnly, t: r.zoneTables.campTempleOnly }));
  ok(r.zoneTables.torchGlowDungeon === 13 && r.zoneTables.campGlowDungeon === 14, 'B6 表序差异判别:glowshroom+dungeon → 炬=13(dungeon 先)/营火=14(glowshroom 先)', JSON.stringify({ t: r.zoneTables.torchGlowDungeon, c: r.zoneTables.campGlowDungeon }));
  ok(r.zoneTables.campUnderworld === 2, 'B6 营火地狱=2', String(r.zoneTables.campUnderworld));
  ok(r.zoneTables.desertSurface === 16 && r.zoneTables.desertUnderground === 0, 'B6 沙漠地表门:地表 16/地下(非 undergroundDesert)0', JSON.stringify({ s: r.zoneTables.desertSurface, u: r.zoneTables.desertUnderground }));
  ok(r.hold.torchSnow === 974 && r.hold.torchJungle === 4388, 'B6 BiomeTorchHoldStyle 雪 974/神庙 4388', JSON.stringify(r.hold));
  ok(r.hold.campSnow === 3048 && r.hold.campTemple === 4694, 'B6 BiomeCampfireHoldStyle 雪 3048/神庙 4694', JSON.stringify(r.hold));
  ok(r.plr.lenEq && r.plr.diffBlocks.length === 1, 'B5 .plr:旗差异=恰 1 个 16 字节密文块(位序域唯一)', JSON.stringify({ blocks: r.plr.diffBlocks, lenEq: r.plr.lenEq }));
  ok(r.plr.flagOn === true && r.plr.flagOff === false, 'B5 .plr round-trip:exportPlr→parsePlr 旗保真', JSON.stringify({ on: r.plr.flagOn, off: r.plr.flagOff }));
  ok(r.plr.acc11 === 1, 'B5 UsingBiomeTorches 位=死数据(文件恒 false,[11] 位面从数组域保真=1)', JSON.stringify({ acc11: r.plr.acc11 }));
}

// ============ C. FX41b+RB29 modern 窗可见性矩阵(normal/guide)+detached 重建 ============
{
  const r = await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const vis = (el) => !!el && el.style.display !== 'none' && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const snap = () => {
      const win = ui.vinvModernCraftEl;
      const nearBtn = [...document.querySelectorAll('.sw-vinv button')].find((b) => b.querySelector('img')?.src.includes('UI_ChestCraft'));
      return {
        open: ui.vinvModernCraftOpen, guide: ui.vinvGuideMenuOpen,
        win: vis(win),
        title: ui.vinvModernTitleEl?.textContent,
        searchRow: vis(ui.vinvModernSearchRowEl), input: vis(ui.vinvModernSearchInput), clear: vis(ui.vinvModernSearchClear),
        filterBtns: ui.vinvModernFilterBtns.map(vis),
        scrollbar: ui.vinvModernScrollbarEl?.style.display ?? null,
        sepTop: ui.vinvModernSeparatorEl ? parseFloat(ui.vinvModernSeparatorEl.style.top) : null,
        gSlot: ui.vinvGuideSlotModernEl ? ui.vinvGuideSlotModernEl.style.display : null,
        gTxt: ui.vinvGuideModernCaptionEl ? ui.vinvGuideModernCaptionEl.style.display : null,
        gReq: ui.vinvGuideModernReqEl ? ui.vinvGuideModernReqEl.style.display : null,
        gTxtText: ui.vinvGuideModernCaptionEl?.textContent ?? null,
        nearToggle: nearBtn ? nearBtn.style.display : 'missing',
        entries: ui.vinvModernEntries.length, cells: ui.vinvModernCellEls.length,
        classicTitle: ui.vinvCraftTitleEl ? ui.vinvCraftTitleEl.style.display : null,
        sbarWinMoveBound: !!ui.vinvModernSbarWinMove, sbarWinUpBound: !!ui.vinvModernSbarWinUp,
        winChildren: win?.childElementCount ?? 0,
      };
    };
    const raf = (n) => new Promise((res) => { const s = () => { if (--n <= 0) res(); else requestAnimationFrame(s); }; requestAnimationFrame(s); });
    const out = {};
    // 真实路径进 guide 态:向导对话 → craft 按钮(=NPCChatText_GuideReverseCrafting)
    if (!window.__rb30_guide) {
      const n = new TownNPC('guide', g.player.x + 40, g.world.groundLevel * 16 - 48);
      n.home = null; g.entities.add(n, 'npcs'); window.__rb30_guide = n;
    }
    const npc = window.__rb30_guide;
    npc.dead = false;
    // NPC 钉帧:groundLevel*16 在玩家下方 ~960px(keepAlive 矩形域外即收话)——
    // 钉到玩家同层侧位,30ms 回位对抗 TownNPC AI 游走
    const pinNpc = () => { npc.x = g.player.x + 40; npc.y = g.player.y + g.player.h - npc.h; npc.vx = 0; npc.vy = 0; };
    pinNpc();
    window.__rb30_pin = setInterval(pinNpc, 30);
    window.__swUI.openInventory(true);
    await raf(4); await new Promise((x) => setTimeout(x, 200));
    g.openNpcDialog(npc);
    await raf(3); await new Promise((x) => setTimeout(x, 150));
    g.npcDialogButton('craft');
    await raf(5); await new Promise((x) => setTimeout(x, 350));
    out.guideEmpty = snap();
    // guide 槽放材料(wood):走 guidePlaced 域+同拍刷新(与 guideSlotMouseDown 落点一致)
    const woodIdx = ITEM_DEFS.findIndex((d) => /^vi_9_/.test(d.key));
    ui.guidePlaced = { id: woodIdx, stack: 1 };
    ui.vinvPaintGuideCraft?.();
    ui.vinvUpdateModernCraft();
    await raf(3); await new Promise((x) => setTimeout(x, 150));
    out.guideItem = snap();
    out.guideRecipes = ui.vinvModernEntries.slice(0, 6).map((e) => e.r.create);
    // detached 重建(签名失效)——guide 态全元素须存活
    ui.vinvLayoutSig = ''; ui.layoutVanilla();
    await raf(3); await new Promise((x) => setTimeout(x, 150));
    out.afterSigReset = snap();
    // 走远退出 guide → 窗关;再 modern(无对话)开窗 → hard rebuild 复位
    clearInterval(window.__rb30_pin);
    npc.x = g.player.x + 400; npc.y = g.player.y + g.player.h - npc.h;
    await raf(5); await new Promise((x) => setTimeout(x, 250));
    out.afterWalkAway = { guide: ui.vinvGuideMenuOpen, modern: ui.vinvModernCraftOpen };
    ui.vinvOpenModernCraft(null, true);
    await raf(3); await new Promise((x) => setTimeout(x, 200));
    ui.rebuildInventoryPanel();
    await raf(4); await new Promise((x) => setTimeout(x, 250));
    out.afterRebuild = { open: ui.vinvModernCraftOpen, win: vis(ui.vinvModernCraftEl), roots: document.querySelectorAll('.sw-vinv').length, moveBound: !!ui.vinvModernSbarWinMove, upBound: !!ui.vinvModernSbarWinUp };
    // 重建后重开+复用
    window.__swUI.openInventory(true);
    ui.vinvOpenModernCraft(null, true);
    await raf(4); await new Promise((x) => setTimeout(x, 250));
    out.reopen = snap();
    ui.vinvCloseModernCraft(true); window.__swUI.closeInventory();
    return out;
  });
  const G0 = r.guideEmpty, G1 = r.guideItem, R = r.afterSigReset;
  ok(G0.guide === true && G0.open === true && G0.win, 'C2 guide 态进入(真实对话链)+窗开', JSON.stringify({ guide: G0.guide, open: G0.open, win: G0.win }));
  ok(G0.gSlot !== 'none' && G0.gTxt !== 'none' && G0.gReq !== 'none', 'C2 guide:向导槽/文案/需求行可见', JSON.stringify({ g: G0.gSlot, t: G0.gTxt, q: G0.gReq }));
  ok(G0.searchRow && G0.input && G0.filterBtns.length === 11 && G0.filterBtns.every(Boolean), 'C2 guide:搜索条+11 筛选钮仍全可见(原版无 guide 隐藏面)', JSON.stringify({ sr: G0.searchRow, f: G0.filterBtns }));
  ok(G0.nearToggle === 'none', 'C2 guide:就近箱钮隐藏(vanilla :496 门)', JSON.stringify({ n: G0.nearToggle }));
  ok(G0.entries === 0, 'C2 guide 空槽:GetNumRecipes=0', String(G0.entries));
  ok(G0.gTxtText !== '' && G0.gTxtText !== null, 'C2 guide 空槽文案=inter[24]', JSON.stringify({ t: G0.gTxtText }));
  ok(G1.entries > 0 && G1.entries === G1.cells, 'C3 guide 有件(wood):反查集非空且格池同拍', JSON.stringify({ e: G1.entries, c: G1.cells, sample: r.guideRecipes }));
  ok(R.guide === true && R.gSlot !== 'none' && R.win && R.open, 'C4 detached(签名失效重建):guide 态全元素存活', JSON.stringify({ guide: R.guide, open: R.open, win: R.win, g: R.gSlot }));
  ok(R.sbarWinMoveBound && R.sbarWinUpBound, 'C4 detached:window 级滚动条监听存活', JSON.stringify({ m: R.sbarWinMoveBound, u: R.sbarWinUpBound }));
  ok(R.winChildren === G0.winChildren, 'C4 detached:窗子元素数不变(无重复 append)', JSON.stringify({ before: G0.winChildren, after: R.winChildren }));
  ok(R.sepTop !== null && G0.sepTop !== null && R.sepTop === G0.sepTop, 'C4 detached:分隔线几何稳定', JSON.stringify({ g0: G0.sepTop, r: R.sepTop }));
  ok(r.afterWalkAway.guide === false && r.afterWalkAway.modern === false, 'C4 走远退出 guide=窗同收(退出臂 :9158)', JSON.stringify(r.afterWalkAway));
  ok(r.afterRebuild.roots === 1 && r.afterRebuild.open === false && r.afterRebuild.win === false, 'C4 hard rebuild:根唯一+窗态复位', JSON.stringify(r.afterRebuild));
  ok(r.afterRebuild.moveBound === true && r.afterRebuild.upBound === true, 'C4 hard rebuild:监听重挂(无泄漏/无丢失)', JSON.stringify({ m: r.afterRebuild.moveBound, u: r.afterRebuild.upBound }));
  ok(r.reopen.open && r.reopen.win && r.reopen.filterBtns.every(Boolean), 'C4 重建后重开:态机可复用', JSON.stringify({ open: r.reopen.open, f: r.reopen.filterBtns.length }));
}

// ============ D. FX27 对话字号矩阵 + 收包/minimize 链互斥序 ============
{
  const r = await page.evaluate(async () => {
    const g = window.__swGame, ui = window.__swUI;
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const out = {};
    const spawn = () => {
      if (!window.__rb30_guide) {
        const n = new TownNPC('guide', g.player.x + 40, g.world.groundLevel * 16 - 48);
        n.home = null; g.entities.add(n, 'npcs'); window.__rb30_guide = n;
      }
      const n = window.__rb30_guide;
      n.x = g.player.x + 40; n.y = g.world.groundLevel * 16 - n.h; n.dead = false;
      return n;
    };
    const npc = spawn();
    npc.dead = false;
    const pinD = () => { npc.x = g.player.x + 40; npc.y = g.player.y + g.player.h - npc.h; npc.vx = 0; npc.vy = 0; };
    pinD();
    window.__rb30_pinD = setInterval(pinD, 30);
    g.openNpcDialog(npc);
    await new Promise((x) => setTimeout(x, 250));
    const panel = document.querySelector('.sw-npc-dialog');
    const fs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fontSize : null; };
    out.fonts = {
      chat: fs('.sw-npc-chat'), btn: fs('.sw-npc-btn'), pname: fs('.sw-npc-pname'), coins: fs('.sw-npc-coins'),
    };
    out.panelVisible = !!panel && panel.style.display !== 'none' && !!(panel.offsetWidth || panel.offsetHeight);
    out.sessionOnOpen = { dialog: !!g.dialogNpc, shop: g.npcShopOpen };
    // minimize 链①:guide craft 按钮 → 面板收起+会话保持+guide 菜单
    g.npcDialogButton('craft');
    await new Promise((x) => setTimeout(x, 250));
    const panel2 = document.querySelector('.sw-npc-dialog');
    out.minimizeCraft = {
      panelGone: !panel2 || panel2.style.display === 'none' || (!panel2.offsetWidth && !panel2.offsetHeight),
      sessionKept: !!g.dialogNpc, guideMenu: ui.vinvGuideMenuOpen, invOpen: ui.invPanel.style.display === 'block',
    };
    // 互斥序:向导态右键站点 = setFilter 臂退出 guide+会话清(setFilter 支 closeNpcDialog(true))。
    // 滤器 CanRemainOpen(vinvFilterRemain:9502 每拍)=adjTile[17] 域内判定——补真熔炉
    // (reach 内)防每拍失效收窗(原版同门 NewCraftingUI.cs:655-665)
    {
      const { TILE_DEFS } = await import('/src/data/tiles.ts');
      const tByS = (sh) => { const i = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sh); return i >= 0 ? i : -1; };
      const st2 = g.world.store;
      const px = Math.floor(g.player.x / 16), py = Math.floor((g.player.y + g.player.h) / 16);
      for (let x = px - 6; x <= px + 6; x++) { for (let y = py - 3; y <= py + 1; y++) st2.setTile(x, y, 0); st2.setTile(x, py + 2, tByS(1)); }
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) st2.setTile(px - 4 + dx, py + dy, tByS(17));
    }
    await new Promise((x) => setTimeout(x, 150));
    const beforeFilter = { guide: ui.vinvGuideMenuOpen, dialog: !!g.dialogNpc, modern: ui.vinvModernCraftOpen };
    ui.vinvOpenCloseModernCraftFilter({ kind: 'station', tile: 17 });
    await new Promise((x) => setTimeout(x, 250));
    out.guideExitByFilter = { before: beforeFilter, after: { guide: ui.vinvGuideMenuOpen, dialog: !!g.dialogNpc, modern: ui.vinvModernCraftOpen } };
    ui.vinvCloseModernCraft(true);
    // minimize 链②:开店收面板+会话保持;关店不重现(登记语义);走远即退
    g.openNpcDialog(npc);
    await new Promise((x) => setTimeout(x, 150));
    g.npcDialogButton('shop');
    await new Promise((x) => setTimeout(x, 200));
    const panel3 = document.querySelector('.sw-npc-dialog');
    out.minimizeShop = {
      panelGone: !panel3 || panel3.style.display === 'none' || (!panel3.offsetWidth && !panel3.offsetHeight),
      sessionKept: !!g.dialogNpc, shopOpen: g.npcShopOpen,
    };
    g.npcShopClose();
    await new Promise((x) => setTimeout(x, 150));
    const panel4 = document.querySelector('.sw-npc-dialog');
    out.afterShopClose = {
      panelBack: !!panel4 && panel4.style.display !== 'none' && !!(panel4.offsetWidth || panel4.offsetHeight),
      sessionKept: !!g.dialogNpc,
    };
    // 收包链:走远 → 会话终
    clearInterval(window.__rb30_pinD);
    npc.x = g.player.x + 400; npc.y = g.player.y + g.player.h - npc.h;
    g.tickNpcDialogKeepAlive?.();
    await new Promise((x) => setTimeout(x, 200));
    out.afterWalkAway = { dialog: !!g.dialogNpc };
    // 现代窗开臂 CloseAll 门:对话开→右键站 → 会话清(收对话)
    window.__rb30_pinD2 = setInterval(pinD, 30);
    g.openNpcDialog(npc);
    await new Promise((x) => setTimeout(x, 250));
    window.__swUI.openInventory(true);
    ui.vinvOpenModernCraft(null, false);
    await new Promise((x) => setTimeout(x, 150));
    out.modernOpenClosesDialog = { dialog: !!g.dialogNpc, modern: ui.vinvModernCraftOpen };
    ui.vinvCloseModernCraft(true); window.__swUI.closeInventory();
    clearInterval(window.__rb30_pinD2);
    return out;
  });
  ok(r.fonts.chat === '19px' && r.fonts.btn === '17px' && r.fonts.pname === '16px',
    'D1 对话字号矩阵:台词 19/按钮 17(0.9 档)/名字 16(Item_Stack)', JSON.stringify(r.fonts));
  ok(r.fonts.coins === null || r.fonts.coins === '11px',
    'D1 金币条 11px(0.75 档;仅带价签按钮存在时渲染)', JSON.stringify(r.fonts.coins));
  ok(r.panelVisible, 'D1 对话面板开态可见');
  ok(r.minimizeCraft.panelGone && r.minimizeCraft.sessionKept && r.minimizeCraft.guideMenu,
    'D2 minimize 链①:guide craft=面板收+会话保持+guide 菜单', JSON.stringify(r.minimizeCraft));
  ok(r.guideExitByFilter.after.guide === false && r.guideExitByFilter.after.dialog === false && r.guideExitByFilter.after.modern === true,
    'D2 互斥序:向导态右键站点=guide 退+会话清+窗续开(setFilter 臂)', JSON.stringify(r.guideExitByFilter));
  ok(r.minimizeShop.panelGone && r.minimizeShop.sessionKept && r.minimizeShop.shopOpen,
    'D2 minimize 链②:开店=面板收+会话保持+店开', JSON.stringify(r.minimizeShop));
  ok(r.afterShopClose.sessionKept && !r.afterShopClose.panelBack,
    'D2 关店不重现面板(原版 npcChatText="" 语义)+会话保持', JSON.stringify(r.afterShopClose));
  ok(r.afterWalkAway.dialog === false, 'D2 走远=会话终(keepAlive)', JSON.stringify(r.afterWalkAway));
  ok(r.modernOpenClosesDialog.dialog === false && r.modernOpenClosesDialog.modern === true,
    'D2 modern 窗开臂 CloseAll:对话收(会话清)', JSON.stringify(r.modernOpenClosesDialog));
}

console.log('---- page errors ----');
console.log(errs.length ? errs.join('\n') : '(none)');
console.log(fails.length ? `\nFAILS(${fails.length}): ${fails.join(' | ')}` : '\nALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
