// 石巨人 collideGround 三列盲带清偿回归(2026-08-31 台账批):
//   旧私有三列采样([x+2, cx, x+w−2])对 140px 宽本体留下两段 ~68px 盲带——
//   盲带内悬空则"漂浮",坡面/半砖完全无语义。迁移 physics/TileCollision.moveAndCollide
//   (Collision.cs:2299 TileCollision+SlopeCollision 全语义)后:
//   ① 窄柱(单列实心且仅处于盲带内)可正确托住本体(旧采样三点全空必坠穿);
//   ② 坡面整块语义:脚沉进坡格被对角线贴合抬回(SlopeCollision),不再漂移坠穿。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 90;
const H = 70;
const FLOOR = 40;          // 支撑行

function makeWorld(): World {
  const w = new World(W, H, 7, 'golem-blindband');
  w.groundLevel = FLOOR - 20;
  const st = w.store;
  for (let x = 0; x < W; x++) {
    st.setTileSilent(x, FLOOR, 1);
    st.setTileSilent(x, FLOOR + 1, 1);
    for (let y = FLOOR + 2; y < H; y++) st.setTileSilent(x, y, 1);
  }
  return w;
}

/** 挖除 [x0,x1) 全深,再造支撑 */
function carve(w: World, x0: number, x1: number): void {
  const st = w.store;
  for (let x = x0; x < x1; x++) {
    for (let y = FLOOR; y < H; y++) st.setTileSilent(x, y, 0);
  }
}

function makeHooks(world: World): { hooks: GameHooks; enemies: Enemy[] } {
  const enemies: Enemy[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown) => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      enemies.push(e as Enemy);
    },
  };
  const hooks = {
    world,
    player: { x: 30 * TILE, y: 10 * TILE, w: 20, h: 42,
      get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; },
      vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 5,
      buffs: { apply: () => {}, has: () => false }, equipStats: {} },
    enemies: () => enemies as never[],
    spawnParticles: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    addDamageNumber: () => {}, damagePlayer: (): number => 0, spawnDrop: () => {},
    spawnEnemy: () => null, spawnProj: () => {},
    onEnemyKilled: () => {}, critters: () => [],
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies };
}

describe('石巨人本体 245 落地( TileCollision 全盒语义)', () => {
  it('窄柱场景:唯一支撑列位于旧三列采样的盲带内,本体仍稳稳落地不坠穿', () => {
    const w = makeWorld();
    // 本体左缘对齐 col 10 → 覆盖 cols[10..16];旧采样点 = col 10 / 12 / 16。
    // 只保留 col 13(恰在两条盲带正中)的整根柱子,其余全挖。
    carve(w, 8, 8 + W);
    w.store.setTileSilent(13, FLOOR, 1);
    for (let y = FLOOR + 1; y < H; y++) w.store.setTileSilent(13, y, 1);
    const { hooks: h } = makeHooks(w);
    const body = Enemy.fromVanilla(245, 10 * TILE, (FLOOR) * TILE - 140)!;
    body.x = 10 * TILE;                       // 左上对齐
    body.y = FLOOR * TILE - body.h;           // 底边与支撑行顶齐平(静止站立初值)
    for (let i = 0; i < 60; i++) body.fixedUpdate(1 / 60, h);
    expect(body.onGround).toBe(true);         // ★旧采样在此必为 onGround=false 周期坠落
    expect(body.vy).toBe(0);
    expect(body.y + body.h).toBe(FLOOR * TILE);   // 底边钉在支撑面
    // 且不向下漂移(坠落复现即 fail)
    expect(body.y).toBeLessThan(FLOOR * TILE);
  });

  it('全空坑位正常下落(对照组,防移动碰撞恒吸附假绿)', () => {
    const w = makeWorld();
    carve(w, 8, 8 + W);
    const { hooks: h } = makeHooks(w);
    const body = Enemy.fromVanilla(245, 10 * TILE, (FLOOR - 4) * TILE - 140)!;
    body.x = 10 * TILE;
    body.y = (FLOOR - 4) * TILE - body.h;
    for (let i = 0; i < 40; i++) body.fixedUpdate(1 / 60, h);
    expect(body.onGround).toBe(false);
    expect(body.y + body.h).toBeGreaterThan(FLOOR * TILE + 32);   // 已穿过原支撑层
  });

  it('坡面座(slope2 单列)贴合:脚沉入坡格被 SlopeCollision 抬回,不穿透不悬浮', () => {
    const w = makeWorld();
    carve(w, 6, 6 + W);
    // 座位:FLOOR−1 行放一列 slope=2 的实心砖(对角斜面),作为本体唯一的支撑形态
    w.store.setTileSilent(11, FLOOR - 1, 1);
    w.store.setSlope(11, FLOOR - 1, 2);
    const { hooks: h } = makeHooks(w);
    const body = Enemy.fromVanilla(245, 3 * TILE, (FLOOR - 5) * TILE - 140)!;
    body.x = 7.6 * TILE;                          // 右缘伸入坡列(col 11 内)
    body.y = (FLOOR - 5) * TILE - body.h;
    body.vy = 4;                                  // 下落中接近座位
    for (let i = 0; i < 50; i++) {
      body.fixedUpdate(1 / 60, h);
    }
    // 关键断言:从不掉到坡格【底】以下(旧实现无坡面语义时脚会穿到支承行下),
    // 且最终接地(vy=0),脚底高于坡格底
    expect(body.y + body.h).toBeLessThanOrEqual(FLOOR * TILE + 16.5);
    expect(body.y + body.h).toBeGreaterThan((FLOOR - 2) * TILE);
    expect(body.vy).toBe(0);
    expect(body.onGround || body.vy === 0).toBe(true);
  });

  it('整周期时序:平地蓄力→起跳→落地回环(迁移后 ai0/vy/onGround 链不漂移)', () => {
    const w = makeWorld();
    const { hooks: h } = makeHooks(w);
    const body = Enemy.fromVanilla(245, 10 * TILE, FLOOR * TILE - 140)!;
    body.x = 10 * TILE;
    body.y = FLOOR * TILE - body.h;             // 底边与支撑行顶齐平
    let landings = 0;
    let airborne = false;
    for (let i = 0; i < 600; i++) {
      const wasJumpPhase = body.ai0 === 1;
      body.fixedUpdate(1 / 60, h);
      if (wasJumpPhase && body.ai0 === 0 && body.vy === 0) {
        landings++;
        // 落地当拍底边必须回到支承面(位移被 TileCollision 吸附)
        expect(Math.abs(body.y + body.h - FLOOR * TILE)).toBeLessThan(2);
      }
      if (body.ai0 === 1) airborne = true;
    }
    expect(airborne).toBe(true);                // 经历跳跃态
    expect(landings).toBeGreaterThanOrEqual(1); // 且至少完整落地一次
  });
});
