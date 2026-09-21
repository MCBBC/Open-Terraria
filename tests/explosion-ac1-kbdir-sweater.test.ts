import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game, PREPARE_BOMB_KB } from '../src/core/Game';
import type { Entity } from '../src/entities/Entity';

// SW-AC1 2026-09-04 回归：①kbDir 弹体朝向穿透（Projectile.cs:13652 `int num40 =
// direction`,Update :17121-17132 `velocity.X < 0 → -1 else 1`——全 victim 同向,非径向,
// S1 备案"kb 方向近似"清偿）②两弹型 28/102 对照 ③SelfHurtPlayers Dead Man's
// Sweater（:15131-15134 sweater∧trap → ×0.5 int 截断再 min 300,F-4 半边清偿）。

const mkGame = (world: World, sweater = false) => {
  const g = Object.create(Game.prototype) as Record<string, unknown> & { selfDmg?: number };
  g.world = world;
  g.player = { cx: 60 * 16, cy: 60 * 16, w: 20, h: 42,
    equipStats: { deadMansSweater: sweater }, luck: 0, lastDamageCause: null };
  g.entities = { enemies: [] as unknown[], critters: [], npcs: [], drops: [], add: () => {} };
  g.sfxAt = () => {};
  g.damagePlayer = (dmg: number) => { g.selfDmg = dmg; return 0; };
  g.recLog = () => {};
  return g as unknown as Game & { selfDmg?: number };
};
const spyEnemy = (cx: number, cy: number) => {
  const calls: Array<[number, number]> = [];
  return { calls, e: { cx, cy, w: 40, h: 40, hurt: (d: number, kx: number, ky: number) => { calls.push([kx, ky]); } } as unknown as Entity };
};
const B = 24 * 16 + 8;   // 爆心像素（格 24,24 中心）

describe('SW-AC1 爆炸击退方向=弹体朝向（kbDir）+ sweater 自伤 cap', () => {
  it('explosionKbDir：vx<0→-1;0/undefined/正→+1（:17121-17132 else 档,粘性贴附 vx=0 同款）', () => {
    expect(Game.explosionKbDir(-0.5)).toBe(-1);
    expect(Game.explosionKbDir(0)).toBe(1);
    expect(Game.explosionKbDir(2)).toBe(1);
    expect(Game.explosionKbDir(undefined)).toBe(1);
  });
  it('kbDir=±1 全 victim 同向 ±kb（两弹型 28/102 对照,非径向）;kbDir=0 维持旧径向;108 kb0+dir1=零推', () => {
    for (const [projId, kb] of [[28, PREPARE_BOMB_KB[28]], [102, PREPARE_BOMB_KB[102]]] as const) {
      const g = mkGame(new World(48, 48, 7, 'ac1'));
      const left = spyEnemy(B - 50, B), right = spyEnemy(B + 50, B);
      g.entities.enemies = [left.e, right.e];
      g.explodeAt(24, 24, 100, 0, false, 64, 0, projId, B, B, kb, 1);
      expect(left.calls[0]).toEqual([8, 0]);   // 旧径向会给 -8（敌在爆心左）
      expect(right.calls[0]).toEqual([8, 0]);
      const g2 = mkGame(new World(48, 48, 7, 'ac1b'));
      const l2 = spyEnemy(B - 50, B);
      g2.entities.enemies = [l2.e];
      g2.explodeAt(24, 24, 100, 0, false, 64, 0, projId, B, B, kb, -1);
      expect(l2.calls[0]).toEqual([-8, 0]);
    }
    const g = mkGame(new World(48, 48, 7, 'ac1c'));
    const e28 = spyEnemy(B - 50, B), e108 = spyEnemy(B - 50, B);
    g.entities.enemies = [e28.e];
    g.explodeAt(24, 24, 100, 0, false, 64, 0, 28, B, B, PREPARE_BOMB_KB[28]);
    expect(e28.calls[0]).toEqual([8, 0]);      // kbDir 缺省=旧径向（纯格调用点兼容）
    g.entities.enemies = [e108.e];
    g.explodeAt(24, 24, 500, 0, false, 130, 0, 108, undefined, undefined, 0, 1);
    expect(e108.calls[0]).toEqual([0, 0]);     // kb=0 → 零推（kbDir 路径无旧 ||1 假抬）
  });
  it('selfHurtSweaterCap 纯函数：sweater∧trap → ×0.5 截断再 min 300;缺一原值;trap∩爆炸圈={108,1002}', () => {
    expect(Game.selfHurtSweaterCap(500, true, true)).toBe(250);
    expect(Game.selfHurtSweaterCap(700, true, true)).toBe(300);
    expect(Game.selfHurtSweaterCap(601, true, true)).toBe(300);   // 300.5→(int)300→min 边界
    expect(Game.selfHurtSweaterCap(500, true, false)).toBe(500);
    expect(Game.selfHurtSweaterCap(500, false, true)).toBe(500);  // 28 炸弹族非 trap
    expect([...Game.EXPLODE_TRAP_PROJS].sort((a, b) => a - b)).toEqual([108, 1002]);
  });
  it('explodeAt 玩家段：108+sweater 自伤恰 300;28（非 trap）与无 sweater 仅 DV ±15% 区间', () => {
    const g = mkGame(new World(48, 48, 7, 'ac1e'), true);
    (g.player as { cx: number }).cx = B; (g.player as { cy: number }).cy = B;
    g.explodeAt(24, 24, 800, 0, false, 130, 0, 108, undefined, undefined, 0, 1);
    expect(g.selfDmg).toBe(300);   // DV 680-920 → ×0.5=340-460 → 全被 cap 收口
    for (const [id, sw, kb] of [[28, true, PREPARE_BOMB_KB[28]], [108, false, 0]] as const) {
      const gi = mkGame(new World(48, 48, 7, `ac1f${id}${sw}`), sw);
      (gi.player as { cx: number }).cx = B; (gi.player as { cy: number }).cy = B;
      gi.explodeAt(24, 24, 800, 0, false, 130, 0, id, undefined, undefined, kb, -1);
      expect(gi.selfDmg).toBeGreaterThanOrEqual(680);
      expect(gi.selfDmg).toBeLessThanOrEqual(920);
    }
  });
});
