// .wld 地图解析器（Terraria 1.4+，version >= 210）
// 格式参考 TEdit（Terraria-Map-Editor）的 World.FileV2.cs，此处为独立 TS 实现。
// 只支持读取：section header / header flags / tiles（RLE）/ chests / town npcs。
// bestiary 等尾部 section 通过 sectionPointers 跳过，不做 footer 校验。
import { BinaryReaderLE } from './BinaryReaderLE';

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
}

export interface WldChest { x: number; y: number; name: string; items: Array<{ id: number; stack: number } | null>; }
export interface WldNPC { spriteId: number; name: string; x: number; y: number; homeX: number; homeY: number; }

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
}

export class WldParseError extends Error {}

export function parseWld(buf: Uint8Array): WldWorld {
  const r = new BinaryReaderLE(buf);
  const version = r.u32();
  if (version < 210) {
    throw new WldParseError(`不支持的世界文件版本 ${version}（需要 1.4+，version >= 210）。请在游戏中重新保存该地图。`);
  }
  if (version >= 140) {
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
  if (version >= 179) {
    seed = version === 179 ? String(r.i32()) : r.string();
    r.u64(); // worldGenVersion
  }
  if (version >= 181) r.bytes(16); // guid
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
  if (version >= 209) {
    gameMode = r.i32();
    if (version >= 222) r.boolean(); // drunk
    if (version >= 227) r.boolean(); // good
    if (version >= 238) r.boolean();
    if (version >= 239) r.boolean();
    if (version >= 241) r.boolean();
    if (version >= 249) r.boolean(); // remix
    if (version >= 266) r.boolean(); // notraps
    if (version >= 267) r.boolean(); // zenith
    if (version >= 302) r.boolean(); // skyblock
  } else if (version === 208 || version >= 112) {
    r.boolean();
  }
  if (version >= 141) r.i64(); // creationTime
  if (version >= 284) r.i64(); // lastPlayed
  const moonType = r.u8(); // moonType
  const treeX = [r.i32(), r.i32(), r.i32()];       // 世界横向 4 区分界（树样式用）
  let treeTops: number[] = [];                    // TreeTops 13 区域变体（v≥211 优先于 header treeStyle）
  const treeStyle = [r.i32(), r.i32(), r.i32(), r.i32()]; // 各区森林树样式
  for (let i = 0; i < 3; i++) r.i32(); // caveBackX
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
  for (let i = 0; i < 10; i++) r.boolean(); // downed bosses
  if (version >= 118) r.boolean(); // slime king
  for (let i = 0; i < 7; i++) r.boolean(); // saved goblin etc
  r.boolean(); r.boolean(); // orb smashed / spawn meteor
  const shadowOrbCount = r.u8(); // WF:1302 shadowOrbCount(byte)
  const altarCount = r.i32(); // WF:1303 altarCount(int32)
  const hardMode = r.boolean();
  if (version >= 257) r.boolean(); // party of doom
  r.i32(); r.i32(); r.i32(); r.f64(); // invasion
  const slimeRainTime = version >= 118 ? r.f64() : 0; // slime rain（Main.slimeRainTime：>0 进行中 <0 冷却）
  if (version >= 113) sundialCooldown = r.u8(); // WF:2120 Main.sundialCooldown
  const raining = r.boolean(); const rainTime = r.i32(); const maxRaining = r.f32(); // rain
  // WF:1315-1317 SavedOreTiers 三档锁定选种（int32×3）——原版 .wld 权威导入
  const savedOreTiers = { cobalt: r.i32(), mythril: r.i32(), adamantite: r.i32() };
  for (let i = 0; i < 8; i++) r.u8(); // bg styles
  const cloudBGActive = r.i32(); const numClouds = r.i16(); const windSpeedTarget = r.f32(); // clouds/wind
  // angler
  {
    const n = r.i32();
    for (let i = 0; i < n; i++) r.string();
  }
  r.boolean(); // savedAngler
  r.i32(); // anglerQuest
  r.boolean(); // savedStylist
  if (version >= 140) r.boolean(); // tax collector
  if (version >= 201) r.boolean(); // golfer
  if (version >= 107) r.i32(); // invasionSizeStart
  const cultistDelay = version >= 108 ? r.i32() : 86400; // WF:2185-2192（缺省=delayStart，同 CultistRitual.cs:7）

  // banners
  {
    const n = r.i16();
    for (let i = 0; i < n; i++) r.i32();
    if (version >= 289) {
      const m = r.i16();
      for (let i = 0; i < m; i++) r.u16();
    }
  }
  if (version >= 140) fastForwardTimeToDawn = r.boolean(); // WF:2203
  r.boolean(); // fishron
  if (version >= 140) { r.boolean(); r.boolean(); r.boolean(); } // martians/cultist/moonlord
  for (let i = 0; i < 5; i++) r.boolean(); // holiday bosses
  for (let i = 0; i < 4; i++) r.boolean(); // celestial downed
  for (let i = 0; i < 4; i++) r.boolean(); // celestial active
  r.boolean(); // apocalypse
  if (version >= 170) {
    r.boolean(); r.boolean(); r.i32();
    const n = r.i32();
    for (let i = 0; i < n; i++) r.i32();
  }
  if (version >= 174) { r.boolean(); r.i32(); r.f32(); r.f32(); }
  if (version >= 178) { r.boolean(); r.boolean(); r.boolean(); r.boolean(); }
  if (version > 194) r.u8(); // mushroom bg
  if (version >= 215) r.u8(); // underworld bg
  if (version >= 195) { r.u8(); r.u8(); r.u8(); }
  if (version >= 204) r.boolean(); // combat book
  if (version >= 207) { r.i32(); r.boolean(); r.boolean(); r.boolean(); }
  if (version >= 211) {
    // TreeTops 变体表（WorldGen.TreeTops.Load：13 个区域树样式，v≥211 世界用这个）
    const n = r.i32();
    treeTops = [];
    for (let i = 0; i < n; i++) treeTops.push(r.i32());
  }
  if (version >= 212) { r.boolean(); r.boolean(); }
  if (version >= 216) { r.i32(); r.i32(); r.i32(); r.i32(); }
  if (version >= 217) { r.boolean(); r.boolean(); r.boolean(); }
  if (version >= 223) { r.boolean(); r.boolean(); }
  if (version >= 240) r.boolean();
  if (version >= 250) r.boolean();
  if (version >= 251) { for (let i = 0; i < 8; i++) r.boolean(); }
  if (version >= 259) r.boolean();
  if (version >= 260) r.boolean();
  if (version >= 261) { for (let i = 0; i < 7; i++) r.boolean(); }
  if (version >= 264) { fastForwardTimeToDusk = r.boolean(); moondialCooldown = r.u8(); } // WF:2449-2450
  if (version >= 287) { r.boolean(); r.boolean(); }
  if (version >= 288) r.boolean();
  if (version >= 296) r.boolean();
  if (version >= 291) { r.i32(); r.i32(); }
  if (version >= 297) {
    r.boolean();
    const n = r.u8();
    for (let i = 0; i < n; i++) { r.i16(); r.i16(); }
  }
  if (version >= 304) r.boolean();
  if (version >= 299 && version < 313) r.u32();
  if (version >= 299) r.string(); // manifest

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
        } else {
          items.push(null);
        }
      }
      chests.push({ x, y, name, items });
    }
  }

  // ---- npcs ----
  r.seek(pointers[4]);
  const npcs: WldNPC[] = [];
  {
    if (version >= 268) {
      const n = r.i32();
      for (let i = 0; i < n; i++) r.i32();
    }
    while (r.boolean()) {
      const spriteId = version >= 190 ? r.i32() : 0;
      if (version < 190) r.string();
      const displayName = r.string();
      const x = r.f32(), y = r.f32();
      r.boolean(); // homeless
      const homeX = r.i32(), homeY = r.i32();
      if (version >= 213) {
        const flag = r.u8();
        if (flag & 1) r.i32();
      }
      if (version >= 315) r.boolean();
      npcs.push({ spriteId, name: displayName, x, y, homeX, homeY });
    }
  }

  return {
    worldId, caveBackStyle, iceBackStyle, jungleBackStyle, hellBackStyle,
    version, title, seed, tilesWide, tilesHigh, spawnX, spawnY, dungeonX, dungeonY,
    groundLevel, rockLevel, time, dayTime, moonType, moonPhase, bloodMoon, eclipse,
    isCrimson, hardMode, gameMode,
    shadowOrbCount, altarCount, savedOreTiers,
    sundialCooldown, cultistDelay, fastForwardTimeToDawn, fastForwardTimeToDusk, moondialCooldown,
    treeX, treeStyle, treeTops,
    tiles, chests, npcs,
    weather: { raining, rainTime, maxRaining, cloudBGActive, numClouds, windSpeedTarget, slimeRainTime },
  };
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
  const halfBits = half, slopeBits = slope; // 半砖/坡面解码目标

  let idx = 0; // y * w + x，列优先推进
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const header1 = r.u8();
      let header2 = 0, header3 = 0, header4 = 0;
      if (header1 & 0x01) header2 = r.u8();
      if (header2 & 0x01) header3 = r.u8();
      if (version >= 269 && header3 & 0x01) header4 = r.u8();
      void header4;

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
        }
        if (header3 & 0x08) tilePaint = r.u8(); // tile color（WorldFile.cs:2571-2574）
      }
      let wl = 0;
      let wallPaint = 0;
      if (header1 & 0x04) {
        wl = r.u8();
        if (header3 & 0x10) wallPaint = r.u8(); // wall color（WorldFile.cs:2583-2586）
        if (version >= 222 && header3 & 0x40) {
          wl |= r.u8() << 8;
        }
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
        lqKind = (version >= 269 && header3 & 0x80) ? 1 : lqType;
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
      }
      y += rle;
    }
  }
  void idx;
  return { active, type, frameX, frameY, wall, liquid, liquidType, wire, half, slope, paint, paintWall };
}
