// 下落沙族回归(原版 SandBallFalling 系,AI_010):
// 失去支撑 → FallingBlock 坠落(重力 0.3/tick)→ 落地变回 tile;命中实体 10 伤害。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { FallingBlock } from '../src/entities/FallingBlock';
import type { GameHooks } from '../src/entities/types';

function makeGame(): { game: GameHooks; world: World; dmg: number[]; drops: Array<[string, number, number]> } {
  const world = new World(64, 32, 42, '测试');
  const dmg: number[] = [];
  const drops: Array<[string, number, number]> = [];   // [key, x, y]（终审④ 掉件面断言用）
  const game = {
    world,
    player: null,
    enemies: () => [],
    critters: () => [],
    spawnDrop: (x: number, y: number, key: string): null => { drops.push([key, x, y]); return null; },
    damagePlayer: (d: number): number => { dmg.push(d); return 0; },
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
  } as unknown as GameHooks;
  return { game, world, dmg, drops };
}

describe('FallingBlock', () => {
  /** 清空列段（世界为带种子真实地形,断言列须排除生成残留） */
  const clearCol = (w: World, x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) w.store.setTile(x, y, 0, 0, 0);
  };

  it('坠落并在实心格上变回沙块 tile（原版:放置格=弹回后中心格=实心上方空格）', () => {
    const { game, world } = makeGame();
    // 地面在 y=20;沙块从 y=16 开始坠
    clearCol(world, 32, 10, 19);
    world.store.setTile(32, 20, TILE_BY_KEY['dirt']!, 0, 0);
    const SAND = TILE_BY_KEY['sand']!;
    const fb = new FallingBlock(32 * 16 + 3, 16 * 16 + 3, 'sand');
    for (let i = 0; i < 120; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    // 原版 Kill aiStyle==10（Projectile.cs:79117-79310）:TileCollision 把弹体挡在
    // 实心外,Kill 时中心格=实心上方空格 → PlaceTile 成功=下落沙【重新堆起】。
    // ★修正史:初版"向上扫空位"悬空叠草(2026-08-24 用户报)→二版过度修正成
    // "永不落格"（本测试旧断言即其产物）;2026-08-25 按上一帧中心格落格=原版语义。
    expect(world.store.get(32, 19)).toBe(SAND);
    expect(world.store.get(32, 20)).toBe(TILE_BY_KEY['dirt']!);
  });

  it('穿过空隙落到更低地面', () => {
    const { game, world } = makeGame();
    clearCol(world, 33, 10, 23);
    world.store.setTile(33, 24, TILE_BY_KEY['stone']!, 0, 0);
    const fb = new FallingBlock(33 * 16 + 3, 10 * 16 + 3, 'sand');
    for (let i = 0; i < 240; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    expect(world.store.get(33, 23)).toBe(TILE_BY_KEY['sand']!);
    expect(world.store.get(33, 24)).toBe(TILE_BY_KEY['stone']!);
  });

  it('落点格被占（草苗）→ 不放置,掉兜底件 169（原版 :79298-79301 outer else,num18>0）', () => {
    const { game, world, drops } = makeGame();
    clearCol(world, 32, 10, 18);
    world.store.setTile(32, 20, TILE_BY_KEY['dirt']!, 0, 0);
    world.store.setTile(32, 19, TILE_BY_KEY['v_3_forest_short_plants']!, 0, 0);   // 草苗占据落点格（★本仓 id 域,勿用原版 3=本仓草块）
    const fb = new FallingBlock(32 * 16 + 3, 16 * 16 + 3, 'sand');
    for (let i = 0; i < 120; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    expect(world.store.get(32, 19)).toBe(TILE_BY_KEY['v_3_forest_short_plants']!); // 草苗原样
    expect(world.store.get(32, 18)).toBe(0);            // 无悬空叠放
    expect(world.store.get(32, 20)).toBe(TILE_BY_KEY['dirt']!);
    // ★终审④：被占 → outer else :79298-79301 RequestNewItem(Center)——num18=169
    //  （沙 tile 53 → 弹 31 default 档,ai[0]=1 → 169）,锚=钳位中心=面顶-5
    expect(drops.length).toBe(1);
    expect(drops[0][0]).toMatch(/^vi_169_/);
    expect(drops[0][2]).toBe(20 * 16 - 5);
  });

  // ★终审④（2026-09-04）平台落格翻案：BlockBelowMakesSandFall（WorldGen.cs:87884-87887）
  //  arm2 第二半 `!Main.tileSolid[tile.type]`——平台 19 tileSolid=true（Main.cs:8031-8032）
  //  → 平台=正牌支撑（arm2 false）,死亡格下方 active 且非 rail/传送带/BBMSF →
  //  :79274-79277 PlaceTile(forced) 正常放置。旧断言"平台下悬空 → 不放"系
  //  "def.solid||def.platform" 朴素 BBMSF 近似产物（arm2 误真）,按反编译翻转;
  //  TileFrame 触发侧（WorldGen.cs:82657 → SpawnFallingBlockProjectile :87328）
  //  同门同判 → 放置后不回塌,无循环。
  it('平台落格（BBMSF 1:1）:平台=tileSolid 支撑 → 正常放置（原版 arm2 平台支不塌）', () => {
    const { game, world, drops } = makeGame();
    clearCol(world, 32, 10, 19);
    world.store.setTile(32, 20, TILE_BY_KEY['platform']!, 0, 0);   // 平台,下方全空
    const SAND = TILE_BY_KEY['sand']!;
    const fb = new FallingBlock(32 * 16 + 3, 16 * 16 + 3, 'sand');
    for (let i = 0; i < 120; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    expect(world.store.get(32, 19)).toBe(SAND);   // 平台上放置（arm2 平台支不塌）
    expect(world.store.get(32, 20)).toBe(TILE_BY_KEY['platform']!);
    expect(drops).toEqual([]);
  });

  // ★终审④：半砖落面——TileCollision 碰撞盒折半（Collision.cs:2350-2354 vector4.Y+=8）
  //  → 钳位中心=面顶+8-5 ∈ 半砖格内 → 死亡格=半砖格本身（:79243 半砖上移支
  //  velocity.Y 已被 TileCollision 清 0=死支）→ 格 active 走 outer else 掉件
  it('半砖落面:死亡格=半砖格本身 → 不叠放,掉兜底件 169（Center 锚=面顶+3）', () => {
    const { game, world, drops } = makeGame();
    clearCol(world, 32, 10, 19);
    world.store.setTile(32, 20, TILE_BY_KEY['dirt']!, 0, 0);
    world.store.half[world.store.idx(32, 20)] = 1;                 // 半砖土面
    const fb = new FallingBlock(32 * 16 + 3, 16 * 16 + 3, 'sand');
    for (let i = 0; i < 120; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    expect(world.store.get(32, 19)).toBe(0);            // 半砖上方不叠放
    expect(world.store.get(32, 20)).toBe(TILE_BY_KEY['dirt']!);
    expect(world.store.half[world.store.idx(32, 20)]).toBe(1);
    expect(drops.length).toBe(1);
    expect(drops[0][0]).toMatch(/^vi_169_/);
    expect(drops[0][2]).toBe(20 * 16 + 8 - 5);          // 钳位中心=面顶+8−5（Collision.cs:2350-2354）
  });

  // ★终审④：flag2=死亡格下方 active 且 BBMSF（:79268）——家具（tileSolid=false,
  //  tileSolidTop=true）悬空时 arm2 真 → 不放置仍掉件（Center+(0,-2) :79293-79296）
  it('悬空工作台落面:BBMSF arm2 → flag2 → 不放置,掉兜底件 169（Center+(0,-2) 锚）', () => {
    const { game, world, drops } = makeGame();
    clearCol(world, 32, 10, 19);
    world.store.setTileSilent(32, 20, TILE_BY_KEY['workbench']!, 0, 0);   // 工作台（sheet18,tileSolid=false）,下方全空
    const fb = new FallingBlock(32 * 16 + 3, 16 * 16 + 3, 'sand');
    for (let i = 0; i < 120; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    expect(world.store.get(32, 19)).toBe(0);            // 不放置
    expect(world.store.get(32, 20)).toBe(TILE_BY_KEY['workbench']!);
    expect(drops.length).toBe(1);
    expect(drops[0][0]).toMatch(/^vi_169_/);
    expect(drops[0][2]).toBe(20 * 16 - 5 - 2);          // Center+(0,-2)（:79295）
  });

  it('落地工作台落面:下方再下一格 nactive → BBMSF arm2 假 → 正常放置台上', () => {
    const { game, world, drops } = makeGame();
    clearCol(world, 32, 10, 19);
    world.store.setTileSilent(32, 20, TILE_BY_KEY['workbench']!, 0, 0);
    world.store.setTile(32, 21, TILE_BY_KEY['stone']!, 0, 0);
    const SAND = TILE_BY_KEY['sand']!;
    const fb = new FallingBlock(32 * 16 + 3, 16 * 16 + 3, 'sand');
    for (let i = 0; i < 120; i++) {
      if (fb.dead) break;
      fb.fixedUpdate(1 / 60, game);
    }
    expect(fb.dead).toBe(true);
    expect(world.store.get(32, 19)).toBe(SAND);         // 台上放置（arm2 下方再下一格 nactive → 假）
    expect(world.store.get(32, 20)).toBe(TILE_BY_KEY['workbench']!);
    expect(drops).toEqual([]);
  });

  it('命中玩家:EVP 链经典 20（基础 10×乘区1×2）且每块只结算一次', () => {
    const { game, dmg } = makeGame();
    const player = { x: 32 * 16, y: 10 * 16, w: 20, h: 42, dead: false } as never;
    (game as unknown as { player: unknown }).player = player;
    const fb = new FallingBlock(32 * 16 + 3, 10 * 16 + 3, 'sand');
    fb.fixedUpdate(1 / 60, game);
    fb.fixedUpdate(1 / 60, game);
    // 2026-08-21 缺口类清偿：Damage_EVP（Projectile.cs:13770-13781）难度乘区×通用×2
    expect(dmg).toEqual([FallingBlock.DAMAGE * 2]);
  });

  // ★M13 B-2（2026-09-04）常量对齐 AI_010：重力 0.41（Projectile.cs:58999-59002
  //  ai[0]==1 支）、vy 封顶 10（:59075-59082 非 736-738 支）、rot+0.1（:59077）、
  //  出生初速 0.41（SpawnFallingBlockProjectile WorldGen.cs:87355 NewProjectile 0f,
  //  0.41f + :87358 ai[0]=1f → 首拍 AI_010 再 +0.41=0.82）。旧值 0.3/cap16/rot0.25
  //  系 aiStyle 2 通用重力近似。★死亡格恒等式（本文件例 1-7 落点断言即其重产）：
  //  单拍位移 <格宽 16px ⇒ 上一帧中心格至多高出现帧中心格 1 格 ⇒ 落地放置格=死亡面
  //  上一格恒等（cap10<16 收紧,对 [0,16) 一切 vy 成立,与重力系数无关）。
  it('B-2 常量:初速 0.41→首拍 0.82、重力 0.41、vy 封顶 10、rot+0.1', () => {
    expect(FallingBlock.GRAV).toBe(0.41);
    expect(FallingBlock.VY_CAP).toBe(10);
    expect(FallingBlock.SPAWN_VY).toBe(0.41);
    expect(FallingBlock.DAMAGE).toBe(10);            // GetSandfallProjData 缺省档 :87798
    const { game, world } = makeGame();
    clearCol(world, 32, 0, 31);                      // 全空列:不落地,量测速度序列
    const fb = new FallingBlock(32 * 16 + 3, 2 * 16 + 3, 'sand');
    expect(fb.vy).toBe(0.41);                        // :87355 出生初速
    const vys: number[] = [];
    const rots: number[] = [];
    for (let i = 0; i < 40 && !fb.dead; i++) {
      fb.fixedUpdate(1 / 60, game);
      vys.push(fb.vy);
      rots.push(fb.rot);
    }
    expect(vys[0]).toBeCloseTo(0.82, 5);             // 首拍 0.41+0.41（ai[0]=1 预置同款）
    expect(vys[1]).toBeCloseTo(1.23, 5);             // 0.82+0.41
    expect(vys[2]).toBeCloseTo(1.64, 5);
    expect(Math.max(...vys)).toBe(10);               // :59078-59081 封顶 10（旧 16）
    expect(rots[0]).toBeCloseTo(0.1, 5);             // :59077 rot+=0.1（旧 0.25）
  });

  it('B-2 落地几何恒等（cap10<16）:直落弹死亡格=上一帧中心格,放置在死亡面上一格', () => {
    // 高速段（封顶 10）坠落 20 格后落地面:放置格=死亡面上一格（例 1/2 的长距版）
    const { game, world } = makeGame();
    clearCol(world, 34, 0, 30);
    world.store.setTile(34, 31, TILE_BY_KEY['stone']!, 0, 0);
    const fb = new FallingBlock(34 * 16 + 3, 1 * 16 + 3, 'sand');
    for (let i = 0; i < 300 && !fb.dead; i++) fb.fixedUpdate(1 / 60, game);
    expect(fb.dead).toBe(true);
    expect(world.store.get(34, 30)).toBe(TILE_BY_KEY['sand']!);   // 死亡面(31)上一格
    expect(world.store.get(34, 31)).toBe(TILE_BY_KEY['stone']!);
  });
});
