// 2026-08-19 G 批收口回归：G1（groundPhysics 零钳零摩擦——跳冲量全程存活）+
// G2（AI_001 携物变体梯 NPC.cs:61088-61433 逐档）+ G5（贴角 1.4px 挪移
// :62121-62123 / 落地嵌固回退 :61932/:62124）。标杆 Terarria1456/Terraria/NPC.cs，
// 行号见各用例注释。驱动方式 = 原型直调（drive 私有 slimeAI）。
// 跳过档（无行为可断言，源码级备案）：5395 屎（PooFly 粒子编排，纯视觉无管线）/
// 1125 蜂蜜（仅 _givenName，本仓无敌怪名显示通道）/ 364 族金属矿（已由
// ground-ai-parity-fixes S9 覆盖）/ 语音变声物品尾档（天空盒世界不可达）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const W = 160, H = 140, FLOOR = 100;

function makeWorld(): World {
  const w = new World(W, H, 11, 'slime-item-ladder');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);        // dirt（repo tile 1 = vanilla sheet 0）
    st.setTile(x, FLOOR + 1, 1);
  }
  w.clock.timeOfDay = 0.9;          // 夜间（flag3 恒真，跳过白天被动档）
  return w;
}

type Proj = { x: number; y: number; vx: number; vy: number; damage: number; projId?: number };
type DustCall = { x: number; y: number; w: number; h: number; type: number; noGrav?: boolean };

function makeHooks(w: World, playerAt: { x: number; y: number } | null) {
  const enemies: Enemy[] = [];
  const projectiles: Proj[] = [];
  const dusts: DustCall[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as Proj);
    },
  };
  const px = (playerAt?.x ?? 70) * TILE, py = (playerAt?.y ?? FLOOR - 3) * TILE;
  const player = new Player(px, py, new Inventory());
  const hooks = {
    world: w, player: playerAt ? player : null,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    cutTile: () => {},
    scene: { zoneGraveyard: false },
    entities: em,
    spawnDust: (x: number, y: number, wd: number, ht: number, type: number,
      _sx?: number, _sy?: number, _a?: number, _c?: unknown, _s?: number, noGravity?: boolean) => {
      dusts.push({ x, y, w: wd, h: ht, type, noGrav: noGravity });
      return null;                    // 池不入——只记录调用参数
    },
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, dusts, player, em };
}

function spawn(h: ReturnType<typeof makeHooks>, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

afterEach(() => { vi.restoreAllMocks(); });

/** 落到地板上（vy 归零、onGround 置位）。★出生 vy=0 也至少跑 5 tick */
function settle(h: ReturnType<typeof makeHooks>, e: Enemy, n = 300): void {
  for (let i = 0; i < n; i++) {
    e.fixedUpdate(1 / 60, h.hooks);
    if (i >= 5 && e.vy === 0 && e.onGround) break;
  }
}

/** 已 settle 的蓝史莱姆（type 1，携物梯宿主）+ 指定 ai[1] */
function carrier(h: ReturnType<typeof makeHooks>, ai1: number, tx = 40): Enemy {
  const e = spawn(h, 1, tx, FLOOR - 2);
  settle(h, e);
  e.ai1 = ai1;
  e.vx = 0;
  return e;
}

const slimeAI = (e: Enemy, h: ReturnType<typeof makeHooks>) =>
  (e as unknown as Record<string, (g: GameHooks, p: Player | null) => void>)
    .slimeAI.call(e, h.hooks, h.player);

// ===========================================================================
// G1：groundPhysics 零钳零摩擦（跳冲量全程存活，NPC.cs:91533-91547 共享段语义）
// ===========================================================================
describe('G1 groundPhysics 零钳零摩擦', () => {
  it('大跳冲量 vx=3.5 全程存活：滞空 10 tick 无钳无摩擦（转向门 vx<3 不进 → 恒 3.5）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 130, y: FLOOR - 3 });
    const e = spawn(h, 59, 40, FLOOR - 2);   // 59 档：3+0.5 冲量（:62055-62057）
    settle(h, e);
    e.ai1 = 0; e.vx = 0; e.facing = 1;
    e.ai0 = -1600;                     // 大跳窗 [−2000,−1500]
    slimeAI(e, h);                     // 起跳 tick
    expect(e.vx).toBeCloseTo(3.5, 5);  // 0 + 3×1 + 0.5×1
    let airborne = e.vy < 0;
    for (let i = 0; i < 10 && airborne; i++) {
      slimeAI(e, h);
      expect(e.vx).toBeCloseTo(3.5, 5);  // 无 ±maxSpd 钳、无 ×0.98 尾段摩擦
      airborne = e.vy < 0 || !e.onGround;
    }
    expect(airborne).toBe(true);       // 10 tick 内不应落地（vy −10 起步）
  });

  it('贴地门 = 原版字面 velocity.Y==0（:61917）：携物梯空中改 vy 后不再误入跳段', () => {
    // 见 G2 气球档断言（反弹 vy 不被跳段覆写）——此用例校准控制组
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 1, 40, FLOOR - 6);
    e.vy = 3;                          // 滞空（vy≠0 → 空中转向分支）
    slimeAI(e, h);
    expect(e.vy).toBeGreaterThan(0);   // 仍下落（未走地面摩擦段）
    expect(e.vx).toBeCloseTo(0.2, 5);  // 转向步进（原版 :62130-62133，无尾段摩擦）
  });
});

// ===========================================================================
// G2：AI_001 携物变体梯（NPC.cs:61088-61433；门 = SlimeCanContainItems && ai[1]>0）
// ===========================================================================
describe('G2 携物变体梯', () => {
  it('539 史莱姆法杖物：1/300 掷中且视线可达 → 弹 1073（direction×12, 0）伤 20（:61090-61105）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 55, y: FLOOR - 3 });   // ~240px 平地视线
    const e = carrier(h, 539);
    e.facing = 1;
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0);   // Next(300)==0
    slimeAI(e, h);
    expect(rnd).toHaveBeenCalled();
    expect(h.projectiles.length).toBe(1);
    expect(h.projectiles[0].projId).toBe(1073);
    expect(h.projectiles[0].vx).toBe(12);   // direction × 12
    expect(h.projectiles[0].vy).toBe(0);
    expect(h.projectiles[0].damage).toBe(20);
  });

  it('2 泥史莱姆：贴地跳跳计数 +9/t（:61179-61186）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 2);
    e.ai0 = -1400;
    slimeAI(e, h);
    expect(e.ai0).toBe(-1400 + 1 + 1 + 9);   // flag3+1、基础+1、梯 +9
  });

  it('9 木史莱姆：防御 +16（:61187-61188）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 9);
    const def0 = e.def.defense ?? 0;
    slimeAI(e, h);
    expect(e.def.defense).toBe(def0 + 16);
  });

  it('3 石史莱姆：滞空下坠期 +2g（:61192-61199，叠共享段 +g）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 130, y: FLOOR - 3 });
    const e = spawn(h, 1, 40, FLOOR - 2);
    settle(h, e);
    // 抬到空中（vy>0 小步下坠，一 tick 不落地）
    const snap = { x: e.x, y: (FLOOR - 6) * TILE, vx: 0, vy: 1 };
    e.x = snap.x; e.y = snap.y; e.vx = snap.vx; e.vy = snap.vy;
    e.ai1 = 0;                          // 控制组（无梯）
    slimeAI(e, h);
    const vy0 = e.vy;
    e.x = snap.x; e.y = snap.y; e.vx = snap.vx; e.vy = snap.vy;
    e.ai1 = 3;                          // 石档：完全同初态重放
    slimeAI(e, h);
    expect(e.vy - vy0).toBeCloseTo(0.4 * 2, 5);   // +2×GRAVITY（梯段，vy>0 门）
  });

  it('751 云史莱姆：滞空恒 −0.6g（:61200-61204）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 130, y: FLOOR - 3 });
    const e = spawn(h, 1, 40, FLOOR - 2);
    settle(h, e);
    const snap = { x: e.x, y: (FLOOR - 6) * TILE, vx: 0, vy: 1 };
    e.x = snap.x; e.y = snap.y; e.vx = snap.vx; e.vy = snap.vy;
    e.ai1 = 0;
    slimeAI(e, h);
    const vy0 = e.vy;
    e.x = snap.x; e.y = snap.y; e.vx = snap.vx; e.vy = snap.vy;
    e.ai1 = 751;
    slimeAI(e, h);
    expect(e.vy - vy0).toBeCloseTo(-0.4 * 0.6, 5);
  });

  it('150 蛛网史莱姆：1/120 在包围盒随机格放蛛网（:61205-61221；PlaceTile 51 无锚定门）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 150);
    vi.spyOn(Math, 'random').mockReturnValue(0);   // Next(120)==0 → 盒首格
    slimeAI(e, h);
    const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
    const st = w.store;
    expect(st.type[st.idx(tx, ty)]).toBe(TILE_BY_KEY['v_51_cobweb']);
  });

  it('3086/3081 花岗岩/大理岩：防御 +16、kbResist=0（:61222-61232）', () => {
    for (const item of [3086, 3081]) {
      const w = makeWorld();
      const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
      const e = carrier(h, item);
      const def0 = e.def.defense ?? 0;
      slimeAI(e, h);
      expect(e.def.defense).toBe(def0 + 16);
      expect(e.def.knockbackResist).toBe(0);
    }
  });

  it('147 棘刺史莱姆：伤害 ×2（:61234-61237）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 147);
    const dmg0 = e.def.damage;
    slimeAI(e, h);
    expect(e.def.damage).toBe(dmg0 * 2);
  });

  it('8 火把史莱姆：仅 ftw——AddBuff(24) 永燃 + 四火系免疫（:61239-61247）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 8);
    slimeAI(e, h);
    expect(e.onFireT).toBe(0);          // 非 ftw 不燃
    w.seedFlags.getGoodWorld = true;
    e.onFire3T = 3; e.frostburnT = 3;   // 预置四火系（应被梯段等效免疫清零）
    slimeAI(e, h);
    expect(e.onFireT).toBe(3600);       // 216000t = 3600s（梯段每 tick 重续）
    expect(e.onFire3T).toBe(0);
    expect(e.frostburnT).toBe(0);
    expect(e.frostburn2T).toBe(0);
    expect(e.cursedT).toBe(0);
    w.seedFlags.getGoodWorld = false;
  });

  it('5395 屎 / 1125 蜂蜜：行为空档（PooFly 纯视觉备案 / 仅特殊名）——无副作用守卫', () => {
    for (const item of [5395, 1125]) {
      const w = makeWorld();
      const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
      const e = carrier(h, item);
      const { damage, defense } = e.def;
      const hp0 = e.hp, max0 = e.maxHp;
      slimeAI(e, h);
      expect(e.def.damage).toBe(damage);
      expect(e.def.defense).toBe(defense);
      expect(e.hp).toBe(hp0);
      expect(e.maxHp).toBe(max0);
    }
  });

  it('1124 蜂巢史莱姆：Next(60)==7 且视线可达 → 生蜂 210（归一 (−1.6,−1)×3、lai0=60、ai1=60）（:61260-61277）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 55, y: FLOOR - 3 });
    const e = carrier(h, 1124);
    vi.spyOn(Math, 'random').mockReturnValue(0.118);
    // 0.118 → Next(60)=7 ✓、Next(2)=0 → 蜂 210、Next(41)=4 → X=(4−20)×0.1=−1.6
    slimeAI(e, h);
    const bee = h.enemies.find((b) => b.vanillaId === 210 || b.vanillaId === 211);
    expect(bee).toBeTruthy();
    expect(bee!.lai0).toBe(60);
    expect(bee!.ai1).toBe(60);
    const bl = Math.hypot(-1.6, -1);
    expect(bee!.vx).toBeCloseTo((-1.6 / bl) * 3, 5);
    expect(bee!.vy).toBeCloseTo((-1 / bl) * 3, 5);
  });

  it('314 药草史莱姆：贴地 1/180 于脚下洒药草芽（泥土基座 style2，localAI[3] 计数）（:61282-61307）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 314);
    vi.spyOn(Math, 'random').mockReturnValue(0);   // 尘 1/60 与草 1/180 同时掷中
    h.dusts.length = 0;
    slimeAI(e, h);
    const st = w.store;
    const hx = Math.floor(e.cx / TILE), hy = Math.floor((e.y + e.h - 8) / TILE);
    expect(st.type[st.idx(hx, hy)]).toBe(TILE_BY_KEY['v_82_herbs_sprout']);
    expect(st.frameX[st.idx(hx, hy)]).toBe(18 * 2);   // 泥土基座 → style 2
    expect(e.lai3).toBe(1);                            // localAI[3] += 1
    expect(h.dusts.some((d) => d.type === 41)).toBe(true);   // 尘 41
  });

  it('3736 气球史莱姆：硬着陆（碰撞前 vy>4）→ 反弹 −vy×0.7，且不被跳段覆写（:61308-61315）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 3736);
    // 先耗尽 settle 尾帧的落地冲量（settle 末 tick 可能正好是一次 >4 的着陆）
    for (let i = 0; i < 20 && e.preCollideVy > 1; i++) slimeAI(e, h);
    expect(e.preCollideVy).toBeLessThanOrEqual(1);   // 静息态（每 tick 仅重力步进）
    e.vx = 0;
    e.vy = 6;                          // 下坠（vy≠0 → 当 tick 空中分支）
    slimeAI(e, h);                     // 本 tick 落地：collideY、preCollideVy=6+g
    expect(e.collideY).toBe(true);
    expect(e.preCollideVy).toBeGreaterThan(4);
    const impact = e.preCollideVy;
    slimeAI(e, h);                     // 下一 tick 梯段反弹
    // 反弹 −vy×0.7（:61312）→ 共享段重力 +g 后即本 tick 碰撞前 vy（oldVelocity
    // 取自重力之后、碰撞之前——NPC.cs:91533→:93739 时序）
    expect(e.preCollideVy).toBeCloseTo(-impact * 0.7 + 0.4, 5);
    expect(e.vy).toBeLessThan(-4);     // 空中上行（vy≠0 → 贴地门不触发、跳段不覆写）
    expect(e.vx).toBeCloseTo(0.4, 5);  // 两 tick 空中转向 0.2×2（弹跳未被摩擦/跳段篡改）
  });

  it('1345 彩纸史莱姆：尘 139-142 1/30（speedY −10、scale 1.2）（:61316-61333）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 1345);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    h.dusts.length = 0;
    slimeAI(e, h);
    expect(h.dusts.some((d) => d.type === 139)).toBe(true);
  });

  it('1103/593 淤泥/雪史莱姆：尘 135 1/3（noGravity、scale 2.5）（:61334-61369）', () => {
    for (const item of [1103, 593]) {
      const w = makeWorld();
      const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
      const e = carrier(h, item);
      vi.spyOn(Math, 'random').mockReturnValue(0);
      h.dusts.length = 0;
      slimeAI(e, h);
      const d = h.dusts.find((c) => c.type === 135);
      expect(d).toBeTruthy();
      expect(d!.noGrav).toBe(true);
    }
  });

  it('3347 化石史莱姆：alpha 125、伤害 +10、每 tick（含滞空）ai0+1（:61370-61376）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 3347);
    const dmg0 = e.def.damage;
    e.ai0 = -1400;
    slimeAI(e, h);
    expect(e.spawnAlpha).toBe(125);
    expect(e.def.damage).toBe(dmg0 + 10);
    expect(e.ai0).toBe(-1400 + 1 + 1 + 1);   // flag3+1、基础+1、梯 +1
    // 滞空也 +1（梯段在贴地门之前）
    e.vy = 3;
    const a0 = e.ai0;
    slimeAI(e, h);
    expect(e.ai0).toBe(a0 + 1);
  });

  it('29 生命水晶史莱姆：防御 +4、一次性 lifeMax ×2（满血同步）（:61377-61389）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 29);
    const def0 = e.def.defense ?? 0, hp0 = e.def.hp;
    slimeAI(e, h);
    expect(e.def.defense).toBe(def0 + 4);
    expect(e.maxHp).toBe(hp0 * 2);
    expect(e.hp).toBe(hp0 * 2);
    slimeAI(e, h);                     // 一次性门：不再翻倍
    expect(e.maxHp).toBe(hp0 * 2);
  });

  it('3609 传送带史莱姆：防+8 伤+6 + 摩擦替换段（不减速、向 direction ±0.1/t 钳 ±2.5）（:61390-61395/:61938-61948）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 3609);
    const dmg0 = e.def.damage, def0 = e.def.defense ?? 0;
    e.vx = 1;                          // 满速起步
    e.ai0 = -1400;                     // 阶段空档（纯摩擦读数）
    slimeAI(e, h);
    expect(e.def.defense).toBe(def0 + 8);
    expect(e.def.damage).toBe(dmg0 + 6);
    expect(e.vx).toBeCloseTo(1.1, 5);  // 1 + 0.1（原版 :61941-61944；对照组应为 0.8×1=0.8）
  });

  it('174 地狱石史莱姆：防+14 伤+20、一次性 kb÷3 + HP×2 + scale×1.2（:61396-61425）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 174);
    const dmg0 = e.def.damage, def0 = e.def.defense ?? 0, kb0 = e.def.knockbackResist, hp0 = e.def.hp;
    const w0 = e.w, h0 = e.h;
    slimeAI(e, h);
    expect(e.def.defense).toBe(def0 + 14);
    expect(e.def.damage).toBe(dmg0 + 20);
    expect(e.def.knockbackResist).toBeCloseTo(kb0 / 3, 6);
    expect(e.maxHp).toBe(hp0 * 2);
    expect(e.hp).toBe(hp0 * 2);
    expect(e.w).toBe(Math.trunc(w0 * 1.2));
    expect(e.h).toBe(Math.trunc(h0 * 1.2));
    slimeAI(e, h);                     // 一次性门：不再重扩
    expect(e.maxHp).toBe(hp0 * 2);
    expect(e.w).toBe(Math.trunc(w0 * 1.2));
  });

  it('非携物族不入梯：ai1>0 但 vanillaId 不在 SlimeCanContainItems → 无档位效果', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = spawn(h, 16, 40, FLOOR - 2);   // 母史莱姆（type 16 不在 {1,59,147,184,537}）
    settle(h, e);
    e.ai1 = 9;                          // 木档 id
    const def0 = e.def.defense ?? 0;
    slimeAI(e, h);
    expect(e.def.defense).toBe(def0);   // 无 +16
  });
});

// ===========================================================================
// G5：贴角挪移（:62121-62127）+ 落地嵌固回退（:61932-61935 同款）
// ===========================================================================
describe('G5 贴角挪移 / 落地嵌固回退', () => {
  it('1.4px 贴角挪移：滞空 + collideX + |vx|==0.2 → 后退 1.4×direction（:62121-62123）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 90, y: FLOOR - 3 });
    // 控制组：hitWall=false，其余同态
    const x0 = 40 * TILE;
    const run = (hitWall: boolean): number => {
      const e = spawn(h, 1, 40, FLOOR - 6);
      e.vy = 3;                        // 滞空
      e.facing = 1;
      e.vx = 0.2;                      // 原版 clip-to-gap 残余值（float 精确）
      e.hitWall = hitWall;             // collideX（上一 tick 位移段产物）
      slimeAI(e, h);
      return e.x;
    };
    const control = run(false);
    const nudged = run(true);
    expect(nudged - control).toBeCloseTo(-1.4, 5);
  });

  it('落地嵌固回退：贴地 + collideY + oldVelocity.Y≠0 + 位置嵌实心 → x −= vx+direction（:61932-61935）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 70, y: FLOOR - 3 });
    const e = carrier(h, 0);
    const st = w.store;
    // 在史莱姆头顶行嵌一块实心（SolidCollision 命中）
    const tx = Math.floor(e.cx / TILE), ty = Math.floor(e.y / TILE);
    st.setTile(tx, ty, 1);
    e.collideY = true;
    e.preCollideVy = 0.4;              // 贴地态碰撞前 vy（重力步进值）
    const x0 = e.x;
    slimeAI(e, h);
    expect(e.x).toBeCloseTo(x0 - 1, 5);   // vx=0（贴地摩擦清零）→ 净退 direction×1
  });
});
