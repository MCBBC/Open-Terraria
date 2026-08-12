// 自有存档格式：JSON 外壳（人可读）+ RLE 二进制 tile 段（base64）
// 序列化纯核心在 ./serialize(无 DOM/World 依赖,主线程与 save.worker.ts 共用同一实现);
// 本文件保留 SaveData 类型/读档解码与主线程同步 saveGame(兼容入口,worker 不可用时回退)。
import type { World } from '../world/World';
import { World as WorldClass } from '../world/World';
import type { Player } from '../entities/Player';
import { serializeSave } from './serialize';
import type { SaveData, SaveStoreView, SaveMeta } from './serialize';
import { TILE_INTERNAL_OF_STABLE } from '../data/tiles';
import { ITEM_INTERNAL_OF_STABLE } from '../data/items';
import { weatherToSave } from '../world/weather/Weather';
import { applyLunarSave } from '../world/LunarEvent';
import { furnitureFromSave } from '../world/FurnitureItems';

export { bytesToB64, rlePairs, rleTiles, serializeSave } from './serialize';
export type { SaveData, SaveStoreView, SaveMeta } from './serialize';

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

function readVarint(u8: Uint8Array, pos: { i: number }): number {
  let v = 0, shift = 0;
  while (pos.i < u8.length) {
    const b = u8[pos.i++];
    v |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return v;
}

/** 主线程同步存档(兼容入口/worker 回退路径)。常规保存请走 SaveClient.saveAsync */
export function saveGame(world: World, player: Player, playTimeMs: number, townNpcs?: SaveData['npcs']): string {
  const st = world.store;
  const view: SaveStoreView = {
    type: st.type, flags: st.flags, frameX: st.frameX, frameY: st.frameY,
    wall: st.wall, liquid: st.liquid, liquidType: st.liquidType, wire: st.wire,
    half: st.half, slope: st.slope,
  };
  const meta: SaveMeta = {
    name: world.name, seed: world.seed, w: st.w, h: st.h,
    spawnX: world.spawnX, spawnY: world.spawnY,
    groundLevel: world.groundLevel, rockLevel: world.rockLevel, lavaLine: world.lavaLine,
    treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
    crimson: world.crimson, dungeonX: world.dungeonX, dungeonY: world.dungeonY, jungleX: world.jungleX,
    timeOfDay: world.clock.timeOfDay, dayCount: world.clock.dayCount,
    chests: world.chests, signs: world.signs, flags: world.flags,
    weather: weatherToSave(world.weather),
    invasion: { type: world.invasionType, size: world.invasionSize, sizeStart: world.invasionSizeStart,
      x: world.invasionX, delay: world.invasionDelay },
    altarCount: world.altarCount,   // WorldGen.altarCount（WorldFile.cs:1303/2100）
    bestiary: world.bestiary.toSave(),  // BestiaryUnlocksTracker（WorldFile.cs:3399）
    // 挂物族存放物（内部 id；serializeSave 内过稳定 id 表）
    // 挂物族存放物：内部 id 直传（serializeSave 内统一过稳定 id 表，与 chests 同路径）
    furniture: world.furnitureItems,
  };
  const playerData: SaveData['player'] = {
    hp: player.hp, x: player.x, y: player.y,
    inventory: player.inv.slots, selected: player.inv.selected,
    baseMaxHp: player.baseMaxHp, baseMaxMana: player.baseMaxMana, mana: player.mana,
    banks: player.banks,
    armor: player.inv.armor,
    dye: player.inv.dye,
    trash: player.inv.trash,
    miscEquips: player.inv.miscEquips,
    miscDyes: player.inv.miscDyes,
    loadouts: player.inv.loadouts,
    currentLoadout: player.inv.currentLoadout,
  };
  return serializeSave(view, meta, playerData, playTimeMs);
}

export function loadSave(json: string): ReturnType<typeof loadSaveData> {
  return loadSaveData(JSON.parse(json) as SaveData);
}

/** 服务器侧世界-only 存档（P3.1 持久化）：tile/箱子/clock/flags/天气，不含玩家/城镇NPC。
 *  player 字段以空壳占位（格式必填；语义上服务器档无玩家，加载方忽略）。
 *  注意：serializeSave 的幽灵净化会就地写 store——服务器存储由 setTileSilent/
 *  loadSaveData 保持 type/flags 一致，该循环为 no-op，活存储不受影响。 */
export function saveWorldOnly(world: World): string {
  const st = world.store;
  const view: SaveStoreView = {
    type: st.type, flags: st.flags, frameX: st.frameX, frameY: st.frameY,
    wall: st.wall, liquid: st.liquid, liquidType: st.liquidType, wire: st.wire,
    half: st.half, slope: st.slope,
  };
  const meta: SaveMeta = {
    name: world.name, seed: world.seed, w: st.w, h: st.h,
    spawnX: world.spawnX, spawnY: world.spawnY,
    groundLevel: world.groundLevel, rockLevel: world.rockLevel, lavaLine: world.lavaLine,
    treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
    crimson: world.crimson, dungeonX: world.dungeonX, dungeonY: world.dungeonY, jungleX: world.jungleX,
    timeOfDay: world.clock.timeOfDay, dayCount: world.clock.dayCount,
    chests: world.chests, signs: world.signs, flags: world.flags,
    weather: weatherToSave(world.weather),
    invasion: { type: world.invasionType, size: world.invasionSize, sizeStart: world.invasionSizeStart,
      x: world.invasionX, delay: world.invasionDelay },
    altarCount: world.altarCount,
    bestiary: world.bestiary.toSave(),  // BestiaryUnlocksTracker（WorldFile.cs:3399）
    // 挂物族存放物：内部 id 直传（serializeSave 内统一过稳定 id 表，与 chests 同路径）
    furniture: world.furnitureItems,
  };
  const placeholderPlayer: SaveData['player'] = {
    hp: 0, x: world.spawnX * 16, y: world.spawnY * 16,
    inventory: [], selected: 0,
  };
  return serializeSave(view, meta, placeholderPlayer, 0);
}

/** 直接从内存 SaveData 构建(导入 .wld 路径用——跳过 stringify→parse 双拷贝,
 *  2026-08 审计 #3:该往返单次 20~50MB×2) */
export function loadSaveData(data: SaveData): { world: World; player: SaveData['player'] } {
  // v3 物品稳定 id → internal(箱子/背包/储物就地重写;v2 旧档直读)
  const v3 = (data.version ?? 1) >= 3;
  const mapItem = (it: { id: number; stack: number } | null) =>
    it && v3 ? { id: it.id === 0 ? 0 : ITEM_INTERNAL_OF_STABLE.get(it.id) ?? 0, stack: it.stack } : it;
  const v3Chests = v3
    ? data.chests.map((c) => ({ x: c.x, y: c.y, items: c.items.map(mapItem) }))
    : data.chests;
  if (v3 && data.player) {
    data.player = {
      ...data.player,
      inventory: data.player.inventory.map(mapItem),
      banks: data.player.banks?.map((b) => b.map(mapItem)),
    };
  }
  const world = new WorldClass(data.header.width, data.header.height, data.header.seed, data.header.name);
  world.spawnX = data.header.spawn[0];
  world.spawnY = data.header.spawn[1];
  world.groundLevel = data.header.groundLevel;
  world.rockLevel = data.header.rockLevel;
  // 旧档缺 lavaLine（原版 UnderworldLayer = maxTilesY-200）
  world.lavaLine = data.header.lavaLine ?? data.header.height - 200;
  if (data.header.treeX) world.treeX = data.header.treeX;
  if (data.header.treeStyle) world.treeStyle = data.header.treeStyle;
  if (data.header.treeTops?.length) world.treeTops = data.header.treeTops;
  if (data.header.crimson !== undefined) world.crimson = data.header.crimson;
  if (data.header.dungeonX !== undefined) world.dungeonX = data.header.dungeonX;
  // dungeonY 缺省（旧档/导入）回退地表线：CheckToSpawnDungeonEnemies 的 pY<dungeonY+40 门槛近似成立
  if (data.header.dungeonY !== undefined && data.header.dungeonY > 0) world.dungeonY = data.header.dungeonY;
  else world.dungeonY = world.groundLevel;
  if (data.header.jungleX !== undefined) world.jungleX = data.header.jungleX;
  world.clock.timeOfDay = data.clock.timeOfDay;
  world.clock.dayCount = data.clock.dayCount;
  if (data.invasion) { // 入侵五元组回填（旧档缺省=无入侵）
    world.invasionType = data.invasion.type;
    world.invasionSize = data.invasion.size;
    world.invasionSizeStart = data.invasion.sizeStart;
    world.invasionX = data.invasion.x;
    world.invasionDelay = data.invasion.delay;
  }
  if (data.altarCount != null) world.altarCount = data.altarCount; // 旧档缺省 0
  world.applyBestiary(data.bestiary); // 图鉴三桶（旧档缺省=空）
  world.chests = data.chests;
  if (data.weather) world.applyWeather(data.weather); // 天气回填（旧档缺省=晴）
  world.flags = data.flags;
  // 星璇塔运行时态回填（WorldFile.cs:2220-2255 尾段：downedTower*/towerActive*/lunarApocalypseUp
  // 三类 bool 走 flags 落盘；盾值不存——TowerActive=true 读档重置满盾）
  applyLunarSave(world);
  if (data.signs) world.signs = data.signs;
  // 挂物族存放物（v3 稳定 id → 内部 id；未知 id 归 0 由 furnitureFromSave 置空槽）
  world.furnitureItems = furnitureFromSave(
    data.furniture,
    (id) => (v3 ? ITEM_INTERNAL_OF_STABLE.get(id) ?? 0 : id),
  );

  const st = world.store;
  // tiles(v3:RLE 里的 type 是稳定 id,查 INTERNAL_OF_STABLE 还原;v2 旧档=内部下标直读)
  {
    const v3 = (data.version ?? 1) >= 3;
    const u8 = b64ToBytes(data.tiles);
    const pos = { i: 0 };
    let i = 0;
    while (i < st.type.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const tRaw = readVarint(u8, pos);
      const t = v3 ? (tRaw === 0 ? 0 : TILE_INTERNAL_OF_STABLE[tRaw]) : tRaw;
      let fx = 0, fy = 0;
      if (t !== 0) {
        fx = readVarint(u8, pos);
        fy = readVarint(u8, pos);
      }
      for (let k = 0; k < run && i < st.type.length; k++, i++) {
        st.type[i] = t; st.flags[i] = t !== 0 ? 1 : 0;
        st.frameX[i] = fx; st.frameY[i] = fy;
      }
    }
  }
  // walls（version<2 的旧档墙值迁移：1=土→2, 2=石→1, 3=木→4（现为原版 id））
  {
    const legacy = (data.version ?? 1) < 2;
    const migrate = (v: number) => (legacy ? (v === 1 ? 2 : v === 2 ? 1 : v === 3 ? 4 : v) : v);
    const u8 = b64ToBytes(data.walls);
    const pos = { i: 0 };
    let i = 0;
    while (i < st.wall.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const v = migrate(readVarint(u8, pos));
      for (let k = 0; k < run && i < st.wall.length; k++, i++) st.wall[i] = v;
    }
  }
  // wire 电路位（旧存档缺此字段 → 全 0 = 无导线，缺字段容忍同 liquidType）
  {
    const u8 = b64ToBytes(data.wire ?? '');
    const pos = { i: 0 };
    let i = 0;
    while (i < st.wire.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const v = readVarint(u8, pos);
      for (let k = 0; k < run && i < st.wire.length; k++, i++) st.wire[i] = v;
    }
  }
  // half/slope(旧存档缺 → 全整砖;v3+ 语义)
  {
    const u8 = b64ToBytes(data.blocks ?? '');
    const pos = { i: 0 };
    let i = 0;
    while (i < st.half.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const v = readVarint(u8, pos);
      for (let k = 0; k < run && i < st.half.length; k++, i++) {
        st.half[i] = v === 1 ? 1 : 0;
        st.slope[i] = v >= 2 && v <= 5 ? v - 1 : 0;
      }
    }
  }
  // liquid type（旧存档缺此字段 → 全 0，由液体模拟按 1=水 补全）
  {
    const u8 = b64ToBytes(data.liquidType ?? '');
    const pos = { i: 0 };
    let i = 0;
    while (i < st.liquidType.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const v = readVarint(u8, pos);
      for (let k = 0; k < run && i < st.liquidType.length; k++, i++) st.liquidType[i] = v;
    }
  }
  // liquid
  {
    const u8 = b64ToBytes(data.liquid);
    const pos = { i: 0 };
    let i = 0;
    while (i < st.liquid.length && pos.i < u8.length) {
      const run = readVarint(u8, pos) + 1;
      const v = readVarint(u8, pos);
      for (let k = 0; k < run && i < st.liquid.length; k++, i++) st.liquid[i] = v;
    }
  }
  return { world, player: data.player };
}
