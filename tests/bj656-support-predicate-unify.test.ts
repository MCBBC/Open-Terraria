// ★BJ656 城镇 NPC 支撑谓词三站统一定谳锁（2026-10-12,BJ649 收刀登记债清偿）。
//
// 【定谳】原版 AI_007 支撑扫描三站【同式】（亲读 1457 NPC.cs）：
//   ①臂B 腾空停走 :54771-72 `tileSafely6.liquid > 0 || (tileSafely6.nactive()
//     && Main.tileSolid[tileSafely6.type])`；
//   ②坑口停走三列 :54563 `tileSafely2.nactive() && Main.tileSolid[...]`（无液体臂）；
//   ③walkPrediction 前视列 :56291 `tileSafely.nactive() && Main.tileSolid[...]`。
//   平台九件套 {19,239,380,427,435-439} 原版双旗同置（Main.cs:8031-32/:9797-9800/
//   :10118-10136 tileSolid+tileSolidTop 同 true）→ tileSolid 本就计入平台;
//   家具顶（桌14/铁砧16/工作台18）tileSolid=false 不计。
//   ⇒「两套各自对齐原版」不成立（原版同式）→ 本仓 walkPrediction 侧
//   isSolid∪isPlatform（家具顶宽化,2026-08-31 错锚 SolidOrSlopedTileOrPlatform
//   ——该函数 :53335 实为 FindGoodRestingSpot :53352 找地板谓词）为病 → 统一
//   落刀 TileStore.isVanillaTileSolid（臂B/坑口/walkPrediction/npcMove 遥测
//   四面换道;外加 nactive() 门补臂B 幽灵平台漏门）。
// 【8-31 向导楼梯案】平台计入不变=案保真（T1）；判别刀=家具顶摘除（T2 旧谓词
//   恒绿、新谓词恰红）。
// 【变异】M1 walkPrediction 换道回 isSolid 裸查 → T1 恰红;
//         M2 walkPrediction 换道回 isSolid∪isPlatform（旧宽化）→ T2 恰红;
//         M3 isVanillaTileSolid 摘 isActive 门 → T5 恰红;
//         M4 臂B 换道回 isPlatform（宽化接线）→ T7 恰红（T6 保绿）。
//         逐字节还原+sha256 对拍。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC, WALK_SPEED, walkPrediction } from '../src/entities/TownNPC';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const PLAT = TILE_BY_KEY['platform']!;      // sheet 19（九件套首领,双旗同置）
const DIRT = TILE_BY_KEY['dirt']!;
const WORKBENCH = TILE_BY_KEY['workbench']!; // sheet 18 platform:true solid:false
const TABLE = TILE_BY_KEY['table']!;         // sheet 14 platform:true solid:false
const WOOD = TILE_BY_KEY['wood']!;

/** 空世界单格支撑：唯一候选支撑格 = (col, supRow),其余全空气 → 前视列扫只看它。
 *  调用方探针列=col、脚行=19（home 同列不触发远行豁免） */
function probe(col: number, supRow: number, tile: number): TileStore {
  const st = new TileStore(60, 60);
  if (tile) st.setTileSilent(col, supRow, tile);
  return st;
}

function walkPred(st: TileStore, tileX: number, tileY: number) {
  return walkPrediction(st, 29, 29, false, 1, tileX, tileY, 42);
}

describe('BJ656 walkPrediction 支撑谓词统一（=原版裸 Main.tileSolid,三站同式）', () => {
  it('T1 8-31 向导楼梯案回归锁:纯平台桥计入支撑 → 放行（平台九件套臂保真）', () => {
    // 脚行 19（tileY）,平台在 20（j=1）,列内再无其他支撑、平台下全空气——
    // 旧 isSolid 裸查会把面前判深坑（8-31 卡死案病灶）→ 统一谓词必须计入平台
    expect(walkPred(probe(30, 20, PLAT), 30, 19).avoidFalling).toBe(false);
    // 平台在脚行同排（j=0,楼梯横档常见档位）同式
    expect(walkPred(probe(30, 19, PLAT), 30, 19).avoidFalling).toBe(false);
    // 平台下探档位（j=4,原版容 4 格落差）
    expect(walkPred(probe(30, 23, PLAT), 30, 19).avoidFalling).toBe(false);
  });

  it('T2 家具顶摘除判别锁:悬空工作台/长桌不再当落点 → 避坠（旧 isPlatform 恒绿=恰红）', () => {
    // 工作台 sheet 18：defs.platform=true（isPlatform 计入）∧ 原版 tileSolid[18]
    // =false（原版不计）——统一谓词必须【不】计入;悬浮桌顶不再骗过避坠
    expect(walkPred(probe(30, 20, WORKBENCH), 30, 19).avoidFalling).toBe(true);
    expect(walkPred(probe(30, 20, TABLE), 30, 19).avoidFalling).toBe(true);
    // 家具顶命中档位下移（j=2）同式
    expect(walkPred(probe(30, 21, WORKBENCH), 30, 19).avoidFalling).toBe(true);
  });

  it('T3 实心对照:普通实心落点照常放行（isSolid 臂不变）', () => {
    expect(walkPred(probe(30, 20, DIRT), 30, 19).avoidFalling).toBe(false);
    expect(walkPred(probe(30, 20, WOOD), 30, 19).avoidFalling).toBe(false);
    // 全空气列 → 避坠（基线不变）
    expect(walkPred(probe(30, 20, 0), 30, 19).avoidFalling).toBe(true);
  });

  it('T4 九件套逐项:isVanillaTileSolid 计入 19/239/380/427/435-439（walkPrediction 同判）', () => {
    const sheets = [19, 239, 380, 427, 435, 436, 437, 438, 439];
    for (const sh of sheets) {
      const def = TILE_DEFS.find((d) => d?.vanilla?.sheet === sh);
      expect(def, `sheet ${sh} 应有本仓 def`).toBeTruthy();
      const id = TILE_DEFS.indexOf(def!);
      const stx = probe(30, 20, id);
      expect(stx.isVanillaTileSolid(30, 20), `sheet ${sh} 应计入 tileSolid 真表`).toBe(true);
      expect(walkPred(stx, 30, 19).avoidFalling, `sheet ${sh} 前视列应放行`).toBe(false);
    }
    // 家具族对照（platform:true 但原版 tileSolid=false）逐项不计数
    for (const key of ['workbench', 'anvil', 'table'] as const) {
      const id = TILE_BY_KEY[key]!;
      expect(TILE_DEFS[id]?.platform, `${key} fixture 须 platform:true`).toBe(true);
      expect(probe(30, 20, id).isVanillaTileSolid(30, 20),
        `${key} 家具顶不计 tileSolid 真表`).toBe(false);
    }
  });

  it('T5 nactive() 门:幽灵平台（flags=0）/已致动平台不计（原版 nactive() 同相）', () => {
    const st = new TileStore(60, 60);
    const i = st.idx(30, 20);
    st.type[i] = PLAT; st.flags[i] = 0;              // 幽灵保域残型（flags=0,type≠0）
    expect(st.isVanillaTileSolid(30, 20)).toBe(false);
    st.flags[i] = 1;
    st.wire[i] |= TileStore.WIRE_ACTUATED;           // 致动器缩入
    expect(st.isVanillaTileSolid(30, 20)).toBe(false);
    st.wire[i] &= ~TileStore.WIRE_ACTUATED;
    expect(st.isVanillaTileSolid(30, 20)).toBe(true);
  });
});

// ============ 臂B 同谓词收编接线锁（驱动法同 BJ649 套件;判别面=家具顶宽化） ============

function makeGame(world: World, playerX: number, playerY: number) {
  return {
    game: {
      world,
      player: {
        x: playerX, y: playerY, w: 20, h: 42, dead: false,
        luckState: { usedGalaxyPearl: false, npcLuck: () => {}, playerLuck: () => 0 },
      },
      enemies: () => [],
      npcs: () => [],
      critters: () => [],
      spawnTownShot: () => {},
      spawnParticles: () => {},
      spawnBurst: () => {},
      playSfx: () => {},
      playSfxFiles: () => {},
      addDamageNumber: () => {},
      achievements: { notifyProgressionEvent: () => {} },
      behavioLog: () => {},
      quickFindHomeForNpc: () => false,
    } as never,
  };
}

function makeLongFloorWorld(floorTile: number, floorRow = 60): World {
  const world = new World(240, 200, 100, 'bj656');
  const st = world.store;
  for (let x = 60; x <= 200; x++) st.setTileSilent(x, floorRow, floorTile);
  world.clock.timeOfDay = 0;
  return world;
}

function driveArmB(world: World, floorRow: number, cxTile: number): number {
  const npc = new TownNPC('town_slime_cool', cxTile * 16 + 8, floorRow * 16 - 2);
  npc.home = { x: 90, y: floorRow - 1 };
  const { game } = makeGame(world, cxTile * 16, (floorRow - 2) * 16);
  const inner = npc as unknown as { walkMode: number; turnLock: number; walkT: number };
  let armBHits = 0;
  for (let t = 1; t <= 600; t++) {
    npc.fixedUpdate(1 / 60, game);
    if (!npc.onGround && inner.walkMode === 0 && inner.turnLock === 40
      && inner.walkT >= 50 && inner.walkT <= 100) armBHits++;
  }
  return armBHits;
}

describe('BJ656 臂B（腾空停走）换道 isVanillaTileSolid 接线锁', () => {
  it('T6 纯平台上空臂B 静默+走态满速（平台计入支撑;M1 同族回归面）', () => {
    const world = makeLongFloorWorld(PLAT);
    expect(driveArmB(world, 60, 130)).toBe(0);
    const npc2 = new TownNPC('town_slime_cool', 130 * 16 + 8, 60 * 16 - 2);
    npc2.home = { x: 90, y: 59 };
    const { game } = makeGame(world, 130 * 16, 58 * 16);
    let vxMax = 0;
    for (let t = 1; t <= 600; t++) {
      npc2.fixedUpdate(1 / 60, game);
      vxMax = Math.max(vxMax, Math.abs(npc2.vx));
    }
    expect(vxMax).toBeGreaterThanOrEqual(WALK_SPEED * 0.9);
  });

  it('T7 桌面上空臂B 照常点火（家具顶不计;M4 接线判别:臂B 误接 isPlatform → 恰红）', () => {
    expect(driveArmB(makeLongFloorWorld(TABLE), 60, 130)).toBeGreaterThan(0);
  });
});
