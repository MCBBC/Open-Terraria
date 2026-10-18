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
// —— 2026-09-02 八批（幸存链缺口）追加：
//  ⑩-⑭ tallgate           389/388 高门 CheckTallGate（:52111 完整性+顶/底双行 SolidTile）：
//                          开态挖顶锚→整件清+掉 3240/挖中部→object 锚点支清/侧扰动→幸存/
//                          闭态切换两态 5 格保全后顶锚挖清/导入帧约定（0/20/38/56/74）不误杀
//  ⑮-⑰ gemlock 440        'wallhang'（Check3x3Wall :44690 逐格 wall>0）：带墙扰动幸存/
//                          清一角墙→整件清（setWall 监听链）/帧混格→判坏
//  ⑱ hangtopRightCol       465/591/592/531 右列挖锚→整件清 + 右列旁扰动→幸存（六批
//                          mod36 列解码修复的回归哨兵;style 带基 36 合成）
// —— 2026-09-02 九批（红蓝对抗后裁定存活项修复批）追加：
//  ⑲ potAdjacency          B-1：两罐共边（A 列 x0+5..6、B 列 x0+7..8,variant 0/36）——
//                          敲 A → A 4 格清+B 4 格幸存+loot 恰 1 次;再敲 B → loot 累计 2
//                          （PlacePot :54529 净空只查自身 2×2+底行 → 相邻罐合法;
//                          CheckPot 杀环 :57347-57356 只杀本件 2×2 → loot 各掉各的）
//  ⑳ trapdoor387          M-1：387 2×1 嵌两实心块间（CheckTrapDoor 387 臂 :52059-52063
//                          完整性 CheckTileFrames :52245+左右外格 mode1 StrictSolid
//                          :52063/:52261-52276）→ 挖一侧支承 → 整件清+掉落（item 3239
//                          语义,本仓 place_v_387 兜底）;旁扰动对照幸存
//  ㉑ rack334              m-4：3×3 武器架带 PlaceWeapon 5000 系标记帧（Player.cs:54721+
//                          :54795/:54796 写 5000+100+id / 10000+prefix;二行带 20000/25000
//                          :54790-54794;CheckWeaponsRack :46802-46828 剥 5000 系再 %54）
//                          → 邻格扰动幸存;无标记对照幸存;清一角墙 → 整架塌
// —— 2026-09-02 缓修小账（红蓝对抗六项,详见场景块前注）——
//  ㉒ tallGate388Drop ⑤  ㉓ hangtopPlatBand m-2  ㉔ potFrames m-3
//  ㉕ hang2x2Frames m-3  ㉖ trapdoor386Frames m-3  ㉗ npcSlotGate m-1
// 几何：bl=底左原点（buildObj 行区 bly-(oh-1)..bly）；444 顶行=F-2 锚行=F-3；
//       34/454 行区 F-3..F-1 锚行=F-4；389 行区 F-5..F-1 锚行 F/F-6；
//       440 行区 F-4..F-2（背墙同域）；hangtop 行区 F-3..F-1 锚行=F-4
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = process.env.SW_MAP ?? needInput(join(DOWNLOADS, 'map-Starter_World (23).json'));
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
  // 八批（幸存链缺口）：高门双态/宝石锁/hangtop 右列哨兵
  const TALL_C = idOfSheet(388), TALL_O = idOfSheet(389), GLOCK = idOfSheet(440);
  const HANGTOPS = [465, 591, 592, 531].map((s) => ({ sheet: s, tid: idOfSheet(s) }));
  const DoorMod = await import('/src/world/Door.ts');
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

  // ⑩-⑭ 八批①：389/388 高门幸存链（CheckTallGate WorldGen.cs:52111——完整性+顶/底
  //   双行 SolidTile :52292-52305;旧 'furniture' kind=底行∨墙伪支撑,388 solid 早退无链）。
  //   vanilla-faithful 几何（同 _decor-place.mjs 389 positive）：地面 F + 天花 F-6
  //   （恰 5 格净空 F-5..F-1,双锚）,门列 x0+5。★M-2（2026-09-02 九批）合成帧统一
  //   原版序 0/20/38/56/74（TileObject.Place :96-108 heights+padding 累进）——本仓
  //   放置面/迁移后存量/wld 导入三面同序;旧 18px 步进态=判坏（⑭守门,存量由
  //   tallgateFrameRepair 于 afterWorldLoad 迁移）。
  const tgSetup = (tid, legacyFrames = false) => {
    clearBox();
    row(x0 + 4, F, 3, STONE);              // 底锚行
    row(x0 + 4, F - 6, 3, STONE);          // 顶锚行（净空恰 5）
    const FYS = legacyFrames ? [0, 18, 36, 54, 72] : [0, 20, 38, 56, 74];
    for (let dy = 0; dy < 5; dy++) st.setTileSilent(x0 + 5, F - 5 + dy, tid, 0, FYS[dy]);
  };
  tgSetup(TALL_O);
  {
    const preDrop = dropCount(3240);
    g['breakTile'].call(g, x0 + 5, F - 6);   // 挖顶锚（天花恰在门顶上一格）
    res.tgOpenTopDig = {
      residue: countIn(TALL_O, x0 + 3, x0 + 8, F - 7, F + 2),
      drop3240: dropCount(3240) - preDrop,   // CheckTallGate :52156-52161 两态恒 3240
    };
  }
  tgSetup(TALL_O);
  {
    g['breakTile'].call(g, x0 + 5, F - 3);   // 挖中部格 → object 锚点支整件清（对照）
    res.tgMidDigObject = { residue: countIn(TALL_O, x0 + 3, x0 + 8, F - 7, F + 2) };
  }
  tgSetup(TALL_O);
  {
    st.setTileSilent(x0 + 4, F - 3, STONE, 0, 0);   // 侧旁格（非锚,先放后挖）
    g['breakTile'].call(g, x0 + 4, F - 3);
    res.tgSideDisturb = { residue: countIn(TALL_O, x0 + 3, x0 + 8, F - 7, F + 2) };
  }
  tgSetup(TALL_C);
  {
    // 388 闭态：新链放置/切换不回归（ShiftTallGate Door.ts:131 逐格 setTile 半写态
    // ——'tallgate' case 对 388/389 配对态格放行=原版「写完再评估」等价,见 case 注）
    const opened = DoorMod.shiftTallGate(st, x0 + 5, F - 5, false);
    const openCount = countIn(TALL_O, x0 + 3, x0 + 8, F - 7, F + 2);
    const closed = opened ? DoorMod.shiftTallGate(st, opened[0], opened[1], true) : null;
    const closeCount = countIn(TALL_C, x0 + 3, x0 + 8, F - 7, F + 2);
    if (closed) g['breakTile'].call(g, x0 + 5, F - 6);   // 闭态顶锚挖 → 整件清
    res.tgClosedToggleDig = {
      opened: !!opened, closed: !!closed, openCount, closeCount,
      residue: countIn(TALL_O, x0 + 3, x0 + 8, F - 7, F + 2) + countIn(TALL_C, x0 + 3, x0 + 8, F - 7, F + 2),
    };
  }
  tgSetup(TALL_O, true);
  {
    // ⑭ ★M-2c 守门：旧 18px 步进帧（迁移前存量态）完整性判坏 → 侧扰动即整件清。
    //   真实存档由 tallgateFrameRepair 迁移（afterWorldLoad）,运行期不该再见此态
    st.setTileSilent(x0 + 4, F - 3, STONE, 0, 0);
    g['breakTile'].call(g, x0 + 4, F - 3);
    res.tgLegacyFramesKilled = { residue: countIn(TALL_O, x0 + 3, x0 + 8, F - 7, F + 2) };
  }

  // ⑮-⑰ 八批②：440 宝石锁 → 'wallhang'（Check3x3Wall :44690 逐格 wall>0+完整性,
  //   派发组 :86765-86767 case 240/440）。style 带基 54（style1）合成顺带覆盖帧基解码。
  const glSetup = () => {
    clearBox();
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      st.wall[st.idx(x0 + 4 + dx, F - 4 + dy)] = 1;                       // 背墙 3×3
      st.setTileSilent(x0 + 4 + dx, F - 4 + dy, GLOCK, 54 + dx * 18, dy * 18);   // style1 带基
    }
  };
  glSetup();
  {
    st.setTileSilent(x0 + 3, F - 3, STONE, 0, 0);   // 侧旁格（非锚）
    g['breakTile'].call(g, x0 + 3, F - 3);
    res.glStyleSurvive = { residue: countIn(GLOCK, x0 + 2, x0 + 9, F - 6, F + 1) };
  }
  glSetup();
  {
    st.setWall(x0 + 5, F - 3, 0);   // 清一角墙（setWall 发监听 → wallhang 逐格 wall 门）
    res.glWallDig = {
      residue: countIn(GLOCK, x0 + 2, x0 + 9, F - 6, F + 1),
      drops: (g.entities.drops ?? []).filter((d) => !d.dead
        && String(items.ITEM_DEFS[d.itemId]?.key ?? '').match(/vi_364[4-9]_|vi_3650_/)).length,
    };
  }
  glSetup();
  {
    // 帧混格判坏（:44724-44725 逐格 frameX 比对）：右下格帧改异 style 基（54→108 系）
    st.frameX[st.idx(x0 + 6, F - 2)] = 108 + 2 * 18;
    st.setTileSilent(x0 + 5, F - 1, STONE, 0, 0);   // 门件下方邻格（非锚）触发扫
    g['breakTile'].call(g, x0 + 5, F - 1);
    res.glFrameMixKilled = { residue: countIn(GLOCK, x0 + 2, x0 + 9, F - 6, F + 1) };
  }

  // ⑱ 八批③：hangtop 族（465/591/592/531）右列派发回归哨兵（六批备案④——mod36
  //   列解码修复后的右列挖锚必须整件清 + 右列旁扰动必须幸存;style 带基 36 合成）
  res.hangtopRightCol = [];
  res.hangtopIdsOk = HANGTOPS.every((h) => h.tid > 0);
  for (const ht of HANGTOPS) {
    if (ht.tid <= 0) { res.hangtopRightCol.push({ sheet: ht.sheet, missing: true }); continue; }
    const htSetup = () => {
      clearBox();
      row(x0 + 4, F, 4, STONE);            // 地面（垫底,族无底锚）
      row(x0 + 4, F - 4, 4, STONE);        // 天花锚行（两列上各 1 格,AnchorTop cnt2 start0）
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 3; dy++)
        st.setTileSilent(x0 + 5 + dx, F - 3 + dy, ht.tid, 36 + dx * 18, dy * 18);   // style1 带基
    };
    htSetup();
    g['breakTile'].call(g, x0 + 7, F - 4);   // 右列旁非锚格 → 必须幸存（右列派发不得误杀）
    const sideCtrl = countIn(ht.tid, x0 + 3, x0 + 9, F - 5, F + 1);
    htSetup();
    g['breakTile'].call(g, x0 + 6, F - 4);   // 挖【右列】上方锚格 → 整件清除
    res.hangtopRightCol.push({
      sheet: ht.sheet, rightDig: countIn(ht.tid, x0 + 3, x0 + 9, F - 5, F + 1), sideCtrl,
    });
  }

  // ⑲ 九批 B-1：两罐共边（几何同 _blue-pot-adjacency.mjs）。原版 PlacePot（:54529）
  //   净空只查自身 2×2+底行 → 相邻共边罐合法;CheckPot 杀环（:57347-57356）只杀本件
  //   2×2、loot 在 :57490 每件各一次。旧洪泛实现会把 B 并进 A 的收集（B 被清+其
  //   loot 被吞）。帧解码收集：colIdx=(fx/18)%2、rowIdx=(fy/18)%2、style=fy/36。
  {
    const POT = idOfSheet(28);
    const potSetup = () => {
      clearBox();
      row(x0 + 3, F, 8, STONE);            // 共用锚行（PlacePot 底行 SolidTile2 门）
      for (const [cx, v] of [[x0 + 5, 0], [x0 + 7, 36]]) {
        for (let k = 0; k < 2; k++) for (const [ry, fy] of [[F - 2, 0], [F - 1, 18]])
          st.setTileSilent(cx + k, ry, POT, v + k * 18, fy);
      }
    };
    const potCells = (lo, hi) => countIn(POT, x0 + lo, x0 + hi, F - 3, F + 1);
    const proto = Object.getPrototypeOf(g);
    const origLoot = proto.potLoot;
    let lootCalls = 0;
    proto.potLoot = function (...a) { lootCalls++; return origLoot.apply(this, a); };
    try {
      potSetup();
      g['breakTile'].call(g, x0 + 6, F - 1);      // 敲 A 右下格
      const afterA = { a: potCells(5, 6), b: potCells(7, 8), lootCalls };
      g['breakTile'].call(g, x0 + 8, F - 2);      // 再敲 B 右上格
      res.potAdjacency = {
        ...afterA,
        lootCallsTotal: lootCalls,
        bAfterSmash: potCells(7, 8),
      };
    } finally {
      proto.potLoot = origLoot;
    }
  }

  // ⑳ 九批 M-1：387 闭态活板门 2×1 嵌两实心块间（CheckTrapDoor 387 臂 :52059-52063：
  //   完整性 CheckTileFrames :52245 + 左右外格 mode1 StrictSolid :52063;失配杀+
  //   Item.NewItem(3239) :52097-52108）。帧：fx=dx*18（styleX0）、fy=styleY*18=0。
  {
    const TD = idOfSheet(387);
    const tdSetup = () => {
      clearBox();
      row(x0 + 3, F, 8, STONE);
      st.setTileSilent(x0 + 4, F - 1, STONE, 0, 0);   // 左侧支承
      st.setTileSilent(x0 + 7, F - 1, STONE, 0, 0);   // 右侧支承
      st.setTileSilent(x0 + 5, F - 1, TD, 0, 0);
      st.setTileSilent(x0 + 6, F - 1, TD, 18, 0);
    };
    const match387 = () => (g.entities.drops ?? []).filter((d) => !d.dead
      && /vi_3239_|place_v_387_/.test(String(items.ITEM_DEFS[d.itemId]?.key))).map((d) => items.ITEM_DEFS[d.itemId]?.key);
    tdSetup();
    st.setTileSilent(x0 + 7, F - 2, STONE, 0, 0);     // 旁格（非锚,对照）
    g['breakTile'].call(g, x0 + 7, F - 2);
    const sideCtrl = countIn(TD, x0 + 3, x0 + 9, F - 3, F + 1);
    tdSetup();
    // ★掉落计数基线取在 kill 前（tdSetup#2 的 clearBox 拆前件会触发 CheckTrapDoor
    //  掉落——任一格被毁 → 整件判坏+掉 1 份=原版语义 :52090-52108,非双发 bug）
    const preDrops = match387();
    g['breakTile'].call(g, x0 + 4, F - 1);            // 挖左侧支承
    const postDrops = match387();
    res.trapdoor387 = {
      sideCtrl,                                       // 2 格幸存
      residue: countIn(TD, x0 + 3, x0 + 9, F - 3, F + 1),   // 整件清=0
      drop3239: postDrops.length - preDrops.length,   // 恰 1 份（Item.NewItem(3239) 语义）
      preDrops, postDrops,
    };
  }

  // ㉑ 九批 m-4：334 武器架 5000 系标记帧剥离（CheckWeaponsRack :46802-46810 锚格/
  //   :46819-46827 各格剥 5000 系再 %54;标记=PlaceWeapon Player.cs:54795/:54796 写
  //   5000+100+itemType / 10000+prefix）。裸 %54 对 5100+id 恒失配 → 整架误杀丢武器
  //   （:46840 DropItem + Item.NewItem(2699)）。
  {
    const RK = idOfSheet(334);
    const rackSetup = (marked) => {
      clearBox();
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
        st.wall[st.idx(x0 + 4 + dx, F - 3 + dy)] = 1;                  // 背墙 3×3
        st.setTileSilent(x0 + 4 + dx, F - 3 + dy, RK, dx * 18, dy * 18);
      }
      if (marked) {   // 中行（fy=18）左格挂武器、右格前缀
        st.frameX[st.idx(x0 + 4, F - 2)] = 5100 + 123;
        st.frameX[st.idx(x0 + 5, F - 2)] = 10000 + 5;
      }
    };
    rackSetup(true);
    st.setTileSilent(x0 + 3, F - 2, STONE, 0, 0);     // 左侧旁格（非架体）
    g['breakTile'].call(g, x0 + 3, F - 2);
    res.rack334Marked = { residue: countIn(RK, x0 + 2, x0 + 9, F - 5, F + 1) };
    rackSetup(false);
    st.setTileSilent(x0 + 3, F - 2, STONE, 0, 0);
    g['breakTile'].call(g, x0 + 3, F - 2);
    const unmarked = countIn(RK, x0 + 2, x0 + 9, F - 5, F + 1);
    // 清一角墙 → 整架塌（对照）。★清墙位取中行：墙变更监听链 checkFurnitureSupport(x,y-1)
    //  派发【上方一格】——(x0+5,F-2) 的上格 (x0+5,F-3) 是架顶行格（同 ⑯ gemlock 取位）;
    //  若清顶行格的墙,派发落在架上方的空格 → 不派发（探针假红,非引擎债）
    st.setWall(x0 + 5, F - 2, 0);
    res.rack334Ctrl = { unmarked, wallDig: countIn(RK, x0 + 2, x0 + 9, F - 5, F + 1) };
  }

  // —— 2026-09-02 缓修小账（红蓝对抗六项）追加 ——
  // ㉒ tallGate388Drop    ⑤：388 闭态挖顶锚 → 掉原版 vi_3240 恰 1（CheckTallGate
  //                      杀段 :52151-52163 `if (point.Y == 0) type2 = 3240` 两支同值
  //                      =两态恒 3240）,不再掉 place_v_388 面板伪物品
  // ㉓ hangtopPlatBand    m-2：591 吊盆双列平台档——[完好+完好]幸存/[完好+被锤]杀/
  //                      [被锤+被锤]幸存（IsBelowANonHammeredPlatform :38682-38693
  //                      二分档 8/0,混档即杀 :38489-38493;被锤=半砖,仍算有效支撑）
  // ㉔ potFrames          m-3：style0/style1+variant36 罐干净帧邻扰动幸存（CheckPot
  //                      :57307 绝对式不得误杀合法变体/带基帧）+帧混格邻扰动整罐清
  // ㉕ hang2x2Frames      m-3：95 frameX 变体基 36/fy style 基——干净邻扰动幸存/
  //                      帧混格邻扰动整件清（Check2x2 :48824-48831 绝对式）
  // ㉖ trapdoor386Frames  m-3：386 开态 2×2 侧锚在——干净邻扰动幸存/帧混格邻扰动
  //                      整件清（CheckTileFrames :52245-52259 绝对式,386 臂 :52062）
  // ㉗ npcSlotGate        m-1：availableNPCSpawnsUpToSlot 门矩阵（NPC.cs:81459-81479
  //                      等价:数空槽=min(需求,100-活跃)）+100 活跃实体端到端蜂群 0 只
  //                      （Projectile.cs:76645;合成 100 怪不可行 → proto/数组拦截法同 ⑧）

  // ㉒ ⑤：388 闭态掉落翻正
  tgSetup(TALL_C);
  {
    const pre3240 = dropCount(3240);
    g['breakTile'].call(g, x0 + 5, F - 6);   // 闭态顶锚挖 → 整件清 + 掉 3240
    res.tallGate388Drop = {
      residue: countIn(TALL_C, x0 + 3, x0 + 8, F - 7, F + 2),
      drop3240: dropCount(3240) - pre3240,
      noPlaceFallback: !(g.entities.drops ?? []).some((d) => !d.dead
        && String(items.ITEM_DEFS[d.itemId]?.key ?? '').startsWith('place_v_388')),
    };
  }

  // ㉓ m-2：591 吊盆平台档三态（完好/被锤=半砖）
  {
    const PLAT = idOfSheet(19);
    const hpSetup = (hammerL, hammerR) => {
      clearBox();
      row(x0 + 4, F, 4, STONE);            // 地面垫底
      for (let dx = 0; dx < 2; dx++) st.setTileSilent(x0 + 5 + dx, F - 4, PLAT, 0, 0);
      if (hammerL) st.half[st.idx(x0 + 5, F - 4)] = 1;   // 被锤平台（半砖=hammered）
      if (hammerR) st.half[st.idx(x0 + 6, F - 4)] = 1;
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 3; dy++)
        st.setTileSilent(x0 + 5 + dx, F - 3 + dy, idOfSheet(591), 36 + dx * 18, dy * 18);
    };
    const hpDig = () => {   // 旁格扰动触发 3×3 扫（含右列格）
      st.setTileSilent(x0 + 7, F - 3, STONE, 0, 0);
      g['breakTile'].call(g, x0 + 7, F - 3);
      return countIn(idOfSheet(591), x0 + 3, x0 + 9, F - 5, F + 1);
    };
    hpSetup(false, false);
    const platOk = st.get(x0 + 5, F - 4) === PLAT && !!tiles.TILE_DEFS[PLAT]?.platform;
    const bothIntact = hpDig();
    hpSetup(false, true);
    const mixed = hpDig();
    hpSetup(true, true);
    const bothHammered = hpDig();
    res.hangtopPlatBand = { platOk, bothIntact, mixed, bothHammered };
  }

  // ㉔ m-3：罐绝对帧（CheckPot :57307）——干净帧幸存/混格杀
  {
    const POT = idOfSheet(28);
    const potFSetup = (style, variant, corrupt) => {
      clearBox();
      row(x0 + 3, F, 8, STONE);
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++)
        st.setTileSilent(x0 + 5 + dx, F - 2 + dy, POT, variant + dx * 18, dy * 18 + style * 36);
      if (corrupt) st.frameY[st.idx(x0 + 6, F - 1)] = 18;   // 底右格失 style 基（应 54）
    };
    const potAdjDig = () => {   // 邻格扰动触发 3×3 扫（支承行不动）
      st.setTileSilent(x0 + 7, F, STONE, 0, 0);
      g['breakTile'].call(g, x0 + 7, F);
      return countIn(POT, x0 + 3, x0 + 9, F - 4, F + 1);
    };
    potFSetup(0, 0, false);
    const style0Clean = potAdjDig();
    potFSetup(1, 36, false);
    const style1Clean = potAdjDig();
    potFSetup(1, 36, true);
    const style1Mixed = potAdjDig();
    res.potFrames = { style0Clean, style1Clean, style1Mixed };
  }

  // ㉕ m-3：95 吊挂 2×2 绝对帧（Check2x2 :48824-48831）
  {
    const H2 = idOfSheet(95);
    const h2Setup = (corrupt) => {
      clearBox();
      row(x0 + 4, F, 6, STONE);
      row(x0 + 5, F - 3, 2, STONE);        // 顶锚行（两列上方各 1 格）
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++)
        st.setTileSilent(x0 + 5 + dx, F - 2 + dy, H2, 36 + dx * 18, dy * 18 + 36);   // variant1+style1
      if (corrupt) st.frameX[st.idx(x0 + 6, F - 2)] = 18;   // 顶右格失变体基（应 54）
    };
    const h2AdjDig = () => {
      st.setTileSilent(x0 + 7, F - 2, STONE, 0, 0);
      g['breakTile'].call(g, x0 + 7, F - 2);
      return countIn(H2, x0 + 3, x0 + 9, F - 4, F + 1);
    };
    h2Setup(false);
    const h2Clean = h2AdjDig();
    h2Setup(true);
    const h2Mixed = h2AdjDig();
    res.hang2x2Frames = { h2Clean, h2Mixed };
  }

  // ㉖ m-3：386 开态活板门绝对帧（CheckTileFrames :52245-52259,386 臂 :52062）
  {
    const TDO = idOfSheet(386);
    const tdOSetup = (corrupt) => {
      clearBox();
      row(x0 + 3, F, 8, STONE);
      // style0 锚行 = ay+1 = F-2（:52064-52066 CheckTileAnchors(x,y+1,2,1,mode1)）——
      // 左右外格在【底行】两侧（开态活板门贴墙,侧锚=底行外一格 StrictSolid :52290-52294）
      st.setTileSilent(x0 + 4, F - 2, STONE, 0, 0);   // 左侧支承
      st.setTileSilent(x0 + 7, F - 2, STONE, 0, 0);   // 右侧支承
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++)
        st.setTileSilent(x0 + 5 + dx, F - 3 + dy, TDO, dx * 18, dy * 18);
      if (corrupt) st.frameY[st.idx(x0 + 6, F - 3)] = 18;   // 顶右格失基（应 0,给 18=行错）
    };
    const tdOAdjDig = () => {
      st.setTileSilent(x0 + 4, F - 3, STONE, 0, 0);   // 左上旁格（非锚行,非侧支承）
      g['breakTile'].call(g, x0 + 4, F - 3);
      return countIn(TDO, x0 + 3, x0 + 9, F - 5, F + 1);
    };
    tdOSetup(false);
    const tdOClean = tdOAdjDig();
    tdOSetup(true);
    const tdOMixed = tdOAdjDig();
    res.trapdoor386Frames = { tdOClean, tdOMixed };
  }

  // ㉗ m-1：槽位门等价（NPC.cs:81459-81479）——门矩阵 + 100 活跃实体端到端蜂群 0
  {
    const proto = Object.getPrototypeOf(g);
    const gate = (want) => g['availableNPCSpawnsUpToSlot'].call(g, want);
    const realEnemies = g.entities.enemies, realNpcs = g.entities.npcs;
    const fakes = (n) => Array.from({ length: n }, () => ({ dead: false }));
    const withCounts = (en, np, fn) => {
      g.entities.enemies = fakes(en); g.entities.npcs = fakes(np);
      try { return fn(); } finally { g.entities.enemies = realEnemies; g.entities.npcs = realNpcs; }
    };
    // 门矩阵：0 活跃→min(want,100);98 活跃→100-98=2;100/150 活跃→0;dead 不计
    const matrix = {
      want3at0: withCounts(0, 0, () => gate(3)),
      want5at98: withCounts(95, 3, () => gate(5)),
      want3at98withDead: withCounts(90, 8, () => { g.entities.npcs[0].dead = true; return gate(3); }),
      want1at100: withCounts(60, 40, () => gate(1)),
      want1at150: withCounts(150, 0, () => gate(1)),
    };
    // 端到端：100 活跃实体下敲蜂巢 → 蜂群 0 只;对照（真实实体表）> 0 只
    const hiveSetup2 = () => {
      clearBox();
      row(x0 + 4, F, 4, STONE);
      row(x0 + 5, F - 3, 2, STONE);
      buildObj(HIVES, x0 + 5, F - 1, 2, 2);
    };
    const beeCount = () => (g.entities.enemies ?? []).filter((e) => !e.dead
      && (e.vanillaId === 210 || e.vanillaId === 211)).length;
    const preBees0 = beeCount();
    withCounts(60, 40, () => { hiveSetup2(); g['breakTile'].call(g, x0 + 5, F - 3); });
    const beesAtCap = beeCount() - preBees0;
    const preBees1 = beeCount();
    hiveSetup2();
    g['breakTile'].call(g, x0 + 5, F - 3);
    const beesControl = beeCount() - preBees1;
    res.npcSlotGate = { ...matrix, beesAtCap, beesControl };
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
    && res.edgeOutsideWiped.residue === 0
    // —— 八批（幸存链缺口）——
    && res.tgOpenTopDig.residue === 0 && res.tgOpenTopDig.drop3240 > 0
    && res.tgMidDigObject.residue === 0
    && res.tgSideDisturb.residue === 5
    && res.tgClosedToggleDig.opened && res.tgClosedToggleDig.closed
    && res.tgClosedToggleDig.openCount === 5 && res.tgClosedToggleDig.closeCount === 5
    && res.tgClosedToggleDig.residue === 0
    && res.tgLegacyFramesKilled.residue === 0
    && res.glStyleSurvive.residue === 9
    && res.glWallDig.residue === 0 && res.glWallDig.drops === 1
    && res.glFrameMixKilled.residue === 0
    && res.hangtopIdsOk
    && res.hangtopRightCol.every((r) => r.rightDig === 0 && r.sideCtrl === 6)
    // —— 九批（B-1 / M-1 / m-4）——
    && res.potAdjacency.a === 0 && res.potAdjacency.b === 4
    && res.potAdjacency.lootCalls === 1 && res.potAdjacency.lootCallsTotal === 2
    && res.potAdjacency.bAfterSmash === 0
    && res.trapdoor387.sideCtrl === 2 && res.trapdoor387.residue === 0
    && res.trapdoor387.drop3239 === 1
    && res.rack334Marked.residue === 9
    && res.rack334Ctrl.unmarked === 9 && res.rack334Ctrl.wallDig === 0
    // —— 缓修小账（⑤ / m-2 / m-3 / m-1）——
    && res.tallGate388Drop.residue === 0 && res.tallGate388Drop.drop3240 === 1
    && res.tallGate388Drop.noPlaceFallback
    && res.hangtopPlatBand.platOk
    && res.hangtopPlatBand.bothIntact === 6 && res.hangtopPlatBand.mixed === 0
    && res.hangtopPlatBand.bothHammered === 6
    && res.potFrames.style0Clean === 4 && res.potFrames.style1Clean === 4
    && res.potFrames.style1Mixed === 0
    && res.hang2x2Frames.h2Clean === 4 && res.hang2x2Frames.h2Mixed === 0
    && res.trapdoor386Frames.tdOClean === 4 && res.trapdoor386Frames.tdOMixed === 0
    && res.npcSlotGate.want3at0 === 3 && res.npcSlotGate.want5at98 === 2
    && res.npcSlotGate.want3at98withDead === 3
    && res.npcSlotGate.want1at100 === 0 && res.npcSlotGate.want1at150 === 0
    && res.npcSlotGate.beesAtCap === 0 && res.npcSlotGate.beesControl > 0 ? 'PASS' : 'FAIL';
  return res;
});
fs.writeFileSync('/tmp/decor-sweep.json', JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
