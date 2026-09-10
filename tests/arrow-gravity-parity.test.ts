// AI_001 重力链对账（2026-08-14；Projectile.cs :53083-53173 flag3 表 / :53881-54698
// 重力 else-if 链 / :54871-54887 终端 16）：
//   · 默认档：ai[0]≥15 update 后 vy+=0.1/update（箭族 15t 平飞缓坠）
//   · flag3 豁免（ai[0] 冻结）：子弹/光束族直线（5/14/20/88/638/684/639…）
//   · 顶层链命中（357/207/837…）与链尾排除（239/264/675、437/477）无默认重力
//   · 逐型档：91=0.07@20、172=0.085@17、267/478/479=0.075@20、275/276=0.025@35、
//     507/508/662/680/685=0.3@60、495=0.04@30、195/1097=0.15@40…
//   · 686/711 两段式：≥10 +0.1、≥20 再 +0.1、vx×0.99/update
//   · 终端 vy=16（flag7，577 除外）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Arrow } from '../src/entities/Arrow';
import { projGravSpec } from '../src/data/vanillaItemCombat';

function makeGame(w: World): GameHooks {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

describe('projGravSpec 规格表（AI_001 重力链）', () => {
  it('默认档：普通箭 0.1@15', () => {
    for (const p of [1, 2, 4, 41, 103, 474]) {
      expect(projGravSpec(p)).toEqual({ grav: 0.1, delay: 15 });
    }
  });

  it('flag3 豁免：子弹/特殊族直线（grav 0；639/1006 有专属档另测）', () => {
    for (const p of [5, 14, 20, 36, 88, 248, 283, 442, 638, 684, 709, 876, 981]) {
      expect(projGravSpec(p).grav).toBe(0);
    }
  });

  it('顶层链命中 / 链尾排除：无默认重力', () => {
    for (const p of [357, 207, 837, 645, 312, 239, 264, 675, 437, 477]) {
      expect(projGravSpec(p).grav).toBe(0);
    }
  });

  it('逐型自带重力档', () => {
    expect(projGravSpec(91)).toEqual({ grav: 0.07, delay: 20 });
    expect(projGravSpec(174)).toEqual({ grav: 0.15, delay: 5 });
    expect(projGravSpec(937)).toEqual({ grav: 0.07, delay: 5 });
    expect(projGravSpec(172)).toEqual({ grav: 0.085, delay: 17 });
    expect(projGravSpec(267)).toEqual({ grav: 0.075, delay: 20 });
    expect(projGravSpec(478)).toEqual({ grav: 0.075, delay: 20 });
    expect(projGravSpec(275)).toEqual({ grav: 0.025, delay: 35 });
    expect(projGravSpec(495)).toEqual({ grav: 0.04, delay: 30 });
    expect(projGravSpec(195)).toEqual({ grav: 0.15, delay: 40 });
    expect(projGravSpec(507)).toEqual({ grav: 0.3, delay: 61 });   // 原版严格 >60（:54589）→ ≥ 等价 61
    expect(projGravSpec(662)).toEqual({ grav: 0.3, delay: 61 });
    expect(projGravSpec(498)).toEqual({ grav: 0.15, delay: 50 });   // flag3 内但分支自计数
  });

  it('686/711 两段式 + vx 衰减', () => {
    const g = projGravSpec(711);
    expect(g.grav).toBe(0.1);
    expect(g.delay).toBe(10);
    expect(g.grav2).toBe(0.1);
    expect(g.grav2At).toBe(20);
    expect(g.drag).toBe(0.99);
  });

  it('非 aiStyle-1：503(ai5)/985(ai191)/451(ai81) 不在本链', () => {
    expect(projGravSpec(503).grav).toBe(0);
    expect(projGravSpec(985).grav).toBe(0);
    expect(projGravSpec(451).grav).toBe(0);
  });
});

describe('Arrow 重力仿真（subStep = per-update 语义）', () => {
  it('木箭 1：14 update 平飞，第 15（ai0=15）起缓坠 0.1/update，终端 16', () => {
    const game = makeGame(emptyWorld());
    const a = new Arrow(10 * TILE, 40 * TILE, 8, 0, 10, 1, 1, {});
    for (let t = 0; t < 14; t++) a.fixedUpdate(1, game);
    expect(a.vy).toBe(0);                       // ai0 1..14 < 15（:54686 `ai[0] >= 15f` ≥ 门，
    a.fixedUpdate(1, game);                     //  2026-08-22 修 off-by-one：第 15 update 即坠）
    expect(a.vy).toBeCloseTo(0.1, 6);
    for (let t = 0; t < 9; t++) a.fixedUpdate(1, game);
    expect(a.vy).toBeCloseTo(1.0, 6);           // 10 次累计
    for (let t = 0; t < 400 && a.vy < 16; t++) a.fixedUpdate(1, game);
    expect(a.vy).toBe(16);                      // flag7 终端
  });

  it('子弹 14（flag3）：全程直线不下坠', () => {
    const game = makeGame(emptyWorld());
    const b = new Arrow(10 * TILE, 40 * TILE, 8, 0, 10, 1, 14, {});
    for (let t = 0; t < 120 && !b.dead; t++) b.fixedUpdate(1, game);
    expect(b.vy).toBe(0);
  });

  it('箭 172：0.085@17（ai0=17 拍起 0.085/update）', () => {
    const game = makeGame(emptyWorld());
    const a = new Arrow(10 * TILE, 40 * TILE, 8, 0, 10, 1, 172, {});
    for (let t = 0; t < 16; t++) a.fixedUpdate(1, game);
    expect(a.vy).toBe(0);
    a.fixedUpdate(1, game);
    expect(a.vy).toBeCloseTo(0.085, 6);
  });

  it('711 两段式：ai0=10 起 +0.1、ai0=20 起 +0.2/update，vx ×0.99/update', () => {
    const game = makeGame(emptyWorld());
    const g = projGravSpec(711);
    const a = new Arrow(10 * TILE, 40 * TILE, 8, 0, 10, 1, 711,
      { grav: g.grav, gravDelay: g.delay, grav2: g.grav2, grav2At: g.grav2At, dragAlways: g.drag });
    // 711 extraUpdates=1（数据自带）→ 2 update/tick：ai0=10 在第 5 tick 末达成（≥ 门）
    for (let t = 0; t < 5; t++) a.fixedUpdate(1, game);
    expect(a.vy).toBeCloseTo(0.1, 6);           // update 10（age=10 ≥ 10）已施加重力 1 次
    a.fixedUpdate(1, game);                     // update 11、12 → 2×0.1
    expect(a.vy).toBeCloseTo(0.3, 6);
    for (let t = 0; t < 4; t++) a.fixedUpdate(1, game);   // 到 tick 10（update 20）
    expect(a.vy).toBeCloseTo(1.2, 6);           // update 20 起 ai0≥20 两段同拍叠加（+0.2）
    a.fixedUpdate(1, game);                     // update 21、22 → 每 update 0.1+0.1
    expect(a.vy).toBeCloseTo(1.6, 6);
    for (let t = 0; t < 5; t++) a.fixedUpdate(1, game);
    expect(a.vy).toBeCloseTo(3.6, 6);           // 之后每 update +0.2
    expect(a.vx).toBeLessThan(8 * Math.pow(0.99, 30));   // 恒定衰减（≥30 update）
  });

  it('飞镖 267（ammo 283）：0.075@20（ai0=20 拍起）', () => {
    const game = makeGame(emptyWorld());
    const d = new Arrow(10 * TILE, 40 * TILE, 8, 0, 10, 1, 267, {});
    for (let t = 0; t < 19; t++) d.fixedUpdate(1, game);
    expect(d.vy).toBe(0);
    d.fixedUpdate(1, game);
    expect(d.vy).toBeCloseTo(0.075, 6);
  });
});
