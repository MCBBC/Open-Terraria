// ★BJ597 甲位 GlowMask 发光表（2026-10-10，BJ595 套装视效普查 D3/N2 收编刀）。
// 原版数据面亲读定谳（1.4.5.7 反编译）：
//  · glowMask 数据面结构 = Item.glowMask【public short 字段】（Item.cs:195，-1=None、
//    -2=FakeUser），在 SetDefaults 逐件赋值（非 ItemID.Sets 表）；常量面 =
//    Terraria.ID.GlowMaskID.cs（0..383，Count=384）；贴图资产 Glow_{N}.png 走
//    TextureAssets.GlowMask[N]（AssetInitializer.cs:650-653，384 张全在库）。
//  · 玩家甲位发光【不走】 Item.glowMask——PlayerDrawSet.cs:459-811 SetPassColors
//    按 drawPlayer.head/body/legs 硬编码 switch 置 headGlowMask/bodyGlowMask/
//    armGlowMask/legsGlowMask + 对应 GlowColor（-1 缺省、Transparent 缺省），四个
//    叠画站：腿 PlayerDrawLayers.cs:1556-1573（坐姿 1478-1495）、身 :1950-1955、
//    头 :2357-2401、臂 :3659-3663——与本体 DrawData【同一 sourceRect/bodyFrame、
//    同一 position/origin/rotation/effect】= 同变换同锚叠画。
//  · 色式语义（XNA SpriteBatch 预乘 AlphaBlend=(One,InvSrcAlpha)，本仓 xna-alpha0
//    判例）：A=0 色（月辉四套 250³/火星白/骷髅白等）= 纯加法 → canvas 'lighter'；
//    A>0 色（127/150/60/255 族）→ canvas source-over ×alpha（翼光 plain 档同习语）。
//    色值不取光照 = 原版自发光（GetImmuneAlphaPure :808-811 只乘免疫/残影/微光，
//    无 Lighting 项）→ 本仓走合成后逃逸队列（BJ509 四塔/BJ594 盾球同判例域）。
//  · 月辉计件 num2..num5 被 `num2=3;num3=3;num4=3;num5=3;`（:515-518）无条件钉满
//    ——计件支为死码，250=62.5×(1+3) 恒值；星尘腿 127×(1+3)=508 byte 截断 252。
//  · 复合半幅族（body 227/237/238/239/260 + 专贴图 251/259）：usesCompositeTorso
//    （Body.Sets.UsesNewFramingCode，body 1..261 全真）本体走 17_TorsoComposite，
//    glow = DrawCompositeArmorPiece（PlayerDrawLayers.cs:38-162）把【同甲复合贴图
//    下半幅】（sourceRect.Y += 224）按 body/armGlowColor 逐部件叠画（5 部件：后肩/
//    后臂/躯干/前肩/前臂）；body 251/259 整幅换专 glow 贴图 Glow_364/376（无偏移）。
//  · ★BJ625（2026-10-10）尾批两件落刀：TV 头 271 屏态机（HEAD_GLOW[271].tv=true,
//    帧位=tvScreenState+tvScreenGlowFrame 纯函数,渲染侧喂 anyDanger/低血/邪恶群系/
//    湿/节庆+眨眼输入）、Floret 前管 308（HEAD_GLOW[269].frontTube=308 同锚第二叠条,
//    本体 Extra_214 渲染侧 drawPlayer 窗内 in-world 画——资产两件均在库）。
//    手持物/掉落物 Item.glowMask 消费面（Main.cs:39410-39450 /
//    PlayerDrawLayers.cs:3476-3526，67 件数据面）另账；UI 纸娃娃（DisplayDoll）glow 未接。
import { ARM_FRAME, COMPOSITE_BOB_ROWS, sittingSlicePlan, type DollPetArm } from '../player/PaperDoll';
import { MALE_VARIANTS } from '../player/Appearance';

export interface RGB { r: number; g: number; b: number }

/** 色式族（SetPassColors 逐案分类）：
 *  const        恒量 RGBA（A=0 → 纯加法；A>0 → source-over）
 *  mtPulse      Color(255³)×(mouseTextColor/255)² 全通道（头 268/身 237/腿 222 :557/:675/:770）
 *  mtPulseA0    Color(255³,0)×(mt/255)²（头 282 :617-619）
 *  arkhalis     underShirtColor、A=180（:519-520 ArkhalisColor；头 214/身 208/腿 157-158）
 *  chickenBones (255³,0)×Remap(WrappedLerp(miscCounter%100/100),0.8,1)（:164-176）
 *  luna         (255³,100)×Remap(WrappedLerp(...),0.85,1)（:183-190） */
export type ArmorGlowColor =
  | { k: 'const'; r: number; g: number; b: number; a: number }
  | { k: 'mtPulse' }
  | { k: 'mtPulseA0' }
  | { k: 'arkhalis' }
  | { k: 'chickenBones' }
  | { k: 'luna' };

export interface ArmorGlowEntry {
  mask: number;
  color: ArmorGlowColor;
  /** 抖动份数：2 = ±1.25px 双拷贝（Grox 头 240/腿 210/复合身 227，:2389-2397/
   *  :1560-1568/DrawCompositeArmorPiece 227 支）；4 = 学徒火 4 拷贝（头 211/身 205
   *  独立站 :2410-2416/:3671-3680，区间见下方 APPRENTICE_JITTER_*） */
  jitter?: 2 | 4;
  /** ★BJ625件2 前管第二叠条（head 269 Glow_308——FrontShoulder 站
   *  PlayerDrawLayers.cs:104-118/:3798-3810，与头罩条同锚同源矩形同色双画;
   *  本体 Extra_214 由渲染侧画,非 glow 域） */
  frontTube?: number;
  /** ★BJ625件1 TV 屏态机（head 271 Glow_309 6 列×4 行格机——:2359-2387 +
   *  DrawPlayer_Head_GetTVScreen :2516-2539;帧位由 tvScreenState/tvScreenGlowFrame
   *  派生,ctx.tv 喂屏态+眨眼;Glow_309 252×224 列距 42/帧行 56,帧 40×56） */
  tv?: true;
}

/** 复合半幅族（bodyGlowColor/armGlowColor 经 DrawCompositeArmorPiece 消费；tex =
 *  专贴图时整幅换图（251/259），缺省 = 同甲 Armor_Armor_{body} 下半幅） */
export interface BodyCompositeGlowEntry {
  color: ArmorGlowColor;
  tex?: string;
  jitter?: 2;
}

// ---- 头甲（PlayerDrawSet.cs:470-640 逐案 1:1；行号=case 段）----
export const HEAD_GLOW: Readonly<Record<number, ArmorGlowEntry>> = {
  109: { mask: 208, color: { k: 'const', r: 255, g: 255, b: 255, a: 0 } },    // JimsHelmet :604-608
  169: { mask: 15, color: { k: 'const', r: 250, g: 250, b: 250, a: 0 } },     // VortexHelmet :521-526
  170: { mask: 16, color: { k: 'const', r: 250, g: 250, b: 250, a: 0 } },     // NebulaHelmet :576-581
  175: { mask: 41, color: { k: 'const', r: 255, g: 255, b: 255, a: 0 } },     // MartianUniformHelmet :594-598
  178: { mask: 96, color: { k: 'const', r: 255, g: 255, b: 255, a: 0 } },     // HiTekSunglasses :609-613
  189: { mask: 184, color: { k: 'const', r: 250, g: 250, b: 250, a: 0 } },    // StardustHelmet :582-588（colorArmorHead 恒亮覆写=BJ594 债面）
  193: { mask: 209, color: { k: 'const', r: 255, g: 255, b: 255, a: 127 } },  // LokisHelmet :599-603
  210: { mask: 242, color: { k: 'const', r: 127, g: 127, b: 127, a: 0 } },    // ValhallaKnight :533-538
  211: { mask: 241, color: { k: 'const', r: 100, g: 100, b: 100, a: 0 }, jitter: 4 },  // ApprenticeDark（独立站 :2410-2416）
  214: { mask: 245, color: { k: 'arkhalis' } },                               // ArkhalisHat :539-543
  216: { mask: 256, color: { k: 'const', r: 127, g: 127, b: 127, a: 0 } },    // UltraBrightHelmet :527-532
  240: { mask: 273, color: { k: 'const', r: 230, g: 230, b: 230, a: 60 }, jitter: 2 },  // GroxTheGreatHelm :544-548
  267: { mask: 301, color: { k: 'const', r: 230, g: 230, b: 230, a: 60 } },   // RoninHat :549-553
  268: { mask: 302, color: { k: 'mtPulse' } },                                // TimelessTravelerHood :554-560
  269: { mask: 304, color: { k: 'const', r: 200, g: 200, b: 200, a: 255 }, frontTube: 308 },  // FloretProtectorHelmet :561-565（308=前管 FrontShoulder 站 :104-118）
  271: { mask: 309, color: { k: 'const', r: 255, g: 255, b: 255, a: 255 }, tv: true },        // TVHead :571-574（屏态机帧位见 tvScreenGlowFrame）
  270: { mask: 305, color: { k: 'const', r: 200, g: 200, b: 200, a: 150 } },  // CapricornMask :566-570
  282: { mask: 357, color: { k: 'mtPulseA0' } },                              // DeadCellsBeheadedHead :614-620
  284: { mask: 365, color: { k: 'chickenBones' } },                           // ChickenBonesHead :621-625
  285: { mask: 367, color: { k: 'const', r: 255, g: 255, b: 255, a: 0 } },    // UpgradedMiningHead :626-630
  291: { mask: 375, color: { k: 'const', r: 255, g: 255, b: 255, a: 255 } },  // KazzymodusHood :631-635
  292: { mask: 378, color: { k: 'luna' } },                                   // LunasHead :636-640
};

// ---- 身甲 GlowMask 条族（男/女 mask 拆档 + 附加臂 mask；:641-745）----
export interface BodyGlowEntry {
  maskM: number;
  maskF: number;
  /** 附加臂 glow mask（与 body 同色同锚叠画，:3659-3663 消费） */
  armMask?: number;
  color: ArmorGlowColor;
}
export const BODY_GLOW: Readonly<Record<number, BodyGlowEntry>> = {
  175: { maskM: 13, maskF: 18, color: { k: 'const', r: 250, g: 250, b: 250, a: 0 } },             // VortexBreastplate :641-653
  176: { maskM: 14, maskF: 19, armMask: 12, color: { k: 'const', r: 250, g: 250, b: 250, a: 0 } }, // NebulaBreastplate :705-719
  179: { maskM: 42, maskF: 43, armMask: 44, color: { k: 'const', r: 255, g: 255, b: 255, a: 0 } }, // MartianCostumeShirt :732-745
  190: { maskM: 185, maskF: 186, armMask: 188, color: { k: 'const', r: 250, g: 250, b: 250, a: 0 } }, // StardustBreastplate :689-704
  194: { maskM: 210, maskF: 211, armMask: 211, color: { k: 'const', r: 255, g: 255, b: 255, a: 127 } }, // LokisBreastplate :720-726
  205: { maskM: 240, maskF: 240, color: { k: 'const', r: 100, g: 100, b: 100, a: 0 } },           // ApprenticeDark（独立站 4 抖动 :3671-3680）
  208: { maskM: 246, maskF: 247, armMask: 248, color: { k: 'arkhalis' } },                        // ArkhalisShirt :654-667
};

// ---- 身甲复合半幅族（DrawCompositeArmorPiece :38-162；色案 :668-688）----
export const BODY_COMPOSITE_GLOW: Readonly<Record<number, BodyCompositeGlowEntry>> = {
  227: { color: { k: 'const', r: 230, g: 230, b: 230, a: 60 }, jitter: 2 },   // GroxTheGreatArmor :668-672
  237: { color: { k: 'mtPulse' } },                                           // TimelessTravelerRobe :673-678
  238: { color: { k: 'const', r: 255, g: 255, b: 255, a: 255 } },             // FloretProtectorChestplate :679-683
  239: { color: { k: 'const', r: 200, g: 200, b: 200, a: 150 } },             // CapricornChestplate :684-688
  251: { color: { k: 'chickenBones' }, tex: 'vanilla/Glow_364.png' },         // ChickenBonesRobe :143-149
  259: { color: { k: 'const', r: 255, g: 255, b: 255, a: 255 }, tex: 'vanilla/Glow_376.png' },  // KazzymodusChestpiece :152-158
  260: { color: { k: 'const', r: 255, g: 255, b: 255, a: 255 } },             // PalworldPalMetalArmorBody（色案 :679-683 同族白）
};

// ---- 腿甲（:746-806）----
export const LEGS_GLOW: Readonly<Record<number, ArmorGlowEntry>> = {
  110: { mask: 199, color: { k: 'const', r: 250, g: 250, b: 250, a: 0 } },    // VortexLeggings :779-789
  111: { mask: 17, color: { k: 'const', r: 250, g: 250, b: 250, a: 0 } },     // NebulaLeggings :746-751
  130: { mask: 187, color: { k: 'const', r: 252, g: 252, b: 252, a: 0 } },    // StardustLeggings :800-806（127×4=508 byte 截断 252）
  134: { mask: 212, color: { k: 'const', r: 255, g: 255, b: 255, a: 127 } },  // LokisGreaves :795-799
  157: { mask: 249, color: { k: 'arkhalis' } },                               // ArkhalisPants_Male :752-756
  158: { mask: 250, color: { k: 'arkhalis' } },                               // ArkhalisPants_Female :757-761
  210: { mask: 274, color: { k: 'const', r: 230, g: 230, b: 230, a: 60 }, jitter: 2 },  // GroxTheGreatGreaves :762-766
  222: { mask: 303, color: { k: 'mtPulse' } },                                // TimelessTravelerBottom :767-773
  225: { mask: 306, color: { k: 'const', r: 200, g: 200, b: 200, a: 150 } },  // CapricornLegs :774-778
  226: { mask: 307, color: { k: 'const', r: 200, g: 200, b: 200, a: 150 } },  // CapricornTail :779-783
};

/** 尾批登记（缺依赖不占位）——★BJ625 两件已落刀清空：271 TV 屏态机（tvScreenState/
 *  tvScreenGlowFrame+渲染侧 tv 输入）、269 前管 308（frontTube 叠条+渲染侧
 *  Extra_214 本体画,资产在库 40×1120）。表保留=API 兼容（BJ597 消费面）。 */
export const ARMOR_GLOW_DEFERRED: ReadonlyArray<{ slot: 'head' | 'body' | 'legs'; id: number; mask: number; reason: string }> = [];

/** ★BJ625件1 TV 屏态机（DrawPlayer_Head_GetTVScreen PlayerDrawLayers.cs:2516-2539
 *  1:1，优先序=原版 if 链）：危险（NPC.AnyDanger）→4 / 低血（statLife≤
 *  statLifeMax2/4）→1 / 邪恶群系（ZoneCorrupt∪ZoneCrimson∪ZoneGraveyard）→0 静噪
 *  / 湿（wet）→2 / 节庆（townNPCs≥3 ∪ BirthdayParty.PartyIsUp ∪ LanternNight.
 *  LanternsUp）→5 / 缺省 3。输入布尔=渲染侧/Game 侧既有量映射（anyDanger=
 *  Game.npcAnyDanger 每帧快照注入;湿=Player.wetSticky（原版 wet 唯一锚）;城镇数=
 *  scene.townNPCCount（±1920×±1200 窗=原版 plr.townNPCs 同源））。 */
export function tvScreenState(i: {
  anyDanger: boolean; lowLife: boolean; evilZone: boolean; wet: boolean; festive: boolean;
}): number {
  if (i.anyDanger) return 4;
  if (i.lowLife) return 1;
  if (i.evilZone) return 0;
  if (i.wet) return 2;
  if (i.festive) return 5;
  return 3;
}

/** Glow_309 帧位（PlayerDrawLayers.cs:2365-2386 1:1）：行=miscCounter%20/5（int 除）；
 *  态 5 覆写 0、眨眼（PlayerEyeHelper.EyeFrameToShow>0）→2；态 0（静噪）=不画
 *  （null——原版 `if (num19 != 0)` 门 :2362）。列=屏态 1..5,帧 40×56、列距 42
 *  （Frame(6,4,·,·,-2)：252/6-2=40、224/4=56）。 */
export function tvScreenGlowFrame(
  miscCounter: number, state: number, blink: boolean,
): { state: number; frameY: number } | null {
  if (state === 0) return null;
  let frameY = Math.floor((miscCounter % 20) / 5);
  if (state === 5) frameY = blink ? 2 : 0;
  return { state, frameY };
}

// ---- 色式解算（纯函数；tint/alpha 已含全部乘区）----
export interface GlowColorInput { mt: number; miscCounter: number; undershirt: RGB }

export interface ResolvedGlowColor { tint: [number, number, number]; alpha: number; blend: 'add' | 'over' }

/** WrappedLerp(0,1,t)（Utils.cs:305-313 三角波）→ Remap 0.8..1 / 0.85..1（:168/:186） */
export function armorGlowPulse(miscCounter: number, lo: number): number {
  const t = (miscCounter % 100) / 100;
  const wrap = t < 0.5 ? t * 2 : 2 - t * 2;
  return lo + wrap * (1 - lo);
}

export function resolveArmorGlowColor(c: ArmorGlowColor, g: GlowColorInput): ResolvedGlowColor {
  switch (c.k) {
    case 'const': {
      const blend = c.a === 0 ? 'add' as const : 'over' as const;
      return {
        tint: [c.r / 255, c.g / 255, c.b / 255],
        alpha: blend === 'add' ? 1 : c.a / 255,   // A=0 纯加法：贡献=RGB（alpha 不参与）
        blend,
      };
    }
    case 'mtPulse': {                              // (255³)×n 全通道（n=(mt/255)²）
      const n = (g.mt / 255) ** 2;
      return { tint: [n, n, n], alpha: n, blend: 'over' };
    }
    case 'mtPulseA0': {                            // (255³,0)×n → 纯加法
      const n = (g.mt / 255) ** 2;
      return { tint: [n, n, n], alpha: 1, blend: 'add' };
    }
    case 'arkhalis':                               // underShirt、A=180（:519-520）
      return {
        tint: [g.undershirt.r / 255, g.undershirt.g / 255, g.undershirt.b / 255],
        alpha: 180 / 255,
        blend: 'over',
      };
    case 'chickenBones': {
      const p = armorGlowPulse(g.miscCounter, 0.8);
      return { tint: [p, p, p], alpha: 1, blend: 'add' };
    }
    case 'luna': {
      const p = armorGlowPulse(g.miscCounter, 0.85);
      return { tint: [p, p, p], alpha: (100 / 255) * p, blend: 'over' };
    }
  }
}

// ---- 叠画计划（纯函数；坐标=doll 局部，帧左上原点系）----
export interface ArmorGlowOp {
  tex: string;
  sx: number; sy: number; sw: number; sh: number;
  /** doll 局部落点（帧左上 (−20, frameTop) 基准） */
  dx: number; dy: number;
  blend: 'add' | 'over';
  tint: [number, number, number];
  alpha: number;
  /** ★BJ604件3 合成分解（XNA 预乘 AlphaBlend 精确重放）：bake = draw#1（source-over
   *  ×alpha）的 RGB 补偿 min(1,r_f/α_f)（mul 约分,undefined=恒等免烘）；
   *  boost = draw#2（'lighter'×1）补差 max(0,r_f−α_f)·mul（R>A 时单 bake 截断,
   *  两拍和恰=r_f）。add（A=0）无衰减拍 → bake=tint 全额走 lighter×alpha。 */
  bake?: [number, number, number];
  boost?: [number, number, number];
  /** 抖动拷贝数（flush 逐份独立随机；区间 px） */
  copies?: number;
  jx?: [number, number];
  jy?: [number, number];
  /** pet 臂旋转（绕 pivot，doll 局部） */
  rot?: number;
  pivot?: [number, number];
}

export interface ArmorGlowCtx {
  head: number; body: number; legs: number;
  female: boolean;
  undershirt: RGB;
  /** 身/腿 glow 源行（bodyFrame/legFrame 帧行） */
  rowsBody: number; rowsLegs: number;
  /** 坐姿切片参数（null=站姿整帧） */
  sit: { legIndex: number; seatYOffset: number; body: number } | null;
  pet: DollPetArm | null;
  mt: number; miscCounter: number;
  /** ★BJ625件1 TV 头 271 屏态输入（head==271 时必填;null=非 TV 头/未接线→
   *  静噪同形不画——原版 GetTVScreen 返回 0 同门）。state=tvScreenState 产物、
   *  blink=Player.eyeFrame>0（EyeFrameToShow）。 */
  tv?: { state: number; blink: boolean } | null;
  /** 最终乘区（眨眼/微光 bodyAlpha × stealth s'²）——烘进 alpha */
  mul: number;
}

const FRAME_W = 40;
const FRAME_H = 56;
const PAD = 4;

/** ★BJ604件3（2026-10-10）：op 合成分解（原版锚 PlayerDrawSet.cs:806-811 尾拍
 *  GetImmuneAlphaPure=Color.Multiply【整色四通道乘】× mul + XNA SpriteBatch 预乘
 *  AlphaBlend=(One,InvSrcAlpha)）——终色 c=(R,G,B,A)·mul ⇒ RGB 面因子
 *  r_f=R/255·mul、dst 衰减 α_f=A/255·mul 两因子独立。旧 alpha-only flush 单旋钮
 *  globalAlpha 把 α_f 当 r_f（R≠A 全族偏差：Lokis(255,127) ×0.498 应 ×1、
 *  Grox(230,60) ×0.235 应 ×0.902、arkhalis 白 ×0.706 应 ×underShirt 色、
 *  luna ×0.392p 应 ×p、add 族 127/100 灰 2-2.55× 过亮、mtPulseA0/chickenBones
 *  脉冲丢失）。canvas 两旋钮精确分解：bake=min(1,r_f_unit/α_f_unit)（draw#1
 *  source-over×alpha 的 RGB 补偿,mul 约分恒 ≤1 免截断）+boost=max(0,r_f−α_f)
 *  （draw#2 'lighter'×1 补差拍；min+max 恰=r_f,byte 域无截断）。
 *  R==A 档（mtPulse (n,n,n,n)）bake=1/boost=0 → 双字段省略=flush 旧路径逐位。 */
export function armorGlowBakeBoost(
  rc: ResolvedGlowColor, mul: number,
): { bake?: [number, number, number]; boost?: [number, number, number] } {
  if (rc.blend === 'add') {
    return { bake: [rc.tint[0], rc.tint[1], rc.tint[2]] };   // A=0：无 dst 衰减,全额 lighter×alpha
  }
  const a0 = rc.alpha;                                       // α_f unit（mul 约分）
  const bake: [number, number, number] = [
    Math.min(1, rc.tint[0] / a0), Math.min(1, rc.tint[1] / a0), Math.min(1, rc.tint[2] / a0),
  ];
  const boost: [number, number, number] = [
    Math.max(0, rc.tint[0] - a0) * mul, Math.max(0, rc.tint[1] - a0) * mul,
    Math.max(0, rc.tint[2] - a0) * mul,
  ];
  return {
    bake: (bake[0] < 0.999 || bake[1] < 0.999 || bake[2] < 0.999) ? bake : undefined,
    boost: (boost[0] > 1e-4 || boost[1] > 1e-4 || boost[2] > 1e-4) ? boost : undefined,
  };
}
/** 双抖动档区间（Grox 族：Main.rand.Next(−10,10)×0.125 → [−1.25,1.125] 离散 20 档;
 *  :2392/:1564/:68/:95/:1005/:1487 六站同式。★C13-F9 登记:本仓 Math.random 连续
 *  [−1.25,1.25] 近似——原版每 miscCounter/4 帧重掷 LCG 种子的相位面未建模,登记） */
const JITTER_125: [number, number] = [-1.25, 1.25];
/** 学徒火头（head 211 :2412-2413）：x=RandomInt(−10,11)×0.2、y=RandomInt(−14,1)×0.15 */
const JITTER_APPR_HEAD: [[number, number], [number, number]] = [[-2, 2], [-2.1, 0]];
/** 学徒火身（body 205 :3673-3683）：抖在 position 位（同本体式,与 head 211 同构——
 *  DrawData position 项 `+ new Vector2(bodyFrame.Width/2 + num3, bodyFrame.Height/2 + num4)`,
 *  origin=bodyVect 不动 → 视觉偏移 = +num3/+num4 无反向）：x=RandomInt(−10,11)×0.2、
 *  y=RandomInt(−10,1)×0.15=[−1.5,0]（RandomInt(min,max)=[min,max) 含下不含上,Utils.cs:2448）。
 *  ★C13-F8 翻案:旧值 y=[0,1.5] 系「抖在 origin → 位置反向」误读（原版抖在 position 位） */
const JITTER_APPR_BODY: [[number, number], [number, number]] = [[-2, 2], [-1.5, 0]];

function glowTex(mask: number): string {
  return `vanilla/Glow_${mask}.png`;
}

/** 单条 glow 叠画 op（整帧 40×56 源 = 行×56；1118 高贴图越界钳由 flush 侧按
 *  img.height 收口——与坐骑 glow 层同习语） */
function stripOp(mask: number, srcRow: number, frameTop: number, rc: ResolvedGlowColor,
  mul: number, e?: { jitter?: 2 | 4; jx?: [number, number]; jy?: [number, number] }): ArmorGlowOp {
  return {
    tex: glowTex(mask),
    sx: 0, sy: srcRow * FRAME_H, sw: FRAME_W, sh: FRAME_H,
    dx: -FRAME_W / 2, dy: frameTop,
    blend: rc.blend, tint: rc.tint,
    alpha: rc.alpha * mul,
    ...armorGlowBakeBoost(rc, mul),               // ★BJ604件3 合成分解
    copies: e?.jitter,
    jx: e?.jx, jy: e?.jy,
  };
}

export function isFemaleSkin(skinVariant: number): boolean {
  return !MALE_VARIANTS.includes(skinVariant);
}

/** 甲位 glow 叠画计划（PlayerDrawSet SetPassColors + 四叠画站 1:1 数据化）。
 *  op 序 = 原版层序：腿(13_Leggings) → 身(17_Torso) → 头(21_Head) → 臂(28_Arm)。 */
export function armorGlowOps(c: ArmorGlowCtx): ArmorGlowOp[] {
  const ops: ArmorGlowOp[] = [];
  if (c.head <= 0 && c.body <= 0 && c.legs <= 0) return ops;
  const frameTop = c.sit ? -(FRAME_H + 8 - PAD) : -(FRAME_H - PAD);   // 坐姿帧 64 高（烘焙扩 8px）
  const rcOf = (col: ArmorGlowColor) => resolveArmorGlowColor(col, c);
  // ---- 腿（:1556-1573；坐姿走 :1478-1495 切片表）----
  const legs = c.legs > 0 ? LEGS_GLOW[c.legs] : undefined;
  if (legs && c.legs > 0) {
    const rc = rcOf(legs.color);
    if (c.sit) {
      // 坐姿 274 抖动双拷贝同在（:1483-1491 legsOffset 逐份 ±1.25px）
      const jit = legs.jitter === 2 ? { copies: 2 as const, jx: JITTER_125, jy: JITTER_125 } : undefined;
      for (const s of sittingSlicePlan(c.sit.legIndex, false, c.sit.body, c.sit.seatYOffset, c.rowsLegs)) {
        ops.push({
          tex: glowTex(legs.mask),
          sx: s.sx, sy: s.sy, sw: s.sw, sh: s.sh,
          dx: -FRAME_W / 2 + s.dx, dy: frameTop + s.dy,
          blend: rc.blend, tint: rc.tint, alpha: rc.alpha * c.mul,
          ...armorGlowBakeBoost(rc, c.mul),          // ★BJ604件3 合成分解
          copies: jit?.copies, jx: jit?.jx, jy: jit?.jy,
        });
      }
    } else {
      ops.push(stripOp(legs.mask, c.rowsLegs, frameTop, rc, c.mul,
        legs.jitter === 2 ? { jitter: 2, jx: JITTER_125, jy: JITTER_125 } : undefined));
    }
  }
  // ---- 身（GlowMask 条族 :1950-1955 + 臂 :3659-3663）----
  const body = c.body > 0 ? BODY_GLOW[c.body] : undefined;
  if (body) {
    const rc = rcOf(body.color);
    const mask = c.female ? body.maskF : body.maskM;
    const jit = c.body === 205
      ? { jitter: 4 as const, jx: JITTER_APPR_BODY[0], jy: JITTER_APPR_BODY[1] }
      : undefined;
    ops.push(stripOp(mask, c.rowsBody, frameTop, rc, c.mul, jit));
    if (body.armMask) ops.push(stripOp(body.armMask, c.rowsBody, frameTop, rc, c.mul));
  }
  // ---- 身·复合半幅族（DrawCompositeArmorPiece :38-162）----
  const comp = c.body > 0 ? BODY_COMPOSITE_GLOW[c.body] : undefined;
  if (comp) {
    const rc = rcOf(comp.color);
    const row = c.rowsBody;
    const torsoX = row === 5 ? 1 : 0;
    const arm = ARM_FRAME[row] ?? ARM_FRAME[0];
    const dyF = c.female ? 2 : 0;
    const hgY = COMPOSITE_BOB_ROWS.has(row) ? -2 : 0;
    const syOff = comp.tex ? 0 : 224;               // 专贴图整幅无偏移；同甲半幅 +224
    const cells: Array<{ x: number; y: number; pet?: boolean }> = [
      { x: 1, y: 1 + dyF },                         // 后肩
      c.pet ? { x: 8, y: c.pet.stretch, pet: true } : { x: arm[0], y: arm[1] + 2 },  // 后臂
      { x: torsoX, y: dyF },                        // 躯干
      { x: 0, y: 1 + dyF },                         // 前肩
      { x: arm[0], y: arm[1] },                     // 前臂
    ];
    for (const cell of cells) {
      const base: ArmorGlowOp = {
        tex: comp.tex ?? `vanilla/Armor_Armor_${c.body}.png`,
        sx: cell.x * FRAME_W, sy: cell.y * FRAME_H + syOff, sw: FRAME_W, sh: FRAME_H,
        dx: -FRAME_W / 2, dy: frameTop + hgY,
        blend: rc.blend, tint: rc.tint, alpha: rc.alpha * c.mul,
        ...armorGlowBakeBoost(rc, c.mul),            // ★BJ604件3 合成分解
        copies: comp.jitter, jx: comp.jitter ? JITTER_125 : undefined,
        jy: comp.jitter ? JITTER_125 : undefined,
      };
      if (cell.pet && c.pet) {
        base.rot = c.pet.rot;
        // 烘焙枢轴 (26,30)+hgY（PaperDoll PET_ARM_PIVOT）→ doll 局部 (6, 30+hgY)+frameTop
        base.pivot = [-FRAME_W / 2 + 26, frameTop + 30 + hgY];
      }
      ops.push(base);
    }
  }
  // ---- 头（:2357-2401；★BJ625 271 屏态机/269 前管 308 已收）----
  const head = c.head > 0 ? HEAD_GLOW[c.head] : undefined;
  if (head) {
    const rc = rcOf(head.color);
    if (head.tv) {
      // ★BJ625件1：Glow_309 6 列×4 行格机（:2359-2387）——列=屏态、行=帧位
      //（tvScreenGlowFrame 派生;静噪态 0=不画）。几何 = Frame(6,4,·,·,-2)：
      // sx=42×state（列距 252/6）、sy=56×frameY、帧 40×56（42-2=40）。
      const tv = tvScreenGlowFrame(c.miscCounter, c.tv?.state ?? 0, c.tv?.blink ?? false);
      if (tv) {
        ops.push({
          tex: glowTex(head.mask), sx: 42 * tv.state, sy: 56 * tv.frameY, sw: 40, sh: 56,
          dx: -FRAME_W / 2, dy: frameTop,
          blend: rc.blend, tint: rc.tint, alpha: rc.alpha * c.mul,
          ...armorGlowBakeBoost(rc, c.mul),
        });
      }
    } else {
      const jit = head.jitter === 2
        ? { jitter: 2 as const, jx: JITTER_125, jy: JITTER_125 }
        : head.jitter === 4
          ? { jitter: 4 as const, jx: JITTER_APPR_HEAD[0], jy: JITTER_APPR_HEAD[1] }
          : undefined;
      ops.push(stripOp(head.mask, c.rowsBody, frameTop, rc, c.mul, jit));
      // ★BJ625件2：前管第二叠条（head 269 Glow_308——FrontShoulder 站 :104-118/
      //  :3798-3810 与头罩条同锚同源矩形同色双画;本体 Extra_214 渲染侧画）
      if (head.frontTube) ops.push(stripOp(head.frontTube, c.rowsBody, frameTop, rc, c.mul));
    }
  }
  return ops;
}
