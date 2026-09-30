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
//   639  extraUpdates=1 / timeLeft=90 / localNPCHitCooldown=-1（:6883 MaxUpdates=2→
//        setter extraUpdates=value-1=1;timeLeft=MaxUpdates*45;usesLocalNPCImmunity）
//        ★R6:旧"=2"系 MaxUpdates 别名未折算(off-by-one),json 已同步 1
//   640  extraUpdates=2（MaxUpdates=3 :6898）/ localNPCHitCooldown=-1（★R6 补登,提取器盲区同族）
//   680  localNPCHitCooldown=-1（★R6 补登）
//   932  localNPCHitCooldown=60（:8570-8572）
//   309  localNPCHitCooldown=10（历史手补，Arrow localImmune 消费）
//   496  alpha=255 / usesLocalNPCImmunity / localNPCHitCooldown=-1（1457 P.cs:5695/
//        :5703-5704；2026-09-03 登记项①——三键经下方 DATA_PATCH 层注入,json 直改被
//        recon 双闸门外禁令锁定;运行时 α 面=Arrow.ts PROJ_ALPHA0[496]）
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
  /** 原版 Projectile.alpha SetDefaults 初值（496=255 :5695——提取器未建此列,json 全表
   *  0 键,运行时消费面=Arrow.ts PROJ_ALPHA0 逐型表,本列数据面存档对账用） */
  alpha?: number;
  /** 1457: 局部 NPC 无敌旗（usesLocalNPCImmunity=true,SetDefaults 逐型直写——与
   *  localNPCHitCooldown 成对,分离两键是原版字段形;本仓命中环按 localNPCHitCooldown
   *  单列消费,本旗数据面存档） */
  usesLocalNPCImmunity?: boolean;
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
  /** 原版水敏门（Projectile.cs:412；1457 置位 270 型——账面 2026-09-08 机械闭合重计:
   *  源码 `ignoreWater = true` 文本写面共 242 处 = SetDefaults(:699,写面 :861-:10479)
   *  链内 240 + DefaultToSpray() 体 1（:10703）+ AI_113 运行时动态 1（:41398,数据面外
   *  不计）;240 写面按分支守卫展开覆盖 267 型（分组 OR 守卫 76-78/567-568/625-628/
   *  569-571/895-896 与连排 case 共享体 663/665/667 等承载 +27 展开）,DefaultToSpray
   *  唯一调用点 :9635-9637（type==1015||1016||1017）再展开三型 → 267+3=270
   *  （json 实载 270 条可验）。:763 全量初始化 false ⇒
   *  缺省 undefined ≡ false）。★原版运行时共三口消费本旗：出生预置 :10888-10890
   *  `if (ignoreWater) wet = false`、逐 tick 缓存刷新 :16895 `if (!ignoreWater)`
   *  整段跳过（wet/lavaWet/honeyWet/shimmerWet 四旗冻结）、水面扰动面
   *  WaterShaderData.cs:281/:289（:281 置 flag3(wet)=true 放行扰动门、:289 就地
   *  Lava/Wet/Honey 三液重判,无液 continue 跳过着色——本仓 WaterWaves.ts
   *  projDistort 门 :648/:742 已 1:1 建模,无行为缺口仅补账）——
   *  AI 一律读 `wet` 字段
   *  而非本旗（蜂族 :27685 / 469 :54969 / 706 :56743 / 948 :44542），对本族天然恒假；
   *  AI_060 黏液族液体触杀（:29584-29602）直扫 Main.tile.liquid 与本旗无关
   *  （358/406/1042 虽有门照灭）。动态置位唯一例外 = AI_113_TargetSticker :41398
   *  （636/971/1024 蓄力支，数据面外）。本仓消费 = Arrow.ts wet 缓存三写点
   *  （出生预置 :3491/:3495 + 逐子步刷新 :3555），真值面回归 = proj-wet-cache F3③ */
  ignoreWater?: boolean;
}

// ★2026-09-03：TABLE 改为【浅拷贝】承载（原实现 `TABLE = projJson` 直引用——
//   DATA_PATCH 合并时 `TABLE[k] = {...}` 会替换 json 模块对象上的同键条目,把补丁值
//   泄回 raw json 视图,tests/496-wobble 的 raw-json 缺口哨兵（断言 json 三列 undefined）
//   被打爆）。拷贝后合并只写 TABLE,json 模块对象全程零改。
const TABLE: Record<string, ProjectileData> = { ...projJson } as Record<string, ProjectileData>;

// ---- ★DATA_PATCH（1457 终值对齐层；json 直改被 recon 双闸门外禁令锁定,增量走此层）----
// 曾以 1456 为准钉 478 诅咒镖 penetrate 3→2（1456 P.cs :5264）,1457 切换时撤除——
// 1457 :5531 `penetrate = 3` 为权威,json 载 3 即正确。
// ★2026-09-03 复活：496 暗影炎箭三键（登记项①,Projectile.cs:5694-5705 SetDefaults 终值）
//   alpha=255 / usesLocalNPCImmunity=true / localNPCHitCooldown=-1——提取器三类盲区
//   （头注①②）× 1456 提取器重跑踩踏面,三键至今未入 json。消费面：
//   · localNPCHitCooldown=-1 → Arrow ctor localImmune（命中环 `localImmune > 0` 门
//     不吃 -1 → 落 hitSet 永久同敌免支 ≡ 原版 -1「localNPCImmunity 恒不衰减」语义,
//     tests/496-wobble ⑥b 行为等价锁）;
//   · alpha=255 → Arrow PROJ_ALPHA0[496]（运行时 α 面,draw 通用兜底 (255−α)/255=0
//     = 精灵本体恒隐,可见面=AI 影焰尘 27）;本列 alpha 为数据面存档（运行时消费在
//     Arrow.ts PROJ_ALPHA0,与 631/661 等"提取器盲区键"同模式）
const DATA_PATCH: Record<string, Partial<ProjectileData>> = {
  // 496 暗影炎箭（暗影炎弓 3053 载荷;1457 P.cs:5694-5705）
  '496': { alpha: 255, usesLocalNPCImmunity: true, localNPCHitCooldown: -1 },
  // ★SW-FX1（2026-09-09）骨头手套 3245 掷骨 532（:5986-5997）——提取器盲区①
  // （usesLocalNPCImmunity+localNPCHitCooldown 不入 NUM_FIELDS）：同敌 5t 局部免疫窗
  '532': { usesLocalNPCImmunity: true, localNPCHitCooldown: 5 },
  // ★SW-FX1 孢子云 567 盒径（:6189-6196 嵌套 if：567=14×14、568=16×16）——提取器
  // 曾只读共享块漏嵌套支,json 恒 16×16;567 按 1457 原文补 14×14（568 与 json 同值不动）
  // ★BJ129③（2026-09-18）病根本修（extract-projectiles.mjs 头注⑧）+json 重产落表,
  //   json 面现自带 14×14 与本补丁同值（保留=SW-FX1 先例存照,双载同值零行为差）
  '567': { width: 14, height: 14 },
};
for (const k of Object.keys(DATA_PATCH)) {
  TABLE[k] = { ...TABLE[k], ...DATA_PATCH[k] };
}

/** 原版 projectile type → 投射物数据（无条目返回 null） */
export function projectileData(type: number): ProjectileData | null {
  const d = TABLE[String(type)];
  if (!d) return null;
  // ★BJ104 勘误（2026-09-16）：ignoreWater 实为【双载并存】——vanilla-projectiles.json
  // 全 270 id 均自带 ignoreWater:true（提取器产物,tools/extract-projectiles.mjs:218
  // BOOL_FIELDS 含该字段）,与下方 PROJ_IGNORE_WATER 集合（2026-09-04 回溯归属法独立
  // 重产）270/270 完全重合。旧注「不入 json/现两者不并存」与事实相反（BJ104 以 1047
  // 彩虹巨石弹立案,实为全表面貌）。读路径 json 优先（下一行提前返回）且两源同值
  // true → 零行为差；集合在【本读路径】实为死支,但 proj-wet-boomerang-yoyo 等测试
  // 仍消费其负成员面,保留。
  // ⚠数据变异/审计警告：对集合做 delete【不会】改变任何行为（json 优先）——勿以
  // 集合摘除当勘误手段；两源必须同步改（改 json 须同步集合、反之亦然）,或以
  // 「json 为准、集合为审计镜像」纪律执行。摘 json 侧冗余字段虽零行为差,但触发
  // 提取器重产面+金标对账漂移（recon 闸门）,收益不抵风险=维持双载,注释写真。
  if (d.ignoreWater !== undefined) return d;
  return PROJ_IGNORE_WATER.has(type) ? { ...d, ignoreWater: true } : d;
}

// ---- aiStyle 家族常量（ProjectileAIStyleIDs / 源码辅助方法实测值） ----
/** Projectile.SetDefaults `ignoreWater = true` 全 270 id（P.cs:699-10676 逐块,回溯归属法重产——v1 启发式漏嵌套块 5 id {76,78,568,625,628}+DefaultToSpray() :10703 展开 1015/1016/1017
 *  提取,2026-09-04 溅花缺口清偿批——通用湿段 :16903 `if (!ignoreWater)` 整段门
 *  的豁免面;缺行=不豁免=原版缺省 false=入水溅花）。★BJ104 勘误（2026-09-16）：
 *  本集合与 vanilla-projectiles.json 自带的 ignoreWater:true（提取器 BOOL_FIELDS
 *  产物）270/270 完全重合=双载镜像,读路径 json 优先、集合为审计镜像（负成员
 *  测试消费面）；集合 delete 静默无效（见 projectileData 注）——两源须同步改。 */
export const PROJ_IGNORE_WATER: ReadonlySet<number> = new Set([
  5,7,8,10,11,16,17,18,22,72,76,77,78,79,86,87,
  94,145,146,147,148,149,150,151,152,186,187,199,211,221,226,238,
  239,242,244,245,250,251,257,259,261,264,280,288,299,300,302,304,
  306,308,321,358,373,375,377,384,386,387,388,406,407,408,409,410,
  423,433,435,436,437,438,439,440,441,443,444,445,447,449,453,459,
  460,462,463,464,465,466,467,468,476,482,490,493,494,500,518,524,
  533,535,536,565,567,568,569,570,571,578,579,580,590,591,592,593,
  596,600,606,607,608,611,612,613,615,617,623,624,625,626,627,628,
  629,630,631,633,634,638,639,640,641,643,644,650,651,653,654,658,
  659,660,661,663,665,667,670,672,673,674,677,678,679,682,683,688,
  689,690,691,692,693,697,698,699,700,701,702,703,704,705,707,708,
  709,710,713,714,722,729,733,754,755,756,759,764,813,818,831,856,
  857,864,871,872,873,874,880,882,883,887,888,893,895,896,898,908,
  919,922,923,929,931,932,933,946,950,953,957,961,962,963,964,965,
  966,970,972,973,974,976,977,978,982,983,984,985,995,997,1001,1015,
  1016,1017,1018,1019,1025,1038,1039,1040,1041,1042,1043,1044,1045,1047,1050,1051,
  1056,1080,1090,1091,1100,1110,1115,1116,1117,1119,1122,1125,1126,1129,
]);

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
export const AI_KITE = 160;       // 风筝（24 型 766-853,Projectile.DefaultToKite P.cs:10746——拴线飞行/风响应,BJ413）
