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

/** 按环境选曲（优先级链同 Main.cs:12470-12913；remixWorld/天气/事件分支省略） */
export function pickMusic(inp: MusicInput): number {
  const s = inp.scene;
  const lavaLine = inp.lavaLine;
  const halfScreen = 400; // 原版 screenHeight/2（AssumedConstantScreenSize 1200/2≈600，本仓库视口 800/2）
  const belowHalf = inp.centerY > inp.worldSurface * 16 + halfScreen; // 原版 Center.Y > worldSurface*16 + screenHeight/2

  // Boss（原版 L12155-12312 屏幕附近 Boss 链：每 Boss 专属曲，先于全部群系分支）
  if (inp.bossMusic > 0) return inp.bossMusic;

  // 城镇曲（L12602-12609：≥3 城镇 NPC 且非墓地；无雨风判定省略）
  if (s.townNPCCount >= 3 && !s.zoneGraveyard) {
    return inp.isDay ? MUSIC.TownDay : MUSIC.TownNight;
  }
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
  // 丛林（L12683-12724：岩石层下 54 深地丛林；否则昼 7 夜 55）
  if (s.zoneJungle) {
    if (inp.centerY > inp.rockLevel * 16 + halfScreen) return MUSIC.UndergroundJungle;
    return inp.isDay ? MUSIC.JungleDay : MUSIC.JungleNight;
  }
  // 雪原（L12725-12746：地下 20 冰雪，地表 14）
  if (s.zoneSnow) return belowHalf ? MUSIC.Ice : MUSIC.Snow;
  // 地下分支（L12747：y ≥ surface+half 且非海洋）
  const ocean = inp.ocean ?? s.zoneBeach;
  if (belowHalf && !ocean) {
    if (s.zoneHallow) return MUSIC.UndergroundHallow;
    // 普通地下 4/31 随机（L12762-12788：仅当两曲都不在播时重掷——由调用方 state 模拟）
    if (inp.state.ugMusic === 0) inp.state.ugMusic = Math.random() < 0.5 ? MUSIC.Underground : MUSIC.UndergroundAlt;
    return inp.state.ugMusic;
  }
  // 神圣地表（L12806-12816 白天分支）
  if (inp.isDay && s.zoneHallow) return MUSIC.Hallow;
  // 海洋（L12836-12857）
  if (ocean) return inp.isDay ? MUSIC.OceanDay : MUSIC.OceanNight;
  // 森林昼夜（L12862-12910：白天 1/18 随机粘性；夜晚 3）
  if (inp.isDay) {
    if (inp.state.dayMusic === 0) inp.state.dayMusic = Math.random() < 0.5 ? MUSIC.OverworldDay : MUSIC.OverworldDayAlt;
    return inp.state.dayMusic;
  }
  return MUSIC.OverworldNight;
}
