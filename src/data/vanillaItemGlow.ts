// ★BJ601 Item.glowMask 消费面（手持两段叠画 + 掉落物光罩）数据面 + 纯函数。
//
// 原版锚（Terarria1457 反编译亲读，1.4.5.7）：
//  · 数据面 = Item.glowMask【public short 字段】（Item.cs:195，-1=None、-2=FakeUser），
//    SetDefaults 逐件赋值（非 ItemID.Sets 表）；常量面 = Terraria.ID.GlowMaskID.cs
//    （0..383）；贴图资产 Glow_{N}.png 走 TextureAssets.GlowMask[N]
//    （AssetInitializer.cs:650-653，384 张全在库——本仓 public/sprites/vanilla/Glow_*.png）。
//    提取器 = tools/_bj601-glowmask-extract.mjs（SetDefaults1..5 逐 case 终值：
//    72 处赋值 = 67 件正值 + 5 件 -1 显式重置 2782-2786 日耀工具变体）。
//  · 消费面四站（本刀接 ①②③，④登记债）：
//    ① 手持尾段（挥舞+静持共体）PlayerDrawLayers.cs:3499-3509——heldItem.glowMask!=-1
//       → GlowMask 同源矩形同变换叠画；color 缺省 White（:3204）+ 逐案覆写
//       （:3211-3226 switch：46/5669/5670/5671/3827/5462）+ ApplyStealthToColor(:3272)。
//    ② 手持 useStyle 5 通用瞄准段 :3472-3477——color3=White+stealth（:3475），
//       同源矩形叠画。staff 支（Item.staff :3363-3445）/5118/:3476/:3779/:4049 专支
//       return 早退不走——3870 在 staff 支内自带 GlowMask[238]×(255,255,255,127)
//       （:3439-3445）；3476 专支自带 GlowMask[195]（BJ348b-2 已接，Glow_195）。
//    ③ 掉落物 Main.cs DrawItem :39300（num2=glowMask）/:39387（3779→-1）/
//       :39408-39437——门 num2!=-1 && type!=46 && type!=5462；色式 switch
//       :39409-39427（5670/5671 相位双色双画、5146 Disco、5669 橙脉冲 A=alpha、
//       3858 (255,255,255,63)×0.75、6148-6151/6174 GetTrustyPalGlowColor）；
//       源矩形 = glowmaskFrame（DrawItem_GetBasics :39201-39266——缺省=物品动画
//       同帧；3858 专支 = Glow_233 三帧条(帧高−2) :39230-39235）；
//       origin=glowmaskFrame.Size()/2 :39431/:39436 → 光罩中心≡物品中心。
//    ④ UI 槽位 ItemSlot.cs:2890-2931（同构色式+3858 动画帧）——★BJ603 已接
//       （UI.ts iconUrl 烘焙站,UI_GLOW_EXCLUDED={3779,46,5462};3858 静态帧 0 定格）。
//  · pulley 门 :3183 flag2 = holdStyle!=0 && !pulley（+CanVisuallyHoldItem :3189）
//    → 滑轮挂绳期静持物【整个不画】（挥舞支 flag 不带 pulley 因子照画）。
//  · 色式语义（XNA SpriteBatch AlphaBlend=(One,InvSrcAlpha) 预乘，xna-alpha0 判例）：
//    A=0 色 → 纯加算（canvas 'lighter'）；A>0 → source-over×alpha。光罩色不取
//    光照（White/特例色均为自发光面）→ 合成后逃逸队列（BJ509 四塔/BJ597 甲位同域）；
//    例外面 = 46/3827 手持段读 Lighting.GetColor(玩家中心)（:3187 项色链），
//    本仓在收集侧 lightAt 逐件取真值（主贴图 itemColor≡White 近似为既有登记，
//    光罩面按原版取光不减）。
//  · 帧布局：glowmaskFrame 缺省=物品动画同帧（frame=(glowmaskFrame=…) :39263/
//    :39266）→ Glow_{N}.png 与 Item_{id}.png 同尺寸同竖条帧格（抽样 4722/2757/
//    3253/3858 等逐张对拍）；本表 67 件无一件在 itemAnimations 注册表内
//    （Main.cs:3738-3772 全列亲核）→ 手持/掉落缺省源矩形 = 整张 Glow_{N}.png，
//    唯 3858 动画三帧条（:39230-39235，帧高−2）。
//
// 相邻域登记（★BJ603 2026-10-10 收官刀后全数闭合,goldMask 族五域终收官）：
//  · UI 槽位光罩（④）= BJ603 已接（UI.ts iconUrl 烘焙站）;FakeFishParticle.cs:499-502
//    （装饰鱼光罩）= BJ603 件4① 已接（数据面销案并存:vanilla 73 处 Item.glowMask
//    赋值位全量亲读零鱼族命中→vanilla 不可达,守卫保 mod/管理面）;
//  · tile 侧 = Main.tileGlowMask[tileType]（Main.cs:1512 声明/10163-10207 钉表
//    【亲读 grep 复核=37 条,BJ601 台账"44"系行数误计】;TileDrawing.cs:980/:1196-1341
//    消费）——BJ603 件2 已接（vanillaTileGlow.ts+TileGlow.ts+Renderer tile 层收集）;
//  · Projectile.glowMask（Projectile.cs:782/:4057/:4990-5037/:9434/:10021/:10037
//    数据面=16 型 + Main.cs:35433-35518 绘制面）——BJ603 件3 已接（vanillaProjGlow.ts
//    +ChainsawProj/Bobber/drawProj glowMask 臂三站;312 JackOLantern 弹面本仓未实装=休眠）;
//  · Main.cs DrawItem 的 BossBag/75/4143 环绕光斑（:39329-39386）非 glowMask 域
//    ——BJ603 件4② 已接（drawDrop 环绕复本面）;
//  · 掉落物贴图 velocity.X×0.2 旋转（:39284 num）——BJ603 件4③ 已接（本体/环绕/
//    光罩三面同旋转量;微光态 num=0;onConveyor 支本仓无传送带域≡0 同相）。

/** 67 件 glowMask 数据面（Item.cs SetDefaults 终值；键=原版物品 id，值=GlowMaskID）。
 *  2782-2786（日耀工具五变体）显式 -1 重置不入表（=无光罩）；8 火把等 flame 族
 *  走 ItemFlame 通道（TileFlames）与本域无关。 */
export const ITEM_GLOWMASK: Readonly<Record<number, number>> = {
  // ---- 旧日军团前杂件 ----
  46: 328,      // LightsBane 光之灾厄（1.4.5 新光罩；手持段光照渐隐 :3211-3216）
  // ---- 月总套装防具（物品态） ----
  2757: 26,     // VortexHelmet
  2758: 27,     // VortexBreastplate
  2760: 28,     // NebulaHelmet
  2761: 29,     // NebulaBreastplate
  2762: 30,     // NebulaLeggings
  2806: 46,     // MartianUniformHelmet
  2807: 45,     // MartianUniformTorso
  // ---- 月总工具（星旋/星云/星尘五件套；日耀 2782-2786 显式 -1） ----
  2772: 1,      // VortexAxe
  2773: 20,     // VortexChainsaw
  2774: 21,     // VortexDrill
  2775: 4,      // VortexHammer
  2776: 5,      // VortexPickaxe
  2777: 6,      // NebulaAxe
  2778: 22,     // NebulaChainsaw
  2779: 23,     // NebulaDrill
  2780: 9,      // NebulaHammer
  2781: 10,     // NebulaPickaxe
  3462: 174,    // StardustAxe
  3463: 175,    // StardustChainsaw
  3464: 176,    // StardustDrill
  3465: 177,    // StardustHammer
  3466: 178,    // StardustPickaxe
  3523: 196,    // LunarHamaxeVortex
  3524: 197,    // LunarHamaxeNebula
  3525: 198,    // LunarHamaxeStardust
  // ---- 火星暴乱科技 ----
  2795: 47,     // LaserMachinegun
  2796: 36,     // ElectrosphereLauncher
  2797: 38,     // Xenopopper
  2798: 39,     // LaserDrill
  2860: 93,     // MartianConduitPlating
  2882: 102,    // ChargedBlasterCannon
  // ---- 染料（掉落/槽位光斑族） ----
  2863: 98,     // MartianHairDye
  2864: 99,     // MartianArmorDye
  2878: 105,    // WispDye
  2879: 104,    // PixieDye
  2883: 103,    // ChlorophyteDye
  2884: 107,    // UnicornWispDye
  2885: 106,    // InfernalWispDye
  // ---- 杂件/家具 ----
  3253: 129,    // LavaLamp
  3813: 244,    // DefendersForge（旧日军团熔炉）
  // ---- 武器（1.4.4-1.4.5 段） ----
  3475: 191,    // VortexBeater
  3476: 194,    // NebulaArcanum（手持走专支 Glow_195=BJ348b-2；194=掉落/槽位面）
  3540: 200,    // Phantasm
  3542: 207,    // NebulaBlaze
  3779: 218,    // SpiritFlame（手持=专支四游 orb :3352-3372；掉落 num2=-1 :39387）
  3827: 227,    // DD2SquireBetsySword（手持段 Lerp(光照,White,.6) A=66 :3218-3221）
  3858: 233,    // MonkStaffT3（掉落/槽位=动画三帧条高−2 :39230-39235）
  3859: 234,    // DD2BetsyBow
  3870: 238,    // ApprenticeStaffT3（手持=staff 支内自带 [238]×(255,255,255,127) :3439）
  4722: 271,    // FirstFractal
  5462: 355,    // DeadCellsFlint（掉落/槽位外门排除 :39408/:2890；手持=Transparent≡不可见,
  //              1040 弹联动爆闪 :3512-3557 登记债）
  5669: 374,    // TrueCopperShortsword（手持/掉落=橙脉冲 A=alpha(0) :3213-3216/:39417）
  5670: 372,    // RainbowPhaseblade（相位双画 :3500-3508/:39430-39435）
  5671: 373,    // RainbowPhasesaber
  // ---- 发光浮漂（Item.cs:41846-41864，5139 经典浮漂无光罩） ----
  5140: 318,    // FishingBobberGlowingStar
  5141: 319,    // FishingBobberGlowingLava
  5142: 320,    // FishingBobberGlowingKrypton
  5143: 321,    // FishingBobberGlowingXenon
  5144: 322,    // FishingBobberGlowingArgon
  5145: 323,    // FishingBobberGlowingViolet
  5146: 324,    // FishingBobberGlowingRainbow（掉落/槽位=Disco 动色 :39411/:2913）
  // ---- 1.4.5 联办宠/坐骑召唤物 ----
  6148: 379,    // PalworldMinionTrustyCattiva
  6149: 380,    // PalworldMinionTrustyFoxsparks
  6150: 381,    // PalworldMountTrustyChillet
  6151: 382,    // PalworldMountTrustyChilletIgnis
  6174: 383,    // PalworldTrustyDigtoise
};

/** 掉落物光罩排除面（Main.cs DrawItem）：46/5462 = 外门 :39408；
 *  3779 = num2 显式 -1 :39387（手持四游 orb 不适用于掉落态）。 */
export const DROP_GLOW_EXCLUDED: ReadonlySet<number> = new Set([46, 5462, 3779]);

/** 手持通用叠画跳过面：3476（专支自带 Glow_195=BJ348b-2 已接）、
 *  3779（专支四游 orb，无通用 halo）、5462（color=Transparent≡画了也是零贡献）。 */
export const HAND_GLOW_SKIP: ReadonlySet<number> = new Set([3476, 3779, 5462]);

/** staff 支内自带光罩的特例（:3439-3445 GlowMask[238]×(255,255,255,127)）。
 *  其余 staff 支物品 return 早退不走通用段（无光罩）。 */
export const STAFF_GLOW_SPECIAL = 3870;

// ===================== 手持色式（PlayerDrawLayers.cs:3204-3226 switch） =====================

export type HeldGlowKind =
  | 'white'           // 缺省 Color.White（:3204）
  | 'lightsBane'      // 46：光照渐隐 Lerp(Transparent,(255,255,255,127)*.7,amount)（:3211-3216）
  | 'emberPulse'      // 5669：Lerp(White,(180,85,30),WrappedLerp) A=alpha(0)（:3213-3219）
  | 'phaseDouble'     // 5670/5671：相位双画（GetPhaseColor→drawColor 版）（:3500-3508）
  | 'betsySword'      // 3827：Lerp(GetAlpha(itemColor),White,.6) A=66（:3218-3221）
  | 'staffWhite127';  // 3870：staff 支内 (255,255,255,127)（:3441）

export function heldGlowKind(vid: number): HeldGlowKind {
  if (vid === STAFF_GLOW_SPECIAL) return 'staffWhite127';
  if (vid === 46) return 'lightsBane';
  if (vid === 5669) return 'emberPulse';
  if (vid === 5670 || vid === 5671) return 'phaseDouble';
  if (vid === 3827) return 'betsySword';
  return 'white';
}

// ===================== 掉落物色式（Main.cs:39409-39427 switch） =====================

export type DropGlowKind =
  | 'white'           // 缺省 Color.White（:39410）
  | 'disco'           // 5146：(DiscoR,DiscoG,DiscoB)（:39411）
  | 'emberPulse'      // 5669：同手持橙脉冲（:39417-39422）
  | 'phaseDouble'     // 5670/5671：相位双画（:39430-39435）
  | 'white63'         // 3858：(255,255,255,63)*0.75（:39424-39425）
  | 'palGlow';        // 6148-6151/6174：GetTrustyPalGlowColor（:39426）

export function dropGlowKind(vid: number): DropGlowKind {
  if (vid === 5670 || vid === 5671) return 'phaseDouble';
  if (vid === 5146) return 'disco';
  if (vid === 5669) return 'emberPulse';
  if (vid === 3858) return 'white63';
  if (vid === 6148 || vid === 6149 || vid === 6150 || vid === 6151 || vid === 6174) return 'palGlow';
  return 'white';
}

/** 5670/5671 shoot（Item.cs:44582/:44602）→ GetPhaseColor(1101/1102) 走 MultiLerp 环 */
export const PHASEBLADE_SHOOT: Readonly<Record<number, number>> = { 5670: 1101, 5671: 1102 };

// ===================== 色式解析（RGBA 字节域 → op tint/alpha/blend） =====================

export type RGBA = readonly [number, number, number, number];

/** XNA Color → canvas op 面（预乘 AlphaBlend=(One,InvSrcAlpha) + 白系贴图逐通道
 *  乘 tint 判例）：A=0 → 'add'（'lighter' 纯加算,贡献=RGB×A₀）；A>0 → 'over'
 *  （source-over,alpha=A/255）。 */
export function xnaColorToOp(c: RGBA): { blend: 'add' | 'over'; tint: [number, number, number]; alpha: number } {
  const blend = c[3] === 0 ? 'add' as const : 'over' as const;
  return {
    blend,
    tint: [c[0] / 255, c[1] / 255, c[2] / 255],
    alpha: blend === 'add' ? 1 : c[3] / 255,   // A=0：贡献=RGB（alpha 不参与,xna-alpha0 判例）
  };
}

const truncByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.trunc(v));

/** Utils.WrappedLerp（Utils.cs:305-313）：三角波 lerp */
export function wrappedLerp(a: number, b: number, t: number): number {
  let x = t * 2;
  if (x > 1) x = 2 - x;
  return a + (b - a) * x;
}

/** 5669 TrueCopperShortsword 橙脉冲（:3213-3216 手持/:39417-39422 掉落同式）：
 *  Lerp(White,(180,85,30),WrappedLerp(0.5,1,(miscCounter%100)/100))，A=item.alpha(0)=
 *  纯加算。 */
export function emberPulseColor(miscCounter: number): RGBA {
  const w = wrappedLerp(0.5, 1, (miscCounter % 100) / 100);
  return [
    truncByte(255 + w * (180 - 255)),
    truncByte(255 + w * (85 - 255)),
    truncByte(255 + w * (30 - 255)),
    0,
  ];
}

/** 46 LightsBane 光照渐隐（:3211-3216；itemColor=Lighting.GetColor(玩家中心) :3187）：
 *  amount = Remap(|itemColor|/1.731, 0.3, 0.5, 1, 0)（暗→1、亮→0）；
 *  color = Lerp(Transparent, (255,255,255,127)*0.7, amount)。
 *  Color*0.7f = (byte)178.5=178/(byte)88.9=88 逐通道截断（XNA Color*float）。 */
export function lightsBaneColor(lightRGB: readonly [number, number, number] | null): RGBA {
  let amount = 1;
  if (lightRGB) {
    const r = lightRGB[0] / 255, g = lightRGB[1] / 255, b = lightRGB[2] / 255;
    const len = Math.sqrt(r * r + g * g + b * b);
    const t = Math.min(1, Math.max(0, (len / 1.731 - 0.3) / 0.2));   // Remap clamp01
    amount = 1 - t;                                                   // 1→0 线性（newMin=1,newMax=0）
  }
  return [truncByte(178 * amount), truncByte(178 * amount), truncByte(178 * amount), truncByte(88 * amount)];
}

/** 3827 Betsy 之剑（:3218-3221）：color=GetAlpha(itemColor)（默认支=itemColor 原样,
 *  alpha=0）→ Lerp(·,White,0.6) → A=66 覆写。 */
export function betsySwordColor(lightRGB: readonly [number, number, number] | null): RGBA {
  const l = lightRGB ?? [255, 255, 255];
  return [
    truncByte(l[0] + 0.6 * (255 - l[0])),
    truncByte(l[1] + 0.6 * (255 - l[1])),
    truncByte(l[2] + 0.6 * (255 - l[2])),
    66,
  ];
}

// ---- 相位色（Item.GetPhaseColor :49056-49163；Item.GetPhaseColorDirect :49165-49199） ----

/** FNA Color(float,float,float) = (byte)Clamp(v*255,0,255) 截断（FNA Color.cs:1576-1583
 *  判例,BJ599 同锚）。_phaseColors[9] = direct(1059..1075)+direct(1059) 收尾环。 */
const PHASE_COLORS: ReadonlyArray<RGBA> = [
  [25, 127, 255, 255],    // direct(1059)：(.1,.5,1.2)
  [255, 51, 25, 255],     // direct(1060)：(1,.2,.1)
  [25, 255, 51, 255],     // direct(1061)：(.1,1,.2)
  [204, 25, 255, 255],    // direct(1062)：(.8,.1,1)
  [204, 229, 255, 255],   // direct(1063)：(.8,.9,1)
  [204, 204, 0, 255],     // direct(1064)：(.8,.8,0)
  [229, 127, 0, 255],     // direct(1071)：(.9,.5,0)
  [255, 25, 102, 255],    // direct(1075)：(1.05,.1,.4)
  [25, 127, 255, 255],    // direct(1059) 收尾环
];

/** Utils.MultiLerp（Utils.cs:293-303 Color 版）：9 色分段线性（percent>1 外插段钳尾） */
export function multiLerpColor(percent: number, colors: ReadonlyArray<RGBA>): RGBA {
  const step = 1 / (colors.length - 1);
  let i = 0;
  while (percent / step > 1 && i < colors.length - 2) i++;
  const t = (percent - step * i) / step;
  const a = colors[i], b = colors[i + 1];
  return [
    truncByte(a[0] + t * (b[0] - a[0])),
    truncByte(a[1] + t * (b[1] - a[1])),
    truncByte(a[2] + t * (b[2] - a[2])),
    truncByte(a[3] + t * (b[3] - a[3])),
  ];
}

/** GetPhaseColor（:49056-49163）：1101/1102（5670/5671 shoot）= MultiLerp 环
 *  （miscCounterNormalized=(miscCounter%300)/300,Player.cs:3373/:29527-29533）；
 *  drawColor → A=127（:49109-49112 num=0.5,255×0.5）。 */
export function phaseColor(shoot: number, miscCounter: number, drawColor: boolean): RGBA {
  if (shoot !== 1101 && shoot !== 1102) return [255, 255, 255, 255];   // default :49115
  const c = multiLerpColor((miscCounter % 300) / 300, PHASE_COLORS);
  return drawColor ? [c[0], c[1], c[2], 127] : c;
}

// ---- Palworld 伙伴光斑（ItemSlot.GetTrustyPalGlowColor :2957-2962） ----

/** Main.hslToRgb（Main.cs:48689-48724+hue2rgb :48726-48742）：经典 hue2rgb 分段,
 *  通道=(byte)Math.Round(v*255)。 */
function hue2rgb(c0: number, t1: number, t2: number): number {
  let c = c0;
  if (c < 0) c++;
  if (c > 1) c--;
  if (6 * c < 1) return t1 + (t2 - t1) * 6 * c;
  if (2 * c < 1) return t2;
  if (3 * c < 2) return t1 + (t2 - t1) * (2 / 3 - c) * 6;
  return t1;
}

export function hslToRgb255(h: number, s: number, l: number, a = 255): RGBA {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v, a];
  }
  const p = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const q = 2 * l - p;
  return [
    Math.round(hue2rgb(h + 1 / 3, q, p) * 255),
    Math.round(hue2rgb(h, q, p) * 255),
    Math.round(hue2rgb(h - 1 / 3, q, p) * 255),
    a,
  ];
}

/** GetTrustyPalGlowColor（:2957-2962）：num=WrappedLerp(0,1,GTW/3%1)；
 *  hslToRgb((0.04+0.07*num)%1,1,0.5,127)*0.5f*num2（num2=Remap(num,0.2,1,0,1)）。
 *  Color*0.5f 与 *num2 两次逐通道截断（XNA Color*float 链）。 */
export function palGlowColor(globalTimeWrappedHourly: number): RGBA {
  const num = wrappedLerp(0, 1, (globalTimeWrappedHourly / 3) % 1);
  const num2 = Math.min(1, Math.max(0, (num - 0.2) / 0.8));   // Remap(num,0.2,1,0,1) clamp01
  const hsl = hslToRgb255((0.04 + 0.07 * num) % 1, 1, 0.5, 127);
  const half = hsl.map((v) => truncByte(v * 0.5)) as [number, number, number, number];
  return [truncByte(half[0] * num2), truncByte(half[1] * num2), truncByte(half[2] * num2), truncByte(half[3] * num2)];
}

/** 3858 白罩（:39424-39425）：(255,255,255,63)*0.75f = (191,191,191,47)。 */
export function white63Color(): RGBA {
  return [191, 191, 191, 47];
}

// ===================== 几何（glow 源矩形） =====================

/** 3858 动画光罩帧（DrawItem_GetBasics :39230-39235）：Glow_233=66×210 三帧竖条
 *  （帧高 70），Frame(1,3,0,idx) 后 Height−2；帧钟 = 5 tick/帧（DrawItem=
 *  itemFrameCounter[slot]/5 :39232、UI=miscCounter%15/5 :2920——同拍 5t）。 */
export const MONK_T3_GLOW = { texW: 66, frameH: 70, frames: 3, frameHm2: 68, tickPerFrame: 5 } as const;

export function monkT3GlowRect(frameIdx: number): { sy: number; sh: number } {
  const f = ((frameIdx % MONK_T3_GLOW.frames) + MONK_T3_GLOW.frames) % MONK_T3_GLOW.frames;
  return { sy: f * MONK_T3_GLOW.frameH, sh: MONK_T3_GLOW.frameHm2 };
}

/** 缺省光罩源矩形 = 物品帧格同布局（glowmaskFrame=item 同帧 :39263/:39266；
 *  本表 67 件无 itemAnimations 注册件 → frames=1 = 整张）。 */
export function glowSourceRect(fullH: number, frames: number, frameIdx: number): { sy: number; sh: number } {
  if (frames <= 1) return { sy: 0, sh: fullH };
  const fh = fullH / frames;
  const f = Math.min(frames - 1, Math.max(0, frameIdx));
  return { sy: Math.round(fh * f), sh: Math.round(fh) };
}

// ===================== 门（pulley 静持绘制门） =====================

/** 静持绘制门（PlayerDrawLayers.cs:3183 flag2 = holdStyle!=0 && !pulley
 *  [+CanVisuallyHoldItem :3189-3191 caller 侧]）：pulley 期返回 0 = 静持物整不画。
 *  身体行 holdStyleRaw【不受】此门（holdStyle 7 行 11 语义照旧）。 */
export function staticHoldDrawGate(hs: number, pulley: boolean): number {
  return pulley ? 0 : hs;
}

// ===================== 手持色式批量解算（收集侧入口） =====================

export interface HeldGlowArgs {
  miscCounter: number;
  /** 玩家中心光照（lightAt；仅 46/3827 消费——:3187 itemColor 链） */
  light: readonly [number, number, number] | null;
}

/** 手持段 op 色序列（段 A/B 统一：缺省 White;特例按 heldGlowKind）。
 *  phaseDouble = 双画两色（:3500-3508 先非 drawColor 后 drawColor）。 */
export function heldGlowColors(vid: number, args: HeldGlowArgs): RGBA[] {
  switch (heldGlowKind(vid)) {
    case 'staffWhite127': return [[255, 255, 255, 127]];
    case 'lightsBane': return [lightsBaneColor(args.light)];
    case 'emberPulse': return [emberPulseColor(args.miscCounter)];
    case 'phaseDouble': {
      const shoot = PHASEBLADE_SHOOT[vid] ?? -1;
      return [phaseColor(shoot, args.miscCounter, false), phaseColor(shoot, args.miscCounter, true)];
    }
    case 'betsySword': return [betsySwordColor(args.light)];
    default: return [[255, 255, 255, 255]];
  }
}

/** 掉落物 op 色序列（Main.cs:39409-39427；无 stealth 面）。 */
export function dropGlowColors(vid: number, args: {
  miscCounter: number;
  globalTimeWrappedHourly: number;
  discoRGB: readonly [number, number, number] | null;
}): RGBA[] {
  switch (dropGlowKind(vid)) {
    case 'phaseDouble': {
      const shoot = PHASEBLADE_SHOOT[vid] ?? -1;
      return [phaseColor(shoot, args.miscCounter, false), phaseColor(shoot, args.miscCounter, true)];
    }
    case 'disco': return [args.discoRGB ? [args.discoRGB[0], args.discoRGB[1], args.discoRGB[2], 255] : [255, 255, 255, 255]];
    case 'emberPulse': return [emberPulseColor(args.miscCounter)];
    case 'white63': return [white63Color()];
    case 'palGlow': return [palGlowColor(args.globalTimeWrappedHourly)];
    default: return [[255, 255, 255, 255]];
  }
}
