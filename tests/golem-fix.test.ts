// 石巨人三症状回归(用户报 2026-08-19):负血不死 / boss bar 无头像 / 动画帧乱闪
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { BOSS_HEAD_INDEX } from '../src/data/vanillaNpcs';
import type { GameHooks } from '../src/entities/types';

function makeGame(world: World, enemies: Enemy[] = []): GameHooks {
  return {
    world,
    player: { x: 30 * 16 + 16, y: 30 * 16, w: 12, h: 28, dead: false,
      get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; },
      vx: 0, vy: 0, useTime: 5, addDPS: () => {}, buffs: { apply: () => {}, has: () => false },
      equipStats: {} },
    enemies: () => enemies,
    spawnParticles: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    addDamageNumber: () => {}, damagePlayer: () => {}, spawnDrop: () => {},
    spawnEnemy: () => null, spawnProj: () => {},
    onEnemyKilled: () => {}, critters: () => [],
  } as unknown as GameHooks;
}

function makeWorld(): World {
  const w = new World(60, 60, 7, 'golem-fix');
  const st = w.store;
  for (let x = 0; x < 60; x++) for (let y = 0; y < 60; y++) st.setTileSilent(x, y, y > 40 ? 1 : 0, 0, 0);
  return w;
}

describe('石巨人负血不死修复(hurt 契约)', () => {
  it('拳 247 血尽 → 标准死亡(dead=true,不再放行)', () => {
    const g = makeGame(makeWorld());
    const fist = Enemy.fromVanilla(247, 30 * 16, 30 * 16)!;
    fist.hurt(99999, 0, 0, g);
    expect(fist.dead).toBe(true);          // ★曾放行 return false → 负血挂着不死
  });

  it('本体 245 血尽 → 标准死亡;部件下一拍自灭(锚主检测,原版时序)', () => {
    const w = makeWorld();
    const head = Enemy.fromVanilla(246, 30 * 16, 30 * 16)!;
    const fist = Enemy.fromVanilla(247, 30 * 16, 30 * 16)!;
    const body = Enemy.fromVanilla(245, 30 * 16, 30 * 16)!;
    const g = makeGame(w, [body, head, fist]);
    body.hurt(99999, 0, 0, g);
    expect(body.dead).toBe(true);          // ★曾 AI 首行接管但 hurt 不置 dead → 永不死
    expect(head.dead).toBe(false);         // 原版部件下一 tick 自杀(StrikeNPCNoInteraction)
    head.fixedUpdate(1 / 60, g);
    fist.fixedUpdate(1 / 60, g);
    expect(head.dead).toBe(true);          // 锚主死 → 标准死(碎块/音效管线)
    expect(fist.dead).toBe(true);
  });

  it('挂载头 246 血尽(本体活) → 放行(转自由态在 golemHeadAI 首行)', () => {
    const w = makeWorld();
    const body = Enemy.fromVanilla(245, 30 * 16, 30 * 16)!;
    const head = Enemy.fromVanilla(246, 30 * 16, 30 * 16)!;
    const g = makeGame(w, [body, head]);
    head.hurt(99999, 0, 0, g);
    expect(head.dead).toBe(false);         // 本体活 → 放行,AI 首行转 249 自由态
    expect(head.def.killedSound).toEqual([]);   // 原版 246 DeathSound=null:标准死零死音
  });

  it('存量负血自愈:直写负 hp 后 AI 首帧收口(本体/拳;头随锚主自灭)', () => {
    const w = makeWorld();
    const head = Enemy.fromVanilla(246, 30 * 16, 30 * 16)!;
    const fist = Enemy.fromVanilla(247, 30 * 16, 30 * 16)!;
    const body = Enemy.fromVanilla(245, 30 * 16, 30 * 16)!;
    const g = makeGame(w, [body, head, fist]);
    // 模拟旧版放行年代留下的负血存量(hp≤0 但未 dead、不再受击)
    body.hp = -50; fist.hp = -30;
    body.fixedUpdate(1 / 60, g);
    fist.fixedUpdate(1 / 60, g);
    head.fixedUpdate(1 / 60, g);
    expect(body.dead).toBe(true);
    expect(fist.dead).toBe(true);
    expect(head.dead).toBe(true);          // 本体死透 → 锚主段标准死
  });
});

describe('石巨人帧(FindFrame :73581-73651 状态帧)', () => {
  it('本体待机按 ai1 蹲伏档选帧,跳跃态恒帧0', () => {
    const g = makeGame(makeWorld());
    const e = Enemy.fromVanilla(245, 30 * 16, 30 * 16)!;
    e.ai0 = 0; e.ai1 = -15; e.fixedUpdate(1 / 60, g);
    expect(e.customFrameIdx).toBe(1);      // -16 ≤ -15 < -12 → 帧1
    e.ai1 = -5; e.fixedUpdate(1 / 60, g);
    expect(e.customFrameIdx).toBe(3);      // -8 ≤ -5 < -4?否:-5 < -4 → 帧3
    e.ai1 = 100; e.fixedUpdate(1 / 60, g);
    expect(e.customFrameIdx).toBe(0);      // 蓄力正计时 → 帧0
    e.ai0 = 1; e.ai1 = 0; e.fixedUpdate(1 / 60, g);
    expect(e.customFrameIdx).toBe(0);      // 跳跃(原版 frame.Y=1 像素笔误≈帧0)
  });
});

describe('boss bar 头像', () => {
  it('本体 245 有头像索引(Golem=Head_Boss_5)', () => {
    expect(BOSS_HEAD_INDEX[245]).toBe(5);
    expect(BOSS_HEAD_INDEX[246]).toBe(5);
    expect(BOSS_HEAD_INDEX[249]).toBe(5);
  });
});

describe('数据对齐(1456 :12095-12149;曾提取自 1405 旧值)', () => {
  it('族血量取 1456 终值(本体 15000/头 25000/拳 10000/自由头 16000)', () => {
    const g = makeGame(makeWorld());
    expect(Enemy.fromVanilla(245, 0, 0)!.maxHp).toBe(15000);
    expect(Enemy.fromVanilla(246, 0, 0)!.maxHp).toBe(25000);
    expect(Enemy.fromVanilla(247, 0, 0)!.maxHp).toBe(10000);
    expect(Enemy.fromVanilla(249, 0, 0)!.maxHp).toBe(16000);
    void g;
  });
  it('普通世界 scale=1(FTW ×0.5 由 getGoodAdjustments 管,勿在数据层恒置)', () => {
    const body = Enemy.fromVanilla(245, 0, 0)!;
    expect(body.vanilla?.scale ?? 1).toBe(1);   // ★曾误加恒 scale:0.5 → 贴图/盒缩半
  });
});
