// 清零收敛批·玩家受击域（A1 荆棘反射 / A2 环境伤 msg117 漏斗 / A3 免疫桶联动）
//   基准：Terarria1457/Terraria/Player.cs
//   A1：Update_NPCCollision 反射前置面 :31605-31668 —— 反射量=(int)(num4×num2) 钳 1000
//       （trunc）、turtleThorns 覆写 2(:31610)、CanParryAgainst(:31614-17) → ×2/kb5/
//       Hurt 跳过 + GiveImmuneTimeForCollisionAttack(:31667)+AddBuff(198,300)(:31668)、
//       resistCold(Warmth) 在两反射支【之后】(:31657-59)。
//   A2：岩浆(:27918 桶4/dir0)/摔落(:25540/:25569 immune=false 预清+dir0)/虚空/
//       触格伤(:29212 桶0/dir0)各站改走 Game.damagePlayer 通用漏斗；溺水为直扣通道
//       （:23449 statLife-=2,无 Hurt/Send 点）构造性反例在案；砸压族（巨石/落沙
//       Game.ts 碰撞站）已在漏斗。
//   A3：SetImmuneTimeForAllTypes(:38298-306 无条件满填)与 Lava/WrongBugNet 特殊桶联动；
//       Hurt 入口分桶门(:38493)/写入(:38674-83)与太阳门 Counter 集(:38591)跨漏斗保持。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import { TILE_BY_KEY } from '../src/data/tiles';
import { Game } from '../src/core/Game';
import {
  getGlobalHurtBuckets, registerGlobalHurtBuckets, ImmunityCooldownID,
  IMMUNITY_COOLDOWN_COUNT, HurtCooldownBuckets,
  type HurtCooldownBuckets as BucketTable,
} from '../src/player/HurtCooldownBuckets';
import { COLD_DAMAGE_NPCS, applyBannerDamageDealt } from '../src/entities/projTargets';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import type { Enemy } from '../src/entities/Enemy';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

// ---- 漏斗壳（Game.prototype 桩,对齐 pvp-settle-broadcast 手法） --------------
interface ReflectCall { d: number; kbx: number; kby: number }
function mkShell(opts?: { net?: boolean }) {
  const g = Object.create(Game.prototype) as Record<string, any>;
  const w = new World(96, 96, 7, 'hurt-domain');
  const p = new Player(60 * 16, 60 * 16, new Inventory());
  const hurtCalls: ReflectCall[] = [];
  const floats: Array<{ v: number; color?: string }> = [];
  const enemyBase = {
    cx: 66 * 16, cy: 61 * 16, x: 66 * 16 - 12, y: 60 * 16, w: 24, h: 42,
    vx: 1.5, vy: 0, vanillaId: 3, dead: false, dontTakeDamage: false,
    def: { damage: 40, name: 'Zombie' },
    hurt: vi.fn((d: number, kbx: number, kby: number): number => {
      hurtCalls.push({ d, kbx, kby });
      return d;
    }),
  };
  g.player = p;
  g.world = w;
  g._bannerNpcs = new Set<number>();                 // bannerNpcActive 真身读此集合
  g.sfx = { play: vi.fn(), playWavFile: vi.fn() };   // playSfxWav 真身的 this.sfx 面
  g.remotePlayerProxies = [];
  g.enemies = (): unknown[] => [];
  g.critters = (): unknown[] => [];
  g.addDamageNumber = vi.fn(
    (_x: number, _y: number, v: number, _c: boolean, color?: string): void => {
      floats.push({ v, color });
    });
  g.spawnParticles = vi.fn();
  g.entities = { add: vi.fn() };
  g.recorder = undefined;
  if (opts?.net) {
    g.net = { active: true, mySlot: 3,
      notifyPlayerHurtSettled: vi.fn(), sendPlayerHurt: vi.fn() };
  }
  return {
    g, p, w, hurtCalls, floats,
    enemy: enemyBase as unknown as Enemy & Record<string, any>,
    hit(dmg: number, contactOnly = true): number {
      return (g.damagePlayer as (...a: unknown[]) => number)
        .call(g, dmg, enemyBase.cx, enemyBase.cy, enemyBase, contactOnly);
    },
  };
}

afterEach(() => registerGlobalHurtBuckets(null));

describe('A1 荆棘反射面（Game.damagePlayer contactOnly 前置段）', () => {
  it('药水 thorns=1：反 (int)(dmg×1)，无二次 ±15% 复掷；kb=10×0.65 方向推离玩家', () => {
    const s = mkShell();
    s.p.buffs.apply(BuffType.Thorns, 30);
    const base = s.hurtCalls.length;
    const hpBefore = s.p.hp;
    const ret = s.hit(37);
    expect(s.hurtCalls.length - base).toBe(1);                        // 单支
    expect(s.hurtCalls[base].d).toBe(Math.min(1000, Math.trunc(37 * 1)));
    const num3 = s.enemy.cx + s.enemy.w / 2 < s.p.cx + s.p.w / 2 ? 1 : -1;
    expect(s.hurtCalls[base].kbx).toBe(-num3 * 10 * 0.65);            // :31642
    expect(ret).toBeGreaterThan(0);
    expect(s.p.hp).toBeLessThan(hpBefore);
  });

  it('★位次 resistCold 后置：Warmth 只折进身伤，不折反射量（:31657-59）', () => {
    const s = mkShell();
    s.p.buffs.apply(BuffType.Thorns, 30);
    s.p.buffs.apply(BuffType.Warmth, 30);
    const coldVid = [...COLD_DAMAGE_NPCS][0];
    if (!coldVid) throw new Error('COLD_DAMAGE_NPCS 为空');
    (s.enemy as unknown as { vanillaId: number }).vanillaId = coldVid;
    const hpBefore = s.p.hp;
    s.hit(40);
    expect(s.hurtCalls[0].d).toBe(40);                                // 反射吃原值
    // 进身伤按 ×0.7 折后走 Player.damage 防御链（经典 defF=0.5）：逐式复算对拍
    const warmed = Math.trunc(40 * 0.7);
    const defF = 0.5;
    expect(hpBefore - s.p.hp).toBe(Math.max(1, Math.round((warmed - s.p.defense * defF))));
  });

  it('海龟套覆写 2 + 上限 1000,trunc 非四舍五入（:31610-11/:31637-39）', () => {
    const s = mkShell();
    s.p.inv.armor[0] = { id: iid(1316), stack: 1 };   // Turtle Helmet h99
    s.p.inv.armor[1] = { id: iid(1317), stack: 1 };   // Turtle Scale Mail b65
    s.p.inv.armor[2] = { id: iid(1318), stack: 1 };   // Turtle Leggings l54
    expect(s.p.turtleSet).toBe(true);
    let base = s.hurtCalls.length;
    s.hit(900);
    expect(s.hurtCalls[base].d).toBe(1000);           // min(1000, trunc(1800))
    s.p.hp = s.p.maxHp;                               // 补满防死亡拦截
    s.p.dead = false;                                 // 首拍已致死的漏斗死亡态复位
    s.p.iframes = 0;                                  // 出无敌窗再二次命中(flag3 门)
    base = s.hurtCalls.length;
    s.hit(26);                                        // trunc(26×2)=52（round 为 53）
    expect(s.hurtCalls[base].d).toBe(52);
  });

  it('树妖祝福 165：<1 补 0.5（trunc(40×0.5)=20）', () => {
    const s = mkShell();
    s.p.buffs.apply(BuffType.DryadsWard, 30);
    s.hit(40);
    expect(s.hurtCalls[0].d).toBe(20);
  });

  it('甲虫减伤与反射互不乘算：反=num4 原基准,endurance 只作用于本体实扣', () => {
    const s = mkShell();
    s.p.buffs.apply(BuffType.Thorns, 30);
    // 甲虫防御链经真实聚合拉起（beetleDef ⇒ endurance×0.15×orbs 在 Player.damage 内）
    s.p.inv.armor[0] = { id: iid(2199), stack: 1 };   // Beetle Helmet
    s.p.inv.armor[1] = { id: iid(2201), stack: 1 };   // Beetle Shell
    s.p.inv.armor[2] = { id: iid(2202), stack: 1 };   // Beetle Leggings
    expect(s.p.equipStats.beetleDef).toBe(true);
    s.p.beetleOrbs = 3;
    const hpBefore = s.p.hp;
    const dealtBefore = s.hurtCalls.length;
    const ret = s.hit(50);
    expect(s.hurtCalls[dealtBefore].d).toBe(50);      // 反射未乘 defense/endurance/banner
    expect(ret).toBeLessThan(50);                     // 本体实扣吃到甲虫减伤 ★
    expect(s.p.beetleOrbs).toBe(2);                   // 受击掉球(:38608-25)
    expect(s.p.hp).toBeGreaterThan(hpBefore - 50);
  });

  it('CanParryAgainst：盾窗+面向+敌速非零 ⇒ 免伤(Hurt 跳过)+反 ×2+kb5+碰撞免疫窗+buff198', () => {
    const s = mkShell();
    s.p.facing = 1;
    (s.enemy as unknown as { cx: number }).cx = 70 * 16;
    s.p.shieldParryTimeLeft = 5;
    s.p.buffs.apply(BuffType.Thorns, 30);
    const hpBefore = s.p.hp;
    const ret = s.hit(50);
    expect(ret).toBe(0);                              // :31661 flag=false 分支=Hurt 不结算
    expect(s.p.hp).toBe(hpBefore);                    // 免伤
    expect(s.hurtCalls.length).toBe(1);               // 单反 ×2
    expect(s.hurtCalls[0].d).toBe(100);               // trunc(50×2)
    // 敌在玩家右 ⇒ num3=-1 ⇒ 反射方向 -num3=+1 推离玩家;kb 变量共享改 5（:31616/:31642）
    expect(s.hurtCalls[0].kbx).toBe(1 * 5 * 0.65);
    expect(s.hurtCalls[0].kby).toBe(-2);
    expect(s.p.iframes).toBeGreaterThanOrEqual(30);   // :31667 longInvince=false 档
    expect((s.p as unknown as { parryDamageBuff: boolean }).parryDamageBuff).toBe(true);
    expect(s.p.shieldParryTimeLeft).toBe(0);
  });

  it('仙人掌套（裸套）：单发 15;叠 thorns → 两支叠加（:31644-56 与 thorns 支并存）', () => {
    const s = mkShell();
    s.p.inv.armor[0] = { id: iid(894), stack: 1 };
    s.p.inv.armor[1] = { id: iid(895), stack: 1 };
    s.p.inv.armor[2] = { id: iid(896), stack: 1 };
    expect(s.p.cactusSet).toBe(true);
    let base = s.hurtCalls.length;
    s.hit(33);
    expect(s.hurtCalls.slice(base).map((c) => c.d)).toEqual([15]);
    s.p.buffs.apply(BuffType.Thorns, 30);
    s.p.iframes = 0;                                  // 出无敌窗再命中(flag3 门)
    base = s.hurtCalls.length;
    s.hit(33);
    expect(s.hurtCalls.slice(base).map((c) => c.d)).toEqual([33, 15]);
  });

  it('flag3 免疫门：General 无敌帧吞命中 ⇒ thorns/cactus 两支皆不反（:31630-31633）', () => {
    const s = mkShell();
    s.p.buffs.apply(BuffType.Thorns, 30);
    s.p.iframes = 10;
    const base = s.hurtCalls.length;
    s.hit(40);
    expect(s.hurtCalls.length - base).toBe(0);
  });

  it('闪避族早退不回滚已发出的反射（微光免伤——反射面早于 Hurt 内部早退族）', () => {
    const s = mkShell();
    s.p.buffs.apply(BuffType.Thorns, 30);
    s.p.shimmering = true;
    const hpBefore = s.p.hp;
    s.hit(45);
    expect(s.hurtCalls.length).toBe(1);               // 反射已出
    expect(s.p.hp).toBe(hpBefore);                    // 本体免伤（shimmer 早退族）
  });

  it('弹幕命中（非 contactOnly）永不触发反射——原版反射仅在 Update_NPCCollision 循环内', () => {
    const s = mkShell();
    s.p.buffs.apply(BuffType.Thorns, 30);
    s.hit(45, false);
    expect(s.hurtCalls.length).toBe(0);
  });
});

describe('A2 环境伤四站 msg117 漏斗（dir/kb/桶/飘字单点）', () => {
  function envHarness(w: World, p: Player) {
    const captures: Array<{ args: unknown[]; chanId: number | undefined }> = [];
    const hooks = {
      world: w,
      player: p,
      enemies: (): unknown[] => [],
      critters: (): unknown[] => [],
      projectiles: (): unknown[] => [],
      spawnDrop: () => null,
      damagePlayer: vi.fn(function (this: null, ...args: unknown[]): number {
        const chan = (p as unknown as { __swNextHitBucket?: { id: number } }).__swNextHitBucket;
        captures.push({ args, chanId: chan?.id });
        return 40;
      }),
      addDamageNumber: vi.fn(),
      cutTile: vi.fn(),
      breakTile: vi.fn(),
      fellCactus: vi.fn(),
      onEnemyKilled: vi.fn(),
      spawnEnemy: vi.fn(),
      spawnParticles: vi.fn(),
      broadcastParticleOrchestra: vi.fn(),
      notifyInventoryChanged: vi.fn(),
      playSfx: vi.fn(),
      playSfxFiles: vi.fn(),
      showPickupLabel: vi.fn(),
      punchCamera: vi.fn(),
      achievements: undefined,
      sfx: { play: vi.fn(), playWavFile: vi.fn() },
    };
    return { hooks, captures };
  }
  /** 通用小环境：f=世界布景回调（拿到 store），返回摆好的玩家 */
  function tallWorld(seed: number): World {
    return new World(72, 96, seed, `hurt-a2-${seed}`);
  }

  it('岩浆站：kb=false/hitDir=0/Lava(4) 桶注入/OnFire 只在实扣>0 授予', () => {
    registerGlobalHurtBuckets(new HurtCooldownBuckets());
    const w = tallWorld(11);
    const st = w.store;
    for (let x = 20; x <= 40; x++) for (let y = 43; y <= 50; y++) st.setLiquid(x, y, 220, 2);
    const p = new Player(28 * 16, 42 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBeGreaterThanOrEqual(1);
    const first = captures[0];
    expect(first.args[0]).toBe(80);                              // 主档无玫瑰
    expect(first.args[3]).toBeUndefined();                       // attacker=undefined
    expect(first.args[4]).toBe(false);                           // contactOnly=false
    expect(first.args[5]).toBe(false);                           // pvp=false
    expect(first.args[6]).toBe(false);                           // knockback=false ★
    expect((first.args[7] as { hitDir?: number }).hitDir).toBe(0);// FR3-F 0 直发
    expect((first.args[7] as { floatDealt?: number }).floatDealt).toBeDefined();
    expect(first.chanId).toBe(ImmunityCooldownID.Lava);          // ★桶 4
    expect((p as unknown as { __swNextHitBucket?: unknown }).__swNextHitBucket)
      .toBeUndefined();                                          // 出站即清
    expect(p.buffs.has(BuffType.OnFire)).toBe(true);             // :27921 num85>0 门
  });

  it('Lava 独立桶门：General 免疫窗不再吞岩浆伤,窗内关门窗外开(:27889)', () => {
    const table = new HurtCooldownBuckets();
    registerGlobalHurtBuckets(table);
    table.setAll(60);                                 // 全场免疫窗（含 Lava,A3 同款形态）
    table.tick();
    const w = tallWorld(12);
    const st = w.store;
    for (let x = 20; x <= 40; x++) for (let y = 43; y <= 50; y++) st.setLiquid(x, y, 220, 2);
    const p = new Player(28 * 16, 42 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBe(0);                  // Lava 桶窗未过 ⇒ 关门不下发
    expect(table.remaining(ImmunityCooldownID.Lava)).toBeGreaterThan(0);
    for (let i = 0; i < 120 && table.remaining(ImmunityCooldownID.Lava) > 0; i++) table.tick();
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBeGreaterThanOrEqual(1); // 窗外恢复受理
  });

  it('摔落站：immune=false 预清(:25566)+dir0/kb 假;落地不弹起(vx 零漂移)', () => {
    const w = new World(80, 80, 13, 'hurt-fall');
    const st = w.store;
    for (let x = 10; x <= 46; x++) st.setTileSilent(x, 44, TILE_BY_KEY['dirt']);
    const p = new Player(28 * 16, 40 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    for (let i = 0; i < 45; i++) p.fixedUpdate(1 / 60, hooks as never);   // 先落定
    expect(captures.length).toBe(0);
    p.iframes = 9;                                    // 旧实现被 General 吞;原版先清 immune
    p.fallStartY = p.y - 40 * 16;                     // 落差 40 格 ⇒ (40−25)×10=150
    const vyBefore = p.vy;
    p.vx = 0;
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBe(1);
    expect(captures[0].args[0]).toBe(150);
    expect(captures[0].args[6]).toBe(false);          // hitDirection=0 ⇒ 击退段整跳
    expect((captures[0].args[7] as { hitDir?: number }).hitDir).toBe(0);
    expect(captures[0].chanId).toBeUndefined();       // General 缺省不注桶
    expect(p.vx).toBe(0);                             // ★旧漂移修复锚：不再 ±4.5 弹起
    expect(Math.abs(p.vy - vyBefore)).toBeLessThan(0.6);
  });

  it('石化摔落分支：（格−2）×20 同属漏斗家族（:25539-25545）', () => {
    const w = new World(80, 80, 17, 'hurt-stonefall');
    const st = w.store;
    for (let x = 10; x <= 46; x++) st.setTileSilent(x, 44, TILE_BY_KEY['dirt']);
    const p = new Player(28 * 16, 40 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    for (let i = 0; i < 45; i++) p.fixedUpdate(1 / 60, hooks as never);
    p.fallStartY = p.y - 30 * 16;                     // 30 格 ⇒ (30−2)×20=560
    p.buffs.apply(BuffType.Stoned, 5);
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBe(1);
    expect(captures[0].args[0]).toBe(560);
  });

  it('触格伤（尖刺“砸压”家族）：TileContactDamage(0) 桶注入+dir0/kb 假', () => {
    registerGlobalHurtBuckets(new HurtCooldownBuckets());
    const w = tallWorld(19);
    const st = w.store;
    for (let x = 10; x <= 60; x++) st.setTileSilent(x, 54, TILE_BY_KEY['dirt']);
    st.setTileSilent(34, 52, TILE_BY_KEY['v_48_spike']);   // vanilla sheet 48=尖刺 60
    st.setTileSilent(35, 52, TILE_BY_KEY['v_48_spike']);
    const p = new Player(33 * 16, 44 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    for (let i = 0; i < 45; i++) p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBeGreaterThanOrEqual(1);
    expect(captures[0].args[0]).toBe(60);
    expect(captures[0].chanId).toBe(ImmunityCooldownID.TileContactDamage);   // ★桶 0
    expect(captures[0].args[6]).toBe(false);
    expect((captures[0].args[7] as { hitDir?: number }).hitDir).toBe(0);
  });

  it('虚空坠杀：9999 直入漏斗 General 缺省,标 noLocalFloat（原文本无飘字面）', () => {
    const w = new World(64, 64, 23, 'hurt-void');
    const p = new Player(30 * 16, 900, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    p.y = 64 * 16 + 101;                                          // > maxY+100
    p.fixedUpdate(1 / 60, hooks as never);
    const entry = captures.find((c) => c.args[0] === 9999);
    expect(entry).toBeDefined();
    expect(entry!.args[6]).toBe(false);
    expect((entry!.args[7] as { noLocalFloat?: boolean }).noLocalFloat).toBe(true);
  });

  it('溺水不走 Hurt/漏斗：直扣 HP 且漏斗恒不被调——原版 :23449 无 Send 点（构造性反例）', () => {
    const w = tallWorld(29);
    const st = w.store;
    for (let x = 20; x <= 40; x++) st.setTileSilent(x, 48, TILE_BY_KEY['dirt']);
    for (let x = 20; x <= 40; x++) for (let y = 26; y <= 46; y++) st.setLiquid(x, y, 220, 1);
    const p = new Player(28 * 16, 32 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    p.breath = 3;                                     // 快进：两拍即见直扣
    p.hp = 4;                                         // 低血量促死（直扣 2/批）
    const hpBefore = p.hp;
    for (let i = 0; i < 120 && !p.dead; i++) {
      p.fixedUpdate(1 / 60, hooks as never);
      if (!p.dead) { p.x = 28 * 16; p.y = 32 * 16; p.vy = 0; }  // 保持浸没
    }
    expect(p.dead).toBe(true);                                    // 必死
    expect(hooks.damagePlayer).not.toHaveBeenCalled();            // 漏斗零命中 ★
    expect(captures.length).toBe(0);
    expect(p.hp).toBeLessThan(hpBefore);                          // 直扣通道扣过血
  }, 20000);

  it('msg117 dir 字面透传：显式 0 按钉语义直发,缺省维持 sign 推算（既有五支不变）', () => {
    const s1 = mkShell({ net: true });
    const r1 = (s1.g.damagePlayer as (...a: unknown[]) => number)
      .call(s1.g, 40, s1.enemy.cx, s1.enemy.cy, s1.enemy, false, false, false, { hitDir: 0 });
    expect(r1).toBeGreaterThan(0);
    const sent1 = (s1.g.net.sendPlayerHurt as ReturnType<typeof vi.fn>).mock.calls as Array<unknown[]>;
    expect(sent1.length).toBe(1);
    expect(sent1[0][3]).toBe(0);

    const s2 = mkShell({ net: true });
    (s2.g.damagePlayer as (...a: unknown[]) => number)
      .call(s2.g, 40, s2.enemy.cx, s2.enemy.cy, s2.enemy, false);
    const calls = (s2.g.net.sendPlayerHurt as ReturnType<typeof vi.fn>).mock.calls as Array<unknown[]>;
    expect(calls.length).toBe(1);
    expect(calls[0][3]).toBe(Math.sign(s2.p.cx - s2.enemy.cx) || 1);
  });
});

describe('A3 SetImmuneTimeForAllTypes 与特殊桶联动（:38298-306 / :38493 / :38591）', () => {
  it('setAll 无条件满填全部枚举桶（含 Lava/WrongBugNet）,General 位走 iframes', () => {
    const t = new HurtCooldownBuckets();
    registerGlobalHurtBuckets(t);
    const p = new Player(500, 500, new Inventory());
    (p as unknown as { dodgeFullFill(ticks: number): void }).dodgeFullFill(80);
    expect(p.iframes).toBeGreaterThanOrEqual(80);
    for (let i = 0; i < IMMUNITY_COOLDOWN_COUNT; i++) {
      expect(t.remaining(i)).toBe(80);                // 循环直写无空位门
    }
    expect(t.blocksHit(ImmunityCooldownID.Lava)).toBe(true);
    expect(t.blocksHit(ImmunityCooldownID.WrongBugNet)).toBe(true);
  });

  it('分桶写入「仅空位」形守住;非 General 命中不回写 General 位(:38674-83 else-if 形)', () => {
    const t = new HurtCooldownBuckets();
    registerGlobalHurtBuckets(t);
    const p = new Player(500, 500, new Inventory());
    const chan = p as unknown as { __swNextHitBucket?: { id: number; table: BucketTable } | undefined };
    chan.__swNextHitBucket = { id: ImmunityCooldownID.Lava, table: t };
    try {
      expect(p.damage(30, 520, 520)).toBeGreaterThan(0);          // 表空位放行
      expect(t.remaining(ImmunityCooldownID.Lava)).toBeGreaterThan(0);   // 写回同桶
      expect(p.iframes).toBe(0);                                  // immune 位不动 ★
    } finally {
      chan.__swNextHitBucket = undefined;
    }
  });

  it('分桶门独立于 General：表内 Lava 有窗时即便 iframes==0 也拒（Hurt :38493 else 支）', () => {
    const t = new HurtCooldownBuckets();
    registerGlobalHurtBuckets(t);
    t.applyAfterHit(ImmunityCooldownID.Lava, 40);
    const p = new Player(500, 500, new Inventory());
    const chan = p as unknown as { __swNextHitBucket?: { id: number; table: BucketTable } | undefined };
    chan.__swNextHitBucket = { id: ImmunityCooldownID.Lava, table: t };
    try {
      expect(p.damage(30, 520, 520)).toBe(0);        // 桶窗拒收
    } finally {
      chan.__swNextHitBucket = undefined;
    }
  });

  it('太阳门按通道派生 effCd：Lava 桶命中不耗日曜盾层（Counter 集不含 Lava,R5-F23 跨漏斗保持）', () => {
    const t = new HurtCooldownBuckets();
    registerGlobalHurtBuckets(t);
    const s = mkShell();
    s.p.inv.armor[0] = { id: iid(2763), stack: 1 };   // Solar Flare Helmet 171
    s.p.inv.armor[1] = { id: iid(2764), stack: 1 };   // Solar Flare Breastplate 177
    s.p.inv.armor[2] = { id: iid(2765), stack: 1 };   // Solar Flare Leggings 112
    expect(s.p.equipStats.solarSet).toBe(true);
    s.p.solarShields = 3;
    const chan = s.p as unknown as { __swNextHitBucket?: { id: number; table: BucketTable } | undefined };
    chan.__swNextHitBucket = { id: ImmunityCooldownID.Lava, table: t };
    try {
      s.hit(60);
    } finally {
      chan.__swNextHitBucket = undefined;
    }
    expect(s.p.solarShields).toBe(3);                 // 层不耗 ★
  });
});

describe('攻端 DamageDealt 旗乘区包装（ApplyDamageToNPC :20599 仓形单点）', () => {
  it('banner 关闭路径原样放行,开放路径乘 Dealt 样本（等价 ApplyDamageToNPC 内置段）', () => {
    const dummy = { vanillaId: 0 } as unknown as Enemy;
    expect(applyBannerDamageDealt({ bannerNpcActive: () => false } as never, dummy, 77)).toBe(77);
    expect(applyBannerDamageDealt({
      bannerNpcActive: () => true,
      world: { difficulty: 0 },
    } as never, dummy, 77)).toBeGreaterThanOrEqual(1);
  });
});
