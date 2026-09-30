// ★BJ424 星云套装定谳刀（用户实报「套装效果没有生效」）——判别测试。
// 反编译真值（Terarria1457/Terraria）：
//   · 触发：Projectile.cs Damage_PVE_Inner :13712 flag10（num41>0 ∧ lifeMax>5 ∧
//     friendly ∧ !hostile ∧ aiStyle≠59）+ :13876 canGhostHeal|flag9 +
//     :13885 magic ∧ setNebula ∧ nebulaCD==0 ∧ Next(3)==0 → CD=30 + 生成
//     Item 3453/3454/3455 于 targetNPC.Center（:13887-89 速度公式）。
//   · 拾取：Player.cs PickupItem :35322-35332（音 7 + NebulaLevelup(buffType)）；
//     buffType = Item.cs:31008-31017（3453→179 伤/3454→173 命/3455→176 魔）。
//   · 叠档：NebulaLevelup :57703-57729（+1 钳 3、480t）。
//   · CD 递减：Benefits.Nebula（ArmorSetBonuses.cs:47-54）只在套装在身每拍递减。
//   · 拉取：GrabItems :35229-30 NebulaPickup 恒走 PullItem_Pickup(12,5)（:34527-41）。
// 本仓缺面定谳：旧态只有 Game.ts 四专支（711/261/魔飞弹/宝石珠）挂 nebulaCb 且
// booster 私有数组零渲染/重力错挂/拉距 52——通用魔法弹面（通用尾支等百余件）零触发。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ItemDrop } from '../src/entities/ItemDrop';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { nebulaBoosterOnHit, NEBULA_BOOSTER_VIDS, nebulaBoosterFamOf } from '../src/entities/NebulaBooster';
import type { GameHooks } from '../src/entities/types';

afterEach(() => vi.restoreAllMocks());

const iid = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;

function mkGame(armor = true): { game: GameHooks; spawned: Array<{ key: string; x: number; y: number; vx: number; vy: number; drop: ItemDrop | null }> } {
  const w = new World(80, 200, 7, 'bj424');
  const p = new Player(40 * 16, 27 * 16, new Inventory());
  if (armor) {
    p.inv.armor[0] = { id: iid(2760), stack: 1 };   // Nebula Helmet
    p.inv.armor[1] = { id: iid(2761), stack: 1 };   // Nebula Breastplate
    p.inv.armor[2] = { id: iid(2762), stack: 1 };   // Nebula Leggings
  }
  const spawned: Array<{ key: string; x: number; y: number; vx: number; vy: number; drop: ItemDrop | null }> = [];
  const game = {
    world: w,
    player: p,
    enemies: () => [], critters: () => [],
    spawnDrop: (x: number, y: number, key: string, count: number, vx?: number, vy?: number) => {
      const vid = Number(key.match(/^vi_(\d+)_/)?.[1] ?? -1);
      const drop = new ItemDrop(x - 6, y - 6, iid(vid), count, vx, vy);
      // 生产链同相：pickup 标签由 Game.spawnDrop vid 门注入（本仓无 Game 可实例化,
      // 桩按单源 NEBULA_BOOSTER_VIDS 复刻;真实注入面=实机探针验）
      if (NEBULA_BOOSTER_VIDS.has(vid)) drop.pickup = 'nebula';
      spawned.push({ key, x, y, vx: vx ?? 0, vy: vy ?? 0, drop });
      return drop;
    },
    spawnParticles: () => {}, spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
    playSfx: () => {}, playSfxFiles: () => {}, recLog: () => {},
    notifyInventoryChanged: () => {}, showPickupLabel: () => {},
    addDamageNumber: () => {}, cutTile: () => {}, damagePlayer: (): number => 0,
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
  return { game, spawned };
}

const victim = { x: 40 * 16 - 8, y: 30 * 16 - 8, w: 16, h: 16, vanillaId: 1, lifeMax: 100, dealt: 25 };

// ============================================================
// ① 触发链判别面（Projectile.Damage_PVE_Inner :13885-13891）
// ============================================================
describe('BJ424-① 星云 on-hit proc 门（magic/setNebula/CD/1-3 掷）', () => {
  it('魔法弹 + 套装在身 + CD=0 → 必中掷生成 booster；CD 置 30；出生点=目标中心', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);   // Next(3)==0 门通过
    const { game, spawned } = mkGame();
    nebulaBoosterOnHit(game, { projId: 27, projDirX: 3 }, victim);   // 27=水矢 magic
    expect(spawned.length).toBe(1);
    expect(spawned[0].x).toBe(victim.x + 8);          // targetNPC.Center
    expect(spawned[0].y).toBe(victim.y + 8);
    expect(game.player.nebulaCD).toBe(30);            // :13886
    expect(spawned[0].key).toMatch(/^vi_345[345]_/);  // SelectRandom(3453,3454,3455)
    expect(spawned[0].drop?.pickup).toBe('nebula');   // spawnDrop vid 注入 pickup 标签
  });

  it('概率掷 1/3：Math.random≥1/3 → 空掷;三键 vid 覆盖 3453-3455（fam 掷）', () => {
    const { game, spawned } = mkGame();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);   // ≥1/3 → 不 proc
    nebulaBoosterOnHit(game, { projId: 27, projDirX: 1 }, victim);
    expect(spawned.length).toBe(0);
    expect(game.player.nebulaCD).toBe(0);
    vi.mocked(Math.random).mockRestore();

    // fam 掷三档全覆盖（门掷 0.1 过、fam 掷 0.0/0.4/0.8 → 3453/3454/3455）
    for (const [roll, vid] of [[0.0, 3453], [0.4, 3454], [0.8, 3455]] as const) {
      const ctx = mkGame();
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.1)     // 1/3 门
        .mockReturnValueOnce(roll)    // fam 掷
        .mockReturnValue(0.99);       // 速度掷
      nebulaBoosterOnHit(ctx.game, { projId: 27, projDirX: 1 }, victim);
      expect(ctx.spawned.length).toBe(1);
      expect(ctx.spawned[0].key).toBe(VANILLA_ITEM_KEY_BY_ID[vid]);
    }
  });

  it('非 magic 弹不 proc（通用尾支面=本刀补齐的关键:任何弹型经数据门过滤）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const { game, spawned } = mkGame();
    nebulaBoosterOnHit(game, { projId: 1, projDirX: 3 }, victim);    // 木箭 ranged
    nebulaBoosterOnHit(game, { projId: 167, projDirX: 3 }, victim);  // 火枪弹 ranged
    expect(spawned.length).toBe(0);
  });

  it('数据面 hostile 弹 / aiStyle 59（356 浮魂自链排除）不 proc（:13712）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const { game, spawned } = mkGame();
    // 356 浮魂弹:数据面 magic（幽灵套 on-hit 载体）但 aiStyle=59 → 排除
    nebulaBoosterOnHit(game, { projId: 356, projDirX: 1 }, victim);
    expect(spawned.length).toBe(0);
  });

  it('CD>0 / 未穿套 → 不 proc（:13885 setNebula ∧ nebulaCD==0）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const { game, spawned } = mkGame();
    game.player.nebulaCD = 10;
    nebulaBoosterOnHit(game, { projId: 27, projDirX: 1 }, victim);
    expect(spawned.length).toBe(0);
    expect(game.player.nebulaCD).toBe(10);   // 未清 CD

    const bare = mkGame(false);   // 无套装
    bare.game.player.nebulaCD = 0;
    nebulaBoosterOnHit(bare.game, { projId: 27, projDirX: 1 }, victim);
    expect(bare.spawned.length).toBe(0);
  });

  it('实伤 dealt=0（拒收拍）/ lifeMax≤5（critter 族）→ 不 proc（:13712 flag10 段）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const { game, spawned } = mkGame();
    nebulaBoosterOnHit(game, { projId: 27, projDirX: 1 }, { ...victim, dealt: 0 });
    nebulaBoosterOnHit(game, { projId: 27, projDirX: 1 }, { ...victim, lifeMax: 5 });
    expect(spawned.length).toBe(0);
  });

  it('canGhostHeal=false 族（384 训练假人族）不 proc（:13876 门,SPECTRE_NO_GHOST_HEAL 同表）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const { game, spawned } = mkGame();
    nebulaBoosterOnHit(game, { projId: 27, projDirX: 1 }, { ...victim, vanillaId: 384 });
    expect(spawned.length).toBe(0);
  });

  it('速度公式（:13888-89）：X∈[2,6]×方向、Y∈[-4,0];方向随弹 velocity.X', () => {
    for (const dir of [1, -1]) {
      const ctx = mkGame();
      vi.spyOn(Math, 'random').mockReturnValue(0.0);   // 全掷 0 → vx=2×dir, vy=-4
      nebulaBoosterOnHit(ctx.game, { projId: 27, projDirX: dir * 3 }, victim);
      expect(ctx.spawned[0].vx).toBeCloseTo(2 * dir, 5);
      expect(ctx.spawned[0].vy).toBeCloseTo(-4, 5);
      vi.mocked(Math.random).mockRestore();
    }
  });
});

// ============================================================
// ② CD 递减门（Benefits.Nebula ArmorSetBonuses.cs:49-52——套装在身才递减）
// ============================================================
describe('BJ424-② nebulaCD 每拍递减位（套装在身递减/卸装冻结）', () => {
  const hooksOf = (p: Player): GameHooks => {
    const w = new World(80, 200, 7, 'bj424-cd');
    return {
      world: w, player: p, enemies: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      showPickupLabel: () => {}, recLog: () => {},
    } as unknown as GameHooks;
  };
  it('穿套 3 拍 → 30−3;卸装 3 拍 → 冻结（旧态无门恒递减=偏差）', () => {
    const p1 = new Player(40 * 16, 27 * 16, new Inventory());
    p1.inv.armor[0] = { id: iid(2760), stack: 1 };
    p1.inv.armor[1] = { id: iid(2761), stack: 1 };
    p1.inv.armor[2] = { id: iid(2762), stack: 1 };
    p1.nebulaCD = 30;
    const h1 = hooksOf(p1);
    for (let i = 0; i < 3; i++) p1.fixedUpdate(1 / 60, h1);
    expect(p1.nebulaCD).toBe(27);

    const p2 = new Player(40 * 16, 27 * 16, new Inventory());
    p2.nebulaCD = 30;
    const h2 = hooksOf(p2);
    for (let i = 0; i < 3; i++) p2.fixedUpdate(1 / 60, h2);
    expect(p2.nebulaCD).toBe(30);
  });
});

// ============================================================
// ③ 拾取 → NebulaLevelup（PickupItem :35322-32 + NebulaLevelup :57703-29）
// ============================================================
describe('BJ424-③ booster 拾取面（ItemDrop pickup=nebula → 三族独立叠档 cap3）', () => {
  function mkDropWorld(p: Player) {
    const w = new World(80, 200, 7, 'bj424-pick');
    return {
      world: w, player: p, enemies: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnParticles: vi.fn(),
      spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
      notifyInventoryChanged: () => {}, playSfx: vi.fn(), playSfxFiles: () => {},
      showPickupLabel: () => {}, recLog: vi.fn(),
      achievements: { notifyItemPickup: () => {} },
    } as unknown as GameHooks;
  }
  /** 拾取物：与玩家盒相交（玩家 40*16,27*16 盒 20×42 → 中心对齐） */
  const mkPickup = (game: GameHooks, vid: number): ItemDrop => {
    const d = new ItemDrop(game.player.x + game.player.w / 2 - 6, game.player.y + game.player.h / 2 - 6, iid(vid), 1, 0, 0);
    d.pickup = 'nebula';
    return d;
  };

  it('拾 3453（伤）×2 → nebula[0]=2、nebulaT=480 重挂;音 7;不进背包即消亡', () => {
    const p = new Player(40 * 16, 27 * 16, new Inventory());
    const game = mkDropWorld(p);
    const d1 = mkPickup(game, 3453);
    d1.fixedUpdate(1 / 60, game);
    expect(d1.dead).toBe(true);
    expect(p.nebula[0]).toBe(1);
    const d2 = mkPickup(game, 3453);
    d2.fixedUpdate(1 / 60, game);
    expect(p.nebula[0]).toBe(2);
    expect((p as unknown as { nebulaT: number[] }).nebulaT[0]).toBe(480);
    expect(game.playSfx).toHaveBeenCalledWith('pickup', 1);   // SoundID 7
    expect(game.recLog).toHaveBeenCalledWith('pickup', expect.objectContaining({ key: 'nebula' }));
  });

  it('三族独立 + cap 3（伤×3+第4发不越;命/魔族各 +1）', () => {
    const p = new Player(40 * 16, 27 * 16, new Inventory());
    const game = mkDropWorld(p);
    for (let i = 0; i < 4; i++) mkPickup(game, 3453).fixedUpdate(1 / 60, game);
    expect(p.nebula[0]).toBe(3);
    mkPickup(game, 3454).fixedUpdate(1 / 60, game);
    mkPickup(game, 3455).fixedUpdate(1 / 60, game);
    expect(p.nebula).toEqual([3, 1, 1]);
    // buff 栏视图：档位 buff id 179-181/173-175/176-178（UI 补 C 批面）
    const icons = p.nebulaBuffIcons();
    expect(icons).toContainEqual({ fam: 0, vanillaBuff: 181, secs: 8 });
    expect(icons).toContainEqual({ fam: 1, vanillaBuff: 173, secs: 8 });
    expect(icons).toContainEqual({ fam: 2, vanillaBuff: 176, secs: 8 });
  });
});

// ============================================================
// ④ 拉取档（GrabItems :35229-30 → PullItem_Pickup(12,5) :34527-41）
// ============================================================
describe('BJ424-④ NebulaPickup 拉取 = PullItem_Pickup(12,5) 档（非 Common）', () => {
  it('142px 拉距内 → 速度按 (v×4+dir×12)/5 混合;非 nebula 物保持 Common 档', () => {
    const p = new Player(40 * 16, 27 * 16, new Inventory());
    const w = new World(80, 200, 7, 'bj424-pull');
    const game = {
      world: w, player: p, enemies: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnParticles: vi.fn(),
      spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
      notifyInventoryChanged: () => {}, playSfx: vi.fn(), playSfxFiles: () => {},
      showPickupLabel: () => {}, recLog: vi.fn(),
      achievements: { notifyItemPickup: () => {} },
    } as unknown as GameHooks;
    // 拉距盒：玩家盒 ±(42+100)=±142;物放玩家右侧 100px、y=玩家盒心（纯水平拉向）
    const neb = new ItemDrop(p.x + p.w + 100, p.y + p.h / 2 - 6, iid(3453), 1, 0, 0);
    neb.pickup = 'nebula';
    neb.fixedUpdate(1 / 60, game);
    const exp = (0 * 4 + -1 * 12) / 5;   // dir = player−item 方向 = −1
    expect(neb.vx).toBeCloseTo(exp, 4);
    // 对照:普通物（无 noGravity/无加成）在基础 42px 拉距内走 Common 档
    // （0.45 步进,向玩家方向 −;100px 位对它不可达 = 拉距 +100 只属 nebula 族）
    const ord = new ItemDrop(p.x + p.w + 20, p.y + p.h / 2 - 6, iid(21), 1, 0, 0);
    ord.fixedUpdate(1 / 60, game);
    expect(ord.vx).toBeCloseTo(-0.45, 4);
  });
});

// ============================================================
// ⑤ 生成面基建对账（vid 键/fam 映射/拉距 +100/套装 vid 键在位性）
// ============================================================
describe('BJ424-⑤ booster 三键基建在位（vi_ def/单源 vid 表/拉距+100）', () => {
  it('3453/3454/3455 def 存在 + fam 映射（3454→1 命/3455→2 魔/它→0 伤）+ 拉距 +100', () => {
    for (const vid of [3453, 3454, 3455]) {
      const id = iid(vid);
      expect(id).toBeGreaterThan(0);
      expect(ITEM_DEFS[id]?.vid).toBe(vid);
      const p = new Player(0, 0, new Inventory());
      expect(p.getItemGrabRangeBonus(vid)).toBe(100);   // GetItemGrabRange :35446-48
    }
    expect(nebulaBoosterFamOf(3453)).toBe(0);
    expect(nebulaBoosterFamOf(3454)).toBe(1);
    expect(nebulaBoosterFamOf(3455)).toBe(2);
    expect(nebulaBoosterFamOf(58)).toBe(0);   // 白名单外 vid 缺省伤族（不可达防御面）
    expect(vanillaItemKey(2760)).toBeTruthy();   // 套 vid 键 lane（recon-armorset 闸门另有金标）
  });
});
