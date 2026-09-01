// Enemy.ts A 级残差四项回归（2026-08-15，标杆 Terarria1456 反编译源）：
//   项1 Ichor/穿甲池 hurt 原版序（Projectile.cs:12796-12808 num12 += checkArmorPenetration
//      先加穿甲、再入 Main.cs:65626-65635 CalculateDamageNPCsTake 减 def×0.5 下限 1）
//   项2 贴附族层数模型（NPC.cs:92740-92863：169←598 3HP/s/层 cap6 / 183←614 20HP/s/层
//      cap10 / 337←971 3HP/s/层 / 344←975 4HP/s/层；层寿命=AddBuff 时长=贴附弹
//      60×num11 AI 次寿命；189 Daybreak 零层兜底 1 :92822-92825 既有实现复核）
//   项3 击退双路（NPC.cs:82144-82239：num3=kb×resist 先乘→onFire2×1.1→五段封顶→
//      crit×1.4→num8=(int)伤×10(专家15)；轻路 num8>lifeMax 减法收敛+185×1.5+
//      Y 加法钳；重路直接赋值 resist 二次乘）
//   项4 walker 地面摩擦单链（AI_003 :60115-60175 num184 逐族 damp,vy==0 门,
//      |vx|>max 才衰减——摘除叠乘的 onGround×0.85 陈旧近似）
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { applyProjStatus } from '../src/entities/projStatus';
import { fighterMoveStep } from '../src/entities/fighterFamilies';
import { Arrow } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 120, H = 80, FLOOR = 60;

function makeWorld(): World {
  const w = new World(W, H, 11, 'enemy-aresidual');
  const st = w.store;
  w.groundLevel = 30;
  for (let x = 0; x < W; x++) { st.setTile(x, FLOOR, 1); st.setTile(x, FLOOR + 1, 1); }
  w.clock.timeOfDay = 0.9; // 夜间（白天驱散门不干扰）
  return w;
}

function makeHooks(w: World) {
  const enemies: Enemy[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
    },
  };
  const player = new Player(W * TILE * 0.5, (FLOOR - 3) * TILE, new Inventory());
  const hooks = {
    world: w, player,
    enemies: () => enemies,
    critters: () => [], npcs: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    dropContext: () => ({ zoneHallow: false, zoneCorrupt: false, zoneCrimson: false, zoneJungle: false, zoneSnow: false, zoneDesert: false, zoneDungeon: false, zoneBeach: false, bloodMoon: false, halloween: false, xmas: false, windy: false }),
    scene: { zoneHallow: false, zoneGraveyard: false },
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, em };
}

/** 可控靶：僵尸 3 号壳，防/抗性/血量/飞行态按需覆写 */
function makeEnemy(h: ReturnType<typeof makeHooks>, over: Partial<{
  defense: number; kbr: number; hp: number; flying: boolean; vanillaId: number;
}> = {}): Enemy {
  const e = Enemy.fromVanilla(over.vanillaId ?? 3, 60 * TILE, (FLOOR - 3) * TILE)!;
  e.id = h.em.nextId++;
  e.def.defense = over.defense ?? 0;
  e.def.knockbackResist = over.kbr ?? 1;
  (e.def as { flying?: boolean }).flying = over.flying ?? false;
  e.maxHp = e.hp = over.hp ?? 1000;
  e.iframes = 0;
  e.vx = 0; e.vy = 0;
  h.enemies.push(e);
  return e;
}

const loss = (before: number, e: Enemy): number => before - e.hp;

// ===========================================================================
// 项1 hurt 穿甲原版序（Projectile.cs:12796-12808 + Main.cs:65626-65635）
// ===========================================================================
describe('项1 Ichor/穿甲池：dmg + pen/2 − def/2（NPC.cs:81913-81938）', () => {
  it('ichor 在身：+15 入池 → 7 加伤；dmg10/def30 → 2（旧近似平推 +7 得 7）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { defense: 30 });
    e.ichorT = 5;
    e.hurt(10, 0, 0, h.hooks);
    expect(loss(1000, e)).toBe(2);          // max(1, 10 + 7 − 15)
  });
  it('池饱和：armorPen25+ichor15=40 > def30 → 钳 def/2=15 → 全额 10（非 12+7 独立相加）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { defense: 30 });
    e.ichorT = 5;
    e.iframes = 0; e.hp = 1000;
    e.hurt(10, 0, 0, h.hooks, 25);
    expect(loss(1000, e)).toBe(10);         // 10 + 15 − 15
  });
  it('penPercent=1（闪电光环 688/690）：pen=(int)(30×1)=30 → 钳 15 → 全额', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { defense: 30 });
    e.hurt(10, 0, 0, h.hooks, 0, false, 0, false, 1);
    expect(loss(1000, e)).toBe(10);
  });
  it('负防御：不吃穿甲（pen=0）但 −def/2 为增伤 → dmg10/def−10 = 15', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { defense: -10 });
    e.hurt(10, 0, 0, h.hooks, 50);
    expect(loss(1000, e)).toBe(15);         // max(1, round(10 + 0 + 5))
  });
  it('Arrow.settlePen 已被 hurt 消费：85 型(穿甲15)+玩家5 → pen20→10 加伤', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { defense: 30 });
    const a = new Arrow(0, 0, 1, 0, 10, 1, 85, null);
    a.armorPen = 5;
    const settlePen = (a as unknown as { settlePen: number }).settlePen;
    expect(settlePen).toBe(20);             // 上一批两源相加（StrikeNPC :12068）
    e.hurt(10, 0, 0, h.hooks, settlePen);
    expect(loss(1000, e)).toBe(5);          // 10 + 10 − 15
  });
});

// ===========================================================================
// 项2 贴附族层数模型（NPC.cs:92740-92863 + Projectile.cs:13019-13030 cap）
// ===========================================================================
describe('项2 贴附族层数：施加入层/上限杀最老/按层 DoT', () => {
  it('614 星尘弹：applyProjStatus 施加=入 1 层（buff 15s）；12 发 → cap 10（_javelinsMax10）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { hp: 5000 });
    for (let i = 0; i < 12; i++) applyProjStatus(614, e as unknown as Record<string, number>);
    expect(e.stardustT).toBe(15);                       // AddBuff(183, 900t)
    expect(e.stardustStacks.length).toBe(10);           // cap 10
    expect(e.stardustStacks[0]).toBe(15);               // 最老离池,新层 15s 在
  });
  it('598 骨标 cap 6 / 971·975 无上限（KillOldestJavelin :13021 白名单）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { hp: 5000 });
    for (let i = 0; i < 8; i++) applyProjStatus(598, e as unknown as Record<string, number>);
    expect(e.javelinStacks.length).toBe(6);
    for (let i = 0; i < 8; i++) applyProjStatus(971, e as unknown as Record<string, number>);
    for (let i = 0; i < 8; i++) applyProjStatus(975, e as unknown as Record<string, number>);
    expect(e.spikeStacks.length).toBe(8);
    expect(e.butcherStacks.length).toBe(8);
  });
  it('按层 DoT：星尘 10 层 = 200 HP/s（:92846-92863 num10×20，无零层兜底）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { hp: 5000 });
    for (let i = 0; i < 10; i++) applyProjStatus(614, e as unknown as Record<string, number>);
    const before = e.hp;
    for (let i = 0; i < 60; i++) { if (!e.dead) e.fixedUpdate(1 / 60, h.hooks); }
    const d = before - e.hp;
    expect(d).toBeGreaterThan(199);                     // 200 − 整数化尾差
    expect(d).toBeLessThanOrEqual(200);
  });
  it('层独立到寿消亡：1 层 2s → 2s 内 40 HP 后归零（贴附弹寿命=buff 时长）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { hp: 5000 });
    e.stardustT = 2;
    e.addStickerStack(183, 2);
    const before = e.hp;
    for (let i = 0; i < 121; i++) { if (!e.dead) e.fixedUpdate(1 / 60, h.hooks); }  // 121t=2.016s（2s+浮点尾差帧）
    expect(e.stardustStacks.length).toBe(0);
    expect(e.stardustT).toBeLessThanOrEqual(0);
    expect(before - e.hp).toBeGreaterThan(39);          // 20×2s=40 − 尾差
  });
  it('189 Daybreak 零层兜底 1（:92822-92825）：无附着弹仍 100 HP/s（复核既有链）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { hp: 5000 });
    e.daybreakT = 1;
    const before = e.hp;
    for (let i = 0; i < 60; i++) { if (!e.dead) e.fixedUpdate(1 / 60, h.hooks); }
    expect(before - e.hp).toBeGreaterThan(99);          // 100×1s − 尾差
  });
});

// ===========================================================================
// 项3 击退双路（NPC.cs:82144-82239）
// ===========================================================================
describe('项3 轻路/重路收敛（num8=(int)伤×10(专家×15) vs lifeMax）', () => {
  it('轻路（num8>lifeMax）：X 减法收敛 + Y 加法钳（dmg11/hp100 → num8=110>100）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { hp: 100, kbr: 0.4 });
    e.hurt(11, 6, 0, h.hooks);   // num3=6×0.4=2.4
    expect(e.vx).toBeCloseTo(2.4, 6);       // :82198-82206 同向不足 → +=num3 钳
    expect(e.vy).toBeCloseTo(-1.8, 6);      // −2.4×0.75（:82217 有重力档）
    expect(e.hp).toBe(89);                  // 11 直落不死于测试
  });
  it('重路（num8≤lifeMax）：直接赋值 + resist 二次乘（dmg6 → num8=60≤100）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { hp: 100, kbr: 0.4 });
    e.hurt(6, 6, 0, h.hooks);
    expect(e.vx).toBeCloseTo(2.4 * 0.4, 6);   // :82235 num3×dir×resist
    expect(e.vy).toBeCloseTo(-2.4 * 0.75 * 0.4, 6); // :82228-82233
  });
  it('resist 先乘再封顶（:82145 序）：kb12/resist0.5 → num3=6 无封顶段', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { hp: 100, kbr: 0.5 });
    e.hurt(6, 12, 0, h.hooks);   // 旧序（裸 kb 封顶后乘）会得 vx=6；新序 6×0.5=3
    expect(e.vx).toBeCloseTo(3, 6);
    expect(e.vy).toBeCloseTo(-6 * 0.75 * 0.5, 6);
  });
  it('185 小丑轻路特例：X 收敛后 num3×1.5 只放大 Y（:82209-82217）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { hp: 100, kbr: 0.4, vanillaId: 185 });
    e.hurt(11, 6, 0, h.hooks);
    expect(e.vx).toBeCloseTo(2.4, 6);        // X 用未放大 num3
    expect(e.vy).toBeCloseTo(-2.4 * 1.5 * 0.75, 6);  // −2.7
  });
  it('上升中（vy<num3 负目标）Y 不追加：轻路只在下落/静止时起跳（:82220 门）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { hp: 100, kbr: 0.4 });
    e.vy = -5;
    e.hurt(11, 6, 0, h.hooks);
    expect(e.vy).toBe(-5);
  });
  it('kb=0（DoT 击杀通道 hurt(9999,0,0)）：速度完全不触（:82144 knockBack>0 门）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h, { hp: 5000, kbr: 0.4 });
    e.vx = 1.5; e.vy = 2.5;
    e.hurt(9999, 0, 0, h.hooks);
    expect(e.vx).toBe(1.5);
    expect(e.vy).toBe(2.5);
  });
});

// ===========================================================================
// 项4 walker 摩擦单链（AI_003 :60115-60175 num184；摘除 onGround×0.85 叠乘）
// ===========================================================================
describe('项4 地面摩擦：仅 num184 单链（无 0.85 叠乘）', () => {
  it('fighterMoveStep damp 语义：|vx|>max 时 ×0.8（僵尸 max=1；vx2 → 1.6）', () => {
    const h = makeHooks(makeWorld());
    const e = makeEnemy(h);
    e.vx = 2; e.vy = 0;
    // 2026-08-19 C 批：fighterMoveStep 增 game 参（扑咬突进族的昼夜/地下门需要）
    fighterMoveStep(e, h.hooks, 1, null);
    expect(e.vx).toBeCloseTo(1.6, 6);
  });
  it('整 tick 单链：vx2 → 1.6（0.85 叠乘旧值 1.36），30t 收敛回 max≈1 而非 ~0.47', () => {
    const h = makeHooks(makeWorld());
    h.hooks.player.x = (W - 8) * TILE;    // 玩家远右 → dir=+1 稳定（布场防空中/换向干扰）
    h.hooks.player.y = (FLOOR - 3) * TILE;
    const e = makeEnemy(h, { hp: 5000 });
    // 先落稳定在地面
    e.y = FLOOR * TILE - e.h; e.vy = 0;
    e.fixedUpdate(1 / 60, h.hooks);
    e.vx = 2; e.vy = 0; e.y = FLOOR * TILE - e.h;
    e.fixedUpdate(1 / 60, h.hooks);
    expect(e.vx).toBeCloseTo(1.6, 3);
    for (let i = 0; i < 30; i++) { if (!e.dead) e.fixedUpdate(1 / 60, h.hooks); }
    expect(Math.abs(e.vx - 1)).toBeLessThan(0.15);   // 原版平衡点 max=1
  });
});
