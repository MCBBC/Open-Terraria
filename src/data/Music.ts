// 原版 BGM 选择链（Main.UpdateAudio_DecideOnNewMusic, Main.cs:12337-13158 精简移植;
// 1456 树同名函数在 :12101-12922,树间派发命名互换见红队 R22 §1 勘误）。
// 未实现的系统（天气/血月/事件/音乐盒/Shimmer/大多数 Boss）分支自然跳过；
// Boss 判定用 VANILLA_BOSS_IDS 近似原版 5000px 判定盒（:12363-12400 boss flag → 兜底 5 Boss1，
// EoC 原版即 Boss1）。
// ★IIIII230（2026-09-09）：TOW(Otherworld) 选曲链移植（UpdateAudio_DecideOnTOWMusic
//  1458 Main.cs:11789-12336 逐支 1:1）——drunk 世界（drunkWorld && !remix && !getGood,
//  Main.cs:11211 派发旗）在游戏内由 pickTowMusic 接管,经典链 pickMusic 零改动;
//  派发面见 pickTowMusic 尾注与 Game.ts。
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
  UndergroundDesert: 61,
  // ★IIIII230：TOW(Otherworld) 族 62-88（MusicID.cs:207-261 逐名对拍；vanilla 枚举名
  //  63 拼写为 OtherworlddDay——此处用正名,值 1:1）。音频面 Music_62..88.mp3 已全量
  //  在盘,Audio.ts tickFade 对 62-88 ×0.9 音量修正（Main.cs:11701-11702）已接
  OtherworldRain: 62, OtherworldDay: 63, OtherworldNight: 64, OtherworldUnderground: 65,
  OtherworldDesert: 66, OtherworldOcean: 67, OtherworldMushroom: 68, OtherworldDungeon: 69,
  OtherworldSpace: 70, OtherworldUnderworld: 71, OtherworldSnow: 72, OtherworldCorruption: 73,
  OtherworldUndergroundCorruption: 74, OtherworldCrimson: 75, OtherworldUndergroundCrimson: 76,
  OtherworldIce: 77, OtherworldUndergroundHallow: 78, OtherworldEerie: 79, OtherworldBoss2: 80,
  OtherworldBoss1: 81, OtherworldInvasion: 82, OtherworldLunarPillars: 83, OtherworldMoonLord: 84,
  OtherworldPlantera: 85, OtherworldJungle: 86, OtherworldWallOfFlesh: 87, OtherworldHallow: 88,
  JourneysEnd: 89, Deerclops: 90, Aether: 91,
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
  /** Boss/入侵事件 BGM（MusicID；0=无）。原版 Main.cs:12363-12613：屏盒内 NPC 按
   *  **数组序**逐个判定,首个盒命中者经 type→num3 槽位置 flag 后立即 `break` 退出
   *  循环（:12612）——每帧至多一个 flag、取 NPC 序首个命中者独占（first-wins,
   *  无跨 NPC 优先级）。本字段 = resolveEventMusic(slots) 的解析值（Game 侧按扫描
   *  序收集命中槽后传入,Set 插入序≈NPC 数组序）。链表 SLOT_MUSIC_CHAIN 仅作
   *  槽号→MusicID 映射,链序不再参与裁决（R22 勘误：旧注释"各置各 flag+链优先级"
   *  与原版相反）。槽→曲映射示例：月总38/Mechdusa25/火星37/塔34/世花24/光女57/
   *  猪鲨58/毁灭者92/双子97/Prime98/史王93/邪教徒94/血肉墙12/Boss1兜底5/
   *  克脑·雪人13/石巨人17/骷髅王104/蜂后96/史后56/EoW99/鹿角怪90/海盗35/
   *  哥布林39/旧日军团41 */
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
  /** ★IIIII224：Main.remixWorld（don't dig up）——remix 专用分支（:12818-13154） */
  remix?: boolean;
  /** ★IIIII224：Main.maxTilesY（UnderworldLayer = maxTilesY-200，remix 血月深带判 :12826/:12830） */
  maxTilesY?: number;
  /** 日食（Main.cs:12814-12820：非 remix 且相机在地表半屏带内 → Eclipse 27，
   *  优先级在 Boss/入侵曲之后、城镇/群系曲之前） */
  eclipse?: boolean;
  /** 月事件 BGM（MusicID 30=南瓜月 / 32=霜月；0=无）。原版位于 DecideOnNewMusic
   *  链尾（Main.cs:13150-13157）——覆盖一切（含 Boss 曲）；门=相机在地表
   *  worldSurface+10 格带内。Game 侧算好传入 */
  moonMusic?: number;
  /** 星璇塔 BGM——已并入 eventMusic（塔 422/493/507/517 → num3=10 → flag11 → 34，
   *  Main.cs:12243-12247/:12493-12497）。字段保留仅为兼容旧调用，缺省 0 */
  lunarMusic?: number;
  /** 火把神小游戏进行中（SceneMetrics.InTorchGodMinigame，Player.cs happyFunTorchTime）。
   *  原版 Main.cs:12708-12712：链首（CreditsRoll 89 之后）先于全部 Boss flag → 101
   *  TorchGodInstrumental。注意月事件覆写在链尾（:13150-13157）——南瓜/霜月仍压过
   *  火把神曲，故本分支排在 moonMusic 之后（两者实际互斥：小游戏只在地下） */
  torchGod?: boolean;
  /** ★IIIII232：制作组名单演出进行中（CreditsRollEvent.IsEventOngoing，Main.cs:3232）。
   *  原版两链同位链首：:12021 TOW 链 / :12706 经典链 → MusicID 89（MusicID.cs:190
   *  JourneysEnd，制作组名单曲）——先于火把神 101/87 与全部 Boss flag */
  creditsRoll?: boolean;
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

/** Boss 专属 BGM 表（Main.cs:12371-12508 type→num3 槽位 + :12626-12813 flag 链槽位→MusicID）：
 *  EoW 13-15→99、骷髅王 35/36→104、血肉墙 113/114→12、双子 125/126→97、
 *  Prime 127-131→98、毁灭者 134-136→92、蜂后 222→96、石巨人 245→17、世花 262-264→24、
 *  克脑 266→13(Boss3)、猪鲨 370→58、月总 398→38、异教徒 439→94、光皇 636→57、
 *  史莱姆皇后 657→56、鹿角怪 668→90、史莱姆王 50→93。
 *  表外 boss=true → Boss1(5)（:12522-12525）：EoC 4、月总头/手 396/397、火把神 664。
 *  ★地牢守卫 68（:9584 无 boss 位）与 Betsy 551（:16448 同无）不触发 Boss 曲——
 *  Betsy 走 DD2 军团曲 41（BelongsToInvasionOldOnesArmy :4771 含 551）。
 *  ★Mechdusa（remix+getGood 秘密种子，Main.cs:12526-12528）：125/126/127/134 覆写
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
  // 异教徒仪式态两族（Main.cs:12485-12499：CultistDevote 438 ai[1]==1 与
  // CultistArcher 379 ai[3]>=0 → num3=20 → flag20 → 音乐 94，与 439 本体同曲）。
  // 仪式态外不触发 Boss 曲（Game 选曲循环的 ceremony 门保证）
  438: 94, 379: 94,
  636: 57,
  657: 56,
  668: 90,
};

/** Boss → BGM（Main.cs:12522-12524：未列入表的 boss num3=1 → Boss1(5)） */
export function bossMusicFor(npcId: number): number {
  return BOSS_MUSIC[npcId] ?? MUSIC.Boss1;
}

// ============ 事件曲槽表（Main.cs:12363-12613 对拍,R22 勘误）===================
// 原版语义：屏盒内 NPC 按**数组序**逐个判定,首个盒命中者置 flag 后立即 break
// （:12612 在 if(Intersects) 块内）——每帧至多一个 flag、取首个命中 NPC 的槽独占
// （first-wins）,不存在跨 NPC 优先级链。下表只承担 槽号→MusicID 映射。
/** type → num3 槽位（:12373-12480 switch 全表；含入侵/塔/仪式族） */
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
/** num3 → MusicID 映射表（原版盒命中置 flag :12535-12612 + flag→MusicID 链 :12626-12813
 *  两段合并的终值;键 = num3 槽号与 MUSIC_SLOT/Game 扫描存入侧一致。
 *  ★曾把键写成 flag 号而集合里存的是 num3 号 → 17/24 族错曲,
 *  2026-08-19 石巨人终审修正（flag→num3 非线性三处：鹿角怪 flag2→槽16、
 *  EoW flag25→槽23、骷髅王 flag26→槽24,不能机械 ±1）。数组序仅存档用——
 *  裁决已改 first-wins（见 resolveEventMusic）,链优先级不再参与 */
const SLOT_MUSIC_CHAIN: Array<[number, number]> = [
  [7, 38],    // 月总
  [17, 25],   // Mechdusa（remix+getGood 机械族覆写槽,非 num3）
  [9, 37],    // 火星入侵
  [10, 34],   // 星璇塔（LunarPillars）
  [6, 24],    // 世纪之花
  [14, 57],   // 光女
  [15, 58],   // 猪鲨
  [18, 92],   // 毁灭者
  [21, 97],   // 双子
  [22, 98],   // Prime
  [19, 93],   // 史王
  [20, 94],   // 邪教徒/仪式
  [2, 12],    // 血肉墙
  [1, 5],     // Boss1 兜底（表外 boss=true）
  [3, 13],    // 克脑/雪人（Boss3）
  [4, 17],    // 石巨人
  [24, 104],  // 骷髅王
  [5, 96],    // 蜂后
  [13, 56],   // 史后
  [23, 99],   // EoW
  [16, 90],   // 鹿角怪
  [8, 35],    // 海盗
  [11, 39],   // 哥布林
  [12, 41],   // 旧日军团（OOA 成员覆写位）
];

const SLOT_MUSIC_MAP: Map<number, number> = new Map(SLOT_MUSIC_CHAIN);

/** 命中槽集合 → MusicID（0=无事件曲）。R22 first-wins 勘误：原版 NPC 循环内
 *  首个盒命中者置 flag 后立即 break（Main.cs:12612）——每帧至多一个槽、取
 *  **NPC 数组序首个命中者**独占。调用方（Game 扫描循环）按 NPC 序把命中槽
 *  存入 Set（JS Set 保插入序≈NPC 序）,此处按**输入序**取首个可映射槽,
 *  不再按 SLOT_MUSIC_CHAIN 优先级裁决。slot 1=Boss1 兜底、12=OOA 覆写、
 *  17=Mechdusa 覆写——由 Game 侧扫描按原版规则置入集合 */
export function resolveEventMusic(slots: Iterable<number>): number {
  for (const slot of slots) {
    const music = SLOT_MUSIC_MAP.get(slot);
    if (music !== undefined) return music;
  }
  return 0;
}

/** 旧日军团成员（NPCID.Sets.BelongsToInvasionOldOnesArmy：551-578 除 550 酒馆老板
 *  + 548 水晶 + 549 门——:12518-12520 成员覆写 num3=12,压过 type 表原槽） */
export function isOldOnesArmy(id: number): boolean {
  return (id >= 551 && id <= 578 && id !== 550) || id === 548 || id === 549;
}

/** 太空系数（Main.cs:12702）：(centerY/16 - (65+10*(w/4200)^2)) / (worldSurface/5)；<1 = 太空层
 *  （原版输入=相机中心 screenPosition+halfScreen,本仓传玩家中心——半屏量级输入差,R22 登记） */
export function spaceFactor(centerY: number, maxTilesX: number, worldSurface: number): number {
  return (centerY / 16 - (65 + 10 * (maxTilesX / 4200) ** 2)) / (worldSurface / 5);
}

/** 按环境选曲（优先级链 1:1 对照 Main.cs:12363-13157；
 *  沙尘暴40(:12848)/史莱姆雨48(:12824) 省略=真实缺口(R22 登记)；微光91(:12834)
 *  已由 ★SW-BJ41(2026-09-09) 补入=清偿 R22 台账该项，
 *  月事件（链尾最高优先级）见函数首 moonMusic 分支）。
 *  ★IIIII224（2026-09-09）：补全 remixWorld 分支（:12818/:12826/:12830/:12921/
 *  :12960/:12983/:12987/:13025/:13052/:13094/:13129/:13150-13154）——remix 世界
 *  地表带播太空曲 42/15（"don't dig up" 世界地表层=太空）、血月深岩层播 2、
 *  神圣地下深带播 9、风日 44 在 remix 地表带全部禁用。
 *  天气曲嵌在原版槽位内：44 风日只覆盖森林白天曲与神圣地表，19 雨只在森林
 *  白天/夜晚/神圣地表，52 风暴只在丛林/神圣地表与非特殊地表尾槽 */
export function pickMusic(inp: MusicInput): number {
  const s = inp.scene;
  // 八音盒（Main.cs:11232-11633）：DecideOnNewMusic 之后覆盖 newMusic = 全链最高优先级。
  // style 100 = 静音（MusicBoxSilence → flag2 → newMusic=0）；表外 style 缺映射 → 不覆盖
  // （原版 if-chain 无匹配分支时保留 DecideOnNewMusic 结果）
  const mb = inp.musicBox ?? -1;
  if (mb >= 0 && mb <= 99 && MB_STYLE_TO_MUSIC[mb] !== undefined) return MB_STYLE_TO_MUSIC[mb]!;
  if (mb === 100) return MUSIC.None;
  const lavaLine = inp.lavaLine;
  const halfScreen = 400; // 近似原版 screenHeight/2（原版=实际窗口高一半,1080p≈540;本仓固定 400,
                          // belowHalf 边界系统性偏浅 ~140px——R22 §9 判「伪」,登记待 Game 传入实测视口）
  const belowHalf = inp.centerY > inp.worldSurface * 16 + halfScreen; // 原版 Center.Y > worldSurface*16 + screenHeight/2
  const atSurface = !belowHalf;
  const storm = !!inp.weather?.storm;
  const rain = !!inp.weather?.rain;
  const windy = !!inp.weather?.windy;
  const bloodMoon = !!inp.bloodMoon;
  // ★IIIII224：remix 世界旗（Main.remixWorld）+ 地狱层界（Main.UnderworldLayer = maxTilesY-200）
  const remix = !!inp.remix;
  const underworldLayer = (inp.maxTilesY ?? 0) - 200;
  // 我们白天 timeOfDay∈[0.25,0.75] ↔ 原版 time∈[0,54000]（晨雨 59 判定 time<10800 用）
  const vanillaTime = ((inp.weather?.timeOfDay01 ?? 0.5) - 0.25) / 0.5 * 54000;

  // 月事件（原版 :13150-13157 位于 DecideOnNewMusic 链尾=最高优先级，覆盖 Boss 曲；
  // 门「相机在地表 worldSurface+10 带内」由 Game 侧判定后传入）
  if (inp.moonMusic && inp.moonMusic > 0) return inp.moonMusic;
  // ★IIIII232：名单演出（:12706-12709 IsEventOngoing → 89 JourneysEnd，链首——
  // 先于火把神 101 与全部 Boss flag；本分支按原链序排 moonMusic 之后）
  if (inp.creditsRoll) return MUSIC.JourneysEnd;
  // 火把神小游戏（原版 :12708-12712 InTorchGodMinigame → 101，先于全部 Boss flag；
  // 月事件链尾覆写在其后 → 本分支排 moonMusic 之后）
  if (inp.torchGod) return MUSIC.TorchGodInstrumental;
  // Boss/入侵事件曲（原版 :12626-12813 flag 链——本仓已改 first-wins 解析,
  //  见 resolveEventMusic;先于日食/群系分支）
  if (inp.eventMusic && inp.eventMusic > 0) return inp.eventMusic;
  if (inp.lunarMusic && inp.lunarMusic > 0) return inp.lunarMusic;   // 兼容旧字段（塔曲已并入 eventMusic）
  // 日食（:12814-12820：非 remix 相机在地表半屏带内 → 27；remix 相机在岩层下 → 27）
  if (inp.eclipse && !remix && !belowHalf) return MUSIC.Eclipse;
  if (inp.eclipse && remix && inp.centerY > inp.rockLevel * 16) return MUSIC.Eclipse;
  // remix 血月（:12826/:12830）：岩层下~地狱层且非双邪恶 → 2；地狱层且 X 居中带 → 2
  if (remix && bloodMoon && !s.zoneCrimson && !s.zoneCorrupt
      && inp.centerY > inp.rockLevel * 16 && inp.centerY <= underworldLayer * 16) return MUSIC.Eerie;
  if (remix && bloodMoon && inp.centerY > underworldLayer * 16
      && inp.centerX / 16 > inp.maxTilesX * 0.37 + 50
      && inp.centerX / 16 < inp.maxTilesX * 0.63) return MUSIC.Eerie;

  // ★SW-BJ41 2026-09-09：以太曲（Main.cs:12834 `else if (SceneMetrics.ZoneShimmer)
  //  newMusic = 91;`，MusicID.cs:194 Aether=91）——槽位在 remix 血月支之后、
  //  城镇昼曲 :12840 之前（链序 1:1）。R22 台账"微光91 省略"清偿;
  //  TOW(Otherworld) 链的 ZoneShimmer→72 支（Main.cs:12113-12115）已随 ★IIIII230
  //  移植进 pickTowMusic（drunk 世界专用链,经典链不混入）
  if (s.zoneShimmer) return MUSIC.Aether;

  // 城镇曲（昼 :12840 / 夜 :12844：≥3 城镇 NPC 且非暗影烛;白天需(无云且无风)或地下带,
  //  夜晚需(非血月且无云)或地下带——本仓缺「|| belowHalf」地下带支(R22 登记中项))
  const town = s.townNPCCount >= 3 && !s.zoneGraveyard;
  if (town && inp.isDay && !rain && !windy) return MUSIC.TownDay;
  if (town && !inp.isDay && !bloodMoon && !rain) return MUSIC.TownNight;
  // 地狱（:12852）
  if (inp.centerY > lavaLine * 16) return MUSIC.Underworld;
  // 太空（:12854）
  if (spaceFactor(inp.centerY, inp.maxTilesX, inp.worldSurface) < 1) {
    return inp.isDay ? MUSIC.SpaceDay : MUSIC.SpaceNight;
  }
  // 神庙墙（:12858 原版=玩家中心单格 tile.wall==87;本仓 SceneMetrics 计数域,边界格有差）
  if (s.zoneTemple) return MUSIC.Temple;
  // 地牢（:12862）
  if (s.zoneDungeon) return MUSIC.Dungeon;
  // 蘑菇地（:12866：bgStyle==9 地表或地下 style 2 —— 均由 ZoneGlowshroom 驱动）
  if (s.zoneGlowshroom) return MUSIC.Mushroom;
  // 腐化/猩红（:12870-12901：双邪恶共存按计数分主，深度分地表/地下曲）
  if (s.zoneCorrupt) {
    if (s.zoneCrimson) return belowHalf ? MUSIC.UndergroundCrimson : MUSIC.Crimson;
    return belowHalf ? MUSIC.UndergroundCorruption : MUSIC.Corruption;
  }
  if (s.zoneCrimson) return belowHalf ? MUSIC.UndergroundCrimson : MUSIC.Crimson;
  // 陨石（:12903）
  if (s.zoneMeteor) return MUSIC.Eerie;
  // 墓地（:12907）
  if (s.zoneGraveyard) return MUSIC.Graveyard;
  // 地下沙漠（:12911）/ 沙漠（:12915）
  if (s.zoneUndergroundDesert) return MUSIC.UndergroundDesert;
  if (s.zoneDesert) return MUSIC.Desert;
  // 丛林（:12940-12958：岩石层下 54 深地丛林；表层风暴 52 在昼夜曲前；昼 7 夜 55。
  //  原版另有爬升滞回支 :12944——54 在播且相机在 rockLayer-50 格带内不切表曲,本仓缺,R22 登记)
  if (s.zoneJungle) {
    // ★IIIII224 丛林 remix（:12921-12935）：岩层下 7；地表带 42/15（太空曲）；中间带 54。
    //  滞回支（:12927 newMusic==7 且 (rock-50) 格带内保持 7）与原版非 remix 54 滞回同属
    //  R22 登记缺口（需上一帧曲状态），此处省略=非粘滞
    if (remix) {
      if (inp.centerY > inp.rockLevel * 16 + halfScreen) return MUSIC.UndergroundJungle;
      if (inp.centerY < inp.worldSurface * 16 + halfScreen) return inp.isDay ? MUSIC.SpaceDay : MUSIC.SpaceNight;
      return MUSIC.UndergroundJungle;
    }
    if (inp.centerY > inp.rockLevel * 16 + halfScreen) return MUSIC.UndergroundJungle;
    if (storm && atSurface) return MUSIC.Storm;
    return inp.isDay ? MUSIC.JungleDay : MUSIC.JungleNight;
  }
  // 雪原（:12960-12981：地下 20 冰雪，地表 14；★IIIII224 remix：岩层下 14、
  //  地表带 42/15 太空曲、普通地下 20）
  if (s.zoneSnow) {
    if (belowHalf) return remix && inp.centerY > inp.rockLevel * 16 + halfScreen ? MUSIC.Snow : MUSIC.Ice;
    if (remix) return inp.isDay ? MUSIC.SpaceDay : MUSIC.SpaceNight;
    return MUSIC.Snow;
  }
  // 地下分支（:12983-13040：y ≥ surface+half 且（remix 或非海洋深渊））
  const ocean = inp.ocean ?? s.zoneBeach;
  if (belowHalf && (remix || !ocean)) {
    // ★IIIII224 remix 神圣地下（:12987）：岩层下带 → 9（地表神圣曲），否则 11
    if (s.zoneHallow) return remix && inp.centerY >= inp.rockLevel * 16 + halfScreen ? MUSIC.Hallow : MUSIC.UndergroundHallow;
    // 普通地下 4/31 随机（原版 :13002 仅当两曲都不在播时重掷 + 重掷清另一首 fade
    //  :13016/:13020;本仓 state 一经掷出整局粘死=R22 登记中项,需 IsTrackPlaying 语义配合）
    if (inp.state.ugMusic === 0) inp.state.ugMusic = Math.random() < 0.5 ? MUSIC.Underground : MUSIC.UndergroundAlt;
    // ★IIIII224 remix 地下覆写（:13025-13033）：岩层~maxTilesY-350 格带内
    //  雨天 19 > 地下沙漠 21 > 风日 44，压过 ugMusic 粘性随机
    if (remix && inp.centerY / 16 > inp.rockLevel && inp.centerY / 16 < (inp.maxTilesY ?? 0) - 350) {
      if (rain) return MUSIC.Rain;
      if (s.zoneDesert) return MUSIC.Desert;
      if (windy) return MUSIC.WindyDay;
    }
    return inp.state.ugMusic;
  }
  // 神圣地表（:13042-13059：仅白天分支；风暴 52 > 雨 19 > 风日 44(!remix :13052) > 神圣 9）
  if (inp.isDay && s.zoneHallow) {
    if (storm) return MUSIC.Storm;
    if (rain) return MUSIC.Rain;
    if (windy && !remix) return MUSIC.WindyDay;
    return MUSIC.Hallow;
  }
  // 风暴尾槽（:13061-13071：非神圣地表；血月优先 2）
  if (storm) return bloodMoon ? MUSIC.Eerie : MUSIC.Storm;
  // 海洋（:13072-13092：血月 2 > 城镇 46/47 > 昼 22 夜 43）
  if (ocean) {
    if (bloodMoon) return MUSIC.Eerie;
    if (town) return inp.isDay ? MUSIC.TownDay : MUSIC.TownNight;
    return inp.isDay ? MUSIC.OceanDay : MUSIC.OceanNight;
  }
  // ★IIIII224 remix 默认臂（:13094-13097）：remix 世界森林/其余地表带播太空昼夜曲
  //  （排位在海洋分支后、森林昼夜前）
  if (remix) return inp.isDay ? MUSIC.SpaceDay : MUSIC.SpaceNight;
  // 森林昼夜（:13098-13133）
  if (inp.isDay) {
    // 雨天：晨雨 59（time<10800）否则 19（:13102-13108）
    if (rain) return vanillaTime < 10800 ? MUSIC.MorningRain : MUSIC.Rain;
    // 白天 1/18 随机粘性；风日覆盖为 44（:13113-13133，!remixWorld 门 :13129）
    if (inp.state.dayMusic === 0) inp.state.dayMusic = Math.random() < 0.5 ? MUSIC.OverworldDay : MUSIC.OverworldDayAlt;
    return windy && !remix ? MUSIC.WindyDay : inp.state.dayMusic;
  }
  // 夜晚（:13135-13149：血月 2 > 雨 19 > 夜曲 3）
  if (bloodMoon) return MUSIC.Eerie;
  if (rain) return MUSIC.Rain;
  return MUSIC.OverworldNight;
}

// ============================================================================
// ★IIIII230：TOW(Otherworld) 选曲链（UpdateAudio_DecideOnTOWMusic,1458
// Main.cs:11789-12336 逐支 1:1）。drunk 世界（Main.drunkWorld && !remixWorld &&
// !getGoodWorld,UpdateAudio :11211 派发旗）游戏内选曲走本链;经典链（pickMusic）
// 不混入——两链是**整域替换**关系,非叠加（vanilla 派发：!swapMusic && !gameMenu &&
// flag → TOW 链;swapMusic=派对女孩音乐切换 :40748,本仓未实装=恒 false;
// gameMenu 标题曲覆写走 IIII225/IIIRS225 Audio 车道）。
// 链内无粘性随机槽（63/64/65 全判定,无 dayMusic/ugMusic 等价物）、无城镇曲、
// 无海洋昼夜 22/43、无八音盒外的独立系统——musicBox 覆写沿用经典链同款表
// （vanilla 音乐盒覆写在 DecideOn* 两链之后 :11232+,链无关）。
// ============================================================================

/** TOW 弹幕旗槽表（:11819-11959 switch 逐 type→num2,与经典链 MUSIC_SLOT **编号不同域**：
 *  骷髅王 35/36、史王 50、Prime 四臂 128-131、毁灭者体节 135/136 **不在表**→落
 *  boss 兜底 num2=1→81（经典链各走 104/93/98/92——TOW 域无专属曲, vanilla 原样）；
 *  438/379 仅仪式态（ai[1]==1 / ai[3]>=0,num=1600 盒）入槽 2。
 *  覆写序（:11961-11968）：OOA 成员→12 压原槽；remix+getGood 125/126/127/134→17；
 *  num2==0 && boss→1 兜底。首命中 NPC break（:12012,first-wins 同经典链） */
export const TOW_MUSIC_SLOT: Record<number, number> = {
  13: 1, 14: 1, 15: 1,                                      // EoW 族
  26: 11, 27: 11, 28: 11, 29: 11, 111: 11, 471: 11, 472: 11, // 哥布林
  113: 3, 114: 3,                                           // 血肉墙+眼
  125: 2, 126: 2,                                           // 双子
  127: 2, 134: 2,                                           // Prime 头 / 毁灭者探针（仅此二）
  143: 11, 144: 11, 145: 11,                                // 雪地三军团
  266: 1,                                                   // 克脑
  212: 8, 213: 8, 214: 8, 215: 8, 216: 8, 252: 8, 491: 8, 662: 8, // 海盗
  245: 2,                                                   // 石巨人
  222: 1,                                                   // 蜂后
  262: 6, 263: 6, 264: 6,                                   // 世花+钩蔓
  381: 9, 382: 9, 383: 9, 384: 9, 385: 9, 386: 9, 387: 9, 388: 9, 389: 9,
  390: 9, 391: 9, 392: 9, 395: 9, 520: 9,                   // 火星 Madness
  398: 7,                                                   // 月总核心
  422: 10, 493: 10, 507: 10, 517: 10,                       // 星璇四塔
  439: 2,                                                   // 邪教徒
  657: 13,                                                  // 史后
  636: 14,                                                  // 光女
  370: 15,                                                  // 猪鲨
  668: 16,                                                  // 鹿角怪
};

/** num2 → MusicID（:12029-12095 flag 链逐支；每帧至多一 flag（:12012 break）→
 *  else-if 链序为死序,裁决=输入序首个可映射槽（first-wins,同经典链勘误）。
 *  flag5/flag6（num2=4/5）全表无来源=死支,保留映射仅备案 vanilla 原文 81 */
const TOW_SLOT_MUSIC: Record<number, number> = {
  1: 81,   // flag（EoW/克脑/蜂后/表外 boss）→ OtherworldBoss1
  2: 80,   // flag3（双子/Prime 头/毁灭者探针/石巨人/邪教徒族）→ OtherworldBoss2
  3: 87,   // flag4（血肉墙）→ OtherworldWallOfFlesh
  4: 81,   // flag5（死支,无来源）
  5: 81,   // flag6（死支,无来源）
  6: 85,   // flag7（世花）→ OtherworldPlantera
  7: 84,   // flag8（月总）→ OtherworldMoonLord
  8: 82,   // flag9（海盗）→ OtherworldInvasion
  9: 82,   // flag10（火星）
  10: 83,  // flag11（星璇塔）→ OtherworldLunarPillars
  11: 82,  // flag12（哥布林/雪地军团）
  12: 82,  // flag13（OOA）
  13: 80,  // flag14（史后）
  14: 80,  // flag15（光女）
  15: 80,  // flag16（猪鲨）
  16: 80,  // flag2（鹿角怪）
  17: 81,  // flag17（Mechdusa remix+getGood 覆写）
};

/** TOW 事件旗槽集合 → MusicID（0=无）。语义与 resolveEventMusic 同构：输入序
 *  （NPC 数组序）首个可映射槽独占 */
export function resolveTowEventMusic(slots: Iterable<number>): number {
  for (const slot of slots) {
    const music = TOW_SLOT_MUSIC[slot];
    if (music !== undefined) return music;
  }
  return 0;
}

/** TOW（Otherworld）选曲链——drunk 世界游戏内专用。逐支锚（1458 Main.cs）：
 *  :12021 制作组名单 89（★IIIII232 已接 inp.creditsRoll）
 *  :12025 火把神 87 → :12029-12095 boss flag 域 → :12097-12103 日食 79 →
 *  :12105-12111 remix 血月 79 → :12113 微光 72 → :12117 沙尘暴 66 →
 *  :12121 地狱 71 → :12125 太空 70 → :12129 墙87/神庙 69 → :12133 地牢 69 →
 *  :12137 蘑菇 68 → :12141-12160 腐化 73/74（双邪恶按 BloodTileCount>EvilTileCount
 *  分主 → 75/76）→ :12163 猩红 75/76 → :12174 陨石 79 → :12178 墓园 79 →
 *  :12182 丛林 86（remix 地表带 70）→ :12193 雪原 72/77（remix 三带 70/77/72）→
 *  :12222 地下带 65/66/78/88/62（remix 深带变体）→ :12260 神圣昼 88/62 →
 *  :12271 风暴 62/79 → :12282 海洋深渊 67/79 → :12293 沙漠 66 →
 *  :12297 remix 70 → :12301 昼 63/62 → :12312 夜 64/79 →
 *  :12327-12333 链尾月事件覆写 82（南瓜月/霜月,门=screenY/16<worldSurface+10 || remix,
 *  由 Game 侧 moonMusicGated 同门传入）。 */
export function pickTowMusic(inp: MusicInput): number {
  const s = inp.scene;
  // 八音盒覆写（:11232+ 链后覆盖,两链同表——style→经典 MusicID 原样,drunk 不变域）
  const mb = inp.musicBox ?? -1;
  if (mb >= 0 && mb <= 99 && MB_STYLE_TO_MUSIC[mb] !== undefined) return MB_STYLE_TO_MUSIC[mb]!;
  if (mb === 100) return MUSIC.None;
  const halfScreen = 400;   // 同经典链登记：近似 screenHeight/2（1080p≈540）
  const underworldLayer = (inp.maxTilesY ?? 0) - 200;   // Main.UnderworldLayer（:12121/:12105 域）
  const belowHalf = inp.centerY > inp.worldSurface * 16 + halfScreen;   // Center.Y > worldSurface*16+half
  const rain = !!inp.weather?.rain;        // 原文本链不读 raining,直读 cloudAlpha>0f（:12262/:12302）——Game 侧同源
  const storm = !!inp.weather?.storm;      // Main._shouldUseStormMusic（:12271）
  const bloodMoon = !!inp.bloodMoon;
  const remix = !!inp.remix;
  // 链尾月事件（:12327-12333 在整链之后覆写=最高优先级,先判等价）
  if (inp.moonMusic && inp.moonMusic > 0) return MUSIC.OtherworldInvasion;
  // ★IIIII232：名单演出（:12021-12024 IsEventOngoing → 89,链首——IIIII230 登记缺口清偿）
  if (inp.creditsRoll) return MUSIC.JourneysEnd;
  // 火把神小游戏（:12025-12027 → 87,先于 boss flag 域）
  if (inp.torchGod) return MUSIC.OtherworldWallOfFlesh;
  // boss flag 域（resolveTowEventMusic 已按 TOW num2 表解析,first-wins）
  if (inp.eventMusic && inp.eventMusic > 0) return inp.eventMusic;
  // 日食（:12097-12103：地表半屏带 79；remix 恒 79——两支合并覆盖,非 remix 地下不吃）
  if (inp.eclipse && inp.centerY < inp.worldSurface * 16 + halfScreen) return MUSIC.OtherworldEerie;
  if (inp.eclipse && remix) return MUSIC.OtherworldEerie;
  // remix 血月（:12105-12111：岩层下~地狱层非双邪恶 79；地狱层 X 居中带 79）
  if (remix && bloodMoon && !s.zoneCrimson && !s.zoneCorrupt
      && inp.centerY > inp.rockLevel * 16 && inp.centerY <= underworldLayer * 16) return MUSIC.OtherworldEerie;
  if (remix && bloodMoon && inp.centerY > underworldLayer * 16
      && inp.centerX / 16 > inp.maxTilesX * 0.37 + 50
      && inp.centerX / 16 < inp.maxTilesX * 0.63) return MUSIC.OtherworldEerie;
  // 微光（:12113-12115 ★交办锚支：ZoneShimmer → 72 OtherworldSnow）
  if (s.zoneShimmer) return MUSIC.OtherworldSnow;
  // 沙尘暴（:12117）
  if (s.zoneSandstorm) return MUSIC.OtherworldDesert;
  // 地狱（:12121 UnderworldLayer=maxTilesY-200）
  if (inp.centerY > underworldLayer * 16) return MUSIC.OtherworldUnderworld;
  // 太空（:12125 num4<1）
  if (spaceFactor(inp.centerY, inp.maxTilesX, inp.worldSurface) < 1) return MUSIC.OtherworldSpace;
  // 神庙墙（:12129 tile.wall==87——本仓 zoneTemple 同源中心格 wall,经典链同款近似）
  if (s.zoneTemple) return MUSIC.OtherworldDungeon;
  // 地牢（:12133）
  if (s.zoneDungeon) return MUSIC.OtherworldDungeon;
  // 蘑菇（:12137 bgStyle==9 地表 ∪ undergroundBackground==2——本仓由 ZoneGlowshroom 驱动,经典链同款近似）
  if (s.zoneGlowshroom) return MUSIC.OtherworldMushroom;
  // 腐化/猩红（:12141-12171：双邪恶共存按 BloodTileCount>EvilTileCount 分主,深度分
  //  地表/地下曲。计数=SceneMetrics 同对象域（ZoneScanSize 169×124 窗互减+钳位终值,
  //  SceneFlags.evilTileCount/bloodTileCount）,与 zoneCorrupt/zoneCrimson 同源——
  //  经典链双邪恶支为已登记简化态,不消费计数（非 drunk 零扰动））
  if (s.zoneCorrupt) {
    if (s.zoneCrimson && (s.bloodTileCount ?? 0) > (s.evilTileCount ?? 0)) {
      return belowHalf ? MUSIC.OtherworldUndergroundCrimson : MUSIC.OtherworldCrimson;
    }
    return belowHalf ? MUSIC.OtherworldUndergroundCorruption : MUSIC.OtherworldCorruption;
  }
  if (s.zoneCrimson) return belowHalf ? MUSIC.OtherworldUndergroundCrimson : MUSIC.OtherworldCrimson;
  // 陨石/墓园（:12174/:12178）
  if (s.zoneMeteor) return MUSIC.OtherworldEerie;
  if (s.zoneGraveyard) return MUSIC.OtherworldEerie;
  // 丛林（:12182-12191：remix 地表带 70,其余 86——TOW 无丛林昼夜/深地 54 分域）
  if (s.zoneJungle) {
    return remix && inp.centerY < inp.worldSurface * 16 + halfScreen
      ? MUSIC.OtherworldSpace
      : MUSIC.OtherworldJungle;
  }
  // 雪原（:12193-12220：remix 三带 70/77/72；普通 地表 72 / 地下 77）
  if (s.zoneSnow) {
    if (remix) {
      if (inp.centerY < inp.rockLevel * 16 + halfScreen) {
        return inp.centerY <= inp.worldSurface * 16 + halfScreen
          ? MUSIC.OtherworldSpace
          : MUSIC.OtherworldIce;
      }
      return MUSIC.OtherworldSnow;
    }
    return belowHalf ? MUSIC.OtherworldIce : MUSIC.OtherworldSnow;
  }
  // 地下带（:12222-12258：Center.Y >= worldSurface*16+half 且非海洋深渊）
  const ocean = inp.ocean ?? s.zoneBeach;
  if (inp.centerY >= inp.worldSurface * 16 + halfScreen && !ocean) {
    if (remix && inp.centerY >= inp.rockLevel * 16 + halfScreen) {
      if (s.zoneUndergroundDesert) return MUSIC.OtherworldDesert;
      if (rain) return MUSIC.OtherworldRain;      // cloudAlpha>0f
      if (s.zoneHallow) return MUSIC.OtherworldHallow;
      if (s.zoneDesert) return MUSIC.OtherworldDesert;
      return MUSIC.OtherworldRain;
    }
    if (s.zoneHallow) return MUSIC.OtherworldUndergroundHallow;
    if (s.zoneUndergroundDesert) return MUSIC.OtherworldDesert;
    return MUSIC.OtherworldUnderground;
  }
  // 神圣地表昼（:12260-12268：cloudAlpha>0 → 62,否则 88；神圣夜不在此域,落链尾夜曲）
  if (inp.isDay && s.zoneHallow) return rain ? MUSIC.OtherworldRain : MUSIC.OtherworldHallow;
  // 风暴（:12271-12279：血月 79 > 62）
  if (storm) return bloodMoon ? MUSIC.OtherworldEerie : MUSIC.OtherworldRain;
  // 海洋深渊（:12282-12290：血月 79 > 67）
  if (ocean) return bloodMoon ? MUSIC.OtherworldEerie : MUSIC.OtherworldOcean;
  // 沙漠（:12293）
  if (s.zoneDesert) return MUSIC.OtherworldDesert;
  // remix 默认臂（:12297-12299）
  if (remix) return MUSIC.OtherworldSpace;
  // 森林昼（:12301-12309：cloudAlpha>0 → 62,否则 63）
  if (inp.isDay) return rain ? MUSIC.OtherworldRain : MUSIC.OtherworldDay;
  // 夜（:12312-12324：血月 79 > 64——cloud 两支同值 64,原文如此）
  return bloodMoon ? MUSIC.OtherworldEerie : MUSIC.OtherworldNight;
}
