// 原版 BGM 选择链（Main.UpdateAudio_DecideOnNewMusic, Main.cs:12101-12922 精简移植）。
// 未实现的系统（天气/血月/事件/音乐盒/Shimmer/大多数 Boss）分支自然跳过；
// Boss 判定用 VANILLA_BOSS_IDS 近似原版 5000px 判定盒（L12149-12378 boss flag → 兜底 5 Boss1，
// EoC 原版即 Boss1）。
import type { SceneFlags } from '../world/SceneMetrics';

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
  SkeletronPrime: 98, EaterOfWorlds: 99, Skeletron: 104,
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
  /** Boss 专属 BGM（MusicID；0=无 Boss）。原版屏幕±5000px 盒内 Boss 链（Main.cs:12155-12312）
   *  先于全部群系分支；每 Boss 一曲，未列入表的 Boss 一律 Boss1(5) */
  bossMusic: number;
  /** 入侵 BGM（MusicID；0=无）。原版屏内 ±5000px 入侵 NPC 驱动（Main.cs:12186-12192,
   *  12478-12566 链：海盗 35 > 哥布林 39 > 日食），优先级仅次于 Boss 曲 */
  invasionMusic?: number;
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
  /** 星璇塔 BGM（MusicID 34=LunarPillars；0=无）。原版 Main.cs:12243-12247（塔入屏
   *  ±5000px → num3=10）→ :12479-12493 flag11 → 34。优先级在 398 月总曲（flag8→38）
   *  之后——与月总同屏时月总曲胜出，故本字段在 pickMusic 内排在 bossMusic 之后判定
   *  （文档 §5 写"与 moonMusic 同层其后"，与源码冲突处以源码为准） */
  lunarMusic?: number;
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
 *  史莱姆皇后 657→56、鹿角怪 668→90、史莱姆王 50→93 */
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
  636: 57,
  657: 56,
  668: 90,
};

/** Boss → BGM（Main.cs:12280-12284：未列入表的 boss num3=1 → Boss1(5)） */
export function bossMusicFor(npcId: number): number {
  return BOSS_MUSIC[npcId] ?? MUSIC.Boss1;
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
  // Boss（原版 L12155-12312 屏幕附近 Boss 链：每 Boss 专属曲，先于全部群系分支）
  if (inp.bossMusic > 0) return inp.bossMusic;
  // 星璇塔曲（Main.cs:12479-12493：flag8 月总 38 → flag17 25 → flag10 37 → flag11 塔曲 34，
  // 排在 Boss 曲之后＝398 月总优先；其余 Boss 曲与塔曲同屏时取 Boss——单值 bossMusic 近似）
  if (inp.lunarMusic && inp.lunarMusic > 0) return inp.lunarMusic;
  if (inp.invasionMusic && inp.invasionMusic > 0) return inp.invasionMusic;
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
