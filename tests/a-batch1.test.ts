// A 级近似清零·第一批回归（7 项 1:1 移植的数值断言）：
//   1 魔力回复整模型   Player.UpdateManaRegen :19214-19302（产额/蓄能/惩罚期/瓶中星）
//   2 冲刺             Player.DashMovement :20769-21265 + DoCommonDashHandle :21267-21323
//   3 沙丘行者靴       Player.cs:26225-26231（runningOnSand ×1.75 乘区）
//   4 友好轮削减       NPC.cs:724/:741/:757（地狱 ×0.5）/:782/:805/:830（地表 ×0.6）
//   5 旅行商人稀有度   Chest.SetupTravelShop_AdjustSlotRarities :919-947
//   6 植物/树苗采样    WorldGen.UpdateWorld :71549-71631（全图切片轮转，密度等价）
//   7 吸血/鬼疗治疗弹  Projectile ghostHeal/vampireHeal :11404-11448 + aiStyle 52 :27114-27165
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE_BY_KEY } from '../src/data/tiles';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { HealProj } from '../src/entities/HealProj';
import {
  travelAdjustSlotRarities, saplingScanPlan,
} from '../src/core/Game';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

const fakeHooks = (w: World, p?: Player) => ({
  world: w,
  player: p,
  enemies: () => [],
  critters: () => [],
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
});

/** 地板世界：y=30 一行实心地板（x∈[12,40]），玩家落在 (20,27) */
const mkWorld = (): World => {
  const w = new World(60, 60, 42, 'a-batch1');
  for (let x = 12; x <= 40; x++) w.store.setTileSilent(x, 30, 1 /* dirt */);
  return w;
};
const mkPlayer = (w: World): Player => new Player(20 * 16, 27 * 16, new Inventory());
/** 跑到落地稳定（vy==0、vx==0） */
const settle = (p: Player, w: World, ticks = 12): void => {
  for (let i = 0; i < ticks; i++) p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
};

// ============ 1 魔力回复整模型（:19214-19302） ============
describe('魔力回复（UpdateManaRegen :19214-19302）', () => {
  /** 落地稳定后重置魔力状态（settle 期间蓄能/回复会污染断言基线） */
  const reset = (p: Player, mana: number): void => {
    p.mana = mana;
    p.manaRegenCount = 0;
    p.manaRegenDelay = 0;
    p.manaAnimTicks = 0;
  };

  it('移动中基础产额：max100/mana50 → floor((33+1)×0.6×1.15)=23/tick', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.baseMaxMana = 100;
    settle(p, w);
    reset(p, 50);
    p.vx = 10;                       // 非静止（IsConsideredStandingStill :3175 |v|<0.05）
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.manaRegenCount).toBe(23);   // :19251-19268 产额公式
    expect(p.mana).toBe(50);             // 23 < 120 不结算（:19275）
  });

  it('静止加成：+max/3 → floor(67×0.6×1.15)=46/tick', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.baseMaxMana = 100;
    settle(p, w);
    reset(p, 50);
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);   // 落地静止 vx=vy=0
    expect(p.manaRegenCount).toBe(46);
  });

  it('蓄能结算：累积 ≥120 才 +1 魔并扣 120（6×23=138 → mana51/count18）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.baseMaxMana = 100;
    settle(p, w);
    reset(p, 50);
    for (let i = 0; i < 6; i++) {
      p.vx = 10;
      p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    }
    expect(p.mana).toBe(51);
    expect(p.manaRegenCount).toBe(18);  // 138-120
  });

  it('存量系数 num2：满魔 1.0 → 39/tick；空魔 0.2 → 7/tick（:19262-19268）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.baseMaxMana = 100;
    settle(p, w);
    reset(p, 100);
    p.vx = 10;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.manaRegenCount).toBe(39);  // floor(34×1.0×1.15)
    reset(p, 0);
    p.vx = 10;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.manaRegenCount).toBe(7);   // floor(34×0.2×1.15)
  });

  it('用魔惩罚期：onManaItemUsed 后 delay=(1−0.5)×240+45 再 ×0.7=115.5，产额 0', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.baseMaxMana = 100;
    settle(p, w);
    reset(p, 50);
    p.useTime = 10;
    p.onManaItemUsed();                // :42131-42137 动画窗内每帧重置
    p.vx = 10;                         // 移动 → 不吃静止额外衰减
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.manaRegenDelay).toBeCloseTo(115.5 - 1, 6);  // :24378-24379 公式后 −1 衰减
    expect(p.manaRegenCount).toBe(0);  // delay>0 → manaRegen=0（:19270-19271）
    expect(p.mana).toBe(50);
  });

  it('魔力再生 buff：惩罚期钳 20（:19247-19250）+ 静止加成常开 + num2 恒 1', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.baseMaxMana = 100;
    settle(p, w);
    reset(p, 50);
    p.buffs.apply(BuffType.ManaRegen, 480);
    p.useTime = 10;
    p.onManaItemUsed();
    p.vx = 10;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.manaRegenDelay).toBe(20); // 113.5 → 帽 20
    // 惩罚期过后（delay 清零）产额 = floor((34+33)×1.0×1.15)=77（num2 恒 1 :19265-19267）
    reset(p, 50);
    p.vx = 10;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.manaRegenCount).toBe(77);
  });

  it('瓶中星 158：manaRegenBonus+10 / delayBonus+0.5（:9629-9632）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.baseMaxMana = 100;
    settle(p, w);
    reset(p, 50);
    p.buffs.apply(BuffType.StarInBottle, 4800);
    p.vx = 10;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    // floor((34+10)×0.6×1.15)=floor(30.36)=30
    expect(p.manaRegenCount).toBe(30);
    // delayBonus 只作用于惩罚期衰减：用魔后每 tick 多退 0.5
    reset(p, 50);
    p.useTime = 10;
    p.onManaItemUsed();
    p.vx = 10;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.manaRegenDelay).toBeCloseTo(115.5 - 1 - 0.5, 6); // :19236-19237
  });
});

// ============ 2 冲刺（DashMovement :20769-21265） ============
describe('冲刺（DashMovement 1:1）', () => {
  /** 双击触发序列：按下→松开→再按下（DoCommonDashHandle :21296-21320） */
  const doubleTap = (p: Player, w: World): void => {
    p.inputX = 1;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    p.inputX = 0;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    p.inputX = 1;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
  };
  const mkNinja = (): { w: World; p: Player } => {
    const w = mkWorld();
    const p = mkPlayer(w);
    p.inv.armor[3] = { id: _iid(977), stack: 1 };  // 分趾靴 dashType=1
    settle(p, w);
    return { w, p };
  };

  it('触发帧单次置速 16.9 并进入滑行态（:21131/:21138）', () => {
    const { w, p } = mkNinja();
    doubleTap(p, w);
    expect(p.vx).toBeCloseTo(16.9, 6);
    expect(p.dashDelay).toBe(-1);
  });

  it('头部将撞墙减半（:21132-21137）：探测命中 → vx/2（整砖随即撞停，原版同）', () => {
    const w = mkWorld();
    const p = new Player(138, 27 * 16, new Inventory());  // x%16=10：探测格在身前
    p.inv.armor[3] = { id: _iid(977), stack: 1 };
    settle(p, w, 3);
    // 探测点 = cx+dir×(w/2)+2 → tile 10（身前 2px）；open 场地不命中
    expect(p.dashWallAhead(1)).toBe(false);
    w.store.setTileSilent(10, 27, 1);   // 头部行探测格实心
    expect(p.dashWallAhead(1)).toBe(true);
    expect(p.dashWallAhead(-1)).toBe(false);   // 方向性：身后墙不触发
    // 集成：触发帧 vx 先减半，再被碰撞钳到墙（探测点恒在身体行内 → 整砖必撞停）
    const wallX = 10 * 16;
    doubleTap(p, w);
    expect(p.dashDelay).toBe(-1);               // 冲刺确已触发
    expect(p.x + p.w).toBeLessThanOrEqual(wallX + 1e-6);  // 贴墙
    expect(p.vx).toBe(0);                        // 撞停（探测命中 → 减半后仍撞）
    // 对比：无墙时触发帧 vx 保留 16.9（见上例）——减半分支只对探测命中生效
  });

  it('滑行阻尼：|vx|>12 → ×0.985（:21100-21102）', () => {
    const { w, p } = mkNinja();
    doubleTap(p, w);
    p.inputX = 1;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.vx).toBeCloseTo(16.9 * 0.985, 6);
    expect(p.dashDelay).toBe(-1);   // 仍滑行
  });

  it('跌破 maxRunSpeed 档结束滑行：dashDelay=20、vx 钳回 ±num13（:21108-21113）', () => {
    const { w, p } = mkNinja();
    doubleTap(p, w);
    p.vx = 2;   // < num13=max(3, 3×1)=3
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
    expect(p.dashDelay).toBe(20);
    expect(p.vx).toBeCloseTo(3, 6);
  });

  it('冷却期不可再触发（dashDelay>0 门 :21128）', () => {
    const { w, p } = mkNinja();
    doubleTap(p, w);
    p.vx = 2;
    p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);   // 结束滑行 → dashDelay=20
    const before = p.dashDelay;
    doubleTap(p, w);                                   // 冷却中双击
    expect(p.dashDelay).toBe(before - 3);              // 只倒数，未触发
    expect(p.vx).toBeLessThan(16.9);
    expect(p.dashDelay).toBeGreaterThan(0);
  });
});

// ============ 3 沙丘行者靴（Player.cs:26225-26231） ============
describe('沙丘行者靴（runningOnSand ×1.75）', () => {
  it('沙族地格检测 + 全参数 ×1.75（慢爬坡上限:沙 5.25/泥 3.0;原版乘区非 +0.25 定值）', () => {
    const sand = TILE_BY_KEY['sand']!;
    const run = (floorTile: number): { p: Player; vx: number; onSand: boolean } => {
      const w = new World(60, 60, 42, 'dune');
      for (let x = 2; x <= 57; x++) w.store.setTileSilent(x, 30, floorTile);
      const p = new Player(20 * 16, 27 * 16, new Inventory());
      p.inv.armor[3] = { id: _iid(4055), stack: 1 };   // 沙丘行者靴 runSpeed 6 + desertBoots
      p.inputX = 1;
      for (let i = 0; i < 37; i++) p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);  // 60t:全速段内(未撞墙)
      return { p, vx: p.vx, onSand: p.runningOnSand };
    };
    const onSand = run(sand);
    const onDirt = run(1 /* dirt */);
    expect(onSand.onSand).toBe(true);     // FloorVisuals :23457 沙族集合命中
    expect(onDirt.onSand).toBe(false);
    // runSpeed/3-1 折算已拆(2026-08-13,原版 accRunSpeed 不随 moveSpeed 缩放):
    // maxRun = 3 × moveMult(=1) ×(沙上 1.75) = 5.25 / 泥土 3.0;靴族走【慢爬坡】到 6×1.75
    expect(onSand.vx).toBeCloseTo(3 * 1.75, 0);   // 沙上 maxRun = 3×1.75 = 5.25
    expect(onDirt.vx).toBeCloseTo(3, 0);                    // 泥土 maxRun = 3×1.0
  });
});

// ============ 4 友好轮 maxSpawns 削减（NPC.cs:711-832） ============
describe('友好轮削减（地狱 ×0.5 / 地表 ×0.6）', () => {
  it('地表 town≥3：maxSpawns 无条件 ×0.6（:824-830）', () => {
    const w = new World(400, 600, 42, 'rate');
    const sp = new VanillaSpawner(w);
    const base = sp.getSpawnRate(100 * 16, 800, false, 800, 100 * 16, false, false, false,
      false, 0, true, false, false).maxSpawns;          // town 0：不走友好支
    const t3 = sp.getSpawnRate(100 * 16, 800, false, 800, 100 * 16, false, false, false,
      false, 3, true, false, false).maxSpawns;
    expect(t3).toBe(Math.floor(base * 0.6));            // :830
  });

  it('地狱侧：friendly 命中轮 ×0.5，未命中轮不削（:722-727）', () => {
    const w = new World(400, 600, 42, 'rate');
    const sp = new VanillaSpawner(w);
    const hellY = (w.store.h - 199) * 16;              // UnderworldLayer 之下
    const base = sp.getSpawnRate(hellY, 800, false, 800, 100 * 16, false, false, false,
      false, 0, true, false, false).maxSpawns;
    let hit = 0, miss = 0;
    for (let k = 0; k < 400 && (hit === 0 || miss === 0); k++) {
      const r = sp.getSpawnRate(hellY, 800, false, 800, 100 * 16, false, false, false,
        false, 1, true, false, false);
      const friendly = (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle;
      if (friendly) { expect(r.maxSpawns).toBe(Math.floor(base * 0.5)); hit++; }  // :724
      else { expect(r.maxSpawns).toBe(base); miss++; }                            // 未命中只动 rate
    }
    expect(hit).toBeGreaterThan(0);
    expect(miss).toBeGreaterThan(0);
  });
});

// ============ 5 旅行商人稀有度（Chest.cs:919-947） ============
describe('旅行商人稀有度降档（AdjustSlotRarities :919-947）', () => {
  it('逐槽阈值矩阵：4201 降 slot0 … 4701 降 slot5，阈值本身不降', () => {
    const r0 = [100, 200, 300, 400, 500, 600];
    travelAdjustSlotRarities(r0, 4200);
    expect(r0).toEqual([100, 200, 300, 400, 500, 600]);   // 4200 不降
    travelAdjustSlotRarities(r0, 4201);
    expect(r0[0]).toBe(1);                                 // :944-947
    expect(r0.slice(1)).toEqual([200, 300, 400, 500, 600]);
    const r5 = [100, 200, 300, 400, 500, 600];
    travelAdjustSlotRarities(r5, 4700);
    expect(r5[5]).toBe(600);                               // 4700 不降
    travelAdjustSlotRarities(r5, 4701);
    expect(r5[5]).toBe(1);                                 // :921-924
  });

  it('>1 守卫：已降档不再触发；5000 次全槽归 1（首件环跑满等价）', () => {
    const r = [100, 200, 300, 400, 500, 600];
    for (let n = 1; n <= 5000; n++) travelAdjustSlotRarities(r, n);   // :1278-1299 环
    expect(r).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

// ============ 6 植物/树苗采样（WorldGen.cs:71549-71631 数值等价） ============
describe('树苗全图切片采样（密度等价）', () => {
  it('单 tick 成长概率与原版逐点相等：gemP/(K×300) == 1.5e-05×(w×h)/区格数×1/5', () => {
    for (const [w, h, gl] of [[4200, 1200, 350], [8400, 2400, 500], [400, 600, 180]] as const) {
      const plan = saplingScanPlan(w, h, gl, 0);
      const underTiles = (h - Math.floor(gl) - 19) * w;      // :71627-71629 区格数
      expect(plan.gemP / (plan.K * 300)).toBeCloseTo(1.5e-05 * (w * h) / underTiles * 0.2, 9);
      const overTiles = (Math.floor(gl) - 11) * w;           // :71553-71555
      expect(plan.sapP / (plan.K * 300)).toBeCloseTo(3e-05 * (w * h) / overTiles / 20, 9);
    }
  });

  it('K 轮列切片连续无重叠覆盖全图（全图采样、不限域玩家附近）', () => {
    const w = 4200, h = 1200, gl = 350;
    const first = saplingScanPlan(w, h, gl, 0);
    let covered = 0;
    for (let r = 0; r < first.K; r++) {
      const plan = saplingScanPlan(w, h, gl, r);
      expect(plan.x0).toBe(Math.min(w, r * first.sliceW));   // 连续切片
      expect(plan.x1).toBe(Math.min(w, plan.x0 + first.sliceW));
      covered += plan.x1 - plan.x0;
    }
    expect(covered).toBe(w);
    // 周期性：K 轮后回到首切片
    expect(saplingScanPlan(w, h, gl, first.K).x0).toBe(first.x0);
    expect(saplingScanPlan(w, h, gl, first.K).x1).toBe(first.x1);
  });

  it('雨天 ×1.5（:71557-71559）', () => {
    const dry = saplingScanPlan(4200, 1200, 350, 0, 120000, false);
    const rain = saplingScanPlan(4200, 1200, 350, 0, 120000, true);
    expect(rain.sapP).toBeCloseTo(dry.sapP * 1.5, 9);
    expect(rain.gemP).toBeCloseTo(dry.gemP, 9);   // 地下不受雨影响
  });
});

// ============ 7 吸血/鬼疗治疗弹（Projectile.cs:11404-11448 + aiStyle 52） ============
describe('治疗弹飞行结算（aiStyle 52 :27114-27165）', () => {
  const hooks = { addDamageNumber: () => {} } as never;

  it('305 吸血弹：自命中点追踪飞达，回复 floor(ai[1]) 后消亡', () => {
    const target = { x: 0, y: 0, w: 20, h: 42, hp: 50, maxHp: 100 };
    const proj = new HealProj(305, 200, 0, 7.7, target);
    let ticks = 0;
    while (!proj.dead && ticks++ < 200) proj.fixedUpdate(1 / 60, hooks);
    expect(proj.dead).toBe(true);
    expect(target.hp).toBe(57);            // floor(7.7)=7（:27130 (int)ai[1]）
  });

  it('298 鬼疗弹档更慢（extraUpdates 3 vs 10，:3614/:3696）且同样结算', () => {
    const mk = (type: 298 | 305) => {
      const target = { x: 0, y: 0, w: 20, h: 42, hp: 50, maxHp: 100 };
      const proj = new HealProj(type, 240, 0, 3.7, target);
      let ticks = 0;
      while (!proj.dead && ticks++ < 400) proj.fixedUpdate(1 / 60, hooks);
      return { ticks, hp: target.hp };
    };
    const fast = mk(305);
    const slow = mk(298);
    expect(fast.hp).toBe(53);              // floor(3.7)=3
    expect(slow.hp).toBe(53);
    expect(slow.ticks).toBeGreaterThan(fast.ticks);
  });

  it('回复上限钳制（:27133-27136）', () => {
    const target = { x: 0, y: 0, w: 20, h: 42, hp: 98, maxHp: 100 };
    const proj = new HealProj(305, 150, 0, 7.7, target);
    let ticks = 0;
    while (!proj.dead && ticks++ < 200) proj.fixedUpdate(1 / 60, hooks);
    expect(target.hp).toBe(100);
  });

  it('追踪方向正确：从目标右侧起飞必向左接近（速度插值 :27142-27145）', () => {
    const target = { x: 0, y: 0, w: 20, h: 42, hp: 50, maxHp: 100 };
    const proj = new HealProj(305, 200, 0, 5, target);
    proj.fixedUpdate(1 / 60, hooks);
    expect(proj.x).toBeLessThan(200);
    expect(proj.vx).toBeLessThan(0);
  });
});
