// .wld 地图解析器（Terraria 1.4+，version >= 210）
// 格式参考 TEdit（Terraria-Map-Editor）的 World.FileV2.cs，此处为独立 TS 实现。
// 只支持读取：section header / header flags / tiles（RLE）/ chests / town npcs。
// bestiary 等尾部 section 通过 sectionPointers 跳过，不做 footer 校验。
import { BinaryReaderLE } from './BinaryReaderLE';
import type { SeedFlags } from '../world/gen/SeedEasterEggs';

export interface WldTileData {
  active: Uint8Array;    // active 标志（dirt 的 id 是 0，必须用此数组区分空气）
  type: Uint16Array;
  frameX: Uint16Array;
  frameY: Uint16Array;
  wall: Uint16Array;
  liquid: Uint8Array;
  liquidType: Uint8Array; // 1水 2岩浆 3蜂蜜
  wire: Uint8Array;       // 电路位 bit0红 bit1蓝 bit2绿 bit3黄 bit4致动器 bit5已致动（红蓝绿=header2 0x02-0x08,其余=header3）
  half: Uint8Array;       // 半砖(WorldFile.cs:1519 header2>>4 & 0x7 == 1)
  slope: Uint8Array;      // 坡面 1-4(== 2-5;Tile.cs sTileHeader bits 12-14 编码)
  paint: Uint8Array;      // 方块油漆 0-31（WorldFile.cs:2571-2574 header3 0x08 位后随 1 字节）
  paintWall: Uint8Array;  // 墙油漆 0-31（WorldFile.cs:2583-2586 header3 0x10 位后随 1 字节）
  coat: Uint8Array;       // 涂层四位（WorldFile.cs:2659-2677 header4：bit1(2)=invisibleBlock
                          //  bit2(4)=invisibleWall bit3(8)=fullbrightBlock bit4(16)=fullbrightWall）
}

export interface WldChest { x: number; y: number; name: string; items: Array<{ id: number; stack: number } | null>; }
export interface WldNPC { spriteId: number; name: string; x: number; y: number; homeX: number; homeY: number; homeless: boolean;
  /** homelessDespawn（v315+ byte,WorldFile.cs:2931-2933）——夜间清场扫标的位,
   *  ★SW-BO1 2026-09-07 起随导入透传（此前验读即弃=导入世界流浪 NPC 永不清场） */
  homelessDespawn?: boolean; }

/** TileEntities 段单件物品三元组（TE WriteExtraData 的 (short type, byte prefix, short stack)，
 *  Item.prefix 为 byte——Item.cs:305） */
export interface WldTeItem { vid: number; prefix: number; stack: number }

/** TileEntities 段条目（WorldFile.cs:3317-3327 写/:3330-3372 读；type byte =
 *  TileEntitiesManager.RegisterAll 注册序（TileEntitiesManager.cs:26-39）：
 *  0=训练假人 1=物品框 2=逻辑传感器 3=模特 4=武器架 5=帽架 6=食物盘 7=晶塔
 *  8=展示罐 9=风筝桩 10=小动物桩。全部 11 类逐型解码（★SW-FX35 2026-09-11
 *  定谳勘误：9/10 风筝桩/小动物桩继承 TELeashedEntityAnchorWithItem，
 *  WriteExtraData 写 short itemType（TELeashedEntityAnchorWithItem.cs:9-12）——
 *  旧版「7/9/10 无 ExtraData」对 7（晶塔，无覆写）成立、对 9/10 不成立，
 *  曾按无负载跳过 → 段内后续 TE 全体错位/自家导出丢挂物。TEdit TileEntity.cs
 *  Load switch（CritterAnchor/KiteAnchor → NetId=r.ReadInt16()）三方互证） */
export interface WldTileEntity {
  type: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  id: number;
  x: number;
  y: number;
  /** type 4 武器架 / 1 物品框 / 6 食物盘 / 8 展示罐 单槽三元组
   *  （TEWeaponsRack.cs:54-67 / TEItemFrame.cs:40-53 / TEFoodPlatter.cs:41-46 /
   *    TEDeadCellsDisplayJar.cs:40-45 同构 (short vid, byte prefix, short stack)）；
   *  type 9/10 锚桩复用本字段装挂物 vid（short itemType 单值，prefix=0/stack=1） */
  item?: WldTeItem | null;
  /** type 3 模特：equip[9]+misc[1]+dyes[9]+pose
   *  （TEDisplayDoll.cs:157-215 写/:217-278 读的持久化形状；pose=v307+，
   *    misc 位图=v308+：bit0=misc[0] bit1=equip[8] bit2=dyes[8]） */
  doll?: { equip: Array<WldTeItem | null>; misc: WldTeItem | null; dyes: Array<WldTeItem | null>; pose: number };
  /** type 5 帽架：hat[2]+dye[2]（TEHatRack.cs:56-111，位图 bit0-1=hat bit2-3=dye） */
  hat?: { hats: Array<WldTeItem | null>; dyes: Array<WldTeItem | null> };
  /** type 0 训练假人：short npc（TETrainingDummy.cs:119-127；-1=空桩） */
  dummy?: { npc: number };
  /** type 2 逻辑传感器：byte logicCheck + bool on（TELogicSensor.cs:381-395，
   *  LogicCheckType 枚举 0-7：None/Day/Night/PlayerAbove/Water/Lava/Honey/Liquid） */
  sensor?: { logicCheck: number; on: boolean };
}

export interface WldWorld {
  version: number;
  title: string;
  seed: string;
  tilesWide: number;
  tilesHigh: number;
  spawnX: number;
  spawnY: number;
  dungeonX: number;
  dungeonY: number;
  groundLevel: number;
  rockLevel: number;
  time: number;
  dayTime: boolean;
  /** 原版 header(WF:1252/1276-1278):月亮样式/月相/血月/日食 */
  moonType: number;
  moonPhase: number;
  bloodMoon: boolean;
  eclipse: boolean;
  isCrimson: boolean;
  hardMode: boolean;
  /** 原版 worldId（WF header；对话月相池等消费） */
  worldId: number;
  /** ★SW-FX43（2026-09-12）：header 身份/精度字段捕获（曾读位即弃 → 导入→存→导出
   *  环身份漂移）。落 save.wldSnap 差量快照（WldImport 组装,导出 fieldValue 快照
   *  优先回写零漂移）。i64 两项以十进制字符串域携行（>2^53,Number 化即失真），
   *  guid=16B hex 串。 */
  worldGenVersion: bigint;
  guid: string;
  creationTime: bigint;
  /** 原版世界清单串（v≥299 varint 长度+UTF8,WF:1436 写/:2523 读;台账曾恒写 ''） */
  manifest: string;
  /** ★SW-FX43：caveBackX[3]（WF:1266-1268 写/:2065-2067 读）——原版独立掷
   *  RandomizeCaveBackgrounds（WorldGen.cs:8141-8210）,与 treeX 无派生关系。
   *  曾读位即弃 → 导出按 treeX 派生=导入档漂移（FX33 登记债） */
  caveBackX: number[];
  /** ★SW-FX43：入侵五元组（WF:1306-1309 写序 delay/size/type/x + :1322
   *  invasionSizeStart v107+;读侧 :2100-2104/:2151 同序）——曾读位即弃 →
   *  导入世界入侵中断+再导出归零 */
  invasion: { delay: number; size: number; type: number; x: number; sizeStart: number };
  /** ★SW-FX43：沙暴四元组（WF:1375-1378 _tempSandstormHappening..IntendedSeverity;
   *  SetTempToOngoing :1063-1066 / LoadWorld :166-172 回灌 Sandstorm.*）——曾读位即弃 */
  sandstorm: { happening: boolean; timeLeft: number; severity: number; intendedSeverity: number };
  /** ★SW-FX43：流星雨剩余计数（WF:1428 _tempMeteorShowerCount → LoadWorld :177
   *  回灌 WorldGen.meteorShowerCount）——曾读位即弃 */
  meteorShowerCount: number;
  /** 原版洞穴背景四区样式（WF:1262-1268 caveBackStyle[4]） */
  caveBackStyle: number[];
  /** 冰雪/丛林/地狱背景样式（WF:1269-1271） */
  iceBackStyle: number;
  jungleBackStyle: number;
  hellBackStyle: number;
  /** 已砸暗影珠数（WF:1302 byte）——满 3 召 EoW/BoC 计数,随导入回填 */
  shadowOrbCount: number;
  /** 已砸祭坛数（WF:1303 int32）——新三矿轮换波次源/海盗入侵门 */
  altarCount: number;
  /** 困难矿世界锁定选种（WF:1315-1317 int32×3;-1 = 未砸过该档） */
  savedOreTiers: { cobalt: number; mythril: number; adamantite: number };
  /** 原版 gameMode（0 经典 1 专家 2 大师 3 旅程；v<209 无此字段=0） */
  gameMode: number;
  /** 日晷/月晷快进四件套（WF:2120/2203/2449-2450；v<113 无 sundial 位=0、
   *  v<264 无月晷位=0/false——与 WorldFile 缺省分支一致） */
  sundialCooldown: number;
  /** 拜月教石碑重生倒计时（WF:2185-2192 int32，v108+；缺省 86400=CultistRitual.delayStart） */
  cultistDelay: number;
  /** 旗帜击杀计数（WF:1347 写/:2210 读 → BannerSystem.Load：i16 n + n×i32
   *  killCount[banner]，banner 域 1-292、下标 0 恒 0；v≥289 再跟 claimableBanners
   *  u16[293]——本仓不建模领取面，验读后即弃）。仅非零项落表（键=banner id，
   *  与 World.bannerKills 同域） */
  bannerKills: Record<number, number>;
  fastForwardTimeToDawn: boolean;
  fastForwardTimeToDusk: boolean;
  moondialCooldown: number;
  treeX: number[];
  treeStyle: number[];
  treeTops: number[];
  tiles: WldTileData;
  chests: WldChest[];
  npcs: WldNPC[];
  /** 天气头字段（v>273 才有；更早版本晴天） */
  weather?: {
    raining: boolean; rainTime: number; maxRaining: number;
    cloudBGActive: number; numClouds: number; windSpeedTarget: number;
    slimeRainTime?: number;
  };
  /** 彩蛋种子旗标九位（WorldFile.cs:1242-1250 写/:1988-2014 读，版本门逐位；
   *  仅真值落键——普通世界为 {} 空对象。S0-3：导入原版特殊种子档即激活特性） */
  seedFlags: SeedFlags;
  /** ★R16-1（2026-08-24）：LoadWorldFlags 全量旗标（WF57:2088-2517 ~40 位）——
   *  downed_<vid> 双键族按本仓 Game.ts 现行键约定回填（downed_4/13/266/35/50/222/
   *  134/125/127/262/245/439/398/668 + downedEyeOfCthulhu/downedSkeletron 等命名键）、
   *  saved*\/downedGoblins/downedFrost/downedPirates/downedMartians、四塔
   *  downedTower*\/towerActive*+lunarApocalypseUp、DD2 dd2DownedT1-T3/Any、
   *  史莱姆/城镇 NPC 解锁族 unlocked*Spawn、forceHalloween*\/XMas*（含 Forever）、
   *  combatBook/2、shadowOrbSmashed、spawnMeteor、vampireSeed/infectedSeed、
   *  teamBasedSpawnsSeed。曾读位即弃 → 导入肉后世界=肉前玩法。 */
  flags: Record<string, boolean>;
  /** ★SW-FX11（2026-09-10）：SavedOreTiers 肉前四档（WF:1394-1397 Copper/Iron/Silver/Gold
   *  i32×4，v>=216 门）——曾读位即弃（:436 void）→ 醉酒世界 166/167/168/169 替代矿
   *  导入即丢（军火商钨弹门 Game.ts:34531 读 oreTiersPH.silver===168） */
  oreTiersPH: { copper: number; iron: number; silver: number; gold: number };
  /** ★SW-FX11（2026-09-10）：城镇 NPC 段头 ShimmeredTownNPCs 名单（v>=268 门，
   *  WF:1712-1720 Save / :2899-2906 Load——i32 数量 × i32 NPC type id）。
   *  曾读位即弃 → 微光城镇化 NPC 导入后微光变体丢失（回退原色渲染） */
  shimmered: number[];
  /** ★SW-FX11（2026-09-10）：NPC 段尾 SavesAndLoads 非城镇 NPC 段（v>=140 门，
   *  WF:1744-1755 Save / :2937-2955 Load——bool true → i32 netID + f32×2 position
   *  循环，bool false 终止）。集合成员=NPCID.Sets.SavesAndLoads（NPCID.cs:4807
   *  CreateBoolSet(422,507,517,493)）=天界四塔。曾整段跳过 → 导入/读档后天界入侵
   *  中途档塔实体消失，updateLunarApocalypse 首帧全灭塔旗（四塔齐无 398 时还会误启
   *  ImpendingDoom 倒计时）。position=实体左上角像素（NPC.position 同语义） */
  pillarNpcs: Array<{ id: number; x: number; y: number }>;
  /** ★SW-FX11（2026-09-10）：按压压力板段（pointers[6]，WF:3374-3386 Save /
   *  :3388-3398 Load——i32 数量 × (i32 x, i32 y)）。原版语义=读档首拍对每位置
   *  PokeLocation→Wiring.HitSwitch 一次性重触发后清空（PressurePlateHelper.cs:19-31/
   *  :156-164）；存档点恰站压力板时接线的机关重载应响一次 */
  pressurePlates: Array<{ x: number; y: number }>;
  /** ★SW-BJ45（2026-09-09）：渔夫任务链段（WF:1335-1341/2159-2173）——当日任务鱼索引
   *  + 今日已交付玩家名单。曾读位即弃 → 导入世界任务恒索引 0=蝙蝠鱼且名单清空 */
  anglerQuest: number;
  anglerWhoFinishedToday: string[];
  /** ★R16-2：signs 段（pointers[3]，WF57:2841-2885 LoadSigns：i16 数量 ×
   *  {string text, i32 x, i32 y}）——坐标=2×2 牌左上锚（Sign.ReadSign :24-31 同款
   *  frameX/18 反解）。曾整段跳过 → 导入图牌全灭（连同 tile 55 被 null 清空）。 */
  signs: Array<{ text: string; x: number; y: number }>;
  /** ★SW-FX33（2026-09-11）：派对段（WF:1367-1369 写/_tempPartyManual·Genuine·Cooldown +
   *  :1370-1374 TempPartyCelebratingNPCs 名单 i32 n + n×i32;读侧 :2266-2276 同序,v>=170 门,
   *  本仓支持域 >=210 恒过门)。celebrating=原版 netId 域(WorldFile.cs:168 Load 尾
   *  BirthdayParty.CelebratingNPCs.AddRange 回灌)。曾读位即弃 → 导入档派对进行中/
   *  过生日名单丢失,再导出恒写空 */
  party: { manual: boolean; genuine: boolean; cooldown: number; celebrating: number[] };
  /** ★SW-FX33（2026-09-11）：灯笼夜四件套（WF:1387-1390 写/_tempLanternNight* 四连;
   *  读侧 :2336-2341 同序,v>=207 门恒过）。曾读位即弃 → 导入档灯笼夜进行中/预约态丢失 */
  lantern: { cooldown: number; genuine: boolean; manual: boolean; next: boolean };
  /** ★R16-5：背景样式 13 档全量（setBG 0-12；caveBackStyle[4]/ice/jungle/hell 之外
   *  补 8=蘑菇(v>194)/9=地狱(v>=215)/10-12(v>195)——曾读位即弃 → seed 派生重掷） */
  bgMushroom: number;
  bgUnderworld: number;
  bg10: number; bg11: number; bg12: number;
  /** ★2026-09-03：header bg 字节组（WF:1325-1331 treeBG1..oceanBG 八连，此前整组按
   *  8×u8 丢弃）——treeBG1-4=四区森林背景样式（样式4=248/249/250 沙暴巨丘等）、
   *  corrupt/jungle/snow/hallow/crimson=各侵染背景样式档、ocean=海洋单层贴图变体。
   *  曾读位即弃 → 导入档全套背景回退 seed 派生重掷（导入世界观感与原版档不一致） */
  treeBG1: number;
  treeBG2: number;
  treeBG3: number;
  treeBG4: number;
  corruptBG: number;
  jungleBG: number;
  snowBG: number;
  hallowBG: number;
  crimsonBG: number;
  desertBG: number;
  oceanBG: number;
  /** ★七批备案④-c（2026-09-02）/★SW-FX35（2026-09-11）：TileEntities 段
   *  （pointers[5]，v>=122 门 WF:1803-1821）——11 类全型解码落负载；
   *  段不存在/版本旧/pointers 缺失=空数组（静默略过） */
  tileEntities: WldTileEntity[];
  /** TE 段中未知 type 中止后放弃余段的条数（可解码类型全部落 list，不再计入） */
  teSkipped: number;
  /** ★SW-FX35：城镇房间表（pointers[7] 段,v>=189 门 WF:1830-1836；TownRoomManager.cs:94-124
   *  Save/Load——i32 n + n×(i32 npcType, i32 roomX, i32 roomY)。原版语义=TownManager
   *  房间预留（NPC 入住的家位记录， homeless 期间房间仍占位）。曾整段跳过 */
  townRooms: Array<{ npc: number; x: number; y: number }>;
  /** ★SW-FX35：图鉴三桶（pointers[8] 段,v>=210 门 WF:1838-1846；BestiaryUnlocksTracker.cs:14-31
   *  Save 序 Kills→Sights→Chats）。k=persistentId→杀数（NPCKillsTracker.cs:60-71），
   *  s/c=persistentId 集合（NPCWasNearPlayerTracker.cs:65-76/NPCWasChatWithTracker.cs:54-65）。
   *  persistentId 域 = NPCID.Search.GetName(netID)（vanilla）== 本仓 bestiaryCreditId 域。
   *  曾整段跳过 → 导入档图鉴进度全丢 */
  bestiary: { k: Record<string, number>; s: string[]; c: string[] };
  /** ★SW-FX35：旅程力量 per-world 段（pointers[9],v>=220 门 WF:1848-1856；
   *  CreativePowerManager.cs:125-137 SaveToWorld——bool true+u16 id+负载 循环+bool false。
   *  IPersistentPerWorldContent 六力：0 FreezeTime bool/8 ModifyTimeRate f32(滑杆 0-1)/
   *  9 FreezeRain bool/10 FreezeWind bool/12 DifficultySlider f32(0-1)/13 StopBiomeSpread bool；
   *  按键力 1-4 与 per-player 力（5/11/14）不落世界段。曾整段跳过 */
  creativePowers: Array<{ id: number; num?: number; bool?: boolean }>;
}

export class WldParseError extends Error {}

export function parseWld(buf: Uint8Array): WldWorld {
  const r = new BinaryReaderLE(buf);
  const version = r.u32();
  if (version < 210) {
    throw new WldParseError(`不支持的世界文件版本 ${version}（需要 1.4+，version >= 210）。请在游戏中重新保存该地图。`);
  }
  // R4-11（WF57:197/:717/:3027/:3442 四处 `num > 325` 拒载同语义；★1458 全部抬到
  // `> 326`——GameVersionID.Terraria1458Release=326,头布局无新字段,326 与 325 同构）：
  // 未来版本按当前头布局静默错解比明确拒绝更危险——327+ 一律拒。
  if (version > 326) {
    throw new WldParseError(`不支持的世界文件版本 ${version}（本复刻最高支持 326 / 1.4.5.8）。`);
  }
  // ★R16-7③（2026-08-24）：FileMetadata 门 = 135（WF57:1913），非 140——
  //  v135-139 旧档（1.3 中段）头魔数段存在,曾跳读 → 后续全乱
  if (version >= 135) {
    // header magic（中文版为不同常量，这里宽放校验）
    const magic = new TextDecoder().decode(r.bytes(7));
    const fileType = r.byte();
    // TEdit FileType 枚举：None=0, Map=1, World=2, Player=3
    if (fileType !== 2) throw new WldParseError(`不是世界文件（fileType=${fileType}）`);
    if (magic !== 'relogic') {
      // 宽放：中文版魔数，只要不是明显非法就继续
      if (!/^[a-z]{7}$/i.test(magic)) throw new WldParseError(`无效的文件头魔数: "${magic}"`);
    }
    r.u32(); // revision
    r.u64(); // favorite flags
  }
  const sectionCount = r.i16();
  const pointers: number[] = [];
  for (let i = 0; i < sectionCount; i++) pointers.push(r.i32());
  // tileFrameImportant 位图（TEdit ReadBitArray：每字节 LSB 在前）
  const bitLen = r.i16();
  const frameImportant: boolean[] = new Array(bitLen);
  {
    let data = 0;
    for (let i = 0; i < bitLen; i++) {
      if ((i & 7) === 0) data = r.byte();
      frameImportant[i] = ((data >> (i & 7)) & 1) !== 0;
    }
  }

  // ---- header flags ----
  r.seek(pointers[0]);
  const title = r.string();
  let seed = '';
  // ★SW-FX43：worldGenVersion 捕获（WF:1243 写/:1979 读;i64,快照字符串域携行）
  let worldGenVersion = 0n;
  if (version >= 179) {
    seed = version === 179 ? String(r.i32()) : r.string();
    worldGenVersion = r.u64(); // worldGenVersion（曾读位即弃）
  }
  // ★SW-FX43：guid 16B 捕获（WF:1245 写/:1983 读;曾读位即弃→导出恒 16 零字节）。
  //  hex 串落 wldSnap（导出 writeHeader 按 32 位 hex 解回 16B）
  let guid = '';
  if (version >= 181) {
    for (const b of r.bytes(16)) guid += b.toString(16).padStart(2, '0');
  }
  const worldId = r.i32(); // worldId
  r.i32(); r.i32(); r.i32(); r.i32(); // bounds
  const tilesHigh = r.i32();
  const tilesWide = r.i32();
  // gameMode
  let gameMode = 0;
  // 日晷/月晷快进四件套（WorldFile.cs:2120 sundialCooldown / :2203 fastForwardTimeToDawn /
  // :2449-2450 fastForwardTimeToDusk + moondialCooldown——version>=264 才有月晷位）
  let sundialCooldown = 0;
  let fastForwardTimeToDawn = false;
  let fastForwardTimeToDusk = false;
  let moondialCooldown = 0;
  // ★SW-FX11（2026-09-10）：SavedOreTiers 肉前四档（WF:1394-1397, v>=216；缺省 -1=未
  //  掷过,同原版 v<216 旧档读侧 WF:2358-2361）
  let oreTiersPH = { copper: -1, iron: -1, silver: -1, gold: -1 };
  // 彩蛋种子旗标九位（WorldFile.cs:1242-1250 写序 = :1988-2014 读序，版本门逐位）：
  //   v222 drunk / v227 good(FTW) / v238 tenthAnniversary / v239 dontStarve(theConstant) /
  //   v241 notTheBees / v249 remix / v266 noTraps / v267 zenith(everything) / v302 skyblock
  // S0-3：曾读位即弃——导入原版特殊种子档丢全部特性，现回填 seedFlags
  const seedFlags: SeedFlags = {};
  // ★R16-1：LoadWorldFlags 全量旗标捕获（键=本仓 Game.ts 现行约定）
  const flags: Record<string, boolean> = {};
  if (version >= 209) {
    gameMode = r.i32();
    if (version >= 222 && r.boolean()) seedFlags.drunkWorld = true;
    if (version >= 227 && r.boolean()) seedFlags.getGoodWorld = true;
    if (version >= 238 && r.boolean()) seedFlags.tenthAnniversary = true;
    if (version >= 239 && r.boolean()) seedFlags.theConstant = true;
    if (version >= 241 && r.boolean()) seedFlags.notTheBees = true;
    if (version >= 249 && r.boolean()) seedFlags.remix = true;
    if (version >= 266 && r.boolean()) seedFlags.noTraps = true;
    if (version >= 267 && r.boolean()) seedFlags.everything = true;
    if (version >= 302 && r.boolean()) seedFlags.skyblock = true;
  } else if (version >= 112) {
    // ★R16-7④：v112-207 gameMode 位读 bool；v208 额外多 1 个 bool
    //  （WF57:2036-2047——208 特判双 bool,真值=大师档 gameMode=2,曾只读 1 个
    //  且丢真值 → v208 档头错位+难度丢）
    r.boolean();
    if (version === 208 && r.boolean()) gameMode = 2;
  }
  // ★SW-FX43：CreationTime 捕获（v141 门,WF:1254 写/:2020 读;i64 .NET ticks——
  //  >2^53 以字符串域携行,导出 BigInt(str) 精确回写;header.created=ms 派生丢亚毫秒位）
  const creationTime = version >= 141 ? r.i64() : 0n;
  if (version >= 284) r.i64(); // lastPlayed
  const moonType = r.u8(); // moonType
  const treeX = [r.i32(), r.i32(), r.i32()];       // 世界横向 4 区分界（树样式用）
  let treeTops: number[] = [];                    // TreeTops 13 区域变体（v≥211 优先于 header treeStyle）
  const treeStyle = [r.i32(), r.i32(), r.i32(), r.i32()]; // 各区森林树样式
  // ★SW-FX43：caveBackX[3] 捕获（WF:1266-1268;原版 RandomizeCaveBackgrounds
  //  WorldGen.cs:8141-8210 独立掷,与 treeX 无派生关系——曾读位即弃）
  const caveBackX = [r.i32(), r.i32(), r.i32()];
  const caveBackStyle = [r.i32(), r.i32(), r.i32(), r.i32()];
  const iceBackStyle = r.i32();
  const jungleBackStyle = r.i32();
  const hellBackStyle = r.i32();
  const spawnX = r.i32();
  const spawnY = r.i32();
  const groundLevel = r.f64();
  const rockLevel = r.f64();
  const time = r.f64();
  const dayTime = r.boolean();
  const moonPhase = r.i32(); // moonPhase
  const bloodMoon = r.boolean(); // blood moon
  const eclipse = r.boolean(); // eclipse
  const dungeonX = r.i32(), dungeonY = r.i32(); // 地牢入口坐标（dungeonX/Y）
  const isCrimson = r.boolean();
  // ★R16-1：downedBoss 族十连（WF57:2088-2097）——按本仓 downed_<vid> 双键约定回填
  //  （EmoteMenu/SkyRenderer/NpcDrops 消费口径:downed_4‖downedEyeOfCthulhu 等）
  if (r.boolean()) { flags.downed_4 = true; flags.downedEyeOfCthulhu = true; }             // downedBoss1 EoC
  if (r.boolean()) { flags.downed_13 = true; flags.downed_266 = true; }                    // downedBoss2 EoW|BoC（单旗双键,消费端 OR 口径）
  if (r.boolean()) { flags.downed_35 = true; flags.downedSkeletron = true; }               // downedBoss3 骷髅王
  if (r.boolean()) flags.downed_222 = true;                                                // downedQueenBee
  if (r.boolean()) flags.downed_134 = true;                                                // downedMechBoss1 毁灭者
  if (r.boolean()) flags.downed_125 = true;                                                // downedMechBoss2 双子魔眼
  if (r.boolean()) flags.downed_127 = true;                                                // downedMechBoss3 铁骷髅王
  if (r.boolean()) flags.downedMechBossAny = true;                                         // downedMechBossAny
  if (r.boolean()) flags.downed_262 = true;                                                // downedPlantBoss 世纪之花
  if (r.boolean()) flags.downed_245 = true;                                                // downedGolemBoss 石巨人
  if (version >= 118 && r.boolean()) flags.downed_50 = true;                               // downedSlimeKing 史莱姆王
  // saved 城镇 NPC 七连 + downed 入侵四连（WF57:2102-2108）
  if (r.boolean()) flags.savedGoblin = true;
  if (r.boolean()) flags.savedWizard = true;
  if (r.boolean()) flags.savedMech = true;
  if (r.boolean()) flags.downedGoblins = true;
  if (r.boolean()) { flags.downedClown = true; flags.downed_109 = true; }                  // 小丑（★双键:downed_109=运行时键,Game.ts:35766 命名解析器消费,2026-09-14 审计补）
  if (r.boolean()) flags.downedFrost = true;
  if (r.boolean()) flags.downedPirates = true;
  if (r.boolean()) flags.shadowOrbSmashed = true;                                          // shadowOrbSmashed
  if (r.boolean()) flags.spawnMeteor = true;                                               // spawnMeteor
  const shadowOrbCount = r.u8(); // WF:1302 shadowOrbCount(byte)
  const altarCount = r.i32(); // WF:1303 altarCount(int32)
  const hardMode = r.boolean();
  if (hardMode) flags.hardMode = true;
  if (version >= 257 && r.boolean()) flags.afterPartyOfDoom = true;                        // party of doom
  // ★SW-FX43：入侵四连捕获（WF:1306-1309 写序 delay/size/type/x;读侧 :2100-2104 同序）
  //  ——曾读位即弃 → 导入世界入侵中断+再导出归零
  const invDelay = r.i32(), invSize = r.i32(), invType = r.i32(), invX = r.f64();
  const slimeRainTime = version >= 118 ? r.f64() : 0; // slime rain（Main.slimeRainTime：>0 进行中 <0 冷却）
  if (version >= 113) sundialCooldown = r.u8(); // WF:2120 Main.sundialCooldown
  const raining = r.boolean(); const rainTime = r.i32(); const maxRaining = r.f32(); // rain
  // WF:1315-1317 SavedOreTiers 三档锁定选种（int32×3）——原版 .wld 权威导入
  const savedOreTiers = { cobalt: r.i32(), mythril: r.i32(), adamantite: r.i32() };
  // WF:1325-1331 bg 字节八连：treeBG1/corruptBG/jungleBG/snowBG/hallowBG/crimsonBG/
  // desertBG/oceanBG——此前整组按 8×u8 丢弃（见接口注），现按位全量读出
  // （treeBG2/3/4 不在本组——WF:1383-1385 在 DD2/蘑菇/地狱段之后另存,见上方读点）
  const treeBG1 = r.u8();  // WF:1325 一区森林背景样式（setBG(0) 值域 0-13/31/51/71-73）
  const corruptBG = r.u8(); // WF:1326 腐化背景样式（setBG(1)，猩红世界=猩红同款）
  const jungleBG = r.u8(); // WF:1327 丛林背景样式（setBG(2) 0-6）
  const snowBG = r.u8();   // WF:1328 雪原背景样式（setBG(3) 0-8/21-42）
  const hallowBG = r.u8(); // WF:1329 神圣背景样式（setBG(4) 0-5）
  const crimsonBG = r.u8(); // WF:1330 猩红背景样式（setBG(5) 0-6）
  const desertBG = r.u8(); // WF:1330 沙漠背景样式（setBG case 6 值域 0-4/51-53）
  const oceanBG = r.u8();  // WF:1331 海洋背景贴图变体（setBG case 7 值域 0-7）
  const cloudBGActive = r.i32(); const numClouds = r.i16(); const windSpeedTarget = r.f32(); // clouds/wind
  // angler（★SW-BJ45 2026-09-09：名单+任务索引读位即收，曾整段丢弃 → 导入世界
  //   anglerQuest 恒 0=蝙蝠鱼(2450=ANGLER_QUEST_ITEMS[0]) 且交付名单清空。原版
  //   WF:1335-1341 Save / WF:2159-2173 Load（名单 v>=95、savedAngler v>=99、
  //   anglerQuest v>=101——本仓支持版本域全过门，读序同位））
  const anglerWhoFinishedToday: string[] = [];
  {
    const n = r.i32();
    for (let i = 0; i < n; i++) anglerWhoFinishedToday.push(r.string());
  }
  if (r.boolean()) flags.savedAngler = true;
  const anglerQuest = r.i32();
  if (r.boolean()) flags.savedStylist = true;
  // ★R16-7①：tax collector 门 = 129（WF57:2179），非 140
  if (version >= 129 && r.boolean()) flags.savedTaxCollector = true;
  if (version >= 201 && r.boolean()) flags.savedGolfer = true;
  // ★SW-FX43：invasionSizeStart 捕获（v107 门,WF:1322 写/:2151 读）——曾读位即弃
  const invasionSizeStart = version >= 107 ? r.i32() : 0;
  const cultistDelay = version >= 108 ? r.i32() : 86400; // WF:2185-2192（缺省=delayStart，同 CultistRitual.cs:7）

  // banners（WF:2210 BannerSystem.Load：i16 n + n×i32 killCount[banner]；v≥289 再
  //  i16 m + m×u16 claimableBanners——claimable 本仓不建模，验读即弃。
  //  击杀数下标域 = banner id 1-292（下标 0 恒 0 不落表；BannerSystem.cs:34 静态表）。
  //  ★存表上限 i<293（BannerSystem.cs:194 `if (i < killCount.Length)`，MaxBannerTypes=293
  //  :124/:126）——段头 n 可大于 293（第三方/旧工具产物），越界下标只消费流位不落表
  const bannerKills: Record<number, number> = {};
  {
    const n = r.i16();
    for (let i = 0; i < n; i++) {
      const kills = r.i32();
      if (i > 0 && i < 293 && kills > 0) bannerKills[i] = kills;
    }
    if (version >= 289) {
      const m = r.i16();
      for (let i = 0; i < m; i++) r.u16();
    }
  }
  // ★R16-7②：fastForwardTimeToDawn 门 = 128（WF57:2211-2215 `version < 128 return`），非 140
  if (version >= 128) fastForwardTimeToDawn = r.boolean(); // WF:2203
  if (r.boolean()) { flags.downedFishron = true; flags['downed_370'] = true; }             // 猪龙鱼公爵（★双键:消费端 EmoteMenu/TownNPC 读 downed_370,曾只落驼峰键=.wld 导入域表情 50/城镇自卫档丢失,红蓝对抗 R3-C3）
  if (version >= 131) {                                                                    // martians/cultist/moonlord
    if (r.boolean()) flags.downedMartians = true;
    if (r.boolean()) flags.downed_439 = true;                                              // downedAncientCultist 拜月教邪教徒
    if (r.boolean()) flags.downed_398 = true;                                              // downedMoonlord 月总
  } else { r.boolean(); r.boolean(); r.boolean(); }
  // 五节日 Boss（WF57:2224-2228）——★双键（2026-09-14 审计,同 :456 downedFishron 先例）：
  // 消费端 EmoteMenu:96-100 读 vid 键 downed_325/327/344/345/346,曾只落驼峰键=
  // 导入已败南瓜王/哀木/常绿树/冰女王/圣诞坦克的世界表情 54-58 永不上锁
  if (r.boolean()) { flags.downedHalloweenKing = true; flags.downed_327 = true; }
  if (r.boolean()) { flags.downedHalloweenTree = true; flags.downed_325 = true; }
  if (r.boolean()) { flags.downedChristmasIceQueen = true; flags.downed_345 = true; }
  if (r.boolean()) { flags.downedChristmasSantank = true; flags.downed_346 = true; }
  if (r.boolean()) { flags.downedChristmasTree = true; flags.downed_344 = true; }
  // 四塔 downed（v140 门,WF57:2233-2236）+ 四塔 active（:2237-2240）+ 天界入侵
  if (version >= 140) {
    if (r.boolean()) flags.downedTowerSolar = true;
    if (r.boolean()) flags.downedTowerVortex = true;
    if (r.boolean()) flags.downedTowerNebula = true;
    if (r.boolean()) flags.downedTowerStardust = true;
    if (r.boolean()) flags.towerActiveSolar = true;
    if (r.boolean()) flags.towerActiveVortex = true;
    if (r.boolean()) flags.towerActiveNebula = true;
    if (r.boolean()) flags.towerActiveStardust = true;
  }
  // （v<140 原版在此 return 终读——本解析器只支持 >=210,else 不补读）
  if (r.boolean()) flags.lunarApocalypseUp = true;                                         // apocalypse
  // ★SW-FX33（2026-09-11）：派对段捕获（原 WF:1367-1374 同位——曾读位即弃,见接口注）。
  //  读序=WF:2267-2275:manual(bool)/genuine(bool)/cooldown(i32)/celebrating(i32 n + n×i32)
  let party = { manual: false, genuine: false, cooldown: 0, celebrating: [] as number[] };
  if (version >= 170) {
    const manual = r.boolean();
    const genuine = r.boolean();
    const cooldown = r.i32();
    const n = r.i32();
    const celebrating: number[] = [];
    for (let i = 0; i < n; i++) celebrating.push(r.i32());
    party = { manual, genuine, cooldown, celebrating };
  }
  // ★SW-FX43：沙暴四元组捕获（v174 门,WF:1375-1378 写/_tempSandstormHappening..
  //  IntendedSeverity;读侧 :2319-2323 同序;LoadWorld :166-172 回灌 Sandstorm.*）
  //  ——曾读位即弃 → 导入档沙暴进行中丢失+再导出恒全零
  const sandstorm = version >= 174
    ? { happening: r.boolean(), timeLeft: r.i32(), severity: r.f32(), intendedSeverity: r.f32() }
    : { happening: false, timeLeft: 0, severity: 0, intendedSeverity: 0 };
  // ★savedBartender+DD2 三 bool（v178,WF:1369 savedBartender + DD2Event.cs:151-157
  //  Save=3 bool(T1/T2/T3),Load 读 savedBartender+3 共 4 bool——**无第 4 个 Any**!
  //  曾把第 1 位标成 dd2DownedT1(语义错位):flags.savedBartender 缺失=原版导入世界
  //  酒保永不入住(VanillaSpawner :1815 消费),dd2DownedAny 键不存在于原版流。
  //  2026-09-06 修正语义;旧导入档的 dd2DownedT1 实为 savedBartender(登记)。
  if (version >= 178) {
    if (r.boolean()) flags.savedBartender = true;
    if (r.boolean()) flags.dd2DownedT1 = true;
    if (r.boolean()) flags.dd2DownedT2 = true;
    if (r.boolean()) flags.dd2DownedT3 = true;
  }
  // ★R16-5：背景样式 8/9/10-12（WF57:2294-2312 setBG(8..12)——曾读位即弃）
  const bgMushroom = version > 194 ? r.u8() : 0;
  const bgUnderworld = version >= 215 ? r.u8() : 0;
  // ★R16-7⑤：bg10-12 门 = `version > 195`（WF57:2309 严格大于）,非 >= 195
  let bg10 = 0, bg11 = 0, bg12 = 0;
  if (version > 195) { bg10 = r.u8(); bg11 = r.u8(); bg12 = r.u8(); }
  // ★P0-2 勘误(2026-09-07 红队):bg10/11/12 与 treeBG2/3/4 是**同一组三字节**——
  //  写侧 WF:1381-1385 在 underworldBG 与 combatBook 之间恒写 3 字节(setBG(10/11/12)
  //  即 treeBG2/3/4,WorldGen.cs:7173-7175),读侧 WF:2294-2312 同位读入 bg10-12。
  //  旧实现在此处二次读 treeBG2-3-4 → v≥204(全部 1.4 档)恒超读 3 字节,尾部约 30
  //  个旗标域(boss 击杀/NPC 解锁/宠物/季节事件/秘密种子)整体错位,TreeTops 读出
  //  1280 项垃圾——「教科书式断言盲区」(tiles/chests 走指针 seek 不受影响)。
  //  bg10-12 即 treeBG2-4,上方已读,不再二次读取。
  if (version >= 204 && r.boolean()) flags.combatBookWasUsed = true;                       // combatBookWasUsed（★SW-FX11 键域归一,原 WF:1386 NPC.combatBookWasUsed）
  // ★SW-FX33（2026-09-11）：灯笼夜四件套捕获（原注释「运行时态,不落 flags」误判——
  //  原版持久化于 WF:1387-1390,读序=WF:2336-2339 cooldown(i32)/genuine/manual/next）
  let lantern = { cooldown: 0, genuine: false, manual: false, next: false };
  if (version >= 207) {
    lantern = { cooldown: r.i32(), genuine: r.boolean(), manual: r.boolean(), next: r.boolean() };
  }
  if (version >= 211) {
    // TreeTops 变体表（WorldGen.TreeTops.Load：13 个区域树样式，v≥211 世界用这个）
    const n = r.i32();
    treeTops = [];
    for (let i = 0; i < n; i++) treeTops.push(r.i32());
  }
  // ★R16-1：forceHalloween/XMas ForToday（v212,WF57:2341-2342）
  if (version >= 212) {
    if (r.boolean()) flags.forceHalloweenForToday = true;
    if (r.boolean()) flags.forceXMasForToday = true;
  } else { r.boolean(); r.boolean(); }
  if (version >= 216) {
    // SavedOreTiers 铜/铁/银/金（WF:1394-1397 写 / :2351-2361 读 int32×4, v>=216）——
    // ★SW-FX11（2026-09-10）接通透传:曾读位即弃（void）→ 醉酒世界 166/167/168/169
    // 替代矿导入即丢（军火商钨弹门 Game.ts:34531 读 oreTiersPH.silver===168）。
    // 旧档（<216）原版读侧落 -1 四连（WF:2358-2361），同形落缺省。
    oreTiersPH = { copper: r.i32(), iron: r.i32(), silver: r.i32(), gold: r.i32() };
  } else {
    oreTiersPH = { copper: -1, iron: -1, silver: -1, gold: -1 };
  }
  // ★R16-1：宠物购买三连（v217）+ EoL/史莱姆女皇（v223）+ 鹿角怪（v240）
  if (version >= 217) {
    if (r.boolean()) flags.boughtCat = true;
    if (r.boolean()) flags.boughtDog = true;
    if (r.boolean()) flags.boughtBunny = true;
  } else { r.boolean(); r.boolean(); r.boolean(); }
  if (version >= 223) {
    if (r.boolean()) flags.downed_636 = true;                                              // downedEmpressOfLight 光之女皇
    if (r.boolean()) flags.downed_657 = true;                                              // downedQueenSlime 史莱姆女皇
  } else { r.boolean(); r.boolean(); }
  if (version >= 240) { if (r.boolean()) flags.downed_668 = true; } else r.boolean();      // downedDeerclops 鹿角怪
  // ★R16-1：史莱姆/城镇 NPC 解锁族（v250/251/261——ItemDrop.ts:93 等直接消费）
  if (version >= 250) { if (r.boolean()) flags.unlockedSlimeBlueSpawn = true; } else r.boolean();
  if (version >= 251) {
    if (r.boolean()) flags.unlockedMerchantSpawn = true;
    if (r.boolean()) flags.unlockedDemolitionistSpawn = true;
    if (r.boolean()) flags.unlockedPartyGirlSpawn = true;
    if (r.boolean()) flags.unlockedDyeTraderSpawn = true;
    if (r.boolean()) flags.unlockedTruffleSpawn = true;
    if (r.boolean()) flags.unlockedArmsDealerSpawn = true;
    if (r.boolean()) flags.unlockedNurseSpawn = true;
    if (r.boolean()) flags.unlockedPrincessSpawn = true;
  } else { for (let i = 0; i < 8; i++) r.boolean(); }
  // ★SW-FX11（2026-09-10）键域归一：combatBook 家族三键曾落 wld 旧短键
  //  {combatBook,combatBook2,peddler}，而运行时消费面（Game.ts:38711 TRAINING_DAY 进度/
  //  :15562 使用侧/:35811 旅商股票+1）与使用侧写点（Game.ts:13674/:15562）读
  //  {combatBookWasUsed,combatBookVolumeTwoWasUsed,peddlersSatchelUsed}——导入域与
  //  消费域断链：导入书已用世界=进度门/旅商股票丢失,自建用书世界导出=真值丢失。
  //  归一到运行时键（原版字段名 NPC.combatBookWasUsed 等,WF:1386/:1413-1414）。
  if (version >= 259) { if (r.boolean()) flags.combatBookVolumeTwoWasUsed = true; } else r.boolean();   // combatBookVolumeTwoWasUsed
  if (version >= 260) { if (r.boolean()) flags.peddlersSatchelUsed = true; } else r.boolean();          // peddlersSatchelWasUsed
  if (version >= 261) {
    if (r.boolean()) flags.unlockedSlimeGreenSpawn = true;
    if (r.boolean()) flags.unlockedSlimeOldSpawn = true;
    if (r.boolean()) flags.unlockedSlimePurpleSpawn = true;
    if (r.boolean()) flags.unlockedSlimeRainbowSpawn = true;
    if (r.boolean()) flags.unlockedSlimeRedSpawn = true;
    if (r.boolean()) flags.unlockedSlimeYellowSpawn = true;
    if (r.boolean()) flags.unlockedSlimeCopperSpawn = true;
  } else { for (let i = 0; i < 7; i++) r.boolean(); }
  if (version >= 264) { fastForwardTimeToDusk = r.boolean(); moondialCooldown = r.u8(); } // WF:2449-2450
  // ★R16-1：forceHalloween/XMas Forever（v287,WF57:2471-2472）+ 吸血鬼/感染（v288/296）
  if (version >= 287) {
    if (r.boolean()) flags.forceHalloweenForever = true;
    if (r.boolean()) flags.forceXMasForever = true;
  } else { r.boolean(); r.boolean(); }
  // ★SW-FX11（2026-09-10）域归一：vampireSeed/infectedSeed 曾落 flags.vampire/flags.infected
  //  （全仓零消费面），而真实消费面读 seedFlags.vampireSeed/infectedSeed（SeedFlags 注册码,
  //  Player.ts:8384 电池/SceneMetrics.ts:346 感染/Game.ts:28853/mainFlow.ts:218/UI.ts:4534/
  //  Sfx.ts:519）→ 导入吸血鬼/净化种子世界=全部种子特性失效。原版该二位本就是种子衍生旗
  //  （WF:1426-1427 写 Main.vampireSeed/infectedSeed;种子文本注册 WorldGen.cs:411 侧亦置位）,
  //  与 WldImport seedFlags 合流(:837-842)同域。
  if (version >= 288) { if (r.boolean()) seedFlags.vampireSeed = true; } else r.boolean();  // vampireSeed
  if (version >= 296) { if (r.boolean()) seedFlags.infectedSeed = true; } else r.boolean(); // infectedSeed
  // ★SW-FX43：_tempMeteorShowerCount 捕获（v291 门,WF:1428 写/:2496 读 → :177 回灌
  //  WorldGen.meteorShowerCount）;_tempCoinRain（WF:1429/:2498→Main.coinRain :178）
  //  本仓不建模仍读位即弃（导出恒 0,登记债）
  const meteorShowerCount = version >= 291 ? r.i32() : 0;
  if (version >= 291) r.i32();
  if (version >= 297) {
    if (r.boolean()) flags.teamBasedSpawnsSeed = true;                                     // WF57:2507
    const n = r.u8();
    for (let i = 0; i < n; i++) { r.i16(); r.i16(); }                                      // ExtraSpawnPointManager
  }
  if (version >= 304 && r.boolean()) seedFlags.dualDungeons = true; // WF57:1432 写/:2515 读
  // v323 起尾接 moreLightning/noLightning 两布尔（WF57:1433-1434 写/:2516-2517 读）——
  // R4-9：缺读会使 manifest 从错误偏移解出（varint 长度解出乱码串），两旗标导入即丢
  if (version >= 323) {
    if (r.boolean()) seedFlags.moreLightning = true;
    if (r.boolean()) seedFlags.noLightning = true;
  }
  if (version >= 299 && version < 313) r.u32();
  // ★SW-FX43：manifest 串捕获（v299,WF:1436 写/:2523 读;台账导出曾恒写 ''——
  //  WorldManifest.cs:31-45 容错域合法但导入档漂移）
  const manifest = version >= 299 ? r.string() : '';

  // ---- tiles ----
  if (pointers.length < 5) throw new WldParseError('section 数量不足，不是有效的 1.4 世界文件');
  r.seek(pointers[1]);
  const tiles = decodeTiles(r, tilesWide, tilesHigh, version, frameImportant);

  // ---- chests ----
  r.seek(pointers[2]);
  const chests: WldChest[] = [];
  {
    const total = r.i16();
    let maxItems = 40;
    if (version < 294) maxItems = r.i16();
    for (let i = 0; i < total; i++) {
      const x = r.i32(), y = r.i32();
      const name = r.string();
      if (version >= 294) maxItems = r.i32();
      const items: Array<{ id: number; stack: number } | null> = [];
      for (let s = 0; s < maxItems; s++) {
        const stack = r.i16();
        if (stack > 0) {
          const id = r.i32();
          r.u8(); // prefix
          items.push({ id, stack });
        } else if (stack < 0) {
          // ★R16-8（WF57:2776-2781）：负 stack 分支仍消费 type+prefix 两段
          //  （vanilla 写侧恒钳 stack>=1 不产生;TEdit/第三方工具可能写出——
          //  曾不消费 → 本箱之后所有箱子错位解析）。netDefaults+Prefix,stack=1。
          const id = r.i32();
          r.u8(); // prefix
          items.push({ id, stack: 1 });
        } else {
          items.push(null);
        }
      }
      chests.push({ x, y, name, items });
    }
  }

  // ---- signs（★R16-2：pointers[3] LoadSigns WF57:2841-2885——曾直 seek pointers[4]）----
  r.seek(pointers[3]);
  const signs: Array<{ text: string; x: number; y: number }> = [];
  {
    const n = r.i16();
    for (let i = 0; i < n; i++) {
      const text = r.string();
      const x = r.i32(), y = r.i32();
      signs.push({ text, x, y });
    }
  }

  // ---- npcs ----
  r.seek(pointers[4]);
  const npcs: WldNPC[] = [];
  const shimmered: number[] = [];
  const pillarNpcs: Array<{ id: number; x: number; y: number }> = [];
  {
    if (version >= 268) {
      // ★SW-FX11（2026-09-10）：ShimmeredTownNPCs 名单捕获（WF:1712-1720 Save /
      //  :2899-2906 Load——i32 数量 × i32 NPC type id）。曾读位即弃 → 微光城镇化
      //  NPC 导入后微光变体丢失
      const n = r.i32();
      for (let i = 0; i < n; i++) shimmered.push(r.i32());
    }
    while (r.boolean()) {
      const spriteId = version >= 190 ? r.i32() : 0;
      if (version < 190) r.string();
      const displayName = r.string();
      const x = r.f32(), y = r.f32();
      // ★homeless 不能丢（2026-08-31）：原版无家 NPC 的 homeTile 并非恒 -1——
      //   SetDefaults 复位是 -1（NPC.cs:8542-8545），但换人/驱逐等链
      //   （WorldGen.cs:2214-2217 换人 NewNPC 142 等）会带着正值 homeTile 置
      //   homeless=true；仅凭 homeX>=0 判"已入住"会把无家者错判成有房
      const homeless = r.boolean();
      const homeX = r.i32(), homeY = r.i32();
      if (version >= 213) {
        const flag = r.u8();
        if (flag & 1) r.i32();
      }
      // homelessDespawn（WorldFile.cs:2931-2933 v315+）——★SW-BO1 起透传不再弃
      const homelessDespawn = version >= 315 ? r.boolean() : false;
      npcs.push({ spriteId, name: displayName, x, y, homeX, homeY, homeless, homelessDespawn });
    }
    // ★SW-FX11（2026-09-10）：SavesAndLoads 非城镇 NPC 段（v>=140 门,WF:1744-1755
    //  Save / :2937-2955 Load——bool true → i32 netID + f32×2 position 循环,bool false
    //  终止）。集合成员=NPCID.Sets.SavesAndLoads（NPCID.cs:4807 CreateBoolSet(422,
    //  507,517,493)）=天界四塔。曾整段跳过（无害于流位——TileEntities 段按 pointers[5]
    //  重定位）→ 导入天界入侵中途档塔实体消失,updateLunarApocalypse 首帧全灭塔旗,
    //  四塔齐无 398 时误启 ImpendingDoom 倒计时。position=实体左上角像素。
    if (version >= 140) {
      while (r.boolean()) {
        const id = version >= 190 ? r.i32() : 0;
        if (version < 190) r.string();   // NPCID.FromLegacyName（旧档形态,保流位）
        const x = r.f32(), y = r.f32();
        pillarNpcs.push({ id, x, y });
      }
    }
  }

  // ---- TileEntities（★七批备案④-c：pointers[5] 段,v>=122 门；段不存在/pointers
  //      缺位（第三方工具少写段）=静默略过,绝不影响前序段解析）----
  const tileEntities: WldTileEntity[] = [];
  let teSkipped = 0;
  if (version >= 122 && pointers.length >= 7 && pointers[5] > 0 && pointers[6] > pointers[5]) {
    const te = decodeTileEntities(r, version, pointers[5], pointers[6]);
    tileEntities.push(...te.list);
    teSkipped = te.skipped;
  }

  // ---- 按压压力板（★SW-FX11 2026-09-10：pointers[6] 段,WF:3374-3386 Save /
  //      :3388-3398 Load——i32 数量 × (i32 x, i32 y)。原版语义=读档首拍逐位置
  //      PokeLocation→Wiring.HitSwitch 一次性重触发后清空（PressurePlateHelper.cs:
  //      19-31/:156-164）——存档点恰站压力板时,接线机关重载应响一次。曾整段跳过）----
  const pressurePlates: Array<{ x: number; y: number }> = [];
  if (pointers.length >= 8 && pointers[6] > 0 && pointers[7] > pointers[6]) {
    r.seek(pointers[6]);
    const n = r.i32();
    for (let i = 0; i < n && r.pos + 8 <= pointers[7]; i++) {
      pressurePlates.push({ x: r.i32(), y: r.i32() });
    }
  }

  // ---- 城镇房间表（★SW-FX35：pointers[7] 段,v>=189 门 WF:1830-1836；本仓支持域
  //      恒过门。TownRoomManager.cs:94-106 Save/:108-121 Load——i32 n + n×
  //      (i32 npcType, i32 roomX, i32 roomY)。原版语义=TownManager 房间预留表
  //      （Load 后 _hasRoom[npcType]=true, homeless NPC 的房间不重分配）。曾整段跳过）----
  const townRooms: Array<{ npc: number; x: number; y: number }> = [];
  if (pointers.length >= 9 && pointers[7] > 0 && pointers[8] > pointers[7]) {
    r.seek(pointers[7]);
    const n = r.i32();
    for (let i = 0; i < n && r.pos + 12 <= pointers[8]; i++) {
      townRooms.push({ npc: r.i32(), x: r.i32(), y: r.i32() });
    }
  }

  // ---- 图鉴三桶（★SW-FX35：pointers[8] 段,v>=210 门 WF:1838-1846 恒过。
  //      SaveBestiary WF:3411-3416 → BestiaryUnlocksTracker.Save（BestiaryUnlocksTracker.cs:
  //      14-19）序 = Kills→Sights→Chats：
  //        Kills  = i32 n + n×(string persistentId, i32 count)（NPCKillsTracker.cs:60-71）
  //        Sights = i32 n + n×string（NPCWasNearPlayerTracker.cs:65-76）
  //        Chats  = i32 n + n×string（NPCWasChatWithTracker.cs:54-65）
  //      persistentId 域 = NPCID.Search.GetName(netID) == 本仓 bestiaryCreditId（vanilla
  //      persistentId 直存,与 data/Bestiary.ts BestiarySave {k,s,c} 同构）。曾整段跳过）----
  const bestiary: { k: Record<string, number>; s: string[]; c: string[] } = { k: {}, s: [], c: [] };
  if (pointers.length >= 10 && pointers[8] > 0 && pointers[9] > pointers[8]) {
    try {
      r.seek(pointers[8]);
      const nK = r.i32();
      for (let i = 0; i < nK && r.pos < pointers[9]; i++) bestiary.k[r.string()] = r.i32();
      const nS = r.i32();
      for (let i = 0; i < nS && r.pos < pointers[9]; i++) bestiary.s.push(r.string());
      const nC = r.i32();
      for (let i = 0; i < nC && r.pos < pointers[9]; i++) bestiary.c.push(r.string());
    } catch { /* 脏段容错：保已解析桶（footer 由 pointer 重定位,不影响前段） */ }
  }

  // ---- 旅程力量 per-world 段（★SW-FX35：pointers[9] 段,v>=220 门 WF:1848-1856 恒过。
  //      SaveCreativePowers WF:3427-3432 → CreativePowerManager.SaveToWorld（
  //      CreativePowerManager.cs:125-137）：while 读 bool true + u16 id + 负载,
  //      bool false 终止；LoadFromWorld :139-155 按 id 分派。per-world 六力：
  //        0 FreezeTime bool（CreativePowers.cs:1465-1468）/ 8 ModifyTimeRate f32 滑杆
  //        缓存 0-1（:972-975）/ 9 FreezeRain bool（:1533-1536）/ 10 FreezeWind bool
  //        （:1499-1502）/ 12 DifficultySlider f32 0-1（:1169-1172）/ 13 StopBiomeSpread
  //        bool（:1567-1570）。键力 1-4 与 per-player 力（5/11/14）不落世界段。
  //      未知 id：负载长度不可知 → 停止余段（vanilla 同 break）。曾整段跳过）----
  const creativePowers: Array<{ id: number; num?: number; bool?: boolean }> = [];
  if (pointers.length >= 11 && pointers[9] > 0 && pointers[10] > pointers[9]) {
    r.seek(pointers[9]);
    try {
      for (;;) {
        if (r.pos >= pointers[10]) break;
        if (!r.boolean()) break;
        const id = r.u16();
        if (id === 0 || id === 9 || id === 10 || id === 13) {
          creativePowers.push({ id, bool: r.boolean() });
        } else if (id === 8 || id === 12) {
          creativePowers.push({ id, num: r.f32() });
        } else {
          break;   // 未知 id（负载长度不可知）——与 vanilla LoadFromWorld break 同语义
        }
      }
    } catch { /* 脏段容错：保已解析力（footer 由 pointer 重定位,不影响前段） */ }
  }

  return {
    worldId, caveBackStyle, iceBackStyle, jungleBackStyle, hellBackStyle,
    // ★SW-FX43：header 身份/精度/入侵/沙暴/流星雨捕获面（接口注记见上）
    worldGenVersion, guid, creationTime, manifest, caveBackX,
    invasion: { delay: invDelay, size: invSize, type: invType, x: invX, sizeStart: invasionSizeStart },
    sandstorm, meteorShowerCount,
    version, title, seed, tilesWide, tilesHigh, spawnX, spawnY, dungeonX, dungeonY,
    groundLevel, rockLevel, time, dayTime, moonType, moonPhase, bloodMoon, eclipse,
    isCrimson, hardMode, gameMode,
    shadowOrbCount, altarCount, savedOreTiers,
    oreTiersPH,
    sundialCooldown, cultistDelay, fastForwardTimeToDawn, fastForwardTimeToDusk, moondialCooldown,
    bannerKills,
    treeX, treeStyle, treeTops,
    tiles, chests, npcs, signs, flags,
    shimmered, pillarNpcs, pressurePlates,
    party, lantern,
    anglerQuest, anglerWhoFinishedToday,
    bgMushroom, bgUnderworld, bg10, bg11, bg12,
    treeBG1, treeBG2: bg10, treeBG3: bg11, treeBG4: bg12, corruptBG, jungleBG, snowBG, hallowBG, crimsonBG, desertBG, oceanBG,
    tileEntities, teSkipped, townRooms, bestiary, creativePowers,
    weather: { raining, rainTime, maxRaining, cloudBGActive, numClouds, windSpeedTarget, slimeRainTime },
    seedFlags,
  };
}

/** TileEntities 段解码（★七批备案④-c 2026-09-02）。
 *  布局定谳（全部亲读 1.4.5.7 反编译源）：
 *   - 段位=pointers[5]（SaveWorld_Version2 段序 WF:1156-1174：header/tiles/chests/
 *     signs/npcs/TileEntities/pressurePlates/townManager/bestiary/creativePowers），
 *     版本门= v>=122 走 LoadTileEntities（WF:1803-1821；116-121 旧档走 LoadDummies）；
 *   - SaveTileEntities（WF:3317-3327）：i32 数量 × TileEntity.Write（TileEntity.cs:173-177：
 *     type byte → WriteInner :188-197：ID i32（networkSend=false 恒写）+ X i16 + Y i16 +
 *     WriteExtraData）；Load 侧 WF:3330-3345 同序读 + 同位后写覆盖（:3339-3342）+
 *     越界/CheckValidTile 淘汰（:3349-3356）；
 *   - TEType 序 = TileEntitiesManager.RegisterAll（TileEntitiesManager.cs:26-39），
 *     ExtraData 逐类（写入序反向读）：
 *      0 假人 short npc（TETrainingDummy.cs:119-127）
 *      1 物品框 (short,byte,short)（TEItemFrame.cs:40-53）
 *      2 逻辑传感器 byte+bool（TELogicSensor.cs:381-395，文件恒写）
 *      3 模特 位图×2+[v307+]pose+[v308+]misc位图+三元组×N（TEDisplayDoll.cs:157-278；
 *        v311 特例：equip[8] 移到 misc 之后读 :230-235/:271-277）
 *      4 武器架 (short,byte,short)（TEWeaponsRack.cs:54-67）
 *      5 帽架 位图(bit0-1=hat,bit2-3=dye)+三元组×N（TEHatRack.cs:56-111）
 *      6 食物盘 (short,byte,short)（TEFoodPlatter.cs:41-46）
 *      7 晶塔 无（TETeleportationPylon 无 WriteExtraData 覆写）
 *      8 展示罐 (short,byte,short)（TEDeadCellsDisplayJar.cs:40-45）
 *      9/10 风筝桩/小动物桩 short itemType（★SW-FX35 勘误：继承
 *        TELeashedEntityAnchorWithItem.WriteExtraData/ReadExtraData :9-17，
 *        TEdit TileEntity.cs:414-417 互证；空桩写 0）
 *  容错：未知 type 的 ExtraData 长度不可知（流无法重同步；vanilla GenerateInstance
 *  返 null 会 NRE）→ 中止余段+计数；读越界 → 保已解析部分（本段在 npcs 之后，
 *  失败不回波既有段）。 */
function decodeTileEntities(r: BinaryReaderLE, version: number, start: number, end: number): { list: WldTileEntity[]; skipped: number } {
  const list: WldTileEntity[] = [];
  let skipped = 0;
  try {
    r.seek(start);
    const total = r.i32();
    // 单槽三元组（TEWeaponsRack/TEItemFrame/TEFoodPlatter/TEDeadCellsDisplayJar 同构）
    const triplet = (): WldTeItem => ({ vid: r.i16(), prefix: r.byte(), stack: r.i16() });
    const live = (it: WldTeItem): WldTeItem | null => (it.vid > 0 && it.stack > 0 ? it : null);
    for (let i = 0; i < total; i++) {
      if (r.pos > end) { skipped += total - i; break; }   // 脏 count 越段守卫（正常档恒不触发）
      const teType = r.byte();
      const teId = r.i32();
      const tx = r.i16();
      const ty = r.i16();
      if (teType === 4 || teType === 1 || teType === 6 || teType === 8) {
        list.push({ type: teType, id: teId, x: tx, y: ty, item: live(triplet()) });
      } else if (teType === 9 || teType === 10) {
        // ★SW-FX35 定谳勘误：锚桩 ExtraData = short itemType（TELeashedEntityAnchorWithItem.cs:9-12
        //  WriteExtraData/ReadExtraData :14-17；TEdit TileEntity.cs:414-417 互证）。
        //  旧版按「无负载」跳过 → 流错位（vanilla 恒写该 short，空桩写 0）
        const vid = r.i16();
        list.push({ type: teType, id: teId, x: tx, y: ty, item: vid > 0 ? { vid, prefix: 0, stack: 1 } : null });
      } else if (teType === 0) {
        // 训练假人：short npc（TETrainingDummy.cs:119-127；-1=无假人实体）
        list.push({ type: 0, id: teId, x: tx, y: ty, dummy: { npc: r.i16() } });
      } else if (teType === 2) {
        // 逻辑传感器：byte logicCheck + bool on（TELogicSensor.cs:381-395，文件恒写）
        list.push({ type: 2, id: teId, x: tx, y: ty, sensor: { logicCheck: r.byte(), on: r.boolean() } });
      } else if (teType === 7) {
        // 晶塔：无 ExtraData（TETeleportationPylon 无 WriteExtraData 覆写——
        //  塔型=tile 597 frameX/54 样式,运行时面 TeleportPylons.ts 按 tile 扫描）
        list.push({ type: 7, id: teId, x: tx, y: ty });
      } else if (teType === 3) {
        const bEquip = r.byte();
        const bDye = r.byte();
        const pose = version >= 307 ? r.byte() : 0;
        let b3 = 0;
        let v311Tail = false;                  // v311 特例旗：equip[8] 移到 misc 之后
        if (version >= 308) {
          b3 = r.byte();
          if (version === 311 && (b3 & 2)) { b3 &= ~2; v311Tail = true; }   // :231-235
        }
        const read9 = (lo: number, hiBit: number): Array<WldTeItem | null> => {
          const mask = lo | (b3 & hiBit ? 256 : 0);
          const out: Array<WldTeItem | null> = [];
          for (let s = 0; s < 9; s++) out.push((mask >> s) & 1 ? live(triplet()) : null);
          return out;
        };
        const equip = read9(bEquip, 2);        // bit1=equip[8]（v311 已清）
        const dyes = read9(bDye, 4);           // bit2=dyes[8]
        let misc: WldTeItem | null = null;
        if (b3 & 1) misc = live(triplet());    // bit0=misc[0]
        if (v311Tail) equip[8] = live(triplet());   // :271-277 尾读
        list.push({ type: 3, id: teId, x: tx, y: ty, doll: { equip, misc, dyes, pose } });
      } else if (teType === 5) {
        const mask = r.byte();
        const hats: Array<WldTeItem | null> = [];
        for (let s = 0; s < 2; s++) hats.push((mask >> s) & 1 ? live(triplet()) : null);
        const dyes: Array<WldTeItem | null> = [];
        for (let s = 0; s < 2; s++) dyes.push((mask >> (s + 2)) & 1 ? live(triplet()) : null);
        list.push({ type: 5, id: teId, x: tx, y: ty, hat: { hats, dyes } });
      }
      else { skipped += total - i; break; }                                   // 未知 type → 余段放弃
    }
  } catch {
    // 读越界（脏档/工具错写）——TE 段在 npcs 之后，保已解析部分即可（不回波既有段）
  }
  return { list, skipped };
}

/** tiles 段解码：列优先 + header 链 + RLE */
function decodeTiles(
  r: BinaryReaderLE, w: number, h: number,
  version: number, frameImportant: boolean[],
): WldTileData {
  const n = w * h;
  const active = new Uint8Array(n);
  const type = new Uint16Array(n);
  const frameX = new Uint16Array(n);
  const frameY = new Uint16Array(n);
  const wall = new Uint16Array(n);
  const liquid = new Uint8Array(n);
  const liquidType = new Uint8Array(n);
  const wire = new Uint8Array(n);
  const half = new Uint8Array(n);
  const slope = new Uint8Array(n);
  const paint = new Uint8Array(n);
  const paintWall = new Uint8Array(n);
  const coat = new Uint8Array(n);
  const halfBits = half, slopeBits = slope; // 半砖/坡面解码目标

  let idx = 0; // y * w + x，列优先推进
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const header1 = r.u8();
      let header2 = 0, header3 = 0, header4 = 0;
      if (header1 & 0x01) header2 = r.u8();
      if (header2 & 0x01) header3 = r.u8();
      // header4 = 涂层字节（WorldFile.cs:2659-2677 读侧 b3：bit1(2) invisibleBlock/
      //  bit2(4) invisibleWall/bit3(8) fullbrightBlock/bit4(16) fullbrightWall；
      //  写侧 :1539-1552 同位。269+ 才有该字节——旧版无涂层域）
      if (version >= 269 && header3 & 0x01) header4 = r.u8();

      let tileType = 0;
      let fx = 0, fy = 0;
      let tilePaint = 0;
      if (header1 & 0x02) {
        // active
        if (header1 & 0x20) {
          tileType = r.u16();
        } else {
          tileType = r.u8();
        }
        const isFramed = tileType < frameImportant.length ? frameImportant[tileType] : true;
        if (isFramed) {
          fx = r.u16();
          fy = r.u16();
          // ★R16-9②（WF57:2575-2578）：tile 144（Timers）frameY 强制归 0
          if (tileType === 144) fy = 0;
        }
        if (header3 & 0x08) tilePaint = r.u8(); // tile color（WorldFile.cs:2571-2574）
      }
      let wl = 0;
      let wallPaint = 0;
      let wallHiPending = false;
      if (header1 & 0x04) {
        wl = r.u8();
        if (header3 & 0x10) wallPaint = r.u8(); // wall color（WorldFile.cs:2583-2586）
        // ★红队复核勘误(2026-09-07):墙高字节的流位在 **liquid 之后**(原版读侧
        //  cs:2663-2665 在 b2>1 块尾;写侧 SaveTile num3 流水同理)——曾在此处读,
        //  与原版流位互换(wall>255 且带液体的格:液量被当高字节、墙被钳 0)
        wallHiPending = version >= 222 && (header3 & 0x40) !== 0;
        // ★R16-9①（WF57:2593-2596）：墙 id 越界归 0（WallID.Count=367）——
        //  脏档/第三方工具写出越界 id 曾直存 → 渲染/存档侧未定义行为
        if (wl >= 367) wl = 0;
      }
      // 电路位（1456/1405 同布局,WorldFile.cs:2610-2656）：header2 0x02红/0x04蓝/0x08绿,
      // header3 0x02致动器/0x04已致动/0x20黄线（1.4 起致动器与黄线在 header3;
      // 旧写法 0x3E>>1 是 1.3 布局——0x10/0x20 已是 half/slope 位,会漏进黄线/致动器）
      let wireBits = (header2 & 0x0E) >> 1;
      if (header3 & 0x02) wireBits |= 0x10; // 致动器
      if (header3 & 0x04) wireBits |= 0x20; // 已致动(inActive)
      if (header3 & 0x20) wireBits |= 0x08; // 黄线
      // half/slope(WorldFile.cs:1519):(header2 >> 4) & 7 → 1=半砖,2-5=slope1-4
      const blockBits = (header2 >> 4) & 7;
      const blockHalf = blockBits === 1 ? 1 : 0;
      const blockSlope = blockBits >= 2 && blockBits <= 5 ? blockBits - 1 : 0;
      const lqType = (header1 & 0x18) >> 3;
      let lqAmount = 0, lqKind = 0;
      if (lqType !== 0) {
        lqAmount = r.u8();
        // ★R16-3（2026-08-24）：微光位（header3 0x80,WF57:2606-2609 读侧
        //  `(b2 & 0x80)==128 → tile.shimmer(true)`,液型位保持 1=水）→ 本仓
        //  store 编码 4=微光（serialize.ts:118）——曾折成 1(水)丢弃 → 1.4.4+
        //  存档微光池导入后全变普通水且不可逆（再存档即真水）。
        lqKind = (version >= 269 && header3 & 0x80) ? 4 : lqType;
      }
      // ★墙高字节合并(原版读侧 cs:2663-2665,liquid 之后——红队复核勘误同款移位)
      if (wallHiPending) {
        wl |= r.u8() << 8;
        if (wl >= 367) wl = 0;
      }
      // RLE 计数
      const rleStorage = (header1 & 0xC0) >> 6;
      let rle = 0;
      if (rleStorage === 1) rle = r.u8();
      else if (rleStorage >= 2) rle = r.u16();

      // 写入本格 + RLE 重复格（列优先向下）
      for (let k = 0; k <= rle && y + k < h; k++) {
        const i = (y + k) * w + x;
        active[i] = (header1 & 0x02) ? 1 : 0;
        type[i] = tileType;
        frameX[i] = fx;
        frameY[i] = fy;
        wall[i] = wl;
        liquid[i] = lqAmount;
        liquidType[i] = lqKind;
        wire[i] = wireBits;
        half[i] = blockHalf;
        slope[i] = blockSlope;
        paint[i] = tilePaint;
        paintWall[i] = wallPaint;
        coat[i] = header4 & 30;   // 涂层四位（WF:2659-2677；&30 = 2|4|8|16 位域钳脏数据）
      }
      y += rle;
    }
  }
  void idx;
  return { active, type, frameX, frameY, wall, liquid, liquidType, wire, half, slope, paint, paintWall, coat };
}
