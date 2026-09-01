// GC 实体契约三点回归（2026-08-31 清零批二波）：
//   GB1 MissileProj/Dart/WeaponProj(实战锚=DaybreakFlare 镖族) magic 弹接入
//       ghostHurtOnHit——按弹 id 的 vanilla-projectiles.json magic 归属面数据门挂接，
//       dealt=Enemy.lastStrikeDealt（StrikeNPC num41 等价位,Projectile.cs :13712/:13881）
//   GB2 GHOST_BUDGET 平移为 player.ghostDmg（Player.cs:991/:24652-24660 每拍 −6.6666665；
//       三函数接口经 bindGhostBudgetHost 路由到玩家面，未绑定回退 legacy 池）
//   GB3 ballistaPanic（buff 205,Player.cs:38526 SquireT2 受击 AddBuff(205,300)）population 位
//       补齐 + dd2SetFlags 读面接通
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { MagicMissileProj } from '../src/entities/MissileProj';
import { DaybreakFlare } from '../src/entities/WeaponProj';
import { SpectreSoulProj, bindGhostBudgetHost, _resetGhostBudgetForTest,
  decayGhostBudget, ghostBudgetPeek } from '../src/entities/SpectreSoulProj';
import { dd2SetFlags } from '../src/entities/MinionProj';

// ---------------------------------------------------------------------------
// 桩基建
// ---------------------------------------------------------------------------

interface HitSpy {
  x: number; y: number; w: number; h: number;
  hp?: number; maxHp?: number; lastStrikeDealt?: number;
  dead?: boolean; dontTakeDamage?: boolean; iframes?: number;
  vanillaId?: number | null;
  def?: { friendly?: boolean };
  id?: number;
  hurts: Array<{ dmg: number; kbx: number }>;
}

function enemyStub(x: number, y: number, w = 240, h = 240, dealt = 70): HitSpy {
  return {
    x, y, w, h, maxHp: 100, lastStrikeDealt: dealt,
    dead: false, id: 55, vanillaId: 15, def: { friendly: false },
    hurts: [],
    hurt(this: HitSpy, dmg: number, kbx: number) {
      this.hurts.push({ dmg, kbx });
      return true;
    },
  } as unknown as HitSpy;
}

function hookStub(world: World, enemies: unknown[], playerLike: unknown,
  added: unknown[], notes: Array<[number, number]>) {
  return {
    world,
    player: playerLike,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    entities: { add: (e: unknown) => added.push(e), nextId: 1 },
    cutTile: () => {},
    spawnParticles: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
    playSfxFiles: () => {},
    playSfxFile: () => {},
    playSfxWav: () => {},
    playSfx: () => {},
    addDamageNumber: () => {},
    applyLifeSteal: () => 0,
    noteNpcPlayerImmune: (npcId: number, t: number) => notes.push([npcId, t]),
  } as never as Parameters<typeof MagicMissileProj.prototype.fixedUpdate>[1];
}

function maskPlayer(): Record<string, unknown> {
  // 裸形玩家：无 ghostDmg 字段 ⇒ 桥回退 legacy 池（GB2 的宿主路由单测另测）
  return { dead: false, cx: 500, cy: 500, equipStats: { setBonus: { ghostHurt: true } } };
}

// ---------------------------------------------------------------------------
// GB1：MissileProj magic 弹 ghostHurt proc（projId 34 Flamelash,数据面 magic=true）
// ---------------------------------------------------------------------------

describe('GB1 MissileProj(34) ghostHurtOnHit 接入（Projectile.cs:13881 触发位）', () => {
  it('mask 在身 + magic 弹命中 → 受害者 Center 出浮魂弹 356,damage=弹基伤', () => {
    const world = new World(64, 64, 7, 'gb1');
    const e = enemyStub(world.w * 16 / 2 - 120, world.h * 16 / 2 - 120);
    const added: unknown[] = [];
    const notes: Array<[number, number]> = [];
    const game = hookStub(world, [e], maskPlayer(), added, notes);
    const proj = new MagicMissileProj(e.x + e.w / 2, e.y + e.h / 2, 0, 0, {
      projId: 34, damage: 80, knockback: 2, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 }),
      payMana: () => true,
    });
    proj.fixedUpdate(1 / 60, game);
    expect(e.hurts.length).toBe(1);                                  // StrikeNPC 已结算
    const orbs = added.filter((a) => a instanceof SpectreSoulProj);
    expect(orbs.length).toBe(1);
    expect((orbs[0] as SpectreSoulProj).damage).toBe(80);            // num=this.damage（基伤）
  });

  it('无 mask ⇒ 整链不触发（零行为变更面）', () => {
    const world = new World(64, 64, 7, 'gb1-b');
    const e = enemyStub(world.w * 16 / 2 - 120, world.h * 16 / 2 - 120);
    const added: unknown[] = [];
    const notes: Array<[number, number]> = [];
    const bare = { dead: false, cx: 500, cy: 500 };                  // 无套装旗标
    const game = hookStub(world, [e], bare, added, notes);
    const proj = new MagicMissileProj(e.x + e.w / 2, e.y + e.h / 2, 0, 0, {
      projId: 34, damage: 80, knockback: 2, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: 0, y: 0 }), payMana: () => true,
    });
    proj.fixedUpdate(1 / 60, game);
    expect(added.filter((a) => a instanceof SpectreSoulProj).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GC1 同场验证：34 局部免疫面写 0 清全局窗；镖族旁路无写
// ---------------------------------------------------------------------------

describe('GC1 写方桥实体位（34=usesLocalNPCImmunity → 写0；598 标枪族旁路）', () => {
  it('MissileProj(34) 命中尾 noteNpcPlayerImmune(id,0)', () => {
    const world = new World(64, 64, 7, 'gc1');
    const e = enemyStub(world.w * 16 / 2 - 120, world.h * 16 / 2 - 120);
    const notes: Array<[number, number]> = [];
    const game = hookStub(world, [e], { dead: false }, [], notes);   // 无 mask 省 GC 面
    const proj = new MagicMissileProj(e.x + e.w / 2, e.y + e.h / 2, 0, 0, {
      projId: 34, damage: 80, knockback: 2, useTime: 20,
      channelCb: () => false, aimCb: () => ({ x: 0, y: 0 }), payMana: () => true,
    });
    proj.fixedUpdate(1 / 60, game);
    expect(notes).toContainEqual([55, 0]);
  });

  it('DaybreakFlare(598)：hurt 结算但桥恒无写（顶层分派旁路整条梯子）+ 非 magic 不出浮魂弹', () => {
    const world = new World(64, 64, 7, 'gc1-d');
    const e = enemyStub(world.w * 16 / 2 - 120, world.h * 16 / 2 - 120, 200, 200);
    const added: unknown[] = [];
    const notes: Array<[number, number]> = [];
    const game = hookStub(world, [e], maskPlayer(), added, notes);
    const flare = new DaybreakFlare(e.x + e.w / 2, e.y + e.h / 2, 0, 0, 50, 3);
    flare.fixedUpdate(1 / 60, game);
    expect(e.hurts.length).toBeGreaterThan(0);
    expect(notes.filter((n) => n[0] === 55)).toEqual([]);
    expect(added.filter((a) => a instanceof SpectreSoulProj).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GB2：预算池真源平移 player.ghostDmg
// ---------------------------------------------------------------------------

describe('GB2 预算池真源 = player.ghostDmg（Player.cs:991/:24654）', () => {
  it('bindGhostBudgetHost 后三函数读写全部落玩家面', () => {
    const host = { ghostDmg: 0 };
    bindGhostBudgetHost(host);
    try {
      _resetGhostBudgetForTest(100);
      expect(host.ghostDmg).toBe(100);                 // reset 直写宿主
      expect(decayGhostBudget(123456)).toBe(100);      // 宿主面按拍衰减(时间戳参数无用武之地)
      expect(host.ghostDmg).toBe(100);
      host.ghostDmg = 40;
      expect(ghostBudgetPeek()).toBe(40);
    } finally {
      _resetGhostBudgetForTest(0);                     // 复位交还 legacy 面
    }
    expect(ghostBudgetPeek()).toBe(0);                 // 解绑后回归 legacy 池读数
  });

  it('Player.fixedUpdate 每拍 −6.6666665 钳非负（原版 Update 内位置 :24652-24660）', async () => {
    const w = new World(64, 64, 9, 'gb2');
    const { Player: P } = await import('../src/entities/Player');
    const { Inventory } = await import('../src/items/Inventory');
    void P; void Inventory;                           // 实例用下方延迟 import 双件套
    const p = await makePlayer();
    p.x = 30 * 16; p.y = 10 * 16;
    p.ghostDmg = 25;
    const game = {
      world: w, enemies: () => [], critters: () => [], npcs: () => [],
      entities: { nextId: 1, add: () => {} },
      playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
      spawnParticles: () => {}, spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
      addDamageNumber: () => {}, damagePlayer: (): number => 0,
    } as never as Parameters<typeof p.fixedUpdate>[1];
    for (let i = 0; i < 3; i++) p.fixedUpdate(1 / 60, game);
    expect(p.ghostDmg).toBeCloseTo(25 - 3 * 6.6666665, 4);
    p.fixedUpdate(1 / 60, game);                       // 再一拍越 0 → 钳非负
    expect(p.ghostDmg).toBe(0);
  });

  async function makePlayer() {
    const { Player: P } = await import('../src/entities/Player');
    const { Inventory } = await import('../src/items/Inventory');
    return new P(30 * 16, 10 * 16, new Inventory());
  }
});

// ---------------------------------------------------------------------------
// GB3：ballistaPanic population 位 + dd2SetFlags 读面
// ---------------------------------------------------------------------------

describe('GB3 ballistaPanic（buff 205,Player.cs:38526 SquireT2 受击 AddBuff(205,300)）', () => {
  async function squirePlayer() {
    const { Player: P } = await import('../src/entities/Player');
    const { Inventory } = await import('../src/items/Inventory');
    const p = new P(400, 400, new Inventory());
    // equipStats 冻结不可注入——实例覆盖 computeEquipStats 装配 SquireT2 summonSet 位
    const base = Object.getPrototypeOf(p).constructor.prototype;
    void base;
    (p as unknown as { computeEquipStats: () => Record<string, unknown> }).computeEquipStats =
      (() => ({ summonSet: { squireT2: true } })) as never;
    return p;
  }

  function dmgHooks(w: World) {
    return {
      world: w, enemies: () => [], critters: () => [], npcs: () => [],
      entities: { nextId: 1, add: () => {} },
      playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
      spawnParticles: () => {}, spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
      addDamageNumber: () => {}, damagePlayer: (): number => 0,
    } as never as Parameters<Player['fixedUpdate']>[1];
  }

  it('受击 → ballistaPanicT=300t；dd2SetFlags().ballistaPanic 翻真（弩车冷却 60/30 档入口）', async () => {
    const p = await squirePlayer();
    p.damage(10, 380, 400);
    expect((p as unknown as { ballistaPanicT: number }).ballistaPanicT).toBe(300);
    expect(dd2SetFlags(p).ballistaPanic).toBe(true);
    // 显式位后备（GW 直连面）仍通
    expect(dd2SetFlags({ ballistaPanic: true } as never).ballistaPanic).toBe(true);
  });

  it('非 SquireT2：不授 panic；每拍衰减归 0 后读面回落 false', async () => {
    const p = await squirePlayer();
    (p as unknown as { computeEquipStats: () => Record<string, unknown> }).computeEquipStats =
      (() => ({})) as never;                            // 摘掉 summonSet
    const game = dmgHooks(new World(64, 64, 11, 'gb3b'));
    p.damage(10, 380, 400);
    expect((p as unknown as { ballistaPanicT: number }).ballistaPanicT).toBe(0);
    expect(dd2SetFlags(p).ballistaPanic).toBe(false);
    (p as unknown as { ballistaPanicT: number }).ballistaPanicT = 300;
    p.iframes = 0;
    p.hp -= 0;                                          // 保持存活态走 fixedUpdate 衰减段
    for (let i = 0; i < 310 && (p as unknown as { ballistaPanicT: number }).ballistaPanicT > 0; i++) {
      p.fixedUpdate(1 / 60, game);
    }
    expect((p as unknown as { ballistaPanicT: number }).ballistaPanicT).toBe(0);
    expect(dd2SetFlags(p).ballistaPanic).toBe(false);
  });
});
