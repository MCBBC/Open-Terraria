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
  /** v3: tile/item 磁盘 id = 原版 sheet/item id + 私有段(见 data/tiles.ts 稳定表);v2=旧内部下标 */
  idScheme?: 'sheet';
  header: {
    name: string; seed: number; width: number; height: number;
    spawn: [number, number]; groundLevel: number; rockLevel: number; lavaLine?: number;
    crimson?: boolean; dungeonX?: number; dungeonY?: number; jungleX?: number;
    treeX?: number[]; treeStyle?: number[]; treeTops?: number[];
    created: number; playTimeMs: number;
    wldVersion?: number;
    moonType?: number;   // 月亮贴图样式（原版 header WF:1252；旧档缺省 0 标准月）
    seedFlags?: Record<string, boolean>; // 彩蛋种子旗标（旧档缺省={}）
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
  /** 旗击杀计数（BannerSystem.killCount;BannerSystem.cs:32 随存档——旧档缺省空） */
  bannerKills?: Record<number, number>;
  /** 渔夫任务链世界段（Main.anglerQuest + anglerWhoFinishedToday，WorldFile.cs:1329-1335/
   *  2147-2161；anglerQuestFinished 运行时态不存——读档 loadTempInfo 重置 WF:628-629） */
  angler?: { quest: number; whoFinishedToday: string[] };
  /** 困难矿世界锁定选种（WorldGen.SavedOreTiers，WF:1305-1307；旧档缺省 -1 = 未砸过） */
  savedOreTiers?: { cobalt: number; mythril: number; adamantite: number };
  /** 已砸暗影珠/猩红之心计数（WorldGen.shadowOrbCount，WF:1302/2099；旧档缺省 0） */
  shadowOrbCount?: number;
  tiles: string;   // base64 RLE
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
  /** 战争迷雾 0/1 位图（World.explored；原版 .twld MapHelper 段的等价物）。
   *  base64 RLE 同构通道——0/1 游程压到几个字节；旧档缺段 = 全 0 未探索（旧行为，不迁移） */
  explored?: string;
  chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean }>;
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
    loadouts?: Array<{ armor: Array<SavedItem | null>; dye: Array<SavedItem | null> }>;
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
    /** PVE 死亡计数（Player.numberOfDeathsPVE,PL:53840;旧档缺省 0） */
    deathsPve?: number;
    /** 发色剂染料 shaderId 1..12（Player.hairDye byte,PL:53805-53808 写/:54214-54216
     *  读；0=无。旧档缺省 0=无染料） */
    hairDye?: number;
    /** 永久升级族(Player.cs:44575-44802;旧档缺省全 false) */
    permanentUpgrades?: {
      extraAccessory?: boolean;
      usedAegisCrystal?: boolean;
      usedAegisFruit?: boolean;
      usedArcaneCrystal?: boolean;
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
  npcs: Array<{ key: string; x: number; y: number; home: [number, number] | null; bound?: boolean; givenName?: string; shimmered?: boolean }>;
  signs?: Array<{ x: number; y: number; text: string }>; // 墓碑碑文（旧档缺省无）
  /** 世界事件态（原版 header 内 party/灯笼夜段,WF:1361-1368/1381-1384;旧档缺省=无派对无预约） */
  events?: {
    partyManual: boolean;            // BirthdayParty.ManualParty
    partyCooldown?: number;         // BirthdayParty.PartyDaysOnCooldown（旧档缺省 0）
    lanternManual: boolean;          // 服务端手动灯笼（本仓无入口,位保留）
    lanternGenuine: boolean;         // 真灯笼夜兑现中
    lanternNext: boolean;            // 次夜灯笼夜预约
    lanternCooldown: number;         // 冷却夜数
  };
  /** 挂物族存放物（物品框 395/武器架 471/模特 470/帽架 475/食物盘 520/展示罐 698；
   *  原版 TileEntity 段的最小等价，旧档缺省无） */
  furniture?: FurnitureSaveEntry[];
  flags: Record<string, boolean>;
  weather?: WeatherSave; // 天气快照（雨/风/云/沙尘暴；旧档缺省=晴）
  /** 图鉴统计（BestiaryUnlocksTracker——原版随世界文件持久化 WorldFile.cs:3399/3405；
   *  旧档缺省=空三桶） */
  bestiary?: import('../data/Bestiary').BestiarySave;
}

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
  /** 战争迷雾 0/1 位图（World.explored，与 store 同长；缺省=不写该段=旧行为全 0） */
  explored?: Uint8Array;
}
/** 序列化所需的世界元数据(全部可结构化克隆) */
export interface SaveMeta {
  name: string; seed: number; w: number; h: number;
  spawnX: number; spawnY: number; groundLevel: number; rockLevel: number; lavaLine?: number;
  treeX?: number[]; treeStyle?: number[]; treeTops?: number[];
  crimson?: boolean; dungeonX?: number; dungeonY?: number; jungleX?: number;
  timeOfDay: number; dayCount: number;
  bloodMoon?: boolean; eclipse?: boolean; moonPhase?: number; moonType?: number;
  seedFlags?: Record<string, boolean>;
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
  /** 已砸暗影珠/猩红之心计数（WorldGen.shadowOrbCount，WF:1302/2099；旧档缺省 0） */
  shadowOrbCount?: number;
  /** 图鉴三桶（杀数/遇数/聊天）——data/Bestiary.ts BestiarySave */
  bestiary?: import('../data/Bestiary').BestiarySave;
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
    const t = stableMap ? (raw === 0 ? 0 : stableMap[raw]) : raw;
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

/** 存档序列化主体。幽灵净化在视图上就地执行(主线程=活存储原语义;
 * worker=副本,净化不影响游戏内状态,存档字节一致) */
export function serializeSave(
  st: SaveStoreView, meta: SaveMeta,
  player: SaveData['player'], playTimeMs: number,
  townNpcs?: SaveData['npcs'],
  events?: SaveData['events'],
): string {
  // 幽灵净化:存档格式不携带 active 位(加载时 type≠0 即激活),
  // 非活性格上的残留 type 必须归零,否则重读后全部变成浮空实体块
  for (let i = 0; i < st.type.length; i++) {
    if (!st.flags[i] && st.type[i] !== 0) st.type[i] = 0;
  }
  // 物品 id → 稳定 id(全槽位统一;量小直接遍历)。保留 favorited/prefix。
  // v4 起 armor/dye/trash/miscEquips/miscDyes/loadouts 也走稳定 id(v3 曾裸透传内部
  // 下标——注册表一变即错位;本地物品退役时顺手根治)
  const mapItem = (it: { id: number; stack: number; favorited?: boolean; prefix?: number; placeStyle?: number } | null) =>
    it
      ? {
        id: it.id === 0 ? 0 : ITEM_STABLE_OF_INTERNAL[it.id] ?? 0,
        stack: it.stack,
        favorited: it.favorited || undefined,
        prefix: it.prefix || undefined,
        placeStyle: it.placeStyle ?? undefined,
      }
      : null;
  const data: SaveData = {
    format: 'sandboxworld.save',
    version: 4,
    header: {
      name: meta.name, seed: meta.seed, width: meta.w, height: meta.h,
      spawn: [meta.spawnX, meta.spawnY], groundLevel: meta.groundLevel, rockLevel: meta.rockLevel,
      lavaLine: meta.lavaLine,
      treeX: meta.treeX, treeStyle: meta.treeStyle, treeTops: meta.treeTops,
      crimson: meta.crimson, dungeonX: meta.dungeonX, dungeonY: meta.dungeonY, jungleX: meta.jungleX,
      created: Date.now(), playTimeMs,
      moonType: meta.moonType ?? 0,
      seedFlags: meta.seedFlags,
      difficulty: meta.difficulty ?? 0,   // Main.GameMode（旧档缺省=经典）
      journeyTimeRate: meta.journeyTimeRate ?? 1,
      journeyFreezeTime: meta.journeyFreezeTime ?? false,
      journeyPowers: meta.journeyPowers,
      sundialCooldown: meta.sundialCooldown ?? 0,
      moondialCooldown: meta.moondialCooldown ?? 0,
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
    shadowOrbCount: meta.shadowOrbCount ?? 0,
    tiles: bytesToB64(rleTiles(st, TILE_STABLE_OF_INTERNAL)),
    walls: bytesToB64(rlePairs(st.wall)),
    liquid: bytesToB64(rlePairs(st.liquid)),
    liquidType: bytesToB64(rlePairs(st.liquidType)),
    wire: bytesToB64(rlePairs(st.wire)),
    blocks: bytesToB64(rlePairs(combineBlocks(st.half, st.slope))),
    // 油漆双通道（原版 WF:1474-1491 独立字节位；本仓独立 RLE 通道，旧档缺=全 0）
    paint: bytesToB64(rlePairs(st.paint)),
    paintWall: bytesToB64(rlePairs(st.paintWall)),
    // 战争迷雾（0/1 位图 RLE：全 0/全 1 各 1 游程 = ~7 字节；undefined 不落段 →
    // JSON.stringify 丢弃该键，旧读档端无害忽略）
    explored: st.explored ? bytesToB64(rlePairs(st.explored)) : undefined,
    chests: meta.chests.map((c) => ({ x: c.x, y: c.y, locked: c.locked || undefined, items: c.items.map(mapItem) })),
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
      })),
    },
    npcs: townNpcs ?? [],   // 城镇 NPC 段(WorldFile.cs:1703-1750 NPC 段;曾硬编码 [] 断链)
    signs: meta.signs,
    // 挂物族：存放物 id 走与 chests 相同的稳定 id 映射（mapItem 同构，保留 prefix）
    furniture: meta.furniture?.map((e) => ({
      x: e.x, y: e.y, kind: e.kind,
      slots: e.slots.map((s) => (s ? { id: s.id === 0 ? 0 : ITEM_STABLE_OF_INTERNAL[s.id] ?? 0, stack: s.stack, prefix: s.prefix } : null)),
    })),
    flags: meta.flags,
    weather: meta.weather,
    events,
    bestiary: meta.bestiary,
    bannerKills: meta.bannerKills,
    idScheme: 'sheet',
  };
  return JSON.stringify(data);
}

/** half + slope → 单字节 blockType(原版 Tile.blockType: 0=整砖 1=半砖 2-5=slope1-4) */
function combineBlocks(half: Uint8Array, slope: Uint8Array): Uint8Array {
  const out = new Uint8Array(half.length);
  for (let i = 0; i < half.length; i++) {
    out[i] = half[i] ? 1 : (slope[i] >= 1 && slope[i] <= 4 ? slope[i] + 1 : 0);
  }
  return out;
}
