import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game, PREPARE_BOMB_KB, LIQUID_ROCKET_II_IDS, LIQUID_ROCKET_II_DUST } from '../src/core/Game';
import { damageVarRoll } from '../src/stats/DamageVar';

// SW-S1 2026-09-04 爆炸面散账三回归：④击退标量传链（PrepareBombToBlow :47629-47720）/
// ①SelfHurtPlayers DamageVar -luck 方向（Projectile.cs:15123）/ ③液体火箭 II 型 Kill
// 尘分型（Kill :79469-79627 四族支——785 水/788 熔岩/791 蜂蜜/800 干）。

const mkGame = (world: World) => {
  const g = Object.create(Game.prototype) as Record<string, any>;
  g.world = world;
  g.player = { cx: 60 * 16, cy: 60 * 16, w: 20, h: 42, equipStats: {}, luck: 0, lastDamageCause: null };
  g.entities = { enemies: [], critters: [], npcs: [], drops: [], add: () => {} };
  g.sfxAt = () => {};
  g.damagePlayer = () => 0;
  g.recLog = () => {};
  return g;
};
const spyEnemy = (cx: number, cy: number) => {
  const calls: Array<[number, number]> = [];
  return { calls, e: { cx, cy, w: 40, h: 40, hurt: (d: number, kx: number, ky: number) => { calls.push([kx, ky]); } } };
};

describe('SW-S1 ④爆炸击退标量（PrepareBombToBlow :47629-47720 各支 knockBack）', () => {
  it('表值 golden：128²族8 / 773 8 / 250²族10 / 280²族9 / 液体火箭·迷你核弹·集束母弹12 / 火箭III·IV 10', () => {
    expect([28, 37, 516, 519, 773, 30, 397, 517, 588, 681, 102, 779, 783, 862, 863, 133, 930].map((i) => PREPARE_BOMB_KB[i])).toEqual(Array(17).fill(8));
    expect([29, 470, 637].map((i) => PREPARE_BOMB_KB[i])).toEqual([10, 10, 10]);
    expect([1086, 1087].map((i) => PREPARE_BOMB_KB[i])).toEqual([9, 9]);
    expect([785, 788, 791, 800, 903, 910, 911, 794, 777, 803].map((i) => PREPARE_BOMB_KB[i])).toEqual(Array(10).fill(12));
    expect([139, 144, 340, 341].map((i) => PREPARE_BOMB_KB[i])).toEqual([10, 10, 10, 10]);
    expect(PREPARE_BOMB_KB[108]).toBeUndefined();  // SetDefaults 无 knockBack 行 → 原版 0
    expect(PREPARE_BOMB_KB[1002]).toBeUndefined();
    expect(PREPARE_BOMB_KB[715]).toBeUndefined();  // Celeb2 烟花弹 Kill 直调 Damage() → 武器 kb
  });
  it('传链：真实 explodeAt kb 传值 → hurt(kbx=方向×kb, kby=0) 武器路径;未传 → 旧像素向量面', () => {
    const g = mkGame(new World(48, 48, 7, 's1'));
    const ex = 24 * 16 + 8;
    const s1 = spyEnemy(ex + 50, ex); g.entities.enemies = [s1.e];
    g.explodeAt(24, 24, 100, 0, false, 64, 0, 28, ex, ex, 8);
    expect(s1.calls[0]).toEqual([-8, 0]);          // 敌在爆心右 → −1×8（推离爆心）
    const s2 = spyEnemy(ex - 50, ex); g.entities.enemies = [s2.e];
    g.explodeAt(24, 24, 100, 0, false, 64, 0, 28, ex, ex, 8);
    expect(s2.calls[0]).toEqual([8, 0]);           // 敌在爆心左 → +1×8（方向沿用现推导）
    const s3 = spyEnemy(ex + 50, ex + 30); g.entities.enemies = [s3.e];
    g.explodeAt(24, 24, 100, 0, false, 64, 0, 28, ex, ex);   // kb 缺省（未穿表调用点）
    expect(s3.calls[0]).toEqual([-50, -30]);       // 旧像素向量冲量面原样保留
  });
});

describe('SW-S1 ①DamageVar -luck 方向（SelfHurtPlayers :15123 `DamageVar(value, 0f-luck)`）', () => {
  it('luck 取负→重掷取 min（厄运=伤更大）;正向 luck→取 max——同掷序两向对偶', () => {
    const seq = [0.04, 0.5, 0.99];   // tier(0.04)=−14→86 / 门掷 / tier(0.99)=+15→115
    const mk = () => { let i = 0; return () => seq[i++] ?? 0.5; };
    expect(damageVarRoll(100, -1, mk())).toBe(86);   // min(86,115)——self-hurt 面实参 (-p.luck)
    expect(damageVarRoll(100, 1, mk())).toBe(115);   // max(86,115)——NPC 面 :12959 正 luck 对偶
    expect(damageVarRoll(100, 0, mk())).toBe(86);    // luck=0 无重掷
  });
});

describe('SW-S1 ③液体火箭 II 型 Kill 尘分型纯表（Kill :79469-79627）', () => {
  it('弹域 {785,788,791,800};785=Dust.dustWater() 首粒 noGravity+velY−1.2,余三型纯速乘', () => {
    expect([...LIQUID_ROCKET_II_IDS].sort((a, b) => a - b)).toEqual([785, 788, 791, 800]);
    expect(LIQUID_ROCKET_II_DUST[785]).toEqual({ dust: 'water',
      first: { scale: 2.2, noGravity: true, up: 1.2, vel: 7 }, second: { scale: 1.3, noGravity: false, up: 1.2, vel: 4 } });
    expect(LIQUID_ROCKET_II_DUST[788]).toEqual({ dust: 35,
      first: { scale: 1.2, noGravity: false, up: 0, vel: 7 }, second: { scale: 0.3, noGravity: false, up: 0, vel: 4 } });
    expect(LIQUID_ROCKET_II_DUST[791].dust).toBe(152);
    expect(LIQUID_ROCKET_II_DUST[800].dust).toBe(31);
  });
});
