// 配饰身上贴图绘制槽运行时（tools/extract-acc-drawslots.mjs → vanilla-acc-drawslots.json）。
// 原版链路：Item.backSlot/frontSlot/... 11 槽位字段（Item.cs SetDefaults1-5）→
// Player.UpdateVisibleAccessories/UpdateVisibleAccessory（Player.cs:36324-36520，
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

// ---- ArmorIDs.Sets 路由表（Terraria.ID/ArmorIDs.cs 1456 字面集合）----

/** Balloon.Sets.UsesTorsoFraming / DrawInFrontOfBackArmLayer（ArmorIDs.cs:2213-2215）
 *  ——两者同集 {18 Royal Scepter}：躯干架贴图 + 画在持物臂前层 */
export const BALLOON_TORSO_FRAMING = new Set([18]);

/** Waist.Sets.UsesTorsoFraming（ArmorIDs.cs:1918：{5 工具腰带,10 黑腰带/大师忍者 gear,12 武僧腰带}）
 *  ——命中用 bodyFrame,否则 legFrame（DrawPlayer_19_WaistAcc :2070-2072） */
export const WAIST_TORSO_FRAMING = new Set([5, 10, 12]);

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

/** Main.OffsetsPlayerOffhand（Main.cs:456-477,20 行 bodyFrame 行表）——
 *  气球非躯干架锚点用（DrawPlayer_11_Balloons :1152） */
export const OFFSETS_PLAYER_OFFHAND: Array<[number, number]> = [
  [14, 20], [14, 20], [14, 20], [14, 18], [14, 20],
  [16, 4], [16, 16], [18, 14], [18, 14], [18, 14],
  [16, 16], [16, 16], [16, 16], [16, 16], [14, 14],
  [14, 14], [12, 14], [14, 16], [16, 16], [16, 16],
];
