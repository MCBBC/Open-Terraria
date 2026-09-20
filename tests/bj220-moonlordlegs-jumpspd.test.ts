// ★BJ220 月亮领主腿 5001 jumpSpd 三端统一（BJ216 登记的同族缺口清偿）：
// 原版 1457 UpdateJumpHeight :19731-19734 `if (moonLordLegs) { jumpSpeedBoost += 1.8f;
// extraFall += 10; jumpHeight++; }`——jumpSpeedBoost 经 jumpSpeed 字段同喂起跳/
// WingMovement JS/火箭脉冲三消费端。本仓原状：+1.8 仅 jumpBaseSnapshot 单点手码
// （组A/B 批 2026-09-18 落），翼飞 JS（PLAYER_JUMP_SPEED+eqM.jumpSpd :5978）漏喂。
// BJ216 翱翔徽章 4989 同族修法：accfx '5001'.jumpSpd 手补钉值 → 甲件主属性环
// （accFxJsonOfVid,Player.ts armorStat 环——甲件 accfx 唯一消费通道）→ eqM.jumpSpd
// 聚合位 → jumpBaseSnapshot(baseJumpSpd+=eqJ.jumpSpd) 与翼飞 JS/火箭脉冲同源；
// 快照手码 +1.8 摘除（防双计,快照仅留 jumpHeight++ = baseJumpTicks+1）。
// 探针设计（全确定性）：
//   · 起跳端：首跳帧 vy 差恰 1.8（BJ216 同式;若手码未摘=双计 → 差 3.6 爆红）
//   · 翼飞端：wingMovement 干支硬钳 vy=-JS*1.5（:22358 num3=1.5）——悬停中单帧
//     置 vy=-100,收拍 vy=-1.5×JS,腿装/裸装差恰 1.5×1.8=2.7
//   · 火箭端：推力脉冲硬钳 vy=-JS*1.5（:27152 同构）——脉冲期单帧置 vy=-100,
//     收拍差同 2.7
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { TILE, PLAYER_JUMP_SPEED } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const LEGS = vanillaItemKey(5001)!;        // vi_5001_MoonLordLegs
const WINGS = 'vi_493_天使之翼';           // wingsLogic 2,FlyTime 100
const BOOTS = 'vi_128_RocketBoots';        // rocketBoots 档 1
const JS0 = PLAYER_JUMP_SPEED;             // 裸装 jumpSpeed 基值

function makeWorld(): World {
  const w = new World(160, 300, 30, 'open');
  for (let x = 0; x < 120; x++) w.store.setTile(x, 100, 1);
  w.groundLevel = 100;
  return w;
}

function makePlayer(equip: Array<{ key: string; slot: number }>): { w: World; p: Player; hooks: GameHooks } {
  const w = makeWorld();
  const p = new Player(50 * TILE, 96 * TILE, new Inventory());
  p.hp = 100;
  for (const e of equip) p.inv.armor[e.slot] = { id: ITEM_BY_KEY[e.key], stack: 1 };
  const hooks = {
    world: w as never, player: p as never, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
  return { w, p, hooks };
}

describe('BJ220 月领腿 5001：jumpSpd 聚合位（accfx 甲件主属性环）', () => {
  it('腿槽装备 → equipStats.jumpSpd 恰 1.8（:19732;双计则 ≥3.6）+ moveMult 1.25（:13215 move 0.25 走同环）', () => {
    const { p } = makePlayer([{ key: LEGS, slot: 2 }]);
    expect(p.equipStats.moonLordLegs).toBe(true);
    expect(p.equipStats.jumpSpd).toBeCloseTo(1.8, 6);   // ★手码已摘,单源=accfx '5001'.jumpSpd
    expect(p.equipStats.moveMult).toBeCloseTo(1.25, 6); // 环上 move face 既有面（旁证环在吃 '5001'）
  });

  it('未装备 → jumpSpd 0（裸装基准）', () => {
    const { p } = makePlayer([]);
    expect(p.equipStats.moonLordLegs).toBe(false);
    expect(p.equipStats.jumpSpd).toBe(0);
  });

  it('腿装+徽章 4989 叠加 = 3.6（jumpSpd 累加语义 :2590 jumpSpeedBoost float 累加）', () => {
    const { p } = makePlayer([{ key: LEGS, slot: 2 }, { key: 'vi_4989_soaring_insignia', slot: 3 }]);
    expect(p.equipStats.jumpSpd).toBeCloseTo(3.6, 6);
  });
});

describe('BJ220 月领腿：起跳端（jumpBaseSnapshot 经 eqJ.jumpSpd）', () => {
  it('首跳帧 vy 差恰 1.8（手码若未摘/双计 → 3.6 爆红）', () => {
    const { p, hooks } = makePlayer([{ key: LEGS, slot: 2 }]);
    for (let i = 0; i < 60; i++) p.fixedUpdate(1 / 60, hooks);
    expect(p.onGround).toBe(true);
    p.inputJump = true;
    p.fixedUpdate(1 / 60, hooks);
    const vyLegs = p.vy;
    const { p: p2, hooks: h2 } = makePlayer([]);
    for (let i = 0; i < 60; i++) p2.fixedUpdate(1 / 60, h2);
    p2.inputJump = true;
    p2.fixedUpdate(1 / 60, h2);
    expect(vyLegs).toBeLessThan(p2.vy);              // 腿装起跳更快（更负）
    expect(p2.vy - vyLegs).toBeCloseTo(1.8, 3);      // 差恰 1.8
  });
});

describe('BJ220 月领腿：翼飞 JS 端（WingMovement 干支硬钳 -JS×1.5）', () => {
  it('悬停中单帧 vy=-100 → 收拍钳 -1.5×(JS0+1.8),腿/裸差恰 2.7', () => {
    const probe = (equip: Array<{ key: string; slot: number }>): number => {
      const { p, hooks } = makePlayer(equip);
      for (let i = 0; i < 60; i++) p.fixedUpdate(1 / 60, hooks);
      expect(p.onGround).toBe(true);
      p.inputJump = true;
      // 25t>PLAYER_JUMP_TICKS 起跳 sustain 预算——jumpHold 归零后才进翼飞态
      // （flying 门 :6008 要求 jumpHold===0;持续持跳翼飞,wingTime 100→75）
      for (let t = 0; t < 25; t++) p.fixedUpdate(1 / 60, hooks);
      p.vy = -100;                                                 // 远超钳带的注入
      p.fixedUpdate(1 / 60, hooks);
      p.inputJump = false;
      return p.vy;                                                 // = -JS×1.5（:22358）
    };
    const vyBare = probe([{ key: WINGS, slot: 3 }]);
    const vyLegs = probe([{ key: WINGS, slot: 3 }, { key: LEGS, slot: 2 }]);
    expect(vyBare).toBeCloseTo(-JS0 * 1.5, 3);
    expect(vyLegs).toBeCloseTo(-(JS0 + 1.8) * 1.5, 3);             // ★JS 含 +1.8（漏喂则=vyBare）
    expect(vyBare - vyLegs).toBeCloseTo(2.7, 3);                   // 1.5×1.8
  });
});

describe('BJ220 月领腿：火箭脉冲端（推力脉冲硬钳 -JS×1.5）', () => {
  it('脉冲期单帧 vy=-100 → 收拍钳 -1.5×(JS0+1.8),腿/裸差恰 2.7', () => {
    const probe = (equip: Array<{ key: string; slot: number }>): number => {
      const { p, hooks } = makePlayer(equip);
      for (let i = 0; i < 60; i++) p.fixedUpdate(1 / 60, hooks);
      expect(p.onGround).toBe(true);
      p.y = 70 * TILE; p.vy = 0;         // 空投（下落中 canRocket 锁存）
      p.inputJump = false;
      for (let t = 0; t < 40; t++) p.fixedUpdate(1 / 60, hooks);
      p.inputJump = true;                // 激活火箭:rocketTime-- + rocketDelay=10
      for (let t = 0; t < 2; t++) p.fixedUpdate(1 / 60, hooks);   // 脉冲进行中（delay 10→8）
      p.vy = -100;                       // 远超钳带注入
      p.fixedUpdate(1 / 60, hooks);
      p.inputJump = false;
      return p.vy;                       // = -JS×1.5（:27152）
    };
    const vyBare = probe([{ key: BOOTS, slot: 3 }]);
    const vyLegs = probe([{ key: BOOTS, slot: 3 }, { key: LEGS, slot: 2 }]);
    expect(vyBare).toBeCloseTo(-JS0 * 1.5, 3);
    expect(vyLegs).toBeCloseTo(-(JS0 + 1.8) * 1.5, 3);             // ★JS 含 +1.8
    expect(vyBare - vyLegs).toBeCloseTo(2.7, 3);
  });
});
