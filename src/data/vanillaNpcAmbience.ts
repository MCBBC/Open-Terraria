// 原版 NPC 环境声数据表（NPC.cs 三段全量转录，2026-08-18 审计落地批）。
//   播放通道 = playSfxWav（GameHooks→Sfx.playWavFile 直文件,FILE_CASE_VOL 自带
//   Zombie_24-87 ×0.5 等档）——数字音效号→wav 映射见 FILE_CASE_VOL/SoundID.cs。
//
// 【表一 IDLE_SOUNDS】UpdateNPC 段 :91119-91246（"IdleSounds"）——
//   PlaySound(29, style) 的逐 type 掷骰（denom = Main.rand.Next(denom)==0）。
//   style 为 [lo,hi) 左闭右开区间（原版 Next(lo,hi)）。
// 【表二 CHATTER】AI_003 尾段 :57735-57764（战士族闲话,TargetClosest 前）。
// 【表三 CRITTER】UpdateNPC_CritterSounds :93420-93517（鸭/蛙/鸟/鼠/鸥/枭）。
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

/** 小动物声（:93420-93517）——门控较杂,逐 type 显式函数式描述 */
export interface CritterSoundSpec {
  denom: number;
  file: string;
  /** day=仅白天 night=仅夜 dawn=白天且 time<18000(清晨) nightOrUG=夜或地下 still=|vx|<0.5 */
  gate?: 'day' | 'night' | 'dawn' | 'nightOrUnderground' | 'still';
  /** 特殊:鸟 74/298/442 的多变体池（PlaySound 32 style 表） */
  pool?: string[];
}
export const CRITTER_SOUNDS: Record<number, CritterSoundSpec> = {
  611: { denom: 700, file: 'Zombie_46', gate: 'night' },   // 猫头鹰(:93425,(46))
  689: { denom: 700, file: 'Zombie_46', gate: 'night' },   // 灰猫头鹰
  602: { denom: 1200, file: 'Zombie_44', gate: 'day' },    // 海鸥(:93430,(44))
  603: { denom: 1200, file: 'Zombie_44', gate: 'day' },
  // 鸭族 362-365(:93435,(30)→case30 = Next(10,12) 池 1/300 换 Zombie_12(:1101-1122)）
  362: { denom: 200, file: 'Zombie_10', gate: 'day', pool: ['Zombie_10', 'Zombie_11', 'Zombie_12'] },
  363: { denom: 200, file: 'Zombie_10', gate: 'day', pool: ['Zombie_10', 'Zombie_11', 'Zombie_12'] },
  364: { denom: 200, file: 'Zombie_10', gate: 'day', pool: ['Zombie_10', 'Zombie_11', 'Zombie_12'] },
  365: { denom: 200, file: 'Zombie_10', gate: 'day', pool: ['Zombie_10', 'Zombie_11', 'Zombie_12'] },
  361: { denom: 200, file: 'Zombie_13', gate: 'still' },   // 青蛙族(:93441,夜或地下+|vx|<0.5)
  445: { denom: 200, file: 'Zombie_13', gate: 'still' },
  687: { denom: 200, file: 'Zombie_13', gate: 'still' },
  74: { denom: 400, gate: 'dawn', file: 'Zombie_14', pool: ['Zombie_14', 'Zombie_18'] },  // 鸟(:93457,2/3→14,1/3→18)
  297: { denom: 400, gate: 'dawn', file: 'Zombie_16' },   // 金雀(:93466)
  298: { denom: 400, gate: 'dawn', file: 'Zombie_17', pool: ['Zombie_17', 'Zombie_19'] }, // 红雀
  671: { denom: 400, gate: 'dawn', file: 'Zombie_68' },   // 金鹦鹉族(:93484,67/68/69)
  672: { denom: 400, gate: 'dawn', file: 'Zombie_68' },
  673: { denom: 400, gate: 'dawn', file: 'Zombie_69' },
  674: { denom: 400, gate: 'dawn', file: 'Zombie_67' },
  675: { denom: 400, gate: 'dawn', file: 'Zombie_67' },
  442: { denom: 400, gate: 'dawn', file: 'Zombie_16', pool: ['Zombie_16', 'Zombie_17', 'Zombie_19', 'Zombie_14', 'Zombie_18'] }, // 玛瑙蝶身鸟(:93501 五掷)
  300: { denom: 1800, file: 'Zombie_33' },                 // 鼠族(:93512,(33))
  447: { denom: 1800, file: 'Zombie_33' },
  610: { denom: 1800, file: 'Zombie_33' },
};
