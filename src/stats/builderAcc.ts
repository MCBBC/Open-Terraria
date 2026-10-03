// 建筑配件开关位共享逻辑（★SW-FX19；Player.builderAccStatus 家族 1:1）。
// 金标：Terarria1457/Terraria/Player.cs:40-63（BuilderAccToggleIDs）、:797（数组）/
// :56749（ResetData 缺省 [0]=1）；图标列 UI = Main.cs:48142-48377（DrawBuilderAccToggles
// @(10,77) 24px 步距；★vector=【中心锚】origin=rectangle.Size()/2f :48354——精灵左上
// =vector-(7,7)=(3,70+24n)，hover 盒 CenteredRectangle(:48197) 同心；方块替换/群系炬
// 两图标则 top-left=default(Vector2) 原点）；方块替换图标 = Main.cs:43242-43280；群系炬图标 = :43282-43320；
// 计数 = :48381-48386（GetBuilderAccsCountToShow）；线材可见度消费 = Main.cs:59126-59140；
// [8] 门消费 = Terraria.GameContent/UI/WiresUI.cs:29-45（DrawWires）；
// [10] 消费 = Player.cs:3357 TileReplacementEnabled；[11] 消费 = :3942 UsingBiomeTorches。
import { VI_ID } from '../data/itemKeys';

export type BuilderAccStatus = number[];

/** BuilderAccToggleIDs（Player.cs:40-63） */
export enum BACC {
  RulerLine = 0,
  RulerGrid = 1,
  AutoActuate = 2,
  AutoPaint = 3,
  WireVisibility_Red = 4,
  WireVisibility_Green = 5,
  WireVisibility_Blue = 6,
  WireVisibility_Yellow = 7,
  HideAllWires = 8,
  WireVisibility_Actuators = 9,
  BlockSwap = 10,
  TorchBiome = 11,
}

export const BUILDER_ACC_COUNT = 12;                        // Player.cs:63 Count

/** ResetData 缺省（Player.cs:56749 builderAccStatus[0]=1——标尺线默认关） */
export function builderAccDefaults(): BuilderAccStatus {
  const a = new Array<number>(BUILDER_ACC_COUNT).fill(0);
  a[BACC.RulerLine] = 1;
  return a;
}

/** 配饰旗位门（RefreshMechanicalAccsFromItemType Player.cs:12897-12913 1:1）：
 *  3619 Mechanical Lens/3611 Architect Gadget Pack → InfoAccMechShowWires；
 *  486 Ruler/3611 → rulerLine；2799 Mechanical Ruler/3611 → rulerGrid；
 *  2216/3061/5126 喷漆器族 → autoPaint；3624 Presserator → autoActuator。
 *  调用方传「装备 vid 谓词」保持本模块零实体依赖。 */
export function builderAccGateSet(has: (vid: number) => boolean): {
  rulerLine: boolean; rulerGrid: boolean; autoPaint: boolean;
  autoActuator: boolean; infoAccMechShowWires: boolean;
} {
  return {
    rulerLine: has(486) || has(3611),                      // :12903/:12905
    rulerGrid: has(2799) || has(3611),                     // :12907/:12909
    autoPaint: has(2216) || has(3061) || has(5126),        // :12911-12913
    autoActuator: has(3624),                               // :12915
    infoAccMechShowWires: has(3619) || has(3611),          // :12899-12901
  };
}

/** 图标列单项二态翻转（Main.cs:48201/:48221/:48241/:48261/:48281——`0↔1`） */
export function toggleBuilderAccBit(status: BuilderAccStatus, i: number): void {
  status[i] = status[i] === 0 ? 1 : 0;
}

/** 线材可见度四态循环（Main.cs:48340-48343 1:1 quirk：`++` 后 `>=3 → 0`——
 *  点击路径只走 Bright(0)→Normal(1)→Faded(2)→(跳回 0)，Hidden(3) 不可经点击到达
 *  （仅旧档/联机同步可携带），hover 文案仍列 4 态 :48300-48320） */
export function cycleWireVisibility(status: BuilderAccStatus, i: number): void {
  status[i]++;
  if (status[i] >= 3) status[i] = 0;
}

/** 图标列槽位次序（Main.cs:48162-48346：num2=10 轮、i=0→num3=8、i=1→num3=9、
 *  其余 num3=i-2 ⇒ 绘制序 8,9,0,1,2,3,4,5,6,7） */
export interface BuilderAccIconSlot {
  accIndex: number;
  /** 线材可见度族（四态循环+族文案）——false = 二态翻转 */
  wireMode: boolean;
}

export const BUILDER_ACC_ICON_ORDER: readonly BuilderAccIconSlot[] = [
  { accIndex: BACC.HideAllWires, wireMode: false },
  { accIndex: BACC.WireVisibility_Actuators, wireMode: true },
  { accIndex: BACC.RulerLine, wireMode: false },
  { accIndex: BACC.RulerGrid, wireMode: false },
  { accIndex: BACC.AutoActuate, wireMode: false },
  { accIndex: BACC.AutoPaint, wireMode: false },
  // 4-7 按 num3 顺序绘制;★注意 Main.cs:48300-48312 的 hover 文案映射与枚举名错位
  // （num3=5 → Game.BlueWires / num3=6 → Game.GreenWires,而枚举 Green=5/Blue=6）——
  // 文案随 num3 走（UI paintSlot 同映射）,此处只保绘制位序。
  { accIndex: BACC.WireVisibility_Red, wireMode: true },
  { accIndex: BACC.WireVisibility_Green, wireMode: true },
  { accIndex: BACC.WireVisibility_Blue, wireMode: true },
  { accIndex: BACC.WireVisibility_Yellow, wireMode: true },
];

/** GetBuilderAccsCountToShow（Main.cs:48381-48386）：totalDrawnIcons =
 *  InfoAccMechShowWires×6 + rulerLine + rulerGrid + autoActuator + autoPaint +
 *  1（方块替换恒 1,blockReplaceIcons）+ unlockedBiomeTorches(1:0)。
 *  >=10 → 图标列整体上移 24px（:48166 flag）、方块替换图标 y 44→23（:43247-43250）、
 *  群系炬图标 y 68→47（:43289-43292）。
 *  ★SW-FX36：rulerLine 项 = 恒 1——原版 `plr.rulerLine.ToInt()` 读的旗位在
 *  ResetEffects（Player.cs:18808-18809）每拍 `rulerGrid=false; rulerLine=true`,
 *  全仓无置 false 写点（仅 :12903/:15307 置 true）⇒ 旗恒真,计数/图标门（:48193
 *  `if (!player.rulerLine) continue`）对无配饰玩家同样放行 = Ruler 档开关人人
 *  可见（用户实报原版如此）。传参 g.rulerLine 保留形参但不再消费。 */
export function builderAccTotalIcons(g: {
  rulerLine: boolean; rulerGrid: boolean; autoPaint: boolean;
  autoActuator: boolean; infoAccMechShowWires: boolean;
}, unlockedBiomeTorches: boolean): number {
  return (g.infoAccMechShowWires ? 6 : 0) + 1
    + (g.rulerGrid ? 1 : 0) + (g.autoActuator ? 1 : 0) + (g.autoPaint ? 1 : 0)
    + 1 + (unlockedBiomeTorches ? 1 : 0);
}

/** 图标列顶行 Y（★SW-RB11f F4 单源纯函数；Main.cs:48166-48169）：
 *  start.Y=(10,77) → `start.Y += 24 * torchGodIcons`（:48166）→ 每行 +24 →
 *  totalDrawnIcons>=10 时整列再上移 24（:48167-48169 flag 支）。
 *  旧实现漏 torch 支 = 炬神恩赐开∧total<10 时列与方块替换/群系炬图标重叠。 */
export function builderAccColumnTopY(unlockedBiomeTorches: boolean, pushUp: boolean): number {
  return 77 + (unlockedBiomeTorches ? 24 : 0) - (pushUp ? 24 : 0);
}

// ---- ★SW-FX36 标尺族绘制纯公式（Renderer.drawBuilderRulers 消费）----

/** 标尺线 α（Main.cs:47056-47066 + :47104）：speed>6 → 整段早退（null=不画/
 *  不显计数）;num4 = speed≤2 → 1,2..6 线性降 0;最终 tint=Color(0.24,0.8,0.9,1)
 *  ×0.8×num4 ⇒ 返回值 = tint.a（XNA Color*float 全通道乘,rgb 侧消费方按
 *  floor(61·α)/floor(204·α)/floor(229·α) 重烘）。 */
export function rulerLineAlpha(speed: number): number | null {
  if (speed > 6) return null;                       // :47056-47058 `if (!(num <= num2)) return`
  const num4 = speed <= 2 ? 1 : Math.max(0, 1 - (speed - 2) / 6);
  return 0.8 * num4;                                // ×num12=0.8（:47104 num12）
}

/** 标尺网格淡出（Main.cs:47151-47156）：驱动 = Distance(position, shadowPos[2])
 *  （social shadow 4~5 拍滞后——:47151 的 velocity.Length() 赋值是死码）;
 *  num3 = Lerp(0.2,0.7,Clamp(1-dist/6,0,1))。旧码误用瞬时速度 = 行走中过亮。 */
export function rulerGridFade(dist: number): number {
  return 0.2 + 0.5 * Math.max(0, Math.min(1, 1 - dist / 6));
}

/** ★BJ448 网格 dst 衰减罩 α（=tint.a 通道;Main.cs:47162 color 第 4 通道）：
 *  XNA Color(0.24,0.8,0.9,0.5)→byte(61,204,229,127)（(byte)(f·255) 截断）×0.4×num3
 *  全通道乘 ⇒ a = floor(127·0.4·num3)/255（与 Renderer 侧 rgb 烘焙 floor(61·0.4·num3)
 *  同一 byte 链约定;num3∈[0.2,0.7] ⇒ a∈[0.04,0.14]）。消费：tintedExtra 黑模
 *  （α=模板 texA）× 本值 = 逐像素 αs=texA·a,multiply 黑罩给 dst×(1−texA·a)
 *  ——BlendState.AlphaBlend(One/InvSrcAlpha) 衰减项。 */
export function rulerGridMaskAlpha(num3: number): number {
  return Math.floor(127 * 0.4 * num3) / 255;
}

/** ★BJ448 十字 dst 衰减罩 α（=color2.a;Main.cs:47163 (1,0.8,0.9,0.5)×0.5×num3）：
 *  a = floor(127·0.5·num3)/255,num3∈[0.2,0.7] ⇒ a∈[0.05,0.175]。 */
export function rulerCrossMaskAlpha(num3: number): number {
  return Math.floor(127 * 0.5 * num3) / 255;
}

/** 标尺 W×H 计数文本（Main.cs:46189-46194 DrawInterface_33_MouseText）：
 *  (|rulerLineDisplayValues.X|+1)+"x"+(|Y|+1),`num>1||num2>1` 门 ⇒ 1×1 不显。
 *  值源 :47089-47091 = 玩家脚底格→鼠标格跨度（nudge 后）——与放置笔画/墙无关,
 *  悬停任意处都显;纯数字拼串无 l10n 键。返回 null = 不显。 */
export function rulerReadoutText(dx: number, dy: number): string | null {
  const w = Math.abs(dx) + 1;
  const h = Math.abs(dy) + 1;
  return (w > 1 || h > 1) ? `${w}x${h}` : null;
}

// ---- 配饰槽 vid 扫描（Player.cs:12897 旗位判定的仓内等价）----
/** 装备式配饰（armor[3..9] 解锁格——Player.cs:36326 armor[3-7 基座+8 恶魔之心+9 大师]）
 *  当前是否持有 vid（重力地球仪 1131 / 图标门 486/2799/3619/3611/3624/2216/3061/5126）。
 *  ★清偿刀 P：accSlotMax 连续界退役,改逐槽解锁谓词（Player.cs:12669-12690
 *  IsItemSlotUnlockedAndUsable——大师无恶魔心态=8 锁 9 开,连续界不可表达）。
 *  ★未注册 vid → VI_ID=0 → 恒 false（空槽 null 不撞 0）。 */
export function playerAccessoryVidEquipped(
  armor: ReadonlyArray<{ id: number } | null | undefined>,
  isSlotUnlocked: (slot: number) => boolean,
  vid: number,
): boolean {
  if (vid <= 0) return false;
  const want = VI_ID(vid);
  if (want === 0) return false;
  for (let i = 3; i < 10 && i < armor.length; i++) {
    if (!isSlotUnlocked(i)) continue;
    if (armor[i] && armor[i]!.id === want) return true;
  }
  return false;
}

/** ★SW-FX36：背包∪装备 vid 扫描（建筑配件旗位门的 1:1 判定域）。
 *  原版 UpdateEquips（Player.cs:12997-13004）对 inventory[0..57] 逐槽调
 *  RefreshMechanicalAccsFromItemType（信息配件族不必装备,背包/钱币/弹药格都算,
 *  wiki Mechanical_Ruler「carried in the player's inventory」同证）;
 *  装备段经 GrantArmorBenefits（:13025-13032 → :13204-13206,armor[3-9] 配饰槽,
 *  0-2 盔甲位对配饰 vid 恒不可达）。虚空袋支（:13039-13049 bank4,门=背包持
 *  4131 VoidLens+WorksInVoidBag）本仓无袋容器 = 登记债 SW-FX36-D1。
 *  垃圾槽 58 不扫（vanilla j<58）——本仓 trash 亦独立字段,天然排除。 */
export function playerVidCarried(
  slots: ReadonlyArray<{ id: number } | null | undefined>,
  armor: ReadonlyArray<{ id: number } | null | undefined>,
  isSlotUnlocked: (slot: number) => boolean,
  vid: number,
): boolean {
  if (vid <= 0) return false;
  const want = VI_ID(vid);
  if (want === 0) return false;
  for (let i = 0; i < slots.length && i < 58; i++) {
    if (slots[i] && slots[i]!.id === want) return true;
  }
  for (let i = 3; i < 10 && i < armor.length; i++) {   // ★清偿刀 P：逐槽解锁门
    if (!isSlotUnlocked(i)) continue;
    if (armor[i] && armor[i]!.id === want) return true;
  }
  return false;
}
