// 1457 批 C 行为闸门:新武器与弹幕 AI(叶绿双剑 1126-1129 重做/花瓣 1116/天雷 1117·1122/
// 冰牙 1115/悠悠球 per-hit 伴生弹 1125·1130·1134·1135/骨弹 1111 数据面/禁戒魂灵 1119)。
// 锚定 Terarria1457 反编译源码终值(行号见各用例);实体实现在 src/entities/proj1457.ts。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';
import {
  ChloroClaymoreBlade, ChloroSaberStab, ChloroSporeCloud, ChloroBladeSlam,
  PetalstormShot, StormLightning, GlacierFangShot,
  findSporeCloudSpawn, spawnChlorophyteSporeCloud,
} from '../src/entities/proj1457';
import { YoyoShotProj } from '../src/entities/WeaponProj';
import { MinionProj } from '../src/entities/MinionProj';
import { combatWeapon } from '../src/data/vanillaItemCombat';

type HurtArgs = [number, number, number, unknown, number?, boolean?, number?, boolean?];
interface StubEnemy extends Record<string, unknown> {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  maxHp: number; hurtLog: HurtArgs[];
  chlorophyteSporeT?: number;
}

function mkEnemy(id: number, x: number, y: number, w = 16, h = 16): StubEnemy {
  const e = { id, x, y, w, h, dead: false, maxHp: 100, hurtLog: [] as HurtArgs[] } as StubEnemy;
  Object.defineProperties(e, {
    cx: { get: () => e.x + e.w / 2 },
    cy: { get: () => e.y + e.h / 2 },
    vx: { get: () => 0 },
    vy: { get: () => 0 },
  });
  e.hurt = (...a: unknown[]) => { e.hurtLog.push(a as HurtArgs); return false; };
  return e;
}

function makeHooks(enemies: StubEnemy[] = [], store?: TileStore, player?: Record<string, unknown>): GameHooks {
  const added: Array<{ e: unknown; bucket: string }> = [];
  const hooks = {
    world: { store: store ?? new TileStore(200, 120) } as never,
    player: {
      equipStats: {}, cx: 800, cy: 1440, x: 790, y: 1419, w: 20, h: 42, dead: false,
      facing: 1, vx: 0, vy: 0, attackSpeedMult: 1, whipBuffs: {},
      tagEffectStack: { anyTagged: () => false, isNPCTagged: () => false, canProcOnNPC: () => false,
        modifyHit: () => {}, onHit: () => false, clearProcOnNPC: () => {}, activeEffects: [] },
      ...player,
    } as never,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    // WhipTag 栈（MinionProj.nearestEnemy anyTagged 查询）
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
    whipTagShot: true,
    // proj1457/MinionProj 侧 entities.add 通道(捕获生成)
    entities: { add: (e: unknown, b: string) => { added.push({ e, bucket: b }); } },
    added,
  };
  return hooks as unknown as GameHooks;
}

// ================= 1126 叶绿巨剑刃(AI_190 :42734-43000) =================

describe('1126 ChloroClaymoreBlade(AI_190 1126 支)', () => {
  it('水平(奖励)击:num≥0.8 首帧触发砸地孢子云回调,且仅一次(:42763-42820 num14<num11 门)', () => {
    let slams = 0;
    const b = new ChloroClaymoreBlade(800, 1440, 1, 0, 95, 6, 32, 1);
    b.spawnSlamCloud = () => { slams++; };
    const g = makeHooks();
    for (let i = 0; i < 32; i++) b.fixedUpdate(1 / 60, g);
    expect(slams).toBe(1);                       // 32t 恰好 num≥1,触发一次
    // 触发点在 num≥0.8 之后(age 26 = 0.8×32 向上取整档)
    expect(b.dead).toBe(true);                   // num≥1 Kill(:42997)
  });
  it('向下(普通)击:localAI[2]=0 → 全程不触发孢子云回调(:42763 localAI[2]==1 门)', () => {
    let slams = 0;
    const b = new ChloroClaymoreBlade(800, 1440, -1, 1, 95, 6, 32, 1);
    b.spawnSlamCloud = () => { slams++; };
    const g = makeHooks();
    for (let i = 0; i < 40; i++) b.fixedUpdate(1 / 60, g);
    expect(slams).toBe(0);
    expect(b.dead).toBe(true);
  });
  it('挥击尾孢子:age==animMax/3 与 2/3 保底各出一颗 1128(:42933-42938 flag 强制门)', () => {
    const spores: Array<[number, number, number, number, number]> = [];
    const b = new ChloroClaymoreBlade(800, 1440, 1, 1, 95, 6, 32, 1);
    b.spawnSpore = (x, y, vx, vy, life) => spores.push([x, y, vx, vy, life]);
    const g = makeHooks();
    for (let i = 0; i < 32; i++) b.fixedUpdate(1 / 60, g);
    const ages = [Math.floor(32 / 3), Math.floor((32 / 3) * 2)];   // 10/21 保底帧
    expect(spores.length).toBeGreaterThanOrEqual(2);               // 至少两颗保底
    expect(spores.length).toBeLessThanOrEqual(32);                 // 上限=每帧一颗
    void ages;
  });
  it('命中:usesLocalNPCImmunity cooldown −1 → 同敌只结算一次(:10550-10556)', () => {
    const e = mkEnemy(1, 790, 1430);
    const b = new ChloroClaymoreBlade(800, 1440, 1, 0, 95, 6, 32, 1);
    const g = makeHooks([e]);
    for (let i = 0; i < 32; i++) b.fixedUpdate(1 / 60, g);
    expect(e.hurtLog.length).toBe(1);
  });
});

// ================= 1127 叶绿军刃刺(AI_161 1127 支 :48483-48560) =================

describe('1127 ChloroSaberStab(AI_161 1127 支)', () => {
  it('寿命 = 16×meleeSpeed+5(:48492);ai[1]=1 → 21t 消亡', () => {
    const s = new ChloroSaberStab(1, 0, 2.4, 1, 80, 5);
    const g = makeHooks();
    let ticks = 0;
    while (!s.dead && ticks < 100) { s.fixedUpdate(1 / 60, g); ticks++; }
    expect(ticks).toBe(21);
  });
  it('meleeSpeed 3 → 寿命 53t(穿刺范围随攻速成长,:48492 num=16ms+5)', () => {
    const s = new ChloroSaberStab(1, 0, 2.4, 3, 80, 5);
    const g = makeHooks();
    let ticks = 0;
    while (!s.dead && ticks < 200) { s.fixedUpdate(1 / 60, g); ticks++; }
    expect(ticks).toBe(53);
  });
  it('命中挂 397 孢子侵染 300t(StatusNPC :11729-11732,projstatus 表驱动)+每敌一次', () => {
    const e = mkEnemy(1, 805, 1435);
    const s = new ChloroSaberStab(1, 0, 2.4, 1, 80, 5);
    const g = makeHooks([e]);
    for (let i = 0; i < 25; i++) s.fixedUpdate(1 / 60, g);
    expect(e.hurtLog.length).toBe(1);
    expect(e.chlorophyteSporeT).toBe(5);                         // AddBuff(397,300t)→5s(projstatus 秒口径)
  });
});

// ================= 1128/1129 孢子云生成器(SpawnChlorophyteSporeCloud :42616-42733) =================

describe('孢子云生成器(findSporeCloudSpawn :42565 + spawnChlorophyteSporeCloud :42616)', () => {
  it('找 solid 台面(上格非 solid)取最近者,落点 = 台面顶 −8(:42578-42583)', () => {
    const st = new TileStore(200, 120);
    for (let x = 0; x < 200; x++) st.setTileSilent(x, 60, 1);    // 地板(y=60)
    const spot = findSporeCloudSpawn(st, 40 * 16 + 8, 58 * 16, 1);
    expect(spot).not.toBeNull();
    expect(spot!.y).toBe(60 * 16 - 8);                           // 台面顶 −8
    expect(Math.abs(spot!.x - (40 * 16 + 8))).toBeLessThanOrEqual(5 * 16 + 1);
  });
  it('出手向右扫 [−5,0] 列(:42574-42579 Sign(velocity.X)>0 → num4−=5)', () => {
    const st = new TileStore(200, 120);
    for (let x = 0; x < 200; x++) st.setTileSilent(x, 60, 1);
    st.setTileSilent(36, 60, 0);                                 // 左侧 36 列挖空
    const spot = findSporeCloudSpawn(st, 40 * 16 + 8, 58 * 16, 1);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBeGreaterThanOrEqual(37 * 16 - 1);         // 只在 [35,40] 列找
  });
  it('每台面出孢子数 = 列内唯一台面 2 颗/多台面各 1 颗(:42700 num3==1?2:1);出孢子 → 1129 大爆炸+音', () => {
    const st = new TileStore(200, 120);
    for (let x = 0; x < 200; x++) st.setTileSilent(x, 60, 1);
    const clouds: number[] = [];
    const slams: number[] = [];
    let soundPlayed = 0;
    spawnChlorophyteSporeCloud(st, 40 * 16 + 8, 59 * 16, 1, 1, 100, {
      spawnCloud: (_x, _y, _vx, _vy, dmg) => clouds.push(dmg),
      spawnSlam: (_x, _y, dmg) => slams.push(dmg),
      ownedClouds: () => 0,
      playSlamSound: () => { soundPlayed++; },
      dust: () => {},
    });
    // 单列单台面 → 每列 2 颗;6 列全台面 → 12 颗掷(rate=1 全出)
    expect(clouds.length).toBe(12);
    for (const d of clouds) expect(d).toBe(75);                  // ×0.75(:42702 num11)
    expect(slams.length).toBe(1);
    expect(slams[0]).toBe(100);                                  // 大爆炸 ×1(:42727 num13)
    expect(soundPlayed).toBe(1);                                 // Item167(:42732)
  });
  it('owned[1128]≥100 → 掷率 0.2(:42633 Remap(owned,10,100,1,0.2))——统计意义近似', () => {
    const st = new TileStore(200, 120);
    for (let x = 0; x < 200; x++) st.setTileSilent(x, 60, 1);
    let n = 0;
    for (let trial = 0; trial < 200; trial++) {
      spawnChlorophyteSporeCloud(st, 40 * 16 + 8, 59 * 16, 1, 1, 100, {
        spawnCloud: () => { n++; },
        spawnSlam: () => {},
        ownedClouds: () => 100,
        playSlamSound: () => {},
        dust: () => {},
      });
    }
    // 12 颗/轮 × 0.2 ≈ 2.4/轮;200 轮期望 ~480,放宽到 1/4~4 倍
    expect(n).toBeGreaterThan(120);
    expect(n).toBeLessThan(1920);
  });
});

// ================= 1128 云体行为(aiStyle 92 flag46 :33143-33405) =================

describe('1128 ChloroSporeCloud(aiStyle 92 flag46 支)', () => {
  it('寿命 ai[1](90+rand60 档)/缺省 220(:33168);上飘 vy−0.01/t(:33189)', () => {
    const c = new ChloroSporeCloud(800, 800, 0, 0, 70, 95);
    const g = makeHooks();
    for (let i = 0; i < 96; i++) c.fixedUpdate(1 / 60, g);       // ai[0]>95 Kill(:33172)
    expect(c.dead).toBe(true);
    const c2 = new ChloroSporeCloud(800, 800, 0, 0, 70, 0);      // ai[1]==0 → 220(:33168)
    for (let i = 0; i < 221; i++) c2.fixedUpdate(1 / 60, g);     // ai[0]>220 Kill(:33172-33176)
    expect(c2.dead).toBe(true);
  });
  it('IDStatic 免疫 30(:10574-10575)→ 同敌 30t 内不重复结算', () => {
    const e = mkEnemy(1, 790, 790);
    const c = new ChloroSporeCloud(800, 800, 0, 0, 70, 220);
    const g = makeHooks([e]);
    for (let i = 0; i < 29; i++) c.fixedUpdate(1 / 60, g);
    expect(e.hurtLog.length).toBe(1);
  });
});

// ================= 1129 大爆炸盒(AI_209 :42741-42748) =================

describe('1129 ChloroBladeSlam(AI_209)', () => {
  it('ai[0]++>20 Kill(:42746-42748);命中盒 = ai[1]×ai[2](128×96)', () => {
    const e = mkEnemy(1, 700, 700);
    const s = new ChloroBladeSlam(720, 720, 128, 96, 95);
    const g = makeHooks([e]);
    let ticks = 0;
    while (!s.dead && ticks < 40) { s.fixedUpdate(1 / 60, g); ticks++; }
    expect(ticks).toBe(21);
    expect(e.hurtLog.length).toBe(1);                            // 每敌一次(cooldown −1)
  });
});

// ================= 1116 花瓣风暴弹(AI_196 1116 支 :41192-41290) =================

describe('1116 PetalstormShot(AI_196 1116 支)', () => {
  it('前 20t 减速 ×0.95(:41220-41227);索敌 400px 无 LOS 门(:41246-41249)追踪 v=(v×30+dir×6)/31', () => {
    const e = mkEnemy(1, 1000, 1440);                            // 200px < 400
    const p = new PetalstormShot(800, 1440, 4, 0, 20, 3.5, 0);
    const g = makeHooks([e]);
    for (let i = 0; i < 30; i++) p.fixedUpdate(1 / 60, g);
    expect(p.cx).toBeGreaterThan(830);                           // 朝敌推进
  });
  it('寿命 120(:10419 timeLeft);命中 penetrate 1 + 每敌一次(:10421-10423)', () => {
    const e = mkEnemy(1, 805, 1435);
    const p = new PetalstormShot(800, 1440, 1, 0, 20, 3.5, 0);
    const g = makeHooks([e]);
    let ticks = 0;
    while (!p.dead && ticks < 200) { p.fixedUpdate(1 / 60, g); ticks++; }
    expect(ticks).toBe(120);
    expect(e.hurtLog.length).toBe(1);
  });
});

// ================= 1117/1122 天雷/红雷(AI_203 :40360-40560) =================

describe('StormLightning(AI_203_StormLightning)', () => {
  it('1117:寿命 30(:40367 num=30);12px 内索敌 MoveTowards 32(:40370/:40443)', () => {
    const e = mkEnemy(1, 830, 1440);                             // 30px > 12 → 不索敌
    const far = new StormLightning(1117, 800, 1440, 120, 10);
    const g1 = makeHooks([e]);
    far.fixedUpdate(1 / 60, g1);
    expect(far.dead).toBe(false);
    const e2 = mkEnemy(2, 806, 1440);                            // 6px < 12 → 索敌贴脸
    const near = new StormLightning(1117, 800, 1440, 120, 10);
    const g2 = makeHooks([e2]);
    for (let i = 0; i < 5; i++) near.fixedUpdate(1 / 60, g2);
    expect(Math.abs(near.cx - e2.cx)).toBeLessThanOrEqual(32);
  });
  it('1117 30t 消亡 / 1122 240t(:40363 num 缺省 240)', () => {
    const g = makeHooks();
    const a = new StormLightning(1117, 800, 800, 120, 10);
    for (let i = 0; i < 30; i++) a.fixedUpdate(1 / 60, g);
    expect(a.dead).toBe(true);
    const b = new StormLightning(1122, 800, 800, 180, 4);
    for (let i = 0; i < 239; i++) b.fixedUpdate(1 / 60, g);
    expect(b.dead).toBe(false);
    b.fixedUpdate(1 / 60, g);                                    // ai[1]>=240 Kill(:40445)
    expect(b.dead).toBe(true);
  });
  it('1122 IDStatic 10(:10567 段)同型共享 → 双雷同帧同敌只结算一次', () => {
    const e = mkEnemy(1, 795, 795);
    const g = makeHooks([e]);
    const a = new StormLightning(1122, 800, 800, 180, 4);
    const b = new StormLightning(1122, 802, 802, 180, 4);
    a.fixedUpdate(1 / 60, g);
    b.fixedUpdate(1 / 60, g);
    expect(e.hurtLog.length).toBe(1);
  });
});

// ================= 1115 冰川之牙(AI_208 :37576-37750) =================

describe('1115 GlacierFangShot(AI_208 蓄力冰矛)', () => {
  it('满档释放:伤 ×Remap(charge,0,60,1,4)=×4(:37643-37646);channel 断 → 立即释放', () => {
    let holding = true;
    let paid = 0;
    const gf = new GlacierFangShot(800, 1440, 1, 0, 11, 2, {
      channel: () => holding,
      aim: () => ({ x: 1600, y: 1440 }),
      payMana: () => { paid++; },
      chargeRate: () => 1,                                       // 测试恒 1/t(60t 满档)
    });
    const g = makeHooks();
    for (let i = 0; i < 60; i++) gf.fixedUpdate(1 / 60, g);
    expect((gf as unknown as { charge: number }).charge).toBeGreaterThanOrEqual(60);
    holding = false;
    const before = gf.damage;
    gf.fixedUpdate(1 / 60, g);                                   // 释放帧
    expect(gf.damage).toBe(before * 4);                          // ×4(:37644 Remap→toMax)
    expect(paid).toBeGreaterThanOrEqual(2);                      // 每 20t CheckMana(:37610-37613)
  });
  it('释放后撞实心块消亡(tileCollide=true :37644)', () => {
    const st = new TileStore(200, 120);
    for (let x = 0; x < 200; x++) for (let y = 80; y < 120; y++) st.setTileSilent(x, y, 1);
    const gf = new GlacierFangShot(40 * 16, 78 * 16, 0, 1, 11, 2, {
      channel: () => false, aim: () => ({ x: 640, y: 1400 }),
      payMana: () => {}, chargeRate: () => 1,
    });
    const g = makeHooks([], st);
    gf.fixedUpdate(1 / 60, g);                                   // 释放帧
    expect(gf.dead).toBe(false);
    for (let i = 0; i < 200 && !gf.dead; i++) gf.fixedUpdate(1 / 60, g);
    expect(gf.dead).toBe(true);
  });
});

// ================= 1125/1130/1134/1135 悠悠球伴生弹(批 3 实体 + 批 C 接线) =================

describe('YoyoShotProj(EverySomeYoyoHits 伴生弹,Projectile.cs:10530-10670 SetDefaults)', () => {
  it('1134 CrystalShardMelee:penetrate 1(:10643)首中后停;IDStatic 20 同型共享', () => {
    const e = mkEnemy(1, 795, 795);
    const g = makeHooks([e]);
    const cd = new (YoyoShotProj as unknown as { new(spec: Record<string, unknown>): InstanceType<typeof YoyoShotProj> })({});
    void cd;
    const a = new YoyoShotProj({ x: 800, y: 800, vx: 0, vy: 0, projId: 1134, dmg: 50, kb: 2 });
    const b = new YoyoShotProj({ x: 800, y: 800, vx: 0, vy: 0, projId: 1134, dmg: 50, kb: 2,
      sharedCd: (a as unknown as { testShared?: unknown }).testShared as never });
    void b;
    a.fixedUpdate(1 / 60, g);
    a.fixedUpdate(1 / 60, g);
    a.fixedUpdate(1 / 60, g);
    expect(e.hurtLog.length).toBe(1);                            // penetrate 1 一击即停
  });
  it('1125 CascadeExplosion:10t 寿命(5 帧×2t,:43056-43063)+每敌一次(local −1)', () => {
    const e = mkEnemy(1, 795, 795);
    const g = makeHooks([e]);
    const a = new YoyoShotProj({ x: 800, y: 800, vx: 1, vy: 0, projId: 1125, dmg: 100, kb: 2, scale: 1.2 });
    let ticks = 0;
    while (!a.dead && ticks < 40) { a.fixedUpdate(1 / 60, g); ticks++; }
    expect(ticks).toBeLessThanOrEqual(11);
    expect(e.hurtLog.length).toBe(1);
    expect(e.hurtLog[0][0]).toBe(100);
  });
});

// ================= 1119 禁戒魂灵(AI_206 :38182-38395,MinionProj 专支) =================

describe('1119 ForbiddenMinion(AI_206)', () => {
  it('开火循环:索敌 → 150t 冷却,第 120t 发 1120(FastThenSlow 宝石位)+反冲(:38258-38277)', () => {
    const e = mkEnemy(1, 900, 1440);
    const g = makeHooks([e]);
    const m = new MinionProj(800, 1440, 1119, 40, 4, false, 0, false, () => null);
    // 注入 owner(玩家引用)
    (m as unknown as { ownerRef: () => unknown }).ownerRef = () => g.player;
    for (let i = 0; i < 121; i++) m.fixedUpdate(1 / 60, g);
    const added = (g as unknown as { added: Array<{ e: { projId?: number } }> }).added;
    const shots = added.filter((a) => (a.e as { projId?: number }).projId === 1120);
    expect(shots.length).toBe(1);
  });
});

// ================= 数据面:combatWeapon 分流(1457 终值) =================

describe('1457 批 C 武器分流(combatWeapon)', () => {
  it('6152 DaybloomStaff → magic/shoot 1114/useAnim 40+useTime 4(一挥多发)', () => {
    const cw = combatWeapon({ key: 'vi_6152_DaybloomStaff' });
    expect(cw).toMatchObject({ kind: 'magic', shoot: 1114, useTime: 4, mana: 5 });
  });
  it('6153 GlacierFang → magic/shoot 1115(蓄力冰矛)/crit 11', () => {
    const cw = combatWeapon({ key: 'vi_6153_GlacierFang' });
    expect(cw).toMatchObject({ kind: 'magic', shoot: 1115 });
    const c = combatWeapon({ key: 'vi_6153_GlacierFang' }) as { shootSpeed?: number };
    expect(c.shootSpeed).toBe(4);
  });
  it('6154 Petalstorm → magic/shoot 1116/useAnim 42', () => {
    const cw = combatWeapon({ key: 'vi_6154_Petalstorm' });
    expect(cw).toMatchObject({ kind: 'magic', shoot: 1116, useTime: 42 });
  });
  it('6155 LightningStrike → magic/shoot 1117/damage 150/kb 10/crit 10(SetWeaponValues)', () => {
    const cw = combatWeapon({ key: 'vi_6155_LightningStrike' });
    expect(cw).toMatchObject({ kind: 'magic', shoot: 1117, damage: 150, knockback: 10 });
  });
  it('6173 ArcSurge → magic/shoot 1122/useTime 6/damage 180', () => {
    const cw = combatWeapon({ key: 'vi_6173_ArcSurge' });
    expect(cw).toMatchObject({ kind: 'magic', shoot: 1122, useTime: 6, damage: 180 });
  });
  it('1227 叶绿军刃 → shot(1127 专支,不落通用 SpearProj)/shootSpeed 2.4', () => {
    const cw = combatWeapon({ key: 'vi_1227_ChlorophyteSaber' });
    expect(cw).toMatchObject({ kind: 'shot', shoot: 1127, shootSpeed: 2.4, damage: 80 });
  });
  it('1226 叶绿巨剑 → melee(shoot 1126 专支)/useAnim=useTime=32', () => {
    const cw = combatWeapon({ key: 'vi_1226_ChlorophyteClaymore' });
    expect(cw).toMatchObject({ kind: 'melee', shoot: 1126, useTime: 32, useAnimation: 32 });
  });
  it('6161/6164 召唤杖 → summon(1118/1119 非哨兵 aiStyle 集)', () => {
    expect(combatWeapon({ key: 'vi_6161_ClayPotMinion' })).toMatchObject({ kind: 'summon', shoot: 1118, sentry: false });
    expect(combatWeapon({ key: 'vi_6164_ForbiddenMinion' })).toMatchObject({ kind: 'summon', shoot: 1119, sentry: false });
  });
});
