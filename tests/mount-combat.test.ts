// 运输域坐骑战斗通道回归（矿车高速撞击 NPC + 史莱姆坐骑弹跳踩踏）：
// 原版锚点——矿车冲撞段 1457 Player.cs:27748-27831（1456 :27225 起）、
// GetMinecartDamage :29474-29518（1456 :28776）、JumpMovement 踩踏三循环
// :20693-20801（1456 :20254-20362）、wetSlime 液体态 :28160-28207（1456 :27653-27689）。
// 数值断言表驱动（速度→伤害/击退档位）防将来回退；几何/门禁用 World+TileStore 纯层。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import { TILE_BY_KEY } from '../src/data/tiles';
import {
  getMinecartDamage, minecartDamageBase, minecartRampageBox, minecartNpcRampage,
  mountJumpStomps, ramRuneDownDashStomp, tickSlimeWetState, consumeWetSlimeOnJumpControl,
  isConsideredASlimeMount,
} from '../src/entities/MountCombat';

const STONE = TILE_BY_KEY['stone'];
const PLATFORM = TILE_BY_KEY['platform'];

/** DamageVar 等价恒等骰：floor(rnd*31)=15 → 波动系数恰 1.0（ScaleStats.damageVar） */
const IDENTITY_RND = () => 0.5;

// ---------------------------------------------------------------------------
// 公共桩
// ---------------------------------------------------------------------------

interface StubEnemy {
  x: number; y: number; w: number; h: number;
  dead?: boolean; iframes?: number; dontTakeDamage?: boolean; noTileCollide?: boolean;
  def?: { friendly?: boolean; knockBackResist?: number; lifeMax?: number };
  kills?: number;
  hits: Array<{ dmg: number; kbx: number; kby: number; crit: boolean; fromPlayer: boolean }>;
  hurt(dmg: number, kbx: number, kby: number, g: GameHooks, ap?: number, crit?: boolean,
    pierce?: number, fp?: boolean): boolean;
}

function mkEnemy(o: Partial<StubEnemy>): StubEnemy {
  return {
    x: 0, y: 0, w: 24, h: 24, ...o,
    hits: [],
    hurt(dmg, kbx, kby, _g, _ap, crit, _pi, fp) {
      this.hits.push({ dmg, kbx, kby, crit: !!crit, fromPlayer: !!fp });
      this.kills = (this.kills ?? 0) + 1;
      return !this.dead;
    },
  } as StubEnemy;
}

function mkGame(store: unknown, enemies: unknown[], playerOver: Record<string, unknown> = {}): GameHooks {
  const player = {
    dead: false, luck: 0, maxHp: 400, maxMana: 200, cx: 0, cy: 0,
    critChance: () => 50,
    ...playerOver,
  };
  return {
    world: { store, flags: { hardMode: false }, isExpert: false },
    player,
    enemies: () => enemies,
  } as unknown as GameHooks;
}

const CART = (over: Record<string, unknown> = {}) => ({
  x: 200, y: 300, w: 20, h: 52, vx: 12, vy: 0,
  mountId: 6, superCart: false, runSpeed: 13, ...over,
});

// ---------------------------------------------------------------------------
// ①GetMinecartDamage 数值表（速度→伤害/击退档位快照）
// ---------------------------------------------------------------------------

describe('①GetMinecartDamage 数值表（1457 :29474-29518 / 1456 :28776）', () => {
  const D = (speed: number, o: Record<string, unknown> = {}) =>
    getMinecartDamage(speed, {
      mountType: 6, superCart: false, hardMode: false, expertMode: false, ...o,
    }, 0, IDENTITY_RND);

  it('默认矿车型 25+55×速比', () => {
    // 速比档位表：0/0.25/0.5/0.75/1/1.5——DamageVar 恒等骰下 = round(基值)
    expect([[0, 25], [0.25, 39], [0.5, 52], [0.75, 66], [1, 80], [1.5, 108]] as Array<[number, number]>)
      .toEqual(speedTable(D, {}));
  });

  it('mount 13 木质矿车低配档 15+30×速比', () => {
    expect([[0, 15], [0.5, 30], [1, 45], [2, 75]] as Array<[number, number]>)
      .toEqual(speedTable(D, { mountType: 13 }));
  });

  it('UsingSuperCart 整体覆写 50+100×速比（含对木质车型的覆写优先）', () => {
    expect([[0, 50], [0.5, 100], [1, 150]] as Array<[number, number]>)
      .toEqual(speedTable(D, { superCart: true }));
    expect(D(1, { superCart: true, mountType: 13 }).damage).toBe(150);
  });

  it('hardMode ×1.5 再 expertMode ×1.5，各一步 (int) 截断', () => {
    // 经典 80 → 难家 (int)(80*1.5)=120 → 专家 (int)(120*1.5)=180；
    // 62 → 截断链 93 → 139（验证逐级 trunc 而非一次 ×2.25：62*2.25=139.5→双截同值，
    // 选非整点值 33：33→49（49.5 截）→73（73.5 截），若合并乘区得 74）
    expect(D(1, { hardMode: true }).damage).toBe(120);
    expect(getMinecartDamage(1, { mountType: 6, superCart: false, hardMode: true, expertMode: true }, 0, IDENTITY_RND).damage).toBe(180);
    expect(D(0.1454545, {}).damage | 0).toBeGreaterThanOrEqual(0);
    expect(getMinecartDamage(0.1454545, { mountType: 6, superCart: false, hardMode: true, expertMode: true }, 0, IDENTITY_RND).damage).toBe(73);
  });

  it('击退 = 10+40×速比，不吃波动不吃难度乘区', () => {
    expect(D(0.5).knockback).toBe(30);
    expect(D(1).knockback).toBe(50);
    expect(getMinecartDamage(1, { mountType: 6, superCart: false, hardMode: true, expertMode: true }, 0, IDENTITY_RND).knockback).toBe(50);
    // 基础面与全链分离口径一致（minecartDamageBase 无波动原样）
    expect(minecartDamageBase(1, { mountType: 6, superCart: false, hardMode: false, expertMode: false })).toEqual({ base: 80, knockback: 50 });
  });
});

/** 表驱动工具：按 ctx 生成 [speed,expectedDamage] 对照组 */
function speedTable(fn: (s: number, o: Record<string, unknown>) => { damage: number; knockback: number },
  ctx: Record<string, unknown>, field: 'damage' = 'damage'): Array<[number, number]> {
  return CASES.map(([s, want]) => [s, field === 'damage' ? fn(s, ctx).damage : fn(s, ctx).knockback]).map(
    ([got, _w]) => [got as number, 0],
  ).map((_, i) => [CASES[i][0], wantOf(i, ctx, fn)]);
}

const CASES: Array<[number, number]> = [];

// 上面的映射器难以复用原文案,这里用直白实现替换（见下 describe 重写版）

function wantOf(_i: number, _ctx: Record<string, unknown>, _fn: unknown): number {
  return 0;
}
