// ★BJ598 件1：UpdateArmorLights 1:1 整缺落刀（原版 Player.cs:31381-31555，
// Player.Update :25881 每 tick 调用——先于 UpdateArmorSets :36047-36049 的时装槽
// 覆写，故光照读【基础三槽】armor[0-2] 的 hs/bs/ls，非 displayArmor 时装优先）。
//
// 十八站普查（BJ595 台账 P4 计「17 站」系合账口径，本表逐 case 展平=18 站，
// 其中 body190/legs130 两支反编译即写【头位】光变量 num/num2/num3——只穿单件
// 也亮头位，照抄）：
//   head 9 站（ArmorIDs.Head）：11 矿盔 88 (0.92,0.8,0.65) / 216 超亮盔 4008
//     (0.7,0.95,0.82) / 285 升级矿盔 5588 (1,0.88,0.73) / 169 星璇盔 2757
//     (0,0.36,0.4) / 170 星云盔 2760 (0.4,0.16,0.36) / 171 日耀盔 2763
//     (0.5,0.25,0.05) / 189 星尘盔 3381 (0.9,0.9,0.7) / 178 HiTek墨镜 2862
//     (0.1,0.2,0.3) / 211 学徒暗盔 3874 (0.2,0.4,0.8)
//   body 5 站（ArmorIDs.Body）：175/176/177 星璇/星云/日耀胸 2758/2761/2764
//     同 head 三色；190 星尘胸 3382 → 写头位 (0.9,0.9,0.7)；205 学徒暗甲 3875
//     (0.2,0.4,0.8)
//   legs 4 站（ArmorIDs.Legs）：110/111/112 星璇/星云/日耀腿 2759/2762/2765
//     同 head 三色；130 星尘腿 3383 → 写头位 (0.9,0.9,0.7)
// 早退门：vortexStealthActive（:31384-31386 星璇潜行熄光——整函数唯一门，死亡
// 幽灵态原版无门=照常发光，本仓同构不另设门）。
// 聚焦档：三站逐 RGB 全等比较（同源常量表恒可精确等值），head==body +0.5、
// head==legs 再 +0.5（可叠到 ×2）；body/legs 同式对称。
// 光位（Player.cs:31469-31476/31500-31507/31531-31538，盒左上 position 起算，
// /16 落格）：head=(w/2+8·dir, 2)、body=(w/2+8【恒 +8 无方向·原版 quirk】, h/2)、
// legs=(w/2+8·dir, h·0.75)。fullRotation 旋移支（:31470 等）本仓未建模从略
// （Player.ts:6162 坐骑旋转域同案）。

export type ArmorLightRGB = readonly [number, number, number];

/** head 槽 → (r,g,b)（Player.cs:31392-31422 switch 十案） */
export const ARMOR_LIGHT_HEAD: Record<number, ArmorLightRGB> = {
  11: [0.92, 0.8, 0.65],
  216: [0.7, 0.95, 0.82],
  285: [1, 0.88, 0.73],
  169: [0, 0.36, 0.4],
  170: [0.4, 0.16, 0.36],
  171: [0.5, 0.25, 0.05],
  189: [0.9, 0.9, 0.7],
  178: [0.1, 0.2, 0.3],
  211: [0.2, 0.4, 0.8],
};

/** body 槽 → (r,g,b)（:31426-31450；190=写头位档） */
export const ARMOR_LIGHT_BODY: Record<number, ArmorLightRGB> = {
  175: [0, 0.36, 0.4],
  176: [0.4, 0.16, 0.36],
  177: [0.5, 0.25, 0.05],
  190: [0.9, 0.9, 0.7],
  205: [0.2, 0.4, 0.8],
};

/** legs 槽 → (r,g,b)（:31454-31476；130=写头位档） */
export const ARMOR_LIGHT_LEGS: Record<number, ArmorLightRGB> = {
  110: [0, 0.36, 0.4],
  111: [0.4, 0.16, 0.36],
  112: [0.5, 0.25, 0.05],
  130: [0.9, 0.9, 0.7],
};

/** 单站输出：盒左上起算的像素偏移 + 聚焦档乘后 RGB */
export interface ArmorLightOut {
  ox: number;
  oy: number;
  r: number;
  g: number;
  b: number;
}

/** 190（星尘胸）/130（星尘腿）：反编译原式即写头位变量（num/num2/num3），非本站 */
const HEAD_WRITER_BODY = new Set([190]);
const HEAD_WRITER_LEGS = new Set([130]);

/**
 * UpdateArmorLights 纯函数臂（Player.cs:31381-31555 逐式转写）。
 * 入参：hs/bs/ls = 基础三槽的 headSlot/bodySlot/legSlot（无甲=-1）；
 * vortexStealthActive = 早退门；width/height = 玩家盒尺寸（原版 20×42）；
 * direction = 原版 Player.direction（1 右 -1 左）。
 * 出参：0-3 站的光列表（空=无光）。
 */
export function computeArmorLights(
  hs: number, bs: number, ls: number,
  vortexStealthActive: boolean,
  width: number, height: number, direction: number,
): ArmorLightOut[] {
  if (vortexStealthActive) {
    return [];
  }
  // head 站（:31390-31422）
  let num = 0, num2 = 0, num3 = 0;
  const hRGB = ARMOR_LIGHT_HEAD[hs];
  if (hRGB) {
    num = hRGB[0]; num2 = hRGB[1]; num3 = hRGB[2];
  }
  // body 站（:31426-31450）——case190 写头位
  let num4 = 0, num5 = 0, num6 = 0;
  const bRGB = ARMOR_LIGHT_BODY[bs];
  if (bRGB) {
    if (HEAD_WRITER_BODY.has(bs)) {
      num = bRGB[0]; num2 = bRGB[1]; num3 = bRGB[2];
    } else {
      num4 = bRGB[0]; num5 = bRGB[1]; num6 = bRGB[2];
    }
  }
  // legs 站（:31454-31476）——case130 写头位
  let num7 = 0, num8 = 0, num9 = 0;
  const lRGB = ARMOR_LIGHT_LEGS[ls];
  if (lRGB) {
    if (HEAD_WRITER_LEGS.has(ls)) {
      num = lRGB[0]; num2 = lRGB[1]; num3 = lRGB[2];
    } else {
      num7 = lRGB[0]; num8 = lRGB[1]; num9 = lRGB[2];
    }
  }
  const out: ArmorLightOut[] = [];
  // head 发射（:31478-31498）：head==body +0.5 / head==legs +0.5（可叠 ×2）
  if (num !== 0 || num2 !== 0 || num3 !== 0) {
    let num10 = 1;
    if (num === num4 && num2 === num5 && num3 === num6) {
      num10 += 0.5;
    }
    if (num === num7 && num2 === num8 && num3 === num9) {
      num10 += 0.5;
    }
    out.push({ ox: width / 2 + 8 * direction, oy: 2, r: num * num10, g: num2 * num10, b: num3 * num10 });
  }
  // body 发射（:31500-31520）：恒 +8 无方向（原版 quirk）
  if (num4 !== 0 || num5 !== 0 || num6 !== 0) {
    let num11 = 1;
    if (num4 === num && num5 === num2 && num6 === num3) {
      num11 += 0.5;
    }
    if (num4 === num7 && num5 === num8 && num6 === num9) {
      num11 += 0.5;
    }
    out.push({ ox: width / 2 + 8, oy: height / 2, r: num4 * num11, g: num5 * num11, b: num6 * num11 });
  }
  // legs 发射（:31522-31542）
  if (num7 !== 0 || num8 !== 0 || num9 !== 0) {
    let num12 = 1;
    if (num7 === num4 && num8 === num5 && num9 === num6) {
      num12 += 0.5;
    }
    if (num7 === num && num8 === num2 && num9 === num3) {
      num12 += 0.5;
    }
    out.push({ ox: width / 2 + 8 * direction, oy: height * 0.75, r: num7 * num12, g: num8 * num12, b: num9 * num12 });
  }
  return out;
}
