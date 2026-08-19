// 兔子 AI 家族归属回归（2026-08-17）：
//   兔 46 / 蚱蜢 377 在原版是**两个 aiStyle 家族**——
//   - 兔/松鼠/鼠/蛙/鸭/金兔/神秘蛙 687 = aiStyle 7（AI_007 TownCritter 行走族：
//     平地恒速行走 + 站/走循环，仅越障时三档跳，NPC.cs:53366）
//   - 蚱蜢 377/446 = aiStyle 1（史莱姆弹跳族，周期抛物线跳跃）
//   旧自研 Critter 类给全部 hop 种套弹跳 = 用户"兔子像蚱蜢"根因；该类环境生成
//   已退役（spawnCritter 池尾/释放/687 全改 Enemy 出生），本组锁定行走族语义：
//   平地不自发起跳 + 站/走速度循环 + 687 可 Enemy 化出生 + 释放表指向真类型。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { CRITTER_RELEASE_BY_ITEM } from '../src/data/critters';

function flatWorld(playerAt: { x: number; y: number } | null = null) {
  const w = new World(80, 80, 42, 'open');
  w.groundLevel = 42;
  const st = w.store;
  for (let x = 0; x < 80; x++) st.setTileSilent(x, 60, 2); // 平地板 y=60，无障碍
  // （2026-08-19 G1 批起全宽板：蚱蜢跳冲量+空中转向满速 3 → 两跳即脱离玩家
  //  200px 激愤圈转被动行走——窄板会坠缘产生假 hop 计数）
  const hooks = {
    world: w,
    player: playerAt ? {
      x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
      cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
      dead: false, useTime: 0,
    } : null,
    playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
    spawnDrop: () => null, damagePlayer: () => {},
    entities: { add: () => {} },
    enemies: () => [] as unknown[],
  } as never;
  return { w, hooks };
}

describe('小动物行走族 vs 弹跳族（aiStyle 7 vs 1）', () => {
  it('兔 46 平地行走：全程不起跳（vy ≥ −0.5），速度有站/走循环', () => {
    const { hooks } = flatWorld();
    const e = Enemy.fromVanilla(46, 40 * 16, 59 * 16)!;
    let maxJumpVy = 0;          // 最负 vy（起跳为负）
    let peakSpeed = 0;
    let standTicks = 0;
    for (let t = 0; t < 4000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vy < maxJumpVy) maxJumpVy = e.vy;
      peakSpeed = Math.max(peakSpeed, Math.abs(e.vx));
      if (Math.abs(e.vx) < 0.05) standTicks++;
    }
    expect(maxJumpVy).toBeGreaterThanOrEqual(-0.5);  // 平地无越障 → 无自发跳
    expect(peakSpeed).toBeGreaterThan(0.8);          // 行走段逼近 maxX=1（accel 0.07）
    expect(standTicks).toBeGreaterThan(60);          // 站立段（ai0=0 刹车至 0）
  });

  it('玩家贴身时兔 46 仍平地行走（原版小动物不因玩家邻近起跳/逃离）', () => {
    const { hooks } = flatWorld({ x: 41, y: 58 });   // 玩家距兔 ~1.5 格
    const e = Enemy.fromVanilla(46, 40 * 16, 59 * 16)!;
    let maxJumpVy = 0;
    for (let t = 0; t < 2000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vy < maxJumpVy) maxJumpVy = e.vy;
    }
    expect(maxJumpVy).toBeGreaterThanOrEqual(-0.5);  // 危险扫描只认敌怪（cs:53887）
  });

  it('同场景蚱蜢 377（aiStyle 1）玩家邻近时以周期抛物线跳跃推进（对照组）', () => {
    const { hooks } = flatWorld({ x: 41, y: 58 });   // 200px 内玩家 → 激愤跳（cs:61479）
    const e = Enemy.fromVanilla(377, 40 * 16, 59 * 16)!;
    let hops = 0;
    let prevAir = false;
    let farWalk = 0;
    for (let t = 0; t < 2000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      const air = e.vy < -1;
      if (air && !prevAir) hops++;
      prevAir = air;
      // 激愤逃跳两跳脱离 200px 圈后：转被动慢爬（vx 恒 ≤0.2，仓内走路档）
      if (t > 400 && Math.abs(e.vx) > 0 && Math.abs(e.vx) <= 0.21 && e.onGround) farWalk++;
    }
    // 2026-08-19 G1 批（groundPhysics 废除 ±1 硬钳与 ×0.98 尾段摩擦）后按 1:1
    // 新语义更新：跳冲量完整 + 滞空转向步进至满速 3（:62130-62133）→ 蚱蜢两跳
    // 即脱离玩家 200px 激愤圈（cs:61479 flag3 门）转被动行走——旧断言 >2 依赖被
    // 废除的钳（跳距被砍 → 滞留圈内反复跳），非原版行为
    expect(hops).toBeGreaterThanOrEqual(2);          // 弹跳族：周期抛物线逃跳已发生
    expect(farWalk).toBeGreaterThan(100);            // 脱离后被动慢爬（原版激愤门语义）
  });

  it('神秘青蛙 687 可 Enemy 出生且走 aiStyle 7 行走族（侧信道退役前提）', () => {
    const { hooks } = flatWorld();
    const e = Enemy.fromVanilla(687, 40 * 16, 59 * 16)!;
    expect(e).not.toBeNull();
    expect(e.vanilla?.aiStyle).toBe(7);
    let maxJumpVy = 0;
    for (let t = 0; t < 2000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vy < maxJumpVy) maxJumpVy = e.vy;
    }
    expect(maxJumpVy).toBeGreaterThanOrEqual(-0.5);  // 平地行走，不蹦
  });

  it('释放表：捕获物 2019 → 出生真类型 46（ReleaseNPC NewNPC(Type)）', () => {
    expect(CRITTER_RELEASE_BY_ITEM[2019]).toBe(46);   // 兔
    expect(CRITTER_RELEASE_BY_ITEM[2740]).toBe(377);  // 蚱蜢
    expect(CRITTER_RELEASE_BY_ITEM[2122]).toBe(362);  // 野鸭（行走形）
  });
});
