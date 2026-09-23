// 鸟族 HitEffect 血尘（NPC.HitEffect :87518-87556：61/252/301 同式）+
// Collision_DecideFallThroughPlatforms（:94118-94252 全表）+ 栖息态 TargetClosest
// （AI_017 :24085）——2026-08-26 "未移植全面移植/清零偏差"批。
// 原版结构性事实（锁）：HitEffect 无通用尾支（最终 else = `if(type!=156) return`）
// ——未列型受击/死亡原版不出尘；鸟族块 = ceil(dmg/lifeMax×100) 簇 5 号血尘
// （DustID.Blood，SpeedX=hitDirection/SpeedY=-1）+ 死亡 50 簇（×2,-2）后 gore。
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 80, FLOOR = 60;

interface DustCall {
  x: number; y: number; w: number; h: number; type: number; sx: number; sy: number;
  vx: number; vy: number; noGravity: boolean; scale: number; fadeIn: number   // ★BJ309 活尘记账域
}

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
    damagePlayer: (): number => 0, spawnDrop: () => null, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: (...a: unknown[]) => { rec.particles.push(a); },
    spawnBurst: () => {}, addLightAt: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    scene: { zoneGraveyard: false },
    dust: {
      spawn: (x: number, y: number, dw: number, dh: number, type: number, sx = 0, sy = 0) => {
        rec.dusts.push({ x, y, w: dw, h: dh, type, sx, sy, vx: sx, vy: sy, noGravity: false, scale: 1, fadeIn: 0 });
        return null;
      },
    },
    // ★BJ254：受击/死亡尘改走 spawnDust 查表通道（NpcHitDust 单源）——同一记账桶
    spawnDust: (x: number, y: number, dw: number, dh: number, type: number, sx = 0, sy = 0) => {
      // ★BJ309：补 vx/vy/fadeIn 记账域（BJ304 批3 叶族 post 算子 velMul3/fadeIn 落活尘
      // 对象——缺域会让 applyOps 写 NaN、fadeIn 断言无锚;与 bj304 钩子同构）
      const rec2 = { x, y, w: dw, h: dh, type, sx, sy, vx: sx, vy: sy, noGravity: false, scale: 1, fadeIn: 0 };
      rec.dusts.push(rec2);
      return rec2;
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

  it('★BJ309 重钉：419（Selenian）已入尘表（BJ304 批3 fadeIn 叶族,原 BJ254「零尘」前提过时）；表内型（僵尸 3）=查表精确', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 42, y: FLOOR - 4 });
    // 419（Selenian,lifeMax=800/def=30）= BJ304 批3 fadeIn 叶族入表（NPC.cs :83719-:83738:
    // hit 循环 dmg/lifeMax×20 拍 [d241, Next(4)==0→d6 叶];死亡 20 拍 [d241, Next(3)==0→d6 叶]）
    // ——旧「表外型零尘」系 BJ254 时代前提（419 当时未接）,已过时。掷流钉定 rand=0 →
    // Next 恒中 → 每拍出叶,粒数全定（真实 RNG 下 hit 相叶 0|1 粒摇摆 = 旧断言摇摆根因）。
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const e419 = spawn(h, 419, 40, FLOOR - 2);
      // —— hit 相（:83719-:83722）——
      const hp0 = e419.hp;
      e419.hurt(5, 1, 0, h.hooks);                 // 防后伤 = max(1, 5−30×0.5) = 1 → ceil(1/800×20) = 1 拍
      expect(Math.ceil(((hp0 - e419.hp) / e419.maxHp) * 20)).toBe(1);
      const hitMain = h.rec.dusts.filter((d) => d.type === 241);
      expect(hitMain.length, 'hit 相主尘 d241 = 拍数').toBe(1);
      expect(hitMain[0].sx).toBe(1);               // hd（kbx=1）
      expect(hitMain[0].sy).toBe(-1);
      expect(hitMain[0].w).toBe(e419.w);           // 击中矩形 = NPC 盒
      const hitLeaf = h.rec.dusts.filter((d) => d.type === 6);
      expect(hitLeaf.length, 'Next(4)==0 恒中 → 每拍 1 叶').toBe(1);
      expect(hitLeaf[0].noGravity).toBe(true);     // 叶 posts：ng+scale1.5+fadeIn1（生长目标语义,Dust.cs :2148-2171）+velMul3
      expect(hitLeaf[0].scale).toBe(1.5);
      expect(hitLeaf[0].fadeIn).toBe(1);
      expect(h.rec.dusts[1]).toBe(hitLeaf[0]);     // 交错序：叶紧跟本拍主尘（源序 NewDust→掷门→叶）
      // —— 死亡相（:83735-:83738）——旧断言的第二 hurt 被免疫帧拦下（pierce=0 →
      // iframes=10 早退,hurt() 头门）,死亡面此前从未真被测;清帧致死 = 重开死亡面
      h.rec.dusts.length = 0;
      e419.iframes = 0;
      e419.hurt(e419.hp + 9999, 1, 0, h.hooks);
      expect(e419.dead).toBe(true);
      expect(h.rec.dusts.length, '死亡 20 拍 × [d241 + d6]').toBe(40);
      for (let k = 0; k < 20; k++) {
        expect(h.rec.dusts[k * 2].type).toBe(241);
        expect(h.rec.dusts[k * 2].sx).toBe(1);     // hd
        expect(h.rec.dusts[k * 2].sy).toBe(-1);
        expect(h.rec.dusts[k * 2 + 1].type).toBe(6);
        expect(h.rec.dusts[k * 2 + 1].fadeIn).toBe(1);
      }
      // 419 原版块无彩色粒子段（通用近似让位,同 301 面）
      expect(h.rec.particles.length).toBe(0);
    } finally {
      rand.mockRestore();
    }
    // 僵尸 3 = 表内型（vanilla :87923/:87951 确有 5 号尘块——旧断言"僵尸无块"系
    // 仓内覆盖面误当原版真值,本测试更正为查表精确钉值）
    const e3 = spawn(h, 3, 50, FLOOR - 2);
    const hp0 = e3.hp;
    e3.hurt(5, 1, 0, h.hooks);
    expect(e3.hp).toBeGreaterThan(0);
    const dealt = hp0 - e3.hp;
    const hitBlood = h.rec.dusts.filter((d) => d.type === 5);
    expect(hitBlood.length).toBe(Math.ceil((dealt / e3.maxHp) * 100));
    expect(hitBlood[0].sx).toBe(1);               // hd（kbx=1）
    expect(hitBlood[0].sy).toBe(-1);
    // 死亡 50 簇 2.5hd/-2.5（:87951）
    const e3b = spawn(h, 3, 60, FLOOR - 2);
    h.rec.dusts.length = 0;
    e3b.hurt(e3b.hp + 9999, 1, 0, h.hooks);
    const death = h.rec.dusts.filter((d) => d.type === 5);
    expect(death.length).toBe(50);
    expect(death[0].sx).toBe(2.5);                // 2.5hd（:87951）
    expect(death[0].sy).toBe(-2.5);
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
