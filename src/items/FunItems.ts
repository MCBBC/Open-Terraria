// ============================================================================
// §4 乐器 + §5 趣味道具——纯函数层（Terarria1456 反编译源码为唯一标杆，行号对照）
//   ItemCheck_PlayInstruments   Player.cs:45892-46024 （乐器族入口：musicDist + 音符）
//   PlayDrums                   Player.cs:47108-47157 （鼓槌 10 档音色按鼠标距离；1456 :46106-46156）
//   ItemCheck_GetMeleeHitboxParticles Player.cs:44429-44462（泡泡棒 1450 气泡 gore 掷骰）
//   ItemCheck_ApplyUseStyle 1124 支 Player.cs:42946-42958（蜂巢挥动发蜂掷骰）
//   ItemCheck_ApplyPetBuffs 425 支 Player.cs:52256-52272（仙灵铃三选一）
//   ItemCheck_ApplyHoldStyle 968 支 Player.cs:50955-50994（棉花糖烤串烤制态机）
//   Chest.Lock Chest.cs:409-473（金锁 5328 可锁样式表）
//   PlayGuitarChord             Player.cs:47073-47106（1458 基线；吉他三件 4057/4372/
//                               4715 六档和弦 + 坏运跑调,LSP type 支映射 Item_133-138）
//   ★行号基准：1458 增量变更面权威（ItemCheck_PlayInstruments 入口 :46894；
//     1305 The Axe :46945-46970 / 吉他 4057+4372 共支 :46972-46987 /
//     SparkleGuitar 4715 独支 :46989-47004）
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
// 鼓槌音色档（Player.PlayDrums Player.cs:47108-47157）：range = 归一化鼠标距离
//   （0..1，**不做** ×2−1 映射——与竖琴段不同，:47016-47022 只钳上界）。
//   10 档 1/10 步进阈值递减，命中首档返回（else-if 链，先高后低）。
//   ★PlayDrums 播的是数字音型 53..62（SoundEngine.PlaySound(59/58/53/…/:47113)），
//   经 LegacySoundPlayer.PlaySound default 支 `num = 139 + type - 53`
//   （LegacySoundPlayer.cs:1238-1239，音量 num2*0.7 :1245）落到 **Item_N wav 表**
//   Item_139~148——旧表直接写 Item_53..62 是漏乘这一层映射的错位 bug
//   （2026-08-26 B1 接线批修正：t → 139 + (t−53)，即 +86）。
// ---------------------------------------------------------------------------
const DRUM_TIERS: ReadonlyArray<readonly [number, string]> = [
  [9, 'Item_145'], [8, 'Item_144'], [7, 'Item_139'], [6, 'Item_143'], [5, 'Item_148'],
  [4, 'Item_147'], [3, 'Item_140'], [2, 'Item_142'], [1, 'Item_141'],
];

export function drumSoundFile(range: number): string {
  for (const [k, file] of DRUM_TIERS) {
    if (range > k * 0.1) return file;   // num2 = 1/10（:47111）
  }
  return 'Item_146';                    // :47148-47150 else 兜底 = 音型 60 → 139+60-53
}

// ---------------------------------------------------------------------------
// 吉他六档和弦（Player.PlayGuitarChord Player.cs:47073-47106,num=6 :47075/num2=1/6 :47076）：range = 鼠标世界
//   距离/(SmallerScaledAxis/2) 只钳上界 1（:46985-46988 / :47000-47002——与鼓槌同式,
//   **不做** ×2−1 映射）。六档 else-if 链阈值 k/6 先高后低命中即返：
//     >5/6→音型49 >4/6→48 >3/6→47 >2/6→51 >1/6→52 else→50——**档序非单调**照抄。
//   音型→wav = LegacySoundPlayer.PlaySound type 支 case47-52 `num = 133 + type - 47`
//   （LegacySoundPlayer.cs:1215-1220）→ Item_135/134/133/137/138/136。
//   该 case 无 Pitch 抖动赋值（实例默认 0,不落 PITCH_CASE 的 Item_ 族 ±0.06 档）、
//   音量 num2×0.45（:1231）;播放前 Stop 掉 Item_133..138 全部在播实例（:1222-1227
//   单音互斥）——本仓 WebAudio 槽按文件粒度、跨文件互斥不可表达,登记简化
//   （六档叠响需两把吉他和弦窗口重叠,概率低）。
// ---------------------------------------------------------------------------
const GUITAR_TIERS: ReadonlyArray<readonly [number, string]> = [
  [5, 'Item_135'], [4, 'Item_134'], [3, 'Item_133'], [2, 'Item_137'], [1, 'Item_138'],
];

export function guitarChordFile(range: number): string {
  for (const [k, file] of GUITAR_TIERS) {
    if (range > k / 6) return file;     // num2 = 1/6（:47076）
  }
  return 'Item_136';                    // :47101-47103 else 兜底 = 音型 50 → 133+50-47
}

/** 吉他坏运跑调（Player.cs:47077-47080）：RollOnlyBadLuckExtreme(10)==0 →
 *  pitchOffset = Next(-50,51)*0.01。Luck.RollOnlyBadLuckExtreme（Luck.cs:53-58,
 *  Terraria.GameContent/）= luck<0 且 NextFloat()<-luck 时 Next(range/10)=Next(1)=0
 *  恒触发,否则返回 -1 不触发。rnd 注入两次独立掷（NextFloat → Next),单测种子化。 */
export function guitarBadLuckDetune(luck: number, rnd: () => number): number {
  if (luck < 0 && rnd() < -luck) return (Math.floor(rnd() * 101) - 50) * 0.01;
  return 0;
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
//   半数 566 巨蜂；★strongBees 通道已接（equipStats.strongBees,2026-08-31 台账
//   清偿）——弹型选择在 Game.ts 挥动站调用位，本函数只承担 181 档伤害掷）→
//   伤 = beeDamage(5)（:12017——181 档 5+Next(2)）、
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
// 棉花糖烤串 968 烤制（Player.cs:50955-50994 ItemCheck_ApplyHoldStyle 的
//   sItem.type==968 支，1456 :49606-49645；态机字段 player.miscTimer :1339，
//   1456 :1244——仅本链消费的运行时态）：
//   探测格（:50960-50961）= (itemLocation.X + heldItemFrame.Width×0.8×dir)/16、
//   (itemLocation.Y + mountOffset + frame.Height/2)/16；itemLocation 由
//   holdStyle 1 链赋值：X = pos.X + w/2 + 8×dir（:50957）、Y = pos.Y + 24 +
//   mountOffset（:51020，1456 :49671——holdStyle 1 链尾统一式）。heldItemFrame
//   = Item.GetDrawHitbox(968)（:42701 AnimatePlayerAndGetItemFrame 传入）=
//   Item_968.png 整图 32×10（非 IsFood 无动画，Renderer.drawUseItem 同源）。
//   格为燃着篝火（TileID.Sets.Campfires={215} 且 frameY<54 点燃档，:50966）→
//   miscTimer++（:50968）+ Next(5)==0 再 ++（:50969-50972，均值 1.2/tick）→
//   >900t 烤成（:50973——均值 ≈750t=12.5s，上限 900t=15s）；否则归零（:50994）。
//   ★烤成侧（QuickSpawnItem 969 + stack--）是 Game 层 IO，见 checkMarshmallowRoast。
// ---------------------------------------------------------------------------
/** Item_968.png 整图规格（GetDrawHitbox 968 非 IsFood 无动画 → 全图帧） */
export const MARSHMALLOW_FRAME = { w: 32, h: 10 } as const;
/** 烤制时长门（:50973 miscTimer > 900） */
export const MARSHMALLOW_COOK_TICKS = 900;

/** 烤制探测格（:50957/:51020/:50960-50961 1:1——原版 (int) 截断 + 整除 16 同为
 *  向零截断，链式 Math.trunc 保负坐标语义一致；世界内坐标两式恒等） */
export function marshmallowProbeTile(
  px: number, py: number, pw: number, facing: number, mountOffset = 0,
): { tx: number; ty: number } {
  const ilx = px + pw / 2 + 8 * facing;                              // :50957
  const ily = py + 24 + mountOffset;                                 // :51020
  return {
    tx: Math.trunc(Math.trunc(ilx + MARSHMALLOW_FRAME.w * 0.8 * facing) / 16),   // :50960
    ty: Math.trunc(Math.trunc(ily + mountOffset + Math.trunc(MARSHMALLOW_FRAME.h / 2)) / 16),  // :50961
  };
}

export interface MarshmallowRoastStep { timer: number; cooked: boolean }

/** 烤制态机单步（:50966-50994）：离火 → 归零（:50994 else）；火上 → +1、
 *  Next(5)==0 再 +1、>900 烤成归零（:50975）。rnd = Math.random 同源注入。 */
export function marshmallowRoastStep(timer: number, overLitCampfire: boolean, rnd: () => number): MarshmallowRoastStep {
  if (!overLitCampfire) return { timer: 0, cooked: false };   // :50992-50994
  let t = timer + 1;                                          // :50968
  if (Math.floor(rnd() * 5) === 0) t++;                       // :50969-50972
  if (t > MARSHMALLOW_COOK_TICKS) return { timer: 0, cooked: true };  // :50973-50975
  return { timer: t, cooked: false };
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
