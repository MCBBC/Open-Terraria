// YoyoShotProj 位移链补面回归（2026-09-07 蓝队 K 位移缺面批）。
//  定谳：原版 1130/1134/1135 的位移 = HandleMovement 尾 UpdatePosition（P.cs:19973 →
//  :20549-20562）——早退表（:20551-20553）【含 1125 不含 1130/1134/1135】→
//  wet ? position += wetVelocity : position += velocity;四型 tileCollide=false
//  （:10537/:10599/:10640/:10657）→ 湿阻尼块 :17721（在 if(tileCollide) 内）不跑,
//  wetVelocity 恒 = :16870 AI 前快照 → 湿态位移 = undamped 快照（滞后一子步 quirk,
//  GrenadeProj 37 / YoyoProj 回收段同款）。旧实现整类零位移积分 = 移动域缺面,本批补:
//  AI 速度阻尼（AI_210 ×0.92 既有 / AI_024 1134 ×0.96 :26343-26345 补）+ UpdatePosition
//  积分（本批补）;1125 保持零位移（早退表行,原版同）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { YoyoShotProj } from '../src/entities/WeaponProj';
import { projectileData } from '../src/data/vanillaProjectiles';

const LIQ = 255;
/** 水带：列 [30..40] 行 [60..70] 满格液体 → px [480,656]×[960,1136]（proj-wet-
 *  weapon11-cluster 同构;空 TileStore 走廊无块碰撞） */
function mkWorld(): World {
  const w = new World(120, 160, 30, 'open');
  w.clock.timeOfDay = 0;
  for (let x = 30; x <= 40; x++) {
    for (let y = 60; y <= 70; y++) {
      const i = w.store.idx(x, y);
      w.store.liquid[i] = LIQ;
      w.store.liquidType[i] = 0;
    }
  }
  return w;
}

function mkGame(w: World): GameHooks {
  const pl = new Player(20 * TILE, 30 * TILE, new Inventory());
  return {
    world: w,
    player: pl,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1, alpha: 0, noGravity: false, color: null }),
    playSfxWav: () => {}, spawnParticles: () => {}, playSfx: () => {},
    playSfxFiles: () => {}, playSfxFile: () => {},
    cutTile: () => {}, spawnDrop: () => null, damagePlayer: (): number => 0,
    addDamageNumber: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    notifyInventoryChanged: () => {}, mapFullscreen: () => false,
    spawnFriendlyProj: () => {}, addLightAt: () => {},
  } as unknown as GameHooks;
}

describe('YoyoShotProj 位移链（UpdatePosition :20549 补面）', () => {
  it('1130 干态：AI_210 ×0.92 阻尼场逐拍积分（velocity 场=位移量,几何衰减）', () => {
    const g = mkGame(mkWorld());
    const e = new YoyoShotProj({ x: 400, y: 1000, vx: 10, vy: 0, projId: 1130, dmg: 10, kb: 1 });
    const x0 = e.x;
    e.fixedUpdate(1 / 60, g);
    expect(e.vx).toBeCloseTo(9.2, 9);          // AI_210 :37520 velocity *= 0.92
    expect(e.x - x0).toBeCloseTo(9.2, 9);      // dry → position += velocity（:20561）
    e.fixedUpdate(1 / 60, g);
    expect(e.vx).toBeCloseTo(8.464, 9);
    expect(e.x - x0).toBeCloseTo(9.2 + 8.464, 9);
  });

  it('1130 湿态：位移 = AI 前快照（无档位阻尼 quirk）,velocity 场照常 ×0.92', () => {
    const g = mkGame(mkWorld());
    // 出生盒 100×100 全入水带 → 预置 wet=true（:10887）
    const e = new YoyoShotProj({ x: 544, y: 1000, vx: 10, vy: 0, projId: 1130, dmg: 10, kb: 1 });
    const x0 = e.x;
    e.fixedUpdate(1 / 60, g);
    expect(e.wet).toBe(true);
    expect(e.vx).toBeCloseTo(9.2, 9);          // 速度场被 AI 阻尼
    expect(e.x - x0).toBeCloseTo(10, 9);       // 位移吃快照 preVx=10（tileCollide=false →
                                               //  湿阻尼块 :17721 不跑,无 ×0.5）
  });

  it('1135 湿态同 quirk；1134 干态 AI_024 ×0.96 阻尼场积分', () => {
    const g = mkGame(mkWorld());
    const w5 = new YoyoShotProj({ x: 544, y: 1000, vx: 18, vy: 0, projId: 1135, dmg: 10, kb: 1 });
    const x05 = w5.x;
    w5.fixedUpdate(1 / 60, g);
    expect(w5.wet).toBe(true);
    expect(w5.vx).toBeCloseTo(16.56, 9);       // 18×0.92
    expect(w5.x - x05).toBeCloseTo(18, 9);     // 快照位移
    const d = new YoyoShotProj({ x: 400, y: 1000, vx: 5, vy: 0, projId: 1134, dmg: 10, kb: 1 });
    const x0d = d.x;
    d.fixedUpdate(1 / 60, g);
    expect(d.vx).toBeCloseTo(4.8, 9);          // AI_024 :26343 velocity *= 0.96
    expect(d.x - x0d).toBeCloseTo(4.8, 9);     // dry → += velocity
  });

  it('1134 湿态：位移 = AI 前快照（×0.96 后场不动位移）', () => {
    const g = mkGame(mkWorld());
    const d = new YoyoShotProj({ x: 544, y: 1024, vx: 5, vy: 0, projId: 1134, dmg: 10, kb: 1 });
    const x0 = d.x;
    d.fixedUpdate(1 / 60, g);
    expect(d.wet).toBe(true);
    expect(d.vx).toBeCloseTo(4.8, 9);
    expect(d.x - x0).toBeCloseTo(5, 9);
  });

  it('1125 CascadeExplosion：UpdatePosition 早退表行（:20553）→ 零位移（干/湿两态）', () => {
    const g = mkGame(mkWorld());
    const dry = new YoyoShotProj({ x: 400, y: 1000, vx: 5, vy: 0, projId: 1125, dmg: 10, kb: 1 });
    const xd = dry.x;
    dry.fixedUpdate(1 / 60, g);
    dry.fixedUpdate(1 / 60, g);
    expect(dry.x).toBe(xd);                    // 原版爆炸尘原地,velocity 不积分
    const wet = new YoyoShotProj({ x: 544, y: 1024, vx: 5, vy: 0, projId: 1125, dmg: 10, kb: 1 });
    const xw = wet.x;
    wet.fixedUpdate(1 / 60, g);
    expect(wet.x).toBe(xw);
    expect(wet.wet).toBe(false);               // 豁免（:10530 块 ignoreWater=true）旗恒 false
  });

  it('豁免数据面回归锚：1130/1134/1135 受段、1125 豁免（SetDefaults 逐块）', () => {
    expect(projectileData(1130)?.ignoreWater ?? false).toBe(false);
    expect(projectileData(1134)?.ignoreWater ?? false).toBe(false);
    expect(projectileData(1135)?.ignoreWater ?? false).toBe(false);
    expect(projectileData(1125)?.ignoreWater).toBe(true);
  });
});
