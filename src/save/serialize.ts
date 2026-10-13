// 存档序列化纯核心(无任何 DOM/World 依赖——save.worker.ts 直接引用,
// 主线程 SaveFile.ts 与存档 worker 共用同一份字节级实现,输出逐位一致)。
// 性能(2026-08 审计 #2):RLE 输出为密度增长 Uint8Array(varint 字节流)。
// 【v3 稳定 id 方案】磁盘 tile/item id 不再存数组下标:TILE_STABLE_OF_INTERNAL /
// ITEM_STABLE_OF_INTERNAL 内联映射(data/tiles.ts + data/items.ts 末段,根治顺序漂移)。

import { TILE_STABLE_OF_INTERNAL } from '../data/tiles';
import { ITEM_STABLE_OF_INTERNAL } from '../data/items';
import type { WeatherSave } from '../world/weather/Weather';
import type { FurnitureSaveEntry } from '../world/FurnitureItems';

class ByteWriter {
  buf = new Uint8Array(1 << 16);
  len = 0;
  private grow(need: number) {
    if (this.len + need <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < this.len + need) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }
  varint(v: number) {
    v = v < 0 ? 0 : v;
    this.grow(5);  // 32 位 varint 至多 5 字节
    while (v >= 0x80) {
      this.buf[this.len++] = (v & 0x7f) | 0x80;
      v >>>= 7;
    }
    this.buf[this.len++] = v;
  }
  bytes(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}

export function bytesToB64(u8: Uint8Array): string {
  // 分块拼接(8192)避免逐字符 += 的 ConsString 链;输出与逐字符版一致
  let s = '';
  const CH = 8192;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length)) as unknown as number[]);
  }
  return btoa(s);
}

// ---- 正式 RLE 格式 ----
// tiles 每条目: varint(run-1) varint(type) [varint(frameX) varint(frameY) 仅当 type!=0]
// walls/liquid: varint(run-1) varint(value)

export interface SaveData {
  format: 'sandboxworld.save';
  version: number;
  /** v3: tile/item 磁盘 id = 原版 sheet/item id + 私有段(见 data/tiles.ts 稳定表);v2=旧内部下标。
   *  ★全通道统一稳定域(2026-09-07):wld 导入(parseWldToSave)产物也在解析出口统一转
   *  稳定 id——SaveData 不存在第二个 id 域,读档/导出端无需任何判别 */
  idScheme?: 'sheet';
  header: {
    name: string; seed: number; width: number; height: number;
    spawn: [number, number]; spawn0?: [number, number]; groundLevel: number; rockLevel: number; lavaLine?: number;
    crimson?: boolean; dungeonX?: number; dungeonY?: number; jungleX?: number;
    treeX?: number[]; treeStyle?: number[]; treeTops?: number[];
    created: number; playTimeMs: number;
    wldVersion?: number;
    moonType?: number;   // 月亮贴图样式（原版 header WF:1252；旧档缺省 0 标准月）
    seedFlags?: Record<string, boolean>; // 彩蛋种子旗标（旧档缺省={}）
    /** ★SW-FX43：caveBackX[3]（WF:1266-1268 写/:2065-2067 读;原版 RandomizeCaveBackgrounds
     *  WorldGen.cs:8141-8210 独立掷,与 treeX 无派生关系）。导入=原值捕获、自建=worldgen
     *  掷值、旧档缺省 → WldHeaderFields 按 treeX 派生回退（FX33 登记债清偿） */
    caveBackX?: number[];
    /** ★SW-FX43：原版 worldId（WF:1244 写/:1977 读）。自建=genRand.Next(int.MaxValue)
     *  掷值（WorldGen.cs:11364——本仓 ⑫ 掷流位照掷曾弃值）、导入=原值;旧档缺省 →
     *  WldHeaderFields created-XOR 派生回退。footer 必须与 header 同值
     *  （LoadFooter :3003-3015 硬校验,BadFooter=整档拒载） */
    worldId?: number;
    /** ★IIIII20b：StarterNPC 换人一次性迁移标记——换人族旗标在身而存档还是
     *  换人支实装前生成的向导起始位时，首次以修复后客户端载入做顶替并打标。
     *  打标后该世界的后续合法入城（如派对女孩世界玩家补招的向导）不再被动。
     *  ★RB20b note③（2026-09-15）：SW 自创域，原版 WorldFile/WorldHeader 无对应物
     *  （原版无换人迁移语义）——本键仅存于仓内 kv 存档 JSON，不进 .wld 二进制 */
    starterSwapMigrated?: boolean;
    /** 世界难度 = Main.GameMode（Main.cs:2677：0 经典 1 专家 2 大师 3 旅程；
     *  原版随 WorldFileData 持久化；旧档缺省 0=经典） */
    difficulty?: number;
    /** 旅程时间倍率（CreativePowers.ModifyTimeRate.TargetTimeRate，CreativePowers.cs:866-884；
     *  IPersistentPerWorldContent 随世界存档；旧档缺省 1） */
    journeyTimeRate?: number;
    /** 旅程时间冻结（CreativePowers.FreezeTime，CreativePowers.cs:1448；旧档缺省 false） */
    journeyFreezeTime?: boolean;
    /** 旅程力量·世界侧（IPersistentPerWorldContent，CreativePowerManager.cs:125-137
     *  按注册序 bool+id 帧式落盘的 JSON 等价）：冻结雨/冻结风/停止感染蔓延/
     *  敌人难度滑杆原始 float；旧档缺省=全默认（滑杆 0 = 0.5×） */
    journeyPowers?: {
      freezeRain: boolean; freezeWind: boolean; stopBiomeSpread: boolean;
      difficultySlider: number;
    };
    /** 日晷冷却/快进到黎明（WorldFile.cs:1311/1342；旧档缺省 0/false） */
    sundialCooldown?: number; fastForwardTimeToDawn?: boolean;
    /** 月晷冷却/快进到黄昏（WorldFile.cs:1416-1417；旧档缺省 0/false） */
    moondialCooldown?: number; fastForwardTimeToDusk?: boolean;
    /** ★R16-5：背景样式 13 档（setBG 0-12；旧档缺省 undefined=seed 派生） */
    bgStyles?: BgStylesSave;
  };
  clock: {
    timeOfDay: number; dayCount: number;
    /** 原版 header _tempBloodMoon/_tempEclipse/_tempMoonPhase（WF:1276-1278,读写血月/日食/月相;
     *  旧档缺省=false/0/0——血月按夜重掷、月相回满月） */
    bloodMoon?: boolean; eclipse?: boolean; moonPhase?: number;
  };
  /** 入侵状态（原版 WorldFile.cs:1306-1339 五元组；旧档缺省=无入侵） */
  invasion?: { type: number; size: number; sizeStart: number; x: number; delay: number };
  /** 已砸祭坛数（WorldGen.altarCount，WorldFile.cs:1303/2100；旧档缺省 0） */
  altarCount?: number;
  /** 流星雨剩余计数（WorldGen.meteorShowerCount，WorldFile.cs:1069/:177；旧档缺省 0） */
  meteorShowerCount?: number;
  /** 夜间小动物概率五件套（NPC.setFireFlyChance，NPC.cs:94557-94610；每夜重掷，
   *  原版为 NPC 静态位不落盘——本仓按运行时审计台账要求随存档；旧档缺省=代表值） */
  critterChances?: {
    fireFly: number; fireFlyFriendly: number; fireFlyMultiple: number;
    butterfly: number; stinkBug: number;
  };
  /** CultistRitual.delay（CultistRitual.cs:32，WorldFile.cs:1340 写/:2192 读；
   *  旧档缺省 86400 = delayStart，v108 前原版旧档同值 WF:2188） */
  cultistDelay?: number;
  /** 旗击杀计数（BannerSystem.killCount;原版随世界档=WF:1347 Save/:2210 Load,BJ90 勘误
   *  [曾误锚 BannerSystem.cs:32=网络包写手区]——旧档缺省空） */
  bannerKills?: Record<number, number>;
  /** 天界四塔 NPC 原位（★SW-FX11 2026-09-10：NPC 段尾 SavesAndLoads 段,WF:1744-1755
   *  写/:2937-2955 读;集合=NPCID.Sets.SavesAndLoads NPCID.cs:4807 CreateBoolSet(422,
   *  507,517,493)。id=原版 netID,x/y=实体左上角像素浮点。旧档缺省=无（towerActive 旗
   *  在场时走兜底重生成）;导入原版 .wld 由 WldImport 透传原值） */
  pillarNpcs?: Array<{ id: number; x: number; y: number }>;
  /** 存档点按压中的压力板格坐标（★SW-FX11 2026-09-10：WF:3374-3386 Save/:3388-3398
   *  Load;原版读档首拍逐位 PokeLocation→Wiring.HitSwitch 一次性重触发后清空
   *  （PressurePlateHelper.cs:19-31/:156-164）——存档点恰站压力板时接线机关重载
   *  应响一次。旧档缺省=无） */
  pressurePlates?: Array<{ x: number; y: number }>;
  /** 渔夫任务链世界段（Main.anglerQuest + anglerWhoFinishedToday，WorldFile.cs:1329-1335/
   *  2147-2161；anglerQuestFinished 运行时态不存——读档 loadTempInfo 重置 WF:628-629） */
  angler?: { quest: number; whoFinishedToday: string[] };
  /** 困难矿世界锁定选种（WorldGen.SavedOreTiers，WF:1305-1307；旧档缺省 -1 = 未砸过） */
  savedOreTiers?: { cobalt: number; mythril: number; adamantite: number };
  oreTiersPH?: { copper: number; iron: number; silver: number; gold: number };
  /** 已砸暗影珠/猩红之心计数（WorldGen.shadowOrbCount，WF:1302/2099；旧档缺省 0） */
  shadowOrbCount?: number;
  tiles: string;   // base64 RLE
  /** ★幽灵保域（v5，2026-09-02）：active 位差分通道（base64 RLE，0/1 值域）。
   *  v[i] = (flags[i]&1) XOR (type[i]≠0)——1 = 活位布局与"type≠0 即激活"派生式
   *  不同：幽灵格（type≠0 未激活，原版 active(false) 残型）与幻影活性
   *  （type=0 带活位）落 1。缺段（≤v4 旧档）=读档端按派生式还原，语义与旧
   *  「写侧幽灵净化」完全一致（旧档本就无幽灵）。旧版构建读新档会忽略本键
   *  →幽灵按派生式激活成浮空块（前向不兼容已登记，同 v2 接受破损政策先例）。 */
  tileActive?: string;
  walls: string;
  liquid: string;
  liquidType: string;  // base64 RLE（0无 1水 2岩浆 3蜂蜜 4微光）
  wire?: string;       // base64 RLE 电路位（bit0-3 四色线 bit4 致动器 bit5 已致动；旧档缺此字段=全 0）
  blocks?: string;     // base64 RLE 半砖/坡面（0=整砖 1=半砖 2-5=slope1-4;旧档缺=全整砖）
  /** 方块油漆（0-31，原版 Tile.cs:609-617 sTileHeader&0x1F；WF:1474-1479 存档位）。
   *  base64 RLE 独立通道（同 wire/blocks 模式——旧档缺字段=全 0 无漆） */
  paint?: string;
  /** 背景墙油漆（原版 Tile.cs:365-373 bTileHeader&0x1F；WF:1486-1491 存档位） */
  paintWall?: string;
  /** 涂层四位（原版 WF:1539-1552 存档位：bit1(2)=invisibleBlock bit2(4)=invisibleWall
   *  bit3(8)=fullbrightBlock bit4(16)=fullbrightWall——原版打包进 header4 字节，
   *  本仓独立 RLE 通道同构；旧档缺字段=全 0 无涂层） */
  coat?: string;
  /** 战争迷雾 0/1 位图（World.explored；原版 .twld MapHelper 段的等价物）。
   *  base64 RLE 同构通道——0/1 游程压到几个字节；旧档缺段 = 全 0 未探索（旧行为，不迁移） */
  explored?: string;
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean; name?: string }>;
  /** ★TE 梯队:mod tile entity 实例段(上方 ModTESaveEntry) */
  teMods?: ModTESaveEntry[];
  player: {
    hp: number; x: number; y: number;
    inventory: Array<SavedItem | null>;
    selected: number;
    baseMaxHp?: number;   // 生命上限（水晶之心/生命果扩容；旧档缺省 100）
    baseMaxMana?: number; // 魔力上限（魔力水晶扩容；旧档缺省 20）
    mana?: number;        // 当前魔力
    banks?: Array<Array<SavedItem | null>>; // 玩家储物×4（29/97/463/491；旧档缺省全空）
    /** armor[20]（0-2 盔甲/3-9 配饰/10-12 时装盔甲/13-19 时装配饰）——旧档缺省经 migrateLegacy 从旧 54 槽布局迁出 */
    armor?: Array<SavedItem | null>;
    dye?: Array<SavedItem | null>;
    trash?: SavedItem | null; // 垃圾桶持久槽（Player.trashItem；死亡清空）
    /** miscEquips[5]（宠物/光源/矿车/坐骑/钩爪）与 miscDyes[5]（Player.cs:1376-1379） */
    miscEquips?: Array<SavedItem | null>;
    miscDyes?: Array<SavedItem | null>;
    /** 三套 Loadout（EquipmentLoadout：armor[20]+dye[10]；当前套序号） */
    loadouts?: Array<{ armor: Array<SavedItem | null>; dye: Array<SavedItem | null>; hide?: boolean[] }>;
    currentLoadout?: number;
    /** Buff 槽（原版 buffType+buffTime 44 槽,PL:53913-53925;[vanillaBuffId, 剩余秒],
     *  Main.buffNoSave 已过滤——旧档缺省=无 buff） */
    buffs?: Array<[number, number]>;
    /** 税务员累积税款（Player.taxMoney 铜币,PL:53839;旧档缺省 0） */
    taxMoney?: number;
    /** 高尔夫累计分（Player.golferScoreAccumulated :1792;旧档缺省 0） */
    golferScoreAccumulated?: number;
    /** 渔夫任务完成数（Player.anglerQuestsFinished :1790;旧档缺省 0——奖励阶梯据此） */
    anglerQuestsFinished?: number;
    /** 信息显示开关(Player.hideInfo[13] :776;按下标=图标序;旧档缺省全 false) */
    hideInfo?: boolean[];
    /** 配饰格可见性开关(Player.hideVisibleAccessory[10] :1590;下标=装备槽序 3-9 有效,
     *  Main.cs:40855-40880 眼睛图标翻转;原版按位打包 :53813-53819,本仓布尔数组直存;
     *  旧档缺省全 false=全可见) */
    hideVisibleAccessory?: boolean[];
    /** PVE 死亡计数（Player.numberOfDeathsPVE,PL:53840;旧档缺省 0） */
    deathsPve?: number;
    /** ★R16-14：PvP 死亡计数/队伍/死亡态+重生计时（PL:55444/55411/55558-55562;
     *  旧档缺省 0/0/false/0——与原版缺省同形） */
    deathsPvp?: number;
    team?: number;
    dead?: boolean;
    respawnTimer?: number;
    /** 发色剂染料 shaderId 1..12（Player.hairDye byte,PL:53805-53808 写/:54214-54216
     *  读；0=无。旧档缺省 0=无染料） */
    hairDye?: number;
    /** 热键栏锁定（SW-FX10；Player.hbLocked,PL:55543 写/:56268 读。旧档缺省 false=未锁） */
    hbLocked?: boolean;
    /** 超级矿车开关（SW-FX10；Player.enabledSuperCart,PL:55572 位[1] 写/:56368 位[1] 读。
     *  旧档缺省 true=原版 Player.cs:2037 缺省同形） */
    enabledSuperCart?: boolean;
    /** 建筑配件开关位（★SW-FX19；Player.builderAccStatus[12],PL:55553-55555 写/
     *  :56306-56325 读。旧档缺省=ResetData 形 [0]=1 余 0（Player.cs:56749）） */
    builderAccStatus?: number[];
    /** 火把神恩宠解锁旗（★SW-FX38b；Player.unlockedBiomeTorches,PL:55430 写/
     *  :55895 读 .plr≥229 单字节 bool）。原版是【角色字段】随身跨世界;本仓在-session
     *  权威落 world.flags.unlockedBiomeTorches（buildSave 快照时回填本字段,
     *  mainFlow.applyPlayer 读档单调回灌 world.flags——只置 true 不回退）。旧档
     *  缺省 undefined=false（原版新角缺省同形） */
    unlockedBiomeTorches?: boolean;
    /** 匠师面包吃旗（★BJ285-②;Player.ateArtisanBread,PL:55433 写/:55899 读 .plr≥256
     *  单字节 bool）。原版角色字段随身跨世界;本仓在-session 权威落
     *  world.flags.ateArtisanBread（buildSave 快照回填,mainFlow.applyPlayer 单调回灌）。
     *  消费面 = Game 用途支（旗置位后再用整支惰性）+ 旅商股票门（Chest.cs:2953）。
     *  旧档缺省 undefined=false */
    ateArtisanBread?: boolean;
    /** 永久升级族(Player.cs:44575-44802;旧档缺省全 false) */
    permanentUpgrades?: {
      extraAccessory?: boolean;
      usedAegisCrystal?: boolean;
      usedAegisFruit?: boolean;
      usedArcaneCrystal?: boolean;
      usedGalaxyPearl?: boolean;
      usedGummyWorm?: boolean;
      usedAmbrosia?: boolean;
    };
    /** 旅程力量·玩家侧（IPersistentPerPlayerContent，CreativePowerManager.cs:183-195
     *  SaveToPlayer 的 JSON 等价）：上帝模式/扩大放置范围（默认开）/刷怪率滑杆；
     *  旧档缺省 = godmode false / farPlacement true / slider 0.5 */
    journeyPowers?: {
      godmode: boolean;
      farPlacementRange: boolean;
      spawnRateSlider: number;
    };
  };
  /** homelessDespawn = 原版 NPC.homelessDespawn（SpawnHomelessNPC 生成位 :5110 专设、
   *  WorldFile.cs:1741 写/:2932 读 v315+ 随城镇 NPC 段持久化）——夜间清场扫
   *  UnspawnHomelessNPC（WorldGen.cs:5127-5155）的标的位。旧档缺省 undefined=false。
   *  kickedOut = ★BJ259 repo 侧标（被玩家踢出,① 轮再安置臂豁免面跨档;原版无对应
   *  字段——.wld 导出不落,边界登记）。旧档缺省 undefined=false */
  npcs: Array<{ key: string; x: number; y: number; home: [number, number] | null; bound?: boolean; givenName?: string; shimmered?: boolean; homelessDespawn?: boolean; kickedOut?: boolean }>;
  signs?: Array<{ x: number; y: number; text: string }>; // 墓碑碑文（旧档缺省无）
  /** 世界事件态（原版 header 内 party/灯笼夜段,WF:1361-1368/1381-1384;旧档缺省=无派对无预约） */
  events?: {
    partyManual: boolean;            // BirthdayParty.ManualParty
    partyGenuine?: boolean;          // ★IIIIIII6：BirthdayParty.GenuineParty（旧档缺省=按 seedFlags 重算）
    partyCooldown?: number;         // BirthdayParty.PartyDaysOnCooldown（旧档缺省 0）
    /** ★SW-FX33（2026-09-11）：TempPartyCelebratingNPCs 名单（WF:1370-1374 写/
     *  :2273-2276 读;WorldFile.cs:168 Load 尾回灌 BirthdayParty.CelebratingNPCs）。
     *  值域=原版 NPC netId（存档侧 Game.eventsForSave key→netId;导入侧 WldParser 原值
     *  透传——两路同域）。旧档缺省=无（.wld 导出按空名单落） */
    partyCelebratingNpcs?: number[];
    lanternManual: boolean;          // 服务端手动灯笼（本仓无入口,位保留）
    lanternGenuine: boolean;         // 真灯笼夜兑现中
    lanternNext: boolean;            // 次夜灯笼夜预约
    lanternCooldown: number;         // 冷却夜数
  };
  /** 挂物族存放物（物品框 395/武器架 471/模特 470/帽架 475/食物盘 520/展示罐 698/
   *  风筝锚桩 723/小动物锚桩 724；原版 TileEntity 段的最小等价，旧档缺省无） */
  furniture?: FurnitureSaveEntry[];
  /** ★SW-FX35（2026-09-11）：原版 TileEntity 段中本仓不建模的三类透传快照
   *  （0 训练假人/2 逻辑传感器/7 晶塔；9/10 锚桩有运行时面走 furniture 段）——
   *  导入原版档收位存底，导出回写零漂移（WF:3317-3327 Save 段）。npc=假人 NPC id
   *  short（-1=空）；logicCheck=TELogicSensor.LogicCheckType 0-7；on=传感器输出态。
   *  自建世界缺省=无 */
  teSnap?: Array<{ type: 0 | 2 | 7; x: number; y: number; npc?: number; logicCheck?: number; on?: boolean }>;
  /** ★SW-FX35：城镇房间预留表（TownRoomManager.Save,WF:3400-3402→TownRoomManager.cs:94-106
   *  i32 n+n×(i32 npcType,i32 x,i32 y)；原版语义=TownManager._roomLocationPairs,homeless
   *  期间房间仍占位）。npc=原版 NPC netId 域。旧档缺省=无（.wld 导出按空表落） */
  townRooms?: Array<{ npc: number; x: number; y: number }>;
  flags: Record<string, boolean>;
  weather?: WeatherSave; // 天气快照（雨/风/云/沙尘暴；旧档缺省=晴）
  /** 图鉴统计（BestiaryUnlocksTracker——原版随世界文件持久化 WorldFile.cs:3399/3405；
   *  旧档缺省=空三桶） */
  bestiary?: import('../data/Bestiary').BestiarySave;
  /** ★原版 .wld header 快照(v6,2026-09-06):导入原版档时 SaveWorldFlags 全字段
   *  原值(键=WldHeaderFields 台账 name,含本仓暂不建模的字段)——导出回写零漂移;
   *  自建世界缺省=无(走台账映射/缺省)。WldHeaderFields.fieldValue 快照优先 */
  wldSnap?: Record<string, number | boolean | string>;
  /** ★mod 清单（2026-10-04 P1,与 SaveMeta.mods 同构;serializeSave 从 meta 携行）。
   *  旧档缺省 undefined=零迁移;读档缺失检测在 loadSaveData(mods/bridge 供数)。
   *  ★P5:itemIds/tileIds 随档(id 平移完整解,见 SaveMeta.mods 注) */
  mods?: Array<{ id: string; version: string; items: number; tiles: number; npcs: number;
    itemIds?: Array<[string, number]>; tileIds?: Array<[string, number]>;
    /** ★D16(2026-10-13):墙域 P5 平移随档(墙 id=internal=stable;读档 wallRemap) */
    wallIds?: Array<[string, number]> }>;
}

/** ★TE 梯队(2026-10-14):mod tile entity 存档段——k=te 全键(mod_<modId>_<key>),
 *  d=mod 自序列化 state(JSON-able;sw.tileEntity save 钩/缺省 state 直存)。
 *  旧档无键=零迁移;读档 restoreModTileEntities(mods/tileEntities) 回填实例。 */
export interface ModTESaveEntry { k: string; x: number; y: number; d?: Record<string, unknown> }

/** 存档物品实例（Inventory.InvItem 的可序列化形——favorited/prefix 为实例态可选字段） */
export interface SavedItem {
  id: number; stack: number;
  favorited?: boolean;
  prefix?: number; // 重铸词缀（Item.prefix；0/缺省=无）
}

/** 序列化所需的 tilestore 视图(worker 路径=副本包装;主线程=活存储) */
export interface SaveStoreView {
  type: Uint16Array; flags: Uint8Array;
  frameX: Uint16Array; frameY: Uint16Array;
  wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; wire: Uint8Array;
  half: Uint8Array; slope: Uint8Array;
  /** 油漆双通道（0-31；原版 Tile.color()/wallColor() 5bit 域） */
  paint: Uint8Array; paintWall: Uint8Array;
  /** 涂层四位（WF:1539-1552 位编码；缺省=不写该段） */
  coat?: Uint8Array;
  /** 战争迷雾 0/1 位图（World.explored，与 store 同长；缺省=不写该段=旧行为全 0） */
  explored?: Uint8Array;
}
/** 序列化所需的世界元数据(全部可结构化克隆) */
/** ★R16-5：背景样式 13 档存档投影（原版 Main.bgStyle/caveBackStyle[4]/bg8-12；
 *  WorldGen.setBG 写 WorldGen 结构、随 .wld 头落盘——本仓独立字段随存档） */
export interface BgStylesSave {
  cave: number[];            // setBG(0-3) caveBackStyle[4]
  ice: number; jungle: number; hell: number;   // setBG(4-6)
  mushroom: number;          // setBG(8)（v>194）
  underworld: number;        // setBG(9)（v>=215）
  bg10: number; bg11: number; bg12: number;    // setBG(10-12)（v>195）
  /** ★2026-09-03：header bg 字节组全量（WF:1325-1331）——forest=四区森林背景样式
   *  （treeBG1-4）、desert=沙漠背景样式（setBG(6) 样式4=248/249/250）、ocean=海洋
   *  单层贴图变体（setBG(7) 0-7）、corrupt/snow/hallow/crimson=侵染背景样式档。
   *  仅 .wld 导入档携带；本仓自建世界缺省 → BiomeBackground.seedFor 走 seed 派生 */
  forest?: number[]; desert?: number; ocean?: number;
  corrupt?: number; snow?: number; hallow?: number; crimson?: number;
  /** ★SW-FX43：地表丛林背景样式（WF:1327 setBG(2) 0-6）——与 BG.jungle（WF:1274
   *  jungleBackStyle 地下丛林）不同族,键名按原版全名。仅 .wld 导入档携带;
   *  自建世界缺省 → WldHeaderFields 落 0（原登记偏差「无键写 0」本刀补键清偿） */
  jungleBG?: number;
}

export interface SaveMeta {
  name: string; seed: number; w: number; h: number;
  spawnX: number; spawnY: number; spawnX0?: number; spawnY0?: number; groundLevel: number; rockLevel: number; lavaLine?: number;
  treeX?: number[]; treeStyle?: number[]; treeTops?: number[];
  crimson?: boolean; dungeonX?: number; dungeonY?: number; jungleX?: number;
  timeOfDay: number; dayCount: number;
  bloodMoon?: boolean; eclipse?: boolean; moonPhase?: number; moonType?: number;
  seedFlags?: Record<string, boolean>;
  /** ★mod 清单（2026-10-04 P1）：保存时启用的 mod（name/version/内容计数）。
   *  三处 meta 装配（SaveFile saveGame/buildSaveParts + SaveClient doSave）经
   *  mods/bridge 供数——缺一处=worker/主线程路径落盘无键（BJ71 同族防漏喂）。
   *  旧档缺省 undefined=键不落零迁移；读档缺失检测见 loadSaveData。
   *  ★P5：itemIds/tileIds=存档期分配映射（id 平移完整解——读档构建
   *  savedStable→currentStable 重映射） */
  mods?: Array<{ id: string; version: string; items: number; tiles: number; npcs: number;
    itemIds?: Array<[string, number]>; tileIds?: Array<[string, number]>;
    /** ★D16(2026-10-13):墙域 P5 平移随档(墙 id=internal=stable;读档 wallRemap) */
    wallIds?: Array<[string, number]> }>;
  /** ★TE 梯队(2026-10-14):mod tile entity 实例段(SaveFile/SaveClient 装配经
   *  mods/tileEntities serializeModTEs 供数;与 mods 同族防漏喂纪律) */
  teMods?: ModTESaveEntry[];
  /** ★IIIII20b：StarterNPC 换人一次性迁移标记（见 SaveData.header 同名注释） */
  starterSwapMigrated?: boolean;
  /** 世界难度 = Main.GameMode（Main.cs:2677；旧档缺省 0=经典） */
  difficulty?: number;
  /** 旅程时间倍率/冻结（CreativePowers.cs:866/:1448；旧档缺省 1/false） */
  journeyTimeRate?: number;
  journeyFreezeTime?: boolean;
  /** 旅程力量·世界侧（SaveData.header.journeyPowers 同形；缺省=全默认） */
  journeyPowers?: SaveData['header']['journeyPowers'];
  /** 日晷/月晷快进四件套（WorldFile.cs:1311/1342/1416-1417；旧档缺省 0/0/false/false） */
  sundialCooldown?: number; moondialCooldown?: number;
  fastForwardTimeToDawn?: boolean; fastForwardTimeToDusk?: boolean;
  /** ★R16-5：背景样式落盘值（WF57 setBG 0-12 的存档投影；旧档缺省=undefined →
   *  BiomeBackground 按 seed 重派生。导入原版 .wld 时由 WldImport 回填） */
  bgStyles?: BgStylesSave;
  chests: SaveData['chests']; signs?: SaveData['signs']; furniture?: FurnitureSaveEntry[]; flags: Record<string, boolean>;
  weather?: WeatherSave;
  invasion?: { type: number; size: number; sizeStart: number; x: number; delay: number };
  /** 已砸祭坛数（WorldGen.altarCount，WorldFile.cs:1303/2100；旧档缺省 0） */
  altarCount?: number;
  /** 流星雨剩余计数（WorldGen.meteorShowerCount，WorldFile.cs:1069/:177；旧档缺省 0） */
  meteorShowerCount?: number;
  /** 夜间小动物概率五件套（setFireFlyChance；SaveData.critterChances 同形） */
  critterChances?: {
    fireFly: number; fireFlyFriendly: number; fireFlyMultiple: number;
    butterfly: number; stinkBug: number;
  };
  /** CultistRitual.delay（WF:1340/:2192；缺省 86400 = delayStart） */
  cultistDelay?: number;
  /** 旗击杀计数（BannerSystem.killCount;旧档缺省空） */
  bannerKills?: Record<number, number>;
  /** 渔夫任务链世界段（SaveData.angler 同形；旧档缺省=索引 0/空名单） */
  angler?: { quest: number; whoFinishedToday: string[] };
  /** 困难矿世界锁定选种（WorldGen.SavedOreTiers，WF:1305-1307；旧档缺省 -1 = 未砸过） */
  savedOreTiers?: { cobalt: number; mythril: number; adamantite: number };
  oreTiersPH?: { copper: number; iron: number; silver: number; gold: number };
  /** 已砸暗影珠/猩红之心计数（WorldGen.shadowOrbCount，WF:1302/2099；旧档缺省 0） */
  shadowOrbCount?: number;
  /** 图鉴三桶（杀数/遇数/聊天）——data/Bestiary.ts BestiarySave */
  bestiary?: import('../data/Bestiary').BestiarySave;
  /** ★SW-FX43：原版 worldId（SaveData.header.worldId 同名注;World.worldId→此处随档） */
  worldId?: number;
  /** ★SW-FX43：caveBackX[3]（SaveData.header.caveBackX 同名注;World.caveBackX→随档） */
  caveBackX?: number[];
  /** ★SW-FX43：wldSnap 原版 header 差量快照（全仓生产点=WldImport wldSnap 组装,
   *  消费=exportWld writeHeader 快照优先回写;键集/裁断注记见彼处） */
  wldSnap?: SaveData['wldSnap'];
  /** ★SW-FX43：TE 三类透传快照（0 假人/2 传感器/7 晶塔）随存档链携行——
   *  FX35 剩债清偿:此前仅存 SaveData 层,repo 存档链（serializeSave→loadSaveData）
   *  不携行 →「导入→游玩→存 repo 档→再导出」快照丢失 */
  teSnap?: SaveData['teSnap'];
  /** ★SW-FX43：城镇房间预留表随存档链携行（FX35 剩债同上） */
  townRooms?: SaveData['townRooms'];
}

export function rlePairs(values: ArrayLike<number>): Uint8Array {
  const out = new ByteWriter();
  const n = values.length;
  let i = 0;
  while (i < n) {
    const v = values[i];
    let run = 1;
    while (i + run < n && values[i + run] === v && run < 0x7fffffff) run++;
    out.varint(run - 1);
    out.varint(v);
    i += run;
  }
  return out.bytes();
}

/** RLE tiles。stableMap 非空时逐元素映射为稳定 id(v3 存档路径) */
export function rleTiles(st: { type: Uint16Array; frameX: Uint16Array; frameY: Uint16Array }, stableMap?: Uint16Array): Uint8Array {
  const out = new ByteWriter();
  const n = st.type.length;
  let i = 0;
  while (i < n) {
    const raw = st.type[i];
    // ★P4 红蓝修正(C2 写侧对称):未映射 internal id(mod 缺桥/整批拒载会话)→
    //   stable 0=空气且不写 fx/fy——旧实现 t=undefined 时 varint 落 0 但 `t!==0`
    //   仍写 fx/fy,与读侧(tRaw=0 跳帧)失步=全图错位
    const t = stableMap ? (raw === 0 ? 0 : stableMap[raw] ?? 0) : raw;
    const fx = st.frameX[i], fy = st.frameY[i];
    let run = 1;
    // 游程比较必须 raw 对 raw（t 是映射后的稳定 id，与原始 id 比较恒不等 →
    // 自定义 tile（stable≠internal）游程全断，4200x1200 规则地形 17B 膨胀到 21MB）
    while (i + run < n && st.type[i + run] === raw && st.frameX[i + run] === fx && st.frameY[i + run] === fy) run++;
    out.varint(run - 1);
    out.varint(t);
    if (t !== 0) {
      out.varint(fx);
      out.varint(fy);
    }
    i += run;
  }
  return out.bytes();
}

/** ★幽灵保域（v5）：active 位差分通道编码。逐格 v = (flags&1) XOR (type≠0)，
 *  RLE 游程压缩；全零（无幽灵/无幻影，即旧净化语义世界）返回 null=不落段。
 *  幽灵格成片（洞穴雕刻带）→ 游程数远小于格数，典型世界几十 KB 量级。 */
export function rleTileActiveDiff(st: Pick<SaveStoreView, 'type' | 'flags'>): Uint8Array | null {
  const out = new ByteWriter();
  const n = st.type.length;
  let any = false;
  let i = 0;
  while (i < n) {
    const v = (st.flags[i] & 1) ^ (st.type[i] !== 0 ? 1 : 0);
    if (v !== 0) any = true;
    let run = 1;
    while (i + run < n
      && ((st.flags[i + run] & 1) ^ (st.type[i + run] !== 0 ? 1 : 0)) === v
      && run < 0x7fffffff) run++;
    out.varint(run - 1);
    out.varint(v);
    i += run;
  }
  return any ? out.bytes() : null;
}

/** 存档序列化主体。★幽灵保域（2026-09-02）：曾在此对视图就地做幽灵净化
 *  （!flags && type≠0 → type=0）——已删除：v5 起 tileActive 差分通道承载 active
 *  位，幽灵格（act=0,type≠0）原样落档（对齐原版 .wld inactive 位随档）。
 *  本函数现在【零就地写】，主线程活存储与 worker 副本路径字节一致。 */
/** ★BJ620 件6-F9：装配/串行拆分——assembleSave 返回内存 SaveData（worker 据此回传
 *  data.player=与 json.player 全等的稳定 id 磁盘形,主线程 charStore.setState 免整档
 *  JSON.parse）;serializeSave 保持旧签名=stringify 薄壳（存量消费方零改动）。 */
export function assembleSave(
  st: SaveStoreView, meta: SaveMeta,
  player: SaveData['player'], playTimeMs: number,
  townNpcs?: SaveData['npcs'],
  events?: SaveData['events'],
  // ★SW-FX11（2026-09-10）：天界四塔 NPC 段 + 按压压力板段（实体侧快照,与 townNpcs
  //  同通道——SaveMeta 由 World 组装,此二者来自 Game 实体扫描故走参数位）
  pillarNpcs?: SaveData['pillarNpcs'],
  pressurePlates?: SaveData['pressurePlates'],
): SaveData {
  // 物品 id → 稳定 id(全槽位统一;量小直接遍历)。保留 favorited/prefix。
  // v4 起 armor/dye/trash/miscEquips/miscDyes/loadouts 也走稳定 id(v3 曾裸透传内部
  // 下标——注册表一变即错位;本地物品退役时顺手根治)
  const mapItem = (it: { id: number; stack: number; favorited?: boolean; prefix?: number; placeStyle?: number } | null) =>
    it
      ? {
        // ★方案 A（BJ264）：`it.id === 0 ? 0` 特判撤除——重排后 internal 0=原版 netID 0
        //   语义（0 号位=空洞无 def），恒等表落盘即「写新序」：魔力水晶=internal 109
        //   → 磁盘 109（旧特判曾把旧 0 号位水晶写成磁盘 0）。旧档磁盘 0 由 SaveFile
        //   读档边界迁移回水晶（MANA_CRYSTAL_IID）。
        id: ITEM_STABLE_OF_INTERNAL[it.id] ?? 0,
        stack: it.stack,
        favorited: it.favorited || undefined,
        prefix: it.prefix || undefined,
        placeStyle: it.placeStyle ?? undefined,
      }
      : null;
  // ★幽灵保域（v5）：active 位差分（无幽灵世界=null → 不落段，读档端派生式还原）
  const tileActDiff = rleTileActiveDiff(st);
  const data: SaveData = {
    format: 'sandboxworld.save',
    version: 5,
    header: {
      name: meta.name, seed: meta.seed, width: meta.w, height: meta.h,
      spawn: [meta.spawnX, meta.spawnY], groundLevel: meta.groundLevel, rockLevel: meta.rockLevel,
      spawn0: meta.spawnX0 !== undefined ? [meta.spawnX0, meta.spawnY0 ?? meta.spawnY] : undefined,
      lavaLine: meta.lavaLine,
      treeX: meta.treeX, treeStyle: meta.treeStyle, treeTops: meta.treeTops,
      crimson: meta.crimson, dungeonX: meta.dungeonX, dungeonY: meta.dungeonY, jungleX: meta.jungleX,
      created: Date.now(), playTimeMs,
      moonType: meta.moonType ?? 0,
      // ★SW-FX43：caveBackX/worldId 随档（undefined 键由 JSON.stringify 丢弃=
      //  旧档零迁移;消费端 WldHeaderFields 缺省回退派生）
      caveBackX: meta.caveBackX,
      worldId: meta.worldId,
      seedFlags: meta.seedFlags,
      // ★IIIII20b（★BJ90 2026-09-15 激活,BJ71 登记①）：换人一次性迁移标落盘——本键此前
      //  仅类型声明（:79/:335）无写位,Game.ts IIIII20b 迁移标每次读档恒假（合法补招向导
      //  可被重复顶替）。undefined 键由 JSON.stringify 丢弃=旧档零迁移语义不变
      starterSwapMigrated: meta.starterSwapMigrated,
      difficulty: meta.difficulty ?? 0,   // Main.GameMode（旧档缺省=经典）
      journeyTimeRate: meta.journeyTimeRate ?? 1,
      journeyFreezeTime: meta.journeyFreezeTime ?? false,
      journeyPowers: meta.journeyPowers,
      sundialCooldown: meta.sundialCooldown ?? 0,
      moondialCooldown: meta.moondialCooldown ?? 0,
      bgStyles: meta.bgStyles,
      fastForwardTimeToDawn: meta.fastForwardTimeToDawn ?? false,
      fastForwardTimeToDusk: meta.fastForwardTimeToDusk ?? false,
    },
    clock: {
      timeOfDay: meta.timeOfDay, dayCount: meta.dayCount,
      bloodMoon: meta.bloodMoon ?? false, eclipse: meta.eclipse ?? false,
      moonPhase: meta.moonPhase ?? 0,
    },
    invasion: meta.invasion ?? { type: 0, size: 0, sizeStart: 0, x: 0, delay: 0 },
    altarCount: meta.altarCount ?? 0,
    meteorShowerCount: meta.meteorShowerCount ?? 0,
    critterChances: meta.critterChances ?? { fireFly: 30, fireFlyFriendly: 5, fireFlyMultiple: 15, butterfly: 10, stinkBug: 999999 },
    cultistDelay: meta.cultistDelay ?? 86400,   // 缺省 = delayStart（新世界 WF:1018 / v108 前旧档 WF:2188）
    angler: meta.angler ?? { quest: 0, whoFinishedToday: [] },   // WF:1329-1335（旧档缺省）
    savedOreTiers: meta.savedOreTiers ?? { cobalt: -1, mythril: -1, adamantite: -1 },
    oreTiersPH: meta.oreTiersPH ?? { copper: 7, iron: 6, silver: 9, gold: 8 },
    shadowOrbCount: meta.shadowOrbCount ?? 0,
    tiles: bytesToB64(rleTiles(st, TILE_STABLE_OF_INTERNAL)),
    // ★幽灵保域（v5）：active 位差分通道（缺段=读档端按 type≠0 派生，同 v4 语义）
    tileActive: tileActDiff ? bytesToB64(tileActDiff) : undefined,
    walls: bytesToB64(rlePairs(st.wall)),
    liquid: bytesToB64(rlePairs(st.liquid)),
    liquidType: bytesToB64(rlePairs(st.liquidType)),
    wire: bytesToB64(rlePairs(st.wire)),
    blocks: bytesToB64(rlePairs(combineBlocks(st.half, st.slope))),
    // 油漆双通道（原版 WF:1474-1491 独立字节位；本仓独立 RLE 通道，旧档缺=全 0）
    paint: bytesToB64(rlePairs(st.paint)),
    paintWall: bytesToB64(rlePairs(st.paintWall)),
    // 涂层四位（WF:1539-1552；undefined 不落段 → 旧读档端无害忽略）
    coat: st.coat ? bytesToB64(rlePairs(st.coat)) : undefined,
    // 战争迷雾（0/1 位图 RLE：全 0/全 1 各 1 游程 = ~7 字节；undefined 不落段 →
    // JSON.stringify 丢弃该键，旧读档端无害忽略）
    explored: st.explored ? bytesToB64(rlePairs(st.explored)) : undefined,
    chests: meta.chests.map((c) => ({ x: c.x, y: c.y, locked: c.locked || undefined, name: c.name || undefined, items: c.items.map(mapItem) })),
    // v4:armor/dye/trash/miscEquips/miscDyes/loadouts 逐槽稳定 id(v3 是裸内部下标)
    player: {
      ...player,
      inventory: player.inventory.map(mapItem),
      banks: player.banks?.map((b) => b.map(mapItem)),
      armor: player.armor?.map(mapItem),
      dye: player.dye?.map(mapItem),
      trash: mapItem(player.trash ?? null),
      miscEquips: player.miscEquips?.map(mapItem),
      miscDyes: player.miscDyes?.map(mapItem),
      loadouts: player.loadouts?.map((l) => ({
        armor: l.armor.map(mapItem),
        dye: l.dye.map(mapItem),
        hide: l.hide ? [...l.hide] : undefined,   // R4-12：配饰可见性随套（旧档缺省）
      })),
    },
    npcs: townNpcs ?? [],   // 城镇 NPC 段(WorldFile.cs:1703-1750 NPC 段;曾硬编码 [] 断链)
    // ★SW-FX11（2026-09-10）：NPC 段尾 SavesAndLoads 四塔位 + 按压压力板位（缺省=不落键,
    //  旧读档端/旧档零迁移）
    pillarNpcs: pillarNpcs?.length ? pillarNpcs : undefined,
    pressurePlates: pressurePlates?.length ? pressurePlates : undefined,
    signs: meta.signs,
    // 挂物族：存放物 id 走与 chests 相同的稳定 id 映射（mapItem 同构，保留 prefix）；
    // ★SW-BO1（SW-BL1 P1）：模特姿态 pose 可选字段透传（undefined 旧档自动兼容）
    furniture: meta.furniture?.map((e) => ({
      x: e.x, y: e.y, kind: e.kind,
      slots: e.slots.map((s) => (s ? { id: ITEM_STABLE_OF_INTERNAL[s.id] ?? 0, stack: s.stack, prefix: s.prefix } : null)),
      pose: e.pose,
    })),
    flags: meta.flags,
    weather: meta.weather,
    events,
    bestiary: meta.bestiary,
    bannerKills: meta.bannerKills,
    // ★SW-FX43：wld-compat 三通道随存档链携行（生产=WldImport wldSnap/teSnap/
    //  townRooms → loadSaveData 回填 World → SaveMeta → 此处落 JSON → exportWld
    //  消费。空值不落键=JSON.stringify 丢弃,旧档/自建世界零迁移）
    wldSnap: meta.wldSnap && Object.keys(meta.wldSnap).length ? meta.wldSnap : undefined,
    // ★mod 清单（2026-10-04 P1）：空=null 不落键（JSON.stringify 丢弃,零 mod 零迁移）
    mods: meta.mods?.length ? meta.mods : undefined,
    teMods: meta.teMods?.length ? meta.teMods : undefined,   // ★TE 梯队
    teSnap: meta.teSnap?.length ? meta.teSnap : undefined,
    townRooms: meta.townRooms?.length ? meta.townRooms : undefined,
    idScheme: 'sheet',
  };
  return data;
}

/** 串行薄壳（旧签名不变）——装配见 assembleSave。 */
export function serializeSave(
  st: SaveStoreView, meta: SaveMeta,
  player: SaveData['player'], playTimeMs: number,
  townNpcs?: SaveData['npcs'],
  events?: SaveData['events'],
  pillarNpcs?: SaveData['pillarNpcs'],
  pressurePlates?: SaveData['pressurePlates'],
): string {
  return JSON.stringify(assembleSave(st, meta, player, playTimeMs, townNpcs, events, pillarNpcs, pressurePlates));
}

/** half + slope → 单字节 blockType(原版 Tile.blockType: 0=整砖 1=半砖 2-5=slope1-4) */
function combineBlocks(half: Uint8Array, slope: Uint8Array): Uint8Array {
  const out = new Uint8Array(half.length);
  for (let i = 0; i < half.length; i++) {
    out[i] = half[i] ? 1 : (slope[i] >= 1 && slope[i] <= 4 ? slope[i] + 1 : 0);
  }
  return out;
}
