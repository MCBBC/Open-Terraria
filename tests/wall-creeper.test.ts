import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

// AI_040 爬墙蜘蛛（NPC.cs:29784）+ 地面↔爬墙形态互转（:59273/:29991）
const fakeHooks = (w: World) => ({
  world: w,
  player: null,
  playSfx: () => {},
  addDamageNumber: () => {},
  spawnParticles: () => {},
  spawnDrop: () => null,
  damagePlayer: () => {},
});

/** 蜘蛛洞近似：一片背景墙(62) + 底部地板，无其他实心块 */
function caveWorld(): World {
  const w = new World(60, 60, 42, 'open');
  const st = w.store;
  for (let x = 25; x <= 35; x++) {
    for (let y = 20; y <= 30; y++) st.setWallSilent(x, y, 62); // 蜘蛛洞墙
    st.setTileSilent(x, 30, 2); // 石地板
  }
  return w;
}

describe('爬墙蜘蛛形态互转（AI_003↔AI_040）', () => {
  it('地面蜘蛛(164)落地后身边有背景墙 → 转为爬墙形态(165)', () => {
    const w = caveWorld();
    const e = Enemy.fromVanilla(164, 30 * 16, 28 * 16)!;
    let transformed = false;
    for (let t = 0; t < 120; t++) {
      e.fixedUpdate(1 / 60, fakeHooks(w) as never);
      if (e.vanillaId === 165) { transformed = true; break; }
    }
    expect(transformed).toBe(true);
    expect(e.vanilla?.aiStyle).toBe(40);
    expect(e.w).toBe(36); // 165 碰撞盒 36×36（164 为 50×20）
  });

  it('爬墙形态(165)在墙上按 AI_040 运动（无重力上爬，贴墙不坠落）', () => {
    const w = caveWorld();
    const e = Enemy.fromVanilla(165, 30 * 16, 26 * 16)!;
    const hooks = fakeHooks(w) as never;
    // 有玩家在上方 → 爬墙追击（有视线分支伺服上升）
    // （canSeePlayer 走 Collision.CanHit 实体矩形语义,假玩家须带 x/y/w/h）
    (hooks as unknown as { player: { x: number; y: number; w: number; h: number; cx: number; cy: number; dead: boolean } }).player = {
      x: 30 * 16 - 10, y: 22 * 16 - 21, w: 20, h: 42,
      cx: 30 * 16, cy: 22 * 16, dead: false,
    } as never;
    const y0 = e.y;
    for (let t = 0; t < 120; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.y).toBeLessThan(y0);           // 向上爬了
    expect(e.vanillaId).toBe(165);          // 墙还在，不落回地面形态
    expect(e.crawlT).toBeGreaterThan(0);    // 爬行帧累加器推进
  });

  it('爬墙形态(165)失去背景墙 → 转回地面形态(164)', () => {
    const w = caveWorld();
    const e = Enemy.fromVanilla(165, 30 * 16, 26 * 16)!;
    const hooks = fakeHooks(w) as never;
    for (let t = 0; t < 5; t++) e.fixedUpdate(1 / 60, hooks); // 墙在：保持 165
    expect(e.vanillaId).toBe(165);
    const st = w.store;
    for (let x = 25; x <= 35; x++) for (let y = 20; y <= 30; y++) st.setWallSilent(x, y, 0);
    let back = false;
    for (let t = 0; t < 10; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vanillaId === 164) { back = true; break; }
    }
    expect(back).toBe(true);
    expect(e.vanilla?.aiStyle).toBe(3);
  });

  it('地表（无背景墙）地面蜘蛛不转换', () => {
    const w = new World(60, 60, 42, 'open');
    const st = w.store;
    for (let x = 25; x <= 35; x++) st.setTileSilent(x, 30, 2); // 只有地板，无墙
    const e = Enemy.fromVanilla(164, 30 * 16, 28 * 16)!;
    for (let t = 0; t < 120; t++) e.fixedUpdate(1 / 60, fakeHooks(w) as never);
    expect(e.vanillaId).toBe(164); // 地表贴墙爬不成立 → 保持地面行走
  });
});

describe('其他形态互转（Transform 全表审计）', () => {
  /** 开阔平地 + 玩家对象注入 */
  function flatWorld(playerAt: { x: number; y: number }) {
    const w = new World(60, 60, 42, 'open');
    const st = w.store;
    for (let x = 20; x <= 40; x++) st.setTileSilent(x, 40, 2); // 地板 y=40
    const hooks = fakeHooks(w) as unknown as { player: unknown };
    hooks.player = {
      x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
      cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
      dead: false,
    };
    return { w, hooks: hooks as never };
  }

  it('吸血蝙蝠(158)：玩家在下方近距离 → 化为人形吸血鬼(159)；离远 → 化回蝙蝠', () => {
    const { w, hooks } = flatWorld({ x: 30, y: 36 });
    const e = Enemy.fromVanilla(158, 30 * 16, 26 * 16)!; // 蝙蝠在玩家上方 10 格
    let became = false;
    for (let t = 0; t < 300; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vanillaId === 159) { became = true; break; }
    }
    expect(became).toBe(true);
    // 化回：把"玩家"挪远（>300px）再跑
    const p = (hooks as unknown as { player: { cx: number; cy: number } }).player;
    p.cx = 55 * 16; p.cy = 20 * 16;
    let back = false;
    for (let t = 0; t < 120; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vanillaId === 158) { back = true; break; }
    }
    expect(back).toBe(true);
  });

  it('失落女孩(195)：玩家靠近 21 tick → 变身宁芙(196)', () => {
    const { w, hooks } = flatWorld({ x: 30, y: 37 });
    const e = Enemy.fromVanilla(195, 30 * 16, 38 * 16)!; // 站玩家旁边
    let transformed = false;
    for (let t = 0; t < 120; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vanillaId === 196) { transformed = true; break; }
    }
    expect(transformed).toBe(true);
  });

  it('蜥蜴人(198)：HP≤55% → 激怒形态(199)', () => {
    const { w, hooks } = flatWorld({ x: 30, y: 38 });
    const e = Enemy.fromVanilla(198, 30 * 16, 39 * 16)!;
    e.hp = Math.floor(e.maxHp * 0.5);
    let transformed = false;
    for (let t = 0; t < 60; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vanillaId === 199) { transformed = true; break; }
    }
    expect(transformed).toBe(true);
  });
});
