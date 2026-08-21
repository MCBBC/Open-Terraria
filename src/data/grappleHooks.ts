// 钩爪（Grappling Hooks）全量变体表——数值一律取 Terarria1456（1.4.5.6）最终态。
//
// 数据来源（行号 = Terarria1456 反编译源码）：
//  · 物品族 shoot/shootSpeed/useTime/useAnimation —— Item.cs SetDefaults1-5 各 case 块
//  · 弹体射程门（num3 > X → ai[0]=1 回收）—— Projectile.cs AI_007:49706-49747
//  · 回收速度（ai[0]==1 的 num18）—— Projectile.cs:49894-49927
//  · 挂墙后同主人最大并存锚数（num17）—— Projectile.cs:49821-49836
//  · 牵引速度上限（GetGrapplingForces 的 num9）—— Player.cs:22560-22570
//  · QuickGrapple 在飞上限 num7 / 总数上限 num8 —— Player.cs:5989-6014
//  · 弹体宽高 —— Projectile.cs SetDefaults（已由 vanilla-projectiles.json 全量提取，
//    经逐条对账与源码一致）；timeLeft 一律 `timeLeft *= 10`（默认 3600 → 36000，
//    Projectile.cs:527 + 各钩 case）；extraUpdates 仅 256(=1)/935(=3)
//
// 本表为全表登记：未实装触发路径的罕见钩（403 轨道钩由右键轨道单独发射、
// 74 红钩由 73 双钩交替生成）同样登记，数据可用即 1:1。

/** 单个钩爪弹体型号的玩法数值 */
export interface HookProjStats {
  /** 超过此距离（px）立即转入回收态 ai[0]=1（Projectile.cs:49706-49747）。
   *  null = 无射程门（403 轨道钩不在该链表内，仅 2500px 硬上限 :49704） */
  range: number | null;
  /** 回收段速度 px/tick（Projectile.cs:49894-49827 各 num18 覆盖；默认 11 :49895） */
  retract: number;
  /** 挂墙瞬间对同主人全部 aiStyle7 锚的并存上限（Projectile.cs num17 :49821-49836；
   *  默认 3 :49824；超限杀最旧 num16 最小 timeLeft :49851-49854） */
  maxLatched: number;
  /** 牵引速度上限 px/tick（Player.cs:22560-22570 num9；缺省 11 :22562） */
  pull: number;
  /** QuickGrapple 在飞上限 num7（Player.cs:5989-6008；缺省 3 :5989） */
  quickMax: number;
  /** QuickGrapple 总数上限 num8（Player.cs:5990/:6009-6011；缺省 999 :5990）。
   *  单钩族为 1：再发射先杀最旧（Player.cs:6041-6044 num6+num5>=num8 → Kill） */
  quickTotal: number;
  /** 每 tick 额外更新次数（Projectile.cs SetDefaults extraUpdates；其余钩为 0） */
  extraUpdates: number;
}

const DEFAULT_MAX_LATCHED = 3;   // Projectile.cs:49824 num17 = 3
const DEFAULT_RETRACT = 11;      // Projectile.cs:49895 num18 = 11f
const DEFAULT_PULL = 11;         // Player.cs:22562 num9 = 11f
const DEFAULT_QUICK_MAX = 3;     // Player.cs:5989 num7 = 3
const DEFAULT_QUICK_TOTAL = 999; // Player.cs:5990 num8 = 999

function gem(gemIndex: number): HookProjStats {
  // 宝石钩 230-235：射程 300+(type-230)*30（Projectile.cs:49736-49742）
  // 回收 11+(type-230)*0.75（Projectile.cs:49898-49899）；单钩族 QuickGrapple
  // num7=1/num8=1（Player.cs:6005-6007）
  return {
    range: 300 + gemIndex * 30,
    retract: 11 + gemIndex * 0.75,
    maxLatched: DEFAULT_MAX_LATCHED,
    pull: DEFAULT_PULL,
    quickMax: 1,
    quickTotal: 1,
    extraUpdates: 0,
  };
}

function lunar(): HookProjStats {
  // 月亮钩 646-649：射程 550（Projectile.cs:49706）、回收 24（:49915-49917）、
  // 锚数 4（:49834-49836）、牵引 16（Player.cs:22568-22570）、QuickGrapple num7=4
  // （Player.cs:6000-6002）
  return {
    range: 550, retract: 24, maxLatched: 4, pull: 16,
    quickMax: 4, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0,
  };
}

/** 钩爪弹体 type → 玩法数值全表（ProjectileID 13..935 共 32 型号） */
export const HOOK_PROJ_STATS: Record<number, HookProjStats> = {
  13: { range: 300, retract: DEFAULT_RETRACT, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: 1, quickTotal: 1, extraUpdates: 0 },            // Hook（普通钩，Projectile.cs:49706/:49895；Player.cs:6005-6007）
  32: { range: 400, retract: 15, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: DEFAULT_QUICK_MAX, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 }, // IvyWhip 常春藤鞭（:49706/:49896-49897）
  73: { range: 440, retract: 22, maxLatched: 1, pull: 12.5, quickMax: 2, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 }, // 1457: 回收 17→22（AI_007 num18，Terarria1457 Projectile.cs AI_007 ai[0]==1 段；报告"649 星尘钩"系型号误标——646-649 恒 24 两版相同）                             // DualHookBlue 双钩蓝（:49706/:49900-49902；num17=1 :49831-49833；num7=2 Player.cs:5993-5995；牵引 12.5 = 1457 :23022-23025 由 11 上调）
  74: { range: 440, retract: 22, maxLatched: 1, pull: 12.5, quickMax: 2, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 }, // 1457: 同 73 回收 17→22                             // DualHookRed 双钩红（同 73；由 Player.cs:6057-6065 交替生成；牵引 12.5 = 1457 :23022-23025）
  165: { range: 375, retract: DEFAULT_RETRACT, maxLatched: 8, pull: DEFAULT_PULL, quickMax: 8, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 },               // WebSlingerHook 吐蛛丝者（:49706/:49825-49827；num17=8 :49825；num7=8 Player.cs:5997-5999）
  230: gem(0), 231: gem(1), 232: gem(2), 233: gem(3), 234: gem(4), 235: gem(5),                 // 宝石钩 紫晶/黄玉/蓝玉/翡翠/红玉/钻石
  256: { range: 425, retract: DEFAULT_RETRACT, maxLatched: 2, pull: DEFAULT_PULL, quickMax: 2, quickTotal: 2, extraUpdates: 1 },                                // SkeletronHand 骷髅王之手（:49706/:3120-3129；num17=2 :49828；num7=2/num8=2 Player.cs:6012-6014）
  315: { range: 500, retract: 20, maxLatched: DEFAULT_MAX_LATCHED, pull: 14, quickMax: 1, quickTotal: 1, extraUpdates: 0 },                                     // BatHook 蝙蝠钩（:49706/:49903-49905；牵引 14 Player.cs:22563-22565；单钩族）
  322: { range: 550, retract: 22, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: DEFAULT_QUICK_MAX, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 }, // WoodHook 木钩（:49706/:49906-49908）
  331: { range: 400, retract: DEFAULT_RETRACT, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: 1, quickTotal: 1, extraUpdates: 0 },               // CandyCaneHook 糖果钩（:49706/:49895；单钩族 Player.cs:6005-6007）
  332: { range: 550, retract: 17, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: DEFAULT_QUICK_MAX, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 }, // ChristmasHook 圣诞钩（:49706/:49918-49920）
  372: { range: 400, retract: DEFAULT_RETRACT, maxLatched: 2, pull: DEFAULT_PULL, quickMax: 3, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 },               // FishHook 鱼钩（:49706/:49895；num17=2 :49830；num7=3 Player.cs:5995-5997）
  396: { range: 300, retract: DEFAULT_RETRACT, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: DEFAULT_QUICK_MAX, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 }, // SlimeHook 史莱姆钩（:49706/:49895）
  403: { range: null, retract: DEFAULT_RETRACT, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: DEFAULT_QUICK_MAX, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 }, // TrackHook 轨道钩（只挂 314 轨道，:49967-49970；无射程门）
  446: { range: 500, retract: 20, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: DEFAULT_QUICK_MAX, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 }, // AntiGravityHook 反重力钩（:49706/:49909-49911）
  486: { range: 480, retract: 18, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: DEFAULT_QUICK_MAX, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 }, // TendonHook 肌腱钩（:49706/:49912-49914）
  487: { range: 480, retract: 18, maxLatched: DEFAULT_MAX_LATCHED, pull: 12, quickMax: DEFAULT_QUICK_MAX, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 },    // ThornHook 荆棘钩（牵引 12 Player.cs:22566-22568）
  488: { range: 480, retract: 18, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: DEFAULT_QUICK_MAX, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 }, // IlluminantHook 荧光钩（:49706/:49912-49914）
  489: { range: 480, retract: 18, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: DEFAULT_QUICK_MAX, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 }, // WormHook 蠕虫钩（:49706/:49912-49914）
  646: lunar(), 647: lunar(), 648: lunar(), 649: lunar(),                                      // LunarHookSolar/Vortex/Nebula/Stardust 月亮钩四色
  652: { range: 600, retract: 24, maxLatched: 1, pull: DEFAULT_PULL, quickMax: 2, quickTotal: DEFAULT_QUICK_TOTAL, extraUpdates: 0 },                           // StaticHook 静态钩（射程 600 :49706；回收 24 :49915-49917；num17=1 :49832；num7=2 Player.cs:6000-6002）
  753: { range: 420, retract: 15, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: 1, quickTotal: 1, extraUpdates: 0 },                           // AmberHook 琥珀钩（:49737-49743/:49900-49902；单钩族 Player.cs:6005-6007）
  865: { range: 300, retract: DEFAULT_RETRACT, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: 1, quickTotal: 1, extraUpdates: 0 },               // SquirrelHook 松鼠钩（:49706/:49895；单钩族；可挂树干 :49971/:49975）
  935: { range: 500, retract: DEFAULT_RETRACT, maxLatched: DEFAULT_MAX_LATCHED, pull: DEFAULT_PULL, quickMax: 1, quickTotal: 1, extraUpdates: 3 },               // QueenSlimeHook 皇后钩（:49706/:49895；extraUpdates=3 :8605-8613；挂墙瞬移 Player.cs:22400-22402）
};

/** 弹体是否为钩爪族（= 原版 aiStyle 7，Main.cs:6573-6577 projHook 判定） */
export function isHookProjectile(type: number): boolean {
  return HOOK_PROJ_STATS[type] != null;
}

/** 钩爪物品（item.type → 发射数据）。
 *  shoot 即 HOOK_PROJ_STATS 的键；73 双钩物品发射后由 QuickGrapple 交替出 74
 *  （Player.cs:6057-6065），3572 月亮钩四色轮换（:6067-6092） */
export interface HookItemStats {
  shoot: number;
  /** 发射速度 px/tick（Item.shootSpeed；QuickGrapple 归一 Player.cs:6094-6113） */
  shootSpeed: number;
  /** 冷却 tick（Item.useTime = useAnimation，全部 20；骷髅王之手 25） */
  useTime: number;
}

function hookItem(shoot: number, shootSpeed: number, useTime = 20): HookItemStats {
  return { shoot, shootSpeed, useTime };
}

export const HOOK_ITEMS: Record<number, HookItemStats> = {
  84: hookItem(13, 11.5),     // GrapplingHook 钩爪（Item.cs:2353-2365）
  185: hookItem(32, 13),      // IvyWhip 常春藤鞭（Item.cs case 185）
  437: hookItem(73, 14),      // DualHook 双钩（case 437）
  939: hookItem(165, 10),     // WebSlinger 吐蛛丝者（case 939）
  1236: hookItem(230, 10),    // AmethystHook 紫晶钩（Item.cs:15278-15290）
  1237: hookItem(231, 10.5),  // TopazHook 黄玉钩（:15292-15304）
  1238: hookItem(232, 11),    // SapphireHook 蓝玉钩
  1239: hookItem(233, 11.5),  // EmeraldHook 翡翠钩
  1240: hookItem(234, 12),    // RubyHook 红玉钩
  1241: hookItem(235, 12.5),  // DiamondHook 钻石钩
  1273: hookItem(256, 8, 25), // SkeletronHand 骷髅王之手（Item.cs:15789-15797，useTime 25）
  1800: hookItem(315, 13.5),  // BatHook 蝙蝠钩（Item.cs:19934-19948）
  1829: hookItem(322, 15.5),  // SpookyHook 恐怖钩（case 1829）
  1915: hookItem(331, 11.5),  // CandyCaneHook 糖果钩（case 1915）
  1916: hookItem(332, 15.5),  // ChristmasHook 圣诞钩（case 1916）
  2360: hookItem(372, 13),    // FishHook 鱼钩（case 2360）
  2585: hookItem(396, 13),    // SlimeHook 史莱姆钩（case 2585）
  2800: hookItem(446, 14),    // AntiGravityHook 反重力钩（case 2800）
  3020: hookItem(486, 15),    // TendonHook 肌腱钩（Item.cs:27945-27951，shoot=486+type-3020）
  3021: hookItem(487, 15),    // ThornHook 荆棘钩
  3022: hookItem(488, 15),    // IlluminantHook 荧光钩
  3023: hookItem(489, 15),    // WormHook 蠕虫钩
  3572: hookItem(646, 18),    // LunarHook 月亮钩（Item.cs:32201-32211；QuickGrapple 轮换 646-649）
  3623: hookItem(652, 16),    // StaticHook 静态钩（Item.cs:32623-32633）
  4257: hookItem(753, 12.5),  // AmberHook 琥珀钩（case 4257）
  4759: hookItem(865, 11.5),  // SquirrelHook 松鼠钩（case 4759）
  4980: hookItem(935, 4),     // QueenSlimeHook 皇后钩（case 4980；慢发射=贴身传送语义）
};

/** 物品 id → 钩爪数据（非钩爪返回 null） */
export function hookItemOf(vid: number): HookItemStats | null {
  return HOOK_ITEMS[vid] ?? null;
}

/** 钩爪弹体 timeLeft：SetDefaults 默认 3600（Projectile.cs:527）×10（各钩 case
 *  `timeLeft *= 10`，如 :679-689/:2896-2907）= 36000 */
export const HOOK_TIME_LEFT = 36000;

/** 距玩家超过该距离弹体即死（AI_007 :49668-49671 `num3 > 2500f` → Kill） */
export const HOOK_KILL_DISTANCE = 2500;

/** 回收段贴身死亡距离（:49895 后 ai[0]==1 `num3 < 24f` → Kill :49888-49890） */
export const HOOK_RETRACT_KILL_DIST = 24;

/** 可被钩爪挂住的"裂砖"族（TileID.Sets.CrackedBricks，TileID.cs:183）——钩爪
 *  刮到 1/16 概率击碎（AI_007 :49666-49682） */
export const CRACKED_BRICK_SHEETS: ReadonlySet<number> = new Set([481, 482, 483]);

/** 松鼠钩 865 可挂的树干族（TileID.Sets.IsATreeTrunk，TileID.cs:161） */
export const TREE_TRUNK_SHEETS: ReadonlySet<number> = new Set([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);

/** 轨道 tile（Minecart track，CanTileBeLatchedOnTo 显式放行 :49968 `theTile.type == 314`） */
export const TRACK_SHEET = 314;

/** 树木 tile 323（松鼠钩显式放行 :49975 `(type == 865 && theTile.type == 323)`） */
export const TREE_SHEET = 323;
