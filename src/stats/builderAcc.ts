// 建筑配件开关位共享逻辑（★SW-FX19；Player.builderAccStatus 家族 1:1）。
// 金标：Terarria1457/Terraria/Player.cs:40-63（BuilderAccToggleIDs）、:797（数组）/
// :56749（ResetData 缺省 [0]=1）；图标列 UI = Main.cs:48142-48377（DrawBuilderAccToggles
// @(10,77) 24px 步距）；方块替换图标 = Main.cs:43242-43280；群系炬图标 = :43282-43320；
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
 *  群系炬图标 y 68→47（:43289-43292）。 */
export function builderAccTotalIcons(g: {
  rulerLine: boolean; rulerGrid: boolean; autoPaint: boolean;
  autoActuator: boolean; infoAccMechShowWires: boolean;
}, unlockedBiomeTorches: boolean): number {
  return (g.infoAccMechShowWires ? 6 : 0) + (g.rulerLine ? 1 : 0)
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

// ---- 配饰槽 vid 扫描（Player.cs:12897 旗位判定的仓内等价）----
/** 装备式配饰（armor[3..accSlotMax)，Player.cs:36326 armor[3-7 基座+8 恶魔之心]）
 *  当前是否持有 vid（重力地球仪 1131 / 图标门 486/2799/3619/3611/3624/2216/3061/5126）。
 *  ★未注册 vid → VI_ID=0 → 恒 false（空槽 null 不撞 0）。 */
export function playerAccessoryVidEquipped(
  armor: ReadonlyArray<{ id: number } | null | undefined>,
  accSlotMax: number,
  vid: number,
): boolean {
  if (vid <= 0) return false;
  const want = VI_ID(vid);
  if (want === 0) return false;
  for (let i = 3; i < accSlotMax && i < armor.length; i++) {
    if (armor[i] && armor[i]!.id === want) return true;
  }
  return false;
}
