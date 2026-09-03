// 水中翅膀可脱离（2026-09-03 用户报"有翅膀但始终无法从水中脱离飞起"根因锁定）：
// 原版翅膀链（flag19 :26987 → WingMovement :22203 → WingFrame :26497 → 滑翔 :27015）
// 全程【无 wet 门】——水中翅膀照常工作；wingTime 回满 :26976-26982
// `((vy==0||sliding)&&releaseJump)` 为公共路径（水里踩底照样回满）。
// 本仓旧版两处分歧 → 翼装玩家 wingTime 干涸落水后困死弹跳环：
//   ① 翅膀核心整锁干燥分支 else（水中恒死）
//   ② 湿态无踩底回满（耗尽后永不再生）
// 用户实况：Red's Wings(665/wingsLogic 3)+脚蹼(187)，3 格浅池塘，
// 行为日志 2026-09-03T06-23-32 全程弹跳 y 7947↔8067 无一次脱离。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

// 深水池：底行 y=120，y 60-119 灌水（深 60 格——干态水跳 sustain 30t 仅升 ~11 格，
// 翅膀必须在【水下】接手才能持续上浮；★高 200 防 WetCollision 扫描窗钳位伪影，
// 同 water-jump.test.ts poolWorld 注）
function deepPool(): World {
  const w = new World(80, 200, 11, 'pool');
  for (let x = 0; x < 80; x++) {
    w.store.setTileSilent(x, 120, 1);
    for (let y = 60; y < 120; y++) w.store.setLiquid(x, y, 255, 1);
  }
  return w;
}

function makePlayer() {
  const w = deepPool();
  const p = new Player(40 * TILE, 90 * TILE, new Inventory());
  p.hp = 100;
  const iid = ITEM_BY_KEY['vi_493_天使之翼'];
  p.inv.armor[3] = { id: iid, stack: 1 };
  const hooks = {
    world: w, player: p, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
  return { w, p, hooks };
}

/** 沉底（松跳）：400t 足够从 y=90 沉到 y=120 池底（终端 5.01/t） */
function sinkToBottom(p: Player, hooks: GameHooks): void {
  p.inputJump = false;
  for (let i = 0; i < 400; i++) p.fixedUpdate(1 / 60, hooks);
}

describe('水中翅膀可脱离（wet×wing 翻案 2026-09-03）', () => {
  it('踩底回满：wingTime=0 湿态踩底静置 → wingTimeMax（:26978 公共路径湿侧）', () => {
    const { p, hooks } = makePlayer();
    expect(p.equipStats.wing?.logic).toBe(2);       // 装备链生效
    sinkToBottom(p, hooks);
    expect(p.inWater).toBe(true);
    expect(p.vy).toBe(0);                            // 池底 vy==0（回满门位）
    p.wingTime = 0;                                  // 干涸态（旧版此处永不再生 = 死锁）
    for (let i = 0; i < 20; i++) p.fixedUpdate(1 / 60, hooks);
    expect(p.wingTime).toBe(p.equipStats.wing?.time ?? 0);   // 100
  });

  it('水下翅膀接手：踩底按住跳，sustain 尽后 flag19 水下扇动持续提供升力', () => {
    const { p, hooks } = makePlayer();
    sinkToBottom(p, hooks);
    expect(p.wingTime).toBe(p.equipStats.wing?.time ?? 0);
    const y0 = p.y;
    p.inputJump = true;
    let minY = Infinity;
    let sawWetFlight = false;
    for (let t = 0; t < 200; t++) {
      p.fixedUpdate(1 / 60, hooks);
      minY = Math.min(minY, p.y);
      if (t > 35 && t < 80 && p.inWater && p.vy < -5.5) sawWetFlight = true;   // 水下扇动升力段
    }
    // 深池故意 60 格：天使之翼 FlyTime=100t 湿态位移 ×0.5（WetCollision factor,
    // Player.cs:28404）本就不足以一次冲出 60 格（原版同）——断言只锁
    // 「水下扇动接管」行为面：旧版 sustain 尽后湿重力 +0.2/t 把扇动 -0.1/t 掐死,
    // t35-80 段 vy≥-5.5（t≈32.5 即衰减穿过）且净升幅封顶 ~17 格。
    const rise = (y0 - minY) / TILE;
    expect(rise).toBeGreaterThan(20);                // 旧版 16.9 封顶（sustain+湿重力衰减）
    expect(sawWetFlight).toBe(true);                 // t35-80 仍 wet 且 vy<-5.5 = 扇动驱动
    expect(p.wingTime).toBeLessThan(100);            // 扇动真实耗能（旧版恒 0=未接手）
    p.inputJump = false;
  });

  it('干涸后仍可脱离：wingTime=0 落水 → 踩底回满 → 按住跳持续爬升（用户死锁环正向链）', () => {
    const { p, hooks } = makePlayer();
    sinkToBottom(p, hooks);
    p.wingTime = 0;
    // 旧版死锁环：仅剩 6.01 水跳弹跳，最高点封顶 sustain+湿重力衰减射程（~17 格）
    for (let i = 0; i < 30; i++) p.fixedUpdate(1 / 60, hooks);   // 静置回满
    expect(p.wingTime).toBe(p.equipStats.wing?.time ?? 0);
    p.inputJump = true;
    let minY = Infinity;
    for (let t = 0; t < 260; t++) {
      p.fixedUpdate(1 / 60, hooks);
      minY = Math.min(minY, p.y);
    }
    const rise = (120 * TILE - minY) / TILE;   // 相对池底(y=120 行顶面)升幅
    expect(rise).toBeGreaterThan(24);          // 远超无翅射程——翅膀水下接管驱动爬升
    p.inputJump = false;
  });
});
