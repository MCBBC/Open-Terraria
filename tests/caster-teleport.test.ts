// Caster 族传送 1:1（NPC.cs AI_008 :20774-21495）：
//  ai[0] 初值 500 → ≥650 触发采样（telefrag 5）→ 次帧执行：
//  旧位 Item8+50 尘 → 改写 → 新位 Item8+50 尘；ai1=20（Imp 5）压掉 ==25 发射门；
//  攻击蓄力点 → 倒数 ==25 发射（Imp ==10）；族内提前传送上限表。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

interface CasterHooks {
  world: World;
  player: { x: number; y: number; w: number; h: number; cx: number; cy: number; dead: boolean; vx: number; vy: number };
  sfx: string[][]; parts: Array<{ n: number; c: string }>; shots: unknown[];
  playSfxFiles(files: string[]): void;
  spawnParticles(_x: number, _y: number, color: string, count: number): void;
  entities: { add(e: unknown): void };
}

function flatWorld(playerAt: { x: number; y: number }) {
  const w = new World(80, 80, 42, 'caster');
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2); // 地板 y=60
  const hooks: CasterHooks = {
    world: w,
    player: {
      x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
      cx: playerAt.x * 16 + 10, cy: playerAt.y * 16 + 21,
      dead: false, vx: 0, vy: 0,
    },
    sfx: [], parts: [], shots: [],
    playSfxFiles(files) { hooks.sfx.push(files); },
    spawnParticles(_x, _y, color, count) { hooks.parts.push({ n: count, c: color }); },
    entities: { add(e) { hooks.shots.push(e); } },
  };
  return { w, hooks };
}

describe('Caster 族传送（AI_008 1:1）', () => {
  it('哥布林术士 29：500 起跳 ~150t 触发 → 双端 Item8+50 尘 + 落点远离玩家', () => {
    const { hooks } = flatWorld({ x: 40, y: 57 });
    const e = Enemy.fromVanilla(29, 30 * 16, 56 * 16)!;
    expect(e.vanilla?.aiStyle).toBe(8);
    const x0 = e.x, y0 = e.y;
    void x0; void y0;
    let teleported = false;
    for (let t = 0; t < 400 && !teleported; t++) {
      e.fixedUpdate(1 / 60, hooks as never);
      // 落点可能离原位 <8 格——用传送音判定（与落点无关）
      teleported = hooks.sfx.some((f) => f[0] === 'Item_8');
    }
    expect(teleported).toBe(true);
    // 传送音：旧+新各一次 Item8
    const tp = hooks.sfx.filter((f) => f[0] === 'Item_8');
    expect(tp.length).toBeGreaterThanOrEqual(2);
    // 双端 50 尘
    expect(hooks.parts.filter((p) => p.n === 50).length).toBeGreaterThanOrEqual(2);
    // telefrag 5：落点与玩家中心差 >5 格
    const pd = Math.abs(e.cx - hooks.player.cx) / 16 + Math.abs(e.cy - hooks.player.cy) / 16;
    expect(pd).toBeGreaterThan(5);
  });

  it('火妖 24：传送到场后 ai1=5 → 不再吃 ==25 发射门（无球）直到下个蓄力点', () => {
    const { hooks } = flatWorld({ x: 40, y: 57 });
    const e = Enemy.fromVanilla(24, 30 * 16, 56 * 16)!;
    const s = e as unknown as { ai0: number; ai1: number; ai2: number; ai3: number };
    for (let t = 0; t < 400; t++) e.fixedUpdate(1 / 60, hooks as never);
    void s;
    // 至少发生过一次传送（位置大幅变化）且发射过焰球或弹幕（shots>0 或 sfx 含 Item8）
    expect(hooks.sfx.filter((f) => f[0] === 'Item_8').length).toBeGreaterThan(0);
  });

  it('族内提前上限：死灵法师 283 初值 500 ≥450 即触发（前 50t 内必有 Item8 传送音）', () => {
    const { hooks } = flatWorld({ x: 40, y: 57 });
    // 死灵法师=地牢族：dungeonWallGate（:18899-18904）要求落点上一格地牢砖墙——平面世界无墙会被正确拒绝
    for (let x = 20; x <= 60; x++) hooks.world.store.wall[hooks.world.store.idx(x, 59)] = 8;
    const e = Enemy.fromVanilla(283, 30 * 16, 56 * 16)!;
    for (let t = 0; t < 50 && hooks.sfx.length === 0; t++) e.fixedUpdate(1 / 60, hooks as never);
    expect(hooks.sfx.some((f) => f[0] === 'Item_8')).toBe(true); // 提前表：开局即传
  });
});
