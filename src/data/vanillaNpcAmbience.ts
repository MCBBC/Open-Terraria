// 原版 NPC 环境声数据表（NPC.cs 三段全量转录，2026-08-18 审计落地批）。
//   播放通道 = playSfxWav（GameHooks→Sfx.playWavFile 直文件,FILE_CASE_VOL 自带
//   Zombie_24-87 ×0.5 等档）——数字音效号→wav 映射见 FILE_CASE_VOL/SoundID.cs。
//
// 【表一 IDLE_SOUNDS】UpdateNPC 段 :91119-91246（"IdleSounds"）——
//   PlaySound(29, style) 的逐 type 掷骰（denom = Main.rand.Next(denom)==0）。
//   style 为 [lo,hi) 左闭右开区间（原版 Next(lo,hi)）。
// 【表二 CHATTER】AI_003 尾段 :57735-57764（战士族闲话,TargetClosest 前）。
// 【表三 CRITTER】UpdateNPC_CritterSounds :93365-93468（鸭/蛙/鸟/鼠/鸥/枭;1457 同行号）。
// 【表四 PET_SLIME_HIT_VOICES】StrikeNPC 受击段 :82255-82302——type==1（史莱姆）
//   且 ai[1]=语音饰品物品 id 时受击音按表替换（语音史莱姆 = 派对/天空盒特殊
//   生成的蓝史莱姆,ai[1] 赋值点 :60828-60852）。
export interface IdleSoundSpec {
  /** 掷骰分母（每帧 1/denom） */
  denom: number;
  /** Zombie_N 变体号 [lo,hi)（PlaySound 29 族）；单值写 [n,n+1] */
  range: [number, number];
  /** 附加门（ wet / 白天 / 夜 等，见注释）；缺省无 */
  gate?: 'wet' | 'day' | 'night' | 'nightOrUnderground' | 'dayDawn';
}

/** :91119-91246 IdleSounds 32 类（全部 PlaySound(29, variants)） */
export const IDLE_SOUNDS: Record<number, IdleSoundSpec> = {
  239: { denom: 900, range: [24, 26] },    // Cavebat 族(:91119 共享 Next(24,26))
  240: { denom: 900, range: [24, 26] },    // Giant Bat(同段共享;★曾误写 [24,25] 少一变体)
  62: { denom: 700, range: [26, 30] },     // Demon
  156: { denom: 700, range: [26, 30] },    // Arch Demon
  177: { denom: 600, range: [30, 32] },    // Derpling
  226: { denom: 800, range: [32, 33] },    // Flying Snake
  153: { denom: 1000, range: [33, 34] },   // Giant Tortoise
  63: { denom: 1000, range: [34, 36], gate: 'wet' },   // Pink Jellyfish(湿)
  64: { denom: 1000, range: [34, 36], gate: 'wet' },   // Green Jellyfish
  103: { denom: 1000, range: [34, 36], gate: 'wet' },  // Blue Jellyfish
  198: { denom: 1000, range: [36, 38] },   // Lihzahrd
  199: { denom: 1000, range: [36, 38] },   // Lihzahrd(祭司形)
  170: { denom: 600, range: [38, 41] },    // Pigron(粉)
  171: { denom: 600, range: [38, 41] },    // Pigron(棕)
  180: { denom: 600, range: [38, 41] },    // Pigron(紫)
  250: { denom: 700, range: [41, 44] },    // Angry Nimbuse
  580: { denom: 800, range: [44, 45] },    // Antlion(此段 Charger)
  582: { denom: 800, range: [44, 45] },    // Walker(幼虫形)
  581: { denom: 800, range: [44, 47] },    // Antlion Swarmer
  508: { denom: 800, range: [44, 45] },    // Sandshark(黑檀)
  509: { denom: 800, range: [44, 47] },    // Sandshark(猩红)
  494: { denom: 600, range: [47, 48] },    // Crawdad
  467: { denom: 700, range: [48, 50] },    // Deadly Sphere
  468: { denom: 700, range: [50, 53] },    // Man Eater…(原 Man Fly 468)
  288: { denom: 400, range: [53, 55] },    // Dungeon Spirit
  524: { denom: 700, range: [55, 57] },    // Ghoul 族四色
  525: { denom: 700, range: [55, 57] },
  526: { denom: 700, range: [55, 57] },
  527: { denom: 700, range: [55, 57] },
  496: { denom: 600, range: [57, 59] },    // Snail
  497: { denom: 600, range: [57, 59] },    // Glow Snail
  389: { denom: 800, range: [59, 61] },    // Electrified Slime…(原Tesla)
  471: { denom: 600, range: [61, 63] },    // Goblin Sorcerer
  482: { denom: 600, range: [63, 66] },    // Granite Golem
  388: { denom: 700, range: [66, 69] },    // Martian Drone
  520: { denom: 800, range: [69, 73] },    // Martian Walker
  477: { denom: 600, range: [73, 74] },    // Mothron
  258: { denom: 700, range: [74, 78] },    // Mushi Ladybug…(Fungo Fish 族;原表 74-78)
  252: { denom: 700, range: [78, 79] },    // Parrot
  469: { denom: 700, range: [79, 81] },    // The Possessed
  253: { denom: 700, range: [81, 84] },    // Reaper
  82: { denom: 700, range: [81, 84] },     // Reaper(旧id;原表 253||82 同段)
  498: { denom: 600, range: [84, 86] },    // 城镇史莱姆族 498-506
  499: { denom: 600, range: [84, 86] },
  500: { denom: 600, range: [84, 86] },
  501: { denom: 600, range: [84, 86] },
  502: { denom: 600, range: [84, 86] },
  503: { denom: 600, range: [84, 86] },
  504: { denom: 600, range: [84, 86] },
  505: { denom: 600, range: [84, 86] },
  506: { denom: 600, range: [84, 86] },
  391: { denom: 700, range: [86, 87] },    // Scutlix
};

/** AI_003 闲话表（:57735-57764）——各族掷骰 + 音效文件（直接 wav 名） */
export interface ChatterSpec { denom: number; file: string; }
export const CHATTER_SOUNDS: Record<number, ChatterSpec> = (() => {
  const m: Record<number, ChatterSpec> = {};
  // 僵尸大表（:57737,PlaySound(14)=Zombie_0-2 组→直取 0 号;FILE_CASE_VOL ×0.4）
  const zombies = [3, 691, 591, 590, 331, 332, 21, 449, 450, 451, 452, 31, 294, 295, 296,
    77, 110, 132, 167, 161, 162, 186, 187, 188, 189, 197, 200, 201, 202, 203, 223,
    291, 292, 293, 320, 321, 319, 481, 632, 635];
  for (const t of zombies) m[t] = { denom: 1000, file: 'Zombie_0' };
  // 血僵尸 489/僵尸鱼人 586（:57743,(14,type)→Zombie_21-23 由 LegacySoundPlayer style=type 映射;
  //   直文件名 = Zombie_{type%...}——style 489/586 超变体范围,取近似 21/22/23 池由调用方掷)
  m[489] = { denom: 800, file: 'Zombie_21' };
  m[586] = { denom: 800, file: 'Zombie_22' };
  // 木乃伊（:57748,(26)→LegacySoundPlayer case26 = Zombie_{3,4} ×0.9(:968-976 Next(3,5)））
  for (const t of [78, 79, 80, 630]) m[t] = { denom: 500, file: 'Zombie_3' };
  // 吸血鬼 159（:57753,(29,7)）;弗兰肯 162→(29,6);面怪 181→(29,8)
  m[159] = { denom: 500, file: 'Zombie_7' };
  m[162] = { denom: 500, file: 'Zombie_6' };
  m[181] = { denom: 500, file: 'Zombie_8' };
  // 地牢骨铠 269-280（:57764,(14)）
  for (let t = 269; t <= 280; t++) m[t] = { denom: 1000, file: 'Zombie_0' };
  return m;
})();

/** 小动物声（UpdateNPC_CritterSounds :93365-93468,1457 同行号）——逐 type 对拍
 *  SoundEngine.PlaySound(SoundID 号)：46 枭 / 44 海鸥 / 30 鸭 / 31 蛙 / 32 鸟 /
 *  67 鹦鹉(Cockatiel) / 68 金刚鹦鹉(Macaw) / 69 巨嘴鸟(Toucan) / 33 鼠。
 *  ★2026-08-24 R22 蓝队修正：旧表把 SoundID 类型号当 wav 变体号（枭→Zombie_46、
 *  海鸥→Zombie_44、鹦鹉族→Zombie_67/68/69、鼠→Zombie_33 全是 24-87 怪物语音库文件）
 *  ——按 LegacySoundPlayer 各 case 的真实 bank 变体号改回：
 *   case46(:1074) → Zombie_110/111（1/300 稀有掷 {112,113,114} 均分,见登记）
 *   case44(:1054) → Zombie_106-108 均匀池 ×0.2 音高 -0.70..0
 *   case30(:1105) → Zombie_10/11 均匀（1/300 稀有换 Zombie_12,登记）
 *   case31(:1128) → Zombie_13 ×0.35
 *   case32(:1136) → style 14-19 = Zombie_14-19 ×0.15 音高 -0.70..+0.25
 *   case67/68/69(:1147/:1159/:1171) → Zombie_118-120 / 126-128 / 129-130 均匀池
 *   case33(:1203) → Zombie_15 ×0.2 音高 -0.10..+0.30
 *  音量档在 Sfx.FILE_CASE_VOL、音高档在 Sfx.PITCH_CASE（R22 新增两表）。 */
export interface CritterSoundSpec {
  denom: number;
  file: string;
  /** day=仅白天 night=仅夜 dawn=白天且 time<18000(清晨) nightOrUG=夜或地下 still=|vx|<0.5 */
  gate?: 'day' | 'night' | 'dawn' | 'nightOrUnderground' | 'still';
  /** 多变体池（消费方均匀随机;权重用重复项表达——鸟 74 是原版 Next(3)!=0 的 2/3:1/3） */
  pool?: string[];
}
export const CRITTER_SOUNDS: Record<number, CritterSoundSpec> = {
  611: { denom: 700, file: 'Zombie_110', gate: 'night', pool: ['Zombie_110', 'Zombie_111'] },  // 猫头鹰(:93371,(46))
  689: { denom: 700, file: 'Zombie_110', gate: 'night', pool: ['Zombie_110', 'Zombie_111'] },  // 灰猫头鹰
  602: { denom: 1200, file: 'Zombie_106', gate: 'day', pool: ['Zombie_106', 'Zombie_107', 'Zombie_108'] },  // 海鸥(:93375,(44))
  603: { denom: 1200, file: 'Zombie_106', gate: 'day', pool: ['Zombie_106', 'Zombie_107', 'Zombie_108'] },
  // 鸭族 362-365(:93379,(30))——case30 常规 Next(10,12)=10/11 均匀,Zombie_12 仅 1/300
  //   稀有掷(消费方无权重面,稀有变体登记待接,勿再并回均匀池=R22 前的"鸭 12 均匀化"偏差)
  362: { denom: 200, file: 'Zombie_10', gate: 'day', pool: ['Zombie_10', 'Zombie_11'] },
  363: { denom: 200, file: 'Zombie_10', gate: 'day', pool: ['Zombie_10', 'Zombie_11'] },
  364: { denom: 200, file: 'Zombie_10', gate: 'day', pool: ['Zombie_10', 'Zombie_11'] },
  365: { denom: 200, file: 'Zombie_10', gate: 'day', pool: ['Zombie_10', 'Zombie_11'] },
  361: { denom: 200, file: 'Zombie_13', gate: 'still' },   // 青蛙族(:93386,(31),夜或地下+|vx|<0.5)
  445: { denom: 200, file: 'Zombie_13', gate: 'still' },
  687: { denom: 200, file: 'Zombie_13', gate: 'still' },
  // 鸟(:93393-93429,(32))：74 = Next(3)!=0→style14(2/3) else 18(1/3)——重复项表达精确权重
  74: { denom: 400, gate: 'dawn', file: 'Zombie_14', pool: ['Zombie_14', 'Zombie_14', 'Zombie_18'] },
  297: { denom: 400, gate: 'dawn', file: 'Zombie_16' },   // 金雀(:93415,恒 style16)
  298: { denom: 400, gate: 'dawn', file: 'Zombie_17', pool: ['Zombie_17', 'Zombie_17', 'Zombie_19'] }, // 红雀 2/3:1/3
  // 金鹦鹉三族(:93430-93441)：674/675→(67) Cockatiel、671/672→(68) Macaw、673→(69) Toucan
  674: { denom: 400, gate: 'dawn', file: 'Zombie_118', pool: ['Zombie_118', 'Zombie_119', 'Zombie_120'] },
  675: { denom: 400, gate: 'dawn', file: 'Zombie_118', pool: ['Zombie_118', 'Zombie_119', 'Zombie_120'] },
  671: { denom: 400, gate: 'dawn', file: 'Zombie_126', pool: ['Zombie_126', 'Zombie_127', 'Zombie_128'] },
  672: { denom: 400, gate: 'dawn', file: 'Zombie_126', pool: ['Zombie_126', 'Zombie_127', 'Zombie_128'] },
  673: { denom: 400, gate: 'dawn', file: 'Zombie_129', pool: ['Zombie_129', 'Zombie_130'] },
  // 玛瑙蝶身鸟(:93442-93462,(32) 五掷均分 16/17/19/14/18)
  442: { denom: 400, gate: 'dawn', file: 'Zombie_16', pool: ['Zombie_16', 'Zombie_17', 'Zombie_19', 'Zombie_14', 'Zombie_18'] },
  300: { denom: 1800, file: 'Zombie_15' },                 // 鼠族(:93464,(33)→case33 固定 num=15)
  447: { denom: 1800, file: 'Zombie_15' },
  610: { denom: 1800, file: 'Zombie_15' },
};

/** :82255-82302 宠物史莱姆受击语音——SoundID.cs CreateTrackable().WithVolume 档
 *  （鸡 0.8、其余全 0.5，:1115-1147），全表带 WithPitchVariance(0.4)（调用方掷
 *  ±0.4 音高抖动）。5484 铃铛 = BellHurt = LegacySoundStyle(2,35)（:1115）——
 *  走 case2 音库 = Item_35.wav（×0.75 自动档；曾误判为 Player_Hit_35"素材缺"，
 *  实为 wav 名搞错，2026-08-18 修正补齐，全 14 键无缺）。 */
export interface PetHitVoice { file: string; vol: number; }
export const PET_SLIME_HIT_VOICES: Record<number, PetHitVoice> = {
  5507: { file: 'player_hit_balloon', vol: 0.5 },
  5502: { file: 'player_hit_cat', vol: 0.5 },
  5485: { file: 'player_hit_chicken', vol: 0.8 },
  5484: { file: 'Item_35', vol: 1 },   // 铃铛 BellHurt=LegacySoundStyle(2,35)→Item_35,×0.75 自动
  5506: { file: 'player_hit_crow', vol: 0.5 },
  5503: { file: 'player_hit_dog', vol: 0.5 },
  5534: { file: 'player_hit_fairy', vol: 0.5 },
  5499: { file: 'player_hit_frog', vol: 0.5 },
  5500: { file: 'player_hit_goat', vol: 0.5 },
  5505: { file: 'player_hit_goblin', vol: 0.5 },
  5501: { file: 'player_hit_retro', vol: 0.5 },
  5504: { file: 'player_hit_turkey', vol: 0.5 },
  5508: { file: 'player_hit_undead', vol: 0.5 },
  5509: { file: 'player_hit_vampire', vol: 0.5 },
};

/** 受击语音掷骰（含鸡 5485 的 1/5 稀有变体 :82264-82271）；
 *  未命中表 → null（调用方落回默认 HitSound，:82295-82305 default 分支） */
export function petSlimeHitVoice(ai1: number): PetHitVoice | null {
  if (ai1 === 5485 && Math.floor(Math.random() * 5) === 0) {
    return { file: 'player_hit_chicken_rare', vol: 0.5 };   // ChickenHurtRare 0.5（:1119）
  }
  return PET_SLIME_HIT_VOICES[ai1] ?? null;
}
