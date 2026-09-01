// 月总双魔法武器回归：
//   星云烈焰 634/635（AI_001 :51577-51762 + Kill :68745-68807）
//     · ai[1] 状态机：0 初始化（Item34）→ 1 搜敌（250/500 + 视线）→ 6 追踪
//       （vel=lerp(vel,朝向×6,1/30)）；贴脸 <20 即爆
//     · 直飞无重力（:54638 排除 634/635）；爆=50×50 AoE（penetrate −1）+ Item14
//     · 40×40 盒命中 → Kill 爆
//   月耀 645（AI_001 :54077-54137 + :16706 + Kill :68851）
//     · 天降直飞（vy 恒正）、Y 未过 ai[1] 线穿墙、过线撞块死
//     · 60px 内敌（视线）→ 爆炸相：140×140 盒、126 update（21t）Kill、每敌一次
//     · 直接命中同转爆炸（非即死）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { NebulaBlazeBolt, LunarFlareStar } from '../src/entities/LunarNebula';

function makeGame(w: World, list: unknown[] = []) {
  return {
    world: w,
    player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: (e: unknown, b: string) => { if (b !== 'projectiles') list.push(e); } },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

function mkEnemy(id: number, tx: number, ty: number, w = 24, h = 24) {
  return { id, x: tx * TILE, y: ty * TILE, w, h, dead: false, hurt: () => true };
}

describe('星云烈焰弹 634/635', () => {
  it('初始化 Item34 + 无敌直飞（无重力）', () => {
    const sfx: string[] = [];
    const game = makeGame(emptyWorld());
    (game as unknown as { playSfxFiles: (f: string[]) => void }).playSfxFiles =
      (f: string[]) => { sfx.push(f[0]); };
    const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 6, 0, 130, 3, 634);
    bolt.critChance = 0;
    bolt.fixedUpdate(1, game);
    expect(sfx).toContain('Item_34');                // ai[1] 0→1（:51604）
    for (let t = 0; t < 20 && !bolt.dead; t++) bolt.fixedUpdate(1, game);
    expect(bolt.dead).toBe(false);
    // ★R28：出手散射（Player.cs:49282-49296 num179≈±15.75° + 速度 ×[0.95,1.25]）
    // 后速度不再恒 (6,0),但模长锁定在带内且无重力漂移
    const spd = Math.hypot(bolt.vx, bolt.vy);
    expect(spd).toBeGreaterThanOrEqual(6 * 0.95 - 1e-6);
    expect(spd).toBeLessThanOrEqual(6 * 1.25 + 1e-6);
    const spd2 = Math.hypot(bolt.vx, bolt.vy);
    bolt.fixedUpdate(1, game);
    expect(Math.hypot(bolt.vx, bolt.vy)).toBeCloseTo(spd2, 6);   // 无重力
  });

  it('250 内锁定追踪：vel 向敌 lerp（1/30）', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    const en = mkEnemy(1, 88, 102);                  // 右侧 8 格=128px < 250，斜下 32px
    list.push(en);
    const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 6, 0, 130, 3, 634);
    bolt.critChance = 0;
    bolt.fixedUpdate(1, game);                       // 初始化 + 首搜锁定
    expect(Math.hypot(bolt.vx, bolt.vy)).toBeGreaterThanOrEqual(6 * 0.95 - 1e-6);   // ★R28 散射后非恒 (6,0)
    // ★R28：出手散射后初速可带 ±15.75° 的任意方向分量——转向断言改为端到端
    // 性质：锁敌 + lerp 追踪必须在 30t 内触及目标（接触命中消亡），与散射掷出的
    // 具体方向无关
    const hurtHits: number[] = [];
    en.hurt = () => { hurtHits.push(1); return true; };
    for (let t = 0; t < 30 && !bolt.dead; t++) bolt.fixedUpdate(1, game);
    expect(bolt.dead || hurtHits.length > 0).toBe(true);   // 追踪抵达目标
  });

  it('635 档搜索半径 500：更远也锁定', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    list.push(mkEnemy(1, 105, 100));                 // 25 格 = 400px：634 够不到，635 可以
    const bolt634 = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
    bolt634.critChance = 0;
    bolt634.fixedUpdate(1, game);
    for (let t = 0; t < 5 && !bolt634.dead; t++) bolt634.fixedUpdate(1, game);
    expect(bolt634.vx).toBe(0);                      // 未锁定（超出 250）
    const bolt635 = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 390, 3, 635);
    bolt635.critChance = 0;
    bolt635.fixedUpdate(1, game);
    for (let t = 0; t < 5 && !bolt635.dead; t++) bolt635.fixedUpdate(1, game);
    expect(bolt635.vx).toBeGreaterThan(0);           // 已锁定（<500）
  });

  it('贴脸 <20 即爆 + 50×50 AoE 结算邻近敌（penetrate −1）', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    const near = mkEnemy(1, 81, 100);                // 11px 距 < 20 → 搜敌即爆
    const beside = mkEnemy(2, 82, 100);              // 盒缘内（1300±25 覆盖 1312）
    const hits: number[] = [];
    for (const e of [near, beside]) {
      (e as { hurt: () => boolean }).hurt = () => { hits.push((e as { id: number }).id); return true; };
    }
    list.push(near, beside);
    const bolt = new NebulaBlazeBolt(80 * TILE, 100 * TILE, 0, 0, 130, 3, 634);
    bolt.critChance = 0;
    bolt.fixedUpdate(1, game);                       // 搜敌 bd<20 → Kill 爆
    expect(bolt.dead).toBe(true);
    expect(hits).toEqual([1, 2]);                    // AoE 全Overlap（Damage() penetrate −1）
  });
});

describe('月耀星 645', () => {
  it('直飞无重力 + 未过线穿墙 / 过线撞块亡', () => {
    const w = emptyWorld();
    // 星正下方墙列（x=96，y 60..120）
    for (let y = 60; y < 120; y++) w.store.setTileSilent(96, y, 1, 0, 0);
    // 星 A：线在墙下方（y 过墙段时未过线 → 穿墙）
    const a = new LunarFlareStar(96 * TILE, 60 * TILE, 0, 5, 100, 4.5, 150 * TILE);
    for (let t = 0; t < 60 && !a.dead; t++) a.fixedUpdate(1, game0(w));
    expect(a.dead).toBe(false);                      // 穿过墙列（ai[1] 线未到）
    expect(a.vy).toBe(5);                            // 无重力直落
    // 星 B：线在墙内（过线 → 撞块死）
    const b = new LunarFlareStar(96 * TILE, 60 * TILE, 0, 5, 100, 4.5, 70 * TILE);
    for (let t = 0; t < 80 && !b.dead; t++) b.fixedUpdate(1, game0(w));
    expect(b.dead).toBe(true);                       // y>线 → tileCollide 开 → 撞墙列
  });

  it('60px 内敌 → 爆炸相：140 盒单次结算 + 21t 消亡', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    const en = mkEnemy(1, 82, 100, 40, 40);          // 中心距 ~32px < 60
    let hits = 0;
    (en as { hurt: () => boolean }).hurt = () => { hits++; return true; };
    list.push(en);
    const star = new LunarFlareStar(80 * TILE, 100 * TILE, 0, 0, 100, 4.5, 200 * TILE);
    star.critChance = 0;
    star.fixedUpdate(1, game);                       // 首 update 搜敌 → 爆炸 → 盒结算
    expect(hits).toBe(1);                            // 140 盒首结算
    for (let t = 0; t < 21 && !star.dead; t++) star.fixedUpdate(1, game);
    expect(hits).toBe(1);                            // localNPCHitCooldown=−1 每敌一次
    expect(star.dead).toBe(true);                    // 126 update = 21t
  });

  function game0(w: World): GameHooks { return makeGame(w); }
});
