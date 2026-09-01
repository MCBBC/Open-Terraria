// 债 B 探针：DECOR 3×3 邻域扫（原版 SquareTileFrame WorldGen.cs:81462-81473 运行期等价）
// —— KillTile 尾 SquareTileFrame(i,j)（:64432）派发被改格【下方/左右/斜角】的 DECOR 件；
//    本仓原只有 D-1 上方一格（checkFurnitureSupport(x,y-1)）→ 顶锚件挖塌不触发。
// 场景（合成：setTileSilent 构造 + breakTile 触发；仪具模板 _pile-place.mjs）：
//  ①hiveCeiling             蜂巢 444 2×2 顶锚,挖天花板锚格 → 整件清除 + 蜂群效应
//                           （原版 CheckSuper flag3 :48631-48657 逐列锚+液体门,:48677-48687
//                           整件 KillTile → case 444 → 655 弹蜂群 :76611-76660）
//  ②hiveDiagControl         同构造,挖斜角格（天花板行左外一格,非锚）→ 整件幸存（扫不越权）
//  ③chandelierHook          吊灯 34 3×3,挖中列挂钩格 → 整件清除 + 掉 106
//                           （原版 CheckChand :53317-53321 锚=num+1 列上方实心非 solidTop）
//  ④chandelierSideControl   同构造,挖左侧旁格 → 整件幸存
//  ⑤pigronataHook           皮格纳塔 454 4×3,挖第 2 列锚格（CheckChand :53264-53267 num3=4,
//                           锚列同为左列+1）→ 整件清除
//  ⑥pigronataOtherColCtrl   挖第 3 列上格（非锚列）→ 整件幸存
//  ⑦plantBelowRegression    挖植物(3)下方草块（既有 D-1 上方格链,不回退）→ 整株清除
// 几何：bl=底左原点（buildObj 行区 bly-(oh-1)..bly）；444 顶行=F-2 锚行=F-3；
//       34/454 行区 F-3..F-1 锚行=F-4
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = process.env.SW_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (23).json';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000 });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const idOfSheet = (sh) => {
    for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i;
    return -1;
  };
  const STONE = idOfSheet(1), WEED = idOfSheet(3), GRASS2 = idOfSheet(2);
  const HIVES = idOfSheet(444), CHAND = idOfSheet(34), PIGR = idOfSheet(454);
  const enemyCount = (vid) => (g.entities.enemies ?? []).filter((e) => !e.dead && e.vanillaId === vid).length;
  const dropCount = (vid) => (g.entities.drops ?? []).filter((d) => !d.dead
    && String(items.ITEM_DEFS[d.itemId]?.key ?? '').startsWith(`vi_${vid}_`)).length;
  // 合成场景：中线高空（同 _pile-place.mjs）
  const x0 = Math.min(Math.max(Math.floor(st.w / 2), 20), st.w - 20) + 60;
  const F = Math.floor(st.h / 2) - 260;
  if (!st.inBounds(x0 + 12, F + 4)) return { fail: 'bounds', x0, F };
  const clearBox = () => { for (let x = x0 - 3; x <= x0 + 12; x++) for (let y = F - 8; y <= F + 3; y++) {
    if (!st.inBounds(x, y)) continue;
    if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
    const i2 = st.idx(x, y);
    if (st.liquid[i2] > 0) st.liquid[i2] = 0;
  } };
  // 多格件合成（fx=dx*18 / fy=dy*18,bl=底左原点）——setTileSilent：真实构建面 =
  // worldgen/导入静默写,逐格 setTile 会在合成中途触发 Check* 裁决
  const buildObj = (tid, blx, bly, ow2, oh2) => {
    for (let dx = 0; dx < ow2; dx++) {
      for (let dy = 0; dy < oh2; dy++) {
        st.setTileSilent(blx + dx, bly - (oh2 - 1) + dy, tid, dx * 18, dy * 18);
      }
    }
  };
  const row = (sx, y, n, tid) => { for (let dx = 0; dx < n; dx++) st.setTileSilent(sx + dx, y, tid, 0, 0); };
  const countIn = (tid, xa, xb, ya, yb) => {
    let n = 0;
    for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++)
      if (st.inBounds(x, y) && st.get(x, y) === tid) n++;
    return n;
  };
  const res = { ids: { stone: STONE, weed: WEED, grass: GRASS2, hive: HIVES, chand: CHAND, pigr: PIGR, x0, F } };

  // ①/② 蜂巢 444：行区 F-2..F-1,锚行 F-3（CheckSuper flag3 :48636 逐列上方 AnchorValid）
  const hiveSetup = (ceilWide) => {
    clearBox();
    row(x0 + 4, F, 4, STONE);              // 地面（444 无底锚需求,场景垫底）
    row(x0 + 5 - (ceilWide ? 1 : 0), F - 3, ceilWide ? 3 : 2, STONE);   // 天花板锚行
    buildObj(HIVES, x0 + 5, F - 1, 2, 2);
  };
  hiveSetup(false);
  {
    const preBees = enemyCount(210) + enemyCount(211);
    g['breakTile'].call(g, x0 + 5, F - 3);   // 挖左列天花板锚格
    res.hiveCeiling = {
      residue: countIn(HIVES, x0 + 3, x0 + 8, F - 4, F + 1),
      ceilRightSurvives: st.get(x0 + 6, F - 3) === STONE,
      bees: enemyCount(210) + enemyCount(211) - preBees,
    };
  }
  hiveSetup(true);
  {
    g['breakTile'].call(g, x0 + 4, F - 3);   // 斜角格（锚行左外一格,非锚）
    res.hiveDiagControl = { residue: countIn(HIVES, x0 + 3, x0 + 8, F - 4, F + 1) };
  }

  // ③/④ 吊灯 34：行区 F-3..F-1,锚 = 顶行中列(x0+6)上方 F-4（CheckChand :53317 num+1 列）
  const chandSetup = () => {
    clearBox();
    row(x0 + 4, F, 6, STONE);
    row(x0 + 5, F - 4, 3, STONE);          // 天花板锚行
    st.setTileSilent(x0 + 4, F - 2, STONE, 0, 0);   // 侧旁对照格
    buildObj(CHAND, x0 + 5, F - 1, 3, 3);
  };
  chandSetup();
  {
    const preDrop = dropCount(106);
    g['breakTile'].call(g, x0 + 6, F - 4);   // 挖中列挂钩格
    res.chandelierHook = {
      residue: countIn(CHAND, x0 + 3, x0 + 10, F - 5, F + 1),
      drop106: dropCount(106) - preDrop,
    };
  }
  chandSetup();
  {
    g['breakTile'].call(g, x0 + 4, F - 2);   // 左侧旁格（与灯体中部同行,非锚）
    res.chandelierSideControl = { residue: countIn(CHAND, x0 + 3, x0 + 10, F - 5, F + 1) };
  }

  // ⑤/⑥ 皮格纳塔 454：行区 F-3..F-1,锚列 = 左列+1 = x0+6,锚行 F-4
  const pigrSetup = () => {
    clearBox();
    row(x0 + 4, F, 8, STONE);
    row(x0 + 5, F - 4, 4, STONE);          // 天花板锚行
    buildObj(PIGR, x0 + 5, F - 1, 4, 3);
  };
  pigrSetup();
  {
    g['breakTile'].call(g, x0 + 6, F - 4);   // 挖第 2 列（锚列）上格
    res.pigronataHook = { residue: countIn(PIGR, x0 + 3, x0 + 11, F - 5, F + 1) };
  }
  pigrSetup();
  {
    g['breakTile'].call(g, x0 + 7, F - 4);   // 挖第 3 列（非锚列）上格
    res.pigronataOtherColControl = { residue: countIn(PIGR, x0 + 3, x0 + 11, F - 5, F + 1) };
  }

  // ⑦ 既有回归：植物(3) 下方草块挖除 → D-1 上方格链整株清除（行为不回退）
  {
    clearBox();
    row(x0 + 5, F, 4, GRASS2);
    st.setTileSilent(x0 + 6, F - 1, WEED, 0, 0);
    g['breakTile'].call(g, x0 + 6, F);       // 挖植物下方草块
    res.plantBelowRegression = { weedGone: st.get(x0 + 6, F - 1) !== WEED };
  }

  // ⑧ 罐破重入护栏（债 B 伴生）：3×3 扫在 smashPot 洪泛清环中途对残余罐格再派发
  //   CheckPot → killDecorTile(锚) → smashPot 重入 = 掉落表跑两遍。原版由 CheckPot 头
  //   destroyObject 门（:57276/:57337）压制;本仓 _potSmashing 护栏同旨。
  //   观测：挖【非锚格】（右下,锚=左上）→ smashPotInner/potLoot 各只 1 次 + 整罐清空
  {
    const POT = idOfSheet(28);
    clearBox();
    row(x0 + 5, F, 4, STONE);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++)
      st.setTileSilent(x0 + 5 + dx, F - 2 + dy, POT, dx * 18, dy * 18);   // 锚=(x0+5,F-2) 顶行
    const proto = Object.getPrototypeOf(g);
    const origInner = proto.smashPotInner, origLoot = proto.potLoot;
    let innerCalls = 0, lootCalls = 0;
    proto.smashPotInner = function (...a) { innerCalls++; return origInner.apply(this, a); };
    proto.potLoot = function (...a) { lootCalls++; return origLoot.apply(this, a); };
    try {
      g['breakTile'].call(g, x0 + 6, F - 1);   // 挖右下格（非锚）
    } finally {
      proto.smashPotInner = origInner;
      proto.potLoot = origLoot;
    }
    res.potReentryGuard = {
      residue: countIn(POT, x0 + 3, x0 + 8, F - 4, F + 1),
      innerCalls, lootCalls,
    };
  }

  // ⑨ 备案①清零（2026-09-01 五批）：TileFrame 五格世界边界门（:82606-82609
  //   i<=5||j<=5||i>=max-5||j>=max-5 整格 return）——x<=5 区内顶锚件挖天花板
  //   【不派发】Check* → 整件幸存;x>5 同构造（对照,主场景①已证）则整件清除
  {
    const ey = F;                       // 边界列竖直位（y 远大于 5,门只由 x 触发）
    const edgeSetup = (bx) => {
      // 边界区手工清场（clearBox 锚定 x0,不适用）
      for (let x = bx - 2; x <= bx + 5; x++) for (let y = ey - 6; y <= ey + 3; y++) {
        if (!st.inBounds(x, y)) continue;
        if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
        const i2 = st.idx(x, y);
        if (st.liquid[i2] > 0) st.liquid[i2] = 0;
      }
      row(bx, ey, 4, STONE);            // 地面
      row(bx, ey - 3, 2, STONE);        // 天花板锚行（444 顶行=ey-2）
      buildObj(HIVES, bx, ey - 1, 2, 2);
    };
    edgeSetup(4);                        // 蜂巢列 x=4,5 —— 全在 <=5 门内
    const preBees = enemyCount(210) + enemyCount(211);
    g['breakTile'].call(g, 4, ey - 3);   // 挖左列天花板锚格
    res.edgeGatedSurvives = {
      residue: countIn(HIVES, 2, 7, ey - 4, ey + 1),
      bees: enemyCount(210) + enemyCount(211) - preBees,
    };
    edgeSetup(7);                        // 对照:蜂巢列 x=7,8 —— 门外,扫生效
    g['breakTile'].call(g, 7, ey - 3);
    res.edgeOutsideWiped = { residue: countIn(HIVES, 5, 10, ey - 4, ey + 1) };
  }

  res.verdict = res.hiveCeiling.residue === 0 && res.hiveCeiling.bees > 0 && res.hiveCeiling.ceilRightSurvives
    && res.hiveDiagControl.residue === 4
    && res.chandelierHook.residue === 0 && res.chandelierHook.drop106 > 0
    && res.chandelierSideControl.residue === 9
    && res.pigronataHook.residue === 0
    && res.pigronataOtherColControl.residue === 12
    && res.plantBelowRegression.weedGone
    && res.potReentryGuard.residue === 0 && res.potReentryGuard.innerCalls === 1
    && res.potReentryGuard.lootCalls === 1
    && res.edgeGatedSurvives.residue === 4 && res.edgeGatedSurvives.bees === 0
    && res.edgeOutsideWiped.residue === 0 ? 'PASS' : 'FAIL';
  return res;
});
fs.writeFileSync('/tmp/decor-sweep.json', JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
