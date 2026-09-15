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
    paint: st.paint.buffer as ArrayBuffer,
    paintWall: st.paintWall.buffer as ArrayBuffer,
    coat: st.coat.buffer as ArrayBuffer,   // 涂层四位（WF:1539-1552 位编码）
    // 战争迷雾（读档路径：loadSaveData 解码出的 explored 随包回传主线程——
    // 曾只传 exploredVersion 转移标志 → 重进存档全图迷雾）。transfer 列表取
    // Object.values(buf)，本 buffer 随附移交；生成路径为全零分配，语义不变
    explored: world.explored.buffer as ArrayBuffer,
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
    oreTiersPH: { ...world.oreTiersPH },   // 肉前四档（WF:11294-11320）——★BJ71:曾缺=worker 读档包缝丢
    meteorShowerCount: world.meteorShowerCount,   // WorldGen.meteorShowerCount（WF:1069/:177）——★BJ71:曾缺
    shadowOrbCount: world.shadowOrbCount,
    sundial: world.sundialCooldown, moondial: world.moondialCooldown,   // WF:1311/1417
    fastForwardTimeToDawn: world.fastForwardTimeToDawn,                 // WF:1342
    fastForwardTimeToDusk: world.fastForwardTimeToDusk,                 // WF:1416
    seedFlags: world.seedFlags,
    // ★IIIII20b 换人一次性迁移标随包（★BJ90 2026-09-15 补携,BJ71 登记①——worker 读档
    //  loadSaveData 已回填 world.starterSwapMigrated,曾缺=包缝丢失,主线程存档恒假）
    starterSwapMigrated: world.starterSwapMigrated,
    weather: world.weatherToSave(), bestiary: world.bestiary.toSave(),
    // ★BJ71（2026-09-14）：旗击杀计数（BannerSystem.killCount,WF:1347 Save/:2210 Load）随包——
    //  worker 读档（worldGen.worker:215 packWorld）→ 主线程（WorldGenClient:199 fromPacket）
    //  同缝;曾缺=即使保存面写入,重进存档计数仍在包缝归零
    bannerKills: world.bannerKills,
    pendingTownNpcs: world.pendingTownNpcs,
    // ★SW-FX11（2026-09-10）：四塔位/压力板位随包（worker 读档→主线程恢复同缝）
    pendingPillarNpcs: world.pendingPillarNpcs,
    pendingPlatePokes: world.pendingPlatePokes,
    starterTownNpcs: world.starterTownNpcs,
    chests: world.chests,
    signs: world.signs,
    furnitureItems: world.furnitureItems,
    trees: world.trees,
    flags: world.flags,
    treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
    // ★SW-FX43（2026-09-12）：caveBackX/worldId + wld 快照三通道随包（worker 读档→
    //  主线程同缝;缺任一 = 主线程存档/导出即丢该通道。bgStyles=R16-5 落盘值同缝）
    caveBackX: world.caveBackX ? [...world.caveBackX] : undefined,
    worldId: world.worldId,
    wldSnap: world.wldSnap,
    teSnap: world.teSnap,
    townRooms: world.townRooms,
    bgStyles: world.bgStyles ? { ...world.bgStyles, cave: [...world.bgStyles.cave] } : undefined,
    shimmerX: world.shimmerX, shimmerY: world.shimmerY,
    // 历史索引帧修复完成标志（worker saveParse/gen 侧置位；主线程据此跳过二次扫描）
    ...(world.indexFramesRepaired ? { repairedIndexFrames: true as const } : {}),
    buf,
  };
  return { packet, transfer: Object.values(buf) as ArrayBuffer[] };
}
