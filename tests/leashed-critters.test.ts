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
import {
  LeashedEntityManager, LCG32Random,
  PROTOTYPES, NPC_FAMILY, prototypeOfNpc, ITEM_MAKE_NPC, KITE_ITEM_PROJ,
  IS_GOLD_CRITTER, solidTile2, anchorStyleOfItem,
  type LeashedEnv, type LeashedFamily,
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

/** TECritterAnchor.cs:64-84 覆写表按注册序的**最终态**（661/653 被后行覆盖） */
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
  ['crawler', [357, 448, 484, 485, 486, 487, 606, 616, 617]],
  ['snail', [359, 360, 655]],
  ['runner', [300, 447, 610]],
  ['bird', [74, 297, 298, 442, 611, 671, 672, 673, 675, 674]],
  ['waterfowl', [362, 364, 602, 608]],
  ['fish', [55, 592, 607, 626, 627, 688]],
  ['jumper', [377, 446]],
  ['waterStrider', [612, 613]],
];

describe('拴绳小动物：原型注册表（TECritterAnchor.cs:64-84）', () => {
  it('覆写表逐族命中（缺省 walker），与 NPC_FAMILY 一致', () => {
    for (const [family, ids] of EXPECT_NPC_FAMILY) {
      for (const id of ids) {
        expect(NPC_FAMILY.get(id), `npc ${id}`).toBe(family);
        expect(prototypeOfNpc(id).family, `npc ${id}`).toBe(family);
      }
    }
    // 缺省 = Walker（CreateCustomSet(WalkerLeashedCritter)）
    for (const id of [46, 299, 361, 366, 367, 148, 374, 443, 445, 538, 539, 614, 639]) {
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

  it('19 个原型全在（Registry.RegisterAll :116-134 注册序）', () => {
    expect(Object.keys(PROTOTYPES)).toHaveLength(18); // 18 LeashedCritter 族（kite 独立类）
    // 引擎归属：walker 系 4 族 / flyer 系 12 族 / jumper 系 2 族
    const engines: Record<string, number> = { walker: 0, flyer: 0, jumper: 0 };
    for (const p of Object.values(PROTOTYPES)) engines[p.move]++;
    expect(engines).toEqual({ walker: 4, flyer: 12, jumper: 2 });
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

describe('拴绳风筝（LeashedKite.cs）', () => {
  it('放置 → 风筝实体带正确 projType 并升空离桩', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const k = m.spawnKite(60, 39, KITE_ITEM_PROJ[4367], mkEnv({ windForVisuals: 0.5 }));
    expect(k.projType).toBe(766);
    expect(k.kiteDistance).toBe(250);
    const startY = k.cy;
    runTicks(m, st, 600, 60 * 16 + 8, 39 * 16 + 8, mkEnv({ windForVisuals: 0.5 }));
    expect(k.cy).toBeLessThan(startY);          // 升空
    expect(Math.hypot(k.cx - (60 * 16 + 8), k.cy - (39 * 16 + 8))).toBeGreaterThan(50);
  });

  it('无风时绳长衰减 250→48（Utils.Remap(120,420)，LeashedKite.cs:112-115）', () => {
    const st = groundWorld(120, 80, 40);
    const m = mkManager(st);
    const k = m.spawnKite(60, 39, 766, mkEnv({ windForVisuals: 0 }));
    runTicks(m, st, 500, 60 * 16 + 8, 39 * 16 + 8, mkEnv({ windForVisuals: 0 }));
    expect(k.timeWithoutWind).toBeGreaterThan(0);
    expect(k.kiteDistance).toBeLessThan(250);
    // 跑满 420t 无风 → 48 下限
    runTicks(m, st, 3000, 60 * 16 + 8, 39 * 16 + 8, mkEnv({ windForVisuals: 0 }));
    expect(k.kiteDistance).toBeCloseTo(48, 5);
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
    expect(solidTile2(st, 2, 2)).toBe(false); // 坡面不算
    st.slope[st.idx(2, 2)] = 0;
    st.wire[st.idx(2, 2)] |= 32; // inActive
    expect(solidTile2(st, 2, 2)).toBe(false);
  });
});
