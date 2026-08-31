// 原版投射物数据（tools/extract-projectiles.mjs 从 Projectile.cs SetDefaults 提取；
// ★2026-08-23 基准切换 1457——提取器缺省源版本 SW_ITEM_VER 缺省 1457）。
// ★2026-08-31 校验修正（三轮蓝队 F4）：DD2 哨兵塔 SetDefaults「switch(type) 三档
//   覆写」曾被提取器整块照收（case 体不分 id,lastMatch 恒吃末 case）⇒ json 663/665
//   两行被写成 667 的 28×60。已按两树 SetDefaults 终值逐值勘正：663=30×54
//   （Terarria1457/Terraria/Projectile.cs:7133-7134）/665=28×58（:7141-7144,1456 同值
//   :6852-6858 段同构）;667=28×60 本就正确。同步修复提取器根因（expandTypeSwitchLines
//   纯 type switch 逐 id 求值,case 连排空标脚共享体、default 不并入），recon-item 双闸门
//   HANDPATCH 台账随之清零（此前 665.height=58 被误登记为「手补偏离源码」的假账消除）。
//   ⚠裸重跑提取器仍会抹下方手补清单各列——本文件头注为唯一权威恢复指引。
// 注意 1456 的 SetDefaults 是 if/else-if 链（非 switch），且长矛/悠悠球/连枷等族走
// DefaultTo*() 辅助方法（aiStyle 19/99/15）、悠悠球批量定义在 `type >= A && type <= B` 区间块。
// ★手补清单（2026-08-22 弹幕基建批；提取器 NUM_FIELDS 未含 localNPCHitCooldown/
//   usesLocalNPCImmunity，timeLeft=MaxUpdates 算式与 MaxUpdates 别名亦不解析——重跑
//   提取器会抹，须按此重放；金标闸门 item-stats-golden ROLLBACK_1456 已钉 478）：
//   478  penetrate=2（P.cs:5263；1457 改 3，现提取器已出对值）
//   639  extraUpdates=2 / timeLeft=90 / localNPCHitCooldown=-1（:6594-6610 MaxUpdates=2、
//        timeLeft=MaxUpdates*45、usesLocalNPCImmunity 永久局部免疫）
//   932  localNPCHitCooldown=60（:8570-8572）
//   309  localNPCHitCooldown=10（历史手补，Arrow localImmune 消费）
//   ---- 1457 新弹 1112-1135 缺失列（2026-08-23 本批；行号=Terarria1457 P.cs）----
//   提取器三类盲区：①usesLocalNPCImmunity+localNPCHitCooldown（NUM_FIELDS 无后者）
//   ②usesIDStaticNPCImmunity+idStaticNPCHitCooldown（接口新增列）③`width = (height = 16);`
//   元组赋值（`^width = 数字;` 正则不匹配）。逐条：
//   1112=9(:10375-10376) 1115=-1(:10412-10413) 1116=-1(:10425-10426)
//   1117 w/h=16(:10431)  1118=30(:10462-10463) 1119=30(:10477-10478)
//   1120=60(:10487-10488) 1121=60(:10498-10499)
//   1122 w/h=16(:10440)+idStatic=10(:10449-10450) 1125=-1(:10543-10544)
//   1126=-1(:10554) 1127=-1(:10559) 1128 idStatic=30(:10569) 1129=-1(:10583)
//   1130=-1(:10614) 1131=60(:10625) 1132=60(:10636) 1134 idStatic=20(:10668)
//   1135 idStatic=10(:10679)
//   消费面：Arrow ctor localImmune=本列（1120 随从弹/1121·1131·1132 拍击石三脉冲——
//   同敌 60t 冷却再命中）；1112/1118/1119（MinionProj）与 1115/1116/1125-1130/1134/1135
//   （proj1457/YoyoShotProj）实体侧自持命中表，数值已与实体实现对齐，本列为数据面存档
import projJson from './vanilla-projectiles.json';

export interface ProjectileData {
  aiStyle?: number;
  width?: number;
  height?: number;
  penetrate?: number;
  timeLeft?: number;
  damage?: number;
  light?: number;
  /** 绘制 scale（SetDefaults，196 款非 1；绘制尺寸 = 贴图原生 × scale，非判定盒宽） */
  scale?: number;
  /** 每帧额外子步（SetDefaults，249 款非 0；总步数 = 1+extraUpdates——子弹 14=1、高速弹 207=2） */
  extraUpdates?: number;
  /** 弹幕自带穿甲（Projectile.cs:260 armorPenetration；SetDefaults 逐型直写，
   *  25 款非 0——StrikeNPC :12068 num3 = 玩家 GetArmorPenetration(melee) + 本值，
   *  再入 NPC.checkArmorPenetration :81913 池（+ichor15/broken20/betsy40）。
   *  条件档（148 remixWorld=20）提取器不可静态求值，未入表（登记） */
  armorPenetration?: number;
  /** 1457: 局部 NPC 无敌帧（usesLocalNPCImmunity=true + localNPCHitCooldown=N，
   *  Projectile.cs:10688-10689 ApplyGemStaffStats 等）——同一弹对同一敌 N t 后可再命中
   *  （缺省=命中即永久免疫，Arrow.hitSet 旧语义）。Arrow 命中环按本列切换冷却表 */
  localNPCHitCooldown?: number;
  /** 1457: 全场同型共享静态免疫帧（usesIDStaticNPCImmunity=true + idStaticNPCHitCooldown=N，
   *  SetDefaults 逐型直写——同型所有弹共用一张表，非每弹一张）。消费侧=实体自持共享表
   *  （1122→proj1457 ID_STATIC_1122=10 / 1128=30 / 1134=20 / 1135=10），本列为数据面存档 */
  idStaticNPCHitCooldown?: number;
  friendly?: boolean;
  melee?: boolean;
  ranged?: boolean;
  magic?: boolean;
  minion?: boolean;
  hostile?: boolean;
  tileCollide?: boolean;
  ignoreWater?: boolean;
}

const TABLE = projJson as unknown as Record<string, ProjectileData>;

// ---- ★DATA_PATCH 已清空（2026-08-23 基准切换 1457）：曾以 1456 为准钉 478 诅咒镖
// penetrate 3→2（Projectile.cs 1456 :5264）,现 1457 :5531 `penetrate = 3` 为权威,
// json 载 3 即正确,补丁撤除（审计 2026-08-22 §弹药 ⚠️3 的"多穿 1"结论随基准反转）
const DATA_PATCH: Record<string, Partial<ProjectileData>> = {};
for (const k of Object.keys(DATA_PATCH)) {
  TABLE[k] = { ...TABLE[k], ...DATA_PATCH[k] };
}

/** 原版 projectile type → 投射物数据（无条目返回 null） */
export function projectileData(type: number): ProjectileData | null {
  return TABLE[String(type)] ?? null;
}

// ---- aiStyle 家族常量（ProjectileAIStyleIDs / 源码辅助方法实测值） ----
export const AI_ARROW = 1;        // 直飞弹（箭/子弹/大部分魔法弹）
export const AI_THROWN = 2;       // 抛物线投掷物（手里剑/飞刀，重力 0.3/tick）
export const AI_BOOMERANG = 3;    // 回旋镖（飞出后返回）
export const AI_FLAIL = 15;       // 连枷（抛掷甩链）
export const AI_GRENADE = 16;     // 弹跳爆炸物（手雷/炸弹/炸药，引信爆炸）
export const AI_SPEAR = 19;       // 长矛（随角色前刺）
export const AI_ANCHORED = 13;    // 锚定链族（AI_013:鱼叉/Golem拳/KO加农/链刀——锚在角色上伸缩,归长矛近似）
export const AI_YOYO = 99;        // 悠悠球（按住持续滞留）
export const AI_SHORTSWORD = 161; // 短剑直刺
export const AI_WHIP = 165;       // 鞭
export const AI_GLOWSTICK = 14;   // 荧光棒族（弹跳物理/粘性/妖精）
