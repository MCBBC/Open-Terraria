// 钩爪链分节贴图表 —— Main.cs DrawProjDirect 链段 if-else 链（:28188-29206）1:1 提取。
//
// 数据来源（行号 = Terarria1456 反编译源码）：
//  · ChainID.cs（全 17 条）—— TextureAssets.Chains[0..16] 的数组下标含义
//    （AssetInitializer.cs:876-879 `Images\Chains_N`）；
//    实际被钩爪消费的槽位 = 0..3（486-489 肌腱/荆棘/荧光/蠕虫）、8..11+12..15
//    （646-649 月亮四色本体+发光层）、16（652 静态钩）；4..7（丝绳/蛛网绳）
//    归 505/506 消防水带族,非钩爪。
//  · 链段贴图选择：Main.cs 各分支（32→Chain5 :28234、73→Chain8 :28281、
//    74→Chain9 :28305、165→Chain15 :28525、230-235→GemChain[type-229] :28533、
//    753→Extra[95] :28551、865→Extra[154] :28589、935→Extra[208] :28626、
//    256→Chain20 :28731、322→Chain29 :28762、315→Chain28 :28699、331→Chain30
//    :28731 前段、332→Chain31(+Chain32 α0 不可见) :28820-28833、
//    372→Chain33/396→Chain35/403→Chain36/446→Extra[3]/652→Chains[16] 大分支
//    :28835-28872、其余(13)→通用 aiStyle7 段 TextureAssets.Chain :29016）
//  · 钩头本体贴图 = Images/Projectile_N（DrawProjDirect 通用绘制 :29900 段），
//    绘制偏移 num143/num144（:29395 起仅 315/331/486/488/489 非零），
//    帧数 Main.projFrames（仅 652=6 帧 7tick 循环, Main.cs:8450 + Projectile.cs:49698-49704）。
//
// 本表 32 型号与 HOOK_PROJ_STATS 一一对应（原版 aiStyle=7 全集,Projectile.cs
// SetDefaults 各 case）。贴图均已解包在 public/sprites/vanilla/（tests 用 PNG
// IHDR 逐张断言尺寸,缺图兜底名单恒空）。

/** ChainID.cs 1:1（Chains_N 数组下标 → 语义名;供测试与注释引用） */
export const CHAIN_ID: Readonly<Record<string, number>> = {
  TendonHook: 0,        // 486 肌腱钩
  ThornHook: 1,         // 487 荆棘钩
  IlluminantHook: 2,    // 488 荧光钩
  Wormhook: 3,          // 489 蠕虫钩
  SilkRope: 4,          // 505（非钩爪）
  SilkRope2: 5,         // 505（非钩爪）
  WebRope: 6,           // 506（非钩爪）
  WebRope2: 7,          // 506（非钩爪）
  LunarSolar: 8,        // 646
  LunarVortex: 9,       // 647
  LunarNebula: 10,      // 648
  LunarStardust: 11,    // 649
  LunarSolarGlow: 12,   // 646 发光层
  LunarVortexGlow: 13,  // 647 发光层
  LunarNebulaGlow: 14,  // 648 发光层
  LunarStardustGlow: 15,// 649 发光层
  StaticHook: 16,       // 652
};
/** ChainID.Count（ChainID.cs:39） */
export const CHAIN_ID_COUNT = 17;

/** 单型号链绘制参数（Main.cs 对应分支的几何/贴图全量） */
export interface HookChainSpec {
  /** 链分节贴图（sprites/vanilla/ 下文件名） */
  tex: string;
  /** 每节步进 px;null = 贴图高（原版 num112 = value.Height / 宝石钩 num85 同） */
  step: number | null;
  /** 残距停铺门 px;null = step+1（大分支 :28932 `vector20.Length() < num112 + 1f`） */
  stop: number | null;
  /** 起点沿链反方向预移 px（32 型独有 :28198-28208,= 8） */
  backOff?: number;
  /** 锚端起点偏移（大分支 num113 :28890-28900;446=20/487=8/489=10） */
  hookBack?: number;
  /** 段旋转偏移 rad（256 型 :28701 `num97 - 0.785f`） */
  rotOff?: number;
  /** 首节推进但不绘制（865/935 flag12/flag14 :28600/:28641） */
  skipFirst?: boolean;
  /** 竖排 4 帧行选择:'seg'=每节递增循环(332 num108);'tick7'=localAI[0]/7(446) */
  frameRows?: 'seg' | 'tick7';
  /** 帧行源高 px(缺省 = 贴图高/4;332=Chain31.H/4=18、446=Extra_3.H/4=16) */
  frameH?: number;
  /** 帧行绘制原点(缺省 = (贴图宽/2, 贴图高/8);332 用 Chain30 尺寸 (8,3) :28822) */
  frameOrigin?: [number, number];
  /** 叠画发光层贴图（646-649:Chains[+12..15],颜色 (255,255,255,127) :28862-28863） */
  glowTex?: string;
  /** 链段 α 因子（396 = (255-alpha)/255,alpha=100 → 155/255,:28965-28968） */
  alphaFactor?: number;
  /** 段全亮免光照（488 = Color.White :28971-28974） */
  fullBright?: boolean;
  /** 每段发光（推进后取格;488 = (0.2,0,0.175) :28971） */
  segLight?: [number, number, number];
  /** 每段循环发光（推进前取格;332 四色 :28796-28814） */
  segLightCycle?: Array<[number, number, number]>;
  /** 端点+沿线 8px 逐格发光（446/646-649;AI_007 :49685-49727 PlotTileLine+CastLightOpen） */
  lineLight?: [number, number, number];
}

/** 钩头本体绘制参数（Main.cs :29395 起 num143/num144 偏移 + projFrames） */
export interface HookHeadSpec {
  /** num143：Y 轴偏移（origin.Y = height/2 + n143 → 贴图顶 = 盒顶 − n143） */
  n143?: number;
  /** num144：X 轴偏移（贴图左 = 盒左 + n144） */
  n144?: number;
  /** 竖排帧行数（Main.projFrames;仅 652 = 6,其余 1） */
  frames?: number;
  /** 帧推进 tick 数（仅 652 = 7;AI_007 :49698-49704 ++frameCounter>=7 循环） */
  frameTicks?: number;
}

/** 钩爪弹体 type → 链绘制参数全表（32 型号 = aiStyle7 全集） */
export const HOOK_CHAINS: Record<number, HookChainSpec> = {
  // 13 普通钩:通用 aiStyle7 段(Main.cs:28987-29020)——Chain 12×12,步进 12,停 25
  13: { tex: 'Chain.png', step: 12, stop: 25 },
  // 32 常春藤鞭(:28190-28235):Chain5 16×28,起点反退 8,步进 28,停 28
  32: { tex: 'Chain5.png', step: 28, stop: 28, backOff: 8 },
  // 73/74 双钩(:28237-28281 / :28274-28305):Chain8/Chain9 12×12,步进 12,停 25
  73: { tex: 'Chain8.png', step: 12, stop: 25 },
  74: { tex: 'Chain9.png', step: 12, stop: 25 },
  // 165 吐蛛丝者(:28482-28522):Chain15 12×24,步进 24,停 25
  165: { tex: 'Chain15.png', step: 24, stop: 25 },
  // 230-235 宝石钩(:28524-28545):GemChain_[type-229],步进 = 贴图高,停 25
  230: { tex: 'GemChain_1.png', step: null, stop: 25 },
  231: { tex: 'GemChain_2.png', step: null, stop: 25 },
  232: { tex: 'GemChain_3.png', step: null, stop: 25 },
  233: { tex: 'GemChain_4.png', step: null, stop: 25 },
  234: { tex: 'GemChain_5.png', step: null, stop: 25 },
  235: { tex: 'GemChain_6.png', step: null, stop: 25 },
  // 256 骷髅王之手(:28651-28681):Chain20 22×22,步进 26,停 26,旋转 −45°
  256: { tex: 'Chain20.png', step: 26, stop: 26, rotOff: -0.785 },
  // 315 蝙蝠钩(:28713-28743):Chain28 10×40,步进 40,停 50
  315: { tex: 'Chain28.png', step: 40, stop: 50 },
  // 322 木钩(:28682-28712):Chain29 24×22,步进 22,停 22
  322: { tex: 'Chain29.png', step: 22, stop: 22 },
  // 331 糖果钩(:28744-28774):Chain30 16×24,步进 24,停 30
  331: { tex: 'Chain30.png', step: 24, stop: 30 },
  // 332 圣诞钩(:28775-28834):Chain31 20×72 四帧行,步进 16,停 30;每节循环四色
  //    发光(推进前取格);Chain32 叠画颜色 (200,200,200,0) α=0 不可见,略(:28823)
  332: {
    tex: 'Chain31.png', step: 16, stop: 30,
    frameRows: 'seg', frameH: 18, frameOrigin: [8, 3],
    segLightCycle: [[0, 0.2, 0.2], [0.1, 0.2, 0], [0.2, 0.1, 0], [0.2, 0, 0.2]],
  },
  // 372 鱼钩(大分支默认 :28840):Chain33 6×12,步进 = 高,停 = 步进+1
  372: { tex: 'Chain33.png', step: null, stop: null },
  // 396 史莱姆钩(:28846-28849):Chain35 20×16;alpha=100 → 段色 ×155/255(:28850+SetDefaults :4506)
  396: { tex: 'Chain35.png', step: null, stop: null, alphaFactor: 155 / 255 },
  // 403 轨道钩(:28852-28855):Chain36 12×12
  403: { tex: 'Chain36.png', step: null, stop: null },
  // 446 反重力钩(:28859-28861):Extra_3 10×64 四帧行(localAI[0]/7 循环),起点偏移 20,
  //    步进 = 帧高 16;AI 侧端点+沿线发光 (0,0.4,0.3)(:49685-49696)
  446: {
    tex: 'Extra_3.png', step: null, stop: null, hookBack: 20,
    frameRows: 'tick7', lineLight: [0, 0.4, 0.3],
  },
  // 486-489 肌腱/荆棘/荧光/蠕虫钩(:28856-28858):Chains[type-486](ChainID 0..3);
  //    487 起点偏移 8(:28904)、489 起点偏移 10(:28901)、488 段全亮+段发光(:28971-48974)
  486: { tex: 'Chains_0.png', step: null, stop: null },
  487: { tex: 'Chains_1.png', step: null, stop: null, hookBack: 8 },
  488: {
    tex: 'Chains_2.png', step: null, stop: null,
    fullBright: true, segLight: [0.2, 0, 0.175],
  },
  489: { tex: 'Chains_3.png', step: null, stop: null, hookBack: 10 },
  // 646-649 月亮四色(:28859-28864):本体 Chains[8..11] + 发光层 Chains[12..15]
  //    颜色 (255,255,255,127);AI 侧端点+沿线发光(:49705-49727)
  646: { tex: 'Chains_8.png', step: null, stop: null, glowTex: 'Chains_12.png', lineLight: [0.7, 0.5, 0.1] },
  647: { tex: 'Chains_9.png', step: null, stop: null, glowTex: 'Chains_13.png', lineLight: [0, 0.6, 0.7] },
  648: { tex: 'Chains_10.png', step: null, stop: null, glowTex: 'Chains_14.png', lineLight: [0.6, 0.2, 0.6] },
  649: { tex: 'Chains_11.png', step: null, stop: null, glowTex: 'Chains_15.png', lineLight: [0.6, 0.6, 0.9] },
  // 652 静态钩(:28868-28869):Chains[16] 10×12
  652: { tex: 'Chains_16.png', step: null, stop: null },
  // 753 琥珀钩(:28545-28575):Extra_95 10×12,步进 = 高,停 25
  753: { tex: 'Extra_95.png', step: null, stop: 25 },
  // 865 松鼠钩(:28577-28613):Extra_154 10×12,首节推进不绘制,步进 = 高,停 25
  865: { tex: 'Extra_154.png', step: null, stop: 25, skipFirst: true },
  // 935 皇后钩(:28614-28650):Extra_208 4×8,首节推进不绘制,步进 = 高,停 8
  935: { tex: 'Extra_208.png', step: null, stop: 8, skipFirst: true },
};

/** 钩爪弹体 type → 钩头本体绘制参数（无表项 = 零偏移单帧） */
export const HOOK_HEADS: Record<number, HookHeadSpec> = {
  // Main.cs 偏移表(:29395 起)中钩爪族仅 5 型号非零;projFrames 仅 652=6(Main.cs:8450)
  315: { n143: -13, n144: -6 },   // :29512-29515
  331: { n144: -4 },              // :29467-29470
  486: { n143: -6 },              // :29436-29439
  488: { n144: -8 },              // :29444-29447
  489: { n143: -2 },              // :29432-29435
  652: { frames: 6, frameTicks: 7 }, // Main.cs:8450 + Projectile.cs:49698-49704
};

/** 256 骷髅王之手钩头旋转覆写（AI_007 :49684-49687
 *  `rotation = atan2(num2,num) + 3.9250002f`,替代通用 atan2−1.57） */
export const SKELETRON_HAND_ROT = 3.9250002;

/** type → 链参数（isHookProjectile 已保证非空） */
export function hookChainOf(type: number): HookChainSpec | null {
  return HOOK_CHAINS[type] ?? null;
}

/** type → 钩头参数（无表项 = 零偏移单帧） */
export function hookHeadOf(type: number): HookHeadSpec {
  return HOOK_HEADS[type] ?? {};
}
