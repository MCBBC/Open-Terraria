// ★SW-FX1（2026-09-09）配饰域补债批回归锚（item-audit-2026-08-22.md 配饰节 ❌/⚠️ 余项）：
//   ① 976/984 spikedBoots 档位还原（Player.cs:1075 int 计数;953/975 各+1 :15154/:15158、
//      976 +=2 :15162、984 =2 赋值 :15180、3995/3996 +=2 :14549/:14555;
//      WallslideMovement 消费分档 :21955(≥2 驻停)/:21991(==1 缓降)）
//   ② 1303 水母项链（:15339-15348 双支 AddLight）
//   ③ 3245 骨头手套（:14660-14662 + 掷骨 :43961-43968 + 冷却 :25662-25664）
//   ④ 3336 孢子囊（:14884-14886 + Player.SporeSac :42735-42817 + AI_105 :40768-40905
//      + Kill 迸气 :74317-74323 + AI_106 :34144-34168）
//   ⑤ 4987 挥发明胶（:14888-14890 + Player.VolatileGelatin :42820-42857 + 937 规格上海
//      SetDefaults :8907-8912 + 撞块弹反 :18602-18613 + 尾尘 :56018-56052）
//   ⑥ 532 骨弹撞块弹反（HandleMovement type 段 :18259-18278）
// 已在位免测项（本批核对现状后不动）：3068 cordage（Game.ts 割藤支)/3016/3991/3992/4005/
// 4006 aggro±400（Player.ts AGGRO_NEG/POS+Enemy 消费)/4002 moltenQuiver（resolveBowProjOverride)/
// 3337 shinyStone（Player.ts R5-F2 段)/4409 幽灵护目镜（Game.ts showInvisibleBlocks 扫描）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import { Enemy } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import { Game } from '../src/core/Game';
import { SporeSacCloud, SporeGasCloud, SPORE_CLOUD_A, SPORE_CLOUD_B } from '../src/entities/SporeSacProj';
import { BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

const iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];
const PLAT = TILE_BY_KEY['platform']!;

// ---------------------------------------------------------------------------
function flatWorld(): World {
  const w = new World(480, 80, 30, 'open');
  for (let x = 0; x < w.w; x++) {
    w.store.setTileSilent(x, 70, 1, 0, 0);
    w.store.setTileSilent(x, 71, 1, 0, 0);
  }
  return w;
}

function makeGame(w: World, enemies: unknown[] = [], bucket: unknown[] = []): GameHooks {
  // Game.prototype 壳（active-gates-tb4 同法）——私有方法（boneGloveTick 等）可直调。
  // entities.enemies/entities.projectiles 桶与 hooks.enemies()/hooks.projectiles() 共享
  // 同一数组（Game 侧 tick 段直读桶,spawn 面同桶可见）
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  Object.assign(g, {
    world: w, player: null as unknown, enemies: () => enemies, critters: () => [],
    projectiles: () => bucket,
    entities: { nextId: 1, enemies, projectiles: bucket, add: (e: unknown, b?: string) => { if (b === 'projectiles') bucket.push(e); } },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    addLightAt: () => {}, spawnDust: () => ({ x: 0, y: 0, vx: 0, vy: 0 }),
    hitTilesFx: () => {},
    broadcastParticleOrchestra: () => {},
    _bannerNpcs: new Set<number>(), _bannerReps: new Set<number>(),   // bannerNpcActive 旗扫描桩
    scene: new Proxy({}, { get: () => false }),                       // dropContext zone 族桩（敌死掉路面）
  });
  return g as unknown as GameHooks;
}

// ===========================================================================
// ① spikedBoots 档位（equipStats 面真值表 + 叠加序 quirk）
// ===========================================================================
describe('SW-FX1① spikedBoots 档位还原（int 计数,Player.cs:1075/:15154-15181/:14549）', () => {
  it.each([
    [953, 1, '攀爬爪 :15154-15156'],
    [975, 1, '鞋钉 :15157-15160'],
    [976, 2, '老虎攀爬装备 :15161-15164 +=2'],
    [984, 2, '忍者大师装备 :15176-15181 赋值=2'],
    [3995, 2, '蛙 gear :14543-14551 +=2'],
    [3996, 2, ':14552-14557 +=2'],
  ])('vid %i → spikedBoots=%i（%s）', (vid, tier) => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.inv.armor[3] = { id: iid(vid), stack: 1 };
    expect(p.equipStats.spikedBoots).toBe(tier);
  });

  it('984 副旗：blackBelt + dashType=1（:15177-15179 accfx 段）', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.inv.armor[3] = { id: iid(984), stack: 1 };
    expect(p.equipStats.blackBelt).toBe(true);
    expect(p.equipStats.dash).toBe(1);
  });

  it('叠加：953+975 → 2、975+976 → 3（+ 号语义）', () => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    p.inv.armor[3] = { id: iid(953), stack: 1 };
    p.inv.armor[4] = { id: iid(975), stack: 1 };
    expect(p.equipStats.spikedBoots).toBe(2);
    const q = new Player(60 * TILE, 60 * TILE, new Inventory());
    q.inv.armor[3] = { id: iid(975), stack: 1 };
    q.inv.armor[4] = { id: iid(976), stack: 1 };
    expect(q.equipStats.spikedBoots).toBe(3);
  });

  it('★984 赋值 quirk（:15180）：976 先 984 后 → 2（覆盖前积）;984 先 976 后 → 4', () => {
    const a = new Player(60 * TILE, 60 * TILE, new Inventory());
    a.inv.armor[3] = { id: iid(976), stack: 1 };
    a.inv.armor[4] = { id: iid(984), stack: 1 };
    expect(a.equipStats.spikedBoots).toBe(2);
    const b = new Player(60 * TILE, 60 * TILE, new Inventory());
    b.inv.armor[3] = { id: iid(984), stack: 1 };
    b.inv.armor[4] = { id: iid(976), stack: 1 };
    expect(b.equipStats.spikedBoots).toBe(4);
  });
});

// ===========================================================================
// ①b WallslideMovement 消费分档（:21955-22016 双支——档位塌缩变异的判别面）
// ===========================================================================
describe('SW-FX1①b 贴墙分档：≥2 驻停上攀 / ==1 缓降 0.5（WallslideMovement :21955/:21991）', () => {
  function wallWorld(): World {
    const w = flatWorld();
    for (let y = 30; y <= 69; y++) w.store.setTileSilent(25, y, 1, 0, 0);   // 墙柱 x=25
    return w;
  }
  function slideVys(vid: number, inputDown = false): number[] {
    return slideVysWorld(wallWorld(), vid, inputDown);
  }
  // ★SW-RB11b F1：世界可注入版（flag 双格探针的短墙夹具消费）
  function slideVysWorld(w: World, vid: number, inputDown = false): number[] {
    const game = makeGame(w);
    const p = new Player(25 * TILE - 20, 50 * TILE, new Inventory());   // 右缘贴墙(400px)
    p.inv.armor[3] = { id: iid(vid), stack: 1 };
    p.equipStats;                                                       // 预热
    const vys: number[] = [];
    for (let i = 0; i < 24; i++) {
      p.inputX = 1;                                                     // 压向墙
      p.inputDown = inputDown;
      p.fixedUpdate(1 / 60, game);
      vys.push(p.vy);
    }
    return vys;
  }

  it('==1 档（953）：缓降档出现（0.5+重力后积分 0.6）、全程无负 vy（不上攀）', () => {
    const vys = slideVys(953);
    // ★仓内管线注：滑行块在重力积分【前】写 vy → 同拍再吃 +0.1 重力 = 稳态 0.6
    //  （原版 WallslideMovement 在重力计算后覆写 velocity=0.5;净档位差 = 一个重力
    //  单位,系滑行块插入位次的既有管线偏差,非本批引入——档位判别信号不受影响）
    expect(vys.some((v) => Math.abs(v - 0.6) < 1e-6)).toBe(true);       // :21998 0.5f*gravDir +0.1
    expect(vys.some((v) => v < 0)).toBe(false);                          // ==1 无上攀档
  });
  it('==1 档按 ↓：4 快滑出现（:21996 +0.1 = 4.1）', () => {
    expect(slideVys(953, true).some((v) => Math.abs(v - 4.1) < 1e-6)).toBe(true);
  });
  it('≥2 档（976）：驻停贴壁（vy=(−gravity+1e-5)+gravity ≈ 0,原版字段语义——★SW-RB11b F2）——==1 档永不出现', () => {
    // ★SW-RB11b 勘误：num3=:21962 `float num3 = gravity`【字段】=0.4×num6（:24559 复位
    //  → :24880 gravity*=num6 先于 :26965）——与管线重力 III224 同源,净速度
    //  (−gField+1e-5)+gField ≈ 1e-5 ≈ 0（驻停贴壁,非上攀）。旧期望 vy<−0.2 系
    //  wallslide 支用未缩放 GRAVITY 常量+管线缩放重力的【不一致混合】标定。
    const vys = slideVys(976);
    expect(vys.some((v) => Math.abs(v) < 0.01)).toBe(true);              // 驻停（净≈0）
    expect(vys.some((v) => v < -0.05)).toBe(false);                      // 不上攀（旧混合态）
    expect(vys.some((v) => Math.abs(v - 0.6) < 1e-6)).toBe(false);       // 0.5 缓降档是 ==1 专属
  });
  it('≥2 档按 ↓：4 快滑出现（:21960 +0.1 = 4.1）', () => {
    expect(slideVys(976, true).some((v) => Math.abs(v - 4.1) < 1e-6)).toBe(true);
  });
  it('★SW-RB11b F1 flag 双格探针（:21944-21954）：墙不延到脚缘之下（悬浮墙）→ 不驻停自由落体', () => {
    // 墙柱只到 y=50（身体贴住行 50=hitWall 真,但脚缘行 51/52 无墙）→ flag=false
    // → ≥2 门 !flag 早退 :21957 → 自由落体（无 |vy|≈0 驻停拍、无 4.1 快滑拍）
    function shortWallWorld(): World {
      const w = flatWorld();
      for (let y = 30; y <= 50; y++) w.store.setTileSilent(25, y, 1, 0, 0);
      return w;
    }
    const vys = slideVysWorld(shortWallWorld(), 976);
    expect(vys.some((v) => Math.abs(v) < 0.01)).toBe(false);
    expect(vys.some((v) => Math.abs(v - 4.1) < 1e-6)).toBe(false);
    expect(vys.some((v) => v > 2)).toBe(true);                           // 自由落体加速
  });
  it('★SW-RB11b F1 flag 双格探针：==1 缓降档 gd=1 半边同吃 flag（:21991）——悬浮墙不缓降', () => {
    function shortWallWorld(): World {
      const w = flatWorld();
      for (let y = 30; y <= 50; y++) w.store.setTileSilent(25, y, 1, 0, 0);
      return w;
    }
    const vys = slideVysWorld(shortWallWorld(), 953);
    // 自由落体链 0.1 步进会【路过】0.6 一拍——缓降档被 flag 拦的判别=0.6 不驻留
    //（ slide 态 0.6 连续多拍）,且坠速突破缓降帽
    expect(vys.filter((v) => Math.abs(v - 0.6) < 1e-6).length).toBeLessThanOrEqual(1);
    expect(vys.some((v) => v > 2)).toBe(true);                           // 自由落体
  });
  it('★SW-RB11b F2b slowFall 双乘 quirk（:21963-21967 gravDir 在 num3 内）：慢Fall 驻停同 ≈0（与 gd 无关）', () => {
    const game = makeGame(wallWorld());
    const p = new Player(25 * TILE - 20, 50 * TILE, new Inventory());
    p.inv.armor[3] = { id: iid(976), stack: 1 };
    p.buffs.apply(BuffType.Featherfall, 60);                             // Featherfall = slowFall 源
    p.equipStats;
    const vys: number[] = [];
    for (let i = 0; i < 24; i++) {
      p.inputX = 1;
      p.fixedUpdate(1 / 60, game);
      vys.push(p.vy);
    }
    expect(vys.some((v) => Math.abs(v) < 0.05)).toBe(true);
  });
});

// ===========================================================================
// ②③④⑤ equipStats 四旗真值表（UpdateEquips if-chain 装备位）
// ===========================================================================
describe('SW-FX1②-⑤ 单件旗（1303/3245/3336/4987）', () => {
  it.each([
    [1303, 'jellyfishNecklace'],
    [3245, 'boneGlove'],
    [3336, 'sporeSac'],
    [4987, 'volatileGelatin'],
  ])('vid %i → equipStats.%s = true', (vid, key) => {
    const p = new Player(60 * TILE, 60 * TILE, new Inventory());
    expect(p.equipStats[key as 'boneGlove']).toBe(false);
    p.inv.armor[3] = { id: iid(vid), stack: 1 };
    expect(p.equipStats[key as 'boneGlove']).toBe(true);
  });
});

// ===========================================================================
// ③ 骨头手套掷骨链（Game.boneGloveTick ↔ :43961-43968 + 冷却 :25662-25664）
// ===========================================================================
describe('SW-FX1③ 骨头手套 3245（ItemCheck 每拍门 + ApplyRangeCompensation 掷骨 532）', () => {
  function shell(p: Player, w = flatWorld()) {
    const bucket: unknown[] = [];
    const g = makeGame(w, [], bucket) as unknown as Record<string, unknown>;
    g.player = p;
    g.camera = { zoom: 1, screenToWorld: (sx: number, sy: number): [number, number] => [sx, sy] };
    g.input = { mouseX: 1000, mouseY: 900 };
    return { bucket, game: g as unknown as GameHooks, tick: () => (g as unknown as { boneGloveTick(): void }).boneGloveTick() };
  }
  function armedPlayer(): Player {
    const p = new Player(950, 939, new Inventory());
    p.inv.armor[3] = { id: iid(3245), stack: 1 };
    p.inv.slots[0] = { id: iid(3507), stack: 1 };     // 铜短剑（damage>0）
    p.itemAnimTicks = 10;                             // itemAnimation>0
    p.equipStats;
    return p;
  }

  it('装备+挥击 → 60t 冷却 + 掷 532（25 伤/5 kb/朝 ApplyRangeCompensation(0.2) 修正鼠标向 10 速）', () => {
    const p = armedPlayer();
    const { bucket, tick } = shell(p);
    tick();
    expect(p.boneGloveTimer).toBe(60);                                  // :43963
    expect(bucket.length).toBe(1);
    const b = bucket[0] as Arrow;
    expect(b.projId).toBe(532);
    expect(b.damage).toBe(25);                                          // :43966
    expect(b.knockback).toBe(5);                                        // :43966
    // ApplyRangeCompensation(0.2, center, target)（:42909-42919）+ DirectionTo×10（:43965）
    const cx = 960, cy = 960, mx = 1000, my = 900;
    const vl = Math.hypot(mx - cx, my - cy) || 1;
    const nx = (mx - cx) / vl, ny = (my - cy) / vl - 1;
    const d = Math.pow(vl / 700, 2) * 700;
    const tX = mx + -nx * d * 0.2, tY = my + ny * d * 0.2;
    const dl = Math.hypot(tX - cx, tY - cy) || 1;
    expect(b.vx).toBeCloseTo((tX - cx) / dl * 10, 6);
    expect(b.vy).toBeCloseTo((tY - cy) / dl * 10, 6);
  });

  it('冷却期不掷（boneGloveTimer==0 门 :43961）;timer 逐拍递减（:25662-25664）', () => {
    const p = armedPlayer();
    const { bucket, tick, game } = shell(p);
    tick();
    expect(p.boneGloveTimer).toBe(60);                                  // :43963
    p.fixedUpdate(1 / 60, game);                                        // Player 侧递减位
    expect(p.boneGloveTimer).toBe(59);                                  // :25662-25664
    tick();                                                             // 冷却窗第二拍不掷
    expect(bucket.length).toBe(1);
  });

  it.each([
    ['未装备 3245', (p: Player) => { p.inv.armor[3] = null; }],
    ['itemAnimation==0（未挥击）', (p: Player) => { p.itemAnimTicks = 0; }],
    ['手持 0 伤物品（火把）', (p: Player) => { p.inv.slots[0] = { id: iid(8), stack: 1 }; }],
  ])('%s → 不掷（门 :43961 sItem.damage>0/itemAnimation>0）', (_name, breakIt) => {
    const p = armedPlayer();
    const { bucket, tick } = shell(p);
    breakIt(p);
    tick();
    expect(bucket.length).toBe(0);
  });
});

// ===========================================================================
// ⑤ 挥发明胶 4987（Game.volatileGelatinTick ↔ :42820-42857）
// ===========================================================================
describe('SW-FX1⑤ 挥发明胶 4987（40t 计数掷 937 凝胶弹）', () => {
  function shell(p: Player, enemies: unknown[], w = flatWorld()) {
    const bucket: unknown[] = [];
    const g = makeGame(w, enemies, bucket) as unknown as Record<string, unknown>;
    g.player = p;
    return { bucket, tick: () => (g as unknown as { volatileGelatinTick(): void }).volatileGelatinTick() };
  }
  function gelPlayer(): Player {
    const p = new Player(960, 939, new Inventory());
    p.inv.armor[3] = { id: iid(4987), stack: 1 };
    p.equipStats;
    return p;
  }

  it('计数 41 拍 >40 → 清零 + 掷 937（65 伤/7 kb/向 640px 内 LOS 最近敌,v=dir×12、vy −1.3）', () => {
    const w = flatWorld();
    const foe = Enemy.fromVanilla(3, 1100, 939)!;      // 僵尸 640px 内
    foe.id = 4101;
    const p = gelPlayer();
    const { bucket, tick } = shell(p, [foe], w);
    for (let i = 0; i < 40; i++) {
      tick();
      expect(p.volatileGelatinCounter).toBe(i + 1);    // :42826-42830 计数不掷
      expect(bucket.length).toBe(0);
    }
    tick();                                            // 第 41 拍 counter=41 > 40
    expect(p.volatileGelatinCounter).toBe(0);          // :42831 清零
    expect(bucket.length).toBe(1);
    const g = bucket[0] as Arrow;
    expect(g.projId).toBe(937);
    expect(g.damage).toBe(65);                         // :42837
    expect(g.knockback).toBe(7);                       // :42838
    const l = Math.hypot(foe.cx - 970, foe.cy - 960) || 1;
    expect(g.vx).toBeCloseTo((foe.cx - 970) / l * 12, 6);          // :42852-42854 ×12
    expect(g.vy).toBeCloseTo((foe.cy - 960) / l * 12 - 1.3, 6);    // :42855 v.Y −= 1.3
    expect((g as unknown as { idStaticGroup: number }).idStaticGroup).toBe(937);   // :8910-8911
  });

  it('射程外无目标 → 清零不掷（:42846-42848 nPC==null）', () => {
    const w = flatWorld();
    const far = Enemy.fromVanilla(3, 960 + 700, 939)!;   // >640
    far.id = 4102;
    const p = gelPlayer();
    const { bucket, tick } = shell(p, [far], w);
    for (let i = 0; i < 41; i++) tick();
    expect(bucket.length).toBe(0);
    expect(p.volatileGelatinCounter).toBe(0);
  });

  it('卸下即冻结计数不清零（UpdateEquips 内调用=装备期才递增,quirk 1:1）', () => {
    const w = flatWorld();
    const p = gelPlayer();
    const { tick } = shell(p, [], w);
    for (let i = 0; i < 10; i++) tick();
    expect(p.volatileGelatinCounter).toBe(10);
    p.inv.armor[3] = null;
    p.equipStats;
    for (let i = 0; i < 5; i++) tick();
    expect(p.volatileGelatinCounter).toBe(10);          // 冻结（非清零/非续增）
  });
});

// ===========================================================================
// ④ 孢子囊 3336（Game.sporeSacTick ↔ Player.SporeSac :42735-42817）
// ===========================================================================
describe('SW-FX1④ 孢子囊 3336（1/15 掷 + 计数顶 + 落点扫描 + 567/568 掷定）', () => {
  let randSeq: number[] = [];
  let constRand = 0.5;
  const realRandom = Math.random.bind(Math);
  beforeEach(() => {
    Math.random = () => (randSeq.length ? randSeq.shift()! : constRand);
  });
  afterEach(() => {
    Math.random = realRandom;
    randSeq = [];
  });

  function sacWorld(): World {
    const w = flatWorld();
    w.store.setTile(60, 60, PLAT);          // 平台 19 锚点格（tile(60,60)=px 960..976）
    return w;
  }
  function sacPlayer(): Player {
    const p = new Player(950, 939, new Inventory());    // 中心 (960,960)=tile(60,60)
    p.inv.armor[3] = { id: iid(3336), stack: 1 };
    p.equipStats;
    return p;
  }
  function shell(p: Player, w: World, bucket: unknown[]) {
    const g = makeGame(w, [], bucket) as unknown as Record<string, unknown>;
    g.player = p;
    return { tick: () => (g as unknown as { sporeSacTick(): void }).sporeSacTick() };
  }

  it('首拍掷中（Next(15)==0）→ 平台锚定支：spawn 567/568 于盒心−45（quirk :42798-42803）,70 伤 1.5 kb', () => {
    const w = sacWorld();
    const p = sacPlayer();
    const bucket: unknown[] = [];
    randSeq = [0, 0.99];                    // gate=0、cap roll=floor(0.99×15)=14（装桩后置,防构造期消耗）
    constRand = 0.5;                        // num5=300、偏移 0、墙掷 1(else 支)、型别掷 568
    const { tick } = shell(p, w, bucket);
    tick();
    expect(bucket.length).toBe(1);
    const cloud = bucket[0] as SporeSacCloud;
    expect(cloud.projId).toBe(568);         // rand<0.5 假 → 568（567+Next(2) 第二掷）
    expect(cloud.x).toBe(972 - 45);         // fx = 盒心(972) − num4/2(45)（平台支不回移）
    expect(cloud.y).toBe(972 - 45);
    expect(cloud.damage).toBe(70);          // :42739
    expect(cloud.knockback).toBe(1.5);      // :42740
  });

  it('gate 未中（Next(15)!=0）→ 不掷（:42741）', () => {
    const w = sacWorld();
    const p = sacPlayer();
    const bucket: unknown[] = [];
    randSeq = [0.99];                       // gate 未中
    const { tick } = shell(p, w, bucket);
    tick();
    expect(bucket.length).toBe(0);
  });

  it('存活云 ≥10 → 硬顶不掷（:42755 num>=10）;软顶 Next(15)<num 同效', () => {
    const w = sacWorld();
    const p = sacPlayer();
    const bucket: unknown[] = [];
    for (let i = 0; i < 10; i++) bucket.push({ projId: 567, dead: false, x: -9999, y: -9999, w: 16, h: 16 });
    randSeq = [0, 0.0];                     // cap roll=floor(0×15)=0 < num=10 → return
    const { tick } = shell(p, w, bucket);
    tick();
    expect(bucket.length).toBe(10);
  });

  it('无锚点（空中无墙/实心/平台）→ 50 次扫描全空转不掷', () => {
    const w = flatWorld();                  // 无平台/墙
    const p = new Player(950, 40 * TILE, new Inventory());   // 高空
    p.inv.armor[3] = { id: iid(3336), stack: 1 };
    p.equipStats;
    const bucket: unknown[] = [];
    randSeq = [0, 0.99];
    const { tick } = shell(p, w, bucket);
    tick();
    expect(bucket.length).toBe(0);
  });
});

// ===========================================================================
// ④b 孢子云 AI_105 + 迸气 AI_106（实体单元）
// ===========================================================================
describe('SW-FX1④b AI_105 孢子云（:40768-40905）+ AI_106 迸气（:34144-34168）', () => {
  function unitGame(enemies: unknown[] = [], sporeSac = true) {
    const w = flatWorld();
    const game = makeGame(w, enemies);
    (game as unknown as { player: unknown }).player = {
      x: 950, y: 939, w: 20, h: 42, cx: 960, cy: 960, vx: 0, vy: 0, dead: false,
      luck: 0, addDPS: () => {}, tryConsumingTimerCrit: () => false,
      equipStats: { sporeSac },
    };
    return game;
  }

  it('渐显：α 255 → −10/拍钳 50（:40882-40889）;光 = 0.2/0.275/0.075 × (1−α/255)×scale', () => {
    const c = new SporeSacCloud(1000, 1000, SPORE_CLOUD_A, 70, 1.5, 3);
    const game = unitGame();
    c.fixedUpdate(1 / 60, game);
    expect(c.lightRGB).not.toBeNull();
    for (let i = 0; i < 25; i++) c.fixedUpdate(1 / 60, game);
    expect((c as unknown as { alpha: number }).alpha).toBe(50);           // 钳 50
  });

  it('索敌（:40891-40905）：340 曼哈顿内敌 → v=(v×40+dir×4)/41 收敛;无目标 |v|>0.2 → ×0.98', () => {
    const foe = Enemy.fromVanilla(3, 960 + 100, 960)!;
    foe.id = 4201;
    const c = new SporeSacCloud(1000, 1000, SPORE_CLOUD_B, 70, 1.5, 1);
    const game = unitGame([foe]);
    c.fixedUpdate(1 / 60, game);
    expect(c.vx).toBeGreaterThan(0);        // 向 +x 敌收敛
    const still = new SporeSacCloud(1000, 1000, SPORE_CLOUD_A, 70, 1.5, 1);
    (still as unknown as { vx: number }).vx = 4;
    const game2 = unitGame([]);
    still.fixedUpdate(1 / 60, game2);
    // :40809-40814 漂移（visualIndex=1 → m=1 → num3=+1,vx+=0.002）后 :40913-40915 ×0.98
    expect(still.vx).toBeCloseTo((4 + 0.002) * 0.98, 6);
  });

  it('命中敌怪 → penetrate 1 耗尽消亡 + 迸 569-571 同伤气团（Kill :74317-74323）', () => {
    const foe = Enemy.fromVanilla(3, 995, 995)!;
    foe.id = 4202;
    const c = new SporeSacCloud(990, 990, SPORE_CLOUD_A, 70, 1.5, 2);
    const gasSpy: Array<{ dmg: number }> = [];
    const game = unitGame([foe]);
    // 注入迸气回调（Game 侧闭包的单元替身）
    (c as unknown as { spawnGasCb: unknown }).spawnGasCb = (x: number, y: number, vx: number, vy: number, dmg: number) => {
      gasSpy.push({ dmg });
      expect(vx * vx + vy * vy).toBeCloseTo(0.09, 6);   // 随机单位向量 ×0.3（:74318-74322）
    };
    for (let i = 0; i < 30 && !c.dead; i++) c.fixedUpdate(1 / 60, game);
    expect(c.dead).toBe(true);
    expect(gasSpy.length).toBe(1);
    expect(gasSpy[0].dmg).toBe(70);                     // 同伤透传（:74321 damage 实参）
  });

  it('气团 AI_106：α −30 钳 80 渐显、v×0.98、60t 后 α+5 至 255 消亡（:34144-34168）', () => {
    const gas = new SporeGasCloud(1000, 1000, 1, 0, 569, 70);
    const game = unitGame();
    for (let i = 0; i < 6; i++) gas.fixedUpdate(1 / 60, game);
    expect((gas as unknown as { alpha: number }).alpha).toBe(80);         // 渐显钳 80
    expect((gas as unknown as { vx: number }).vx).toBeCloseTo(1 * Math.pow(0.98, 6), 6);
    for (let i = 0; i < 95 && !gas.dead; i++) gas.fixedUpdate(1 / 60, game);
    expect(gas.dead).toBe(true);                                          // ~60+35t 淡出消亡
  });

  it('气团组共享 IDStatic 免疫（UseGroupStaticImmunity(569) :6219——组键 569 行共享）:三变体同敌只过一张组表门（红蓝-J1 运行时消费面审计;伤=1 防死判别,计 hurt 调用=门位判别）', () => {
    const foe = Enemy.fromVanilla(3, 1000, 1000)!;
    foe.id = 4299;
    let hurtCalls = 0;
    const origHurt = foe.hurt.bind(foe);
    (foe as unknown as { hurt: (...a: unknown[]) => boolean }).hurt = (...args: unknown[]) => {
      hurtCalls++;
      return origHurt(...args);
    };
    const game = unitGame([foe]);
    // 三变体 569/570/571 同帧同位重叠;伤=1（僵尸 45hp 不死=存活判别面）。
    // 判别信号=hurt 调用数:组表共享 → 仅首个变体过 cd.ready 门（其余在 dealContacts
    // 内被 continue 拦下,hurt 不被调用）;若表 per-instance（变异面）→ 三次全过门,
    // hurt 被调 3 次（后两次由 Enemy.hurt 内 iframes 拒收）——门位差异即判别力。
    const g1 = new SporeGasCloud(1000, 1000, 0, 0, 569, 1);
    const g2 = new SporeGasCloud(1000, 1000, 0, 0, 570, 1);
    const g3 = new SporeGasCloud(1000, 1000, 0, 0, 571, 1);
    for (let i = 0; i < 5; i++) {          // 5 拍 ≈ 83ms < 10t=167ms 窗
      g1.fixedUpdate(1 / 60, game);
      g2.fixedUpdate(1 / 60, game);
      g3.fixedUpdate(1 / 60, game);
    }
    expect(hurtCalls).toBe(1);             // 组表单门（per-instance 变异面=3）
  });

  // =========================================================================
  // ★拍板#1A（红蓝-J3 2026-09-18）云 567/568 免疫面三不写判别面：
  //  Damage 免疫梯首支内层条件 `penetrate!=1 || appliesImmunityTimeOnSingleHits`
  //  对云恒假（Projectile.cs:14031-14038）→ 组行恒不写=外环组门恒开（多云同拍
  //  连击同敌=本相）+命中不写 immune[owner]（尾档 :14175-14183 不达）=不开全局窗。
  //  曾自造 SPORE_CLOUD_IMMUNE 10t 组窗+Enemy.hurt 写 10t iframes 双重保守节流
  //  已摘——复辟任一重 → 本块爆红（变异面≥2）。
  // =========================================================================
  it('多云同拍连击同敌（拍板#1A 判别面）:3 云同敌 3 次 hurt + 3 迸气,敌 iframes 恒 0', () => {
    const foe = Enemy.fromVanilla(3, 995, 995)!;         // 僵尸 45hp——伤 1×3 不致死
    foe.id = 4301;
    let hurtCalls = 0;
    const origHurt = foe.hurt.bind(foe) as (...a: unknown[]) => boolean;
    (foe as unknown as { hurt: (...a: unknown[]) => boolean }).hurt = (...args: unknown[]) => {
      hurtCalls++;
      return origHurt(...args);
    };
    const game = unitGame([foe]);
    const gasDmg: number[] = [];
    const mk = (type: number) => new SporeSacCloud(990, 990, type, 1, 1.5, 1,
      (_x: number, _y: number, _vx: number, _vy: number, dmg: number) => { gasDmg.push(dmg); });
    const c1 = mk(SPORE_CLOUD_A);
    const c2 = mk(SPORE_CLOUD_B);
    const c3 = mk(SPORE_CLOUD_A);
    c1.fixedUpdate(1 / 60, game);
    c2.fixedUpdate(1 / 60, game);
    c3.fixedUpdate(1 / 60, game);
    expect(hurtCalls).toBe(3);             // 组窗复辟 → 1;hurt 写帧复辟 → 1（双变异面）
    expect(c1.dead).toBe(true);            // 各云首命中即亡（penetrate 1）
    expect(c2.dead).toBe(true);
    expect(c3.dead).toBe(true);
    expect(gasDmg).toEqual([1, 1, 1]);     // Kill :74317 迸气=每云一次,同伤透传
    expect(foe.iframes).toBe(0);           // 云命中三不写=不开全局窗（:14035 不达）
  });

  it('云命中尊重他源免疫窗（内环 :12636 immune[owner]==0 门,pierce=-2 门照走）:iframes>0 → 零结算', () => {
    const foe = Enemy.fromVanilla(3, 995, 995)!;
    foe.id = 4302;
    const game = unitGame([foe]);
    foe.iframes = 5;                       // 他源开窗（原版 immune[owner]=5 同构档）
    const c = new SporeSacCloud(990, 990, SPORE_CLOUD_A, 70, 1.5, 1);
    c.fixedUpdate(1 / 60, game);
    expect(foe.hp).toBe(foe.maxHp);        // 免疫门拒=零结算（pierce=1 旁路面不越权）
    expect(c.dead).toBe(false);            // ★红蓝-L1①盲点补：被拒不弹亡（曾=hit 无条件发→云亡）
  });

  // =========================================================================
  // ★红蓝-L1①（2026-09-18）空爆案判别面：dealContacts 内环免疫门收编
  //  （Projectile.cs:12635-12638,结算点 iframes 门,hitPierce===1 豁免）——被拒命中
  //  全静默（StatusNPC(:13634)/TryDoingOnHitEffects(:13642)/StrikeNPC(:13702)/免疫梯
  //  写行(:14033-14037,:14175-14183)/penetrate 递减(:14190-14205)/Kill 全不可达）,
  //  云存活续漂等窗清重试。曾无视 hurt=false 无条件 onHit → 云亡+空迸气团（带同伤
  //  参数）。变异：M1 摘门→空爆帧云亡+迸气红;M2 门移 cd.ready 后→气团组窗被拒白吃
  //  10t 红;M3 消费 hurt 布尔返作拒收判别→存活受击（击杀语义 false 返）整段误杀红。
  // =========================================================================
  it('空爆判别:iframes 窗内触→云存活续漂零迸气;窗清后触→照常结算迸气（:12636 内门早退语义）', () => {
    const foe = Enemy.fromVanilla(3, 995, 995)!;
    foe.id = 4305;
    const game = unitGame([foe]);
    const gasDmg: number[] = [];
    const c = new SporeSacCloud(990, 990, SPORE_CLOUD_A, 70, 1.5, 1,
      (_x: number, _y: number, _vx: number, _vy: number, dmg: number) => { gasDmg.push(dmg); });
    foe.iframes = 3;
    for (let i = 0; i < 3; i++) {
      c.fixedUpdate(1 / 60, game);
      foe.iframes--;                       // 原版 npc.immune[owner] 逐 tick 递减同构
    }
    expect(foe.hp).toBe(foe.maxHp);        // 窗内零结算（hurt 拒收零伤）
    expect(gasDmg).toEqual([]);            // 空爆零迸气（曾=气团带同伤参数迸出,M1 红）
    expect(c.dead).toBe(false);            // 云存活续漂（曾=hit 无条件发→云亡,M1 红）
    c.fixedUpdate(1 / 60, game);           // 窗清（iframes==0）→ 内门放行 → 照常结算
    expect(c.dead).toBe(true);             // penetrate 1 耗尽 Kill（:74317 ai1==0 支）
    expect(gasDmg).toEqual([70]);          // 迸气同伤透传（:74321）
    expect(foe.iframes).toBe(0);           // 云命中三不写（拍板#1A——不开全局窗）
  });

  it('hurt 已实扣 false 返（371 泡泡血尽转引信,Enemy.ts:14296 特支 return false）仍计击——守卫锚:布尔返=击杀语义,勿改作拒收判别（M3 变异 → 红）', () => {
    const foe = Enemy.fromVanilla(371, 995, 995)!;   // 猪鲨爆裂泡泡 lifeMax=1
    foe.id = 4306;
    foe.hp = 1;
    const game = unitGame([foe]);
    const gasDmg: number[] = [];
    const c = new SporeSacCloud(990, 990, SPORE_CLOUD_A, 70, 1.5, 1,
      (_x: number, _y: number, _vx: number, _vy: number, dmg: number) => { gasDmg.push(dmg); });
    c.fixedUpdate(1 / 60, game);
    // hurt 血尽转引信支（vanillaId 371 && ai0!==1 → return false）但实扣已发生
    // （lastStrikeDealt=70 已写）——原版 StrikeNPC 返 num41>0,onHit/penetrate/Kill 照发
    expect(c.dead).toBe(true);             // 若以 hurt 布尔返作拒收判别（M3）→ 误判拒收红
    expect(gasDmg).toEqual([70]);
  });

  it('气团命中不开全局窗（红蓝-L1② hitPierce=−2:命中不写帧=净等价原版 immune[owner]=0 清窗 :14035）', () => {
    const foe = Enemy.fromVanilla(3, 1000, 1000)!;
    foe.id = 4307;
    const game = unitGame([foe]);
    const gas = new SporeGasCloud(1000, 1000, 0, 0, 569, 1);
    gas.fixedUpdate(1 / 60, game);
    expect(foe.hp).toBe(foe.maxHp - 1);    // 伤照结（组窗首过,伤=1 防死判别）
    expect(foe.iframes).toBe(0);           // 不写帧（曾缺省 0 档写 10 → 其它 pierce=0 兵器被多开窗挡,②红）
  });

  it('气团被拒命中不落组账（内环门在 cd.ready 前=被拒不写行,原版组行写 :14036 在 StrikeNPC 后）——窗清后重试落地', () => {
    const foe = Enemy.fromVanilla(3, 1000, 1000)!;
    foe.id = 4308;
    const game = unitGame([foe]);
    const gas = new SporeGasCloud(1000, 1000, 0, 0, 569, 1);
    foe.iframes = 2;
    gas.fixedUpdate(1 / 60, game);         // 窗内:拒收（组窗未落账）
    gas.fixedUpdate(1 / 60, game);         // 重试仍拒（iframes 未清）
    foe.iframes = 0;
    gas.fixedUpdate(1 / 60, game);         // 窗清 → 落地
    expect(foe.hp).toBe(foe.maxHp - 1);    // M2（门移 cd.ready 后=被拒白吃组窗 10t ≈167ms）→ 三拍全拒红
    expect(foe.iframes).toBe(0);           // 气团命中不开全局窗（②联动）
  });

  it('keepIterating 截断（:14186-14201 penetrate 1→0 → false=stopAfterFirstHit）:重叠双敌只伤桶序首个', () => {
    const a = Enemy.fromVanilla(3, 995, 995)!;
    a.id = 4303;
    const b = Enemy.fromVanilla(3, 995, 995)!;
    b.id = 4304;
    const game = unitGame([a, b]);
    const c = new SporeSacCloud(990, 990, SPORE_CLOUD_A, 1, 1.5, 1);
    c.fixedUpdate(1 / 60, game);
    expect(a.hp).toBe(a.maxHp - 1);        // 首个中伤（damage 1 → damageVarRoll 恒 1）
    expect(b.hp).toBe(b.maxHp);            // 第二个本拍不结算——stopAfterFirstHit 摘除 → 双伤=红
    expect(c.dead).toBe(true);
  });
});

// ===========================================================================
// ⑥ 532 骨弹撞块弹反（HandleMovement :18259-18278）+ 937 弹反（:18602-18613）
// ===========================================================================
describe('SW-FX1⑥ 532/937 撞块弹反', () => {
  function bounceGame(): GameHooks {
    const w = new World(160, 200, 30, 'open');
    for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);   // 地表 y=3040
    return makeGame(w, []);
  }

  it('532 落地弹反：vy=5 → v.Y=−3.75 后 num18 保速归一 → |v|=|last|×0.75²（:18259-18278）', () => {
    const game = bounceGame();
    const b = new Arrow(400, 3020, 0, 5, 25, 5, 532);
    expect(b.pierce).toBe(3);                       // penetrate 3（json 数据面）
    let hitTiles = 0;
    (game as unknown as { hitTilesFx: () => void }).hitTilesFx = () => { hitTiles++; };
    for (let i = 0; i < 10 && b.vy > 0; i++) b.fixedUpdate(1 / 60, game);
    expect(b.vy).toBeLessThan(0);                   // 反弹上行
    expect(b.pierce).toBe(2);                       // penetrate--（:18275）
    expect(hitTiles).toBe(1);                       // HitTiles（:18277）
    // num18=|last|/|v|=5/3.75 → v=−3.75/(5/3.75)=−2.8125（保速公式 1:1）
    expect(b.vy).toBeCloseTo(-5 * 0.75 * 0.75, 6);
  });

  it('937 落地弹反：Y 撞 ×−0.95 + penetrate--（:18602-18613）', () => {
    const game = bounceGame();
    const g = new Arrow(400, 3020, 0, 5, 65, 7, 937);
    for (let i = 0; i < 10 && g.vy > 0; i++) g.fixedUpdate(1 / 60, game);
    expect(g.vy).toBeLessThan(0);
    expect(g.vy).toBeCloseTo(-5 * 0.95, 6);
    expect(g.pierce).toBe(2);
  });
});
