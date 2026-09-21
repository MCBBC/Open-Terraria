// ★BJ229 魔法弹撞块反弹族 1:1 回归（用户实报"水晶风暴/水矢撞墙即消失"）：
//   · aiStyle 8 反射族（HandleMovement aiStyle8 支 Projectile.cs:19688-19725）：
//     15 火球/27 水矢/95 诅咒焰/253 冰球/258 火焰弹——每撞 Item_10 音 + ai[0]++，
//     达帽（15=6/253=8/余 5;27 熔岩态 7 挂 P2 恒 5）→ position+=velocity+Kill；
//     未达帽逐轴全速反 lastVelocity（分轴独立,角撞双反）
//   · aiStyle 24 水晶风暴 94（HandleMovement type 段 :18811-18819）：无限次逐轴
//     全速反射,无音/无尘/无计数,penetrate 不因撞块消耗
//   · 96 诅咒焰(敌)被 `type != 96` 显式排除=撞块消亡（对照不误反弹）
//   · 普通箭 1 撞块消亡（通用杀口对照）
import { describe, it, expect } from 'vitest';
import { Arrow } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

function makeGame(w: World, sfxLog: string[][], list: unknown[] = []) {
  return {
    world: w,
    player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: (f: string[]) => { sfxLog.push(f); }, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(120, 120, 30, 'open');
  for (let x = 0; x < 120; x++) w.store.setTileSilent(x, 100, 1, 0, 0);   // 地面 y=100
  return w;
}

/** 竖直实心墙柱（x 列,y ∈ [yTop,yBot]） */
function wallColumn(w: World, x: number, yTop: number, yBot: number): void {
  for (let y = yTop; y <= yBot; y++) w.store.setTileSilent(x, y, 1, 0, 0);
}

describe('BJ229 aiStyle 8 反射族（水矢/水晶风暴/诅咒焰…）撞墙反弹', () => {
  it('水矢 27 撞墙：vx 全速镜像 + 继续飞 + Item_10 音', () => {
    const w = emptyWorld();
    const sfx: string[][] = [];
    const game = makeGame(w, sfx);
    wallColumn(w, 60, 85, 99);                       // 右墙 x=60
    const wb = new Arrow(55 * TILE, 94 * TILE, 4.5, 0, 100, 2, 27, { grav: 0, life: 1800 });
    let guard = 0;
    while (wb.vx > 0 && !wb.dead && guard++ < 400) wb.fixedUpdate(1, game);
    expect(wb.dead).toBe(false);                     // 不再撞墙即消失
    expect(wb.vx).toBeLessThan(0);                   // 全速镜像（:19721-19723 −lastVelocity）
    expect(Math.abs(wb.vx)).toBeCloseTo(4.5, 5);     // 无衰减
    expect(sfx.length).toBe(1);                      // Item_10（:19689）
    expect(sfx[0]).toEqual(['Item_10']);
    const xAfter = wb.x;
    for (let t = 0; t < 10; t++) wb.fixedUpdate(1, game);
    expect(wb.x).toBeLessThan(xAfter);               // 继续飞（反射后离墙）
  });

  it('水矢 27 反射计数：走廊 5 撞耗尽 → position+=velocity + Kill + 5 声', () => {
    const w = emptyWorld();
    const sfx: string[][] = [];
    const game = makeGame(w, sfx);
    wallColumn(w, 50, 85, 99);                       // 左墙
    wallColumn(w, 60, 85, 99);                       // 右墙
    const wb = new Arrow(55 * TILE, 94 * TILE, 4.5, 0, 100, 2, 27, { grav: 0, life: 1800 });
    let guard = 0;
    while (!wb.dead && guard++ < 2000) wb.fixedUpdate(1, game);
    expect(wb.dead).toBe(true);                      // ai[0]>=5 → Kill（:19704-19708）
    expect(wb.ai8Bounces).toBe(5);                   // 第 5 撞耗尽
    expect(sfx.length).toBe(5);                      // 每撞一声（含末撞）
    // 走廊 bounds：全程未穿墙
    expect(wb.cx).toBeGreaterThanOrEqual(50 * TILE);
    expect(wb.cx).toBeLessThan(61 * TILE);
  });

  it('水晶风暴 94 无限反射：多次反弹不消亡/无声/计数不动', () => {
    const w = emptyWorld();
    const sfx: string[][] = [];
    const game = makeGame(w, sfx);
    wallColumn(w, 50, 85, 99);
    wallColumn(w, 57, 85, 99);                       // 6 格窄走廊 → 120t 内多次反弹
    const cs = new Arrow(53 * TILE - 4, 94 * TILE, 16, 0, 100, 2, 94, { grav: 0, life: 600 });
    let flips = 0;
    let lastSign = Math.sign(cs.vx);
    for (let t = 0; t < 120 && !cs.dead; t++) {      // <130（aiStyle 24 缩径杀前）
      cs.fixedUpdate(1, game);
      const s = Math.sign(cs.vx);
      if (s !== 0 && s !== lastSign) { flips++; lastSign = s; }
    }
    expect(cs.dead).toBe(false);                     // 无限反弹（:18811-18819 无计数）
    expect(flips).toBeGreaterThanOrEqual(6);         // 远超 aiStyle 8 族 5 次帽
    expect(cs.ai8Bounces).toBe(0);                   // 94 无计数
    expect(sfx.length).toBe(0);                      // 无音（:18811-18819 无 PlaySound）
    expect(cs.vx).not.toBe(0);                       // 速度保持（0.985 阻力外无衰减面）
  });

  it('同族抽查：95 诅咒焰计数 5 耗尽（竖直落地弹跳）', () => {
    const w = emptyWorld();
    const sfx: string[][] = [];
    const game = makeGame(w, sfx);
    const cf = new Arrow(55 * TILE, 96 * TILE, 0, 3, 100, 2, 95, { grav: 0, life: 3600 });
    let guard = 0;
    while (!cf.dead && guard++ < 1000) cf.fixedUpdate(1, game);
    expect(cf.dead).toBe(true);
    expect(cf.ai8Bounces).toBe(5);                   // 默认帽 5
    expect(sfx.length).toBe(5);
  });

  it('同族抽查：253 冰球帽 8（第 8 撞消亡,第 7 撞存活）', () => {
    const w = emptyWorld();
    const sfx: string[][] = [];
    const game = makeGame(w, sfx);
    wallColumn(w, 50, 85, 99);
    wallColumn(w, 60, 85, 99);
    const fb = new Arrow(55 * TILE, 94 * TILE, 6, 0, 100, 2, 253, { grav: 0, life: 3600 });
    let guard = 0;
    while (!fb.dead && fb.ai8Bounces < 7 && guard++ < 2000) fb.fixedUpdate(1, game);
    expect(fb.dead).toBe(false);                     // 第 7 撞存活（帽 8）
    expect(fb.ai8Bounces).toBe(7);
    while (!fb.dead && guard++ < 3000) fb.fixedUpdate(1, game);
    expect(fb.dead).toBe(true);                      // 第 8 撞耗尽（:19701-19702 case 253 → 8）
    expect(fb.ai8Bounces).toBe(8);
  });

  it('对照：96 诅咒焰(敌)与普通箭 1 撞块即消亡（不误反弹）', () => {
    const w = emptyWorld();
    const sfx: string[][] = [];
    const game = makeGame(w, sfx);
    wallColumn(w, 60, 85, 99);
    // 96 被 `type != 96`（:19688）排除 → 通用杀口
    const hostile96 = new Arrow(55 * TILE, 94 * TILE, 4.5, 0, 100, 2, 96,
      { grav: 0, life: 600, hostile: true });
    let guard = 0;
    while (!hostile96.dead && guard++ < 400) hostile96.fixedUpdate(1, game);
    expect(hostile96.dead).toBe(true);
    expect(sfx.length).toBe(0);                      // 消亡不走反弹音
    // 普通箭 1：通用杀口对照
    const arrow = new Arrow(55 * TILE, 94 * TILE, 4.5, 0, 100, 2, 1, { grav: 0, life: 600 });
    guard = 0;
    while (!arrow.dead && guard++ < 400) arrow.fixedUpdate(1, game);
    expect(arrow.dead).toBe(true);
  });
});
