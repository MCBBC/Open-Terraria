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
  IMMUNITY_COOLDOWN_COUNT, HurtCooldownBuckets, npcContactBucketId,
  type HurtCooldownBuckets as BucketTable,
} from '../src/player/HurtCooldownBuckets';
import {
  getMeleeCollisionData, boxesIntersect,
  type ContactBox, type MeleeCollisionInput,
} from '../src/player/MeleeCollisionData';
import { COLD_DAMAGE_NPCS, applyBannerDamageDealt } from '../src/entities/projTargets';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { COIN_KEYS } from '../src/items/Inventory';
import { damageVar, getAttackDamageScaledByDifficulty } from '../src/stats/ScaleStats';
import { Enemy } from '../src/entities/Enemy';

/** 求解壳（纯函数单测通用）：像素域无缩放裁剪 */
function sol(input: Partial<MeleeCollisionInput> & Pick<MeleeCollisionInput, 'vanillaId' | 'x' | 'y' | 'w' | 'h'>,
  victim?: ContactBox) {
  const v: ContactBox = victim ?? { x: 0, y: 0, w: 20, h: 42 };
  const merged = input as MeleeCollisionInput;
  return getMeleeCollisionData(v, {
    ...merged,
    ai0: merged.ai0 ?? 0,
    direction: (merged.direction ?? 1) as -1 | 1,
    spriteDirection: (merged.spriteDirection ?? merged.direction ?? 1) as -1 | 1,
  });
}

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

// ---- 漏斗壳（Game.prototype 桩,对齐 pvp-settle-broadcast 手法） --------------
interface ReflectCall { d: number; kbx: number; kby: number; armorPen?: number; fromPlayer?: boolean }
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
    hurt: vi.fn((d: number, kbx: number, kby: number,
      _g?: unknown, armorPen?: number, _crit?: boolean, _pierce?: number,
      fromPlayer?: boolean): number => {
      hurtCalls.push({ d, kbx, kby, armorPen, fromPlayer });
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

// ---- 漏斗壳（envHarness,A2/F3 共用——置模块顶层供各 describe 引用） ----------
function envHarness(w: World, p: Player) {
  const captures: Array<{ args: unknown[]; chanId: number | undefined; iframesAtHit: number }> = [];
  const settlements: boolean[] = [];                 // ★F2 settlePlayerDeath 受理记录
  let settledOnce = false;
  const hooks = {
    world: w,
    player: p,
    enemies: (): unknown[] => [],
    critters: (): unknown[] => [],
    projectiles: (): unknown[] => [],
    spawnDrop: () => null,
    damagePlayer: vi.fn(function (this: null, ...args: unknown[]): number {
      const chan = (p as unknown as { __swNextHitBucket?: { id: number } }).__swNextHitBucket;
      captures.push({ args, chanId: chan?.id, iframesAtHit: p.iframes });
      return 40;
    }),
    // ★F2：直扣致死站结算面（溺水/舌 DoT/墙舌世界边）——幂等形与真身一致
    settlePlayerDeath: vi.fn((pvp: boolean): void => {
      if (!p.dead || settledOnce) return;
      settledOnce = true;
      settlements.push(pvp);
      if (pvp) p.deathsPvp++;                        // 真身面最小镜像（计数由 Game 承担）
      else p.deathsPve++;
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
  return { hooks, captures, settlements };
}

/** 通用小环境：f=世界布景回调（拿到 store），返回摆好的玩家 */
function tallWorld(seed: number): World {
  return new World(72, 96, seed, `hurt-a2-${seed}`);
}

describe('A1 荆棘反射面（Game.damagePlayer contactOnly 前置段）', () => {
  it('药水 thorns=1：反 (int)(dmg×1)，无二次 ±15% 复掷；kb=10 裸值推离玩家（★F5① 删 ×0.65）', () => {
    const s = mkShell();
    s.p.buffs.apply(BuffType.Thorns, 30);
    const base = s.hurtCalls.length;
    const hpBefore = s.p.hp;
    const ret = s.hit(37);
    expect(s.hurtCalls.length - base).toBe(1);                        // 单支
    expect(s.hurtCalls[base].d).toBe(Math.min(1000, Math.trunc(37 * 1)));
    const num3 = s.enemy.cx + s.enemy.w / 2 < s.p.cx + s.p.w / 2 ? 1 : -1;
    expect(s.hurtCalls[base].kbx).toBe(-num3 * 10);                   // :31642 kb 共享局部量原值直进
    // ★F5②：ApplyDamageToNPC 攻端面——armorPen（GetArmorPenetration(false)）随调用入参、
    // fromPlayer=true 接 OnHit 族（钛金屏障仓形单点在 Enemy.hurt 内嵌）
    expect(s.hurtCalls[base].fromPlayer).toBe(true);
    expect(s.hurtCalls[base].armorPen).toBe(s.p.equipStats.armorPen);   // 裸玩家=0
    s.p.inv.armor[3] = { id: iid(3212), stack: 1 };                     // 刺钉项链：armorPen+5
    expect(s.p.equipStats.armorPen).toBe(5);                            // 真实聚合链取值
    s.p.iframes = 0;                                                    // 出无敌窗再命中
    const base2 = s.hurtCalls.length;
    s.hit(37);
    expect(s.hurtCalls[base2].armorPen).toBe(5);
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

  it('★Notes① banner 减伤 (int) 截断非四舍五入：num4=trunc(45×0.75)=33（round 为 34）', () => {
    const s = mkShell();
    s.p.buffs.apply(BuffType.Thorns, 30);             // 撑起反射捕获
    (s.g._bannerNpcs as Set<number>).add(s.enemy.vanillaId as number);   // 僵尸 3 恒在表（null 型位为 Enemy 字段宽化，运行时不可达）
    const base = s.hurtCalls.length;
    s.hit(45);
    // 受端 num4 截断后进反射面；攻端再包 DamageDealt 样本（经典僵尸 ×1.5）：
    // d = trunc(min(1000, trunc(num4)) × Dealt) —— 经两段截断链取证
    const num4 = Math.max(1, Math.trunc(45 * 0.75));
    expect(num4).toBe(33);
    const dealtNum4 = applyBannerDamageDealt(s.g as never, s.enemy as never, num4);
    expect(dealtNum4).toBe(Math.trunc(33 * 1.5));     // 攻端 DamageDealt 面生效
    expect(s.hurtCalls[base].d).toBe(Math.min(1000, dealtNum4));
    // 反证 round 基准会差一：34→trunc(34×1.5)=51 ≠ 49
    expect(Math.trunc(applyBannerDamageDealt(s.g as never, s.enemy as never,
      Math.round(45 * 0.75)))).not.toBe(dealtNum4);
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
    // ★F5①：裸值直进（删仓自 ×0.65 无源乘区）
    expect(s.hurtCalls[0].kbx).toBe(5);
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

  it('摔落站：immune=false 前置清(:25559)+dir0/kb 假;整数格距截断 ×10（40 格 ⇒ trunc15×10=150）', () => {
    const w = new World(80, 80, 13, 'hurt-fall');
    const st = w.store;
    for (let x = 10; x <= 46; x++) st.setTileSilent(x, 44, TILE_BY_KEY['dirt']);
    const p = new Player(28 * 16, 40 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    for (let i = 0; i < 45; i++) p.fixedUpdate(1 / 60, hooks as never);   // 先落定
    expect(captures.length).toBe(0);
    p.iframes = 9;                                    // 旧实现被 General 吞;原版先清 immune
    p.fallStartY = Math.trunc(p.y / 16) * 16 - 40 * 16;   // 落差 40 整格（:25503 两端截断）
    const vyBefore = p.vy;
    p.vx = 0;
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBe(1);
    expect(captures[0].args[0]).toBe(150);
    expect(captures[0].iframesAtHit).toBe(0);         // ★F1①：常规支在 Hurt【前】已清 immune
    expect(captures[0].args[6]).toBe(false);          // hitDirection=0 ⇒ 击退段整跳
    expect((captures[0].args[7] as { hitDir?: number }).hitDir).toBe(0);
    expect(captures[0].chanId).toBeUndefined();       // General 缺省不注桶
    expect(p.vx).toBe(0);                             // ★旧漂移修复锚：不再 ±4.5 弹起
    expect(Math.abs(p.vy - vyBefore)).toBeLessThan(0.6);
  });

  it('★F1② 截格取整：像素落差 >25 格但整格差恰 25 ⇒ 不结伤（删 max(1,…)=1 补底越权）', () => {
    const w = new World(80, 80, 14, 'hurt-fall-frac');
    const st = w.store;
    for (let x = 10; x <= 46; x++) st.setTileSilent(x, 44, TILE_BY_KEY['dirt']);
    const p = new Player(28 * 16, 40 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    for (let i = 0; i < 45; i++) p.fixedUpdate(1 / 60, hooks as never);
    // 站立 y = groundRow*16 − h，h%16 ≠ 0 ⇒ y 留非零格内分数：fallStart 对齐到
    // 「landTile−25」上沿时像素距离超 25 格而整格差 =25 → 原版 num17≤0 跳过
    p.fallStartY = (Math.trunc(p.y / 16) - 25) * 16;
    p.fixedUpdate(1 / 60, hooks as never);
    expect(p.fallStartY).toBeNull();
    expect(captures.length).toBe(0);                  // 旧 round+补底会在 0~1 区强行打 1 点
  }, 20000);

  it('★F1② 整格差 26 ⇒ 恰为 trunc(26−25)×10=10（round 形会随格内分数偏到 11..20）', () => {
    const w = new World(80, 80, 15, 'hurt-fall-trunc');
    const st = w.store;
    for (let x = 10; x <= 46; x++) st.setTileSilent(x, 44, TILE_BY_KEY['dirt']);
    const p = new Player(28 * 16, 40 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    for (let i = 0; i < 45; i++) p.fixedUpdate(1 / 60, hooks as never);
    p.fallStartY = (Math.trunc(p.y / 16) - 26) * 16;
    p.fixedUpdate(1 / 60, hooks as never);
    expect(captures.length).toBe(1);
    expect(captures[0].args[0]).toBe(10);
  }, 20000);

  it('石化摔落分支：(截断格−2)×20 + immune 在 Hurt【后】清（:25549-25550 先后序=F1 分形）', () => {
    const w = new World(80, 80, 17, 'hurt-stonefall');
    const st = w.store;
    for (let x = 10; x <= 46; x++) st.setTileSilent(x, 44, TILE_BY_KEY['dirt']);
    const p = new Player(28 * 16, 40 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    for (let i = 0; i < 45; i++) p.fixedUpdate(1 / 60, hooks as never);
    p.fallStartY = (Math.trunc(p.y / 16) - 30) * 16;  // 30 整格 ⇒ (30−2)×20=560
    p.iframes = 9;                                    // 入站免疫窗——石化支不前置清
    p.lastStoned = true;                              // 变身过渡已在更早 tick 完成——封住 F3 成型侧捕获
    p.buffs.apply(BuffType.Stoned, 5);
    p.fixedUpdate(1 / 60, hooks as never);
    const fallStone = captures.find((c) => c.args[0] === 560);
    expect(fallStone).toBeDefined();                  // （变身过渡同拍也会撞漏斗:已在 lastStoned 抑制）
    expect(fallStone!.iframesAtHit).toBeGreaterThan(0);// ★F1①：Hurt 收到时 iframes 未前置清（tick 内自然衰减后仍>0）

    expect(p.iframes).toBe(0);                        // 出站后才被 :25550 清位
  });

  it('触格伤（尖刺“砸压”家族）：表值过 DamageVar 掷骰（r=.5 档0 ⇒ 60）+TileContactDamage(0) 桶注入', () => {
    registerGlobalHurtBuckets(new HurtCooldownBuckets());
    const w = tallWorld(19);
    const st = w.store;
    for (let x = 10; x <= 60; x++) st.setTileSilent(x, 54, TILE_BY_KEY['dirt']);
    st.setTileSilent(34, 52, TILE_BY_KEY['v_48_spike']);   // vanilla sheet 48=尖刺 基准60
    st.setTileSilent(35, 52, TILE_BY_KEY['v_48_spike']);
    const p = new Player(33 * 16, 44 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    // ★F4：Main.DamageVar(num, −luck)（Player.cs:29211 字面）。掷 0.5 → 离散档
    // ⌊15.5⌋−15=0 ⇒ ×1.00（toEvenRound 不偏）——确定性单点取证。luck 缺省 0 无重掷。
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      for (let i = 0; i < 45; i++) p.fixedUpdate(1 / 60, hooks as never);
      expect(captures.length).toBeGreaterThanOrEqual(1);
      expect(captures[0].args[0]).toBe(60);               // DamageVar 后终值=基准值本证
      expect(captures[0].chanId).toBe(ImmunityCooldownID.TileContactDamage);   // ★桶 0
      expect(captures[0].args[6]).toBe(false);
      expect((captures[0].args[7] as { hitDir?: number }).hitDir).toBe(0);
    } finally {
      spy.mockRestore();
    }
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

  it('溺水不走 Hurt/漏斗：直扣 HP；★F2 致死帧走完整死亡管线（计数单次/非致死零结算）', () => {
    const w = tallWorld(29);
    const st = w.store;
    for (let x = 20; x <= 40; x++) st.setTileSilent(x, 48, TILE_BY_KEY['dirt']);
    for (let x = 20; x <= 40; x++) for (let y = 26; y <= 46; y++) st.setLiquid(x, y, 220, 1);
    const p = new Player(28 * 16, 32 * 16, new Inventory());
    const { hooks, captures, settlements } = envHarness(w, p);
    p.breath = 3;                                     // 快进：两拍即见直扣
    p.hp = 4;                                         // 低血量促死（直扣 2/批）
    const deathsBefore = p.deathsPve;
    for (let i = 0; i < 120 && !p.dead; i++) {
      p.fixedUpdate(1 / 60, hooks as never);
      if (!p.dead) { p.x = 28 * 16; p.y = 32 * 16; p.vy = 0; }  // 保持浸没
    }
    expect(p.dead).toBe(true);                                    // 必死
    expect(hooks.damagePlayer).not.toHaveBeenCalled();            // 漏斗零命中 ★（:23449 无 Send 点）
    expect(captures.length).toBe(0);
    // ★F2：致死帧补 KillMe(ByOther(1),10) 完整管线——settlePlayerDeath 单次受理、
    // PVE 计数入账；后续 tick 复入幂等门不再计（settledOnce 剪枝断言）
    expect(settlements.length).toBe(1);
    expect(settlements[0]).toBe(false);
    expect(p.deathsPve).toBe(deathsBefore + 1);
    for (let i = 0; i < 10; i++) p.fixedUpdate(1 / 60, hooks as never);
    expect(settlements.length).toBe(1);
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

// ---- ★F2/★Notes⑤ 前半（四轮蓝队新增） --------------------------------------
describe('★F2 死亡管线单点：settlePlayerDeath 幂等 + 软核 DropCoins 面向', () => {
  function deathShell() {
    const g = Object.create(Game.prototype) as Record<string, any>;
    const w = new World(48, 48, 99, 'hurt-death');
    const p = new Player(24 * 16, 20 * 16, new Inventory());
    const drops: Array<{ key: string; stack: number }> = [];
    g.player = p;
    g.world = w;
    g.spawnDrop = vi.fn((_x: number, _y: number, key: string, stack: number): null => {
      drops.push({ key, stack });
      return null;
    });
    return { g, p, w, drops };
  }

  it('软核：PVE 计数、DropCoins 掉实体+lostCoins 覆写、垃圾桶清空、同死幂等', () => {
    const { g, p, drops } = deathShell();
    p.inv.add(iid(71), 50);                       // 铜币 ×50
    p.inv.trash = { id: iid(9), stack: 3 };       // 垃圾桶持物（DeathTrash :53394）
    p.deathsPve = 0;
    p.dead = true;                                // 调用方先标死（漏斗/fixedUpdate 过渡语义）
    g.settlePlayerDeath(false);
    expect(p.deathsPve).toBe(1);
    expect(p.respawnTimer).toBe(0);
    expect(p.deadTime).toBe(0);
    expect(p.inv.trash).toBeNull();               // 死亡清垃圾桶
    const kept = p.inv.countOf(iid(71));
    const dropped = drops
      .filter((d) => d.key === COIN_KEYS[0])
      .reduce((s, d) => s + d.stack, 0);
    expect(kept).toBeLessThan(50);                // 经典掉一半档
    expect(dropped).toBe(50 - kept);              // 掉落落地可拾（非凭空蒸发）
    expect(g.lostCoins).toBe(dropped);            // 「掉了{0}」= 实掉面额累计
    g.settlePlayerDeath(false);                   // 同一死复入 → 幂等门吞
    expect(p.deathsPve).toBe(1);
    expect(g.lostCoins).toBe(dropped);
  });

  it('pvp 归因分道：deathsPvp++ 且不触发 DropCoins（lostCoins 置 0）', () => {
    const { g, p, drops } = deathShell();
    p.inv.add(iid(71), 80);
    p.deathsPvp = 0;
    p.dead = true;
    g.settlePlayerDeath(true);
    expect(p.deathsPvp).toBe(1);
    expect(p.deathsPve).toBe(0);
    expect(p.inv.countOf(iid(71))).toBe(80);      // PvP 死亡不掉钱
    expect(drops.length).toBe(0);
    expect(g.lostCoins).toBe(0);
  });

  it('respawnPlayer 复位幂等门——新的一死重新入账', () => {
    const { g, p, w } = deathShell();
    p.dead = true;
    g.settlePlayerDeath(false);
    expect(p.deathsPve).toBe(1);
    (g as { respawnPlayer(): void }).respawnPlayer();
    expect((p as unknown as { __swDeathSettled?: boolean }).__swDeathSettled).toBe(false);
    p.hp = 0; p.dead = true;
    g.settlePlayerDeath(false);
    expect(p.deathsPve).toBe(2);
  });

  it('护栏：!dead 直调零结算（误触不计数）', () => {
    const { g, p } = deathShell();
    g.settlePlayerDeath(false);
    expect(p.deathsPve).toBe(0);
    expect((p as unknown as { __swDeathSettled?: boolean }).__swDeathSettled).toBeUndefined();
  });
});

describe('★F3 石化变身走通用漏斗（:25419 !quiet Hurt 形）', () => {
  it('过渡即 Hurt：防御链/msg117 漏斗载体、双向尘单次、老手补语音删除后无双发', () => {
    const w = new World(72, 96, 41, 'hurt-stoned-tf');
    const st = w.store;
    for (let x = 10; x <= 60; x++) st.setTileSilent(x, 52, TILE_BY_KEY['dirt']);
    const p = new Player(30 * 16, 44 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    p.buffs.apply(BuffType.Stoned, 5);
    for (let i = 0; i < 8 && captures.length === 0; i++) {
      p.fixedUpdate(1 / 60, hooks as never);
      if (!captures.length) { p.x = 30 * 16; p.y = 46 * 16 - 42; p.vy = 0.2; }
    }
    expect(captures.length).toBeGreaterThanOrEqual(1);
    const c = captures[0];
    // 经典档 GDL.CLASSIC=1（非 0!）——EnemyDamageMultiplier.Sample(classic) 后 trunc
    expect(c.args[0]).toBe(getAttackDamageScaledByDifficulty(20, 1));
    expect(c.args[3]).toBeUndefined();                          // attacker=undefined
    expect(c.args[4]).toBe(false);
    expect(c.args[5]).toBe(false);
    expect(c.args[6]).toBe(false);                              // hitDirection=0 ⇒ kb=false
    expect((c.args[7] as { floatDealt?: number }).floatDealt).toBeDefined();
  }, 20000);

  it('解除侧同样触发过渡尘（旧实现只在成型侧撒）', async () => {
    const w = new World(72, 96, 42, 'hurt-stoned-off');
    const st = w.store;
    for (let x = 10; x <= 60; x++) st.setTileSilent(x, 52, TILE_BY_KEY['dirt']);
    const p = new Player(30 * 16, 44 * 16, new Inventory());
    const hooks = envHarness(w, p).hooks as unknown as Record<string, any>;
    p.buffs.apply(BuffType.Stoned, 5);
    const particles: string[] = [];
    hooks.spawnParticles = (_x: unknown, _y: unknown, color: string): void => { particles.push(color); };
    for (let i = 0; i < 400 && !particles.includes('#9A8FA0'); i++) {
      p.fixedUpdate(1 / 60, hooks as never);
    }
    // 成型侧已发尘；剥除石化 buff 触发反向过渡再发一次
    p.buffs.remove(BuffType.Stoned);
    p.fixedUpdate(1 / 60, hooks as never);
    expect(particles.filter((c) => c === '#9A8FA0').length).toBeGreaterThanOrEqual(2);
  }, 20000);
});

describe('★F3 血肉墙嘴 Hurt 漏斗（:22464 !quiet 形）', () => {
  it('嘴带受理：attacker 缺省/经典 50 值/floatDealt 回填；受理后固定推离 ±4.5、−3.5 保持', () => {
    const w = new World(120, 96, 37, 'hurt-wof');
    const p = new Player(60 * 16, 50 * 16, new Inventory());
    const { hooks, captures } = envHarness(w, p);
    const wall = {
      vanillaId: 113, dead: false,
      x: p.x + 61, y: p.y - 20, w: 100, h: 100, cx: p.x + 111, cy: p.y,
      facing: 1, difficulty: 1, def: { damage: 50, name: 'Wall of Flesh' },
    } as unknown as Enemy;
    (hooks as unknown as { enemies: () => unknown[] }).enemies = (): unknown[] => [wall];
    p.buffs.apply(BuffType.Horrified, 1);           // gross 在栏
    (p as unknown as { wofTongue(g: unknown, wo: unknown, dt: number): void })
      .wofTongue(hooks, w, 1 / 60);
    expect(captures.length).toBe(1);
    expect(captures[0].args[0]).toBe(getAttackDamageScaledByDifficulty(50, 1));   // 难度缩放基准(GDL.CLASSIC=1)
    expect(captures[0].args[3]).toBeUndefined();    // attacker 位缺省 ⇒ banner/反射不适用
    expect((captures[0].args[7] as { floatDealt?: number }).floatDealt).toBeDefined();
    expect(p.vx).toBeCloseTo(4.5);                  // :37910 固定推离（facing>0 → +x）
    expect(p.vy).toBeCloseTo(-3.5);
    expect(p.fallStartY).toBe(p.y);                 // :37912 同段 fallStart 重置
    // 手补双发源删除：漏斗单点承载飘字/语音（hook 无独立 addDamageNumber 断言必要）
  });

  it('hp 直改致死站（DoT 分块/世界边 KillMe）由 fixedUpdate 过渡兜 settle——舌 DoT 面实证', () => {
    // 专家模式下 tongued 分块直扣 hp（:19142-19148 KillMe 门），漏斗零参与；致死帧
    // 经 Player.fixedUpdate hp<=0 过渡块进 settlePlayerDeath 完整管线
    const w = new World(120, 96, 38, 'hurt-wof-dot');
    w.difficulty = 1;                                 // 专家 ⇒ mainExpertMode 真
    const st = w.store;
    for (let x = 40; x <= 90; x++) st.setTileSilent(x, 60, TILE_BY_KEY['dirt']);
    const p = new Player(60 * 16, 56 * 16, new Inventory());
    const { hooks, captures, settlements } = envHarness(w, p);
    const wall = {
      vanillaId: 113, dead: false,
      x: p.x + 456, y: p.y - 20, w: 100, h: 100, cx: p.x + 506, cy: p.y,
      facing: 1, difficulty: 1, def: { damage: 50, name: 'Wall of Flesh' },
    } as unknown as Enemy;
    (hooks as unknown as { enemies: () => unknown[] }).enemies = (): unknown[] => [wall];
    // 嘴带 mouth=wall.x−56=p.x+400；带区判据 p.x+w>mouth ⇒ 布景外置成【带外】，
    // 本测只隔离舌 DoT 流干路径（嘴带受理已由上一案覆盖）
    expect(p.x + p.w > wall.x - 56).toBe(false);
    p.buffs.apply(BuffType.Horrified, 99);
    p.buffs.apply(BuffType.TheTongue, 99);
    p.hp = 8;
    for (let i = 0; i < 240 && !p.dead; i++) {
      p.fixedUpdate(1 / 60, hooks as never);
      if (!p.dead) { p.x = 60 * 16; p.y = 56 * 16; p.vy = 0.2; }
    }
    expect(p.dead).toBe(true);                      // DoT 流干致死
    expect(captures.length).toBe(0);                // 漏斗零参与（直扣语义）
    expect(settlements.length).toBe(1);             // ★F2 过渡块兜入完整管线
    expect(settlements[0]).toBe(false);
    expect(p.deathsPve).toBe(1);
  }, 20000);
});

describe('★Notes⑤ 前半 NPC 接触分桶（BossNoCheese 表 + npcContactBucketId）', () => {
  it('396/397/398/400/401 → BossNoCheese(1)；常规怪 General(-1)', () => {
    expect(npcContactBucketId(396, 3)).toBe(ImmunityCooldownID.BossNoCheese);
    expect(npcContactBucketId(397, 3)).toBe(ImmunityCooldownID.BossNoCheese);
    expect(npcContactBucketId(398, 3)).toBe(ImmunityCooldownID.BossNoCheese);
    expect(npcContactBucketId(400, 3)).toBe(ImmunityCooldownID.BossNoCheese);   // 真眼（伤害盒另行清空）
    expect(npcContactBucketId(401, 3)).toBe(ImmunityCooldownID.BossNoCheese);
    expect(npcContactBucketId(3, 0)).toBe(-1);                  // 僵尸常桶
  });
  it('636 分支：ai[0]∈{0,10} 整段 continue（null），其余进桶（:31582-31585 字面）', () => {
    expect(npcContactBucketId(636, 0)).toBeNull();
    expect(npcContactBucketId(636, 10)).toBeNull();
    expect(npcContactBucketId(636, 5)).toBe(ImmunityCooldownID.BossNoCheese);
  });
});

// ==============================================================================
// ★GetMeleeCollisionData 玩家接触侧收口（2026-08-31 清账终局批）
//   原文锚：Terarria1457/Terraria/NPC.cs:96111-96280（全支亲读移植 =>
//   src/player/MeleeCollisionData.ts）；消费方 Update_NPCCollision :31557-31668。
//   每族锚号在各案注释；实体几何取 vanilla-npcs.json SetDefaults 提取值。
// ==============================================================================
describe('★GMC 加宽族：430-436·591 ArmedZombie 族 ±34px 与 ×1.25（NPC.cs:96114-96127）', () => {
  const ZOMBIE = { x: 100, y: 100, w: 18, h: 40 };        // 尸盒（vanilla-npcs.json 430）
  const VICTIM = { x: 118, y: 104, w: 20, h: 42 };        // 右侧贴边外带内
  it('ai[2]>5 挥击窗：朝向侧加宽 34px 使擦碰可达，乘区 ×1.25（direction>0 仅 Width 扩）', () => {
    const narrow = sol({ vanillaId: 430, ...ZOMBIE, ai2: 3 }, VICTIM);
    expect(narrow.damageMultiplier).toBe(1);
    expect(boxesIntersect(VICTIM, narrow.rect!)).toBe(false);        // 窗外不可达基线
    const wide = sol({ vanillaId: 430, ...ZOMBIE, ai2: 6, direction: 1 }, VICTIM);
    expect(wide.rect!.x).toBe(ZOMBIE.x);                          // direction>0 左缘不动
    expect(wide.rect!.w).toBe(ZOMBIE.w + 34);                     // :96123-24 Width+=34
    expect(wide.damageMultiplier).toBe(1.25);                     // :96126
    expect(boxesIntersect(VICTIM, wide.rect!)).toBe(true);        // 擦碰变可达
  });
  it('spriteDirection<0 对称支：X−=34 且 Width+=34（:96117-21）', () => {
    const r = sol({ vanillaId: 431, ...ZOMBIE, ai2: 5.5, spriteDirection: -1 },
      { x: ZOMBIE.x - 33, y: 104, w: 20, h: 42 });
    expect(r.rect!.x).toBe(ZOMBIE.x - 34);
    expect(r.rect!.w).toBe(ZOMBIE.w + 34);
    expect(r.damageMultiplier).toBe(1.25);
    expect(boxesIntersect({ x: ZOMBIE.x - 33, y: 104, w: 20, h: 42 }, r.rect!)).toBe(true);
  });
  it('七成员表门（430..436 ∪ 591）逐 id 接通；窗外/非成员恒等回落', () => {
    for (const id of [430, 431, 432, 433, 434, 435, 436, 591]) {
      const r = sol({ vanillaId: id, ...ZOMBIE, ai2: 7 });
      expect(r.damageMultiplier).toBe(1.25);
    }
    // 表中条件带 ai[2]>5 门；591 火把僵尸同式（:58840 联合条件）
    expect(sol({ vanillaId: 591, ...ZOMBIE, ai2: 5 }).damageMultiplier).toBe(1);
    expect(sol({ vanillaId: 437, ...ZOMBIE, ai2: 9 }).damageMultiplier).toBe(1);   // 非成员
    expect(sol({ vanillaId: 430, ...ZOMBIE, ai2: 6 }).rect).toEqual(
      { x: ZOMBIE.x, y: ZOMBIE.y, w: ZOMBIE.w + 34, h: ZOMBIE.h });                // 无相交门替换原值
  });
});

describe('★GMC 加宽族二：494-495 Crawdad ±18px ×1.25（:96128-96141）', () => {
  const CRAB = { x: 100, y: 100, w: 28, h: 22 };
  it('ai[2]>5：加宽 18px 且乘区（无相交门）；≤5 不变形', () => {
    const v = { x: 127, y: 102, w: 20, h: 42 };
    const off = sol({ vanillaId: 494, ...CRAB, ai2: 2 }, v);
    expect(off.damageMultiplier).toBe(1);
    const r = sol({ vanillaId: 495, ...CRAB, ai2: 19, direction: 1 }, v);
    expect(r.rect!.w).toBe(CRAB.w + 18);
    expect(r.rect!.x).toBe(CRAB.x);
    expect(r.damageMultiplier).toBe(1.25);
    expect(boxesIntersect(v, r.rect!)).toBe(true);
  });
});

describe('★GMC 屠夫专盒：460 Butcher 30×14@脚部−20 ×1.35 几何四元组（:96146-96158）', () => {
  const BUTCHER = { x: 200, y: 300, w: 18, h: 40 };
  it('direction>0：盒=(cx, trunc(y)+h−20, 30, 14)；命中替换 + ×1.35', () => {
    const cx = BUTCHER.x + BUTCHER.w / 2;                // =209，体右缘=218
    const v = { x: 222, y: 324, w: 20, h: 30 };          // 体右侧只探到前探盒带 [209,239)
    const r = sol({ vanillaId: 460, ...BUTCHER, direction: 1 }, v);
    expect(r.rect).toEqual({
      x: cx,                                             // X=(int)Center.X
      y: BUTCHER.y + BUTCHER.h - 20,                     // Y=(int)pos.Y+height−20=320
      w: 30,
      h: 14,
    });
    expect(r.damageMultiplier).toBe(1.35);
    expect(boxesIntersect(v, r.rect!)).toBe(true);
    // 反证：裸盒判定不交（证明此命中确由专盒替换承载——v.x=222>218 体右缘）
    expect(boxesIntersect(v, { x: BUTCHER.x, y: BUTCHER.y, w: 18, h: 40 })).toBe(false);
  });
  it('direction<0：X 回退身宽（面向左前探）；未中专盒 → 裸盒 ×1.0', () => {
    const r = sol({ vanillaId: 460, ...BUTCHER, direction: -1 },
      { x: 184, y: 322, w: 8, h: 20 });                  // 面向左带 [179,209) 内侧点
    expect((r.rect as ContactBox).x).toBe(BUTCHER.x + BUTCHER.w / 2 - 30);
    expect((r.rect as ContactBox).y).toBe(BUTCHER.y + BUTCHER.h - 20);
    expect(r.damageMultiplier).toBe(1.35);
    const miss = sol({ vanillaId: 460, ...BUTCHER, direction: 1 },
      { x: 400, y: 400, w: 20, h: 42 });
    expect(miss.damageMultiplier).toBe(1);               // ref 未被改写 ⇒ 回落裸盒
    expect(miss.rect).toEqual(BUTCHER);
  });
});

describe('★GMC 417 SolarSroller 滚动专盒 100²（:96161-96167）', () => {
  const SROLLER = { x: 500, y: 500, w: 46, h: 52 };
  it('ai[0]==6 ∧ ai[3]∈(0,4)：CenteredRectangle(Center,(100,100)) 替换 + ×1.35', () => {
    const v = { x: 512, y: 512, w: 20, h: 42 };
    const r = sol({ vanillaId: 417, ...SROLLER, ai0: 6, ai3: 2 }, v);
    expect(r.rect).toEqual({
      x: SROLLER.x + SROLLER.w / 2 - 50,                 // (int)(Center.X−50)
      y: SROLLER.y + SROLLER.h / 2 - 50,                 // (int)(Center.Y−50)
      w: 100,
      h: 100,
    });
    expect(r.damageMultiplier).toBe(1.35);
    expect(boxesIntersect(v, r.rect!)).toBe(true);
  });
  it('窗外态（ai[3]=0/4 或 ai[0]!=6）恒等：接的是驱动位真实档而非永开', () => {
    for (const gate of [{ ai0: 6, ai3: 4 }, { ai0: 6, ai3: 0 }, { ai0: 3, ai3: 2 }]) {
      const r = sol({ vanillaId: 417, ...SROLLER, ...gate }, { x: 508, y: 508, w: 20, h: 42 });
      expect(r.damageMultiplier).toBe(1);
      expect(r.rect).toEqual(SROLLER);
    }
  });
});

describe('★GMC 466 Psycho 专盒 30×8@脚部−32 ×1.75（:96170-96182）', () => {
  const PSYCHO = { x: 700, y: 800, w: 18, h: 40 };
  it('direction>0 四元组 + 命中/未中两相', () => {
    // 专盒 Y 带 [808,816)：受害者 y=810 与带相叠；x∈[709,739) 内侧点
    const r = sol({ vanillaId: 466, ...PSYCHO, direction: 1 },
      { x: 720, y: 810, w: 8, h: 16 });
    expect(r.rect).toEqual({
      x: PSYCHO.x + PSYCHO.w / 2,
      y: PSYCHO.y + PSYCHO.h - 32,                        // :96178 −32
      w: 30,
      h: 8,
    });
    expect(r.damageMultiplier).toBe(1.75);
    const miss = sol({ vanillaId: 466, ...PSYCHO, direction: 1 },
      { x: 750, y: 850, w: 20, h: 42 });
    expect(miss.damageMultiplier).toBe(1);                // 未中 → 裸盒回落
    expect(miss.rect).toEqual(PSYCHO);
  });
  it('mirror face=-1；未中回落裸盒 ×1.0', () => {
    const m = sol({ vanillaId: 466, ...PSYCHO, direction: -1 }, { x: 690, y: 811, w: 8, h: 12 });
    expect((m.rect as ContactBox).x).toBe(PSYCHO.x + PSYCHO.w / 2 - 30);   // [679,709)
    expect(m.damageMultiplier).toBe(1.75);
    const miss = sol({ vanillaId: 466, ...PSYCHO }, { x: 900, y: 900, w: 20, h: 42 });
    expect(miss.rect).toEqual(PSYCHO);
    expect(miss.damageMultiplier).toBe(1);
  });
});

describe('★GMC 552-554 DD2Goblin 近战尾段 34×14@脚部−20 ×1.35（:96239-96251）', () => {
  const GOBLIN = { x: 120, y: 130, w: 18, h: 40 };
  it('ai[0]∈(0,24) 开窗（起手倒数 44 态的尾段）：命中替换 + ×1.35；25/负值关闭', () => {
    const v = { x: 133, y: 152, w: 10, h: 12 };
    for (const id of [552, 553, 554]) {
      const r = sol({ vanillaId: id, ...GOBLIN, ai0: 23, direction: 1 }, v);
      expect(r.rect).toEqual({ x: GOBLIN.x + GOBLIN.w / 2, y: GOBLIN.y + GOBLIN.h - 20, w: 34, h: 14 });
      expect(r.damageMultiplier).toBe(1.35);
    }
    for (const gate of [24, 0, -7]) {
      const off = sol({ vanillaId: 553, ...GOBLIN, ai0: gate }, v);
      expect(off.damageMultiplier).toBe(1);
      expect(off.rect).toEqual(GOBLIN);
    }
  });
});

describe('★GMC 668 Deerclops 下半身裁剪 + 斧臂帧盒（:96253-96278）', () => {
  const DEER = { x: 1000, y: 1100, w: 60, h: 154 };
  it('npcRect.Height−=80 无条件（帧门外）；frame.Y==15 ∧ ai[0]!=4 → 64×180 斧臂盒（无乘区）', () => {
    // 窗外（普通帧）：只保留裁剪后的裸盒——下半身 80px 无接触
    const idle = sol({ vanillaId: 668, ...DEER, ai0: 0, frameY: 0 }, { x: 1050, y: DEER.y + 100, w: 10, h: 10 });
    expect(idle.rect).toEqual({ x: DEER.x, y: DEER.y, w: DEER.w, h: DEER.h - 80 });
    expect(idle.damageMultiplier).toBe(1);
    // 攻击帧 15：盒 X=(int)Center.X+(−num5)×dir（num5=−42 ⇒ +42·dir）、Y=(int)Center.Y−180+80
    const swing = sol({ vanillaId: 668, ...DEER, ai0: 1, frameY: 15, direction: 1 },
      { x: DEER.x + DEER.w / 2 + 45, y: DEER.y + DEER.h / 2 - 90, w: 10, h: 10 });
    expect(swing.rect).toEqual({
      x: DEER.x + DEER.w / 2 + 42,                       // :96271 字面
      y: DEER.y + DEER.h / 2 - 180 + 80,
      w: 64,
      h: 180,
    });
    expect(swing.damageMultiplier).toBe(1);              // 本支不动乘区
    // ai[0]==4（Attack1 共用拒支）不展开斧臂盒，仅裁剪盒生效
    const denied = sol({ vanillaId: 668, ...DEER, ai0: 4, frameY: 15 }, { x: DEER.x + DEER.w / 2 + 45, y: 1080, w: 10, h: 10 });
    expect(denied.rect).toEqual({ x: DEER.x, y: DEER.y, w: DEER.w, h: DEER.h - 80 });
  });
});

describe('★GMC 400 真眼 npcRect=default 与兜底身份（:96143-96144 / :96255-96258）', () => {
  it('type400 返回 rect=null（Update_NPCCollision Intersects(default) 恒假的全量语义）', () => {
    const r = sol({ vanillaId: 400, x: 10, y: 10, w: 60, h: 60, ai0: 2 },
      { x: 11, y: 11, w: 40, h: 40 });
    expect(r.rect).toBeNull();
    expect(r.damageMultiplier).toBe(1);
    expect(r.specialHitSetterOverride).toBeNull();
  });
  it('非特殊家族走恒等回落（rect≈Hitbox 副本、mult=1、无覆写）', () => {
    const r = sol({ vanillaId: 3, x: 10, y: 10, w: 18, h: 40 }, { x: 12, y: 12, w: 4, h: 4 });
    expect(r.rect).toEqual({ x: 10, y: 10, w: 18, h: 40 });
    expect(r.damageMultiplier).toBe(1);
    expect(r.specialHitSetterOverride).toBeNull();
  });
});

describe('★GMC 576/577 食人魔近挥帧窗：LegacyUnused2 冷却路由 + 专盒 ×1.75（:96185-96235）', () => {
  const OGRE = { x: 2000, y: 2000, w: 96, h: 124 };
  it('frame.Y∈15..18 → npcContactBucketId 路由 LegacyUnused2(2)；Boss 族/636 映射不变形', () => {
    for (const fy of [15, 16, 17, 18]) {
      expect(npcContactBucketId(576, 0, fy)).toBe(ImmunityCooldownID.LegacyUnused2);
      expect(npcContactBucketId(577, 0, fy)).toBe(ImmunityCooldownID.LegacyUnused2);
    }
    // 窗外/帧未落盘 → General（含回归：Boss 族路由不受影响）
    expect(npcContactBucketId(576, 0, 14)).toBe(-1);
    expect(npcContactBucketId(577, 44, null)).toBe(-1);
    expect(npcContactBucketId(396, 3)).toBe(ImmunityCooldownID.BossNoCheese);
    expect(npcContactBucketId(636, 0, 17)).toBeNull();   // 636 continue 门优先级不被帧窗穿透
  });
  it('四档专盒几何（num3 offsetX ×direction / num4 offsetY，Y=Center.Y−H+num4）+ 命中 ×1.75', () => {
    const cx = OGRE.x + OGRE.w / 2, cyc = OGRE.y + OGRE.h / 2;
    const CASES: Array<[number, number, number, number]> = [
      [15, 120, 30, 24], [16, 120, 60, 0], [17, 100, 90, 0], [18, 100, 50, 10],
    ];
    for (const [fy, w, h, oy] of CASES) {
      const ox = [0, 10, 50, 90][fy - 15];
      // direction>0 ⇒ 盒.x=Center.X−num3（num3 偏置按原文公式）：盒内点取样
      const v = { x: Math.trunc(cx) - ox + 4, y: Math.trunc(cyc) - h + oy + 4, w: 12, h: 12 };
      const r = sol({ vanillaId: 576, ...OGRE, frameY: fy, direction: 1 }, v);
      expect(r.rect).toEqual({ x: Math.trunc(cx) - ox, y: Math.trunc(cyc) - h + oy, w, h });
      expect(r.damageMultiplier).toBe(1.75);
      expect(r.specialHitSetterOverride).toBe(2);
      expect(boxesIntersect(v, r.rect!)).toBe(true);
    }
  });
  it('近挥窗内未擦到专盒：裸盒照常受理（×1.0）但桶仍切 LegacyUnused2——ref 置位先于相交判定', () => {
    // 受害者放身体底部条（y≈2100 > 四档专盒最大下沿 2086）→ rectangle4 不交而裸盒相交
    const v = { x: OGRE.x + 40, y: OGRE.y + 100, w: 20, h: 20 };
    const r = sol({ vanillaId: 577, ...OGRE, frameY: 16, direction: 1 }, v);
    expect(boxesIntersect(v, { x: OGRE.x, y: OGRE.y, w: OGRE.w, h: OGRE.h })).toBe(true);
    expect(r.damageMultiplier).toBe(1);                 // 擦不到专盒不乘
    expect(r.specialHitSetterOverride).toBe(2);         // ★但冷却路由已换挡
  });
});

// ---- 真环集成（Enemy.fixedUpdate 接触环 → Game.damagePlayer 漏斗） ----------------
interface RingCapture { args: unknown[]; chanId: number | undefined }
function ringHarness(w: World, p: Player) {
  const captures: RingCapture[] = [];
  const hooks = {
    world: w,
    player: p,
    enemies: (): unknown[] => [],
    critters: (): unknown[] => [],
    projectiles: (): unknown[] => [],
    spawnDrop: () => null,
    damagePlayer: vi.fn((...args: unknown[]): number => {
      const chan = (p as unknown as { __swNextHitBucket?: { id?: number } }).__swNextHitBucket;
      captures.push({ args, chanId: (chan?.id ?? undefined) as number | undefined });
      return 40;
    }),
    settlePlayerDeath: vi.fn(),
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
    entities: { add: vi.fn() },
  };
  return { hooks, captures };
}

describe('★GMC 真环：接触环消费变形盒/乘区/桶通道（Enemy.fixedUpdate 集成）', () => {
  it('460 屠夫：仅脚部前探专盒擦碰也受理——×1.35 流入 DamageVar（tier0 尸检 94≠裸 70）；远隔零受理对照', () => {
    const w = tallWorld(51);
    const p = new Player(30 * 16, 40 * 16, new Inventory());
    const { hooks, captures } = ringHarness(w, p);
    const e = Enemy.fromVanilla(460, 22 * 16 - 9, 41 * 16)!;
    expect(e).not.toBeNull();
    expect(e.vanillaId).toBe(460);
    e.facing = 1;                                        // 朝右：前探盒 X=(int)Center.X..
    e.vx = 0;                                            // 冻结移动（只验接触面）
    // 身右缘=cx+9；玩家 x=cx+12 进前探带（[cx, cx+30]）且在脚部 Y 带 [bottom−20,bottom−6)
    p.x = e.cx + 12;
    p.y = e.y + e.h - 30;
    p.vy = 0;
    const d0 = e.def.damage;
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.4999);   // tier=0 ⇒ 掷骰 ×1.00
    try {
      e.fixedUpdate(1 / 60, hooks as never);
      expect(captures.length).toBeGreaterThanOrEqual(1);
      const dmg = captures[0].args[0];
      expect(dmg).toBe(damageVar(d0 * 1.35, -p.luck));  // ★乘区真实进链
      if (d0 === 70) expect(dmg).not.toBe(damageVar(d0, -p.luck));   // 反证（70→94）
      expect(captures[0].args[3]).toBe(e);              // attacker 引用直通（banner/反射源）
      // 远隔放置（AI 一拍位移 ≤~1.5px 不可能补上 >300px 差）→ 零受理对照
      captures.length = 0;
      p.x = 60 * 16;
      p.y = 20 * 16;
      e.fixedUpdate(1 / 60, hooks as never);
      expect(captures.length).toBe(0);
    } finally {
      spy.mockRestore();
    }
  }, 20000);

  it('576 食人魔近挥帧（vanillaGridFrameIdx 回填位）：裸盒擦碰照常结算且通道注入 LegacyUnused2', () => {
    registerGlobalHurtBuckets(new HurtCooldownBuckets());
    const w = tallWorld(52);
    const p = new Player(30 * 16, 30 * 16, new Inventory());
    const { hooks, captures } = ringHarness(w, p);
    const e = Enemy.fromVanilla(576, 32 * 16 - 48, 34 * 16 - 62)!;
    expect(e.vanillaId).toBe(576);
    e.ai1 = 0;
    e.ai0 = 44;                                          // 近挥（AI_107 num5）中段
    e.vx = 0;
    (e as { vanillaGridFrameIdx?: number | null }).vanillaGridFrameIdx = 17;
    p.x = e.x + 38;                                      // 与身体叠置（不在任何帧窗前探带）
    p.y = e.y + 50;
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.4999);
    try {
      e.fixedUpdate(1 / 60, hooks as never);
      expect(captures.length).toBeGreaterThanOrEqual(1);
      expect(captures[0].chanId).toBe(ImmunityCooldownID.LegacyUnused2);   // ★桶换挡
      expect((p as unknown as { __swNextHitBucket?: unknown }).__swNextHitBucket)
        .toBeUndefined();                                // 出站即清
    } finally {
      spy.mockRestore();
    }
  }, 20000);

  it('577 食人魔帧未落盘（null）走 General 旧路——渲染前首拍/离屏态零回归', () => {
    registerGlobalHurtBuckets(new HurtCooldownBuckets());
    const w = tallWorld(53);
    const p = new Player(30 * 16, 30 * 16, new Inventory());
    const { hooks, captures } = ringHarness(w, p);
    const e = Enemy.fromVanilla(577, 32 * 16 - 48, 34 * 16 - 62)!;
    e.vx = 0;
    (e as { vanillaGridFrameIdx?: number | null }).vanillaGridFrameIdx = null;
    p.x = e.x + 40;
    p.y = e.y + 50;
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.4999);
    try {
      e.fixedUpdate(1 / 60, hooks as never);
      expect(captures.length).toBeGreaterThanOrEqual(1);
      expect(captures[0].chanId).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  }, 20000);

  it('BossNoCheese 分桶回归不破：桶 1 映射面逐字保持（专项集成不可行性登记）', () => {
    // 月总肢体 396-398/401 SetDefaults damage=0 ⇒ 原版 `npc.damage<=0 continue` 门下
    // 接触环本就不受理；400 由 rect=null 排除；636 的 ai[0] 由其 AI_120 每拍重写、
    // 单测无法外置钉值——故桶 1 回归以纯映射面 + 既有 A3 通道测承接：
    for (const [id, ai0, want] of [
      [396, 3, ImmunityCooldownID.BossNoCheese], [400, 3, ImmunityCooldownID.BossNoCheese],
      [401, 3, ImmunityCooldownID.BossNoCheese], [636, 5, ImmunityCooldownID.BossNoCheese],
      [636, 0, null], [3, 0, -1],
    ] as Array<[number, number, number | null]>) {
      expect(npcContactBucketId(id, ai0)).toBe(want);
    }
  });
});
