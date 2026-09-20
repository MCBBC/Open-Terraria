// ★BJ216 翱翔徽章（Soaring Insignia vid 4989,光女掉落配饰）用户实报定谳刀：
// 装备后翅膀应无限飞行时间（1.4.4+ 语义）。原版 1457 全语义（1458 交叉对拍零差异,
// 行号 1457 = 1458−1±0）：
//   · ApplyEquipFunctional :14877-14881 `empressBrooch = true; moveSpeed += 0.075f`
//   · UpdateJumpHeight :19721-19724 jumpSpeedBoost += 1.8（经 jumpSpeed 字段同喂
//     起跳/WingMovement JS/火箭脉冲——本仓走 accfx '4989'.jumpSpd→eqM.jumpSpd 聚合）
//   · WingMovement :22419-22422 `if (empressBrooch && wingTime != 0f) wingTime = wingTimeMax`
//     = 无限飞行（喷气 -2 :22238 / hover ×0.5 :22412 / 常规 -1 :22416 三支后同位;
//     无湿态/悬浮/坐骑豁免——湿链 WingMovement 同吃）
//   · Update :26698-26700 runAcceleration *= 1.75f（无 vy/坐骑门）
//   · Update :27063-27065 `if (empressBrooch) rocketTime = rocketTimeMax`（无门恒回满）
// 本仓落刀：empressBrooch 旗（接口/聚合/accVid 链）+ wingMovement 回满（签名加
// wingMax,湿/干两调用位）+ runAcc ×1.75（mulPreAdd 序）+ rocketTime 恒回满。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const BROOCH = 'vi_4989_soaring_insignia';
const WINGS = 'vi_493_天使之翼';      // wingsLogic 2,FlyTime 100
const BOOTS = 'vi_128_RocketBoots';   // rocketBoots 档 1

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

describe('BJ216 翱翔徽章 4989：旗面/数值面', () => {
  it('功能槽装备 → empressBrooch=true + moveMult 1.075（accfx move 0.075）+ jumpSpd 1.8', () => {
    const { p } = makePlayer([{ key: BROOCH, slot: 3 }]);
    expect(p.equipStats.empressBrooch).toBe(true);
    expect(p.equipStats.moveMult).toBeCloseTo(1.075, 6);   // :14880 moveSpeed += 0.075
    expect(p.equipStats.jumpSpd).toBeCloseTo(1.8, 6);      // :19721 jumpSpeedBoost += 1.8
  });

  it('未装备 → 旗 false / moveMult 1 / jumpSpd 0（裸装基准）', () => {
    const { p } = makePlayer([]);
    expect(p.equipStats.empressBrooch).toBe(false);
    expect(p.equipStats.moveMult).toBe(1);
    expect(p.equipStats.jumpSpd).toBe(0);
  });

  it('社交槽（虚荣位）不授效果（ApplyEquipFunctional 只扫功能槽）', () => {
    const { p } = makePlayer([{ key: BROOCH, slot: 13 }]);
    expect(p.equipStats.empressBrooch).toBe(false);
    expect(p.equipStats.moveMult).toBe(1);
    expect(p.equipStats.jumpSpd).toBe(0);
  });

  it('jumpSpd 1.8 进起跳面：jumpBaseSnapshot 基速 = PLAYER_JUMP_SPEED+1.8', () => {
    // 经 jump 起跳帧 vy 采样（不持跳：松键上升衰减前首帧 vy = -(JS+1.8)）
    const { p, hooks } = makePlayer([{ key: BROOCH, slot: 3 }]);
    for (let i = 0; i < 60; i++) p.fixedUpdate(1 / 60, hooks);
    expect(p.onGround).toBe(true);
    p.inputJump = true;
    p.fixedUpdate(1 / 60, hooks);
    const vyBrooch = p.vy;
    const { p: p2, hooks: h2 } = makePlayer([]);
    for (let i = 0; i < 60; i++) p2.fixedUpdate(1 / 60, h2);
    p2.inputJump = true;
    p2.fixedUpdate(1 / 60, h2);
    expect(vyBrooch).toBeLessThan(p2.vy);              // 徽章起跳更快（更负）
    expect(p2.vy - vyBrooch).toBeCloseTo(1.8, 3);      // 差恰 1.8
  });
});

describe('BJ216 翱翔徽章：无限飞行（WingMovement :22419 回满）', () => {
  it('干态：徽章+翅膀持跳 600t → wingTime 恒满 100、恒离地（无徽章耗尽=0）', () => {
    const { p, hooks } = makePlayer([{ key: WINGS, slot: 3 }, { key: BROOCH, slot: 4 }]);
    for (let i = 0; i < 60; i++) p.fixedUpdate(1 / 60, hooks);
    expect(p.onGround).toBe(true);
    p.inputJump = true;
    let minWt = Infinity;
    for (let t = 0; t < 600; t++) {
      p.fixedUpdate(1 / 60, hooks);
      minWt = Math.min(minWt, p.wingTime);
    }
    expect(p.equipStats.wing?.time).toBe(100);
    expect(minWt).toBe(100);            // 每拍扇动 -1 后 :22419 回满 = 恒满
    expect(p.onGround).toBe(false);     // 600t（=普通翼 6 倍预算）仍飞行
    p.inputJump = false;

    // 基线：无徽章同程 wingTime 耗尽
    const { p: p2, hooks: h2 } = makePlayer([{ key: WINGS, slot: 3 }]);
    for (let i = 0; i < 60; i++) p2.fixedUpdate(1 / 60, h2);
    p2.inputJump = true;
    let minWt2 = Infinity;
    for (let t = 0; t < 600; t++) {
      p2.fixedUpdate(1 / 60, h2);
      minWt2 = Math.min(minWt2, p2.wingTime);
    }
    expect(minWt2).toBe(0);
  });

  it('湿态同吃（原版无湿态豁免）：深池水下持跳 → wingTime 恒满、持续上浮', () => {
    const w = new World(80, 200, 11, 'pool');
    for (let x = 0; x < 80; x++) {
      w.store.setTileSilent(x, 120, 1);
      for (let y = 60; y < 120; y++) w.store.setLiquid(x, y, 255, 1);
    }
    const p = new Player(40 * TILE, 90 * TILE, new Inventory());
    p.hp = 100;
    p.inv.armor[3] = { id: ITEM_BY_KEY[WINGS], stack: 1 };
    p.inv.armor[4] = { id: ITEM_BY_KEY[BROOCH], stack: 1 };
    const hooks = {
      world: w as never, player: p as never, enemies: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {}, notifyInventoryChanged: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    } as unknown as GameHooks;
    p.inputJump = false;
    for (let i = 0; i < 400; i++) p.fixedUpdate(1 / 60, hooks);   // 沉底
    expect(p.inWater).toBe(true);
    const y0 = p.y;
    p.inputJump = true;
    let minWt = Infinity;
    let minY = Infinity;
    for (let t = 0; t < 300; t++) {
      p.fixedUpdate(1 / 60, hooks);
      minWt = Math.min(minWt, p.wingTime);
      minY = Math.min(minY, p.y);
    }
    expect(minWt).toBe(100);                        // 湿链 wingMovement 同位回满
    expect((y0 - minY) / TILE).toBeGreaterThan(20); // 持续上浮远超单轮翼预算
    p.inputJump = false;
  });

  it('边界：无翅膀时零飞行面——wingTime 恒 0、正常落地（:26948 wingsLogic==0 清零门在前）', () => {
    const { p, hooks } = makePlayer([{ key: BROOCH, slot: 3 }]);
    for (let i = 0; i < 60; i++) p.fixedUpdate(1 / 60, hooks);
    expect(p.onGround).toBe(true);
    // 空中按跳：无翼不可飞,徽章不得凭空给滞空
    p.y = 80 * TILE; p.vy = 0;
    p.inputJump = true;
    for (let t = 0; t < 200; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.wingTime).toBe(0);
    expect(p.onGround).toBe(true);      // 已落地（无任何飞行/火箭面）
  });
});

describe('BJ216 翱翔徽章：火箭靴恒回满（:27063）', () => {
  it('徽章+火箭靴（无翼）空中持跳 → rocketTime 恒 7 永续悬停（无徽章 7 发耗尽落地）', () => {
    const { p, hooks } = makePlayer([{ key: BOOTS, slot: 3 }, { key: BROOCH, slot: 4 }]);
    for (let i = 0; i < 60; i++) p.fixedUpdate(1 / 60, hooks);
    expect(p.onGround).toBe(true);
    p.y = 70 * TILE; p.vy = 0;          // 空投起步（下落中 canRocket 锁存）
    p.inputJump = false;
    for (let t = 0; t < 40; t++) p.fixedUpdate(1 / 60, hooks);   // 下落,rocketRelease=true
    p.inputJump = true;
    let minRt = Infinity;
    for (let t = 0; t < 500; t++) {
      p.fixedUpdate(1 / 60, hooks);
      minRt = Math.min(minRt, p.rocketTime);
    }
    expect(minRt).toBe(7);              // :27063 每拍无门回满 = 永不衰减
    expect(p.onGround).toBe(false);     // 持续悬停/爬升
    p.inputJump = false;

    // 基线：无徽章 7 发耗尽（rocketTime→0）后落地
    const { p: p2, hooks: h2 } = makePlayer([{ key: BOOTS, slot: 3 }]);
    for (let i = 0; i < 60; i++) p2.fixedUpdate(1 / 60, h2);
    p2.y = 70 * TILE; p2.vy = 0;
    p2.inputJump = false;
    for (let t = 0; t < 40; t++) p2.fixedUpdate(1 / 60, h2);
    p2.inputJump = true;
    let minRt2 = Infinity;
    for (let t = 0; t < 500; t++) {
      p2.fixedUpdate(1 / 60, h2);
      minRt2 = Math.min(minRt2, p2.rocketTime);
    }
    expect(minRt2).toBe(0);
    expect(p2.onGround).toBe(true);     // 脉冲耗尽后落地
  });
});

describe('BJ216 翱翔徽章：runAcceleration ×1.75（:26698）', () => {
  it('地面直线加速：徽章/裸装初段 vx 比恰 1.75（moveMult 1.075 两侧同乘）', () => {
    const run = (equip: Array<{ key: string; slot: number }>): number => {
      const { p, hooks } = makePlayer(equip);
      for (let i = 0; i < 60; i++) p.fixedUpdate(1 / 60, hooks);
      p.inputX = 1;
      for (let t = 0; t < 10; t++) p.fixedUpdate(1 / 60, hooks);   // 全速段线性带
      p.inputX = 0;
      return p.vx;
    };
    const vxBase = run([]);
    const vxBrooch = run([{ key: BROOCH, slot: 3 }]);
    expect(vxBrooch).toBeGreaterThan(0);
    // 组合比 = 1.075(:14880 moveSpeed+=0.075) × 1.75(:26698) = 1.88125；
    // 除净 moveMult 因子后恰 1.75
    expect(vxBrooch / vxBase).toBeCloseTo(1.88125, 4);
    expect(vxBrooch / (vxBase * 1.075)).toBeCloseTo(1.75, 3);
    expect(vxBrooch).toBeGreaterThan(1.4);            // 10t×0.08×1.075×1.75 ≈ 1.505
  });
});
