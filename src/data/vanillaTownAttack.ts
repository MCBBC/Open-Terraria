// 城镇 NPC 自卫攻击系统数据(NPCID.Sets 四表 + AI_007 四态逐类型参数)。
// 表:NPCID.cs:4835-4851(1456 行号锚,1457 平移同值);参数:NPC.cs AI_007_TownEntities（AI 数值两版零改动,diff 报告§四）
//   ai[0]==10 近战 :54747-54936 / ==12 弓 :54936-55240 /
//   ==14 魔法 :55240-55405 / ==15 挥击 :55406-55538(转录核对版)。
// 伤害缩放:GetAttackDamage_ForTownNPC = ×GameDifficultyData.TownNPCDamageMultiplier
//   (Journey 2 / Classic 1 / Expert 1.5 / Legendary 2,:69;Master 3 无键→区间插值 1.75)
//   ——已接 src/stats/ScaleStats.ts getAttackDamageForTownNPC(消费点 TownNPC.ts)。
//   num2 恒 1(Boss 击杀进度强化链 :53400-53560 未接,Skyblock +0.5 同)。

/** DangerDetectRange(NPCID.cs:4835,默认 -1 → 运行时按 200,AI_007 :53866) */
export const TOWN_DANGER_RANGE: Record<number, number> = {
  38: 300, 17: 320, 107: 300, 19: 900, 22: 700, 124: 800, 228: 800, 178: 900,
  18: 300, 229: 1000, 209: 1000, 54: 700, 108: 700, 160: 700, 20: 1200,
  369: 300, 453: 300, 368: 900, 207: 60, 227: 800, 208: 400, 142: 500, 441: 50,
  353: 60, 633: 100, 550: 120, 588: 120, 663: 700, 638: 250, 637: 250, 656: 250,
  670: 250, 678: 250, 679: 250, 680: 250, 681: 250, 682: 250, 683: 250, 684: 250,
};
/** AttackTime(NPCID.cs:4845,默认 -1 = 无攻击) */
export const TOWN_ATTACK_TIME: Record<number, number> = {
  38: 34, 17: 34, 107: 60, 19: 40, 22: 30, 124: 34, 228: 40, 178: 24, 18: 34,
  229: 60, 209: 60, 54: 60, 108: 30, 160: 60, 20: 600, 369: 34, 453: 34, 368: 60,
  207: 15, 227: 60, 208: 34, 142: 34, 441: 15, 353: 12, 633: 12, 550: 34, 588: 20,
  663: 60,
};
/** AttackAverageChance(NPCID.cs:4847;触发门 rand(chance×num3)==0,num3=2,209 再 ÷3) */
export const TOWN_ATTACK_CHANCE: Record<number, number> = {
  38: 40, 17: 30, 107: 60, 19: 30, 22: 30, 124: 30, 228: 50, 178: 50, 18: 60,
  229: 40, 209: 30, 54: 30, 108: 30, 160: 60, 20: 60, 369: 50, 453: 30, 368: 40,
  207: 1, 227: 30, 208: 50, 142: 50, 441: 1, 353: 1, 633: 1, 550: 40, 588: 20,
  663: 1,
};
/** AttackType(NPCID.cs:4849:0 近战弹 / 1 弓 / 2 魔法 / 3 挥击) */
export const TOWN_ATTACK_TYPE: Record<number, 0 | 1 | 2 | 3> = {
  38: 0, 17: 0, 107: 0, 19: 1, 22: 1, 124: 0, 228: 1, 178: 1, 18: 0, 229: 1,
  209: 1, 54: 2, 108: 2, 160: 2, 20: 2, 369: 0, 453: 0, 368: 1, 207: 3, 227: 1,
  208: 0, 142: 0, 441: 3, 353: 3, 633: 0, 550: 0, 588: 0, 663: 2,
};
/** PrettySafe(NPCID.cs:4851;弓态近距离特判换"保命大招"弹) */
export const TOWN_PRETTY_SAFE: Record<number, number> = {
  19: 300, 22: 200, 124: 200, 228: 300, 178: 300, 229: 300, 209: 300, 54: 100,
  108: 100, 160: 100, 20: 200, 368: 200, 227: 200,
};

export interface TownShotParams {
  proj: number;            // 发射投射物 id(209 三选一/368 PrettySafe/22 hardMode 覆盖见字段)
  dmg: number;
  speed: number;
  /** 发射 tick(进入态后 localAI[3] 计数到此发射) */
  shootTick: number;
  /** 连发升级链:localAI[3] 超过当前档时推下一档再发(原版 if 链) */
  burst?: number[];
  /** 退出冷却基准 + rand 上限 */
  cdBase: number; cdRand: number;
  /** 弹道随机散布 ±(弓 num58/魔法 num70;近战态散布恒 0) */
  spread: number;
  kb: number;
  /** 瞄准上抬补偿像素(弓 num57;近战/魔法走 dist/range 归一公式用 aimLift) */
  aimLift?: number;
  /** 近战/魔法态:目标中心上抬 = aimLift × clamp(dist/range,0,1) */
  aimLiftScaled?: number;
  hardMode?: Partial<Pick<TownShotParams, 'proj' | 'dmg' | 'shootTick' | 'burst' | 'cdBase' | 'cdRand'>>;
  /** 209 保命近距:PrettySafe 内换弹(229 特判,弓态) */
  panic?: { proj: number; dmg: number; speed: number; kb: number; spread: number };
  /** 588 弹体 timeLeft=480 / 124·142·108·160·663·20 附加 ai 参数——弹体差异在发射端处理 */
  note?: string;
}

/** ai[0]==10 近战弹态(转录自 :54747-54936) */
export const TOWN_MELEE: Record<number, TownShotParams> = {
  38:  { proj: 30,  dmg: 20, speed: 6,  shootTick: 10, cdBase: 180, cdRand: 120, spread: 0,  kb: 7,   aimLiftScaled: 16 },
  633: { proj: 880, dmg: 15, speed: 24, shootTick: 1,  cdBase: 15,  cdRand: 10,  spread: 0,  kb: 7,   note: '狼人态(血月夜/满月夜)发射端换 proj 929 + dmg×1.5 截断(:54782-54785)' },
  550: { proj: 669, dmg: 24, speed: 6,  shootTick: 10, cdBase: 120, cdRand: 60,  spread: 0,  kb: 9,   aimLiftScaled: 16 },
  588: { proj: 721, dmg: 15, speed: 8,  shootTick: 5,  cdBase: 20,  cdRand: 10,  spread: 0,  kb: 9,   aimLiftScaled: 16, note: '弹体 timeLeft=480' },
  208: { proj: 588, dmg: 30, speed: 6,  shootTick: 10, cdBase: 60,  cdRand: 120, spread: 0,  kb: 6,   aimLiftScaled: 16 },
  17:  { proj: 48,  dmg: 12, speed: 9,  shootTick: 10, cdBase: 60,  cdRand: 60,  spread: 0,  kb: 1.5, aimLiftScaled: 16 },
  369: { proj: 520, dmg: 10, speed: 12, shootTick: 10, cdBase: 0,   cdRand: 1,   spread: 0,  kb: 3,   aimLiftScaled: 16 },
  453: { proj: 21,  dmg: 14, speed: 14, shootTick: 10, cdBase: 0,   cdRand: 1,   spread: 0,  kb: 3,   aimLiftScaled: 16 },
  107: { proj: 24,  dmg: 15, speed: 5,  shootTick: 10, cdBase: 60,  cdRand: 60,  spread: 0,  kb: 1,   aimLiftScaled: 16 },
  124: { proj: 582, dmg: 11, speed: 10, shootTick: 1,  cdBase: 30,  cdRand: 30,  spread: 0,  kb: 3.5, note: '弹附加 ai1=本体索引/ai2=外观变体' },
  18:  { proj: 583, dmg: 8,  speed: 8,  shootTick: 1,  cdBase: 15,  cdRand: 10,  spread: 0,  kb: 2,   aimLiftScaled: 10 },
  // ★对抗修复批①2026-09-01：补 aimLiftScaled:10（cs:55045 num47=10f——瞄准上抬走
  // dist/range 归一公式；107 的 16f 在 cs:55015 实存勿动，红队曾误报）
  142: { proj: 589, dmg: 22, speed: 7,  shootTick: 1,  cdBase: 10,  cdRand: 1,   spread: 0,  kb: 2,
         aimLiftScaled: 10, note: '弹附加 ai1=rand5(:55067 NewProjectile 末参)' },
};

/** ai[0]==12 弓态(转录自 :54936-55240;连发档 = burst 数组) */
export const TOWN_BOW: Record<number, TownShotParams> = {
  // ★对抗修复批①2026-09-01：19 连发链整段包 if(Main.hardMode)（cs:55126-55148）——
  // 肉前 num54 恒 1（单发）；肉后才 dmg15 + 档 10/20/30。故 burst 只入 hardMode 面，
  // 非困难模式 burst 为 undefined（消费端 atkParams 合并后差异即体现）
  19:  { proj: 14, dmg: 24, speed: 13, shootTick: 1, cdBase: 14, cdRand: 4, spread: 0.5, kb: 3,
         hardMode: { dmg: 15, burst: [10, 20, 30] } },
  227: { proj: 587, dmg: 8, speed: 10, shootTick: 1, burst: [12, 24], cdBase: 10, cdRand: 1, spread: 0.5, kb: 1.75, hardMode: { dmg: 10 }, note: '弹附加 ai1=rand(12)/6' },
  368: { proj: 14, dmg: 24, speed: 13, shootTick: 1, cdBase: 12, cdRand: 5, spread: 0.2, kb: 2, hardMode: { dmg: 30, proj: 357 } },
  22:  { proj: 1, dmg: 12, speed: 10, shootTick: 1, cdBase: 30, cdRand: 20, spread: 0.7, kb: 2.75, aimLift: 4,
         hardMode: { proj: 2, dmg: 18, cdBase: 15, cdRand: 10 }, note: '★向导:肉前木箭 1/肉后火焰箭 2+6伤(:55042-55060)' },
  228: { proj: 267, dmg: 20, speed: 14, shootTick: 1, cdBase: 10, cdRand: 1, spread: 0.4, kb: 3, aimLift: 6 },
  178: { proj: 242, dmg: 11, speed: 13, shootTick: 1, burst: [8, 16], cdBase: 10, cdRand: 1, spread: 0.3, kb: 2, hardMode: { dmg: 15 } },
  229: { proj: 14, dmg: 24, speed: 14, shootTick: 1, burst: [16, 24, 32, 40, 48], cdBase: 10, cdRand: 1, spread: 0.7, kb: 2,
         panic: { proj: 162, dmg: 50, speed: 24, kb: 10, spread: 0.1 } },
  209: { proj: 14, dmg: 24, speed: 13, shootTick: 1, cdBase: 14, cdRand: 4, spread: 0.5, kb: 3,
         note: '发射时三选一 proj(134:20伤/13速/kb4/散0.1/cd20+rand10, 133:25/10/6/0.2/10+1, 135:30/12/7/0.2/30+rand10)' },
};

/** ai[0]==14 魔法态(转录自 :55240-55405) */
export const TOWN_MAGIC: Record<number, TownShotParams> = {
  54:  { proj: 585, dmg: 16, speed: 10, shootTick: 30, cdBase: 20, cdRand: 15, spread: 1, kb: 2 },
  108: { proj: 15, dmg: 18, speed: 6, shootTick: 15, cdBase: 15, cdRand: 5, spread: 0, kb: 3, aimLiftScaled: 20,
         note: '连发 1-3 发(SelectRandom 权重 4:2:1,:55337),每发附加 ±3.4 逐轴随机速度' },
  // ★对抗修复批①2026-09-01：连发梯补全。原版是 `for(; localAI[3]>num64; num64+=步长)`
  // 无界循环（cs:55447 步长15 / :55459 步长10），实际可达档受 AttackTime 截断：
  //   160：AttackTime 60 → 档 30/45/60（末发 atkTick 60 与退出共帧，先发后退 :55473/:55551）
  //   663：AttackTime 60 → 档 25/35/45/55（65 越界不可达）
  160: { proj: 590, dmg: 40, speed: 0, shootTick: 15, burst: [30, 45, 60], cdBase: 10, cdRand: 1, spread: 0, kb: 3,
         note: '落点弹:position−Size×2+Size×rand(0..1)×5(:55349),实心重掷≤10(:55351),velocity=0' },
  663: { proj: 950, dmg: 15, speed: 0, shootTick: 15, burst: [25, 35, 45, 55], cdBase: 0, cdRand: 1, spread: 0, kb: 3,
         hardMode: { dmg: 20 }, note: '落点弹:position+Size×rand(0..1)(:55367),实心重掷≤5(:55369),velocity=0' },
         // ★cdRand 注：原版 maxValue3=0（cs:55457），本仓 1 经 exitAttackCommon 的
         // max(1,) 等价保留（0+Next(1)≡0）；勿再改回 0——直接除数会炸 Math.floor(rng*0)
  20:  { proj: 586, dmg: 0, speed: 0, shootTick: 24, cdBase: 10, cdRand: 1, spread: 0, kb: 3,
         note: 'dryad 净化脉冲(0 伤/0 速,弹 ai1=本体);CanHitLine 全失仍进入态' },
};

/** ai[0]==15 挥击态(无投射物;矩形挥击 :55406-55538) */
export const TOWN_SWING: Record<number, { dmg: number; kb: number; rect: number; cdBase: number; cdRand: number }> = {
  207: { dmg: 11, kb: 4.25, rect: 32, cdBase: 12, cdRand: 6 },
  441: { dmg: 9, kb: 3.5, rect: 28, cdBase: 9, cdRand: 3, }, // note: 名字 Andrew 时 dmg/kb×2(猫单特典)
  353: { dmg: 10, kb: 5, rect: 32, cdBase: 15, cdRand: 8 },
};

/** AttackType1(弓/枪族)持械表(DrawNPCExtras Main.cs:27121-27195)。
 *  攻击态 ai[0]==12 全程手持武器图标,旋转 = ai[2]×90°×spriteDirection
 *  (ai[2]=发射档时目标方向 Y 分量钳 ±0.5,:55191-55197)。
 *  228/229/209 原版提前 return 无持械(:27124-27126)——不列。
 *  grip=num11 握位(默认 4);scale=num10;hm=肉后替换武器。 */
export interface TownHoldout {
  pre: number; hm?: number; grip?: number; scale?: number;
  /** 肉前档:aim<-0.1 时换握位(368 旅商枪上抬位,:27157-27160) */
  preGripAimDown?: number; preScale?: number;
}
/** DrawPlayerItemPos(Main.cs 尾 `result.X = num`)——X = per-item 常量(默认 10),
 *  ★不是帧宽/2(曾误用 W/2 → 旅商左轮 num12 差 24px 持枪浮空,2026-08-25 用户实报)。
 *  Y 分量(H/2±2 族)被 EndCapture 侧 origin 弃用,无需移植。
 *  表 = TOWN_HOLDOUT 全部 item 的 num 值;未列 item(39 木弓等)= 默认 10 */
export const ITEM_POS_NUM: Record<number, number> = {
  95: 6, 98: -5,          // 火枪 / 霰弹枪(爆破专家)
  434: 0,                 // 吹管(巫医)
  3350: 2,                // 酒馆老板枪
  2269: 2, 2223: 2,       // 旅商左轮 / 肉后枪
};
export const TOWN_HOLDOUT: Record<number, TownHoldout> = {
  19: { pre: 95, hm: 98 },                       // 爆破专家:火枪→肉后霰弹枪;HM 锚 X-10*dir/Y+4(:27127-27131)
  22: { pre: 39, grip: 18 },                     // 向导:木弓;aim>-0.1 锚 Y+4(:27107)
  178: { pre: 434 },                             // 巫医
  227: { pre: 3350, grip: 16, scale: 0.85 },     // 酒馆老板
  368: { pre: 2269, hm: 2223, preGripAimDown: 28, preScale: 0.75 }, // 旅商:左轮→肉后枪;攻帧≥21 加持 Extra_53 手部
};

/** GetMagicAuraColor(NPCID.cs:4859 MagicAuraColor 表)——AttackType2 施法光环乘色
 *  （A=127 经 globalAlpha 施加;微光变体 160 BGR 互换 / 20→(90,20,210) 渲染侧处理） */
export const TOWN_MAGIC_AURA_COLOR: Record<number, [number, number, number, number]> = {
  54: [100, 4, 227, 127],    // 服装商
  108: [255, 80, 60, 127],   // 巫师
  160: [40, 80, 255, 127],   // 松露人
  20: [40, 255, 80, 127],    // 树妖
  663: [178, 121, 229, 127], // hsl(0.92,1,0.78)≈(178,121,229)
};

/** GetSwingStats(NPC.cs:67247-67320)——AttackType3 近战挥砍的持位/旋转纯函数。
 *  三相位（<1/3 前持 / <2/3 中持 / 其余回拉）按 item 宽高分档取贴身距离；
 *  旋转 = (进度−0.5)×(−aimDir)×3.5 − aimDir×0.3 */
export function townSwingStats(
  swingMax: number, swingCurrent: number, aimDir: number,
  itemW: number, itemH: number, centerX: number, positionY: number,
): { x: number; y: number; rot: number } {
  let x: number, y: number;
  if (swingCurrent < swingMax * 0.333) {
    const n = itemW >= 92 ? 38 : itemW >= 64 ? 28 : itemW >= 52 ? 24 : itemW > 32 ? 14 : 10;
    x = centerX + (itemW * 0.5 - n) * aimDir;
    y = positionY + 24;
  } else if (swingCurrent < swingMax * 0.666) {
    const n = itemW >= 92 ? 38 : itemW >= 64 ? 28 : itemW >= 52 ? 24 : itemW > 32 ? 18 : 10;
    x = centerX + (itemW * 0.5 - n) * aimDir;
    const ny = itemH > 64 ? 14 : itemH > 52 ? 12 : itemH > 32 ? 8 : 10;
    y = positionY + ny;
  } else {
    const n = itemW >= 92 ? 38 : itemW >= 64 ? 28 : itemW >= 52 ? 24 : itemW >= 48 ? 18 : itemW > 32 ? 14 : 6;
    x = centerX - (itemW * 0.5 - n) * aimDir;
    const ny = itemH > 64 ? 14 : itemH > 52 ? 12 : itemH > 32 ? 10 : 10;
    y = positionY + ny;
  }
  const rot = (swingCurrent / swingMax - 0.5) * -aimDir * 3.5 - aimDir * 0.3;
  return { x, y, rot };
}
