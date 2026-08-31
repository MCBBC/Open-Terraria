// 拴绳小动物系统（LeashedEntity）测试——标杆 Terarria1456：
//   Terraria.GameContent/LeashedEntity.cs（Registry.RegisterAll :113-135）
//   Terraria.GameContent.LeashedEntities/*（19 原型 + LeashedKite）
//   Terraria.GameContent.Tile_Entities/TECritterAnchor.cs（static ctor :64-84 全表）
//   Terraria.GameContent.Tile_Entities/TEKiteAnchor.cs / TELeashedEntityAnchorWithItem.cs
//   Terraria/Item.cs DefaultToCapturedCritter(:47613)/DefaultToKite(:47457) 调用点
// 覆盖：原型表全量对账 / 锚定半径运动（walker+flyer+jumper）/ 越界 Recall /
//   破坏消散+掉物 / 读档重生 / 风筝链 / LCG32 位级。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { T } from '../src/data/tiles';
import { vanillaNpc } from '../src/data/vanillaNpcs';
import {
  ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, PLACE_TILE_ON_ALT_USE,
} from '../src/data/items';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  LeashedEntityManager, LCG32Random,
  PROTOTYPES, NPC_FAMILY, prototypeOfNpc, ITEM_MAKE_NPC, KITE_ITEM_PROJ,
  IS_GOLD_CRITTER, solidTile2, anchorStyleOfItem,
  inAPlaceWithWind, leashedBubbleVisible, KITE_TRAIL_LENGTH,
  solidTileAllowTopSlope, solidTileAllowBottomSlope, solidTileNoPlatforms,
  solidTileAllowPlatformTopFrame, platformProperTopFrame,
  flyerIsBlockedByMedium, isFlyerLiquidBoundary, bubbleScaleTier,
  type LeashedEnv, type LeashedFamily, type LeashedDust,
} from '../src/entities/LeashedCritter';

// 内部 item id → 原版 vid 反查（记录重生链用）
import { ITEM_DEFS } from '../src/data/items';
const defOf = (vid: number) => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  return key !== undefined ? ITEM_DEFS[ITEM_BY_KEY[key]] : undefined;
};
const vidOfInternal = (internalId: number): number => {
  const key = ITEM_DEFS[internalId]?.key;
  const m = /^vi_(\d+)_/.exec(key ?? '');
  return m ? Number(m[1]) : -1;
};

// ----------------------------------------------------------------------------
// 测试环境
// ----------------------------------------------------------------------------

function mkEnv(over: Partial<LeashedEnv> = {}): LeashedEnv {
  return {
    timeForVisualEffects: 0,
    dayTime: true,
    worldSurface: 100,
    windForVisuals: 0.5,
    cloudAlpha: 0,
    playerCx: -99999,
    playerCy: -99999,
    addLight: () => { },
    ...over,
  };
}

/** W×H 世界：groundY 行及以下全实心（ Dirt），上方空气 */
function groundWorld(w = 120, h = 80, groundY = 40): TileStore {
  const st = new TileStore(w, h);
  for (let x = 0; x < w; x++) {
    for (let y = groundY; y < h; y++) st.setTile(x, y, T.DIRT);
  }
  return st;
}

function mkManager(st: TileStore): LeashedEntityManager {
  const m = new LeashedEntityManager();
  m.attach({ store: st });
  return m;
}

/** 推进 n tick（玩家位放锚桩旁，避开距离门） */
function runTicks(m: LeashedEntityManager, st: TileStore, n: number, cx: number, cy: number, env?: LeashedEnv) {
  for (let i = 0; i < n; i++) m.update({ store: st }, env ?? mkEnv(), cx, cy);
}

// ----------------------------------------------------------------------------
// ① 原型注册表全量对账
// ----------------------------------------------------------------------------

/** TECritterAnchor.cs:64-85 覆写表按注册序的**最终态**（661/653 被后行覆盖；
 *  ★1457：361/445/148/149 → AquaticWalker、616/617 → Turtle） */
const EXPECT_NPC_FAMILY: ReadonlyArray<readonly [LeashedFamily, readonly number[]]> = [
  ['flyer', [444]],
  ['normalButterfly', [356]],
  ['empressButterfly', [661]],
  ['hellButterfly', [653]],
  ['firefly', [355, 358, 654]],
  ['shimmerFly', [677]],
  ['dragonfly', [595, 596, 601, 597, 598, 599, 600]],
  ['crawlingFly', [604, 605, 669]],
  ['fairy', [583, 584, 585]],
  ['aquaticWalker', [361, 445, 148, 149]],
  ['crawler', [357, 448, 484, 485, 486, 487, 606]],
  ['snail', [359, 360, 655]],
  ['turtle', [616, 617]],
  ['runner', [300, 447, 610]],
  ['bird', [74, 297, 298, 442, 611, 671, 672, 673, 675, 674]],
  ['waterfowl', [362, 364, 602, 608]],
  ['fish', [55, 592, 607, 626, 627, 688]],
  ['jumper', [377, 446]],
  ['waterStrider', [612, 613]],
];

describe('拴绳小动物：原型注册表（TECritterAnchor.cs:64-85）', () => {
  it('覆写表逐族命中（缺省 walker），与 NPC_FAMILY 一致', () => {
    for (const [family, ids] of EXPECT_NPC_FAMILY) {
      for (const id of ids) {
        expect(NPC_FAMILY.get(id), `npc ${id}`).toBe(family);
        expect(prototypeOfNpc(id).family, `npc ${id}`).toBe(family);
      }
    }
    // 缺省 = Walker（CreateCustomSet(WalkerLeashedCritter)）
    for (const id of [46, 299, 366, 367, 374, 443, 538, 539, 614, 639]) {
      expect(prototypeOfNpc(id).family, `npc ${id} 应缺省 walker`).toBe('walker');
    }
  });

  it('ITEM_MAKE_NPC 全量 93 条 = createTile=724 物品集（DefaultToCapturedCritter 全调用点）', () => {
    expect(Object.keys(ITEM_MAKE_NPC)).toHaveLength(93);
    for (const [vid, npc] of Object.entries(ITEM_MAKE_NPC)) {
      expect(PLACE_TILE_ON_ALT_USE.has(Number(vid)), `item ${vid} 应在 PlaceTileOnAltUse`).toBe(true);
      // 物品链：93 件全部落 v_724_critter_anchor（items.ts CRITTER_ANCHOR_ITEMS）
      expect(defOf(Number(vid))!.tile, `item ${vid}`).toBe('v_724_critter_anchor');
      // NPC 数据可解析（渲染帧数/尺寸来源）
      expect(vanillaNpc(npc), `npc ${npc}（item ${vid}）缺 vanillaNpc 数据`).not.toBeNull();
    }
    // 抽查 makeNPC（Item.cs case 直赋）
    expect(ITEM_MAKE_NPC[261]).toBe(55);      // 金鱼 :4450
    expect(ITEM_MAKE_NPC[2019]).toBe(46);     // 兔 :21423
    expect(ITEM_MAKE_NPC[1338]).toBe(614);    // 爆炸兔 :16549
    expect(ITEM_MAKE_NPC[4845]).toBe(653);    // 地狱蝶 :39544
    expect(ITEM_MAKE_NPC[4961]).toBe(661);    // 帝皇蝶 :40029
    expect(ITEM_MAKE_NPC[1994]).toBe(356);    // 蝴蝶八色 :21300
    expect(ITEM_MAKE_NPC[2001]).toBe(356);
    expect(ITEM_MAKE_NPC[4831]).toBe(639);    // 宝石松鼠 :39524
    expect(ITEM_MAKE_NPC[4844]).toBe(652);    // 宝石兔 :39535
    expect(ITEM_MAKE_NPC[2889]).toBe(442);    // 金系 :27378
    expect(ITEM_MAKE_NPC[2895]).toBe(448);
  });

  it('放置帧档 anchorStyleOfItem 全量对账（Player.cs:42771-42773 覆写 previewPlaceStyle）', () => {
    for (const [vid, npc] of Object.entries(ITEM_MAKE_NPC)) {
      const want = prototypeOfNpc(npc).anchorStyle;
      expect(anchorStyleOfItem(Number(vid)), `item ${vid} 放置帧档`).toBe(want);
      // 蝶族例外：物品自身 placeStyle = 物种变体 1-8（Item.cs:21303），非桩档
      if (Number(vid) >= 1994 && Number(vid) <= 2001) {
        expect(defOf(Number(vid))!.placeStyle).toBe(1 + Number(vid) - 1994);
      } else {
        // 其余 85 件：物品 placeStyle 等值承载桩档（通用 framedCellFrame 路径同帧）
        expect(defOf(Number(vid))!.placeStyle ?? 0, `item ${vid} placeStyle`).toBe(want);
      }
    }
    // 族档抽查：Crawler/Runner/Snail=1、Bird/Waterfowl=2、Fish=3、Flyer 族=4、其余 0
    expect(PROTOTYPES.crawler.anchorStyle).toBe(1);
    expect(PROTOTYPES.runner.anchorStyle).toBe(1);
    expect(PROTOTYPES.snail.anchorStyle).toBe(1); // Snail : Crawler（anchorStyle 继承）
    expect(PROTOTYPES.bird.anchorStyle).toBe(2);
    expect(PROTOTYPES.waterfowl.anchorStyle).toBe(2); // Waterfowl : Bird
    expect(PROTOTYPES.fish.anchorStyle).toBe(3);
    expect(PROTOTYPES.flyer.anchorStyle).toBe(4);
    expect(PROTOTYPES.walker.anchorStyle).toBe(0);
    expect(PROTOTYPES.jumper.anchorStyle).toBe(0);
    expect(PROTOTYPES.waterStrider.anchorStyle).toBe(0);
    // 蝶族物品的**放置**帧档恒 4（与物种 placeStyle 1-8 解耦）
    expect(anchorStyleOfItem(1994)).toBe(4);
    expect(anchorStyleOfItem(2001)).toBe(4);
  });

  it('★1457 21 原型全在（Registry.RegisterAll :118-142 注册序）', () => {
    expect(Object.keys(PROTOTYPES)).toHaveLength(20); // 20 LeashedCritter 族（kite 独立类）
    // 引擎归属：walker 系 6 族（+aquaticWalker/turtle）/ flyer 系 12 族 / jumper 系 2 族
    const engines: Record<string, number> = { walker: 0, flyer: 0, jumper: 0 };
    for (const p of Object.values(PROTOTYPES)) engines[p.move]++;
    expect(engines).toEqual({ walker: 6, flyer: 12, jumper: 2 });
  });

  it('风筝族 24 件 → projType（DefaultToKite 调用点）+ tile 723 物品链', () => {
    expect(Object.keys(KITE_ITEM_PROJ)).toHaveLength(24);
    for (const [vid, proj] of Object.entries(KITE_ITEM_PROJ)) {
      expect(PLACE_TILE_ON_ALT_USE.has(Number(vid)), `风筝 ${vid}`).toBe(true);
      expect(defOf(Number(vid))!.tile, `风筝 ${vid}`).toBe('v_723_kite_anchor');
      expect(proj).toBeGreaterThan(0);
    }
    expect(KITE_ITEM_PROJ[4367]).toBe(766);  // :37220
    expect(KITE_ITEM_PROJ[4371]).toBe(770);
    expect(KITE_ITEM_PROJ[4379]).toBe(771);  // :37258
    expect(KITE_ITEM_PROJ[4648]).toBe(827);  // :38339
    expect(KITE_ITEM_PROJ[4651]).toBe(830);
    expect(KITE_ITEM_PROJ[4684]).toBe(853);  // :38543
  });

  it('PlaceTileOnAltUse = 93 锚桩 + 24 风筝（ItemID.cs:155 原文 117 id）', () => {
    expect(PLACE_TILE_ON_ALT_USE.size).toBe(117);
    for (const vid of Object.keys(ITEM_MAKE_NPC)) expect(PLACE_TILE_ON_ALT_USE.has(Number(vid))).toBe(true);
    for (const vid of Object.keys(KITE_ITEM_PROJ)) expect(PLACE_TILE_ON_ALT_USE.has(Number(vid))).toBe(true);
  });

  it('金系表（NPCID.cs:4456）与原型特效旗一致', () => {
    expect(IS_GOLD_CRITTER.has(442)).toBe(true);
    expect(IS_GOLD_CRITTER.has(539)).toBe(true);
    expect(IS_GOLD_CRITTER.has(627)).toBe(true);
    expect(IS_GOLD_CRITTER.has(46)).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// ② LCG32Random 位级（LCG32Random.cs 1:1）
// ----------------------------------------------------------------------------

describe('LCG32Random（Terraria.Utilities/LCG32Random.cs）', () => {
  it('Advance = state * -1856014347 + 1（uint32 回绕）', () => {
    const r = new LCG32Random(1);
    r.advance();
    // 1 * (-1856014347) + 1 = -1856014346 → uint32 = 4294967296 - 1856014346
    expect(r.state).toBe((Math.imul(1, -1856014347) + 1) >>> 0);
    expect(r.state).toBe(2438952950);
  });
  it('Next(max) = state*max >> 32（首值按公式手算钉死）', () => {
    const r = new LCG32Random(1);
    const v = r.next(100); // 首 draw：advance 后 state=2438952950
    expect(v).toBe(Math.floor((2438952950 * 100) / 4294967296));
    expect(v).toBe(56);
  });
  it('Next(min,max) 区间内', () => {
    const r = new LCG32Random(12345);
    for (let i = 0; i < 200; i++) {
      const v = r.range(60, 61);
      expect(v).toBe(60); // Next(60,61) 恒 60（Walker waitTime 同款）
    }
    for (let i = 0; i < 200; i++) {
      const v = r.range(30, 180);
      expect(v).toBeGreaterThanOrEqual(30);
      expect(v).toBeLessThan(180);
    }
  });
});

// ----------------------------------------------------------------------------
// ③ 锚定半径运动
// ----------------------------------------------------------------------------

describe('拴绳小动物：walker 引擎（WalkerLeashedCritter.cs）', () => {
  it('兔兔在锚桩 ±3 格内游走且不沉入地面', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 39, 2019, { seed: 42 }); // 2019 兔（walker）
    expect(e).not.toBeNull();
    const anchorCx = 60 * 16 + 8;
    runTicks(m, st, 900, anchorCx, 39 * 16 + 8);
    const lim = (PROTOTYPES.walker.straying + 1) * 16 + 8;
    expect(Math.abs(e!.cx - anchorCx)).toBeLessThanOrEqual(lim);
    // 贴地：中心不低于地面顶（groundY=40 → 地表格中心 40*16+8；兔 h=20 → 中心 ≤ 地面顶）
    expect(e!.cy).toBeLessThanOrEqual(40 * 16 + 8);
    // 真的在动（游走过）
    expect(Math.abs(e!.vx) + Math.abs(e!.cy - (39 * 16 + 8))).toBeGreaterThan(0);
  });

  it('walker 参数表：Crawler 0.4 / Runner 1.5 / Walker 0.8（各族 ctor）', () => {
    expect(PROTOTYPES.walker.walkingPace).toBe(0.8);
    expect(PROTOTYPES.crawler.walkingPace).toBe(0.4);
    expect(PROTOTYPES.runner.walkingPace).toBe(1.5);
    // 蜗牛 = Crawler 子类（SnailLeashedCritter : CrawlerLeashedCritter）
    expect(PROTOTYPES.snail.walkingPace).toBe(0.4);
    expect(PROTOTYPES.snail.snailFx).toBe(true);
  });

  it('AdvanceTarget 台阶决策：1 格台阶可上（:36-73）', () => {
    const st = groundWorld(120, 80, 40);
    // 60,39 站台面；60 列右侧 (61,39) 放一块 → 上台阶
    st.setTile(61, 39, T.DIRT);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 38, 2003, { seed: 7 }); // 2003 鼠（runner）
    // 直接调内部等价：把 target 推到台阶前，验证引擎推进后能登上 39 行
    e!.direction = 1;
    e!.state = 2; // State_Walking
    e!.tx = 60; e!.ty = 39;
    e!.cx = 60 * 16 + 8; e!.cy = 39 * 16 + 8;
    runTicks(m, st, 400, e!.cx, e!.cy);
    // 最终站上 61,39 台阶（或在其上回走），中心应在 39 行面附近
    expect(e!.cy).toBeLessThanOrEqual(40 * 16 + 8);
    expect(Math.abs(e!.cx - (60 * 16 + 8))).toBeLessThanOrEqual(4 * 16 + 8);
  });
});

describe('拴绳小动物：flyer 引擎（FlyerLeashedCritter.cs）', () => {
  it('目标点采样恒在锚桩 ±straying 方框内（PickNewTarget :55-66）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    for (let s = 0; s < 40; s++) {
      const e = m.spawnCritter(60, 30, 1994, { seed: s }); // 蝴蝶（flyer 系）
      const range = PROTOTYPES.normalButterfly.straying;
      expect(e!.tx).toBeGreaterThanOrEqual(60 - range);
      expect(e!.tx).toBeLessThanOrEqual(60 + range);
      expect(e!.ty).toBeGreaterThanOrEqual(30 - range);
      expect(e!.ty).toBeLessThanOrEqual(30); // Y 采样 = anchorY + rand(-range, 1) → ≤ anchorY
    }
    m.clear();
  });

  it('蜻蜓巡飞不越界且不穿地（dragonfly 参数表 :9-17）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 30, 4334, { seed: 11 }); // 4334 → npc 595（dragonfly）
    expect(e!.npcType).toBe(595);
    expect(e!.proto.maxFlySpeed).toBe(2.5);
    expect(e!.proto.minWaitTime).toBe(10);
    runTicks(m, st, 1200, 60 * 16 + 8, 30 * 16 + 8);
    const range = PROTOTYPES.dragonfly.straying;
    expect(Math.abs(e!.cx - (60 * 16 + 8))).toBeLessThanOrEqual((range + 1) * 16 + 8);
    // 不穿地：中心在地面顶之上
    expect(e!.cy).toBeLessThanOrEqual(40 * 16 + 8 + 1);
  });

  it('Fly 族随机缩放 0.75-1.11（FlyLeashedCritter.cs:9-13）+ CrawlingFly 0.7-0.9', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    for (let s = 0; s < 30; s++) {
      const b = m.spawnCritter(60, 30, 1994, { seed: s });
      expect(b!.scale).toBeGreaterThanOrEqual(0.75);
      expect(b!.scale).toBeLessThanOrEqual(1.11);
      const f = m.spawnCritter(70, 30, 4361, { seed: s }); // 瓢虫（crawlingFly）
      expect(f!.scale).toBeGreaterThanOrEqual(0.7);
      expect(f!.scale).toBeLessThanOrEqual(0.9);
    }
    m.clear();
  });

  it('NormalButterfly variant = placeStyle（1994-2001 → 1-8）且帧窗 ≤ 24', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 30, 2001, { seed: 3 }); // 第 8 色蝴蝶
    expect(e!.variant).toBe(8);
    runTicks(m, st, 300, 60 * 16 + 8, 30 * 16 + 8);
    expect(e!.frame).toBeLessThan(24); // 表 24 帧 = 8 物种 × 3
    expect(e!.frame).toBeGreaterThanOrEqual(21); // 第 8 物种窗口 21-23
  });

  it('Waterfowl vy!=0 画泳姿表（type+1，WaterfowlLeashedCritter.cs:16-21）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 30, 2122, { seed: 5 }); // 2122 鸭（waterfowl）
    expect(e!.npcType).toBe(362);
    e!.vy = 0.0001;
    expect(e!.drawNpcType).toBe(363);
    e!.vy = 0;
    expect(e!.drawNpcType).toBe(362);
  });

  it('Firefly 明灭：昼地表不亮（FireflyLeashedCritter.cs:44-58）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 20, 1992, { seed: 9 }); // 萤火虫（npc 355）
    expect(e!.proto.fireflyGlow).toBe(true);
    // 白天地表（worldSurface=100，y=20 在地表上）→ 灯不亮
    e!.lightOn = false;
    e!.fireflyTimer = 0;
    m.update({ store: st }, mkEnv({ dayTime: true, worldSurface: 100 }), e!.cx, e!.cy);
    expect(e!.lightOn).toBe(false);
    // 夜晚 → 允许点亮
    e!.fireflyTimer = 0;
    m.update({ store: st }, mkEnv({ dayTime: false }), e!.cx, e!.cy);
    expect(e!.lightOn).toBe(true);
  });

  it('EmpressButterfly 玩家 >300px 渐隐（fadeAmount 0-50，:25-46）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 30, 4961, { seed: 2 }); // 帝皇蝶（npc 661）
    expect(e!.proto.family).toBe('empressButterfly');
    const far = mkEnv({ playerCx: 60 * 16 + 8 + 500, playerCy: 30 * 16 + 8 });
    for (let i = 0; i < 60; i++) m.update({ store: st }, far, e!.cx, e!.cy);
    expect(e!.fadeAmount).toBe(50);
    // GetLerpValue(60, 25, 50)（Utils.cs:283-310 反向段）= (50-60)/(25-60) ≈ 0.286——
    // fadeAmount 钳 50，帝皇蝶永不全隐（原版语义，勿"修"成 0）
    expect(e!.opacity).toBeCloseTo(10 / 35, 5);
    const near = mkEnv({ playerCx: e!.cx, playerCy: e!.cy });
    for (let i = 0; i < 60; i++) m.update({ store: st }, near, e!.cx, e!.cy);
    expect(e!.fadeAmount).toBe(0);
    expect(e!.opacity).toBe(1);
  });

  it('Fairy/Snail/HellButterfly 点光直推 env.addLight（tile 坐标）', () => {
    const st = groundWorld(120, 80, 40);
    const lights: Array<[number, number, number, number, number]> = [];
    const env = mkEnv({ addLight: (i, j, r, g, b) => lights.push([i, j, r, g, b]) });
    const m = mkManager(st);
    const fairy = m.spawnCritter(60, 30, 4068, { seed: 4 }); // 粉妖精（npc 583）
    m.update({ store: st }, env, fairy!.cx, fairy!.cy);
    expect(lights.some((l) => l[0] === Math.floor(fairy!.cx / 16))).toBe(true);
    m.clear();
    lights.length = 0;
    const snail = m.spawnCritter(60, 30, 2007, { seed: 4 }); // 发光蜗牛（npc 360）
    m.update({ store: st }, env, snail!.cx, snail!.cy);
    expect(lights.length).toBeGreaterThan(0);
    expect(lights[0][3]).toBeCloseTo(0.2, 5); // 360 → (0.1, 0.2, 0.7)
  });

  it('Fish isAquatic + Bird/Waterfowl/Flyer 采样框差异（各族 ctor）', () => {
    expect(PROTOTYPES.fish.isAquatic).toBe(true);
    expect(PROTOTYPES.fish.maxFlySpeed).toBe(0.5);
    expect(PROTOTYPES.bird.minWaitTime).toBe(120);
    expect(PROTOTYPES.bird.maxWaitTime).toBe(420);
    expect(PROTOTYPES.bird.hoverAmplitude).toBe(3);
    expect(PROTOTYPES.bird.hoverPeriod).toBe(0.005);
    expect(PROTOTYPES.waterfowl.hasGroundBias).toBe(true);
    expect(PROTOTYPES.crawlingFly.hasGroundBias).toBe(true);
    expect(PROTOTYPES.fairy.brakeDuration).toBe(30);
    expect(PROTOTYPES.fairy.acceleration).toBe(0.05);
  });
});

describe('拴绳小动物：jumper 引擎（JumperLeashedCritter.cs）', () => {
  it('蚱蜢弹跳限定在 straying 12 格内', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 39, 2740, { seed: 21 }); // 2740 蚱蜢（npc 377）
    expect(e!.npcType).toBe(377);
    runTicks(m, st, 3000, 60 * 16 + 8, 39 * 16 + 8);
    const lim = (PROTOTYPES.jumper.straying + 1) * 16 + 8;
    expect(Math.abs(e!.cx - (60 * 16 + 8))).toBeLessThanOrEqual(lim);
    expect(e!.cy).toBeLessThanOrEqual(40 * 16 + 8);
  });

  it('水黾参数表（WaterStriderLeashedCritter.cs:11-25）+ 站水面', () => {
    const p = PROTOTYPES.waterStrider;
    expect(p.straying).toBe(5);
    expect(p.minWaitTime).toBe(60);
    expect(p.maxWaitTime).toBe(120);
    expect(p.maxJumpWidth).toBe(32);
    expect(p.minJumpWidth).toBe(8);
    expect(p.maxJumpHeight).toBe(0);
    expect(p.canStandOnWater).toBe(true);
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 39, 4418, { seed: 6 }); // 水黾（npc 612）
    expect(e!.npcType).toBe(612);
    runTicks(m, st, 2000, 60 * 16 + 8, 39 * 16 + 8);
    expect(Math.abs(e!.cx - (60 * 16 + 8))).toBeLessThanOrEqual(6 * 16 + 8);
  });
});

describe('拴绳小动物：越界 Recall（LeashedCritter.cs:115-134）', () => {
  it('walker 悬空下坠超 straying → 拉回锚桩上方（State_Recalling）', () => {
    const st = new TileStore(120, 80); // 全空世界
    const m = mkManager(st);
    const e = m.spawnCritter(60, 30, 2019, { seed: 13 });
    runTicks(m, st, 400, 60 * 16 + 8, 30 * 16 + 8);
    // Recall 循环：位置不会跌出锚桩下方 straying+缓冲
    expect(e!.cy).toBeLessThanOrEqual((30 + PROTOTYPES.walker.straying + 3) * 16);
    expect(Math.abs(e!.cx - (60 * 16 + 8))).toBeLessThanOrEqual(16);
  });
});

// ----------------------------------------------------------------------------
// ④ 破坏消散 + 掉物 + 读档重生
// ----------------------------------------------------------------------------

describe('拴绳小动物：生命周期（TELeashedEntityAnchor）', () => {
  it('spawn → removeAt 消散（OnRemoved → DespawnLeashedEntity :16-21）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    m.spawnCritter(60, 39, 2019, { seed: 1 });
    m.spawnCritter(70, 39, 1994, { seed: 2 });
    expect(m.critters).toHaveLength(2);
    expect(m.removeAt(60, 39)).toBe(true);
    expect(m.critters.map((e) => e.ax)).toEqual([70]);
    expect(m.removeAt(60, 39)).toBe(false); // 二次消散无实体
  });

  it('破坏掉物链：记录取物清槽（DropItemForTileBreak :26-40）', async () => {
    const { leashedAnchorPlace, leashedAnchorBreakDrop } = await import('../src/world/FurnitureItems');
    const recs: Parameters<typeof leashedAnchorPlace>[0] = [];
    const bunny = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2019]!];
    leashedAnchorPlace(recs, 'critter_anchor', 10, 20, { id: bunny, stack: 3 });
    const dropped = leashedAnchorBreakDrop(recs, 'critter_anchor', 10, 20);
    expect(dropped?.id).toBe(bunny);
    expect(leashedAnchorBreakDrop(recs, 'critter_anchor', 10, 20)).toBeNull();
    // 风筝桩同构（TEKiteAnchor 同基类）
    const kite = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[4367]!];
    leashedAnchorPlace(recs, 'kite_anchor', 12, 20, { id: kite, stack: 1 });
    expect(leashedAnchorBreakDrop(recs, 'kite_anchor', 12, 20)?.id).toBe(kite);
  });

  it('读档重生（OnWorldLoaded → RespawnLeashedEntity :35-40）：实体不落盘，从记录重建', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const bunny = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2019]!];
    const kite = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[4379]!];
    m.respawnAll([
      { x: 50, y: 39, kind: 'critter_anchor', slots: [{ id: bunny }] },
      { x: 55, y: 39, kind: 'kite_anchor', slots: [{ id: kite }] },
      { x: 60, y: 39, kind: 'critter_anchor', slots: [null] }, // 空桩不生实体
    ], vidOfInternal, mkEnv());
    expect(m.critters).toHaveLength(1);
    expect(m.critters[0].npcType).toBe(46);
    expect(m.critters[0].ax).toBe(50);
    expect(m.kites).toHaveLength(1);
    expect(m.kites[0].projType).toBe(771); // 4379 → 771
  });

  it('respawnAll 先清后建（换图防双挂载）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    m.spawnCritter(60, 39, 2019, { seed: 1 });
    const bunny = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2019]!];
    m.respawnAll([{ x: 60, y: 39, kind: 'critter_anchor', slots: [{ id: bunny }] }], vidOfInternal, mkEnv());
    expect(m.critters).toHaveLength(1);
  });
});

// ----------------------------------------------------------------------------
// ⑤ 风筝链（LeashedKite + TEKiteAnchor）
// ----------------------------------------------------------------------------

describe('拴绳风筝（LeashedKite.cs + Projectile.KiteLogic :45809-46036）', () => {
  it('放置 → 风筝实体带正确 projType（4×4 判定盒，Projectile.DefaultToKite :10133-10140）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const k = m.spawnKite(60, 39, KITE_ITEM_PROJ[4367], mkEnv({ windForVisuals: 0.5 }));
    expect(k.projType).toBe(766);
    expect(k.w).toBe(4);
    expect(k.h).toBe(4);
    // Spawn 后第一帧未跑快进（newlyAdded=true）→ 线长仍初值 250
    expect(k.kiteDistance).toBe(250);
    expect(k.windCurrent).toBe(0.5);           // Spawn 尾段覆写（LeashedKite.cs:237）
  });

  it('收放线输入模型：owner=255 恒定——channel −5 / controlUseItem +5 块（:45816-45837）不走', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    // |windForVisuals|=5 → windCurrent=0.25 ≥ 0.2 门 → 有风档（线长恒 250，无收放）
    const k = m.spawnKite(60, 20, 766, mkEnv({ windForVisuals: 5 }));
    runTicks(m, st, 900, 60 * 16 + 8, 20 * 16 + 8, mkEnv({ windForVisuals: 5 }));
    expect(k.timeWithoutWind).toBe(0);
    expect(k.kiteDistance).toBe(250);          // 既不被收到 4 也不放到 500
  });

  it('常风（0.5）：windCurrent=0.05×wind < 0.2 门 → 下垂档，线长衰减收敛 48（:149-160）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const k = m.spawnKite(60, 20, 766, mkEnv({ windForVisuals: 0.5 }));
    runTicks(m, st, 500, 60 * 16 + 8, 20 * 16 + 8, mkEnv({ windForVisuals: 0.5 }));
    expect(k.windCurrent).toBeCloseTo(0.025, 6);   // Lerp(0, 0.5, 0.05)
    expect(k.timeWithoutWind).toBeGreaterThan(0);
    expect(k.kiteDistance).toBeLessThan(250);
    // 无风档跑满 420t → 48 下限（Utils.Remap(120,420,250,48)）
    runTicks(m, st, 3000, 60 * 16 + 8, 20 * 16 + 8, mkEnv({ windForVisuals: 0 }));
    expect(k.kiteDistance).toBeCloseTo(48, 5);
    // 下垂累积 localAI[0]（无升力档每 tick +1 钳 300，:45871）
    expect(k.projectileLocalAI0).toBe(300);
    // localAI[1]（:45968）随绷紧态 flag5 摆动（下垂 +0.005 / 绷紧 −0.005）——无单调靶值，
    // 只验界内（原版 Clamp(0,1)）
    expect(k.projectileLocalAI1).toBeGreaterThanOrEqual(0);
    expect(k.projectileLocalAI1).toBeLessThanOrEqual(1);
  });

  it('快进路径（section 激活 → Spawn(false)）：windTarget 直取 → 有风档直达 + 拖尾吸附', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const k = m.spawnKite(60, 20, 766, mkEnv({ windForVisuals: 0.5 }));
    k.cx += 40; k.cy += 40;                     // 模拟残位
    k.update(st, mkEnv({ windForVisuals: 0.5 }), true);   // fastForward
    // :152 快进档 windCurrent = windTarget（不走 5% 衰减）→ 0.5 ≥ 0.2 门 → 有风
    expect(k.windCurrent).toBe(0.5);
    expect(k.timeWithoutWind).toBe(0);
    expect(k.kiteDistance).toBe(250);
    expect(k.timeCounter).toBe(6);              // :189 快进后跳 6（拖尾相位直达成体态）
    for (let i = 0; i < k.oldPos.length; i++) {
      expect(k.oldPos[i].x).toBeCloseTo(k.cx, 5);         // :206-211 整条吸附
      expect(k.oldPos[i].y).toBeCloseTo(k.cy, 5);
    }
  });

  it('快进路径无风档：timeWithoutWind=3600 → 线长直达 48 + 锁下垂（:200-205）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const k = m.spawnKite(60, 20, 766, mkEnv({ windForVisuals: 0 }));
    k.update(st, mkEnv({ windForVisuals: 0 }), true);
    expect(k.timeWithoutWind).toBe(3600);
    expect(k.kiteDistance).toBeCloseTo(48, 5);
    expect(k.rotation).toBe(0);                 // info.WindInWorld==0 → rotation=0
    expect(k.projectileLocalAI0).toBe(300);     // localAI[0]=300（FixFirstTimeAppearance 同语义）
    expect(k.projectileLocalAI1).toBe(1);       // localAI[1]=1
  });

  it('强风升空：线张力把风筝约束在 kiteDistance 内（:45910-45945 flag2 回拽）', () => {
    const st = groundWorld(200, 120, 100);
    const m = mkManager(st);
    const k = m.spawnKite(100, 60, 766, mkEnv({ windForVisuals: 5 }));
    runTicks(m, st, 1200, 100 * 16 + 8, 60 * 16 + 8, mkEnv({ windForVisuals: 5 }));
    const d = Math.hypot(k.cx - (100 * 16 + 8), k.cy - (60 * 16 + 8));
    // 线长 250 + 回拽加速度的小越冲余量
    expect(d).toBeLessThan(250 + 40);
    expect(d).toBeGreaterThan(50);              // 真飞起来了（非锚桩贴脸下垂）
    expect(k.spriteDirection).toBe(1);          // 风向右侧（MoveKite :173-176）
  });

  it('帧表（:45969-46034）：771 恒帧 0 / 828 慢速帧 1 / 766-770 速度四档', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const k771 = m.spawnKite(60, 20, 771, mkEnv({ windForVisuals: 0 }));
    k771.vx = 3; k771.vy = 0;
    k771['selectFrame'](0.3);
    expect(k771.frame).toBe(0);                 // case 771：恒 0
    const k828 = m.spawnKite(70, 20, 828, mkEnv({ windForVisuals: 0 }));
    k828.vx = 0.5; k828.vy = 0;
    k828['selectFrame'](0.3);
    expect(k828.frame).toBe(1);                 // speed<6 → 帧 1
    k828.vx = 8;
    k828['selectFrame'](0.3);
    expect(k828.frame).toBe(0);                 // speed≥6 → 帧 0
    const k766 = m.spawnKite(80, 20, 766, mkEnv({ windForVisuals: 0 }));
    for (const [sp, want] of [[0, 0], [3.5, 1], [5.5, 2], [8, 3]] as const) {
      k766.vx = sp; k766.vy = 0;
      k766['selectFrame'](0.3);
      expect(k766.frame, `speed ${sp}`).toBe(want);
    }
  });

  it('拖尾：TrailCacheLength 逐型（ProjectileID.cs:293）+ 位移超 16px 整条吸附（:135-143）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const k = m.spawnKite(60, 20, 827, mkEnv({ windForVisuals: 0 }));
    expect(k.oldPos).toHaveLength(KITE_TRAIL_LENGTH[827]);   // 65
    expect(KITE_TRAIL_LENGTH[766]).toBe(60);
    expect(KITE_TRAIL_LENGTH[771]).toBe(80);
    k.cx += 20;                                  // 单帧 >16px → 吸附
    k.update(st, mkEnv({ windForVisuals: 0 }), false);
    for (let i = 0; i < k.oldPos.length; i++) {
      expect(k.oldPos[i].x).toBeCloseTo(k.cx, 5);           // 全条吸附（非逐帧位移）
    }
    // 平稳帧：Utils.Shift 右移一格，[0] = 帧首当前位（:215-220——记录在 KiteLogic 之前）
    const p0x = k.cx, p0y = k.cy;
    k.update(st, mkEnv({ windForVisuals: 0 }), false);
    expect(k.oldPos[0].x).toBeCloseTo(p0x, 5);
    expect(k.oldPos[0].y).toBeCloseTo(p0y, 5);
    const p1x = k.cx, p1y = k.cy;
    k.update(st, mkEnv({ windForVisuals: 0 }), false);
    expect(k.oldPos[0].x).toBeCloseTo(p1x, 5);              // 本帧帧首
    expect(k.oldPos[0].y).toBeCloseTo(p1y, 5);
    expect(k.oldPos[1].x).toBeCloseTo(p0x, 5);              // 上上帧 [0] 右移两格而来
    expect(k.oldPos[1].y).toBeCloseTo(p0y, 5);
  });

  it('拉绳碰撞回拉：嵌实心 → Bottom 朝锚点 2px/t 回移（LeashedKite.cs:223-227）', () => {
    const st = new TileStore(120, 120);         // 全空世界
    for (let x = 60; x < 66; x++) for (let y = 30; y < 36; y++) st.setTile(x, y, T.DIRT);
    const m = mkManager(st);
    const k = m.spawnKite(60, 30, 766, mkEnv({ windForVisuals: 0 }));
    k.cx = 62 * 16 + 8; k.cy = 33 * 16 + 8;     // 塞进实心块
    const startY = k.cy;
    k.update(st, mkEnv({ windForVisuals: 0 }), false);
    // 每帧最多朝锚点 2px（MoveTowards 语义），不会瞬移
    expect(k.cy).toBeLessThan(startY);
    expect(startY - k.cy).toBeLessThanOrEqual(2.0001);
  });

  it('removeAt 消散风筝（OnRemoved）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    m.spawnKite(60, 39, 766, mkEnv());
    expect(m.kites).toHaveLength(1);
    expect(m.removeAt(60, 39)).toBe(true);
    expect(m.kites).toHaveLength(0);
  });
});

// ----------------------------------------------------------------------------
// ⑥ 地形查询（WorldGen.SolidTile2）
// ----------------------------------------------------------------------------

describe('solidTile2（WorldGen.cs:70500-70509）', () => {
  it('实心判定 + halfBrick/slope/致动豁免', () => {
    const st = new TileStore(8, 8);
    st.setTile(2, 2, T.DIRT);
    expect(solidTile2(st, 2, 2)).toBe(true);
    expect(solidTile2(st, 3, 2)).toBe(false);
    expect(solidTile2(st, -1, 2)).toBe(false); // 越界（本仓恒空）
    st.half[st.idx(2, 2)] = 1;
    expect(solidTile2(st, 2, 2)).toBe(false); // halfBrick 不算
    st.half[st.idx(2, 2)] = 0;
    st.slope[st.idx(2, 2)] = 1;
    expect(solidTile2(st, 2, 2)).toBe(false); // 非平台：坡面一律不算
    st.slope[st.idx(2, 2)] = 0;
    st.wire[st.idx(2, 2)] |= 32; // inActive
    expect(solidTile2(st, 2, 2)).toBe(false);
  });

  it('平台特例（:70503）：平台平放=实心 / 上半坡(1,2)=实心 / 下半坡(3,4)=非 / halfBrick=非', () => {
    const st = new TileStore(8, 8);
    st.setTile(2, 2, T.PLATFORM);
    expect(solidTile2(st, 2, 2)).toBe(true);          // Main.tileSolid[19]=true → 平放实心
    st.slope[st.idx(2, 2)] = 1;
    expect(solidTile2(st, 2, 2)).toBe(true);          // 平台+上半坡 → 实心
    st.slope[st.idx(2, 2)] = 2;
    expect(solidTile2(st, 2, 2)).toBe(true);
    st.slope[st.idx(2, 2)] = 3;
    expect(solidTile2(st, 2, 2)).toBe(false);         // 下半坡不算
    st.slope[st.idx(2, 2)] = 4;
    expect(solidTile2(st, 2, 2)).toBe(false);
    st.slope[st.idx(2, 2)] = 1;
    st.half[st.idx(2, 2)] = 1;
    expect(solidTile2(st, 2, 2)).toBe(false);         // !halfBrick 否决（含平台变体）
  });
});

// ----------------------------------------------------------------------------
// ⑦ 风筝风场判定（WorldGen.InAPlaceWithWind :87586-87627）
// ----------------------------------------------------------------------------

describe('inAPlaceWithWind（WorldGen.cs:87586-87627）', () => {
  it('高度门 worldSurface + 液体/挡风墙豁免', () => {
    const st = new TileStore(40, 200);
    expect(inAPlaceWithWind(st, 100, 10 * 16, 4, 4, 100)).toBe(true);   // 10 < surface
    expect(inAPlaceWithWind(st, 100, 150 * 16, 4, 4, 100)).toBe(false); // 地下无风
    st.setTile(5, 10, T.DIRT);
    st.liquid[st.idx(5, 10)] = 100;
    expect(inAPlaceWithWind(st, 5 * 16, 10 * 16, 4, 4, 100)).toBe(false); // 有液
    st.liquid[st.idx(5, 10)] = 0;
    st.wall[st.idx(5, 10)] = 1;                        // 土墙不在 AllowsWind 表
    expect(inAPlaceWithWind(st, 5 * 16, 10 * 16, 4, 4, 100)).toBe(false);
    st.wall[st.idx(5, 10)] = 150;                      // AllowsWind（WallID.cs:54）
    expect(inAPlaceWithWind(st, 5 * 16, 10 * 16, 4, 4, 100)).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// ⑧ DrawBubble 判定（LeashedCritter.Draw :200-205）
// ----------------------------------------------------------------------------

describe('DrawBubble 判定（leashedBubbleVisible，★1457 ShouldDrawBubble :213-278）', () => {
  it('水生（isAquatic）：非满水格画气泡；陆生：有液格画气泡', () => {
    const st = new TileStore(8, 8);
    st.liquid[st.idx(4, 4)] = 255;
    st.liquid[st.idx(5, 4)] = 0;
    st.liquid[st.idx(6, 4)] = 80;
    // ★1457 tile 取 Center 本格（1456 取 _dummy.Center = (cx, cy+8)）
    const at = (tx: number) => leashedBubbleVisible(st, tx * 16, 4 * 16, true);
    expect(at(4)).toBe(false);                        // 满液格不画（鱼在水里）
    expect(at(5)).toBe(true);                         // 空气格画（鱼离水）
    expect(leashedBubbleVisible(st, 6 * 16, 4 * 16, false)).toBe(true);  // 陆生入液
    expect(leashedBubbleVisible(st, 5 * 16, 4 * 16, false)).toBe(false); // 陆生在空气
  });
});

// ----------------------------------------------------------------------------
// ⑨ 逐型 FindFrame（NPC.cs:67295-78074）
// ----------------------------------------------------------------------------

describe('FindFrame 逐型（NPC.cs 大 switch 各 case）', () => {
  /** 取一个实体并钉住运动态（直接驱动帧引擎，绕开移动 AI） */
  function frameEntity(itemVid: number) {
    const st = groundWorld(200, 100, 60);
    const m = mkManager(st);
    const e = m.spawnCritter(100, 50, itemVid, { seed: 3 })!;
    e.vx = 0; e.vy = 0; e.frame = 0; e.frameCounter = 0;
    return e;
  }

  it('兔族（:77553）：行走 6 阈值循环 / 上升=帧4 / 下降=帧6 / 静止锁 0', () => {
    const e = frameEntity(2019);   // npc 46
    e.vx = 0.8; e.vy = 0;
    for (let i = 0; i < 7; i++) e.findFrame();        // fc=1.8/t → 7 帧 ≈ 12.6 > 6 推进
    expect(e.frame).toBe(1);
    for (let i = 0; i < 40; i++) e.findFrame();
    expect(e.frame).toBeLessThan(7);                  // npcFrameCount[46]=7 回卷
    e.vx = 0; e.vy = -1; e.findFrame();
    expect(e.frame).toBe(4);
    e.vy = 1; e.findFrame();
    expect(e.frame).toBe(6);
    e.vy = 0; e.findFrame();
    expect(e.frame).toBe(0);
    expect(e.spriteDirection).toBe(1);                // :77566-77571 direction 同步
  });

  it('鸟族（:74326）：静止=帧4（栖息）；飞行 4t/帧循环 0..count-2', () => {
    const e = frameEntity(2015);   // npc 74（count=5）
    e.findFrame();
    expect(e.frame).toBe(4);
    e.vx = 1; e.vy = 0;
    for (let i = 0; i < 4; i++) e.findFrame();
    expect(e.frame).toBe(1);
    for (let i = 0; i < 60; i++) e.findFrame();
    expect(e.frame).toBeLessThan(4);                  // 循环上界 = count-1 = 4
    expect(e.spriteDirection).toBe(e.direction);
  });

  it('蝶族（:73420-73453）：7t 四相 0/1/2/1 + 物种窗口（356）与 444/653/661 无窗口', () => {
    const e = frameEntity(1995);   // npc 356, placeStyle=2（1+1995-1994）
    expect(e.variant).toBe(2);
    e.vx = 0; e.vy = 0;
    let fc = 0;
    for (let t = 0; t < 28; t++) {
      e.findFrame();
      fc += 1;                                        // |vx|+|vy| = 0 → 每 tick +1
      let want: number;
      if (fc < 7) want = 0;
      else if (fc < 14) want = 1;
      else if (fc < 21) want = 2;
      else { want = 1; if (fc >= 27) fc = 0; }        // 命中 27 先落帧 1 再清零
      expect(e.frame, `t=${t}`).toBe(want + 3);       // 窗口 = 3×(variant-1)
    }
    // 金蝶 444（flyer 族，无 variant 窗口）
    const g = frameEntity(2891);   // npc 444
    g.vx = 1; g.vy = 0;
    for (let i = 0; i < 30; i++) g.findFrame();
    expect(g.frame).toBeLessThan(3);                  // npcFrameCount[444]=3，无 +3 窗口
  });

  it('萤火虫（:73369）：灯灭帧 +2（localAI2<=0 档）', () => {
    const e = frameEntity(1992);   // npc 355
    e.lightOn = false;
    e.findFrame();
    expect(e.frame).toBe(2);                          // 亮相 0 → 灭档 0+2
    e.frameCounter = 5; e.findFrame();                // fc≥4 → 亮相 1
    expect(e.frame).toBe(3);                          // 1+2
    e.lightOn = true;
    e.frameCounter = 5; e.findFrame();
    expect(e.frame).toBe(1);                          // 不再加 2
  });

  it('蜗牛（:72919）：静止保持 / 移动六相 0/1/2/3/2/1 各 10t / 下坠 4·5', () => {
    const e = frameEntity(2006);   // npc 359
    const hold = e.frame;
    e.findFrame();                                    // velocity==Zero → 保持
    expect(e.frame).toBe(hold);
    e.vx = 0.4; e.vy = 0;
    let fc = 0;
    for (let t = 0; t < 59; t++) {
      e.findFrame();
      fc += 1;
      let want: number;
      if (fc < 10) want = 0;
      else if (fc < 20) want = 1;
      else if (fc < 30) want = 2;
      else if (fc < 40) want = 3;
      else if (fc < 50) want = 2;
      else { want = 1; if (fc >= 59) fc = 0; }        // 末相先落帧 1 再清零
      expect(e.frame, `t=${t}`).toBe(want);
    }
    e.vx = 0; e.vy = 2;                               // vy>1 → 下坠档
    e.frameCounter = 0;
    e.findFrame();
    expect(e.frame).toBe(4);
    e.frameCounter = 7; e.findFrame();
    expect(e.frame).toBe(5);
  });

  it('金鱼族（:74879）：wet（isAquatic）四相 6t 循环 0..3（24t 清零但帧保持 3）', () => {
    const e = frameEntity(261);     // npc 55（fish → wet=true）
    let fc = 0;
    for (let t = 0; t < 24; t++) {
      e.findFrame();
      fc += 1;
      const want = fc < 6 ? 0 : fc < 12 ? 1 : fc < 18 ? 2 : 3;   // :74906 先落帧
      if (fc >= 24) fc = 0;                           // :74907-74909 仅清零
      expect(e.frame, `t=${t}`).toBe(want);
    }
    expect(e.frame).toBe(3);
  });

  it('鸭族（:74445）：静止=0 / 行走 4t/帧 钳 [3,9]；泳姿表 363（:74470）钳 [11,count)', () => {
    const e = frameEntity(2122);    // npc 362（waterfowl）
    e.vx = 1; e.vy = 0;
    e.findFrame();
    expect(e.frame).toBe(3);                          // 立即抬到下限 3
    for (let i = 0; i < 30; i++) e.findFrame();
    expect(e.frame).toBeLessThanOrEqual(9);
    e.vx = 0; e.vy = 0.0001;                          // 泳姿表（type+1 → 363）
    expect(e.drawNpcType).toBe(363);
    e.frame = 0; e.frameCounter = 0;
    e.findFrame();
    expect(e.frame).toBe(11);                         // 抬到泳姿下限
  });

  it('鼠族（:77215）：站姿 0↔1（9t）；行走 |vx|×0.5 累加，溢出回卷帧 2', () => {
    const e = frameEntity(2003);    // npc 300（count=6）
    e.vx = 0; e.vy = 0;
    for (let i = 0; i < 9; i++) e.findFrame();
    expect(e.frame).toBe(1);
    e.vx = 1.5; e.vy = 0;
    e.frame = 5; e.frameCounter = 6;
    e.findFrame();                                    // fc=6+1.75>6 → 推进后 ≥count → 回卷 2
    expect(e.frame).toBe(2);
  });

  it('龟族（:77388）：静止锁 0 / 腾空锁 8 / 行走 8t/帧 0..7', () => {
    const e = frameEntity(4464);    // npc 616
    e.vx = 0.5; e.vy = 0;
    e.findFrame();
    expect(e.frame).toBe(0);                          // 首帧未达 8t
    for (let i = 0; i < 9; i++) e.findFrame();
    expect(e.frame).toBe(1);
    e.vx = 0; e.findFrame();
    expect(e.frame).toBe(0);
    e.vy = 1; e.findFrame();
    expect(e.frame).toBe(8);
  });

  it('蚱蜢（:71627）两态 + 蠕虫（:73455）静止=1 / 走 0↔1 12t', () => {
    const hop = frameEntity(2740);   // npc 377
    hop.vy = 1; hop.findFrame();
    expect(hop.frame).toBe(1);
    hop.vy = 0; hop.findFrame();
    expect(hop.frame).toBe(0);
    const worm = frameEntity(2002);  // npc 357
    worm.vx = 0; worm.vy = 0;
    worm.findFrame();
    expect(worm.frame).toBe(1);                       // 静止帧 = 1
    worm.vx = 0.4;
    for (let i = 0; i < 13; i++) worm.findFrame();
    expect(worm.frame).toBe(0);                       // 12t 后翻到 0
  });

  it('蜻蜓（:73403）每 3t 一帧全循环 / 微光之灵（:73391）双累加 3t/帧 0..4', () => {
    const d = frameEntity(4334);    // npc 595（count=4）
    for (let t = 0; t < 12; t++) {
      d.findFrame();
      expect(e_frame(d), `t=${t}`).toBe(Math.floor((t + 1) / 3) % 4);
    }
    const f = frameEntity(5350);    // npc 677
    for (let t = 0; t < 15; t++) {
      f.findFrame();
      expect(e_frame(f), `t=${t}`).toBe(Math.floor(((t + 1) * 2) / 6) % 5);
    }
  });

  it('海马（:77482）速度分档 / 河豚（:74942）wet 8t 循环 / 瓢虫（:67616）2t 相位', () => {
    const horse = frameEntity(4480);  // npc 626（fish）
    horse.vx = 0.2; horse.vy = 0;
    horse.findFrame();
    expect(horse.frame).toBe(3);                        // speed>0.15
    horse.vx = 0.06;
    horse.findFrame();
    expect(horse.frame).toBe(2);
    const puff = frameEntity(5511);   // npc 688（fish）
    for (let i = 0; i < 8; i++) puff.findFrame();
    expect(puff.frame).toBe(1);
    const bug = frameEntity(4361);    // npc 604
    bug.vx = 1; bug.vy = 0;
    bug.findFrame();
    expect(bug.frame).toBe(0);                          // floor(1/2)
    bug.frameCounter = 3;
    bug.findFrame();
    expect(bug.frame).toBe(2);                          // 先 +1 → fc=4 → floor(4/2)
  });

  it('鸮（:74379）：飞行段钳 [8,count) / spriteDirection = -direction', () => {
    const e = frameEntity(4395);    // npc 611
    e.direction = 1;
    e.vx = 1; e.vy = 0;
    e.findFrame();
    expect(e.frame).toBe(8);
    expect(e.spriteDirection).toBe(-1);
  });

  it('鹦鹉族（:74352）循环回卷到帧 1；水黾（:70442）疾行锁帧 4', () => {
    const p = frameEntity(5212);    // npc 671
    p.vx = 1; p.vy = 0;
    p.frame = 5; p.frameCounter = 4;   // count=6 → 溢出
    p.findFrame();
    expect(p.frame).toBe(1);
    const ws = frameEntity(4418);   // npc 612
    ws.vx = 2; ws.vy = 0;              // |vx|>1 → 疾行
    ws.findFrame();
    expect(ws.frame).toBe(4);
    expect(ws.spriteDirection).toBe(1);
  });
});

/** FindFrame 断言辅助：读回推进后的帧（各 case 的 frame 即行 index） */
function e_frame(e: { frame: number }): number { return e.frame; }

// ----------------------------------------------------------------------------
// ⑩ section 流式（ActiveSections.CheckSection 3×3）
// ----------------------------------------------------------------------------

describe('section 流式（LeashedEntity.BySection + ActiveSections.cs:14-33）', () => {
  it('玩家 section 3×3 外的实体不更新（200×150 格栅格）', () => {
    const st = groundWorld(1400, 500, 400);
    const m = mkManager(st);
    const near = m.spawnCritter(100, 300, 2019, { seed: 1 })!;
    const far = m.spawnCritter(900, 300, 2019, { seed: 2 })!;   // section (4,2)
    runTicks(m, st, 60, 100 * 16 + 8, 300 * 16 + 8);            // 玩家 section (0,2)
    expect(far.animT).toBe(0);                                  // 从未被更新
    expect(far.cx).toBe(900 * 16 + 8);                          // Spawn 初值原封
    expect(near.animT).toBeGreaterThan(0);                      // 近端每帧更新
  });

  it('再激活走 Spawn(false)（SectionEntityList.Activate :213-225）：位置重置回锚桩', () => {
    const st = groundWorld(1400, 500, 400);
    const m = mkManager(st);
    const e = m.spawnCritter(900, 300, 2019, { seed: 5 })!;
    e.cx = 905 * 16 + 8;                                        // 模拟游走残位
    runTicks(m, st, 5, 900 * 16 + 8, 300 * 16 + 8);             // 首帧激活 → Spawn(false)
    expect(e.cx).toBe(900 * 16 + 8);                            // 拉回锚桩
  });
});

// ----------------------------------------------------------------------------
// ⑪ ShimmerFly 拖尾 + 尘通道（VisualEffects 各族）
// ----------------------------------------------------------------------------

describe('ShimmerFly 拖尾（ShimmerFlyLeashedCritter.cs:43-54）', () => {
  it('oldPositions = TrailCacheLength[677] = 60，每帧右移 [0]=Center', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 30, 5350, { seed: 1 })!;       // npc 677
    expect(e.npcType).toBe(677);
    runTicks(m, st, 1, 60 * 16 + 8, 30 * 16 + 8);
    expect(e.oldPositions).toHaveLength(60);
    const p0 = { ...e.oldPositions![0] };
    e.cx += 3;
    runTicks(m, st, 1, 60 * 16 + 8, 30 * 16 + 8);
    expect(e.oldPositions![1].x).toBeCloseTo(p0.x, 5);          // 右移一格
    expect(e.oldPositions![0].x).toBeCloseTo(e.cx, 5);
  });
});

/** 测试用 Dust 池（VanillaDust.spawn 的记录替身） */
function fakeDustPool() {
  const spawned: Array<{ type: number; x: number; y: number; w: number; h: number; alpha: number; scale: number }> = [];
  const pool = {
    spawn: (x: number, y: number, w: number, h: number, type: number,
      _sx = 0, _sy = 0, alpha = 0,
      _color: { r: number; g: number; b: number; a: number } | null = null, scale = 1): LeashedDust => {
      spawned.push({ type, x, y, w, h, alpha, scale });
      return {
        type, x, y, vx: 0, vy: 0, scale, fadeIn: 0, alpha,
        noGravity: false, noLight: false, noLightEmittance: false, color: _color,
      };
    },
    spawned,
  };
  return pool;
}

describe('VisualEffects 尘通道（各族源码行号）', () => {
  it('金系 43：照度门（任一通道>20）+ peak/30/300 掷骰（LeashedCritter.cs:143-161）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 30, 2889, { seed: 1 })!;       // npc 442 金鸟
    // 全黑 → 不生成
    let pool = fakeDustPool();
    m.update({ store: st }, mkEnv({ dust: pool, lightAt: () => [0, 0, 0] }), e.cx, e.cy);
    expect(pool.spawned).toHaveLength(0);
    // 亮处 → 1/300·(peak/30) 概率——跑 2000 帧（Math.random 掷骰）必有命中且型号恒 43
    pool = fakeDustPool();
    for (let i = 0; i < 2000; i++) {
      m.update({ store: st }, mkEnv({ dust: pool, lightAt: () => [255, 255, 255] }), e.cx, e.cy);
    }
    expect(pool.spawned.length).toBeGreaterThan(0);
    for (const d of pool.spawned) expect(d.type).toBe(43);
    expect(pool.spawned[0].alpha).toBe(254);
  });

  it('Recall 尘 15 × 前后各 10（LeashedCritter.cs:119-133）', () => {
    const st = new TileStore(120, 80);                          // 全空 → 必触发 Recall
    const m = mkManager(st);
    const e = m.spawnCritter(60, 30, 2019, { seed: 9 })!;
    const pool = fakeDustPool();
    // 跑到 walker 越界（State_Recalling 到期执行 Recall）
    for (let i = 0; i < 400; i++) {
      m.update({ store: st }, mkEnv({ dust: pool }), 60 * 16 + 8, 30 * 16 + 8);
    }
    expect(pool.spawned.some((d) => d.type === 15)).toBe(true);
  });

  it('妖精 278：t%4==0 且 1/4 掷骰，noGravity+noLight（FairyLeashedCritter.cs:35-44）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 30, 4068, { seed: 2 })!;       // npc 583
    const pool = fakeDustPool();
    for (let i = 0; i < 400; i++) {
      m.update({ store: st }, mkEnv({ dust: pool, timeForVisualEffects: i }), e.cx, e.cy);
    }
    expect(pool.spawned.some((d) => d.type === 278)).toBe(true);
    expect(pool.spawned.filter((d) => d.type === 278)[0].alpha).toBe(200);
  });

  it('帝皇蝶 267：fadeAmount>0 才出尘 + CloneDust 二段（EmpressButterfly.cs:30-57）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 30, 4961, { seed: 4 })!;       // npc 661
    const pool = fakeDustPool();
    const clones: LeashedDust[] = [];
    const env = mkEnv({
      dust: {
        spawn: pool.spawn,
        clone: (d) => { const c = { ...d }; clones.push(c); return c; },
      },
      playerCx: e.cx + 500, playerCy: e.cy,                     // >300px 渐隐
    });
    for (let i = 0; i < 300; i++) m.update({ store: st }, env, e.cx, e.cy);
    expect(e.fadeAmount).toBe(50);
    const empress = pool.spawned.filter((d) => d.type === 267);
    if (empress.length > 0) {
      expect(clones.length).toBe(empress.length);               // 每尘必带二段
    }
  });

  it('地狱蝶 6：1/60 掷骰（HellButterflyLeashedCritter.cs:12-16）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 30, 4845, { seed: 6 })!;       // npc 653
    const pool = fakeDustPool();
    for (let i = 0; i < 600; i++) m.update({ store: st }, mkEnv({ dust: pool }), e.cx, e.cy);
    expect(pool.spawned.some((d) => d.type === 6)).toBe(true);
  });

  it('★1457 Recall 尘双旗 noLight=noLightEmittance=true（Recall_CreateDustAtLocation :134-141）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 39, 2019, { seed: 3 })!;       // 兔（walker）
    const flagged = recallDustCapture(e);                       // 单次调用批（Recall 事件前后各一批）
    expect(flagged).toHaveLength(10);
    for (const d of flagged) {
      expect(d.type).toBe(15);
      expect(d.noLight).toBe(true);                             // :139 前旗
      expect(d.noLightEmittance).toBe(true);                    // :139 双旗（链式赋值）
      expect(d.alpha).toBe(150);
      expect(d.scale).toBe(1.1);
    }
  });
});

/** Recall 尘捕获替身：spawn 返回的 LeashedDust 引用直接入列（读旗标用） */
function recallDustCapture(e: import('../src/entities/LeashedCritter').LeashedCritterEntity): LeashedDust[] {
  const out: LeashedDust[] = [];
  e.recallDust({
    timeForVisualEffects: 0,
    dayTime: true,
    worldSurface: 100,
    windForVisuals: 0,
    cloudAlpha: 0,
    playerCx: 0,
    playerCy: 0,
    addLight: () => { },
    dust: {
      spawn: (x: number, y: number, w: number, h: number, type: number): LeashedDust => {
        void x; void y; void w; void h;
        const d: LeashedDust = {
          type, x, y, vx: 0, vy: 0, scale: 1.1, fadeIn: 0, alpha: 150,
          noGravity: false, noLight: false, noLightEmittance: false, color: null,
        };
        out.push(d);
        return d;
      },
    },
  });
  return out;
}

// ============================================================================
// ★1457 L4 五项引擎迁移批回归（2026-08-31；真值 Terarria1458，与 1457 同段全等）
// ============================================================================

describe('★1457 拆分探针族（WorldGen.cs:70686-70919；原版真值表映射见实现头注）', () => {
  /** 单格世界工具：类型 + 可选 slope/half/frameX/wire（未给位一律清零，防用例间残态） */
  function cell(
    st: TileStore, x: number, y: number, type: number,
    opt?: { slope?: number; half?: number; frameX?: number; actuated?: boolean },
  ) {
    st.setTile(x, y, type, opt?.frameX ?? 0, 0);
    const i = st.idx(x, y);
    st.slope[i] = opt?.slope ?? 0;
    st.half[i] = opt?.half ?? 0;
    if (opt?.actuated) st.wire[i] |= 32; else st.wire[i] &= ~32;
  }

  it('solidTileAllowBottomSlope：平实心可站；土顶坡 1/2 拒、底坡 3/4 不设防；半砖拒；平台看合法顶帧（:70706-70729）', () => {
    const st = new TileStore(8, 8);
    cell(st, 2, 2, T.DIRT);
    expect(solidTileAllowBottomSlope(st, 2, 2)).toBe(true);
    cell(st, 2, 2, T.DIRT, { slope: 1 });
    expect(solidTileAllowBottomSlope(st, 2, 2)).toBe(false);       // 土坡上半不可站
    cell(st, 2, 2, T.DIRT, { slope: 3 });
    expect(solidTileAllowBottomSlope(st, 2, 2)).toBe(true);        // 名为 Allow 实只查 topSlope
    cell(st, 2, 2, T.DIRT, { half: 1 });
    expect(solidTileAllowBottomSlope(st, 2, 2)).toBe(false);       // !halfBrick 支
    cell(st, 2, 2, T.DIRT, { actuated: true });
    expect(solidTileAllowBottomSlope(st, 2, 2)).toBe(false);       // !inActive 支
    expect(solidTileAllowBottomSlope(st, -1, 5)).toBe(true);       // InWorld 界外返 true（:70710）
    // 平台：合法顶帧 [0,7]∪[12,16]∪[25,26] 以外不承放；顶坡+合法帧可站（:70722）
    cell(st, 3, 2, T.PLATFORM, { frameX: 54 });                    // 54/18=3 → 合法
    expect(solidTileAllowBottomSlope(st, 3, 2)).toBe(true);
    cell(st, 3, 2, T.PLATFORM, { frameX: 144 });                   // 144/18=8 → 切缺档
    expect(solidTileAllowBottomSlope(st, 3, 2)).toBe(false);
    cell(st, 3, 2, T.PLATFORM, { frameX: 54, slope: 1 });
    expect(solidTileAllowBottomSlope(st, 3, 2)).toBe(true);        // 平台顶坡合法帧豁免
    // PlanterBox（sheet380）：不在 Sets.Platforms，tileSolid 经 EXTRA 并集直通
    cell(st, 4, 2, TILE_BY_KEY['v_380_planter_boxes']);
    expect(solidTileAllowBottomSlope(st, 4, 2)).toBe(true);
  });

  it('solidTileNoPlatforms / solidTileAllowPlatformTopFrame：Sets.Platforms 分野 + 半砖坡面照算顶面（:70735/:70759）', () => {
    const st = new TileStore(9, 9);
    cell(st, 2, 2, T.DIRT);
    expect(solidTileNoPlatforms(st, 2, 2)).toBe(true);
    cell(st, 2, 2, T.PLATFORM);
    expect(solidTileNoPlatforms(st, 2, 2)).toBe(false);            // 平台族被拒
    cell(st, 3, 2, TILE_BY_KEY['v_380_planter_boxes']);
    expect(solidTileNoPlatforms(st, 3, 2)).toBe(true);             // ★380 非 Sets.Platforms
    cell(st, 5, 2, T.PLATFORM, { frameX: 162 });                   // n=9 切缺档
    expect(solidTileAllowPlatformTopFrame(st, 5, 2)).toBe(false);
    cell(st, 5, 2, T.PLATFORM, { frameX: 36 });                    // n=2 合法
    expect(solidTileAllowPlatformTopFrame(st, 5, 2)).toBe(true);
    cell(st, 2, 2, T.DIRT, { half: 1 });
    expect(solidTileAllowPlatformTopFrame(st, 2, 2)).toBe(true);   // 半砖照算顶面（无排除支）
    cell(st, 2, 2, T.DIRT, { slope: 3 });
    expect(solidTileAllowPlatformTopFrame(st, 2, 2)).toBe(true);
    cell(st, 2, 2, T.DIRT, { actuated: true });
    expect(solidTileAllowPlatformTopFrame(st, 2, 2)).toBe(false);
    expect(solidTileNoPlatforms(st, -1, -1)).toBe(true);
    expect(solidTileAllowPlatformTopFrame(st, -1, -1)).toBe(true);
  });

  it('solidTileAllowTopSlope：平实心通行；底坡/非平台上半坡拒；半砖与 380 特例通行；平台只认半砖臂（:70859-70878）', () => {
    const st = new TileStore(8, 8);
    cell(st, 2, 2, T.DIRT);
    expect(solidTileAllowTopSlope(st, 2, 2)).toBe(true);
    cell(st, 2, 2, T.DIRT, { slope: 3 });
    expect(solidTileAllowTopSlope(st, 2, 2)).toBe(false);          // bottomSlope()
    cell(st, 2, 2, T.DIRT, { slope: 1 });
    expect(solidTileAllowTopSlope(st, 2, 2)).toBe(true);           // 非平台 !bottomSlope 直通
    cell(st, 2, 2, T.DIRT, { half: 1 });
    expect(solidTileAllowTopSlope(st, 2, 2)).toBe(true);           // 无 !halfBrick 支
    cell(st, 2, 2, T.PLATFORM);                                    // Platforms ∧ 无 halfBrick → 双臂皆否
    expect(solidTileAllowTopSlope(st, 2, 2)).toBe(false);
    cell(st, 2, 2, T.PLATFORM, { half: 1 });
    expect(solidTileAllowTopSlope(st, 2, 2)).toBe(true);           // Platforms ∧ halfBrick 臂
    cell(st, 3, 2, TILE_BY_KEY['v_380_planter_boxes']);
    expect(solidTileAllowTopSlope(st, 3, 2)).toBe(true);           // type==380 tileSolid 特例
    cell(st, 2, 2, T.DIRT, { actuated: true });
    expect(solidTileAllowTopSlope(st, 2, 2)).toBe(false);
    expect(solidTileAllowTopSlope(st, -1, -1)).toBe(false);        // 本仓越界恒空口径（登记）
  });

  it('platformProperTopFrame：18px 帧档 [0,7]∪[12,16]∪[25,26]（WorldGen.cs:70686-70697）', () => {
    for (let n = 0; n <= 7; n++) expect(platformProperTopFrame(n * 18), `n=${n}`).toBe(true);
    for (let n = 8; n <= 11; n++) expect(platformProperTopFrame(n * 18), `n=${n}`).toBe(false);
    for (let n = 12; n <= 16; n++) expect(platformProperTopFrame(n * 18), `n=${n}`).toBe(true);
    for (const n of [17, 20, 24]) expect(platformProperTopFrame(n * 18), `n=${n}`).toBe(false);
    for (const n of [25, 26]) expect(platformProperTopFrame(n * 18), `n=${n}`).toBe(true);
    expect(platformProperTopFrame(27 * 18)).toBe(false);
  });

  it('Walker/Flyer/Jumper 引擎全部换装（老 SolidTile2 调用点清零回归——实测引擎行为）', () => {
    // Walker 台阶：上台阶仍可登（advanceTarget 头顶格换 AllowTopSlope 后）
    const st = groundWorld(120, 80, 40);
    st.setTile(61, 39, T.DIRT);
    const m = mkManager(st);
    const w = m.spawnCritter(60, 38, 2003, { seed: 7 })!;
    w.direction = 1; w.state = 2; w.tx = 60; w.ty = 39;
    w.cx = 60 * 16 + 8; w.cy = 39 * 16 + 8;
    runTicks(m, st, 400, w.cx, w.cy);
    expect(w.cy).toBeLessThanOrEqual(40 * 16 + 8);
    // Jumper：蚱蜢弹跳不穿地不越界（Move 目标格 AllowPlatformTopFrame）
    const m2 = mkManager(st);
    const g = m2.spawnCritter(80, 39, 2740, { seed: 21 })!;
    runTicks(m2, st, 2000, 80 * 16 + 8, 39 * 16 + 8);
    expect(g.cy).toBeLessThanOrEqual(40 * 16 + 8);
    expect(Math.abs(g.cx - (80 * 16 + 8))).toBeLessThanOrEqual((PROTOTYPES.jumper.straying + 1) * 16 + 8);
    // Flyer：蜻蜓巡飞贴悬停分支（Spawn 悬空门换 AllowPlatformTopFrame）
    const m3 = mkManager(st);
    const f = m3.spawnCritter(90, 30, 4334, { seed: 11 })!;
    runTicks(m3, st, 600, 90 * 16 + 8, 30 * 16 + 8);
    expect(f.cy).toBeLessThanOrEqual(40 * 16 + 8 + 1);
  });
});

describe('★1457 Jumper 水中浮力（JumperLeashedCritter.cs:31 buoyancy=0.4 + :143-150 门）', () => {
  it('本体格满水（水档 liquidType==Water）→ vy 每拍 −0.4 反浮（Clamp 下界）且冷却钉 minWaitTime', () => {
    const st = groundWorld(120, 80, 40);                        // 地面 y=40
    for (let x = 56; x <= 64; x++) {
      for (let y = 36; y <= 39; y++) st.setLiquid(x, y, 255, 1);   // 本仓编码 Water=+1
    }
    const m = mkManager(st);
    const e = m.spawnCritter(60, 35, 2740, { seed: 5 })!;       // 蚱蜢（jumper）
    // 置于满水格中心，静水沉降态驱动单拍 Move
    e.cx = 60 * 16 + 8; e.cy = 38 * 16 + 8;
    e.vx = 0; e.vy = -1; e.state = 0;                           // J_NORMAL
    e.waitTime = 999;
    let vy = e['moveJumper'](st);                                // 单拍直驱（hitSomething=false）
    expect(vy).toBe(false);
    expect(e.vy).toBeCloseTo(-1.1, 6);                          // -1 −0.4（浮力）→ +0.3（重力 Clamp 内）
    expect(e.waitTime).toBe(PROTOTYPES.jumper.minWaitTime ?? 180);  // :148 冷却钉最短档
    e.vy = -1.1;
    e['moveJumper'](st);
    expect(e.vy).toBeCloseTo(-1.2, 6);                          // 稳态净 −0.1/t（浮力−重力差）
    expect(e.waitTime).toBe(PROTOTYPES.jumper.minWaitTime ?? 180);
    void vy;
  });

  it('无水对照：同一位形不吃浮力门（vy 只受重力），冷却不被钉', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 35, 2740, { seed: 5 })!;
    e.cx = 60 * 16 + 8; e.cy = 38 * 16 + 8;
    e.vx = 0; e.vy = -1; e.state = 0; e.waitTime = 999;
    e['moveJumper'](st);
    expect(e.vy).toBeCloseTo(-0.7, 6);                          // -1 + 0.3（纯重力）
    expect(e.waitTime).toBe(999);                               // 无钉
    // 岩浆不算水档（AnyLiquidAt(point, 0) 只认 vanilla liquidType==Water）
    const m2 = mkManager(st);
    const l = m2.spawnCritter(60, 35, 2740, { seed: 5 })!;
    st.setLiquid(60, 38, 255, 2);                               // 本仓编码 Lava=2（vanilla 1）
    l.cx = 60 * 16 + 8; l.cy = 38 * 16 + 8;
    l.vx = 0; l.vy = -1; l.state = 0; l.waitTime = 999;
    l['moveJumper'](st);
    expect(l.vy).toBeCloseTo(-0.7, 6);                          // 浮力门不触发
    expect(l.waitTime).toBe(999);
  });

  it('召回态不吃冷却钉（State!=1 门 :146-149）但浮力照算', () => {
    const st = groundWorld(120, 80, 40);
    for (let x = 58; x <= 62; x++) st.setLiquid(x, 38, 255, 1);
    const m = mkManager(st);
    const e = m.spawnCritter(60, 35, 2740, { seed: 5 })!;
    e.cx = 60 * 16 + 8; e.cy = 38 * 16 + 8;
    e.vx = 0; e.vy = -1; e.state = 1;                           // J_RECALLING
    e.waitTime = 20;
    e['moveJumper'](st);
    expect(e.vy).toBeCloseTo(-1.1, 6);                          // 浮力照常
    expect(e.waitTime).toBe(20);                                // WaitTime 保持
  });
});

describe('★1457 Flyer IsBlockedByMedium 液体遮挡门（FlyerLeashedCritter.cs:139-197）', () => {
  /** 干净地形世界：水/异液按格手注 */
  function basin(): TileStore {
    return new TileStore(24, 24);
  }
  const liq = (st: TileStore, x: number, y: number, amount: number, type = 1) => {
    st.liquid[st.idx(x, y)] = amount;
    if (amount > 0 || type !== 1) st.liquidType[st.idx(x, y)] = type;
  };

  it('IsLiquidBoundary 三分支：partial=边界 / 满液面顶格=边界 / 实心·平台承满液按 tileSolidTop 分流 / 异液', () => {
    const st = basin();
    liq(st, 2, 4, 80);                                          // partial（:168-171）
    expect(isFlyerLiquidBoundary(st, 2, 4)).toEqual([true, 80, false]);
    liq(st, 6, 6, 255);                                         // 满液+上方空气 → 出水方向边界
    expect(isFlyerLiquidBoundary(st, 6, 6)[0]).toBe(true);
    liq(st, 10, 8, 255);
    st.setTile(10, 7, T.STONE);                                 // 洞底满液上压实心块
    expect(isFlyerLiquidBoundary(st, 10, 8)[0]).toBe(false);    // 实心非台面 → :178-181 假支
    liq(st, 14, 6, 255);
    st.setTile(14, 5, T.PLATFORM, 54);                          // 平台承满液
    expect(isFlyerLiquidBoundary(st, 14, 6)[0]).toBe(true);     // tileSolidTop[19]=true → 真
    // 干燥空域（上下皆干，两端走空 tile 分支）
    expect(isFlyerLiquidBoundary(st, 20, 20)).toEqual([false, 0, false]);
    // 异液判读：本仓 honey 编码=3 → vanilla 2 >0 ⇒ weird
    liq(st, 18, 4, 100, 3);
    expect(isFlyerLiquidBoundary(st, 18, 4)).toEqual([true, 100, true]);
  });

  it('IsBlockedByMedium 对称谓词：鱼不出水面 / 鸟不入液 / 异液免检 / 同格免检（:139-157）', () => {
    const st = basin();
    // 池体：(10..14, 10..12) 全 255 水
    for (let x = 10; x <= 14; x++) for (let y = 10; y <= 12; y++) liq(st, x, y, 255);
    const O = [12, 11] as const;                                // 水腹地（amount=255）
    // 鱼（aquatic threshold 255）：留在水里不拦，离水拦
    expect(flyerIsBlockedByMedium(st, true, ...O, 12, 11)).toBe(false);     // 同格
    expect(flyerIsBlockedByMedium(st, true, ...O, 13, 11)).toBe(false);     // 水内移动
    expect(flyerIsBlockedByMedium(st, true, ...O, 17, 17)).toBe(true);      // 出水（目的格干）
    // 鸟（threshold 0）：从干处扎进水 / 扎进界面上方边界格都拦
    expect(flyerIsBlockedByMedium(st, false, 8, 8, 12, 11)).toBe(true);     // 入液
    expect(flyerIsBlockedByMedium(st, false, 12, 8, 12, 9)).toBe(true);     // 目的格=水面边界（下邻 255）
    expect(flyerIsBlockedByMedium(st, false, 8, 8, 5, 5)).toBe(false);      // 干对干放行
    // origin 异液中（蜂蜜）整段免检——partial/异液起点保持运动自由度
    liq(st, 20, 20, 200, 3);                                    // honey 本仓 3 = vanilla 2
    expect(flyerIsBlockedByMedium(st, false, 20, 20, 12, 11)).toBe(false);
    // origin 已在边界格同样免检（对称谓词第一段不过）
    expect(flyerIsBlockedByMedium(st, false, 12, 9, 12, 11)).toBe(false);
  });

  it('遮挡门接入 Update 探针段：前路立即入液 → 停摆（vx 归零、位置不动）；干路对照照飞', () => {
    const build = () => {
      const st = new TileStore(120, 80);
      for (let y = 41; y < 60; y++) for (let x = 50; x < 110; x++) st.setTile(x, y, T.DIRT);
      return st;
    };
    // 有水：蝴蝶在 (60,20) 朝右飞，(61..63,19..21) 全水。
    // 先暖一帧让 section 激活跑完 Spawn(false)（否则激活帧会归位并重掷目标）
    const stW = build();
    for (let x = 61; x <= 63; x++) for (let y = 19; y <= 21; y++) stW.setLiquid(x, y, 255, 1);
    const mW = mkManager(stW);
    const bw = mW.spawnCritter(60, 20, 1994, { seed: 1 })!;     // normalButterfly（flyer 引擎）
    mW.update({ store: stW }, mkEnv(), bw.cx, bw.cy);
    bw.waitTime = 600;                                          // 冻结目标重掷
    bw.tx = 90; bw.ty = 20;                                     // 远目标 → near=false
    bw.vx = 1; bw.vy = 0;
    const startX = bw.cx, startY = bw.cy;
    mW.update({ store: stW }, mkEnv(), bw.cx, bw.cy);
    expect(bw.cx).toBe(startX);                                 // 未动
    expect(bw.cy).toBe(startY);
    expect(bw.vx).toBe(0);                                      // 速度归零
    expect(bw.vy).toBe(0.0001);                                 // 悬空微速度恢复（:114 非 snap 支）
    // 干路对照：同一出发位无水 → 正常位移
    const stD = build();
    const mD = mkManager(stD);
    const bd = mD.spawnCritter(60, 20, 1994, { seed: 1 })!;
    mD.update({ store: stD }, mkEnv(), bd.cx, bd.cy);           // 暖帧同上
    bd.waitTime = 600; bd.tx = 90; bd.ty = 20; bd.vx = 1; bd.vy = 0;
    const startDx = bd.cx;
    mD.update({ store: stD }, mkEnv(), bd.cx, bd.cy);
    expect(bd.cx).toBeGreaterThan(startDx);
  });
});

describe('★1457 DrawBubble 档缩放（LeashedCritter.DrawBubble :295-307）', () => {
  it('bubbleScaleTier：帧体内域小于泡时恒 1，大个体（大帧×scale）整体放大', () => {
    const gw = 26, gh = 30;                                     // Gore_413 语义尺寸示例
    // 小个体 0.75 缩随机档 + 小帧 → 两轴均 <1 → 下限 1
    expect(bubbleScaleTier(16, 20, 0.75, gw, gh)).toBe(1);
    // 大帧 X 主导
    expect(bubbleScaleTier(100, 20, 1, gw, gh)).toBeCloseTo(100 / (gw - 8), 6);
    // scale 参与（Y 主导）
    expect(bubbleScaleTier(30, 44, 1.1, gw, gh)).toBeCloseTo((44 * 1.1) / (gh - 8), 6);
    // 退化输入退 1 倍（图集未就绪兜底）
    expect(bubbleScaleTier(0, 0, 1, gw, gh)).toBe(1);
    expect(bubbleScaleTier(16, 20, 0.75, 4, 4)).toBe(1);
  });
});
