// 配饰身上贴图绘制槽运行时（tools/extract-acc-drawslots.mjs → vanilla-acc-drawslots.json；
// ★基准 1457：提取器 --ver/SW_VER 选标杆,2026-08-23 起缺省 1457 再生）。
// 原版链路：Item.backSlot/frontSlot/... 11 槽位字段（Item.cs SetDefaults1-5）→
// Player.UpdateVisibleAccessories/UpdateVisibleAccessory（★1457 Player.cs:37036/:37153，
// 功能槽 3-9 !hide 门 + 社交槽 13-19 无条件,逐槽【后写覆盖前写】）→
// PlayerDrawLayers 十一族绘制层（LegacyPlayerRenderer.cs:170-236 层序）。
// 贴图族：TextureAssets.AccBack/AccFront/AccShield/AccShoes/AccWaist/AccNeck/
// AccFace/AccBalloon/AccHandsOn/AccHandsOff/AccBeard（public/sprites/vanilla/Acc_*.png，
// 身架族 40×1120 = 40×56×20 行,bodyFrame 对齐;气球非躯干架 52×224 = 52×56×4 帧竖条）。
import slotsJson from './vanilla-acc-drawslots.json';

/** 11 绘制槽（值 = ArmorIDs.* 槽序号,>0 有效;缺省 = 该族无贴图） */
export interface AccDrawSlots {
  back?: number; front?: number; shield?: number; shoe?: number; waist?: number;
  neck?: number; face?: number; balloon?: number; handOn?: number; handOff?: number; beard?: number;
}

const SLOTS = slotsJson as Record<string, AccDrawSlots>;

/** vid → 绘制槽（无任何贴图槽的 vid 返回 null） */
export function accDrawSlotsOf(vid: number): AccDrawSlots | null {
  return vid > 0 ? (SLOTS[String(vid)] ?? null) : null;
}

// ---- ArmorIDs.Sets 路由表（★树基准 1457：Terraria.ID/ArmorIDs.cs 1457 字面集合；
//      文中 1456 行号/集合均为历史增量锚——两版集合差异已核：PreventFaceMaskDraw −102、
//      DrawFaceMaskUnderHeadLayer +203、Back/Front IsACape +41/+17、Waist
//      UsesTorsoFraming+IsABelt +17、HidesCompositeShoulders +17、Head/Body/HandOn
//      Count +8/+3/+2、UsesNewFramingCode 扩段；DrawInBackpackLayer/DrawInTailLayer 同值）----

/** Balloon.Sets.UsesTorsoFraming / DrawInFrontOfBackArmLayer（ArmorIDs.cs:2213-2215）
 *  ——两者同集 {18 Royal Scepter}：躯干架贴图 + 画在持物臂前层 */
export const BALLOON_TORSO_FRAMING = new Set([18]);

/** Waist.Sets.UsesTorsoFraming（★1457 ArmorIDs.cs:1945：{5 工具腰带,10 黑腰带/大师忍者
 *  gear,12 武僧腰带,17 MysticArtsSash 秘术腰封}；1456 :1917 无 17）——命中用 bodyFrame,
 * 否则 legFrame（DrawPlayer_19_WaistAcc :2070-2072）。★V1 复核勘误：17=MysticArtsSash
 * （Waist 命名空间 :1984），DruidicSerpentCloak 是 Front 17/Back 41 非本族 */
export const WAIST_TORSO_FRAMING = new Set([5, 10, 12, 17]);

/** Face 三层路由（UpdateItemDye :9386-9402 + DrawPlayer_22_FaceAcc :2807）：
 *  underHair（5 眼罩,画在发层之下=本仓并入 face 主层,登记偏差）/
 *  mask（22 焊工面罩）/ flower（1 大自然的恩赐,6 黑曜石玫瑰,8 丛林玫瑰,9 奥术花）/
 *  head（12/10/13/11 骷髅族）——face 槽按集合分流到 face/faceMask/faceFlower/faceHead */
export const FACE_UNDER_HAIR = new Set([5]);
export const FACE_MASK_LAYER = new Set([22]);
export const FACE_FLOWER_LAYER = new Set([1, 6, 8, 9]);
export const FACE_HEAD_LAYER = new Set([12, 10, 13, 11]);

/** Shoe.Sets.MaleToFemaleID（ArmorIDs.cs:1841：25 玻璃拖鞋男 → 26 女）——
 *  UpdateVisibleAccessory :36496 `!Male` 换档;本仓无性别字段恒男档,登记 */
export const SHOE_MALE_TO_FEMALE: Record<number, number> = { 25: 26 };

/** Shoe.Sets.IsARollerSkate（ArmorIDs.cs:1842）→ GetShoeDrawOffset (0,2)（Player.cs:4713-4721） */
export const SHOE_ROLLER_SKATE = new Set([27, 28, 29, 30]);

/** Face 19 骨盔 GetFaceDrawOffset (0,-6)·Directions（Player.cs:4370-4372）;
 *  1/6/8/9 花族与 22 面罩的头盔条件偏移（268/270/283+长头盔表 :4352-4390）未建模登记 */
export const FACE_DRAW_OFFSET: Record<number, [number, number]> = { 19: [0, -6] };

// ---- Back 子层路由（1456 未建模细项批 2026-08-23：DrawPlayer_08_Backpacks/
//      08_1_Tails/10_BackAcc 三层拆画）----

/** Back.Sets.DrawInBackpackLayer（ArmorIDs.cs:1695）——UpdateVisibleAccessory
 *  :36456-36460 把命中者写 Player.backpack（独立字段,不占 back 不清 front）,
 *  DrawPlayer_08_Backpacks（PlayerDrawLayers.cs:479-488）画在翼层之前 */
export const BACK_DRAW_IN_BACKPACK = new Set([7, 8, 9, 10, 15, 16, 32, 33]);

/** Back.Sets.DrawInTailLayer（ArmorIDs.cs:1697）——写 Player.tail,
 *  DrawPlayer_08_1_Tails（:568-587）背包后/翼前;坐姿 (0,-2) 偏移（:575-577）+
 *  !Male (2·dir,0) 偏移（:578,本仓无性别字段恒男档,登记） */
export const BACK_DRAW_IN_TAIL = new Set([18, 19, 21, 25, 26, 27, 28]);

/** Back.Sets.IsACape（★1457 ArmorIDs.cs:1721：1456 :1699 基础上 +41
 *  DruidicSerpentCloak）——front 13（DontDrawIfWearingAScarfOrCape）
 *  的披风互斥门用（PlayerDrawLayers.cs:3893/:3936） */
export const BACK_IS_ACAPE = new Set([1, 2, 3, 4, 5, 6, 14, 24, 34, 36, 39, 41]);

/** MountID.Sets.DoesNotOverrideBackpackDraw（MountID.cs:17）——背包层坐骑豁免
 *  （DrawPlayer_08_Backpacks :479：!mount.Active || 命中此集仍画） */
export const MOUNT_BACKPACK_OK = new Set([57, 58, 59, 60]);

/** Neck.Sets.IsAScarf（ArmorIDs.cs:2104：{8,9}）——front 13 围巾互斥门左支 */
export const NECK_IS_SCARF = new Set([8, 9]);

/** Front.Sets.DontDrawIfWearingAScarfOrCape（ArmorIDs.cs:1793：{13}）——
 *  围巾/披风任一在身即整层不画（:3893/:3936 双层同门） */
export const FRONT_SCARF_CAPE_HIDE = new Set([13]);

/** Front.Sets.DrawsInNeckLayerRegardlessOfPlayerFrame（ArmorIDs.cs:1791：{13}）——
 *  front 13 前半走颈层档（FaceAcc 后 LegacyPlayerRenderer.cs:220-224）;
 *  DrawsInNeckLayer={6}（:1789）仅坐姿帧行 5 生效（PlayerDrawSet.cs:1766-1770,
 *  本仓 front 6 无表项,登记） */
export const FRONT_NECK_LAYER_ALWAYS = new Set([13]);

/** DrawSittingLegs 切片表（★V2b 复核勘误：原表 [[2,54],[0,2]] 是 217 族【特例支】
 *  非默认支！PlayerDrawLayers.cs:1594-1596 默认支 num=2/num2=42/num3=2 → 循环
 *  num10=2..0 三片 [46,10]+[44,2]+[42,2]（:1719-1732：首片 Y+46 高 10、余两片
 *  Height=2 顶带）；特例支（:1608-1716 num3=1/num2=0）=legs 217/169(非 skin)/
 *  177/178/181/182/206 → 两片 [[2,54],[0,2]]。DrawPlayer_14_Shoes :1768 传
 *  legIndex=player.legs 同分支）[sy, h] 对 */
export const SITTING_LEG_SLICES: Array<[number, number]> = [[46, 10], [44, 2], [42, 2]];
export const SITTING_LEG_SLICES_SPECIAL: Array<[number, number]> = [[2, 54], [0, 2]];
/** 特例支 legs 集合（:1608 门 legIndex==169||!skin + case 217/:1703-1707 族） */
export const SITTING_LEG_SPECIAL_LEGS = new Set([169, 177, 178, 181, 182, 206, 217]);

// ---- 脸饰/胡须头盔条件层（1456 未建模细项批 2026-08-23）----

/** GetFaceDrawOffset 头盔条件偏移表（Player.cs:4352-4432）：
 *  face→head→(dx,dy)（原版 ×Directions;本仓镜像空间内 X=朝向系/Y=重力系,直取表值）。
 *  1/6/8/9 花族 head268→(0,6)/270→(8,0);22 面罩 283→(2,0)/长盔表→(0,-2)/
 *  {37,98,149}→(0,-4)/269→(0,-6)/{119,129,132,135,172,214}→(2,-2)/275→(0,2);
 *  19 骨盔无条件 (0,-6)（沿用 FACE_DRAW_OFFSET） */
export const FACE_HELMET_OFFSET: Record<number, Record<number, [number, number]>> = {
  1: { 268: [0, 6], 270: [8, 0] },
  6: { 268: [0, 6], 270: [8, 0] },
  8: { 268: [0, 6], 270: [8, 0] },
  9: { 268: [0, 6], 270: [8, 0] },
  22: {
    283: [2, 0],
    3: [0, -2], 7: [0, -2], 8: [0, -2], 9: [0, -2], 17: [0, -2], 32: [0, -2],
    49: [0, -2], 61: [0, -2], 66: [0, -2], 70: [0, -2], 78: [0, -2], 83: [0, -2],
    86: [0, -2], 89: [0, -2], 101: [0, -2], 103: [0, -2], 104: [0, -2], 105: [0, -2],
    109: [0, -2], 110: [0, -2], 111: [0, -2], 117: [0, -2], 120: [0, -2], 122: [0, -2],
    134: [0, -2], 152: [0, -2], 160: [0, -2], 171: [0, -2], 176: [0, -2], 177: [0, -2],
    189: [0, -2], 204: [0, -2], 237: [0, -2], 256: [0, -2], 282: [0, -2],
    37: [0, -4], 98: [0, -4], 149: [0, -4],
    269: [0, -6],
    119: [2, -2], 129: [2, -2], 132: [2, -2], 135: [2, -2], 172: [2, -2], 214: [2, -2],
    275: [0, 2],
  },
};

/** GetHelmetDrawOffset（Player.cs:4439-4462）非发型依赖档——faceMask/faceFlower
 *  层锚另加 helmetOffset（PlayerDrawLayers.cs:2829/:2851）;222/272 依 hair 15/76/108
 *  （本仓无发型字段,登记）、faceHead 加成族（:4471+）与坐骑加成未建模 */
export const HELMET_DRAW_OFFSET: Record<number, [number, number]> = {
  268: [0, -6], 270: [-10, 0], 275: [0, -4],
};

/** Head.Sets.PreventFaceMaskDraw ∪ DrawFaceMaskUnderHeadLayer（★1457 ArmorIDs.cs:24/:20；
 *  1456 :24/:20 增量 = PreventFaceMaskDraw −102、DrawFaceMaskUnderHeadLayer +203，
 *  并集 70 元不变但成员换血）——faceMask 层头盔隐没门（PlayerDrawLayers.cs:2819-2821） */
export const FACE_MASK_HELMET_HIDE = new Set([
  27, 20, 107, 108, 127, 162, 168, 118, 123, 164, 155, 150, 137, 186, 125,
  136, 153, 154, 169, 148, 165, 151, 173, 146, 147, 175, 193, 271, 268, 260, 221,
  236, 208, 209, 207, 187, 192, 188, 276, 270, 58, 77, 142, 152, 241, 210, 22, 196,
  26, 51, 289, 81, 92, 106, 291, 10, 12, 178, 198, 267, 279, 160, 52, 53, 71, 55,
  166, 167, 278, 203,
]);

/** Head.Sets.PreventFaceFlowerDraw（ArmorIDs.cs:24）——faceFlower 层头盔隐没门
 *  （PlayerDrawLayers.cs:2836-2838） */
export const FACE_FLOWER_HELMET_HIDE = new Set([92, 275]);

/** Head.Sets.HidesHead（ArmorIDs.cs:18：{38,135,269,282,288}）——faceHead（骷髅族
 *  10-13）层头盔门（PlayerDrawLayers.cs:2590 !flag 才画）+ underHair 5 同门
 *  （:2596 头层路径;本仓 face 单层合并,两门并此一处） */
export const HEAD_HIDES_HEAD = new Set([38, 135, 269, 282, 288]);

/** Head.Sets.PreventBeardDraw（ArmorIDs.cs:26,48 头）——胡须层头盔门
 *  （PlayerDrawLayers.cs:2429-2433 flag7） */
export const PREVENT_BEARD_DRAW = new Set([
  118, 119, 107, 129, 127, 125, 136, 162, 168, 210, 213, 28, 135, 31, 17, 261,
  169, 186, 47, 22, 105, 102, 120, 137, 199, 207, 260, 132, 155, 179, 108, 153,
  164, 172, 208, 241, 271, 48, 154, 188, 187, 209, 46, 123, 269, 185, 276,
]);

/** Beard.Sets.UseHairColor（ArmorIDs.cs:2281：{2,3,4} 威尔逊族）——原版画
 *  colorHair（玩家发色）非 colorArmorHead（PlayerDrawLayers.cs:2436-2439）。
 *  ★定谳登记不改码：本仓无发色系统（捏人 hairColor 未建模,Player 侧无宿主字段）,
 *  胡须画原生色=默认发色外观,接发色系统时一并接 */
export const BEARD_USE_HAIR_COLOR = new Set([2, 3, 4]);

// ---- 举盾光环/格挡视觉纯函数（DrawPlayer_25_Shield PlayerDrawLayers.cs:3073-3125）----

/** 举盾光环档（:3073-3090）：num=sin(GlobalTimeWrappedHourly·2π)、x=2.5+1.5·num、
 *  色档=0.45-0.15·num（原版 colorArmorBody.A=0 → 预乘 α 下=全额加算,渲染侧用
 *  'lighter'+alpha=色档近似）;4 份绕 (x,0) 旋 k/4·2π */
export function shieldHaloFactor(time: number): { x: number; a: number } {
  const num = Math.sin(time * Math.PI * 2);
  return { x: 2.5 + 1.5 * num, a: 0.45 - 0.15 * num };
}

/** 格挡弹开档（:3108-3125）：t=shieldParryTimeLeft/20、scale=1+1.5t、alpha=1-t、
 *  锚点沿 (锚-玩家中心)·1.5t 外推（本仓局部系玩家中心=(0,-h/2)、盾 origin=(0,-24)） */
export function shieldParryTransform(parryLeft: number, playerH: number): {
  t: number; scale: number; alpha: number; dx: number; dy: number;
} {
  const t = parryLeft / 20;
  const scale = 1 + 1.5 * t;
  return { t, scale, alpha: 1 - t, dx: 0, dy: (-24 + playerH / 2) * 1.5 * t };
}

/** Main.OffsetsPlayerOffhand（Main.cs:456-477,20 行 bodyFrame 行表）——
 *  气球非躯干架锚点用（DrawPlayer_11_Balloons :1152） */
export const OFFSETS_PLAYER_OFFHAND: Array<[number, number]> = [
  [14, 20], [14, 20], [14, 20], [14, 18], [14, 20],
  [16, 4], [16, 16], [18, 14], [18, 14], [18, 14],
  [16, 16], [16, 16], [16, 16], [16, 16], [14, 14],
  [14, 14], [12, 14], [14, 16], [16, 16], [16, 16],
];
