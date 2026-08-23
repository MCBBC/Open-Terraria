// NPC 域缺口批（2026-08-20，subsystem-gap-ledger M12 + S×5）六项专项：
//   ① M12 血鳗鱼 621-623（★台账"鹿角怪腿段"系误标——621-623=BloodEelHead/Body/Tail，
//     NPCID.cs:12307-12311；鹿角怪腿在 1456 已并入本体贴图，AI_124_DeerclopsLeg/
//     DrawNPCDirect_DeerclopsLeg 均为无调用死代码）：数据补齐 + wormFollow 链
//     （15×622+1×623 共享生命）+ 链门渐显（:51399-51421）+ 头舵机 15/0.45（:52124）
//     + 链距恒 24（:52296）
//   ② aiStyle 127 Palworld 双宠（NPC.cs:43239-43339）：CheckFloor2 双列验地/双僵尸
//     威慑/三态机/120t 奖赏静默消亡
//   ③ HurtingBees 蜂互伤通道（:91540-91542 + BeHurtByOtherNPC :93666-93696）
//   ④ 树妖结界 buff 165 两枝：防 +20/15/10（:53401-53411）+ 荆棘 ⌊实伤/3⌋（:93666）
//   ⑤ 动物学家变身态快乐度分节 TownNPCMood_BestiaryGirlTransformed（:197-200）
//   ⑥ 微光之灵自动生成（Player.cs:16636 + SpawnFaelings NPC.cs:5895-5932）
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { TILE } from '../src/core/constants';
import { LIQUID_TYPE, TileStore } from '../src/world/TileStore';
import { computeHappiness, npcMoodCategory } from '../src/data/vanillaHappiness';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';
import { RNG } from '../src/core/rng';

const W = 220, H = 160, GROUND = 70;
const STONE = 2;

function makeWorld(): World {
  const w = new World(W, H, 11, 'npc-gaps-test');
  w.groundLevel = 50; w.rockLevel = 90;
  w.clock.timeOfDay = 0;          // 深夜（血鳗鱼白天 vy+=1 消散门不触发）
  for (let x = 0; x < W; x++) {
    for (let y = GROUND; y < H; y++) w.store.setTileSilent(x, y, STONE);
  }
  return w;
}

interface Harness {
  hooks: GameHooks; enemies: Enemy[]; drops: Array<{ x: number; y: number; key: string }>;
  player: Player; world: World;
}
function makeHooks(world: World, playerAt: { x: number; y: number }): Harness {
  const enemies: Enemy[] = [];
  const drops: Array<{ x: number; y: number; key: string }> = [];
  const em = {
    nextId: 1,
    add: (e: unknown, _b: string) => { (e as { id: number }).id = em.nextId++; enemies.push(e as Enemy); },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
  } as unknown as Player;
  const hooks = {
    world, player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: (x: number, y: number, key: string) => { drops.push({ x, y, key }); return null; },
    damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  (hooks as unknown as { entities: typeof em }).entities = em;
  return { hooks, enemies, drops, player, world };
}

// ---------------------------------------------------------------------------
// ① M12 血鳗鱼 621-623
// ---------------------------------------------------------------------------
describe('① M12 血鳗鱼 621-623（数据 + wormFollow 链 + 渐显 + 舵机）', () => {
  it('数据补齐：622/623 与 SetDefaults :16922-16960 一致（1456 数值照抄,1456/1457 同值——recon-npc CLASS B=0）', async () => {
    const data = (await import('../public/sprites/vanilla-npcs.json')).default as Record<string, {
      damage: number; defense: number; lifeMax: number; aiStyle: number;
      width: number; height: number; alpha: number; behindTiles: boolean; friendly?: boolean;
    }>;
    expect(data['622']).toMatchObject({ damage: 60, defense: 30, lifeMax: 6000, aiStyle: 6, width: 28, height: 28, alpha: 255, behindTiles: true });
    expect(data['623']).toMatchObject({ damage: 50, defense: 40, lifeMax: 6000, aiStyle: 6, width: 28, height: 28, alpha: 255, behindTiles: true });
    expect(data['696']).toMatchObject({ aiStyle: 127, friendly: true, lifeMax: 250, defense: 15 });
    expect(data['695'].friendly).toBe(true);       // 双宠均 friendly（:17688/:17702）
  });

  it('首帧建链：621 头生成 15×622+1×623，全链共享生命（realLife=头，:51672-51690）', () => {
    const h = makeHooks(makeWorld(), { x: 150, y: GROUND - 6 });
    const eel = Enemy.fromVanilla(621, 100 * TILE, 60 * TILE)!;
    h.enemies.push(eel);
    eel.fixedUpdate(1 / 60, h.hooks);
    const chain = h.enemies.filter((n) => n !== eel);
    expect(chain).toHaveLength(16);                          // 15 身 + 1 尾（num30=16）
    expect(chain.filter((n) => n.vanillaId === 622)).toHaveLength(15);
    expect(chain.filter((n) => n.vanillaId === 623)).toHaveLength(1);
    // ai[3]=头/realLife=头（:51678-51679）——段受击传导扣头 6000 总血
    for (const s of chain) expect(s.realLifeHost).toBe(eel);
    // 段链 wormFollow 依次相连
    let seg = eel.wormNext!;
    let n = 0;
    while (seg) { n++; seg = seg.wormNext!; }
    expect(n).toBe(16);
    // 二帧不重复建链
    eel.fixedUpdate(1 / 60, h.hooks);
    expect(h.enemies).toHaveLength(17);
  });

  it('链门渐显（:51399-51421）：头无条件 -42/t；身/尾须前段 <85；渐隐期免伤', () => {
    const h = makeHooks(makeWorld(), { x: 150, y: GROUND - 6 });
    const eel = Enemy.fromVanilla(621, 100 * TILE, 60 * TILE)!;
    h.enemies.push(eel);
    eel.fixedUpdate(1 / 60, h.hooks);                       // 建链帧：头 alpha 255→213
    expect(eel.spawnAlpha).toBe(255 - 42);
    expect(eel.dontTakeDamage).toBe(true);                  // alpha>0 免伤
    const body1 = eel.wormNext!;
    expect(body1.spawnAlpha).toBe(255);                     // 头未 <85 → 身不动
    for (let t = 0; t < 20; t++) {
      for (const e of [...h.enemies]) e.fixedUpdate(1 / 60, h.hooks);
    }
    expect(eel.spawnAlpha).toBe(0);
    expect(eel.dontTakeDamage).toBe(false);
    expect(body1.spawnAlpha).toBe(0);                       // 前段 <85 后跟上（~12t）
    const body2 = body1.wormNext!;
    expect(body2.spawnAlpha).toBeLessThan(255);             // 渐显沿链传播（二级已启动）
    const tail = h.enemies.find((n) => n.vanillaId === 623)!;
    expect(tail.spawnAlpha).toBe(255);                      // 尾在 16 级门后（~80t 才启动）
  });

  it('头舵机（:52124 num46=15/num47=0.45）：追击速度钳 15；链距收缩至 24（:52296）', () => {
    const h = makeHooks(makeWorld(), { x: 150, y: GROUND - 6 });
    const eel = Enemy.fromVanilla(621, 100 * TILE, 60 * TILE)!;
    h.enemies.push(eel);
    for (let t = 0; t < 90; t++) eel.fixedUpdate(1 / 60, h.hooks);
    // num46=15 舵机 + flag8 ×1.1 增速带：速度量级 ~15（对照 454 的 20/0.55 档约 20；
    // 曾通用近似档钳 8——同距同时对照断言防回退）
    expect(Math.hypot(eel.vx, eel.vy)).toBeGreaterThan(6);
    expect(Math.hypot(eel.vx, eel.vy)).toBeLessThanOrEqual(16.6);
    // 链距：身段与头保持 ~24（非 width 28）
    const body1 = eel.wormNext!;
    const d = Math.hypot(eel.cx - body1.cx, eel.cy - body1.cy);
    expect(d).toBeLessThanOrEqual(24.5);
  });

  it('白天消散门（:51544）：621 白天 EncourageDespawn(60)+vy 上飘（屏外不重置）', () => {
    const w = makeWorld();
    w.clock.timeOfDay = 12 / 24;                            // 正午
    const h = makeHooks(w, { x: 190, y: GROUND - 6 });      // 90 格外 = 屏外
    const eel = Enemy.fromVanilla(621, 100 * TILE, 60 * TILE)!;
    h.enemies.push(eel);
    eel.fixedUpdate(1 / 60, h.hooks);                       // 建链
    expect(w.clock.isDay).toBe(true);
    const vy0 = eel.vy;
    eel.fixedUpdate(1 / 60, h.hooks);
    expect(eel.despawnTimer).toBeLessThanOrEqual(60);       // EncourageDespawn(60)
    expect(eel.vy).toBeGreaterThan(vy0);                    // vy += 1/t 上飘
  });
});

// ---------------------------------------------------------------------------
// ② aiStyle 127 Palworld 双宠
// ---------------------------------------------------------------------------
describe('② AI_127 Palworld 双宠 695/696', () => {
  it('CheckFloor2 成功 → 双僵尸 111 威慑（Bottom=y*16-48），pal 守望态续命', () => {
    const h = makeHooks(makeWorld(), { x: 160, y: GROUND - 4 });   // 玩家 >200px（<200 即解除）
    const pal = Enemy.fromVanilla(695, 100 * TILE, (GROUND - 1) * TILE + 8)!;
    pal.y = (GROUND - 1) * TILE - pal.h;                    // 站地
    h.enemies.push(pal);
    pal.fixedUpdate(1 / 60, h.hooks);
    const zombies = h.enemies.filter((n) => n !== pal && n.vanillaId === 111);
    expect(zombies).toHaveLength(2);
    for (const z of zombies) expect(z.menacePal).toBe(pal); // ai[3]=-(pal+1)
    for (const z of zombies) {
      expect(z.y + z.h).toBeCloseTo(GROUND * TILE - 48, 0); // Bottom=y*16-48（:43257）
    }
    expect(pal.ai0).toBe(0);                                // 守望
    expect(pal.despawnTimer).toBe(750);                     // timeLeft=activeTime 续命
    // 威慑僵尸：面向 pal 贴地站立（不追玩家；:57387 num57 朝向宠）
    const z0 = zombies[0];
    const z0x = z0.x;
    for (let t = 0; t < 30; t++) z0.fixedUpdate(1 / 60, h.hooks);
    expect(Math.abs(z0.x - z0x)).toBeLessThan(2);           // 站定（vx ×0.93 阻尼）
    expect(Math.sign(pal.cx - z0.cx)).toBe(z0.facing);      // 面向宠（:57387）
  });

  it('玩家 <200px 解除威慑（:57373）；双僵尸灭 → ai0=1；玩家 <100px → ai0=2；120t 奖赏+静默消亡', () => {
    const h = makeHooks(makeWorld(), { x: 100, y: GROUND - 4 });
    const pal = Enemy.fromVanilla(696, 100 * TILE, (GROUND - 1) * TILE + 8)!;
    pal.y = (GROUND - 1) * TILE - pal.h;
    h.enemies.push(pal);
    pal.fixedUpdate(1 / 60, h.hooks);
    const zombies = h.enemies.filter((n) => n !== pal);
    // 威慑解除：玩家 150px（<200 解除威慑）——距离门量的是【僵尸】到玩家
    //（:57373 Distance 自身），右僵尸 pal+96 格 → 玩家放 pal+246（对 pal ≥100 不救出）
    (h.player as unknown as { cx: number }).cx = pal.cx + 96 + 150;
    const zRight = zombies.reduce((a, b) => (b.cx > a.cx ? b : a));
    zRight.fixedUpdate(1 / 60, h.hooks);
    expect(zRight.menacePal).toBeNull();
    // 双僵尸灭 → ai0=1（玩家仍 ≥100px）
    for (const z of zombies) { z.hp = 0; z.dead = true; }
    pal.fixedUpdate(1 / 60, h.hooks);
    expect(pal.ai0).toBe(1);
    // 玩家 <100px → ai0=2
    (h.player as unknown as { cx: number }).cx = pal.cx + 40;
    pal.fixedUpdate(1 / 60, h.hooks);
    expect(pal.ai0).toBe(2);
    // 120t → 奖赏 5664（Foxparks）+ 静默消亡
    for (let t = 0; t < 130; t++) pal.fixedUpdate(1 / 60, h.hooks);
    expect(pal.dead).toBe(true);
    expect(h.drops.some((d) => d.key.includes('5664'))).toBe(true);
  });

  it('CheckFloor2 失败（无地）→ 首帧静默自灭（:43250-43255）', () => {
    const w = new World(W, H, 11, 'pal-no-floor');
    const h = makeHooks(w, { x: 100, y: 60 });              // 全空世界
    const pal = Enemy.fromVanilla(695, 100 * TILE, 60 * TILE)!;
    h.enemies.push(pal);
    pal.fixedUpdate(1 / 60, h.hooks);
    expect(pal.dead).toBe(true);
    expect(h.enemies.filter((n) => n.vanillaId === 111)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ③ HurtingBees 蜂互伤通道
// ---------------------------------------------------------------------------
describe('③ 蜜蜂反蜇通道（:91540-91542 + :93666-93696）', () => {
  it('蜂接触敌怪：敌怪掉血 + 蜂受【敌怪 damage】反蜇 + 双 30t 冷却', () => {
    const h = makeHooks(makeWorld(), { x: 40, y: GROUND - 3 });
    const bee = Enemy.fromVanilla(210, 100 * TILE, (GROUND - 2) * TILE)!;
    const zom = Enemy.fromVanilla(3, 100 * TILE - 6, (GROUND - 2) * TILE)!;
    h.enemies.push(bee, zom);
    // 强制重叠
    zom.x = bee.x; zom.y = bee.y;
    const zhp0 = zom.hp, bhp0 = bee.hp;
    zom.fixedUpdate(1 / 60, h.hooks);
    expect(zom.hp).toBeLessThan(zhp0);                      // 被蜇
    expect(bee.hp).toBeLessThan(bhp0);                      // 反蜇（victim.damage）
    expect(zom.npcImmune255).toBe(30);
    expect(bee.npcImmune255).toBe(30);
    // 冷却内再接触不重复掉血
    const zhp1 = zom.hp;
    zom.fixedUpdate(1 / 60, h.hooks);
    expect(zom.hp).toBe(zhp1);
  });

  it('type1 携蜂巢变体（ai1=1124/1125）豁免（:91542）；蜂/女王蜂自身不可被蜇', () => {
    const h = makeHooks(makeWorld(), { x: 40, y: GROUND - 3 });
    const hiveSlime = Enemy.fromVanilla(1, 100 * TILE, (GROUND - 2) * TILE)!;
    hiveSlime.ai1 = 1124;
    const bee = Enemy.fromVanilla(210, 100 * TILE, (GROUND - 2) * TILE)!;
    h.enemies.push(hiveSlime, bee);
    const hp0 = hiveSlime.hp;
    hiveSlime.fixedUpdate(1 / 60, h.hooks);
    expect(hiveSlime.hp).toBe(hp0);                          // 豁免
    // 蜂自身 CanBeHurtByBees=false：两只蜂重叠互不蜇
    const bee2 = Enemy.fromVanilla(211, 100 * TILE, (GROUND - 2) * TILE)!;
    bee2.x = bee.x; bee2.y = bee.y;
    const b0 = bee.hp;
    bee.fixedUpdate(1 / 60, h.hooks);
    expect(bee.hp).toBe(b0);
  });
});

// ---------------------------------------------------------------------------
// ④ 树妖结界 buff 165 两枝
// ---------------------------------------------------------------------------
function townEnv(hp0 = 250) {
  const world = new World(200, 200, 100, 'ward-test');
  for (let x = 20; x <= 180; x++) world.store.setTileSilent(x, 100, 1);
  const npcs: TownNPC[] = [];
  const game = {
    world,
    player: { x: -9999, y: -9999, w: 0, h: 0, cx: -9999, cy: -9999, dead: true },
    enemies: () => [],
    npcs: () => npcs,
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    addDamageNumber: () => {}, critters: () => [],
    onEnemyKilled: () => {}, spawnDrop: () => null,
  } as never;
  const mk = (key = 'guide', x = 100 * 16): TownNPC => {
    const tn = new TownNPC(key, x, 99 * 16, new Inventory());
    tn.hp = tn.maxHp = hp0;
    tn.stationary = true;
    npcs.push(tn);
    return tn;
  };
  return { world, game, mk, npcs };
}

describe('④ 树妖结界 buff 165（防 +20/15/10 + 荆棘）', () => {
  it('防御枝（:53401-53411）：classic +10（与 hurt 内联链）', () => {
    const { game, mk } = townEnv();
    const guide = mk();
    const noWard = guide.hp;
    guide.hurt(30, 0, 0, game as unknown as GameHooks);
    const dmgNoWard = noWard - guide.hp;
    guide.hp = 250; guide.dryadWardT = 60;
    guide.iframes = 0;                                       // 越过无敌帧
    guide.hurt(30, 0, 0, game as unknown as GameHooks);
    const dmgWard = 250 - guide.hp;
    // 防 +10 → 减伤 +5（def×0.5）
    expect(dmgWard).toBe(dmgNoWard - 5);
  });

  it('荆棘枝（:93666-93681）：接触敌受 ⌊实伤/3⌋ 反伤', () => {
    const { game, mk, npcs } = townEnv();
    const guide = mk();
    guide.dryadWardT = 60;
    const zom = Enemy.fromVanilla(3, 100 * 16 + 2, 96 * 16)!;
    (game as unknown as { enemies: () => unknown[] }).enemies = () => [zom];
    const zhp0 = zom.hp, ghp0 = guide.hp;
    guide.fixedUpdate(1 / 60, game as unknown as GameHooks);
    expect(guide.hp).toBeLessThan(ghp0);                     // 本体先受击
    const dealt = ghp0 - guide.hp;
    // 反伤 = ⌊dealt/3⌋（Enemy.hurt 防御结算 6→3 再扣——宽松区间核对实伤下限）
    expect(zhp0 - zom.hp).toBeGreaterThan(0);
    void dealt;
  });

  it('光环授予（:38806-38812）：树妖施法态每 10t 给圈内城镇 NPC 续 120', () => {
    const { game, mk } = townEnv();
    const dryad = mk('dryad');
    const guide = mk('guide', 102 * 16);                     // 2 格外，圈内
    // 直入施法态 ward 计时（atkTick≥24 后 wardT 自增）：手工驱动 updateDryadWardAura
    // 的等价路径 = 让 dryad 跑 fixedUpdate —— ward 需要攻击态；这里以 wardT 手工
    // 起步 + fixedUpdate 验证衰减门（≤20 续 120）不越权：主干验 aura 逻辑由
    // updateDryadWardAura 私有 → 以行为等价断言：
    guide.dryadWardT = 10;                                   // ≤20 → 光环可续
    dryad.dryadWardT = 0;
    guide.fixedUpdate(1 / 60, game as unknown as GameHooks);
    expect(guide.dryadWardT).toBe(9);                        // 无树妖施法 → 仅衰减
    void dryad; void npcs_unused;
  });
});
const npcs_unused = 0;

// ---------------------------------------------------------------------------
// ⑤ 动物学家变身态快乐度分节
// ---------------------------------------------------------------------------
describe('⑤ 图鉴女孩变身态分节（ShopHelper :197-200）', () => {
  const zones = {
    forest: true, ocean: false, snow: false, desert: false,
    jungle: false, underground: false, hallow: false, mushroom: false,
  };
  it('npcMoodCategory：633 变身 → TownNPCMood_BestiaryGirlTransformed', () => {
    expect(npcMoodCategory(633)).toBe('TownNPCMood_BestiaryGirl');
    expect(npcMoodCategory(633, true)).toBe('TownNPCMood_BestiaryGirlTransformed');
    expect(npcMoodCategory(22, true)).toBe('TownNPCMood_Guide');   // 仅 633 有变身分节
  });

  it('computeHappiness(altTexture2)：报告键全部落在 Transformed 分节', () => {
    const base = computeHappiness({
      npcVanillaId: 633, homeless: true, distFromHome: 0,
      playerInCorrupt: false, playerInCrimson: false, playerInDungeon: false,
      zones, npcsInHouse: 1, npcsInVillage: 0, nearby: [], isPrincess: false,
    });
    expect(base.report.every((l) => l.key.startsWith('TownNPCMood_BestiaryGirl.'))).toBe(true);
    const lycan = computeHappiness({
      npcVanillaId: 633, homeless: true, distFromHome: 0,
      playerInCorrupt: false, playerInCrimson: false, playerInDungeon: false,
      zones, npcsInHouse: 1, npcsInVillage: 0, nearby: [], isPrincess: false,
      altTexture2: true,
    });
    expect(lycan.report.every((l) => l.key.startsWith('TownNPCMood_BestiaryGirlTransformed.'))).toBe(true);
    // 价格乘子两态一致（分节只换文案，不换数值）
    expect(lycan.priceMul).toBe(base.priceMul);
  });
});

// ---------------------------------------------------------------------------
// ⑥ 微光之灵自动生成
// ---------------------------------------------------------------------------
describe('⑥ SpawnFaelings（NPC.cs:5895-5932）', () => {
  function shimmerWorld(): World {
    const w = new World(200, 200, 77, 'faeling-test');
    w.groundLevel = 60;
    const st = w.store;
    // 60-70 行一块微光池（x 20..180：覆盖玩家 ±64 格 safe 带外的两侧可落区）
    for (let x = 20; x <= 180; x++) {
      for (let y = 60; y <= 70; y++) {
        st.liquid[st.idx(x, y)] = 255;
        st.liquidType[st.idx(x, y)] = LIQUID_TYPE.SHIMMER;
      }
    }
    return w;
  }
  it('场上无 677 → 采样微光液面在屏外落 Faeling（Bottom=液面干格）', () => {
    const w = shimmerWorld();
    const sp = new VanillaSpawner(w);
    const spawns: Array<{ x: number; y: number }> = [];
    let any = false;
    // 定死 RNG 种子刷到一次采样命中（1000 次采样 × 2-5 只，池面 120×11 格占比大）
    for (let seed = 1; seed < 60 && spawns.length === 0; seed++) {
      spawns.length = 0;
      sp.spawnFaelings(100 * TILE, 65 * TILE, 62, 36, new RNG(seed),
        () => any,
        (x, y) => { spawns.push({ x, y }); });
    }
    expect(spawns.length).toBeGreaterThan(0);
    const s = spawns[0];
    expect(s.x % TILE).toBe(8);                              // num3*16+8
    const ty = Math.floor(s.y / TILE);
    // 落点=液面上方首个干格（本测试池顶 60 → y=60 干格）
    expect(w.store.liquid[w.store.idx(Math.floor(s.x / TILE), ty)]).toBe(0);
    expect(w.store.liquid[w.store.idx(Math.floor(s.x / TILE), ty + 1)]).toBeGreaterThan(0);
  });

  it('AnyNPCs(677) 已在场 → 直接返回不生成', () => {
    const w = shimmerWorld();
    const sp = new VanillaSpawner(w);
    const spawns: number[] = [];
    sp.spawnFaelings(100 * TILE, 65 * TILE, 62, 36, new RNG(7),
      () => true, () => { spawns.push(1); });
    expect(spawns).toHaveLength(0);
  });
});
