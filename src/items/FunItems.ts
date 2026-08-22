// ============================================================================
// §4 乐器 + §5 趣味道具——纯函数层（Terarria1456 反编译源码为唯一标杆，行号对照）
//   ItemCheck_PlayInstruments   Player.cs:45892-46024 （乐器族入口：musicDist + 音符）
//   PlayDrums                   Player.cs:46106-46156 （鼓槌 10 档音色按鼠标距离）
//   ItemCheck_GetMeleeHitboxParticles Player.cs:44429-44462（泡泡棒 1450 气泡 gore 掷骰）
//   ItemCheck_ApplyUseStyle 1124 支 Player.cs:42946-42958（蜂巢挥动发蜂掷骰）
//   ItemCheck_ApplyPetBuffs 425 支 Player.cs:52256-52272（仙灵铃三选一）
//   Chest.Lock Chest.cs:409-473（金锁 5328 可锁样式表）
//
// 本模块纯函数化：全部状态走入参（随机源注入），不触 Game/World/Sfx。
// Game.ts 单点 if 调用（use 链「趣味使用分支」），消费侧只做 IO 装配。
// ============================================================================
/** Player.musicNotes（Player.cs:3044）：竖琴/铃的音分档数——pitch = Round(±1×6)/6 */
export const MUSIC_NOTES = 6;

// ---------------------------------------------------------------------------
// 乐器音符音高（Player.cs:45905-45936，竖琴 508 / 铃 507 共用段）
//   num6 = 鼠标世界距离 / (Camera.SmallerScaledAxis / 2)   ← 归一化 0..1（:45909-45916）
//   num6 = num6*2 - 1（钳 ±1）                            ← 映射到 -1..1（:45918-45926）
//   pitch = Round(num6 * musicNotes) / musicNotes          ← 量化到 1/6 步进（:45927-45928）
//   → Main.musicPitch 直传 PlaySound 第 4 参（XNA Pitch：频率倍率 2^pitch）
// ---------------------------------------------------------------------------
export function instrumentNotePitch(mouseDist: number, smallerScaledAxis: number): number {
  let n = mouseDist / (smallerScaledAxis / 2);
  if (n > 1) n = 1;                 // :45914-45916
  n = n * 2 - 1;                    // :45918
  if (n < -1) n = -1;               // :45919-45922
  if (n > 1) n = 1;                 // :45923-45926
  return Math.round(n * MUSIC_NOTES) / MUSIC_NOTES;   // :45927-45928
}

/** 乐器 UseSound（:45929-45933）：缺省 Item26（竖琴），507 铃 → Item35 */
export function instrumentUseSound(vid: number): string {
  return vid === 507 ? 'Item_35' : 'Item_26';
}

// ---------------------------------------------------------------------------
// 鼓槌音色档（Player.PlayDrums Player.cs:46106-46156）：range = 归一化鼠标距离
//   （0..1，**不做** ×2−1 映射——与竖琴段不同，:46014-46020 只钳上界）。
//   10 档 1/10 步进阈值递减，命中首档返回（else-if 链，先高后低）。
// ---------------------------------------------------------------------------
const DRUM_TIERS: ReadonlyArray<readonly [number, string]> = [
  [9, 'Item_59'], [8, 'Item_58'], [7, 'Item_53'], [6, 'Item_57'], [5, 'Item_62'],
  [4, 'Item_61'], [3, 'Item_54'], [2, 'Item_56'], [1, 'Item_55'],
];

export function drumSoundFile(range: number): string {
  for (const [k, file] of DRUM_TIERS) {
    if (range > k * 0.1) return file;   // num2 = 1/10（:46108）
  }
  return 'Item_60';                     // :46155-46156 兜底档
}

// ---------------------------------------------------------------------------
// 泡泡棒气泡 gore 掷骰（Player.cs:44431-44456）：
//   外层门 1/3（:44431 Next(3)==0）→ 判定盒内随机点 → 档位 else-if 链首中即取：
//   1/500→415 / 1/250→414 / 1/80→413 / 1/10→412 / 1/3→411，
//   scale = Next(51,101)*0.01 ∈ [0.51, 1.00]。
//   ★五档全部落空（≈ 43.6%）不生成——外层门与档位链是两次独立掷骰。
//   rnd = Math.random 同源注入（单测种子化）。
// ---------------------------------------------------------------------------
export interface BubbleWandRoll { goreType: number; scale: number }

export function bubbleWandGoreRoll(rnd: () => number): BubbleWandRoll | null {
  const next = (n: number) => Math.floor(rnd() * n);      // Main.rand.Next(n)
  let goreType = -1;
  if (next(500) === 0) goreType = 415;                    // :44437-44440
  else if (next(250) === 0) goreType = 414;               // :44441-44444
  else if (next(80) === 0) goreType = 413;                // :44445-44448
  else if (next(10) === 0) goreType = 412;                // :44449-44452
  else if (next(3) === 0) goreType = 411;                 // :44453-44456
  if (goreType < 0) return null;
  return { goreType, scale: (51 + next(50)) * 0.01 };     // Next(51,101)*0.01
}

// ---------------------------------------------------------------------------
// 蜂巢 1124 发蜂掷骰（Player.cs:42946-42958，挥动期每 tick）：
//   外层门 1/30（:42948 Next(30)==0）→ 弹 = beeType()（:12006——Hive Pack 3333
//   半数 566 巨蜂；本仓 equipStats 无 strongBees 通道恒 181，与 Arrow.ts 蜂箭
//   swarm 同款登记）→ 伤 = beeDamage(5)（:12017——181 档 5+Next(2)）、
//   kb = beeKB(0) = 0（:12026）。出生点 = 近战判定盒中心、速度 = 朝鼠标 ×6。
// ---------------------------------------------------------------------------
export interface HiveBeeRoll { damage: number }

export function hiveBeeRoll(rnd: () => number): HiveBeeRoll | null {
  if (Math.floor(rnd() * 30) !== 0) return null;          // :42948 Next(30)==0
  return { damage: 5 + Math.floor(rnd() * 2) };           // beeDamage(5)=5+Next(2)（:12021）
}

// ---------------------------------------------------------------------------
// 仙灵铃 425 三选一（Player.cs:52256-52272 ItemCheck_ApplyPetBuffs 的 425 支）：
//   num = Next(3) → 27 蓝 / 101 红 / 102 绿；先 DelBuff 全部 27/101/102 再
//   AddBuff(num, 3600)（60s）。左键直用与 QuickBuff 共用本掷（原版同入口）。
// ---------------------------------------------------------------------------
export function fairyBellVariant(rnd: () => number): 27 | 101 | 102 {
  const r = Math.floor(rnd() * 3);                        // :52258 Next(3)
  return r === 1 ? 101 : r === 2 ? 102 : 27;              // :52259-52265
}

// ---------------------------------------------------------------------------
// 金锁 5328 可锁样式表（Chest.Lock Chest.cs:409-473 + PlaceThing_LockChest
//   Player.cs:40946-41010 的样式门 1:1）：锚格 sheet + frameX/36（style）判定。
//   delta = 四格 frameX 右移量；plantGate = 世纪之花门（:431/:455 !downedPlantBoss
//   → false 不锁不耗）；ach = 锁沙漠箱成就 BIG_BOOTY(20)（:458）。
//   已锁样式（2/4/23-27/36/38/40）与无锁位样式（0/木箱 0 等）→ null（Chest.Lock
//   default → return false，原版同款不可锁不耗）。
// ---------------------------------------------------------------------------
export interface ChestLockSpec { delta: number; plantGate: boolean; ach: number }

export function chestLockOf(sheet: number, frameX: number): ChestLockSpec | null {
  const style = Math.floor(frameX / 36);
  if (sheet === 21) {
    if (style === 1 || style === 3 || style === 35 || style === 37 || style === 39) {
      return { delta: 36, plantGate: false, ach: 0 };     // :428-431/:440-442 → num=36
    }
    if (style >= 18 && style <= 22) {
      return { delta: 180, plantGate: true, ach: 0 };     // :432-439 群系锁位（num=180）
    }
    return null;                                          // default → return false（:443-445）
  }
  if (sheet === 467) {
    if (style === 12) return { delta: 36, plantGate: true, ach: 20 };  // :447-459 沙漠锁位
    return null;
  }
  return null;
}
