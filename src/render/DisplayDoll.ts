// ★SW-BN6 2026-09-08 模特假人（tile 470）P3 渲染——玩家形体合成器（SW-BL1 分期 P3a）。
// 原版 TEDisplayDoll.Draw（TEDisplayDoll.cs:339-499）：以固定 _dollPlayer
// （skinVariant 10 / hair 15 / skinColor White :118-121）走 LegacyPlayerRenderer 画
// 【完整玩家形体】;pose 消费在【玩家形体帧】（legFrame/bodyFrame 行号）,非 tile 表帧。
// 本仓 SW-BO1 P1（pose+19 槽入库 FurnitureItems）+ P2（TryChangePose 1:1）已落,
// P3 = 本件:复用 compositePaperDoll（实时玩家同链,sw-bj11/bj21 守卫域）按 pose 映射行档。
//
// 分期登记（本批 P3a=形体+行档+光照;后续）:
//   P3b = 持握展示（misc 槽 slots[9] + useStyle 姿态 itemAnimation 驱动 bodyFrame
//         （Player.cs:36598-36640 逐 useStyle 分支）+ 持握弹预览 AI_DisplayDoll
//         （TEDisplayDoll.cs:459-489 OverrideHeldProjectile）;
//   P3c = dye 染色通道（slots[10..18]）、mount（slots[8] ApplyDummyFrameCounters）、
//         tile paint 染色（skinDyePacked PackShader(TilePaintID) :496）、
//         Female 档（frameX/72==1 :355-357,本仓 variant 10 恒男表=原版同表）、
//         net 同步（msg121 pose 广播 :911-913）。
// pose 枚举（DisplayDollPoseID,同 FurnitureItems.ts 头注）:0 Standing / 1 Sitting /
// 2 Jumping / 3 Walking / 4-8 Use1-5。
import { type Appearance, DEFAULT_COLORS, MALE_VARIANTS } from '../player/Appearance';

import { vanillaStatOfVid } from '../data/vanillaItemStats';
import { ITEM_DEFS } from '../data/items';
import { DOLL_SUPPORTED_USE_STYLE_POSES, vanillaUseStyle } from '../world/FurnitureItems';

/** 原版 _dollPlayer 固定外观（TEDisplayDoll.cs:118-121 + Player 默认色 :199-205）。
 *  skinVariant 10 = 模特专用变体（本仓 variantSheetName 链已支持,BJ21 守卫域）。 */
export const DOLL_APPEARANCE: Appearance = {
  name: 'display_doll',
  hair: 15,
  skinVariant: 10,
  hairColor: { ...DEFAULT_COLORS.hairColor },
  skinColor: { r: 255, g: 255, b: 255 },          // :120 skinColor = Color.White
  eyeColor: { ...DEFAULT_COLORS.eyeColor },
  shirtColor: { ...DEFAULT_COLORS.shirtColor },
  undershirtColor: { ...DEFAULT_COLORS.undershirtColor },
  pantsColor: { ...DEFAULT_COLORS.pantsColor },
  shoeColor: { ...DEFAULT_COLORS.shoeColor },
  difficulty: 0,
};

/** 19 槽记录 → 三甲（内部 item id → vid 归一（FurnitureItems.slotVid 同式）→
 *  vanillaStatOfVid.hs/bs/ls 绘制槽序号 = Renderer.dollEquipFromInv 同源）。
 *  槽布局 = equip[0..8] + misc[0]（slots[9]）+ dye[0..8]（slots[10..18]）;
 *  本批只消费 armor[0..2]（=slots[0..2],其余见 P3b/P3c 分期）。 */
export function dollEquipFromSlots(
  slots: Array<{ id: number; prefix?: number } | null>,
): { head: number | null; body: number | null; legs: number | null } {
  const texOf = (slotIndex: number, part: 'h' | 'b' | 'l'): number | null => {
    const s = slots[slotIndex];
    if (!s) return null;
    const def = ITEM_DEFS[s.id];
    if (!def) return null;
    const stat = vanillaStatOfVid(def.vid ?? -1);
    if (!stat || stat.s !== part) return null;
    return (part === 'h' ? stat.hs : part === 'b' ? stat.bs : stat.ls) ?? null;
  };
  return { head: texOf(0, 'h'), body: texOf(1, 'b'), legs: texOf(2, 'l') };
}

export interface DollPoseRender {
  rows: { body: number; legs: number };        // PlayerFrame 行档（40×56 帧表行）
  sitting: { legIndex: number; seatYOffset: number; body: number } | null;
  offsetY: number;                             // 原版 num2（Sitting=14,余 0）→ 锚 Y 附加
}

/** pose → 形体行档（TEDisplayDoll.Draw switch :414-460 + PlayerFrame 行号）:
 *  Standing → 帧机 idle 0 行;Sitting → isSitting（DrawSittingLegs 切片）+ num2=14;
 *  Jumping → velocity=UnitY → 空中支 legFrame/bodyFrame 行 5（Player.cs:36523/:36824）;
 *  Walking → 显式 legFrame.Y=Height*9 且 bodyFrame.Y=legFrame.Y（:422-424）→ 行 9;
 *  Use1-5（4-8）= 持握物品姿态 → P3b（本批按 default 支 vel=0 落 Standing 行,债已登记）。
 *  非法 pose（4+ 无持握/不在注册表）原版回 Standing（:409-412 IsValidPose 门）。 */
export function displayDollRenderState(
  pose: number,
  isValid: boolean,
  equip: { head: number | null; body: number | null; legs: number | null },
): DollPoseRender {
  const p = isValid ? pose : 0;
  if (p === 1) {
    return {
      rows: { body: 0, legs: 0 },
      sitting: { legIndex: equip.legs ?? 0, seatYOffset: 0, body: equip.body ?? 0 },
      offsetY: 14,                                       // :430 num2 = 14
    };
  }
  if (p === 2) return { rows: { body: 5, legs: 5 }, sitting: null, offsetY: 0 };   // Jumping
  if (p === 3) return { rows: { body: 9, legs: 9 }, sitting: null, offsetY: 0 };   // Walking :422-424
  return { rows: { body: 0, legs: 0 }, sitting: null, offsetY: 0 };                // Standing/Use*(P3b)
}

/** IsValidPose（TEDisplayDoll.cs:135-153）1:1:≤3 恒合法;4+ 需持握展示槽物品
 *  useStyle ∈ SupportedUseStylePoses 且 pose 在其列。useStyleOfHeld = slots[9]
 *  物品的 Item.useStyle（空槽传 0 = 仅 0-3 合法）。 */
export function isValidDollPose(pose: number, useStyleOfHeld: number): boolean {
  if (pose <= 3) return true;
  const poses = DOLL_SUPPORTED_USE_STYLE_POSES[useStyleOfHeld];
  return !!poses && poses.includes(pose);
}

/** 持握展示槽（slots[9] = _misc[0]）物品的 Item.useStyle（IsValidPose 判定入参;
 *  空槽/未知 = 0）。 */
export function dollHeldUseStyle(slots: Array<{ id: number } | null>): number {
  const s = slots[9];
  if (!s) return 0;
  const def = ITEM_DEFS[s.id];
  if (!def) return 0;
  return vanillaUseStyle(def.vid ?? -1);
}

/** 绘制锚（TEDisplayDoll.cs:471 position 公式,盒 20×42）:
 *  position = (tileLeftX+1, tileTopY+3)×16 + (−width/2, −height−6+num2)
 *  → 身体底边中心 = (tileLeftX×16+16, tileTopY×16+42−6+num2)。返回纸娃娃
 *  「底边中心」绘制锚（与实时/死亡链 translate(cx, y+h) 同约定,+4 pad 内置）。 */
export function displayDollAnchor(tx: number, ty: number, offsetY: number): { cx: number; bottomY: number } {
  return { cx: (tx + 1) * 16, bottomY: (ty + 3) * 16 - 6 + offsetY };
}

/** 朝向（:347-351）：缺省 −1（面向左）,frameX%72==36 → +1。
 *  （原版另 frameX/72==1 → Male=false—— Female 档登记 P3c,见头注。） */
export function displayDollFacing(frameX: number): 1 | -1 {
  return frameX % 72 === 36 ? 1 : -1;
}

/** variant 10 男表断言（防 Appearance 常量漂移——compositor 女表链不走模特域） */
export function dollUsesMaleTables(): boolean {
  return MALE_VARIANTS.includes(DOLL_APPEARANCE.skinVariant);
}

// ---- 光照乘色（原版逐层 GetColor(tile) 乘法 :496-498 的单帧等价件）----
//  帧级切片 → multiply 填色 → destination-in 回贴 α——避免矩形 multiply 把框外
//  背景一起压暗（House_Banner 的矩形乘法仅因其布面不透明才成立;纸娃娃帧透明区
//  占大半）。乘色按 16 级量化入缓存键（lightAt 平滑渐变会击穿缓存;量化后每假人
//  实际变体≈个位数）。node 环境无 document → 原样返回（测试面只锁纯函数）。
type BakedLike = HTMLCanvasElement | ImageBitmap;
const DOLL_TINT_CACHE = new WeakMap<BakedLike, Map<string, HTMLCanvasElement>>();
export function dollLightTint(
  src: BakedLike, sx: number, sy: number, sw: number, sh: number, rgb: [number, number, number],
): BakedLike {
  if (typeof document === 'undefined') return src;
  const q = (v: number) => Math.min(255, Math.round(v / 16) * 16);
  const key = `${sx},${sy}:${q(rgb[0])},${q(rgb[1])},${q(rgb[2])}`;
  let perSrc = DOLL_TINT_CACHE.get(src);
  if (!perSrc) { perSrc = new Map(); DOLL_TINT_CACHE.set(src, perSrc); }
  const hit = perSrc.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const cx = c.getContext('2d');
  if (!cx) return src;
  cx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = `rgb(${q(rgb[0])},${q(rgb[1])},${q(rgb[2])})`;
  cx.fillRect(0, 0, sw, sh);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(c, 0, 0);
  perSrc.set(key, c);
  return c;
}
