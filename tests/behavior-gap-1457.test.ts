// 1457 基准对齐调查（行为面）三缺口回归：
//   ① slowMagicUse 2.5× 蓝空过载施法减速——1457 Projectile.cs 六消费点逐一落位：
//       :14058   632 LastPrismLaser 同敌免疫 = GetSlowMagicUseTime(5)   → PrismProj.ts PrismProng
//       :37585/37621/37623  GlacierFang 蓄力（本仓已接,proj1457.ts——此处不重复）
//       :45301   535 MedusaHead 石化阈值 ×GetSlowMagicScalar            → 本仓无 535 弹 AI（登记债）
//       :67202-67228 439 LaserMachinegun ai[1] 速率/帧拍/音隔          → 本仓无 2795 激光机枪（登记债）
//       ★调查原文"Last Prism 帧拍"系误标：67202-67228 在 `type==439`（激光机枪）块内,
//         Last Prism 633 本体块 :67585-67683 零 GetSlowMagic 消费（帧拍不减速,原版如此）
//       :67404   460 ChargedBlasterCannon ai[0] += GetSlowMagicUseRate() → PrismProj.ts ChargedBlaster
//       :71908   1122 ArcSurge MovementVector=(ai2,slowMagicUse)        → 纯粒子视觉参,
//                   本仓 StormLightning 无 ParticleOrchestrator,无行为落位（登记债）
//   ② 1133 SnakeBandStarCloakTinkerStar——starCloakStarInfo override 链补最高档
//       （Player.cs:38738-38753 顺序赋值后者覆盖：725→724→723→1133）
//   ③ SnapStrike kind0 远程挂点（:13443-13446）——Arrow.ts 通用命中环消费端
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Arrow } from '../src/entities/Arrow';
import { PrismProj, PrismProng, ChargedBlaster, BlasterBeam } from '../src/entities/PrismProj';
import { starCloakStarInfo } from '../src/core/Game';
import { projectileData } from '../src/data/vanillaProjectiles';
import type { GameHooks } from '../src/entities/types';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; cx: number; cy: number;
  dead: boolean; maxHp: number; hits: number[];
  hurt: (d: number, kx?: number, ky?: number, g?: GameHooks, pen?: number, crit?: boolean) => boolean;
}
const mkEnemy = (id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, dead: false, maxHp: 100000, hits: [],
    hurt: (d: number) => { e.hits.push(d); return true; },
  };
  return e;
};

/** 通用 GameHooks 桩（World 真实例——弹幕 LaserScan/tile 门要查方块） */
function makeHooks(enemies: MockEnemy[] = [], player?: Player) {
  const world = new World(80, 40, 42, '测试');
  const pl = player ?? new Player(40 * 16, 20 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks = {
    world,
    player: pl,
    enemies: () => enemies,
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
  } as unknown as GameHooks;
  (hooks as unknown as { entities: { add: (e: unknown, b?: string) => void } }).entities = {
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, world, player: pl, added };
}

// ==================== ① slowMagic 2.5×（Player.cs:47425-47456 + Projectile 六消费点） ====================
describe('slowMagic 原语（GetSlowMagicUseTime/Rate/Scalar :47425-47456）', () => {
  it('常态透传 / 过载 ×2.5 截断、速率 0.4、标量 2.5', () => {
    const { player } = makeHooks();
    expect(player.getSlowMagicUseTime(5)).toBe(5);       // !slowMagicUse → 原值（:47427-47429）
    expect(player.getSlowMagicUseRate()).toBe(1);
    expect(player.getSlowMagicScalar()).toBe(1);
    player.slowMagicUse = true;
    expect(player.getSlowMagicUseTime(5)).toBe(12);      // (int)(2.5f×5) 截断（:47431）——632 免疫窗
    expect(player.getSlowMagicUseTime(10)).toBe(25);
    expect(player.getSlowMagicUseRate()).toBeCloseTo(0.4); // 1f/2.5f（:47440-47441）——460/6153 蓄压步进
    expect(player.getSlowMagicScalar()).toBe(2.5);
  });
});

describe('460 充能爆破炮 ai[0] += GetSlowMagicUseRate()（Projectile.cs:67404）', () => {
  const mkBlaster = (payLog: number[]) =>
    new ChargedBlaster(1, 0, 100, 2,
      () => true,
      () => ({ x: 41 * 16, y: 20 * 16 }),
      () => { payLog.push(1); return true; });

  it('常态 1/t：459 小弹 9 发（1,10,20,30,40,50,90,120,150 拍）、461 光束 @180、魔耗 @{80,180,200}', () => {
    const { hooks, added } = makeHooks();
    const payLog: number[] = [];
    const bl = mkBlaster(payLog);
    for (let i = 0; i < 200; i++) bl.fixedUpdate(1 / 60, hooks);
    const bolts = added.filter((a) => (a as { projId?: number }).projId === 459);
    const beams = added.filter((a) => a instanceof BlasterBeam);
    expect(bolts.length).toBe(9);
    expect(beams.length).toBe(1);
    expect(payLog.length).toBe(3);                       // flag3：80/180/200（:63454-63459 [1456] / :67414-67424 [1457]）
  });

  it('过载 0.4/t：满蓄 180→451 拍（2.5×）、459 只在瞄准拍 ∩ (int)ai0%10/%30 出（fround 实测 4 发）、461 双发（451/452,原版 (int)ai0==180 停 2 瞄准拍,无已发守卫）', () => {
    const { hooks, added } = makeHooks();
    hooks.player.slowMagicUse = true;                    // DoRunOutOfManaEffect :53258-53261
    const payLog: number[] = [];
    const bl = mkBlaster(payLog);
    let firstBeam = -1;
    let firstBolt = -1;
    let boltsAt450 = 0;
    for (let i = 1; i <= 460; i++) {
      bl.fixedUpdate(1 / 60, hooks);
      if (i === 450) boltsAt450 = added.filter((a) => (a as { projId?: number }).projId === 459).length;
      if (firstBeam < 0 && added.some((a) => a instanceof BlasterBeam)) firstBeam = i;
      if (firstBolt < 0 && added.some((a) => (a as { projId?: number }).projId === 459)) firstBolt = i;
    }
    const bolts = added.filter((a) => (a as { projId?: number }).projId === 459);
    const beams = added.filter((a) => a instanceof BlasterBeam);
    expect(firstBeam).toBe(451);                         // (int)ai0==180 首个瞄准拍（fround 实证 451）
    expect(beams.length).toBe(2);                        // 451/452 连发两根（ai[1] 被后根覆写）
    expect(firstBolt).toBe(100);                         // 首发在 ai0=40（fround 实证）
    // ★0.4f 累积的浮点漂移使 (int)ai[0] 在瞄准拍常偏一档、50 档被 charge<=50 门吃掉
    // （c₁₂₅≈50.0000007>50）——fround 实测满蓄前仅 4 发 @ {100,225,300,375} 拍
    // （ai0=40/90/120/150）。原版 C# float 同式同累积同漂移,非本仓偏差
    expect(boltsAt450).toBe(4);
    expect(bolts.length).toBe(4);                        // 满蓄后不再出 459（flag7 只在 !flag4 段）
    expect(payLog.length).toBe(3);                       // flag3：ai0==80@200、==180@451/452
  });

  it('过载蓄压档拉长 2.5×：ai0==80 魔耗节点 @200（常态 @80）', () => {
    const { hooks } = makeHooks();
    hooks.player.slowMagicUse = true;
    const payLog: number[] = [];
    const bl = mkBlaster(payLog);
    for (let i = 1; i < 200; i++) bl.fixedUpdate(1 / 60, hooks);
    expect(payLog.length).toBe(0);                       // 199 拍未到 80 档（80/0.4=200）
    bl.fixedUpdate(1 / 60, hooks);
    expect(payLog.length).toBe(1);                       // 第 200 拍 (int)ai0==80
  });
});

describe('632 LastPrismLaser 同敌免疫 = GetSlowMagicUseTime(5)（Projectile.cs:14058）', () => {
  /** 光棱命中桩：parent.charge=60（friendly 门 charge>30 :30326 + prongScale>0） */
  const mkProng = (hooks: GameHooks) => {
    const parent = new PrismProj(1, 0, 50, 2, () => true, () => ({ x: 0, y: 0 }), () => true);
    parent.x = 30 * 16; parent.y = 20 * 16;
    parent.charge = 60;
    const prong = new PrismProng(0, 50, 2);
    prong.parent = parent;
    prong.fixedUpdate(1 / 60, hooks);                    // 首拍定位 + beamLen 预热
    return { parent, prong };
  };

  it('常态免疫窗 5t：12 拍内命中 3 次（t2/t7/t12）；过载 12t：仅 1 次', () => {
    const run = (overload: boolean): number => {
      const { hooks } = makeHooks();
      if (overload) hooks.player.slowMagicUse = true;
      const { prong } = mkProng(hooks);
      const e = mkEnemy(1, prong.cx + prong.vx * 100, prong.cy + prong.vy * 100);
      (hooks as unknown as { enemies: () => MockEnemy[] }).enemies = () => [e];
      let hits = 0;
      for (let i = 0; i < 12; i++) {
        const before = e.hits.length;
        prong.fixedUpdate(1 / 60, hooks);
        hits += e.hits.length - before;
      }
      return hits;
    };
    expect(run(false)).toBe(3);                          // cd=5：t2 命中→t7→t12
    expect(run(true)).toBe(1);                           // cd=GetSlowMagicUseTime(5)=12：仅 t2
  });
});

describe('633 最后棱镜帧拍无 slowMagic（调查误标纠正：67202-67228 实为 439 激光机枪块）', () => {
  it('slowMagicUse=true 下 633 charge 仍 1/t（:67585-67683 零 GetSlowMagic 消费,帧拍不减速）', () => {
    const { hooks, added } = makeHooks();
    hooks.player.slowMagicUse = true;
    const prism = new PrismProj(1, 0, 50, 2, () => true, () => ({ x: 0, y: 0 }), () => true);
    for (let i = 0; i < 10; i++) prism.fixedUpdate(1 / 60, hooks);
    expect(prism.charge).toBe(10);                       // 若 1457 有消费应 = 4（×0.4）
    expect(added.filter((a) => a instanceof PrismProng).length).toBe(6);   // 6×632（:63702-63710 [1456] / :67662-67673 [1457]）
  });
});

describe('getSlowMagicScalar 登记债（1457 三消费全在本仓未实装弹）', () => {
  it('本仓零消费（仅定义 1 处）——439 激光机枪 :67211/:67222 与 535 美杜莎之首 :45301 均未实装,武器落地时须接', () => {
    const src = readFileSync(new URL('../src/entities/Player.ts', import.meta.url), 'utf8');
    const def = src.match(/getSlowMagicScalar\(\): number \{/);
    expect(def).not.toBeNull();
    const uses = readFileSync(new URL('../src/entities/PrismProj.ts', import.meta.url), 'utf8')
      + readFileSync(new URL('../src/entities/Arrow.ts', import.meta.url), 'utf8')
      + readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    expect(uses.includes('getSlowMagicScalar(')).toBe(false);
  });
});

// ==================== ② 1133 SnakeBandStarCloakTinkerStar（Player.cs:38738-38753） ====================
describe('1133 星斗篷 override 链（:38738-38753 顺序赋值后者覆盖）', () => {
  it('优先序矩阵：snakeCloak 6186→1133 最高档 > manaCloak 723 > beeCloak 724 > starVeil 725 > starCloak 726', () => {
    // ★V6 复核勘误：触发 vid 曾错位（929=炮弹/982=魔力再生带）——真身 StarVeil=862
    // （ItemID.cs:3270）/ManaCloak=4001（:9548）/StarCloak=532（:2610）
    expect(starCloakStarInfo([], false)).toEqual({ active: false, projType: 726 });
    expect(starCloakStarInfo([532], true).projType).toBe(726);
    expect(starCloakStarInfo([862], false).projType).toBe(725);
    expect(starCloakStarInfo([1247], false).projType).toBe(724);
    expect(starCloakStarInfo([4001], false).projType).toBe(723);
    expect(starCloakStarInfo([6186], false).projType).toBe(1133);
    expect(starCloakStarInfo([6186], false).active).toBe(true);
    // ★反向断言（防回归）：魔力再生带 982/炮弹 929 均不得触发斗篷
    expect(starCloakStarInfo([982], false).active).toBe(false);
    expect(starCloakStarInfo([929], false).active).toBe(false);
    // 蛇斗篷压过全部旧 override 件（:38747-38751 最后赋值）
    expect(starCloakStarInfo([4001, 6186], false).projType).toBe(1133);
    expect(starCloakStarInfo([1247, 4001, 862, 6186], false).projType).toBe(1133);
    // 无 6186 时维持旧序：mana > bee > veil（:38738-38746）
    expect(starCloakStarInfo([862, 1247], false).projType).toBe(724);
    expect(starCloakStarInfo([4001, 1247], false).projType).toBe(723);
  });

  it('6186 在身即 active（case 6186 同时置 starCloakItem :14726-14729）', () => {
    expect(starCloakStarInfo([6186], false).active).toBe(true);
    expect(starCloakStarInfo([6186], true).active).toBe(true);
  });

  it('1133 星参数与 726 族同块（SetDefaults :7648-7659 同分支：24×24/penetrate2/arpen25/局部免疫）——行为面无分叉', () => {
    const d1133 = projectileData(1133);
    const d726 = projectileData(726);
    expect(d1133).not.toBeNull();
    for (const k of ['aiStyle', 'width', 'height', 'penetrate', 'armorPenetration', 'friendly', 'tileCollide'] as const) {
      expect(d1133![k]).toBe(d726![k]);
    }
  });

  it('反击星参数全族共享一段代码（:38756-38781）：3 颗/基伤 75/大师×3 专家×2/kb5/projType 透传（源级锚）', () => {
    const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    const seg = src.slice(src.indexOf('星星斗篷族受击反击'), src.indexOf('蜂蜜斗篷/蜂巢族受击反击'));
    expect(seg).toContain('starDmg = 75');
    expect(seg).toContain('starDmg *= 3');
    expect(seg).toContain('starDmg *= 2');
    expect(seg).toContain('k < 3');
    expect(seg).toContain('star.projType');              // 1133 经同一出口下发
    expect(seg).toContain('starCloakStarInfo(accVids');
  });
});

// ==================== ③ SnapStrike kind0 远程挂点（Projectile.cs:13443-13446） ====================
describe('拍击石 6167 kind0 远程脉冲（Arrow.ts 通用命中环消费端）', () => {
  /** ranged 弹（projId 1 木箭,ranged 位真）从左射向敌 0 */
  const shoot = (hooks: GameHooks, enemies: MockEnemy[], x = 20 * 16 - 14) => {
    const arrow = new Arrow(x, 10 * 16, 8, 0, 40, 0, 1, null, { grav: 0 });
    for (let i = 0; i < 6 && !arrow.dead; i++) arrow.fixedUpdate(1 / 60, hooks);
    return arrow;
  };

  it('ranged 弹命中 + 6167 在身 → 弹 1121 打 120px 内其它敌 + 共用冷却 360t + 受击者排除', () => {
    const victims = [mkEnemy(1, 20 * 16, 10 * 16), mkEnemy(2, 20 * 16 + 100, 10 * 16), mkEnemy(3, 20 * 16 + 300, 10 * 16)];
    const { hooks, player, added } = makeHooks(victims);
    player.inv.armor[3] = { id: iid(6167), stack: 1 };
    shoot(hooks, victims);
    const pulses = added.filter((a) => (a as { projId?: number }).projId === 1121);
    expect(pulses.length).toBe(1);                       // num2=2 上限,但 300px 外的 3 号超 120px
    expect(player.accSnappingStoneCooldown).toBe(360);   // :14382-14383
    expect(victims[0].hits.length).toBeGreaterThan(0);   // 本体命中照常
  });

  it('无 6167 → 不触发不置冷却', () => {
    const victims = [mkEnemy(1, 20 * 16, 10 * 16), mkEnemy(2, 20 * 16 + 100, 10 * 16)];
    const { hooks, player, added } = makeHooks(victims);
    shoot(hooks, victims);
    expect(added.some((a) => (a as { projId?: number }).projId === 1121)).toBe(false);
    expect(player.accSnappingStoneCooldown).toBe(0);
  });

  it('非 ranged 弹（15 魔法位）与 hostile 弹（ownedBySomeone 假）均不触发', () => {
    const victims = [mkEnemy(1, 20 * 16, 10 * 16), mkEnemy(2, 20 * 16 + 100, 10 * 16)];
    const { hooks, player, added } = makeHooks(victims);
    player.inv.armor[3] = { id: iid(6167), stack: 1 };
    const magic = new Arrow(20 * 16 - 14, 10 * 16, 8, 0, 40, 0, 15, null, { grav: 0 });
    for (let i = 0; i < 6 && !magic.dead; i++) magic.fixedUpdate(1 / 60, hooks);
    expect(victims[0].hits.length).toBeGreaterThan(0);   // 命中了
    expect(added.some((a) => (a as { projId?: number }).projId === 1121)).toBe(false);
    const hostile = new Arrow(20 * 16 - 14, 12 * 16, 8, 0, 40, 0, 1, null, { grav: 0, hostile: true });
    for (let i = 0; i < 6 && !hostile.dead; i++) hostile.fixedUpdate(1 / 60, hooks);
    expect(added.some((a) => (a as { projId?: number }).projId === 1121)).toBe(false);
    expect(player.accSnappingStoneCooldown).toBe(0);
  });

  it('冷却内第二命中不再触发（360t 共用冷却,:14352-14354）', () => {
    const victims = [mkEnemy(1, 20 * 16, 10 * 16), mkEnemy(2, 20 * 16 + 100, 10 * 16), mkEnemy(3, 20 * 16 + 200, 10 * 16)];
    const { hooks, player, added } = makeHooks(victims);
    player.inv.armor[3] = { id: iid(6167), stack: 1 };
    shoot(hooks, victims);                               // 第一击：1 号受击 → 2 号吃脉冲
    expect(added.filter((a) => (a as { projId?: number }).projId === 1121).length).toBe(1);
    const after = added.filter((a) => (a as { projId?: number }).projId === 1121).length;
    shoot(hooks, victims, 22 * 16 - 14);                 // 第二击（冷却中）
    expect(added.filter((a) => (a as { projId?: number }).projId === 1121).length).toBe(after);
    expect(player.accSnappingStoneCooldown).toBe(360);
  });
});
