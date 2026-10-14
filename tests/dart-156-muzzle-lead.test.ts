// ★F1 判别锁（清偿 B·弹幕域 R4）：红魔鬼 156 三叉戟 115 出膛点净偏移=单位弹向×20。
//  定谳（反编译 1457 NPC.cs:23584-23595）：num258=0.2（弹速）→ num259/260=瞄准向量,
//  num261=num258/num261(:23589) 归一并 ×0.2 → num259/260=【单位弹向×0.2 的速度向量】;
//  vector25 += velocity*5(:23594);NewProjectile(..., vector25+num259*100, num259/260
//  为弹速)(:23595) → 出膛点 = NPC中心 + 自身速度×5 + 单位弹向×(0.2×100)=20px。
//  旧实现 shooter.lead:100 把 ×100 直接作用在单位弹向上=净 100px（5 倍远）。
//  判别口径：|出膛点−(中心+速度×5)| = 20 ±1px,且方向=弹速方向（单位弹向）——
//  弹速本身含 ±50 随机散布,用弹体速度方向回推期望出生点（flyer-ai-parity #7 同法）。
//  附带锁：48 哈比/62 恶魔原版出生点=中心无偏移（NewProjectile 直用 vector23/24,
//  NPC.cs:23537/:23556）→ lead=0 表驱动语义不回归。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';

interface MockGame extends GameHooks {
  __projectiles: { projId: number; vx: number; vy: number; x: number; y: number }[];
}

function makeGame(day = false): MockGame {
  const world = new World(96, 48, 7, 'dart-156-muzzle');
  world.groundLevel = 16;
  world.rockLevel = 32;
  world.clock.timeOfDay = day ? 0.5 : 0.95;   // 0.5=正午 / 0.95=深夜
  const projectiles: MockGame['__projectiles'] = [];
  return {
    world,
    player: null,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
    playSfxWav: () => {},
    onEnemyKilled: () => {},
    entities: { add: (p: unknown) => { projectiles.push(p as MockGame['__projectiles'][number]); } },
    __projectiles: projectiles,
  } as unknown as MockGame;
}

/** 直调私有 AI 方法（原型直调法,同 flyer-ai-parity 台架） */
const drive = (e: Enemy, fn: string, g: GameHooks, p?: unknown) =>
  (e as unknown as Record<string, (g: GameHooks, p?: unknown) => void>)[fn].call(e, g, p ?? null);

function mkPlayer(x: number, y: number): Player {
  return {
    x, y, w: 20, h: 42, cx: x + 10, cy: y + 21, dead: false,
    inWater: false, itemAnimTicks: 0, useTime: 0, aggro: 0, stealth: 0, vx: 0, vy: 0,
  } as unknown as Player;
}

function mkEnemy(id: number, tx = 40, ty = 20): Enemy {
  const e = Enemy.fromVanilla(id, tx * 16, ty * 16);
  if (!e) throw new Error(`npc ${id} 构造失败`);
  return e;
}

describe('F1 红魔 156 出膛点（NPC.cs:23584-23595）', () => {
  it('出膛点 = 中心 + 自身速度×5 + 单位弹向×20（±1px）——旧 lead:100（净 100px）必红', () => {
    const g = makeGame(false);
    const demon = mkEnemy(156, 40, 20);
    demon.vx = 4; demon.vy = 0;
    demon.ai0 = 19;                                  // 自增后 ==20 → 第一发齐射帧
    const p = mkPlayer(demon.x + 200, demon.y);
    drive(demon, 'batAI', g, p);
    expect(g.__projectiles).toHaveLength(1);
    const proj = g.__projectiles[0];
    expect(proj.projId).toBe(115);
    const spd = Math.hypot(proj.vx, proj.vy);
    expect(spd).toBeCloseTo(0.2, 5);                 // 弹速 0.2（num258 :23584）
    // 单位弹向=弹速方向;净偏移=0.2×100=20px（:23589/:23595）
    const ex = demon.cx + demon.vx * 5 + (proj.vx / spd) * 20;
    const ey = demon.cy + demon.vy * 5 + (proj.vy / spd) * 20;
    expect(Math.abs(proj.x - ex)).toBeLessThanOrEqual(1);
    expect(Math.abs(proj.y - ey)).toBeLessThanOrEqual(1);
    // 判别：偏移向量模长恒 20（旧病灶=100）
    const off = Math.hypot(proj.x - (demon.cx + demon.vx * 5), proj.y - (demon.cy + demon.vy * 5));
    expect(off).toBeGreaterThan(19);
    expect(off).toBeLessThanOrEqual(21);
  });

  it('48 哈比 / 62 恶魔：出生点=中心无偏移（lead 0 表驱动语义不回归,原版无偏移项）', () => {
    for (const [vid, tick, pid] of [[48, 29, 38], [62, 19, 44]] as const) {
      const g = makeGame(false);
      const e = mkEnemy(vid, 40, 20);
      e.ai0 = tick;                                  // 自增后命中首发阈值
      const p = mkPlayer(e.x + 200, e.y);
      drive(e, 'batAI', g, p);
      expect(g.__projectiles, `vid=${vid} 应发射 ${pid}`).toHaveLength(1);
      const proj = g.__projectiles[0];
      expect(proj.projId).toBe(pid);
      expect(proj.x).toBeCloseTo(e.cx, 9);           // NewProjectile 直用中心(:23537/:23556)
      expect(proj.y).toBeCloseTo(e.cy, 9);
    }
  });
});
