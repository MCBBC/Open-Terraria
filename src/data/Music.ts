// 原版 BGM 选择链（Main.UpdateAudio_DecideOnNewMusic, Main.cs:12101-12922 精简移植）。
// 未实现的系统（天气/血月/事件/音乐盒/Shimmer/大多数 Boss）分支自然跳过；
// Boss 判定用 VANILLA_BOSS_IDS 近似原版 5000px 判定盒（L12149-12378 boss flag → 兜底 5 Boss1，
// EoC 原版即 Boss1）。
import type { SceneFlags } from '../world/SceneMetrics';
import { MB_STYLE_TO_MUSIC } from '../world/wiring/devices';

/** MusicID（Terraria.ID/MusicID.cs；音频文件 audios/music/Music_<id>.ogg） */
export const MUSIC = {
  None: 0, OverworldDay: 1, Eerie: 2, OverworldNight: 3, Underground: 4,
  Boss1: 5, TitleClassic: 6, JungleDay: 7, Corruption: 8, Hallow: 9,
  UndergroundCorruption: 10, UndergroundHallow: 11, Boss2: 12, Boss3: 13,
  Snow: 14, SpaceNight: 15, Crimson: 16, Golem: 17, OverworldDayAlt: 18,
  Rain: 19, Ice: 20, Desert: 21, OceanDay: 22, Dungeon: 23, Plantera: 24,
  Boss5: 25, Temple: 26, Eclipse: 27, RainAmbience: 28, Mushroom: 29,
  PumpkinMoon: 30, UndergroundAlt: 31, FrostMoon: 32, UndergroundCrimson: 33,
  LunarPillars: 34, PirateInvasion: 35, Underworld: 36, MartianMadness: 37,
  MoonLord: 38, GoblinArmy: 39, Sandstorm: 40, OldOnesArmy: 41, SpaceDay: 42,
  OceanNight: 43, WindyDay: 44, WindAmbience: 45, TownDay: 46, TownNight: 47,
  SlimeRain: 48, OverworldDayRemix: 49, TitleIntro: 50, Title: 51, Storm: 52,
  Graveyard: 53, UndergroundJungle: 54, JungleNight: 55, QueenSlime: 56,
  EmpressOfLight: 57, DukeFishron: 58, MorningRain: 59, TitleAlt: 60,
  UndergroundDesert: 61, JourneysEnd: 89, Deerclops: 90, Aether: 91,
  Destroyer: 92, KingSlime: 93, LunaticCultist: 94, QueenBee: 96, Twins: 97,
  SkeletronPrime: 98, EaterOfWorlds: 99, TorchGodVocals: 100,
  TorchGodInstrumental: 101, Skeletron: 104,
} as const;

/** 粘性随机槽（原版 Main.ugMusic/dayMusic 字段语义：只在目标曲不在播时重掷） */
export interface MusicState {
  ugMusic: number;    // 地下 4/31 二选一
  dayMusic: number;   // 白天 1/18 二选一
}

export function newMusicState(): MusicState {
  return { ugMusic: 0, dayMusic: 0 };
}

export interface MusicInput {
  scene: SceneFlags;
  isDay: boolean;
  /** Boss/入侵事件 BGM（MusicID；0=无）。原版 Main.cs:12150-12312：屏盒内 NPC 逐个
   *  经 type→num3 槽位 switch 置位**独立 flag**（多 Boss 并存各置各 flag，非首/末
   *  取一），再由 :12474-12566 的固定 else-if 链按 flag 优先级裁决——本字段 =
   *  resolveEventMusic(slots) 的链上取值（Game 侧扫描置 flag 后解析传入）。
   *  链序（节选）：月总38 > Mechdusa25 > 火星37 > 星璇塔34 > 世花24 > 光女57 >
   *  猪鲨58 > 毁灭者92 > 双子97 > Prime98 > 史王93 > 邪教徒94 > 血肉墙12 >
   *  Boss1兜底5 > 克脑/雪人13 > 石巨人17 > 骷髅王104 > 蜂后96 > 史后56 >
   *  EoW99 > 鹿角怪90 > 海盗35 > 哥布林39 > 旧日军团41 */
  eventMusic?: number;
  /** 天气。注意原版天气曲不是全局优先——只嵌在特定槽位（见 pickMusic）：
   *  storm52/rain19/windy44 各自在森林白天、神圣地表、丛林表层等分支内；
   *  wind=cloudAlpha==0 且白天中段 && |windTarget|≥0.4（updateMusicGates 维护） */
  weather?: {
    storm: boolean;
    rain: boolean;
    windy: boolean;
    timeOfDay01: number;
  };
  /** 血月（夜晚森林/海洋/风暴分支 2 号曲） */
  bloodMoon?: boolean;
  /** 日食（Main.cs:12578-12585：非 remix 且相机在地表半屏带内 → Eclipse 27，
   *  优先级在 Boss/入侵曲之后、城镇/群系曲之前） */
  eclipse?: boolean;
  /** 月事件 BGM（MusicID 30=南瓜月 / 32=霜月；0=无）。原版位于 DecideOnNewMusic
   *  链尾（Main.cs:12914-12921）——覆盖一切（含 Boss 曲）；门=相机在地表
   *  worldSurface+10 格带内。Game 侧算好传入 */
  moonMusic?: number;
  /** 星璇塔 BGM——已并入 eventMusic（塔 422/493/507/517 → num3=10 → flag11 → 34，
   *  Main.cs:12243-12247/:12493-12497）。字段保留仅为兼容旧调用，缺省 0 */
  lunarMusic?: number;
  /** 火把神小游戏进行中（SceneMetrics.InTorchGodMinigame，Player.cs happyFunTorchTime）。
   *  原版 Main.cs:12477-12480：链首（CreditsRoll 89 之后）先于全部 Boss flag → 101
   *  TorchGodInstrumental。注意月事件覆写在链尾（:12914-12921）——南瓜/霜月仍压过
   *  火把神曲，故本分支排在 moonMusic 之后（两者实际互斥：小游戏只在地下） */
  torchGod?: boolean;
  /** 八音盒曲目 style（SceneMetrics.musicBoxStyle；-1/缺省 = 无）。
   *  原版 Main.cs:11002-11405：ActiveMusicBox ≥ 0 时在 DecideOnNewMusic 之后覆盖 newMusic
   *  ——优先级高于一切（含月事件/Boss 曲）；style 100 = 静音（MusicBoxSilence → newMusic=0） */
  musicBox?: number;
  /** 世界数据 */
  worldSurface: number;   // tile
  rockLevel: number;      // tile
  lavaLine: number;       // tile（UnderworldLayer）
  maxTilesX: number;
  /** 玩家中心（px） */
  centerX: number;
  centerY: number;
  /** oceanDepths 结果（与背景共用；缺省内部重算近似） */
  ocean?: boolean;
  state: MusicState;
}

/** Boss 专属 BGM 表（Main.cs:12162-12280 type→num3 槽位 + :12474-12535 槽位→MusicID）：
 *  EoW 13-15→99、骷髅王 35/36→104、血肉墙 113/114→12、双子 125/126→97、
 *  Prime 127-131→98、毁灭者 134-136→92、蜂后 222→96、石巨人 245→17、世花 262-264→24、
 *  克脑 266→13(Boss3)、猪鲨 370→58、月总 398→38、异教徒 439→94、光皇 636→57、
 *  史莱姆皇后 657→56、鹿角怪 668→90、史莱姆王 50→93。
 *  表外 boss=true → Boss1(5)（:12283-12287）：EoC 4、月总头/手 396/397、火把神 664。
 *  ★地牢守卫 68（:9584 无 boss 位）与 Betsy 551（:16448 同无）不触发 Boss 曲——
 *  Betsy 走 DD2 军团曲 41（BelongsToInvasionOldOnesArmy :4771 含 551）。
 *  ★Mechdusa（remix+getGood 秘密种子，Main.cs:12288-12291）：125/126/127/134 覆写
 *  为 25 Boss5——优先级在 398(38) 之后（flag17 < flag8），由 Game 选曲侧重写。 */
export const BOSS_MUSIC: Record<number, number> = {
  13: 99, 14: 99, 15: 99,
  35: 104, 36: 104,
  50: 93,
  113: 12, 114: 12,
  125: 97, 126: 97,
  127: 98, 128: 98, 129: 98, 130: 98, 131: 98,
  134: 92, 135: 92, 136: 92,
  222: 96,
  245: 17,
  262: 24, 263: 24, 264: 24,
  266: 13,
  370: 58,
  398: 38,
  439: 94,
  // 异教徒仪式态两族（Main.cs:12212-12225：CultistDevote 438 ai[1]==1 与
  // CultistArcher 379 ai[3]>=0 → num3=20 → flag20 → 音乐 94，与 439 本体同曲）。
  // 仪式态外不触发 Boss 曲（Game 选曲循环的 ceremony 门保证）
  438: 94, 379: 94,
  636: 57,
  657: 56,
  668: 90,
};

/** Boss → BGM（Main.cs:12280-12284：未列入表的 boss num3=1 → Boss1(5)） */
export function bossMusicFor(npcId: number): number {
  return BOSS_MUSIC[npcId] ?? MUSIC.Boss1;
}

// ============ 事件曲 flag 链（Main.cs:12150-12566 全 1:1）===================
// 原版语义：屏盒内每个 NPC 经 type→num3 槽位 switch 置位**独立 flag**（互不覆盖，
// 多 Boss 并存各置各的），再由固定 else-if 链按 flag 裁决——不是"取首个/末个"。
/** type → num3 槽位（:12162-12280 switch 全表；含入侵/塔/仪式族） */
export const MUSIC_SLOT: Record<number, number> = {
  13: 23, 14: 23, 15: 23,                                   // EoW 族 → 99
  35: 24, 36: 24,                                           // 骷髅王+手 → 104
  26: 11, 27: 11, 28: 11, 29: 11, 111: 11, 471: 11, 472: 11, // 哥布林 → 39
  113: 2, 114: 2,                                           // 血肉墙+眼 → 12
  125: 21, 126: 21,                                         // 双子 → 97
  134: 18, 135: 18, 136: 18,                                // 毁灭者链 → 92
  127: 22, 128: 22, 129: 22, 130: 22, 131: 22,              // Prime+四臂 → 98
  143: 3, 144: 3, 145: 3, 266: 3,                           // 雪人三兄弟+克脑 → 13
  212: 8, 213: 8, 214: 8, 215: 8, 216: 8, 252: 8, 491: 8, 662: 8, // 海盗 → 35
  245: 4,                                                   // 石巨人 → 17
  222: 5,                                                   // 蜂后 → 96
  262: 6, 263: 6, 264: 6,                                   // 世花+钩蔓 → 24
  381: 9, 382: 9, 383: 9, 384: 9, 385: 9, 386: 9, 387: 9, 388: 9, 389: 9,
  390: 9, 391: 9, 392: 9, 395: 9, 520: 9,                   // 火星 Madness → 37
  398: 7,                                                   // 月总核心 → 38
  422: 10, 493: 10, 507: 10, 517: 10,                       // 星璇四塔 → 34
  438: 20, 379: 20, 439: 20,                                // 邪教徒+仪式态 → 94
  657: 13,                                                   // 史后 → 56
  636: 14,                                                   // 光女 → 57
  370: 15,                                                   // 猪鲨 → 58
  668: 16,                                                   // 鹿角怪 → 90
  50: 19,                                                    // 史王 → 93
};
/** num3 → flag → MusicID 的固定裁决链（:12474-12566 else-if 全序。
 *  Boss flag 段在前、RainbowBoulder(102/103,秘种子)之后接入侵段；本仓无
 *  rainbow boulder 曲,两段连续排即原版语义） */
const SLOT_MUSIC_CHAIN: Array<[number, number]> = [
  [8, 38],    // 月总（flag8,链首第二位仅次火把神小游戏）
  [17, 25],   // Mechdusa（remix+getGood 机械族覆写）
  [10, 37],   // 火星入侵
  [11, 34],   // 星璇塔（LunarPillars）
  [7, 24],    // 世纪之花
  [15, 57],   // 光女
  [16, 58],   // 猪鲨
  [18, 92],   // 毁灭者
  [21, 97],   // 双子
  [22, 98],   // Prime
  [19, 93],   // 史王
  [20, 94],   // 邪教徒/仪式
  [3, 12],    // 血肉墙
  [1, 5],     // Boss1 兜底（表外 boss=true）
  [4, 13],    // 克脑/雪人（Boss3）
  [5, 17],    // 石巨人
  [26, 104],  // 骷髅王
  [6, 96],    // 蜂后
  [14, 56],   // 史后
  [25, 99],   // EoW
  [2, 90],    // 鹿角怪
  [9, 35],    // 海盗
  [12, 39],   // 哥布林
  [13, 41],   // 旧日军团（OOA 成员覆写位）
];

/** flag 集合 → 链上 MusicID（0=无事件曲）。slot 1=Boss1 兜底、12=OOA 覆写、
 *  17=Mechdusa 覆写——由 Game 侧扫描按原版规则置入集合 */
export function resolveEventMusic(slots: Set<number>): number {
  for (const [slot, music] of SLOT_MUSIC_CHAIN) {
    if (slots.has(slot)) return music;
  }
  return 0;
}

/** 旧日军团成员（NPCID.Sets.BelongsToInvasionOldOnesArmy：551-578 除 550 酒馆老板
 *  + 548 水晶 + 549 门——:12281-12283 成员覆写 num3=12,压过 type 表原槽） */
export function isOldOnesArmy(id: number): boolean {
  return (id >= 551 && id <= 578 && id !== 550) || id === 548 || id === 549;
}

/** 太空系数（Main.cs:12466-12469）：(centerY/16 - (65+10*(w/4200)^2)) / (worldSurface/5)；<1 = 太空层 */
export function spaceFactor(centerY: number, maxTilesX: number, worldSurface: number): number {
  return (centerY / 16 - (65 + 10 * (maxTilesX / 4200) ** 2)) / (worldSurface / 5);
}

/** 按环境选曲（优先级链 1:1 对照 Main.cs:12155-12913；remixWorld/沙尘暴/微光分支省略，
 *  月事件（链尾最高优先级）见函数首 moonMusic 分支）。
 *  天气曲嵌在原版槽位内：44 风日只覆盖森林白天曲（L12886）与神圣地表（L12811），
 *  19 雨只在森林白天/夜晚/神圣地表，52 风暴只在丛林/神圣地表与非特殊地表尾槽 */
export function pickMusic(inp: MusicInput): number {
  const s = inp.scene;
  // 八音盒（Main.cs:11002-11405）：DecideOnNewMusic 之后覆盖 newMusic = 全链最高优先级。
  // style 100 = 静音（MusicBoxSilence → flag2 → newMusic=0）；表外 style 缺映射 → 不覆盖
  // （原版 if-chain 无匹配分支时保留 DecideOnNewMusic 结果）
  const mb = inp.musicBox ?? -1;
  if (mb >= 0 && mb <= 99 && MB_STYLE_TO_MUSIC[mb] !== undefined) return MB_STYLE_TO_MUSIC[mb]!;
  if (mb === 100) return MUSIC.None;
  const lavaLine = inp.lavaLine;
  const halfScreen = 400; // 原版 screenHeight/2（AssumedConstantScreenSize 1200/2≈600，本仓库视口 800/2）
  const belowHalf = inp.centerY > inp.worldSurface * 16 + halfScreen; // 原版 Center.Y > worldSurface*16 + screenHeight/2
  const atSurface = !belowHalf;
  const storm = !!inp.weather?.storm;
  const rain = !!inp.weather?.rain;
  const windy = !!inp.weather?.windy;
  const bloodMoon = !!inp.bloodMoon;
  // 我们白天 timeOfDay∈[0.25,0.75] ↔ 原版 time∈[0,54000]（晨雨 59 判定 time<10800 用）
  const vanillaTime = ((inp.weather?.timeOfDay01 ?? 0.5) - 0.25) / 0.5 * 54000;

  // 月事件（原版 L12914-12921 位于 DecideOnNewMusic 链尾=最高优先级，覆盖 Boss 曲；
  // 门「相机在地表 worldSurface+10 带内」由 Game 侧判定后传入）
  if (inp.moonMusic && inp.moonMusic > 0) return inp.moonMusic;
  // 火把神小游戏（原版 L12477-12480 InTorchGodMinigame → 101，先于全部 Boss flag；
  // 月事件链尾覆写在其后 → 本分支排 moonMusic 之后）
  if (inp.torchGod) return MUSIC.TorchGodInstrumental;
  // Boss/入侵事件曲（原版 :12474-12566 flag 链——resolveEventMusic 已按全序裁决,
  //  含月总38>Mechdusa25>火星37>塔34>…>海盗35>哥布林39>OOA41;先于日食/群系分支）
  if (inp.eventMusic && inp.eventMusic > 0) return inp.eventMusic;
  if (inp.lunarMusic && inp.lunarMusic > 0) return inp.lunarMusic;   // 兼容旧字段（塔曲已并入 eventMusic）
  // 日食（L12578-12585：eclipse 且相机在地表半屏带内 → 27；remix 分支省略）
  if (inp.eclipse && !belowHalf) return MUSIC.Eclipse;

  // 城镇曲（L12602-12609：≥3 城镇 NPC；白天需无云无风，夜晚需非血月无云）
  const town = s.townNPCCount >= 3 && !s.zoneGraveyard;
  if (town && inp.isDay && !rain && !windy) return MUSIC.TownDay;
  if (town && !inp.isDay && !bloodMoon && !rain) return MUSIC.TownNight;
  // 地狱（L12614）
  if (inp.centerY > lavaLine * 16) return MUSIC.Underworld;
  // 太空（L12618）
  if (spaceFactor(inp.centerY, inp.maxTilesX, inp.worldSurface) < 1) {
    return inp.isDay ? MUSIC.SpaceDay : MUSIC.SpaceNight;
  }
  // 神庙墙（L12622）
  if (s.zoneTemple) return MUSIC.Temple;
  // 地牢（L12626）
  if (s.zoneDungeon) return MUSIC.Dungeon;
  // 蘑菇地（L12630：bgStyle==9 地表或地下 style 2 —— 均由 ZoneGlowshroom 驱动）
  if (s.zoneGlowshroom) return MUSIC.Mushroom;
  // 腐化/猩红（L12634-12665：双邪恶共存按计数分主，深度分地表/地下曲）
  if (s.zoneCorrupt) {
    if (s.zoneCrimson) return belowHalf ? MUSIC.UndergroundCrimson : MUSIC.Crimson;
    return belowHalf ? MUSIC.UndergroundCorruption : MUSIC.Corruption;
  }
  if (s.zoneCrimson) return belowHalf ? MUSIC.UndergroundCrimson : MUSIC.Crimson;
  // 陨石（L12667）
  if (s.zoneMeteor) return MUSIC.Eerie;
  // 墓地（L12671）
  if (s.zoneGraveyard) return MUSIC.Graveyard;
  // 地下沙漠（L12675）/ 沙漠（L12679）
  if (s.zoneUndergroundDesert) return MUSIC.UndergroundDesert;
  if (s.zoneDesert) return MUSIC.Desert;
  // 丛林（L12683-12730：岩石层下 54 深地丛林；表层风暴 52 在昼夜曲前；昼 7 夜 55）
  if (s.zoneJungle) {
    if (inp.centerY > inp.rockLevel * 16 + halfScreen) return MUSIC.UndergroundJungle;
    if (storm && atSurface) return MUSIC.Storm;
    return inp.isDay ? MUSIC.JungleDay : MUSIC.JungleNight;
  }
  // 雪原（L12731-12754：地下 20 冰雪，地表 14）
  if (s.zoneSnow) return belowHalf ? MUSIC.Ice : MUSIC.Snow;
  // 地下分支（L12755：y ≥ surface+half 且非海洋）
  const ocean = inp.ocean ?? s.zoneBeach;
  if (belowHalf && !ocean) {
    if (s.zoneHallow) return MUSIC.UndergroundHallow;
    // 普通地下 4/31 随机（L12762-12788：仅当两曲都不在播时重掷——由调用方 state 模拟）
    if (inp.state.ugMusic === 0) inp.state.ugMusic = Math.random() < 0.5 ? MUSIC.Underground : MUSIC.UndergroundAlt;
    return inp.state.ugMusic;
  }
  // 神圣地表（L12799-12815：仅白天分支；风暴 52 > 雨 19 > 风日 44 > 神圣 9）
  if (inp.isDay && s.zoneHallow) {
    if (storm) return MUSIC.Storm;
    if (rain) return MUSIC.Rain;
    if (windy) return MUSIC.WindyDay;
    return MUSIC.Hallow;
  }
  // 风暴尾槽（L12816-12829：非神圣地表；血月优先 2）
  if (storm) return bloodMoon ? MUSIC.Eerie : MUSIC.Storm;
  // 海洋（L12831-12855：血月 2 > 城镇 46/47 > 昼 22 夜 43）
  if (ocean) {
    if (bloodMoon) return MUSIC.Eerie;
    if (town) return inp.isDay ? MUSIC.TownDay : MUSIC.TownNight;
    return inp.isDay ? MUSIC.OceanDay : MUSIC.OceanNight;
  }
  // 森林昼夜（L12861-12910）
  if (inp.isDay) {
    // 雨天：晨雨 59（time<10800）否则 19（L12865-12873）
    if (rain) return vanillaTime < 10800 ? MUSIC.MorningRain : MUSIC.Rain;
    // 白天 1/18 随机粘性；风日覆盖为 44（L12874-12888）
    if (inp.state.dayMusic === 0) inp.state.dayMusic = Math.random() < 0.5 ? MUSIC.OverworldDay : MUSIC.OverworldDayAlt;
    return windy ? MUSIC.WindyDay : inp.state.dayMusic;
  }
  // 夜晚（L12897-12910：血月 2 > 雨 19 > 夜曲 3）
  if (bloodMoon) return MUSIC.Eerie;
  if (rain) return MUSIC.Rain;
  return MUSIC.OverworldNight;
}
