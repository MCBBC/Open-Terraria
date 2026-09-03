// 终局残余·Solar 内容移植批（2026-09-03）——NB-D 审计双案补齐回归：
//   S1 636 太阳耀斑 Daybreak（ProjectileID.cs:1724）实体/数据面 + AI_113_TargetSticker
//      蓄力支账（1457 Projectile.cs:41289-41660 亲读：受理集 = aiStyle 113 全族
//      {598,614,636,971,975,1024}，命中结算 :13244-13250 进 ai[0]=1，附着相动态置位
//      ignoreWater=true :41397 / tileCollide=false :41399）；
//   S2 417 SolarSroller（NPCID.cs:11905）SetDefaults（NPC.cs:15383-15394）+ AI_039
//      滚动态逐值（NPC.cs:29699-29832 + Collision_MoveSolarSroller :93879-93896，
//      含 ai[3] 尘爆子计数 1..10——NB-D 备案面）+ GetMeleeCollisionData 417 专盒
//      （NPC.cs:96161-96167）驱动侧可达；
//   S3 projClass 投影断言。★勘误：636 类别 = melee 非 magic——SetDefaults :6840-6850
//      逐值 melee=true 且无 magic 旗，vanilla-projectiles.json 同真值（任务书前提
//      反转以反编译为准）。
// 唯一标杆 = Terarria1457 反编译源码。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { projectileData } from '../src/data/vanillaProjectiles';
import { projClassOfProjId, resolveProjClass } from '../src/entities/projTargets';
import { getMeleeCollisionData } from '../src/player/MeleeCollisionData';
import { DaybreakFlare, daybreakStacks, DaybreakExplosionProj } from '../src/entities/WeaponProj';
import { Enemy } from '../src/entities/Enemy';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

// ---------------------------------------------------------------------------
// 桩基建（spawn-anchor-r9 / gc-entity-contract / antlion-tilt 同族）
// ---------------------------------------------------------------------------

interface HurtSpy {
  x: number; y: number; w: number; h: number; cx: number; cy: number;
  dead: boolean; id: number; vanillaId: number;
  dontTakeDamage?: boolean;
  def?: { friendly?: boolean };
  hurts: Array<{ dmg: number; kbx: number }>;
  hurt(this: HurtSpy, dmg: number, kbx: number): boolean;
}

function enemyStub(x: number, y: number, w = 200, h = 200, vid = 15, id = 55): HurtSpy {
  const st = {
    x, y, w, h, dead: false, id, vanillaId: vid,
    def: { friendly: false },
    hurts: [],
    hurt(this: HurtSpy, dmg: number, kbx: number) {
      this.hurts.push({ dmg, kbx });
      return true;
    },
  } as HurtSpy;
  st.cx = x + w / 2;
  st.cy = y + h / 2;
  return st;
}

function flareHooks(world: World, enemies: unknown[], added: unknown[],
  dustTypes: number[] = [], notes: Array<[number, number]> = []) {
  return {
    world,
    player: { dead: false, cx: 40 * TILE, cy: 20 * TILE },
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    entities: { nextId: 1, add: (e: unknown) => added.push(e) },
    cutTile: () => {},
    spawnParticles: () => {},
    spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number) => {
      dustTypes.push(type);
      return { vx: 1, vy: 1, scale: 1, fadeIn: 0 };
    },
    spawnFriendlyProj: (e: unknown) => added.push(e),
    onProjectileDeath: () => {},
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    addLightAt: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    noteNpcPlayerImmune: (npcId: number, t: number) => notes.push([npcId, t]),
  } as never as GameHooks;
}

const FLOOR = 60;

function npcWorld(): World {
  const w = new World(200, 80, 11, 'solar-417');
  const st = w.store;
  for (let x = 0; x < 200; x++) st.setTile(x, FLOOR, 1);
  w.clock.timeOfDay = 0.9;
  return w;
}

function spawn417(w: World, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(417, tx * TILE, ty * TILE)!;
  e.id = 1;
  return e;
}

function driveTortoise(e: Enemy, h: { hooks: GameHooks; player: Player }, times = 1): void {
  const fn = (e as unknown as Record<string, (g: GameHooks, p: Player | null) => void>).tortoiseAI;
  for (let i = 0; i < times; i++) fn.call(e, h.hooks, h.player);
}

function driveUntil(e: Enemy, h: { hooks: GameHooks; player: Player }, ai0: number, cap = 200): number {
  const fn = (e as unknown as Record<string, (g: GameHooks, p: Player | null) => void>).tortoiseAI;
  let n = 0;
  while (n < cap && e.ai0 !== ai0) { fn.call(e, h.hooks, h.player); n++; }
  return n;
}

function npcHooks(w: World, player: Player): { hooks: GameHooks; player: Player } {
  const hooks = {
    world: w, player,
    enemies: () => [], critters: () => [], npcs: () => [],
    damagePlayer: (): number => 0, spawnDrop: () => null, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1, fadeIn: 0 }),
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    cutTile: () => {}, addLightAt: () => {},
    entities: { nextId: 1, add: () => {} },
  } as never as GameHooks;
  return { hooks, player };
}

// ===================== S1/S3：636 数据面 + 类别投影 =====================

describe('S1 636 Daybreak 数据面（SetDefaults :6840-6850 全值）', () => {
  it('vanilla-projectiles.json 逐字段（aiStyle113/16×16/penetrate−1/friendly/melee/extraUpdates1）', () => {
    const pd = projectileData(636);
    expect(pd).toBeDefined();
    expect(pd!.aiStyle).toBe(113);
    expect(pd!.width).toBe(16);
    expect(pd!.height).toBe(16);
    expect(pd!.penetrate).toBe(-1);
    expect(pd!.friendly).toBe(true);
    expect(pd!.melee).toBe(true);
    expect(pd!.extraUpdates).toBe(1);        // MaxUpdates=2 → extraUpdates=1（setter :338-348）
    expect(pd!.magic).toBeUndefined();       // ★勘误锚：无 magic 旗
    expect(pd!.tileCollide).toBeUndefined(); // 飞行相撞块即毁（附着相才动态置 false）
    expect(pd!.ignoreWater).toBeUndefined(); // 动态置位在蓄力支 :41397,数据面外
  });

  it('S3 projClass 投影 = melee（resolveProjClass 单源；任务书 magic 前提被反编译否决）', () => {
    expect(projClassOfProjId(636)).toBe('melee');
    expect(resolveProjClass({ projId: 636 })).toBe('melee');
    // 蓄力支同族类别面（SetDefaults 逐型：598 ranged :6472-6480 / 971·975 melee /
    // 1024 magic / 614 无旗 → null）——crit 掷/浸剂门按类各归各位
    expect(projClassOfProjId(598)).toBe('ranged');
    expect(projClassOfProjId(971)).toBe('melee');
    expect(projClassOfProjId(975)).toBe('melee');
    expect(projClassOfProjId(1024)).toBe('magic');
    expect(projClassOfProjId(614)).toBeNull();
  });

  it('实体面：16×16 盒 + projId/meleeProj 位（ctor 收盒左上,Game 侧 placeAtShootSpawn 回正）', () => {
    const f = new DaybreakFlare(1000, 1000, 4, 0, 42, 2);
    expect(f.w).toBe(16);
    expect(f.h).toBe(16);
    expect((f as unknown as { projId: number }).projId).toBe(636);
    expect((f as unknown as { meleeProj: boolean }).meleeProj).toBe(true);
    expect(f.x).toBe(1000);                  // ctor 不回正（spawn-anchor-r9 契约）
    expect(f.y).toBe(1000);
  });
});

// ===================== S1：AI_113 飞行相（ai[0]==0） =====================

describe('S1 636 飞行相：45 AI 拍缓坠门 + 撞块即毁', () => {
  it('44 拍内零重力（:41373 门 ai[1]>=45），第 45/46 拍起 vx×0.995/vy+0.15（636 档 :41396-98）', () => {
    const w = new World(64, 64, 7, 's636-fly');
    const added: unknown[] = [];
    const game = flareHooks(w, [], added);
    const f = new DaybreakFlare(30 * TILE, 20 * TILE, 2, 0, 50, 2);
    for (let i = 0; i < 22; i++) f.fixedUpdate(1 / 60, game);   // 44 AI 拍
    expect(f.vy).toBe(0);                    // 缓坠门未开
    expect(f.vx).toBe(2);
    f.fixedUpdate(1 / 60, game);             // 46 AI 拍
    expect(f.vy).toBeCloseTo(0.30, 5);       // 0.15×2 子步
    expect(f.vx).toBeCloseTo(2 * 0.995 * 0.995, 5);
    // rotation = atan2(vy,vx)+π/2（:41545-41549,636 无 1024 的 −π/2 档）
    expect((f as unknown as { rot: number }).rot)
      .toBeCloseTo(Math.atan2(0.30, 2 * 0.995 * 0.995) + Math.PI / 2, 4);
  });

  it('飞行撞实心砖 → 即毁 + Kill 双环尘（num174∈{0,3} × 5 粒 = 10 尘）+ 953 爆焰伴生', () => {
    const w = new World(64, 64, 7, 's636-wall');
    const st = w.store;
    for (let y = 10; y < 16; y++) st.setTile(40, y, 1);        // 竖墙
    const added: unknown[] = [];
    const dusts: number[] = [];
    const game = flareHooks(w, [], added, dusts);
    const f = new DaybreakFlare(38 * TILE, 12 * TILE + 8, 4, 0, 50, 2);
    let ticks = 0;
    while (!(f as unknown as { dead: boolean }).dead && ticks < 40) {
      f.fixedUpdate(1 / 60, game);
      ticks++;
    }
    expect((f as unknown as { dead: boolean }).dead).toBe(true);
    expect(dusts.length).toBe(10);           // 636 Kill 尘窗（:73384-73396）
    expect(dusts.every((t) => t === 6 || t === 259 || t === 158)).toBe(true);
    const expl = added.filter((a) => a instanceof DaybreakExplosionProj);
    expect(expl.length).toBe(1);
    expect((expl[0] as DaybreakExplosionProj).damage).toBe(50);   // damage 满额继承
  });
});

// ===================== S1：AI_113 蓄力（附着）相 ai[0]==1 =====================

describe('S1 636 蓄力支：附着/跟随/寿命/动态质地/目标受理门', () => {
  it('命中即附着：ai[0]=1、ai[1]=victim、悬挂偏移 ×0.75（:13244-13250）；daybreakStacks 计层', () => {
    const w = new World(64, 64, 7, 's636-stick');
    const e = enemyStub(30 * TILE, 20 * TILE);
    const added: unknown[] = [];
    const game = flareHooks(w, [e], added);
    // 命中盒 = 敌盒各边内缩 1/8（:41588-41590 目标 200² → 内缩 25）——瞄盒心
    const f = new DaybreakFlare(e.x + 92, e.y + 92, 0, 0, 50, 3);
    f.fixedUpdate(1 / 60, game);
    expect(e.hurts.length).toBe(1);          // 首击结算（StrikeNPC）
    const p = f as unknown as Record<string, number>;
    expect(p.ai0).toBe(1);
    expect(p.ai1).toBe(55);
    expect(f.vx).toBeCloseTo((e.cx - f.cx) * 0.75, 4);
    expect(daybreakStacks(55)).toBe(1);
  });

  it('附着跟随 = 敌心 − velocity×2（:41492-41493）且目标拖入实心腔不死（tileCollide=false :41399）', () => {
    const w = new World(64, 64, 7, 's636-follow');
    const st = w.store;
    for (let y = 18; y < 24; y++) for (let x = 28; x < 34; x++) st.setTile(x, y, 1); // 实心腔
    const e = enemyStub(20 * TILE, 20 * TILE, 40, 40, 15, 56);  // 开阔区先附着(独立 id 防 STUCK_FLARES 跨测试串层)
    const added: unknown[] = [];
    const game = flareHooks(w, [e], added);
    const f = new DaybreakFlare(e.x + 12, e.y + 12, 0, 0, 50, 3);   // 内缩 5 后盒内
    f.fixedUpdate(1 / 60, game);
    expect((f as unknown as Record<string, number>).ai0).toBe(1);
    e.x = 29 * TILE + 8; e.y = 19 * TILE + 8;                // 目标移入实心腔
    e.cx = e.x + e.w / 2; e.cy = e.y + e.h / 2;
    for (let i = 0; i < 5; i++) f.fixedUpdate(1 / 60, game);
    const p = f as unknown as Record<string, number>;
    expect(f.cx).toBeCloseTo(e.cx - p.vx * 2, 3);   // Center = npc.Center − velocity×2
    expect(f.cy).toBeCloseTo(e.cy - p.vy * 2, 3);
    expect((f as unknown as { dead: boolean }).dead).toBe(false);   // 实心内不死=动态置位语义
  });

  it('附着寿命 60×num11=600 AI 次（num11=5×MaxUpdates=10 :41400-41415）→ 300t 消亡 + 953 伴生', () => {
    const w = new World(64, 64, 7, 's636-life');
    const e = enemyStub(30 * TILE, 20 * TILE, 200, 200, 15, 57);
    const added: unknown[] = [];
    const game = flareHooks(w, [e], added);
    const f = new DaybreakFlare(e.x + 92, e.y + 92, 0, 0, 50, 3);
    f.fixedUpdate(1 / 60, game);             // 子步 1 飞行+命中附着,子步 2 起附着计数
    expect((f as unknown as Record<string, number>).localT).toBe(1);
    for (let i = 0; i < 300; i++) f.fixedUpdate(1 / 60, game);   // 累计 601 子步 → localT 600
    expect((f as unknown as { dead: boolean }).dead).toBe(true);
    expect(added.filter((a) => a instanceof DaybreakExplosionProj).length).toBe(1);
    expect(daybreakStacks(57)).toBe(0);      // detach 摘层
  });

  it('目标翻 dontTakeDamage → flag → Kill（:41488 else 支受理门,2026-09-03 补）', () => {
    const w = new World(64, 64, 7, 's636-gate');
    const e = enemyStub(30 * TILE, 20 * TILE, 200, 200, 15, 58);
    const added: unknown[] = [];
    const game = flareHooks(w, [e], added);
    const f = new DaybreakFlare(e.x + 92, e.y + 92, 0, 0, 50, 3);
    f.fixedUpdate(1 / 60, game);
    expect((f as unknown as Record<string, number>).ai0).toBe(1);
    e.dontTakeDamage = true;                 // 免伤翻位（克脑一阶/石巨人缩头族）
    f.fixedUpdate(1 / 60, game);
    expect((f as unknown as { dead: boolean }).dead).toBe(true);
  });

  it('KillOldestJavelin：第 9 枚附着淘汰 timeLeft 最老者（:13995-14020,上限 8）', () => {
    const w = new World(64, 64, 7, 's636-cap');
    const e = enemyStub(30 * TILE, 20 * TILE, 200, 200, 15, 60);
    const added: unknown[] = [];
    const game = flareHooks(w, [e], added);
    const flares: DaybreakFlare[] = [];
    for (let i = 0; i < 9; i++) {
      const f = new DaybreakFlare(e.x + 92, e.y + 92, 0, 0, 50, 3);
      flares.push(f);
      f.fixedUpdate(1 / 60, game);           // 逐枚附着（每枚隔 1 拍=递增 age）
      e.hurts.length = 0;                    // 清结算记录隔离断言面
    }
    const alive = flares.filter((f) => !(f as unknown as { dead: boolean }).dead);
    expect(alive.length).toBe(8);
    expect((flares[0] as unknown as { dead: boolean }).dead).toBe(true);   // 最老者被灭
    expect(daybreakStacks(60)).toBe(8);
  });
});

// ===================== S2：417 SolarSroller =====================

describe('S2 417 SetDefaults（NPC.cs:15383-15394 全值）', () => {
  it('46×52 / lifeMax 700 / damage 80 / defense 34 / kb 0', () => {
    const w = npcWorld();
    const e = spawn417(w, 40, FLOOR - 4);
    expect(e.w).toBe(46);
    expect(e.h).toBe(52);
    expect(e.def.hp).toBe(700);
    expect(e.def.damage).toBe(80);           // 经典档 ScaleStats ×1
    expect(e.def.defense).toBe(34);
    expect(e.def.knockbackResist).toBe(0);   // SetDefaults knockBackResist=0f
    expect(e.vanillaId).toBe(417);
  });
});

describe('S2 AI_039 充能链：待机蓄力 → 蓄势 → 态 6 罐装变形（:29587-29622）', () => {
  it('远距蓄力 14/t（+4/+10）≥400 → 态 1；30 拍 → 态 6,52→32 底边锚定,ai[2]=Next(2,5)', () => {
    const w = npcWorld();
    const e = spawn417(w, 40, FLOOR - 4);
    const player = new Player(120 * TILE, (FLOOR - 6) * TILE, new Inventory());
    const h = npcHooks(w, player);
    expect(driveUntil(e, h, 1)).toBeLessThan(200);   // ai1 14/t → 400 → 态 1
    driveTortoise(e, h, 5);                          // 蓄势态落定（gravityStep 静置）
    const bottomBefore = e.y + e.h;
    const fn = (e as unknown as Record<string, (g: GameHooks, p: Player | null) => void>).tortoiseAI;
    let guard = 0;
    while (e.ai0 !== 6 && guard++ < 60) fn.call(e, h.hooks, h.player);   // ai1 1/t ≥30 → 态 6
    expect(e.ai0).toBe(6);
    expect(e.h).toBe(32);                            // 罐装高度（:29617-29619）
    expect(e.y + e.h).toBeCloseTo(bottomBefore, 3);  // 底边锚定：position.Y±height 换算精确保持
    driveTortoise(e, h);                             // 态 6 首拍（ai[1]++ 后 ==1 = 冲撞拍）
    expect(e.ai1).toBe(1);
    expect(e.ai2 >= 2 && e.ai2 <= 4).toBe(true);     // Next(2,5)
    // 冲撞初速：CanHit 16 档（:29777-29787）——朝玩家 X 全速（归一×16）
    expect(e.vx).toBeGreaterThan(14);
    expect(e.vy).toBeLessThan(0);                    // 玩家在上方 → num632<0（含 |dx|×0.2 下压偏置反号）
  });
});

describe('S2 态 6 属性覆写 + ai[3] 尘爆子计数 + 撞块反弹（:29700-29756/:93879-93896）', () => {
  it('damage=lerp(defDmg×1.8,×1.4)（经典 144）/defense=defDef×2（68）/kbResist=0', () => {
    const w = npcWorld();
    const e = spawn417(w, 40, FLOOR - 4);
    const player = new Player(120 * TILE, (FLOOR - 6) * TILE, new Inventory());
    const h = npcHooks(w, player);
    e.ai0 = 6; e.ai1 = 5; e.ai2 = 3; e.ai3 = 0;      // 直入态 6（属性面单测）
    driveTortoise(e, h);
    expect(e.def.damage).toBe(144);          // Remap Classic→Expert(144,112) 经典取 144
    expect(e.def.defense).toBe(68);
    expect(e.kbResistOverride).toBe(0);      // :29703 knockBackResist = 0f
    expect((e as unknown as { srollerDefBase?: { dmg: number; def: number } }).srollerDefBase)
      .toEqual({ dmg: 80, def: 34 });        // ScaleStats 后快照（防复利基线）
  });

  it('撞块 → ai[2]−−、ai[3]=1；预算内 ×0.9 镜面反弹 + direction 翻转（:93879-93896）', () => {
    const w = npcWorld();
    const e = spawn417(w, 40, FLOOR - 4);
    const player = new Player(120 * TILE, (FLOOR - 6) * TILE, new Inventory());
    const h = npcHooks(w, player);
    const st = w.store;
    for (let y = FLOOR - 4; y < FLOOR; y++) st.setTile(43, y, 1);   // 滚动前方竖墙
    e.ai0 = 6; e.ai1 = 5; e.ai2 = 3; e.ai3 = 0;
    e.x = 43 * TILE - e.w - 8;               // fromVanilla 按点居中——右缘距墙 8px,单拍 10px 必撞
    e.facing = 1; e.vx = 10; e.vy = 0;
    driveTortoise(e, h);
    expect(e.ai3).toBe(1);                   // 撞块点火（尘爆子计数/接触专盒窗）
    expect(e.ai2).toBe(2);                   // 预算 −1
    expect(e.vx).toBeLessThan(0);
    expect(e.vx).toBeCloseTo(-9, 1);         // −oldVx×0.9
    expect(e.facing).toBe(-1);               // X 反弹伴随 direction 翻转
  });

  it('ai[3] 1..10 循环：==1 大爆（64 尘6）+每拍 5×尘31、≥10 归零、关窗无尘31（:29717-29753）', () => {
    const w = npcWorld();
    const e = spawn417(w, 40, FLOOR - 4);
    const player = new Player(120 * TILE, (FLOOR - 6) * TILE, new Inventory());
    const h = npcHooks(w, player);
    const dusts: number[] = [];
    const hooks = {
      ...h.hooks,
      spawnDust: (_x: number, _y: number, _w: number, _hh: number, type: number) => {
        dusts.push(type);
        return { vx: 1, vy: 1, scale: 1, fadeIn: 0 };
      },
    } as never as GameHooks;
    // 手工点火（撞块置位语义等价——纯计数面单测）。ai2=99 防退出；态 6 尘 aura
    // （2/3 概率,尘 6）与本计数并存 → 尘 6 断言取 ≥,尘 31 断言取精确
    e.ai0 = 6; e.ai1 = 5; e.ai2 = 99; e.ai3 = 1;
    const fn = (e as unknown as Record<string, (g: GameHooks, p: Player | null) => void>).tortoiseAI;
    fn.call(e, hooks, player);               // ai3==1 拍：32×2 尘6 + 5×尘31 → ai3=2
    expect(dusts.filter((t) => t === 6).length).toBeGreaterThanOrEqual(64);
    expect(dusts.filter((t) => t === 31).length).toBe(5);
    expect(e.ai3).toBe(2);
    for (let k = 0; k < 7; k++) {            // ai3 3..9 七拍（每拍 5×尘31）
      dusts.length = 0;
      fn.call(e, hooks, player);
      expect(dusts.filter((t) => t === 31).length).toBe(5);
    }
    expect(e.ai3).toBe(9);
    dusts.length = 0;
    fn.call(e, hooks, player);               // ai3=9 → 10 → 归零
    expect(e.ai3).toBe(0);
    expect(dusts.filter((t) => t === 31).length).toBe(5);
    dusts.length = 0;
    fn.call(e, hooks, player);               // 子计数关窗：无尘 31（尘 aura 不受窗控）
    expect(dusts.filter((t) => t === 31).length).toBe(0);
  });
});

describe('S2 态 5/态 0 复位面（:29813-29816 / :29464-29466）', () => {
  it('态 5 高度复原 32→52（底边锚定）；回态 0 damage/defense 复位 + kbResist=0.3 档', () => {
    const w = npcWorld();
    const e = spawn417(w, 40, FLOOR - 4);
    const player = new Player(120 * TILE, (FLOOR - 6) * TILE, new Inventory());
    const h = npcHooks(w, player);
    e.ai0 = 6; e.ai1 = 5; e.ai2 = 3; e.ai3 = 0;
    driveTortoise(e, h);
    expect(e.def.damage).toBe(144);
    // 模拟态 6 罐装变形（transition 面已在充能链测过）——底边锚定 FLOOR*TILE
    e.h = 32; e.y = FLOOR * TILE - 32;
    e.ai0 = 5;
    driveTortoise(e, h);
    expect(e.h).toBe(52);
    expect(e.y + e.h).toBeCloseTo(FLOOR * TILE, 0);   // 底边锚定复原（:29813-29816）
    e.ai0 = 0;
    driveTortoise(e, h);
    expect(e.def.damage).toBe(80);           // damage = defDamage（srollerDefBase）
    expect(e.def.defense).toBe(34);
    // GetKnockbackMultiplier_ScaledByDifficulty(0.3)——经典档 Sample(1)=1 → 0.3
    expect(e.kbResistOverride).toBeCloseTo(0.3, 5);
  });
});

// ===================== S2/S3：接触专盒驱动侧可达（NPC.cs:96161-96167） =====================

describe('S2 GetMeleeCollisionData 417 支：ai[3]∈(0,4) 专盒窗由 Enemy ai0/ai3 驱动', () => {
  const feed = (e: Enemy) => ({
    vanillaId: e.vanillaId!,
    ai0: e.ai0, ai1: e.ai1, ai2: e.ai2, ai3: e.ai3,
    x: e.x, y: e.y, w: e.w, h: e.h,
    direction: (e.facing === -1 ? -1 : 1) as -1 | 1,
    spriteDirection: (e.facing === -1 ? -1 : 1) as -1 | 1,
    frameY: e.vanillaGridFrameIdx,
  });

  it('滚动撞块窗（ai0=6,ai3=1）→ CenteredRectangle(Center,100²) ×1.35（盒外裸盒不含的点也命中）', () => {
    const w = npcWorld();
    const e = spawn417(w, 40, FLOOR - 4);
    e.ai0 = 6; e.ai3 = 1;
    // 受害盒置于裸盒（46×52）之外、100² 专盒之内——证明盒替换（非原盒乘区）
    const victim = { x: e.cx + 30, y: e.cy - 21, w: 20, h: 42 };
    const r = getMeleeCollisionData(victim, feed(e));
    expect(r.rect).not.toBeNull();
    expect(r.rect!.w).toBe(100);
    expect(r.rect!.h).toBe(100);
    expect(r.rect!.x).toBe(Math.trunc(e.cx - 50));
    expect(r.damageMultiplier).toBeCloseTo(1.35, 6);
  });

  it('窗外（ai3=0 / ai3=4 / ai0≠6）→ 回落裸盒 ×1.0（乘区不适用）', () => {
    const w = npcWorld();
    const e = spawn417(w, 40, FLOOR - 4);
    const victim = { x: e.x - 5, y: e.y - 5, w: 20, h: 42 };
    for (const [ai0, ai3] of [[6, 0], [6, 4], [0, 2], [5, 2]] as Array<[number, number]>) {
      e.ai0 = ai0; e.ai3 = ai3;
      const r = getMeleeCollisionData(victim, feed(e));
      expect(r.rect).not.toBeNull();
      expect(r.rect!.w).toBe(46);
      expect(r.rect!.h).toBe(52);
      expect(r.damageMultiplier).toBe(1);
    }
  });
});
