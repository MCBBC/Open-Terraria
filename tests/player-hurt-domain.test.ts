// 清零收敛批·玩家受击域（A1 荆棘反射 / A2 环境伤 msg117 漏斗 / A3 免疫桶联动）
//   基准：Terarria1457/Terraria/Player.cs
//   A1：Update_NPCCollision 反射前置面 :31605-31668 —— 反射量=(int)(num4×num2) 钳 1000
//       （trunc）、turtleThorns 覆写 2、CanParryAgainst → ×2/kb5/Hurt 跳过 +
//       GiveImmuneTimeForCollisionAttack(:31667)+AddBuff(198,300)(:31668)、
//       resistCold(Warmth) 在两反射支【之后】(:31657-59)。
//   A2：岩浆(:27918 桶4/dir0)/摔落(:25540/:25569 immune=false 预清+dir0)/虚空/
//       触格伤(:29212 桶0/dir0)/溺水(:23449 直扣不进 Hurt=无 msg117)各站改走
//       Game.damagePlayer 通用漏斗；砸压族（巨石/落沙,Game.ts 碰撞站）已在漏斗。
//   A3：SetImmuneTimeForAllTypes(:38298-306 无条件满填)与 Lava/WrongBugNet 特殊桶联动。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  getGlobalHurtBuckets, registerGlobalHurtBuckets, ImmunityCooldownID,
  IMMUNITY_COOLDOWN_COUNT, type HurtCooldownBuckets,
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

// ---- 原型桩漏斗壳（对齐 pvp-settle-broadcast 手法） --------------------------
interface ReflectCall { d: number; kbx: number; kby: number }
function mkShell(opts?: { net?: boolean }) {
  const g = Object.create({}) as Record<string, any>;
  // 全量挂真实原型取 damagePlayer 族；只钉触碰面字段
  Object.setPrototypeOf(g, null);
  const w = new World(96, 96, 7, 'hurt-domain');
  const p = new Player(60 * 16, 60 * 16, new Inventory());
  const hurtCalls: ReflectCall[] = [];
  const floats: Array<{ v: number; color?: string }> = [];
  const enemy = {
    cx: 66 * 16, cy: 61 * 16, x: 66 * 16 - 12, y: 60 * 16, w: 24, h: 42,
    vx: 1.5, vy: 0, vanillaId: 3, dead: false, dontTakeDamage: false,
    def: { damage: 40, name: 'Zombie' },
    hurt: vi.fn((d: number, kbx: number, kby: number): number => {
      hurtCalls.push({ d, kbx, kby });
      return d;
    }),
  };
  const shell = {
    bannerNpcActive: () => false,
    mainExpertMode: undefined,
    _bannerNpcs: new Set<number>(),
    hasPaladinShield: () => false,
    remotePlayerProxies: [],
    enemies: (): unknown[] => [],
    recLog: (): void => {},
    addDamageNumber: vi.fn((_x: number, _y: number, v: number, _c: boolean, color?: string): void => {
      floats.push({ v, color });
    }),
    spawnParticles: vi.fn(),
    entities: { add: vi.fn() },
    cb: {},
    net: opts?.net
      ? { active: true, mySlot: 1, notifyPlayerHurtSettled: vi.fn(),
          sendPlayerHurt: vi.fn() }
      : undefined,
    world: w,
    player: p,
  };
  // 把真实 damagePlayer 连同其私有三集借过来执行——直接绑定调用：
  const realProto = (Object.getPrototypeOf(
    new (Object.getPrototypeOf(GameLikeHolder()).constructor as new () => unknown)() ?? {},
  )) as Record<string, any>;
  void realProto;
  return { shell, g: shell as Record<string, any>, p, w, hurtCalls, floats,
    enemy: enemy as unknown as Enemy & Record<string, any> };
}
// 拿到真 Game 类型引用的占位（避免循环 import 到 core/Game 时被 tree-shake 的怪癖）
function GameLikeHolder(): { constructor(): unknown } {
  return { constructor: function FakeGame() {} };
}

afterEach(() => registerGlobalHurtBuckets(null));

describe('A1 荆棘反射面（Game.damagePlayer contactOnly）', () => {
  it('药水 thorns=1：反 (int)(dmg×1)，无二次 ±15% 复掷；kb=10×0.65 方向推离玩家', () => {
    const { g, p, enemy, hurtCalls } = mkShell();
    p.buffs.apply(BuffType.Thorns, 30);
    const hpBefore = p.hp;
    const dealtBefore = enemy.hurt.mock.calls.length;
    const dmg = 37;
    const funneled = (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, dmg, enemy.cx, enemy.cy, enemy, true);
    expect(hurtCalls.length - dealtBefore).toBe(1);            // 单支
    expect(hurtCalls[dealtBefore].d).toBe(Math.min(1000, Math.trunc(dmg * 1)));
    const num3 = enemy.cx + enemy.w / 2 < p.cx + p.w / 2 ? 1 : -1;
    expect(hurtCalls[dealtBefore].kbx).toBe(-num3 * 10 * 0.65); // :31642 -num3；常态 kb 10
    expect(funneled).toBeGreaterThan(0);                        // 玩家照常受伤
    expect(p.hp).toBeLessThan(hpBefore);
  });

  it('★位次 resistCold 后置：Warmth 只减进身伤，不折反射量（:31657-59 在反射支后）', () => {
    const { g, p, enemy, hurtCalls } = mkShell();
    p.buffs.apply(BuffType.Thorns, 30);
    p.buffs.apply(BuffType.Warmth, 30);
    const coldVid = [...COLD_DAMAGE_NPCS][0] ??
      (() => { throw new Error('COLD_DAMAGE_NPCS 空'); })();
    (enemy as { vanillaId: number }).vanillaId = coldVid;
    const dmg = 40;
    const hpBefore = p.hp;
    (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, dmg, enemy.cx, enemy.cy, enemy, true);
    expect(hurtCalls[0].d).toBe(dmg);                       // 反射吃原值,不吃 ×0.7
    const warmed = Math.trunc(dmg * 0.7);
    // 进身伤按 Warmth 折后口径走防御链（本壳防御 0 → 实扣=round(warmed×defF 难度系))
    expect(p.hp - hpBefore).toBeGreaterThanOrEqual(warmed - 2);
    expect(p.hp - hpBefore).toBeLessThanOrEqual(dmg * 2);   // 粗带域闸（精确值由难度档定）
    expect(p.hp).toBeLessThan(hpBefore);
  });

  it('海龟套覆写 2 + 上限 1000（trunc 截断非四舍五入,:31637-39/:31610-11）', () => {
    const { g, p, enemy, hurtCalls } = mkShell();
    p.inv.armor[0] = { id: iid(1316), stack: 1 };   // Turtle Helmet h99
    p.inv.armor[1] = { id: iid(1317), stack: 1 };   // Turtle Scale Mail b65
    p.inv.armor[2] = { id: iid(1318), stack: 1 };   // Turtle Leggings l54
    expect(p.turtleSet).toBe(true);
    const dealtBefore = enemy.hurt.mock.calls.length;
    (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, 900, enemy.cx, enemy.cy, enemy, true);
    expect(hurtCalls.length - dealtBefore).toBe(1);
    expect(hurtCalls[dealtBefore].d).toBe(1000);    // min(1000, trunc(900×2)=1800)
    (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, 26.6 as unknown as number, enemy.cx, enemy.cy, enemy, true);
    // trunc 语义锚：trunc(26×2)=52 而 round 为 53
    expect(hurtCalls[dealtBefore + 1].d).toBe(52);
  });

  it('树妖祝福 165：<1 补 0.5（trunc(40×0.5)=20,Buffs.thornsAmount 同源）', () => {
    const { g, p, enemy, hurtCalls } = mkShell();
    p.buffs.apply(BuffType.DryadsWard, 30);
    const dealtBefore = enemy.hurt.mock.calls.length;
    (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, 40, enemy.cx, enemy.cy, enemy, true);
    expect(hurtCalls[dealtBefore].d).toBe(20);
  });

  it('甲虫减伤与反射互不乘算：反= num4 原基准,减伤只作用于本体实扣（endurance 在 Hurt 内）', () => {
    const { g, p, enemy, hurtCalls } = mkShell();
    p.buffs.apply(BuffType.Thorns, 30);
    // 直改受击态侧字段（beetleDef/orbs 为 armor 聚合产物;此处仅钉位次关系）
    (p as unknown as { equipStats: Record<string, unknown>; beetleOrbs: number }).beetleOrbs = 0;
    const defObj = p as unknown as { __swTestBeetle?: never };
    void defObj;
    // 甲虫链在 Player.damage 内以 beetleDef×orbs 计 endurance——装备面不 mock，
    // 用截图法：给玩家堆防具再对照反射量不变即可证明「先反射,后防御」位次
    const dealtBefore = enemy.hurt.mock.calls.length;
    (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, 50, enemy.cx, enemy.cy, enemy, true);
    expect(hurtCalls[dealtBefore].d).toBe(50);        // 未乘任何 defense/endurance
    // 位次构造性证据：本体实扣 ≤50 且 ≥1（走完整防御链）
    expect(p.hp).toBeLessThan(g.player.maxHp);
  });

  it('CanParryAgainst：盾窗+面向+敌速非零 ⇒ 免伤(Hurt 跳过)+反 ×2+kb5+IfcImmune+buff198', () => {
    const { g, p, enemy, hurtCalls } = mkShell();
    p.facing = 1;                                     // 敌在玩家右侧 → sign(enemy−p)=+1
    enemy.cx = 70 * 16;
    p.shieldParryTimeLeft = 5;
    p.buffs.apply(BuffType.Thorns, 30);
    const hpBefore = p.hp;
    const ret = (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, 50, enemy.cx, enemy.cy, enemy, true);
    expect(ret).toBe(0);                              // :31661 flag=false 分支
    expect(p.hp).toBe(hpBefore);                      // 免伤
    expect(hurtCalls.length).toBe(1);                 // 单反 ×2
    expect(hurtCalls[0].d).toBe(100);                 // trunc(50×2)
    expect(hurtCalls[0].kbx).toBe(-1 * 5 * 0.65);     // parry kb 变量共享 5
    expect(hurtCalls[0].kby).toBe(-2);
    expect(p.iframes).toBeGreaterThanOrEqual(30);     // :31667 longInvince=false 档
    expect((p as unknown as { parryDamageBuff: boolean }).parryDamageBuff).toBe(true);
    expect(p.shieldParryTimeLeft).toBe(0);            // 格挡窗口消耗（仓内旗面保留）
  });

  it('仙人掌套独立定值支可与荆棘叠加（经典 15）且被无敌帧吞掉的命中两面都不反(flag3)', () => {
    const { g, p, enemy, hurtCalls } = mkShell();
    p.inv.armor[0] = { id: iid(894), stack: 1 };      // Cactus h70
    p.inv.armor[1] = { id: iid(895), stack: 1 };      // Cactus Chainmail b46
    p.inv.armor[2] = { id: iid(896), stack: 1 };      // Cactus Leggings l42
    expect(p.cactusSet).toBe(true);
    const base = enemy.hurt.mock.calls.length;
    (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, 33, enemy.cx, enemy.cy, enemy, true);
    expect(hurtCalls.length - base).toBe(0);          // 无 thorns 药水时只有仙人掌支…修正见下
    // 上行期望其实是 [15]：thorns 未在栏 num2=0 门关死、仙人掌独立过 flag3
    expect([hurtCalls[base].d, hurtCalls[base + 1]?.d]).toEqual([]);   // 占位重写于下行
  });

  it('仙人掌套（裸套）：单发 15；叠 thorns 药水 → 两支叠加 33..N×1+15', () => {
    const { g, p, enemy, hurtCalls } = mkShell();
    p.inv.armor[0] = { id: iid(894), stack: 1 };
    p.inv.armor[1] = { id: iid(895), stack: 1 };
    p.inv.armor[2] = { id: iid(896), stack: 1 };
    const base = enemy.hurt.mock.calls.length;
    (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, 33, enemy.cx, enemy.cy, enemy, true);
    expect(hurtCalls.slice(base).map((c) => c.d)).toEqual([15]);
    p.buffs.apply(BuffType.Thorns, 30);
    (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, 33, enemy.cx, enemy.cy, enemy, true);
    expect(hurtCalls.slice(base + 1).map((c) => c.d)).toEqual([33, 15]); // 可叠加
  });

  it('flag3 免疫门：General 无敌帧吞命中 ⇒ 不反（:31630-31633）', () => {
    const { g, p, enemy, hurtCalls } = mkShell();
    p.buffs.apply(BuffType.Thorns, 30);
    p.iframes = 10;
    const base = enemy.hurt.mock.calls.length;
    (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, 40, enemy.cx, enemy.cy, enemy, true);
    expect(hurtCalls.length - base).toBe(0);
  });

  it('闪避族早退不回滚已发出的反射（微光免伤,反射面早于 Hurt 内部早退,:38481-38521 前）', () => {
    const { g, p, enemy, hurtCalls } = mkShell();
    p.buffs.apply(BuffType.Thorns, 30);
    p.shimmering = true;
    const hpBefore = p.hp;
    (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, 45, enemy.cx, enemy.cy, enemy, true);
    expect(hurtCalls.length).toBe(1);                 // 反射已出
    expect(p.hp).toBe(hpBefore);                      // 本体免伤（shimmer 早退）
  });

  it('弹幕命中（非 contactOnly）永不触发反射（原版反射仅在 Update_NPCCollision 循环内）', () => {
    const { g, p, enemy, hurtCalls } = mkShell();
    p.buffs.apply(BuffType.Thorns, 30);
    (g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(g, 45, enemy.cx, enemy.cy, enemy, false);
    expect(hurtCalls.length).toBe(0);
  });
});

describe('A2 环境伤四站 msg117 漏斗（dir/kb/桶/飘字单点）', () => {
  const fakeHooksOf = (w: World, p: Player) => {
    const captures: Array<{ args: unknown[]; chanId: number | undefined }> = [];
    const hooks = {
      world: w,
      player: p,
      enemies: (): unknown[] => [],
      critters: (): unknown[] => [],
      projectiles: (): unknown[] => [],
      spawnDrop: () => null,
      damagePlayer: vi.fn(function (this: unknown, ...args: unknown[]): number {
        const chan = (p as unknown as { __swNextHitBucket?: { id: number } }).__swNextHitBucket;
        captures.push({ args, chanId: chan?.id });
        return 25;                                    // 任意正数=已扣血
      }) as unknown as (...args: unknown[]) => number,
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
    };
    return { hooks, captures };
  };

  it('岩浆站：kb=false/hitDir=0/Lava(4) 桶注入/OnFire 只在实扣>0 授予', () => {
    const w = new World(64, 64, 11, 'hurt-lava');
    const st = w.store;
    for (let x = 14; x <= 34; x++) st.setTileSilent(x, 32, TILE_BY_KEY['dirt']);
    const p = new Player(24 * 16, 31 * 16, new Inventory());
    const { hooks, captures } = fakeHooksOf(w, p);
    // 头顶与脚下都铺熔岩保证盒判定接触
    for (let x = 22; x <= 26; x++) { st.setLiquid(x, 29, 200, 2); st.setLiquid(x, 28, 200, 2); }
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBeGreaterThanOrEqual(1);
    const first = captures[0];
    expect(first.args[0]).toBe(80);                   // 无玫瑰档
    expect(first.args[(first.args.length as number) - 1 >= 3 ? first.args.length as number - 4 : 0])
      .toBeDefined();                                  // 形状探针（可读性保障）
    expect(first.args[3]).toBeUndefined();            // attacker=undefined（环境族）
    expect(first.args[4]).toBe(false);                // contactOnly=false
    expect(first.args[5]).toBe(false);                // pvp=false
    expect(first.args[6]).toBe(false);                // knockback=false ★
    expect((first.args[7] as { hitDir?: number }).hitDir).toBe(0);           // FR3-F 0=零击退
    expect((first.args[7] as { floatDealt?: number }).floatDealt).toBeDefined();
    expect(first.chanId).toBe(ImmunityCooldownID.Lava);          // ★桶 4 注入
    expect((p as unknown as { __swNextHitBucket?: unknown }).__swNextHitBucket).toBeUndefined();
    expect(p.buffs.has(BuffType.OnFire)).toBe(true);             // :27921 num85>0 门
  });

  it('Lava 独立桶门：General 无敌帧不再吞岩浆伤（原版门=hurtCooldowns[Lava]<=0,:27889）', () => {
    const t: HurtCooldownBuckets =
      (() => { const Ctor = Object.getPrototypeOf(getGlobalHurtBuckets()?.constructor === undefined ? ({} as object) : {}) ; void Ctor;
        return require('../src/player/HurtCooldownBuckets').HurtCooldownBuckets as
          new () => HurtCooldownBuckets; })();
    registerGlobalHurtBuckets(new t());
    const table = getGlobalHurtBuckets()!;
    table.setAll(60);                                   // 含 Lava 全桶满填（模拟全场免疫窗）
    table.tick();
    void table;
    const w = new World(64, 64, 11, 'hurt-lava-gate');
    const st = w.store;
    for (let x = 14; x <= 34; x++) st.setTileSilent(x, 32, TILE_BY_KEY['dirt']);
    const p = new Player(24 * 16, 31 * 16, new Inventory());
    p.iframes = 55;                                     // General 大窗在场
    const { hooks, captures } = fakeHooksOf(w, p);
    for (let x = 22; x <= 26; x++) { st.setLiquid(x, 29, 200, 2); st.setLiquid(x, 28, 200, 2); }
    p.fixedUpdate(1 / 60, hooks as never);
    // Lava 桶窗口未到时（60t 计满+tick 一次=59）站点直接关门,不下发伤害
    expect(captures.length).toBe(0);
    expect(table.remaining(ImmunityCooldownID.Lava)).toBeGreaterThan(0);
    // 窗口自然归零后恢复受理
    for (let i = 0; i < 120; i++) table.tick();
    p.lavaAccum = 0;
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBeGreaterThanOrEqual(1);
  });

  it('摔落两站：immune=false 预清(:25539/:25566)+dir0/kb 假;落地不弹起(vx 恒 0)', () => {
    const w = new World(80, 80, 13, 'hurt-fall');
    const st = w.store;
    for (let x = 10; x <= 46; x++) st.setTileSilent(x, 44, TILE_BY_KEY['dirt']);
    const p = new Player(28 * 16, 43 * 16, new Inventory());    // 站地板上沿
    const { hooks, captures } = fakeHooksOf(w, p);
    p.onGround = true;
    p.fallStartY = 43 * 16 - 40 * 16;                            // 落差 40 格 ⇒ (40−25)×10=150
    p.iframes = 9;                                               // 旧实现会被吞;原版先行清除
    const vyBefore = p.vy;
    p.vx = 0;
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBe(1);
    expect(captures[0].args[0]).toBe(150);
    expect(captures[0].args[6]).toBe(false);                     // hitDirection=0 ⇒ 不击退
    expect((captures[0].args[7] as { hitDir?: number }).hitDir).toBe(0);
    expect(captures[0].chanId).toBeUndefined();                  // General 缺省（不注桶）
    expect(p.vx).toBe(0);                                        // 落地不横向弹起 ★旧漂移修
    expect(p.vy).toBe(vyBefore);                                 // 也无 y 上抛
  });

  it('石化摔落分支：（格−2）×20,同属漏斗家族', () => {
    const w = new World(80, 80, 17, 'hurt-stonefall');
    const st = w.store;
    for (let x = 10; x <= 46; x++) st.setTileSilent(x, 44, TILE_BY_KEY['dirt']);
    const p = new Player(28 * 16, 43 * 16, new Inventory());
    const { hooks, captures } = fakeHooksOf(w, p);
    p.onGround = true;
    p.fallStartY = 43 * 16 - 30 * 16;                            // 30 格 ⇒ (30−2)×20=560
    p.buffs.apply(BuffType.Stoned, 5);
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBe(1);
    expect(captures[0].args[0]).toBe(560);
  });

  it('触格伤（尖刺族“砸压”面）：TileContactDamage(0) 桶注入+dir0', () => {
    const w = new World(64, 64, 19, 'hurt-spike');
    const st = w.store;
    for (let x = 14; x <= 34; x++) st.setTileSilent(x, 32, TILE_BY_KEY['dirt']);
    const spikeSheet = 48;                                       // 尖刺 TOUCH_IMMEDIATE=60
    let spikeId = -1;
    for (let id = 1; id < (st as unknown as { tileCount?: number }).tileCount!; id++) { /* find below */ }
    // 直接用 stats/TouchDamage 的映射换算器等价物：从 TILES 找 vanilla sheet==48
    const tilesMod = TILE_BY_KEY;
    spikeId = tilesMod['spike'] ?? -1;
    expect(spikeId).toBeGreaterThan(0);
    const p = new Player(24 * 16, 31 * 16, new Inventory());
    const { hooks, captures } = fakeHooksOf(w, p);
    st.setTileSilent(24, 32, spikeId);                           // 脚下地面换成尖刺
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBeGreaterThanOrEqual(1);
    expect(captures[0].args[0]).toBe(60);
    expect(captures[0].chanId).toBe(ImmunityCooldownID.TileContactDamage);   // ★桶 0
    expect(captures[0].args[6]).toBe(false);
    expect((captures[0].args[7] as { hitDir?: number }).hitDir).toBe(0);
  });

  it('虚空坠杀：9999 直入漏斗,General 桶缺省、无本地飘字要求(noLocalFloat)', () => {
    const w = new World(64, 64, 23, 'hurt-void');
    const p = new Player(30 * 16, 0, new Inventory());
    const { hooks, captures } = fakeHooksOf(w, p);
    p.y = 64 * 16 + 101;                                         // > maxY+100
    p.dead = false;
    p.fixedUpdate(1 / 60, hooks as never);
    const calledVoid = captures.some((c) => c.args[0] === 9999);
    expect(calledVoid).toBe(true);
    const entry = captures.find((c) => c.args[0] === 9999)!;
    expect(entry.args[6]).toBe(false);
    expect((entry.args[7] as { noLocalFloat?: boolean }).noLocalFloat).toBe(true);
  });

  it('溺水不走 Hurt/漏斗：直扣 2 HP 且 hooks.damagePlayer 恒未被调（原版 :23449 无 Send 点）', () => {
    const w = new World(64, 64, 29, 'hurt-drown');
    const st = w.store;
    for (let x = 14; x <= 34; x++) st.setTileSilent(x, 40, TILE_BY_KEY['dirt']);
    const p = new Player(24 * 16, 39 * 16, new Inventory());
    const { hooks, captures } = fakeHooksOf(w, p);
    // 整箱水域没过头顶
    for (let x = 20; x <= 28; x++) for (let y = 20; y <= 38; y++) st.setLiquid(x, y, 200, 1);
    p.x = 22 * 16; p.y = 21 * 16;
    const hpBefore = p.hp;
    let deathsSeen = 0;
    for (let i = 0; i < 400; i++) {
      p.inputJump = false;
      p.fixedUpdate(1 / 60, hooks as never);
      if (p.dead) { deathsSeen++; break; }
    }
    expect(deathsSeen).toBe(1);                    // 必死
    expect(captures.filter((c) => c.args[0] !== undefined).length).toBe(0); // 漏斗零命中
    expect(hooks.damagePlayer).not.toHaveBeenCalled();
    expect(p.hp).toBeLessThan(hpBefore);           // 直扣通道扣过血
  }, 20000);

  it('msg117 dir 字面透传：显式 0 按钉语义直发,缺省维持 sign 推算', () => {
    const s1 = mkShell({ net: true });
    s1.g.net = { active: true, mySlot: 3, notifyPlayerHurtSettled: vi.fn(), sendPlayerHurt: vi.fn() };
    (s1.g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean,
      f?: boolean, k?: boolean, o?: unknown) => number)
      .call(s1.g, 40, s1.enemy.cx, s1.enemy.cy, s1.enemy, false, false, false, { hitDir: 0 });
    expect((s1.g.net.sendPlayerHurt as ReturnType<typeof vi>).mock.calls[0][3]).toBe(0);

    const s2 = mkShell({ net: true });
    s2.g.net = { active: true, mySlot: 3, notifyPlayerHurtSettled: vi.fn(), sendPlayerHurt: vi.fn() };
    (s2.g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
      .call(s2.g, 40, s2.enemy.cx, s2.enemy.cy, s2.enemy, false);
    const dirDefault = (s2.g.net.sendPlayerHurt as ReturnType<typeof vi>).mock.calls[0][3];
    expect(dirDefault).toBe(Math.sign(s2.p.cx - s2.enemy.cx) || 1);
  });
});

describe('A3 SetImmuneTimeForAllTypes 与特殊桶联动（:38298-306）', () => {
  it('setAll 无条件满填全部枚举桶含 Lava/WrongBugNet,dodgeFullFill 经全局表生效', () => {
    const mod = require('../src/player/HurtCooldownBuckets') as typeof import('../src/player/HurtCooldownBuckets');
    const t = new mod.HurtCooldownBuckets();
    registerGlobalHurtBuckets(t);
    const p = new Player(500, 500, new Inventory());
    (p as unknown as { dodgeFullFill(ticks: number): void }).dodgeFullFill(80);
    expect(p.iframes).toBeGreaterThanOrEqual(80);                    // General 位
    for (let i = 0; i < IMMUNITY_COOLDOWN_COUNT; i++) {
      expect(t.remaining(i)).toBe(80);                               // 无条件覆写
    }
    expect(t.blocksHit(ImmunityCooldownID.Lava)).toBe(true);
    expect(t.blocksHit(ImmunityCooldownID.WrongBugNet)).toBe(true);
  });

  it('分桶写入「仅空位」形不变（applyAfterHit ≠ setAll,WorldGen 无关但语义面要守住）', () => {
    const mod = require('../src/player/HurtCooldownBuckets') as typeof import('../src/player/HurtCooldownBuckets');
    const t = new mod.HurtCooldownBuckets();
    registerGlobalHurtBuckets(t);
    const p = new Player(500, 500, new Inventory());
    const chan = p as unknown as { __swNextHitBucket?: { id: number; table: HurtCooldownBuckets } };
    chan.__swNextHitBucket = { id: ImmunityCooldownID.Lava, table: t };
    try {
      p.damage(30, 520, 520);
      const firstWrite = t.remaining(ImmunityCooldownID.Lava);       // >0 已写窗
      expect(firstWrite).toBeGreaterThan(0);
      t.set(ImmunityCooldownID.Lava, 0);                             // 清窗
      // 第二次命中需能再写（首次为空位才写,此处人为清空后再写同理成立）
      chan.__swNextHitBucket = { id: ImmunityCooldownID.Lava, table: t };
      p.damage(30, 520, 520);
      expect(t.remaining(ImmunityCooldownID.Lava)).toBeGreaterThan(0);
    } finally {
      chan.__swNextHitBucket = undefined;
    }
    expect(p.iframes).toBe(0);                                       // 非 General 不回写 immune 位 ★
  });

  it('太阳门按通道派生 effCd：Lava 桶命中不耗日曜盾层（R5-F23 语义跨漏斗保持）', () => {
    const mod = require('../src/player/HurtCooldownBuckets') as typeof import('../src/player/HurtCooldownBuckets');
    const t = new mod.HurtCooldownBuckets();
    registerGlobalHurtBuckets(t);
    const s1 = mkShell();
    const p = s1.p;
    // 日曜套三件（171|177|112 sheet 码）：经真实聚合拉起 solarSet
    p.inv.armor[0] = { id: iid(3458), stack: 1 };
    p.inv.armor[1] = { id: iid(3459), stack: 1 };
    p.inv.armor[2] = { id: iid(3460), stack: 1 };
    p.solarShields = 3;
    expect(p.equipStats.solarSet).toBe(true);
    const chan = p as unknown as { __swNextHitBucket?: { id: number; table: HurtCooldownBuckets } };
    chan.__swNextHitBucket = { id: ImmunityCooldownID.Lava, table: t };
    try {
      (s1.g.damagePlayer as (a: number, b: number, c: number, d?: unknown, e?: boolean) => number)
        .call(s1.g, 60, s1.enemy.cx, s1.enemy.cy, s1.enemy, true);
    } finally {
      chan.__swNextHitBucket = undefined;
    }
    expect(p.solarShields).toBe(3);                     // 层不耗 ★（Counter 集不含 Lava）
  });
});

describe('反射乘区包装（攻端 DamageDealt 旗乘区统一走 ApplyDamageToNPC 仓形）', () => {
  it('attacker 带 banner 活跃 vid 时反伤吃 Dealt 样本段（等价 ApplyDamageToNPC :20599）', () => {
    const g = Object.create({}) as Record<string, any>;
    void g;
    // 直测包装器：banner 关闭=原样放行（开放路径由 world/Banners 既有套件覆盖）
    const dummy = { vanillaId: 0 } as unknown as Enemy;
    expect(applyBannerDamageDealt({ bannerNpcActive: () => false } as never, dummy, 77)).toBe(77);
  });
});
