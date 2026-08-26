// 鸟族 HitEffect 血尘（NPC.HitEffect :87518-87556：61/252/301 同式）+
// Collision_DecideFallThroughPlatforms（:94118-94252 全表）+ 栖息态 TargetClosest
// （AI_017 :24085）——2026-08-26 "未移植全面移植/清零偏差"批。
// 原版结构性事实（锁）：HitEffect 无通用尾支（最终 else = `if(type!=156) return`）
// ——未列型受击/死亡原版不出尘；鸟族块 = ceil(dmg/lifeMax×100) 簇 5 号血尘
// （DustID.Blood，SpeedX=hitDirection/SpeedY=-1）+ 死亡 50 簇（×2,-2）后 gore。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 80, FLOOR = 60;

interface DustCall { x: number; y: number; w: number; h: number; type: number; sx: number; sy: number }

function makeWorld(): World {
  const w = new World(W, H, 11, 'raven-hitfall');
  const st = w.store;
  for (let x = 0; x < W; x++) st.setTile(x, FLOOR, 1);
  w.clock.timeOfDay = 0.9;
  return w;
}

function makeHooks(w: World, playerAt?: { x: number; y: number } | null) {
  const rec = { enemies: [] as Enemy[], projectiles: [] as unknown[], dusts: [] as DustCall[], particles: [] as unknown[] };
  let nextId = 1;
  const em = {
    nextId,
    add: (e: unknown, bucket: string) => {
      (e as { id: number }).id = nextId++;
      if (bucket === 'enemies') rec.enemies.push(e as Enemy);
      else rec.projectiles.push(e);   // gore → props 桶
    },
  };
  const player = new Player((playerAt?.x ?? 80) * TILE, (playerAt?.y ?? FLOOR - 4) * TILE, new Inventory());
  const hooks = {
    world: w, player: playerAt === null ? null : player,
    enemies: () => rec.enemies, critters: () => [], npcs: () => [],
    damagePlayer: () => {}, spawnDrop: () => null, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: (...a: unknown[]) => { rec.particles.push(a); },
    spawnBurst: () => {}, addLightAt: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    scene: { zoneGraveyard: false },
    dust: {
      spawn: (x: number, y: number, dw: number, dh: number, type: number, sx = 0, sy = 0) => {
        rec.dusts.push({ x, y, w: dw, h: dh, type, sx, sy });
        return null;
      },
    },
    entities: em,
  } as unknown as GameHooks & { entities: typeof em };
  return { hooks: hooks as GameHooks, rec, player, em };
}

function spawn(h: { rec: { enemies: Enemy[] }; em: { nextId: number } }, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.rec.enemies.push(e);
  return e;
}

const drive = (e: Enemy, fn: string) =>
  (e as unknown as Record<string, (...a: unknown[]) => void>)[fn];

// ---------------------------------------------------------------------------
// ① HitEffect 鸟族血尘（:87518-87556）
// ---------------------------------------------------------------------------
describe('鸟族 HitEffect 血尘（61 秃鹫/252 鹦鹉/301 渡鸦,:87518-87556）', () => {
  it('存活受击：ceil(防后伤/lifeMax×100) 簇 5 号血尘（SpeedX=hitDirection/SpeedY=-1）', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const e = spawn(h, 301, 40, FLOOR - 2);       // lifeMax=35/def=2
    e.hurt(7, 2, 0, h.hooks);                      // 防后伤 = 7−2×0.5 = 6 → ceil(6/35×100)=18
    const blood = h.rec.dusts.filter((d) => d.type === 5);
    expect(blood.length).toBe(18);
    expect(blood[0].sx).toBe(1);                   // hitDirection=+1（kbx=2）
    expect(blood[0].sy).toBe(-1);
    // 击中矩形 = NPC position/width/height（血尘落点域）
    expect(blood[0].w).toBe(e.w);
    // 通用彩色近似已让位（原版本族无彩色粒子段）
    expect(h.rec.particles.length).toBe(0);
  });

  it('hitDirection 随击退方向（kbx<0 → -1）', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const e = spawn(h, 61, 40, FLOOR - 2);
    e.hurt(5, -3, 0, h.hooks);                     // ceil(5/35×100)=15（秃鹫 lifeMax 35? 61=35）
    const blood = h.rec.dusts.filter((d) => d.type === 5);
    expect(blood.length).toBeGreaterThan(0);
    expect(blood[0].sx).toBe(-1);
  });

  it('击杀：50 簇血尘（SpeedX=2×hitDir/SpeedY=-2）先于 gore,通用彩色近似不叠', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 42, y: FLOOR - 4 });   // 死亡 loot 链读 player
    const e = spawn(h, 301, 40, FLOOR - 2);
    e.hurt(9999, 1, 0, h.hooks);
    const blood = h.rec.dusts.filter((d) => d.type === 5);
    expect(blood.length, '死亡恰 50 簇').toBe(50);
    expect(blood[0].sx).toBe(2);
    expect(blood[0].sy).toBe(-2);
    // gore 438/439 入 props 桶（vanilla-gore.json 301 表项）
    const gores = h.rec.projectiles as Array<{ goreId?: number }>;
    expect(gores.some((g) => g.goreId === 438)).toBe(true);
    expect(gores.some((g) => g.goreId === 439)).toBe(true);
    // 彩色近似让位（鸟族精确尘+gore 即原版全貌）
    expect(h.rec.particles.length).toBe(0);
  });

  it('未列型无 HitEffect 块 → 受击/死亡不出血尘（原版结构:无通用尾支）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 42, y: FLOOR - 4 });
    const e = spawn(h, 3, 40, FLOOR - 2);          // 僵尸（无 5 号尘块）
    e.hurt(5, 1, 0, h.hooks);
    expect(h.rec.dusts.filter((d) => d.type === 5).length).toBe(0);
    const e2 = spawn(h, 3, 50, FLOOR - 2);
    e2.hurt(9999, 1, 0, h.hooks);
    expect(h.rec.dusts.filter((d) => d.type === 5).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ② Collision_DecideFallThroughPlatforms（:94118-94252 全表）
// ---------------------------------------------------------------------------
describe('平台穿透判定表（:94118-94252）', () => {
  it('鸟族/恶魔眼族/表列型恒穿；秃鹫 61（aiStyle17 不在表）不穿', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    expect(spawn(h, 301, 40, 20).decideFallThroughPlatforms(h.hooks)).toBe(true);   // :94224
    expect(spawn(h, 2, 40, 20).decideFallThroughPlatforms(h.hooks)).toBe(true);     // 恶魔眼 :94122
    expect(spawn(h, 133, 40, 20).decideFallThroughPlatforms(h.hooks)).toBe(true);   // 游荡眼
    expect(spawn(h, 61, 40, 20).decideFallThroughPlatforms(h.hooks)).toBe(false);   // 秃鹫不在表
    expect(spawn(h, 1, 40, 20).decideFallThroughPlatforms(h.hooks)).toBe(false);    // 蓝史莱姆
  });

  it('战士族 aiStyle3：directionY==1（下落/缺省）穿；dirY=-1（玩家同层 :56248）站平台', () => {
    const w = makeWorld();
    const h = makeHooks(w, null);
    const z = spawn(h, 3, 40, FLOOR - 2);
    z.dirY = 1;
    expect(z.decideFallThroughPlatforms(h.hooks), '下落中穿平台').toBe(true);
    z.dirY = -1;
    expect(z.decideFallThroughPlatforms(h.hooks), '同层追击不穿').toBe(false);
  });

  it('tick 前置写入 dropThrough（AI 派发前）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 42, y: FLOOR - 4 });
    const e = spawn(h, 301, 40, 20);
    e.bInit = true;
    e.fixedUpdate(1 / 60, h.hooks);
    expect(e.dropThrough).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ③ AI_017 栖息态 TargetClosest（:24085）→ 落地 spriteDirection
// ---------------------------------------------------------------------------
describe('栖息态索敌刷新（:24085）', () => {
  it('渡鸦栖息:面向玩家(direction=-1)→落地 sdir=-direction=1(背向,vanilla 观感)', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 20, y: FLOOR - 4 });   // 玩家在乌鸦(40)左侧
    const e = spawn(h, 301, 40, FLOOR - 2);
    e.y = FLOOR * TILE - e.h;                 // 盒底钉在地表（重力 0.3/t,自然落太慢）
    e.bInit = true;
    e.fixedUpdate(1 / 60, h.hooks);           // 栖息拍:重力 0.3 → moveAndCollide 落地 vy=0
    expect(e.ai0).toBe(0);                              // 栖息未被唤醒
    expect(e.facing).toBe(-1);                          // TargetClosest 朝玩家
    drive(e, 'findFrameRotation').call(e);
    expect(e.ravenSdir, '落地 sdir=-direction=1').toBe(1);
  });
});
