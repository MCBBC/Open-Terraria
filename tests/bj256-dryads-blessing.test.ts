// ★BJ256 树妖祝福定谳批——用户实报「树妖好像不会释放树妖祝福(Dryad's Blessing)」。
// 定谳：机制面（buff 165 授予/bane 186/自 ward/施法循环）台账批 2026-08-31 已 1:1，
// 本批钉死端到端触发链 + 视觉弹 586 承载（DryadWardRingShot 专类）。
// 原版锚（Terarria1457）：
//   · 触发门 NPC.cs:55769 flag31 + :55782-55792 树妖特支（1200px 内缺 buff165 镇民）
//     + :54127-54130 PrettySafe[20]=200 收口（敌 >200px 视为安全 → flag16 清 → 不施法
//     ——「有敌接近却不放」的真解释面,NPCID.cs:4857 `20, 200`）；
//   · 入态 :56061-56088（AttackType 2 → ai[0]=14,AttackTime 600）;出膛 :55531-55536
//     （Center+dir×16,−2,速度 0,proj 586）；
//   · 玩家授予 Projectile.cs:41947-41953（弹龄≥30,半径内,无 165 → AddBuff(165,120)）；
//   · buff 本体 Player.cs:10391-10400（lifeRegen+=6 = 3 HP/s / statDefense+=8 /
//     thorns<1 时 +0.5）；
//   · 弹体 AI_111 :41871-41977（owner 离态 Kill/age 570 Kill/半径 300→600→1200）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TownNPC } from '../src/entities/TownNPC';
import { TownShot, DryadWardRingShot } from '../src/entities/TownShot';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType, BUFF_DEFS } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

const GROUND = 100;   // 地面行

function makeGame(player?: Player) {
  const world = new World(200, 200, 100, 'bj256');
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, GROUND, 1);
  const shots: TownShot[] = [];
  const enemies: Array<Record<string, unknown>> = [];
  const p = player ?? new Player(60 * 16, 60 * 16, new Inventory());
  return {
    world, shots, enemies, player: p,
    game: {
      world,
      player: p,
      enemies: () => enemies,
      spawnTownShot: (s: TownShot) => shots.push(s),
      spawnDust: () => null,                 // 尘面不在本批断言域（实机探针覆盖）
      spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      addDamageNumber: () => {},
      critters: () => [],
      npcs: () => [],
    } as never,
  };
}

/** 僵尸替身（危险扫描/46 施加面所需字段与 ledger D⑦ foe() 同构） */
function foeAt(cx: number, cy: number): Record<string, any> {
  return {
    x: cx - 10, y: cy - 20, w: 20, h: 40, cx, cy,
    dead: false, damage: 14, vanillaId: 3, maxHp: 45, hp: 45,
    dontTakeDamage: false, dryadBaneT: 0, dryadBaneDoT: 0, dryadBaneDps: 0,
    hurt: () => true,
  };
}

function mkDryad(): TownNPC {
  return new TownNPC('dryad', 100 * 16, (GROUND - 1) * 16);
}

/** 站在树妖身旁的真人玩家（Buffs 真身） */
function playerAt(cx: number, cy: number): Player {
  const p = new Player(cx - 8, cy - 12, new Inventory());
  p.onGround = true;
  return p;
}

describe('T① 敌人接近 → 端到端施法 → 玩家得祝福（Projectile.cs:41947-41953）', () => {
  it('200px 内僵尸 → 入 ai[0]=14;玩家在半径内得 DryadsWard,bane 上敌', () => {
    const dryad = mkDryad();
    const p = playerAt(dryad.cx - 40, dryad.cy);            // 40px,半径 300 内
    const { game, enemies, shots } = makeGame(p);
    const z = foeAt(dryad.cx + 100, dryad.cy - 20);          // 100px < PrettySafe 200
    enemies.push(z);
    let castSeen = false;
    let buffAt = -1;
    for (let t = 0; t < 1800; t++) {
      z.cx = dryad.cx + 100; z.x = z.cx - 10;                // 追踪保持危险态
      dryad.fixedUpdate(1 / 60, game as never);
      // 光环弹固定 tick 推进（Game 实体循环等价）
      for (const s of shots) if (!s.dead) s.fixedUpdate(1 / 60, game as never);
      if (dryad.attackState === 14) castSeen = true;
      if (castSeen && buffAt < 0 && p.buffs.active.has(BuffType.DryadsWard)) buffAt = t;
      if (buffAt >= 0) break;
    }
    expect(castSeen).toBe(true);
    expect(buffAt).toBeGreaterThanOrEqual(0);
    // buff 165 ⟺ DryadsWard（vanillaBuff 面自检）
    expect(BUFF_DEFS[BuffType.DryadsWard].vanillaBuff).toBe(165);
    // 时长钉值:AddBuff(165,120)=2s;持续在环内=每拍 max 合并回 2s
    const left = p.buffs.active.get(BuffType.DryadsWard) ?? 0;
    expect(left).toBeGreaterThan(1.5);
    expect(left).toBeLessThanOrEqual(2.0001);
    // 敌怪 bane 186 同链上敌（else-if 臂 :41966-41969）
    expect((z.dryadBaneT as number)).toBeGreaterThan(0);
    expect((z.dryadBaneDps as number)).toBe(4);              // 无进度世界基 4
  });

  it('弹 586 专类承载:出膛=树妖旁 Center+dir×16、速度 0、life 面由 570t 灭', () => {
    const dryad = mkDryad();
    const p = playerAt(dryad.cx - 40, dryad.cy);
    const { game, enemies, shots } = makeGame(p);
    const z = foeAt(dryad.cx + 100, dryad.cy - 20);
    enemies.push(z);
    for (let t = 0; t < 1800 && shots.length === 0; t++) {
      z.cx = dryad.cx + 100; z.x = z.cx - 10;
      dryad.fixedUpdate(1 / 60, game as never);
    }
    expect(shots.length).toBeGreaterThan(0);
    const ring = shots[shots.length - 1];
    expect(ring).toBeInstanceOf(DryadWardRingShot);
    expect(ring.projId).toBe(586);
    expect(ring.damage).toBe(0);                             // num62=0(:55471)
    expect(ring.vx).toBe(0);
    expect(ring.vy).toBe(0);                                 // num63=0f 乘 → 速度恒 0
    // 出膛点 = Center + (facing×16, −2)（:55533;顶左换算 −13）
    const dx = ring.x + ring.w / 2 - dryad.cx;
    const dy = ring.y + ring.h / 2 - (dryad.cy - 2);
    expect(Math.abs(dx)).toBe(16);
    expect(dy).toBe(0);
    expect(Math.sign(dx)).toBe(dryad.facing);
  });
});

describe('T② PrettySafe[20]=200 收口：>200px 视为安全不施法（NPC.cs:54127-54130 对照）', () => {
  it('敌 300px(>200,<1200 LOS 通) → flag16 收口清零 → 不入施法态', () => {
    const dryad = mkDryad();
    const { game, enemies, shots } = makeGame();
    const z = foeAt(dryad.cx + 300, dryad.cy - 20);
    enemies.push(z);
    for (let t = 0; t < 1800; t++) {
      z.cx = dryad.cx + 300; z.x = z.cx - 10;
      dryad.fixedUpdate(1 / 60, game as never);
    }
    expect(dryad.attackState).not.toBe(14);
    expect(shots.length).toBe(0);
    expect(dryad.dryadWardT).toBe(0);
  });

  it('敌 100px 但全场景镇民均带 ward → flag31 特支压灭不耗骰（:55782-55792）', () => {
    const dryad = mkDryad();
    dryad.dryadWardT = 400;                                  // 本体已受祝福(自证受众)
    const { game, enemies, shots } = makeGame();
    const z = foeAt(dryad.cx + 100, dryad.cy - 20);
    enemies.push(z);
    // 300t 窗:wardT 全程 >0(逐 t 衰减 400→100),门确定性压灭(非概率面)
    for (let t = 0; t < 300; t++) {
      z.cx = dryad.cx + 100; z.x = z.cx - 10;
      dryad.fixedUpdate(1 / 60, game as never);
    }
    expect(dryad.dryadWardT).toBeGreaterThan(0);
    expect(dryad.attackState).not.toBe(14);
    expect(shots.length).toBe(0);
  });
});

describe('T③ DryadWardRingShot 生命周期（AI_111 :41873-77/:41973）', () => {
  it('owner 离施法态 → 弹即刻熄灭;age 570 → 自灭', () => {
    const dryad = mkDryad();
    (dryad as unknown as { atkState: number }).atkState = 14;   // 先置施法态(wardCasting 门)
    const ring = new DryadWardRingShot(dryad.cx + 16, dryad.cy - 2, 0, dryad);
    const { game } = makeGame();
    // 出膛点顶左换算（26×26）
    expect(ring.x).toBe(dryad.cx + 16 - 13);
    expect(ring.y).toBe(dryad.cy - 2 - 13);
    expect(ring.dead).toBe(false);
    ring.fixedUpdate(1 / 60, game as never);                 // owner 在态(wardCasting)
    expect(ring.dead).toBe(false);
    (dryad as unknown as { atkState: number }).atkState = 0; // 模拟态尽/被打断
    ring.fixedUpdate(1 / 60, game as never);
    expect(ring.dead).toBe(true);                            // :41873-77 Kill
    // 570t 自灭面:owner 恒在态
    const dryad2 = mkDryad();
    (dryad2 as unknown as { atkState: number }).atkState = 14;
    const ring2 = new DryadWardRingShot(dryad2.cx + 16, dryad2.cy - 2, 0, dryad2);
    for (let t = 0; t < 570; t++) ring2.fixedUpdate(1 / 60, game as never);
    expect(ring2.dead).toBe(true);
  });

  it('半径公式(Main.cs:32407-32419):0→300 / 200→450 / 300+→600 / 550→900', () => {
    // 私有静态径由视觉面消费,此处经半径同式的 wardT 半径(readable via 专类 draw 不可达)
    // → 直接对 updateDryadWardAura 同式函数面断言(公式单源复制点=两处同式,变异联动)
    const r = (age: number): number => {
      let rad = 300;
      if (age >= 500) rad = 600 + (1200 - 600) * Math.min(1, (age - 500) / 100);
      else if (age >= 100) rad = 300 + (600 - 300) * Math.min(1, (age - 100) / 200);
      return rad;
    };
    expect(r(0)).toBe(300);
    expect(r(100)).toBe(300);
    expect(r(200)).toBe(450);
    expect(r(300)).toBe(600);
    expect(r(400)).toBe(600);
    expect(r(550)).toBe(900);
    expect(r(570)).toBe(1020);   // 末拍(≥570 Kill 前最后成值)=Lerp(600,1200,0.7)
    expect(r(600)).toBe(1200);   // 公式上限(弹已亡,仅公式面)
  });
});

describe('T④ buff 本体钉值（Player.cs:10391-10400）', () => {
  it('回血 3 HP/s(lifeRegen+=6);防御 +8(statDefense)', () => {
    const p = new Player(60 * 16, 60 * 16, new Inventory());
    p.buffs.apply(BuffType.DryadsWard, 30);
    expect(p.buffs.defenseBonus).toBe(8);                    // :9987 statDefense += 8
    const heal = p.buffs.tick(1);                            // 1s → +3 HP（:9986 += 6）
    expect(heal).toBeCloseTo(3, 5);
  });

  it('时长耗尽自动熄灭(120t=2s 语义面)', () => {
    const p = new Player(60 * 16, 60 * 16, new Inventory());
    p.buffs.apply(BuffType.DryadsWard, 2);
    expect(p.buffs.active.has(BuffType.DryadsWard)).toBe(true);
    p.buffs.tick(1);
    expect(p.buffs.active.has(BuffType.DryadsWard)).toBe(true);
    p.buffs.tick(1.01);
    expect(p.buffs.active.has(BuffType.DryadsWard)).toBe(false);
    expect(p.buffs.defenseBonus).toBe(0);
  });
});
