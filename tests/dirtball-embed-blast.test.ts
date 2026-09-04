// SW-L1 2026-09-03 蓝队二轮 F1/F3/F6/F7/F8 + 红队 I-3a 回归（标杆
// Terarria1457/Terraria/Projectile.cs AI_010 :58809-59083 + Kill_Bombs_DoUsualKillCode
// :79119-79300 + Kill 音尘 :77801-77808）：
//  ① F1 嵌壁态爆心：弹落实心地 → Kill 时铺设爆心取上一 tick 未嵌入位（原版
//     TileCollision 回退语义）→ 中心格=撞面邻接空气格 → PlaceTile 成功（曾恒 occupied
//     → 永远掉泥块）
//  ② F7 掉落锚分档：被占 → Center（:79298-79300）；flag2 被拦 → Center+(0,-2)
//     （:79293-79296）
//  ③ F6 Kill 音尘：每次 Kill PlaySound(0)+5 尘（:77801-77808），铺/掉两支共用
//  ④ I-3a 飞行尘每 tick 恒评估（:58921-58924 AI_010 头,释放段同样掷）
//  ⑤ F8 BlockBelowMakesSandFall nactive 位：已致动下格 = !nactive → 拦铺
// 弹道确定性：出生即断链（provider null）→ 第 1 拍 tileCollide=false 仅重力
// （y+=0.41）、第 2 拍起碰撞判定;出生中心 y=639（row 39 底缘）→ 第 3 拍弹心嵌入
// row 40 → Kill,爆心=第 2 拍积分前位 y=639.41（row 39 空气格）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { DirtBallProj } from '../src/entities/DirtBallProj';
import { blockBelowMakesSandFall } from '../src/entities/FallingBlock';   // ★M13 A-2 单源化：BBMSF 实现迁 FallingBlock
const blockBelowMakesSandFallAt = blockBelowMakesSandFall;               // 旧名别名（本文件断言不改）
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const DIRT = TILE_INTERNAL_BY_SHEET.get(0)!;
const BELT = TILE_INTERNAL_BY_SHEET.get(422)!;   // v_422 conveyor belt（solid;flag2 拦铺档）
const CX = 40 * 16 + 8;

interface Env {
  drops: Array<{ x: number; y: number; key: string }>;
  sfx: string[];
  dusts: number[];
}

function mkEnv(randomValue = 0.9): { w: World; g: GameHooks; env: Env; restore: () => void } {
  const w = new World(80, 60, 30, 'open');
  const env: Env = { drops: [], sfx: [], dusts: [] };
  const g = {
    world: w,
    player: null,
    enemies: () => [],
    critters: () => [],
    cutTile: () => {},
    playSfx: (name: string) => { env.sfx.push(name); },
    spawnDrop: (x: number, y: number, key: string) => { env.drops.push({ x, y, key }); return null; },
    spawnDust: (_x: number, _y: number, _w2: number, _h2: number, type: number) => {
      env.dusts.push(type); return null;
    },
  } as unknown as GameHooks;
  const orig = Math.random;
  Math.random = () => randomValue;      // 0 → 飞行尘每 tick 必出;0.9 → 全静默
  return { w, g, env, restore: () => { Math.random = orig; } };
}

function runToDeath(p: DirtBallProj, g: GameHooks): void {
  for (let t = 0; t < 200 && !p.dead; t++) p.fixedUpdate(0, g);
  expect(p.dead).toBe(true);
}

describe('SW-L1 Dirt Ball 嵌壁态爆心/掉落锚/音尘回归', () => {
  it('F1+I-3a+F6：弹落实心地 → 铺泥在撞面邻接空气格、零掉落、Kill 音+尘、释放段照掷飞行尘', () => {
    const { w, g, env, restore } = mkEnv(0);        // random=0 → 尘每 tick 必出
    try {
      for (let x = 30; x < 50; x++) w.store.setTileSilent(x, 40, DIRT, 0, 0);
      const p = new DirtBallProj(CX, 639, 0, 0, () => null, 'v_2');
      runToDeath(p, g);
      expect(w.store.get(40, 39)).toBe(DIRT);       // 铺在空气格 39（非掉落、非嵌入格 40）
      expect(w.store.get(40, 40)).toBe(DIRT);       // 地面原格不变
      expect(env.drops).toEqual([]);                // 曾恒 occupied → 永远掉泥块（F1 实锤面）
      expect(env.sfx).toEqual(['dig']);             // F6:PlaySound(0) 恰一次
      expect(env.dusts.filter((t) => t === 0)).toHaveLength(8);  // I-3a:3 拍飞行尘 + F6:Kill 5 尘
    } finally {
      restore();
    }
  });

  it('F7 被占锚：出生即嵌实心格 → Kill 掉泥块锚=Center（无 −2 偏移）且不覆盖', () => {
    const { w, g, env, restore } = mkEnv(0.9);
    try {
      w.store.setTileSilent(40, 39, DIRT, 0, 0);
      const p = new DirtBallProj(CX, 639, 0, 0, () => null, 'v_2');   // 弹心嵌在实心格 39 内
      runToDeath(p, g);
      expect(env.drops).toHaveLength(1);
      expect(env.drops[0]).toEqual({ x: CX, y: 639, key: 'v_2' });   // :79298-79300 base.Center
      expect(w.store.get(40, 39)).toBe(DIRT);       // 被占 → 不铺设
    } finally {
      restore();
    }
  });

  it('F7 flag2 锚：落点下方 422 传送带 → 拒铺掉泥块锚=Center+(0,-2)=637.41', () => {
    const { w, g, env, restore } = mkEnv(0.9);
    try {
      for (let x = 30; x < 50; x++) w.store.setTileSilent(x, 40, BELT, 0, 0);
      const p = new DirtBallProj(CX, 639, 0, 0, () => null, 'v_2');
      runToDeath(p, g);
      expect(w.store.get(40, 39)).toBe(0);          // 拒铺
      expect(env.drops).toHaveLength(1);
      expect(env.drops[0].key).toBe('v_2');
      expect(env.drops[0].y).toBeCloseTo(637.41, 3); // :79293-79296 Center+(0,-2),爆心 639.41
      expect(env.drops[0].x).toBe(CX);
    } finally {
      restore();
    }
  });

  it('F8：BlockBelowMakesSandFall 对已致动下格= true（nactive 含致动位）', () => {
    const w = new World(80, 60, 30, 'open');
    w.store.setTileSilent(10, 11, DIRT, 0, 0);
    // 未致动：下格 nactive、再下格空但下格实心 → false
    expect(blockBelowMakesSandFallAt(w.store, 10, 10)).toBe(false);
    // 致动后：下格 !nactive → true（曾用裸 active 位误判 false）
    w.store.setActuated(10, 11, true);
    expect(blockBelowMakesSandFallAt(w.store, 10, 10)).toBe(true);
  });
});
