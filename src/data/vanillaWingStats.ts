// 翅膀全量属性（WingStatsInitializer.cs:26-63 + WingStats.cs 全字段 1:1）。
// 字段语义（WingStats.cs:3-17）：
//   time   = FlyTime 飞行时长（tick，wingTimeMax）
//   accSpeed     = AccRunSpeedOverride 飞行中横移速度上限（px/tick；-1 = 不覆盖）
//   accelMult    = AccRunAccelerationMult 横移加速倍率
//   hover        = HasDownHoverStats 持 ↓+跳 悬浮缓降族
//   hoverSpeed/hoverAccelMult = 悬浮态横移覆盖
// 表来源（Initializer 数组逐条；cs:60-63 的孤儿 new 未赋值是 Re-Logic 死代码，忽略）：
//   46 幼翅 (25,3)；1/2 恶魔天使 (100,6.25)；25/7/6/10 (130,6.75)；4 妖精 (150,6.5)；
//   15/5/14/9/13 (160,7.5)；11/8/27/24 (170,7.5)；22 悬浮滑板 (170,6.5,hover10)；
//   21/20/12/23 (180,7.5)；26 星旋强化 (180,8,×2)；45 星旋悬浮 (180,8,×4.5,hover16)；
//   37 日耀悬浮板 (150,7,×2.5,hover12)；44 星尘强化 (150,8,×2)；
//   29/32 幽灵之翼 (180,9,×2.5)；30/31 日耀喷气板 (180,6.5,×1.5,hover12)；
//   48/49 (150,7)；其余全部（3/16-19/28/33-43/50/51 及未列）默认 (150,7,×1)
// （旧 vanilla-wingstats.json 只有 time/speed 23 条且缺槽位——已由本表全量替代）
export interface WingStat {
  time: number;
  accSpeed: number;
  accelMult: number;
  hover: boolean;
  hoverSpeed: number;
  hoverAccelMult: number;
}

const DEFAULT: WingStat = { time: 150, accSpeed: 7, accelMult: 1, hover: false, hoverSpeed: -1, hoverAccelMult: 1 };

const TABLE: Record<number, WingStat> = {};
const set = (slots: number[], time: number, accSpeed: number, accelMult = 1,
  hover = false, hoverSpeed = -1, hoverAccelMult = 1) => {
  for (const s of slots) TABLE[s] = { time, accSpeed, accelMult, hover, hoverSpeed, hoverAccelMult };
};
set([46], 25, 3);
set([1, 2], 100, 6.25);
set([25, 7, 6, 10], 130, 6.75);
set([4], 150, 6.5);
set([15, 5, 14, 9, 13], 160, 7.5);
set([11, 8, 27, 24], 170, 7.5);
set([22], 170, 6.5, 1, true, 10, 10);
set([21, 20, 12, 23], 180, 7.5);
set([26], 180, 8, 2);
set([45], 180, 8, 4.5, true, 16, 16);
set([37], 150, 7, 2.5, true, 12, 12);
set([44], 150, 8, 2);
set([29, 32], 180, 9, 2.5);
set([30, 31], 180, 6.5, 1.5, true, 12, 12);
set([48, 49], 150, 7);
// 默认族（Initializer :62-63 链式赋值 3/16-19/28/33-43/50/51；未列 slot 同默认）
set([3, 16, 17, 18, 19, 28, 33, 34, 35, 36, 38, 39, 40, 41, 42, 43, 50, 51], 150, 7);

/** wing slot（=wingsLogic，Player.cs:12584 wingsLogic = armor.wingSlot）→ 属性 */
export function wingStatOf(slot: number): WingStat {
  return TABLE[slot] ?? DEFAULT;
}
