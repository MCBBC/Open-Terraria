// 世界门面：TileStore + 元数据 + 实体容器 + 昼夜时钟
import { TileStore } from './TileStore';
import { WeatherState, applyWeatherSave, weatherToSave, type WeatherSave } from './weather/Weather';
import { T, TILE_DEFS } from '../data/tiles';
import { VI } from '../data/itemKeys';
import { newMoonEventState } from './MoonEvent';
import { newOldOnesArmyState } from './OldOnesArmy';
import { newLunarEventState } from './LunarEvent';
import type { FurnitureItemRecord } from './FurnitureItems';
import { BestiaryTracker, type BestiarySave } from '../data/Bestiary';

export interface ChestData { x: number; y: number; items: Array<{ id: number; stack: number; prefix?: number } | null>; locked?: boolean; }

/** 死亡掉钱保留比例（返回值 = 留在身上的份额；Player.DropCoins :53351-53390）：
 *  经典/旅程世界掉一半 / 专家掉 3/4 / 大师全掉——按**世界难度** Main.GameMode
 *  （0 经典 1 专家 2 大师 3 旅程按经典，Main.cs:2775-2780）。角色难度只决定
 *  是否走 DropCoins（见 Appearance.dropsCoinsOnDeath），不决定档位 */
export function deathCoinKeepFraction(worldDifficulty: number): number {
  // 原版 Player.DropCoins :53351-53380：num2 = stack/2(经典)/stack/4(专家)/0(大师) 是
  // **留在身上的份额**（num3 = stack - num2 才落地）——曾把 num2 误当掉出份额写反。
  if (worldDifficulty === 2) return 0;      // masterMode：num2=0 全掉（:53359）
  if (worldDifficulty === 1) return 0.25;   // expertMode：num2=stack/4 → 掉 3/4（:53356）
  return 0.5;                              // 经典/旅程：num2=stack/2 → 掉 1/2（:53353）
}

export class Clock {
  /** 昼夜边界（1:1 Main.time：昼 4:30AM-7:30PM=54000t、夜 32400t；0=午夜线性 24h） */
  static readonly DAWN = 4.5 / 24;   // 0.1875
  static readonly DUSK = 19.5 / 24;  // 0.8125
  timeOfDay: number = 8.25 / 24;   // 0-1，0=午夜 0.5=正午（起始 8:15AM = Main.time 13500）
  dayCount: number = 1;
  /** 月相 0-7（0=满月 4=新月；每黎明 +1 mod 8，Main.cs:64877）。对话月相池/血月门用 */
  moonPhase: number = 0;
  /** 血月旗标（dusk roll / dawn 清除，Main.cs:64817-64831） */
  bloodMoon: boolean = false;
  /** 日食旗标（Main.eclipse，随存档持久化——WorldFile.cs:1277-1278 写 / 2070-2072
   *  读，serialize meta.eclipse 同语义）：黎明 roll（Main.cs:64899-64920，
   *  hardMode && downedMechBossAny && 1/20）/ 日耀碑牌召唤（Player.cs:43308，白天），
   *  夜幕清除（Main.cs:64721-64725）——全天持续，只影响白天刷怪段。
   *  触发/清除实现在 world/Eclipse.ts */
  eclipse: boolean = false;
  /** 圣诞季（现实日期 12/15-31，checkXMas Main.cs:13054） */
  xMas: boolean = false;
  /** 万圣季（现实日期 10/20-11/10，checkHalloween Main.cs:13093） */
  halloween: boolean = false;
  readonly dayLengthMs: number;
  constructor(dayLengthMs: number) { this.dayLengthMs = dayLengthMs; }
  tick(dtMs: number) {
    // 原版 Main.time 恒速 tick（1t/帧）：dayLengthMs=全周期 24min 时，0.625/0.375 的
    // 昼夜窗口自然得出 15min/9min——★勿再按段调速（曾除反导致昼夜缩水，探针抓回）
    this.timeOfDay += dtMs / this.dayLengthMs;
    while (this.timeOfDay >= 1) { this.timeOfDay -= 1; this.dayCount++; }
  }
  get isDay(): boolean { return this.timeOfDay > Clock.DAWN && this.timeOfDay < Clock.DUSK; }
  get dayFactor(): number {
    // 昼夜平滑系数：白天 1，夜晚 0.32（月光下地表仍可见，火把不再像贴在黑幕上），晨昏过渡
    const t = this.timeOfDay;
    if (t > Clock.DAWN + 0.04 && t < Clock.DUSK - 0.04) return 1;
    if (t >= Clock.DUSK - 0.04 && t < Clock.DUSK + 0.04) return 1 - (t - (Clock.DUSK - 0.04)) / 0.08 * 0.68;
    if (t >= Clock.DUSK + 0.04 || t < Clock.DAWN - 0.04) return 0.32;
    return 0.32 + (t - (Clock.DAWN - 0.04)) / 0.08 * 0.68;
  }
  get hourFloat(): number { return this.timeOfDay * 24; }
}

export class World {
  store!: TileStore;   // definite assignment(读档 skipStore 路径由 fromPacket 注入)
  /** 本帧 SceneMetrics 快照（Game 每帧写；Enemy 判 zoneGraveyard 等只读用） */
  scene: import('./SceneMetrics').SceneFlags | null = null;
  /** 世界难度 = 原版 Main.GameMode（Main.cs:2677，ActiveWorldFileData.GameMode）：
   *  0 经典 / 1 专家 / 2 大师 / 3 旅程。与角色难度（Appearance.difficulty 0软/1中/2硬/3旅）
   *  是**两条独立轴**——世界难度管掉落倍率/吸血预算/掉钱档/旅行商店等 gameplay 门；
   *  角色难度只管死亡惩罚（软核掉钱/中核掉物品/硬核角色消亡）。创建 UI 写入、
   *  存档 header 持久化、wld 导入按 WldParser.gameMode 回填（旧档/worker 包缺省=0 经典） */
  difficulty = 0;
  /** 流星雨剩余计数(WorldGen.meteorShowerCount,WorldFile.cs:1069/:177 持久化)。
   *  消耗:UpdateWorld :71771-71810 每 tick 1/4 掷一颗 1078 伤害碎块,计数-1;
   *  晷快进直接清零(:71774-71777) */
  meteorShowerCount = 0;
  // ---- 夜间小动物概率五件套（NPC.setFireFlyChance，NPC.cs:94557-94610）----
  // 每夜 StartNight 重掷（Main.cs:64706）；原版为 NPC 静态位不落盘，本仓按运行时
  // 审计台账要求随存档（旧档缺省=代表值 30/5/15/10/绝迹）。消费端：
  //  fireFlyChance → VanillaSpawner 夜萤火虫门（NPC.cs:4413 Next(fireFlyChance)）；
  //  fireFlyFriendly/fireFlyMultiple → spawnFriendly 夜萤火虫群（NPC.cs:2321/:2329）；
  //  butterflyChance/stinkBugChance → 白昼蝴蝶/椿象（NPC.cs:2394/:2381）。
  // 999999 = 当夜该族绝迹（原版哨兵值）
  fireFlyChance = 30;
  fireFlyFriendly = 5;
  fireFlyMultiple = 15;
  butterflyChance = 10;
  stinkBugChance = 999999;
  /** CultistRitual.delay（CultistRitual.cs:32，WorldFile.cs:1340 写/:2192 读 随存档）：
   *  地牢拜月教石碑 437 自然重生延迟。石碑召出 439 时置 43200（TabletDestroyed，
   *  NPC.cs:38881），按 dayRate 递减；双零掷 TrySpawning(dungeonX/Y)（Main.cs:64427
   *  每帧 UpdateTime）。缺省 86400 = delayStart（新世界 ResetTempsToDayTime WF:1018 /
   *  v108 前旧档 WF:2188 同值）。recheck 为运行时静态位不落盘（RuntimeEvents.ts） */
  cultistDelay = 86400;
  /** 旗帜击杀计数（BannerSystem.killCount:bannerId→数;随会话,存档登记未接） */
  bannerKills: Record<number, number> = {};
  /** 旅程模式时间倍率（CreativePowers.ModifyTimeRate.TargetTimeRate，CreativePowers.cs:866-884：
   *  整数 1-24×，IPersistentPerWorldContent 随世界存档；非旅程世界恒 1） */
  journeyTimeRate = 1;
  /** 旅程模式时间冻结（CreativePowers.FreezeTime，CreativePowers.cs:1448——开启时 dayRate=0） */
  journeyFreezeTime = false;
  /** 附魔日晷/月晷快进（Main.fastForwardTimeToDawn/Dusk + sundialCooldown/moondialCooldown，
   *  Main.cs:6240-6268 Sundialing/Moondialing：使用置旗 + 冷却 8 天；快进中 dayRate=60。
   *  清旗点 = UpdateTime_StartDay :64844-64847（dawn）/ StartNight :64691-64694（dusk），
   *  冷却递减 = StartDay :64885-64887（sundial）/ StartNight :64695-64697（moondial），
   *  血月清零 = StartNight :64892-64893。随世界存档持久化（WorldFile.cs:1311/1342/1416-1417） */
  fastForwardTimeToDawn = false;
  fastForwardTimeToDusk = false;
  sundialCooldown = 0;
  moondialCooldown = 0;
  /** 全员熟睡旗（CurrentFrameFlags.SleepingPlayersCount==ActivePlayersCount && >0，
   *  Main.cs:6280-6285——Game 每 tick 下发；单人 = 本地玩家 sleeping && timeSleeping>=120） */
  allSleeping = false;
  /** IsFastForwardingTime（Main.cs:6230-6238）——事件 roll 压制门共用 */
  isFastForwardingTime(): boolean { return this.fastForwardTimeToDawn || this.fastForwardTimeToDusk; }
  /** 专家世界（Main.cs:2775-2777：GameMode==1/2 → Difficulty≥Expert；旅程 3 不算） */
  get isExpert(): boolean { return this.difficulty === 1 || this.difficulty === 2; }
  /** 大师世界（Main.cs:2779-2780：仅 GameMode==2） */
  get isMaster(): boolean { return this.difficulty === 2; }
  /** 旅程世界（Main.cs:2696 IsJourneyMode：GameMode==3） */
  get isJourney(): boolean { return this.difficulty === 3; }
  /** 当前 dayRate（Main.cs:6270-6294 UpdateTimeRate 1:1）：快进恒 60；
   *  否则冻结 0 / TargetTimeRate × 全员睡 5。时钟/天气/税计时/旅行商概率全链消费 */
  dayRate(): number {
    if (this.isFastForwardingTime()) return 60;
    if (this.journeyFreezeTime) return 0;
    return this.journeyTimeRate * (this.allSleeping ? 5 : 1);
  }
  /** 时间推进倍率（Main.cs:6278-6290 UpdateTimeRate：冻结 0 / 否则 TargetTimeRate；gameMenu 恒 1）
   *  ——不含快进/睡觉两档的旧入口，保留给不参与 dayRate 链的调用方 */
  journeyTimeScale(): number { return this.journeyFreezeTime ? 0 : this.journeyTimeRate; }
  /** 彩蛋种子旗标（SeedEasterEggs.parseSeed；血月 1/6 十周年 / drunkWorld 黎明翻转用。
   *  生成期灌入 + 存档 header.seedFlags 持久化；wld 导入恒 {}） */
  seedFlags: import('./gen/SeedEasterEggs').SeedFlags = {};
  name: string;
  seed: number;
  spawnX = 0; spawnY = 0;
  groundLevel = 0; rockLevel = 0;   // tile 坐标
  /** 地狱顶（原版 UnderworldLayer = maxTilesY-200；TerrainPass 设定，SceneMetrics/BGM/背景共用） */
  lavaLine = 0;
  /** NPC.Spawner.fairyLog（MysticLogFairiesEvent.cs:181-183 扫倒木置位）——运行时位
   *  不落盘（StartWorld/StartNight 每次重扫回填）；地下仙女链（NPC.cs:5730）消费门 */
  fairyLog = false;
  clock: Clock;
  /** 天气系统（WeatherState 状态机；存档/wld 导入经 applyWeatherSave 回填） */
  weather = new WeatherState();
  applyWeather(s: Partial<WeatherSave>) { applyWeatherSave(this.weather, s); }
  chests: ChestData[] = [];
  /** 墓碑碑文（原版 Sign 系统的最小子集）：锚点 = 墓碑 tile 左上格 */
  signs: Array<{ x: number; y: number; text: string }> = [];
  /** 挂物族存放物（物品框 395/武器架 471/模特 470/帽架 475/食物盘 520/展示罐 698；
   *  原版 TileEntity 体系的最小等价，锚点 = 物件左上格。见 world/FurnitureItems.ts */
  furnitureItems: FurnitureItemRecord[] = [];
  /** 读档/wld 导入携带的城镇 NPC（afterWorldLoad 原位生成后清空；原版 WorldFile town NPC 段） */
  pendingTownNpcs?: Array<{ key: string; x: number; y: number; home: [number, number] | null; bound?: boolean; givenName?: string; shimmered?: boolean }>;
  // Boss 进度旗标
  flags: Record<string, boolean> = { downedEyeOfCthulhu: false, downedSkeletron: false, shadowOrbSmashed: false, hardMode: false };
  /** 已砸碎恶魔祭坛数（WorldGen.altarCount，WorldFile.cs:1303/2100 随存档持久化）：
   *  SmashAltar 矿物三档轮换的波次源（%3 选档 /3+1 衰减），海盗入侵自然 roll 的
   *  altarCount>0 门（Main.cs:64938） */
  altarCount = 0;
  /** 困难矿世界锁定选种（WorldGen.SavedOreTiers，WF:1305-1307 随存档持久化）：
   *  每档矿种全世界二选一固定——钴 107/钯 221、秘银 108/山铜 222、精金 111/钛 223。
   *  -1 = 尚未砸过该档（SmashAltar 首砸 roll 一次并锁定）；存 sheet id */
  savedOreTiers = { cobalt: -1, mythril: -1, adamantite: -1 };
  /** 已砸暗影珠/猩红之心计数（WorldGen.shadowOrbCount，WF:1302/2099 随存档持久化）：
   *  满 3 召 EoW/BoC 后归零（CheckOrb :54321-54352）；哥布林军队自然 roll 的
   *  shadowOrbSmashed 门独立于此计数 */
  shadowOrbCount = 0;
  /** 图鉴统计（BestiaryUnlocksTracker——原版 IPersistentPerWorldContent，随世界存档：
   *  WorldFile.cs:3399 Save/:3405 Load。杀数/遇数/聊天三桶，数据层见 data/Bestiary.ts） */
  bestiary = new BestiaryTracker();
  // ---- 渔夫任务链（Main.anglerQuest / anglerWhoFinishedToday / anglerQuestFinished）----
  /** 当日任务鱼索引（Main.anglerQuest，Main.cs:1843；随世界存档 WorldFile.cs:1335/2161。
   *  每日黎明 AnglerQuestSwap 重掷（Main.cs:64852）；表 = Main.anglerQuestItemNetIDs
   *  41 条（Main.cs:1845-1852，本仓 data/vanillaFishing.ts ANGLER_QUEST_ITEMS） */
  anglerQuest = 0;
  /** 今日已交付玩家名单（Main.anglerWhoFinishedToday，Main.cs:1839；存档 WF:1329-1333/
   *  2147-2150——同日读档不重置，与原版一致）。多人=每名玩家各限一次 */
  anglerWhoFinishedToday: string[] = [];
  /** 今日任务是否已交（Main.anglerQuestFinished，Main.cs:1841）。运行时态**不存档**
   *  ——原版读档 loadTempInfo 重置 false（WorldFile.cs:628-629）；黎明重掷时清零
   *  （AnglerQuestSwap :3806） */
  anglerQuestFinished = false;
  weatherToSave(): import('./weather/Weather').WeatherSave | undefined {
    return weatherToSave(this.weather);
  }
  /** 读档/worker 包回填（loadSaveData 与 WorldPacket.fromPacket 两条路径共用） */
  applyBestiary(data: BestiarySave | undefined): void {
    this.bestiary = BestiaryTracker.fromSave(data);
  }
  // 树登记：砍树干时找到整棵树（roots → 范围）
  trees: Array<{ x: number; y: number; h: number }> = [];
  /** 战争迷雾：1 = 已探索。按 tile 粒度。（读档 skipStore 路径由 fromPacket 注入） */
  explored!: Uint8Array;
  /** 原版树样式数据（header treeX/treeStyle）：横向 4 区森林树冠样式 */
  treeX: number[] = [];
  treeStyle: number[] = [0, 0, 0, 0];
  /** 以太生物群系中心（GenVars.shimmerPosition；无微光世界为 0）。ShimmerPass 写入，
   *  生成期沉降 ShimmerRemoveWater（WorldGen.cs:34859）按此清腔内非微光液体 */
  shimmerX = 0;
  /** 月亮贴图样式（原版 header moonType 0-8,WF:1252;SkyRenderer 消费） */
  moonType = 0;
  /** 地狱多层背景风格（WorldGen.underworldBG,WF:1376;0/1/2 → Underworld 贴图集;
   *  本仓由种子确定性派生(seedPick),同 [[RandomizeBackgrounds]] 其余背景风格同策略） */
  underworldBG = 0;
  shimmerY = 0;
  /** 世界级生物群系常量(原版 header,生成期 Reset pass 掷出) */
  crimson = false;          // true=猩红 false=腐化
  dungeonX = 0;            // 地牢位置
  /** 地牢入口地表 Y（原版 Main.dungeonY：CheckToSpawnDungeonEnemies 要求玩家在其 +40 格以下才刷地牢怪）。
   *  缺省 0=未知，使用处以 groundLevel 回退 */
  dungeonY = 0;
  jungleX = 0;             // 丛林位置
  // ---- 南瓜月/霜月事件（原版 Main.pumpkinMoon/snowMoon + NPC.waveNumber 三字段）----
  // 运行时状态，**不进存档**：原版这些字段均不写 WorldFile（主菜单即重置 Main.cs:48332），
  // serialize/fromPacket 不碰本字段；读档后 kind=0 即无事件（对齐原版）
  moonEvent = newMoonEventState();
  // ---- 旧日军团（原版 DD2Event 全静态位；召唤入口 = 永恒水晶座 466 右键）----
  // 运行时状态不存档（对齐原版：仅 DownedInvasionT1-3 随 WorldFile 存 → flags）。
  // 纯逻辑在 world/OldOnesArmy.ts（DD2Event.cs 1:1）；Game 接线 + AI 依赖注入
  // DD2_EVENT_HOOKS（bossAI_dd2.ts 占位）
  oldOnesArmy = newOldOnesArmyState();
  // ---- 星璇塔 / 天界入侵（原版 NPC.LunarApocalypseIsUp + TowerActive/Shield 六字段）----
  // 运行时状态：downedTower*/towerActive*/lunarApocalypseUp 三类 bool 走 flags 进存档
  // （WorldFile.cs:1352-1360）；盾值与月总倒计时**不存档**（读档 TowerActive=true 重置满盾，
  // WorldFile.cs:2240-2255），读档回填见 LunarEvent.applyLunarSave
  lunarEvent = newLunarEventState();
  // ---- 入侵系统持久化状态（原版 WorldFile.cs:1306-1339 存档五元组）----
  /** 当前入侵类型（InvasionID：0=无 1=哥布林 2=雪人军团 3=海盗；4=火星后续） */
  invasionType = 0;
  /** 剩余入侵点数（击杀扣减，≤0 即胜利） */
  invasionSize = 0;
  /** 入侵开始总点数（进度条分母） */
  invasionSizeStart = 0;
  /** 入侵前线图块 X（向 spawnX 推进；启动时 = 世界左右边缘） */
  invasionX = 0;
  /** 入侵冷却天数（黎明 -1；1.4.5.6 事实闲置，仅存档位） */
  invasionDelay = 0;
  /** TreeTops 13 区域变体（v≥211 wld 权威；索引 0-3 森林/5 丛林/6 雪/7 神圣） */
  treeTops: number[] = [];

  exploredVersion = 0;
  /** 最近一次 markExplored 新点亮格的包围盒（tile 坐标；null = 无新探索）。
   *  渲染端雾画布按此做脏矩形增量更新——旧版无条件 bump 版本导致每 15 tick
   *  整幅重建 4200×1200 雾画布（20MB 分配 + 500 万格循环 ≈ 672ms 长任务），
   *  首次导入大世界开地图时主线程持续阻塞 → 白屏闪烁 + 标签页 OOM 崩溃 */
  exploredDirty: { x0: number; y0: number; x1: number; y1: number } | null = null;
  markExplored(cx: number, cy: number, radius: number) {
    const st = this.store;
    const x0 = Math.max(0, cx - radius), x1 = Math.min(st.w - 1, cx + radius);
    const y0 = Math.max(0, cy - radius), y1 = Math.min(st.h - 1, cy + radius);
    let changed = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * st.w + x;
        if (!this.explored[i] && (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) {
          this.explored[i] = 1;
          changed = true;
          // 脏包围盒与新点亮格取并（渲染帧间多次 mark 不丢更新）
          const d = this.exploredDirty;
          if (d) { if (x < d.x0) d.x0 = x; if (x > d.x1) d.x1 = x; if (y < d.y0) d.y0 = y; if (y > d.y1) d.y1 = y; }
          else this.exploredDirty = { x0: x, y0: y, x1: x, y1: y };
        }
      }
    }
    if (changed) this.exploredVersion++;
  }

  constructor(w: number, h: number, seed: number, name = '新世界', skipStore = false) {
    // skipStore(读档 fromPacket 专用):调用方立即以转移 buffer 版 TileStore+explored
    // 注入——跳过默认分配免 15B/tile 丢弃式浪费(75-173MB);其余字段照常初始化
    if (!skipStore) {
      this.store = new TileStore(w, h);
      this.explored = new Uint8Array(w * h);
    }
    this.seed = seed;
    this.name = name;
    // 1 游戏日 = 30 现实分钟（24→40 后折中）
    this.clock = new Clock(24 * 60 * 1000); // 1:1 全周期 24min（昼 15/夜 9）
  }

  /** 从 worker 数据包重建（buffer 已 transfer 移交，零拷贝包装）。
   *  explored 未包含在包内（旧包）时按全零分配；读档路径包内即存档的 explored */
  static fromPacket(p: import('../workers/protocol').WorldPacket): World {
    // ★免丢弃分配(2026-08-13 读档优化):构造器先建完整默认 TileStore(15B/tile,
    // 75-173MB)随即被转移 buffer 版替换丢弃。skipStore 跳过默认分配,其余字段照常初始化
    const w = new World(p.w, p.h, p.seed, p.name, true);
    w.store = new TileStore(p.w, p.h, p.buf);
    w.explored = p.buf.explored ? new Uint8Array(p.buf.explored) : new Uint8Array(p.w * p.h);
    w.spawnX = p.spawnX; w.spawnY = p.spawnY;
    w.groundLevel = p.groundLevel; w.rockLevel = p.rockLevel; w.lavaLine = p.lavaLine;
    w.crimson = p.crimson; w.dungeonX = p.dungeonX; w.dungeonY = p.dungeonY; w.jungleX = p.jungleX;
    w.exploredVersion = p.exploredVersion;
    if (p.difficulty !== undefined) w.difficulty = p.difficulty;   // Main.GameMode（旧包缺省 0）
    w.clock.timeOfDay = p.clock.timeOfDay;
    w.clock.dayCount = p.clock.dayCount;
    if (p.clock.bloodMoon !== undefined) w.clock.bloodMoon = p.clock.bloodMoon;
    if (p.clock.eclipse !== undefined) w.clock.eclipse = p.clock.eclipse;
    if (p.clock.moonPhase !== undefined) w.clock.moonPhase = p.clock.moonPhase;
    if (p.seedFlags) w.seedFlags = { ...p.seedFlags };
    if (p.moonType !== undefined) w.moonType = p.moonType;
    if (p.invasion) { w.invasionType = p.invasion.type; w.invasionSize = p.invasion.size;
      w.invasionSizeStart = p.invasion.sizeStart; w.invasionX = p.invasion.x; w.invasionDelay = p.invasion.delay; }
    if (p.altarCount !== undefined) w.altarCount = p.altarCount;
    // 渔夫任务链（WF:2147-2161；旧包缺省=索引 0/空名单）
    if (p.angler) {
      w.anglerQuest = p.angler.quest ?? 0;
      w.anglerWhoFinishedToday = [...(p.angler.whoFinishedToday ?? [])];
    }
    // 困难矿锁定选种（WorldGen.SavedOreTiers；旧档缺省 -1/-1/-1 = 未砸过，首砸重 roll）
    if (p.savedOreTiers !== undefined) w.savedOreTiers = { ...p.savedOreTiers };
    if (p.shadowOrbCount !== undefined) w.shadowOrbCount = p.shadowOrbCount;
    // 日晷/月晷四件套（WorldFile.cs:1311/1342/1416-1417；旧包缺省=无快进无冷却）
    if (p.sundial !== undefined) {
      w.sundialCooldown = p.sundial;
      w.moondialCooldown = p.moondial ?? 0;
      w.fastForwardTimeToDawn = p.fastForwardTimeToDawn ?? false;
      w.fastForwardTimeToDusk = p.fastForwardTimeToDusk ?? false;
    }
    // 夜间小动物概率五件套（setFireFlyChance；旧包缺省=代表值，当晚 StartNight 重掷）
    if (p.critterChances !== undefined) {
      w.fireFlyChance = p.critterChances.fireFly;
      w.fireFlyFriendly = p.critterChances.fireFlyFriendly;
      w.fireFlyMultiple = p.critterChances.fireFlyMultiple;
      w.butterflyChance = p.critterChances.butterfly;
      w.stinkBugChance = p.critterChances.stinkBug;
    }
    // CultistRitual.delay（WF:114/163；旧包缺省 0 = 首次直接可掷 TrySpawning）
    if (p.cultistDelay !== undefined) w.cultistDelay = p.cultistDelay;
    if (p.weather) w.applyWeather(p.weather);
    if (p.bestiary) w.applyBestiary(p.bestiary);
    w.pendingTownNpcs = p.pendingTownNpcs;
    w.chests = p.chests;
    w.signs = p.signs;
    w.furnitureItems = p.furnitureItems ?? [];
    w.trees = p.trees;
    w.flags = p.flags;
    w.treeX = p.treeX; w.treeStyle = p.treeStyle; w.treeTops = p.treeTops;
    w.shimmerX = p.shimmerX ?? 0; w.shimmerY = p.shimmerY ?? 0;
    return w;
  }

  get w() { return this.store.w; }
  get h() { return this.store.h; }
  get tiles() { return this.store; }

  /** 破坏一个 tile（含 framed 物体的锚点处理由调用方负责），返回掉落 item key */
  breakTileAt(x: number, y: number): string | null {
    const t = this.store.get(x, y);
    if (t === 0) return null;
    const d = TILE_DEFS[t];
    this.store.setTile(x, y, 0);
    // v_ 图块无显式 drop → 回退同名放置物品(阶段5 自动注册)。
    // drop:null = 显式无掉落(原版装饰类)——?? 会把 null 也走兜底,必须显式判 undefined。
    // 数字 drop = 原版 item id(本地物品退役后统一),经 VI() 落到 vi_ 键
    if (typeof d.drop === 'number') return VI(d.drop);
    return d.drop === undefined ? (d.key.startsWith('v_') ? 'place_' + d.key : null) : d.drop;
  }

  isSolidPx(px: number, py: number): boolean {
    return this.store.isSolid(Math.floor(px / 16), Math.floor(py / 16));
  }

  /** 液体量（0-255）按像素坐标 */
  liquidAt(px: number, py: number): number {
    return this.store.liquid[this.store.idx(Math.floor(px / 16), Math.floor(py / 16))];
  }

  registerTree(x: number, y: number, h: number) {
    this.trees.push({ x, y, h });
  }
}

export { T };
