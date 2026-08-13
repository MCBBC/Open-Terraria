// World 数据包：worker → 主线程的打包（主线程重建用 World.fromPacket，见 World.ts）。
// packWorld 为【转移语义】——取走 store 各 TypedArray 的 .buffer 后该 world 即不可再用
// （buffer 被 detach），调用方必须保证 pack 是该 world 生命周期的最后一步。
import type { World } from '../world/World';
import type { TileBuffers, WorldPacket } from './protocol';

/** 把 world 打包为可 postMessage 的数据包（transfer 列表随附；buffer 所有权移交） */
export function packWorld(world: World): { packet: WorldPacket; transfer: ArrayBuffer[] } {
  const st = world.store;
  const buf: TileBuffers = {
    type: st.type.buffer as ArrayBuffer,
    flags: st.flags.buffer as ArrayBuffer,
    frameX: st.frameX.buffer as ArrayBuffer,
    frameY: st.frameY.buffer as ArrayBuffer,
    wall: st.wall.buffer as ArrayBuffer,
    liquid: st.liquid.buffer as ArrayBuffer,
    liquidType: st.liquidType.buffer as ArrayBuffer,
    half: st.half.buffer as ArrayBuffer,
    slope: st.slope.buffer as ArrayBuffer,
    wire: st.wire.buffer as ArrayBuffer,
  };
  const packet: WorldPacket = {
    w: st.w, h: st.h, seed: world.seed, name: world.name,
    spawnX: world.spawnX, spawnY: world.spawnY,
    groundLevel: world.groundLevel, rockLevel: world.rockLevel, lavaLine: world.lavaLine,
    crimson: world.crimson, dungeonX: world.dungeonX, dungeonY: world.dungeonY, jungleX: world.jungleX,
    exploredVersion: world.exploredVersion,
    difficulty: world.difficulty,   // Main.GameMode（worker 读档路径回传;生成路径写 GenConfig）
    clock: { timeOfDay: world.clock.timeOfDay, dayCount: world.clock.dayCount,
      bloodMoon: world.clock.bloodMoon, eclipse: world.clock.eclipse, moonPhase: world.clock.moonPhase },
    moonType: world.moonType,
    invasion: { type: world.invasionType, size: world.invasionSize, sizeStart: world.invasionSizeStart,
      x: world.invasionX, delay: world.invasionDelay },
    altarCount: world.altarCount,
    // 夜间小动物概率五件套（setFireFlyChance；旧包缺省=代表值，当晚 StartNight 重掷）
    critterChances: { fireFly: world.fireFlyChance, fireFlyFriendly: world.fireFlyFriendly,
      fireFlyMultiple: world.fireFlyMultiple, butterfly: world.butterflyChance, stinkBug: world.stinkBugChance },
    cultistDelay: world.cultistDelay,   // CultistRitual.delay（WF:1340/:2192）
    angler: { quest: world.anglerQuest, whoFinishedToday: [...world.anglerWhoFinishedToday] },  // WF:1329-1335
    savedOreTiers: { ...world.savedOreTiers },
    shadowOrbCount: world.shadowOrbCount,
    sundial: world.sundialCooldown, moondial: world.moondialCooldown,   // WF:1311/1417
    fastForwardTimeToDawn: world.fastForwardTimeToDawn,                 // WF:1342
    fastForwardTimeToDusk: world.fastForwardTimeToDusk,                 // WF:1416
    seedFlags: world.seedFlags,
    weather: world.weatherToSave(), bestiary: world.bestiary.toSave(),
    pendingTownNpcs: world.pendingTownNpcs,
    chests: world.chests,
    signs: world.signs,
    furnitureItems: world.furnitureItems,
    trees: world.trees,
    flags: world.flags,
    treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
    shimmerX: world.shimmerX, shimmerY: world.shimmerY,
    buf,
  };
  return { packet, transfer: Object.values(buf) as ArrayBuffer[] };
}
