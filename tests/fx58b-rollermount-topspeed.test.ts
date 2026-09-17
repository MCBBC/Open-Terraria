// FX58b：滚轴鞋坐骑（57-60 绿/蓝/白/派对,MountID.cs:146-154）极速/加速度面 1457 对齐复核。
//
// 用户实测"本仓最高 ~20mph、原版 58mph"定谳：
//  · 裸装平地极速 4 px/t ≈ 20.5mph = 原版同值（reset :24562-24565 accRunSpeed=裸 3、
//    叠加 :26838-26842 +1/+1/+0.1）——修前已 1:1,20mph 非缺陷;
//  · "58" 出处 = ①MountID 58（绿溜冰鞋,MountID.cs:150——wiki 坐骑页该值是坐骑 ID 非
//    mph;wiki 极速面只记"+5mph/巡航 9mph"）②沙+沙丘行者靴 11.5 px/t ≈ 58.8mph
//    （:26746 accRunSpeed×1.75 → +1 = 11.5,秒表实测 ~58）;
//  · 真差异（本批修）= 地面材质链 `!mnt` 门（原版 :26722-26772 无坐骑门,先于叠加
//    :26838-26842）+沙丘 accRun 支+荧光体乘区序+RollerSkateMovement ×2.25(:28769-28774)
//    的外层帽传播——下列断言钉死,均按「叠加前基底×m+加量」的原版乘区序复算。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { mphOf } from '../src/stats/InfoAccs';

function makeGame(w: World): GameHooks {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
  } as unknown as GameHooks;
}

async function mkPlayer(floorKey: string) {
  const w = new World(480, 80, 30, 'mat');
  const { TILE_BY_KEY } = await import('../src/data/tiles');
  const fid = TILE_BY_KEY[floorKey];
  for (let x = 0; x < 480; x++) w.store.setTileSilent(x, 70, fid, 0, 0);
  const game = makeGame(w);
  const inv = new (await import('../src/items/Inventory')).Inventory();
  const p = new Player(60 * TILE, 66 * TILE, inv);
  for (let i = 0; i < 30; i++) { p.fixedUpdate(1 / 60, game); }
  expect(p.onGround).toBe(true);
  p.vx = 0;
  return { p, game };
}

function step(p: Player, game: GameHooks): void { p.fixedUpdate(1 / 60, game); }

function withEq(player: Player, patch: Record<string, unknown>): void {
  const merged = { ...(player.equipStats as unknown as Record<string, unknown>), ...patch };
  Object.defineProperty(player, 'equipStats', { get: () => merged, configurable: true });
}

const MPH = 216000 / 42240;   // Main.cs:47898-47900（mphOf 单源直引同式）

describe('FX58b 滚轴鞋坐骑极速/加速度面（1457 :26722-26772/:26838-26842/:28769-28774）', () => {
  it('裸装平地极速 = 4 px/t ≈ 20.5mph（原版同值——20mph 非缺陷,回归守门）', async () => {
    const { p, game } = await mkPlayer('stone');
    p.mount.setMount(58, p);
    for (let t = 0; t < 10; t++) step(p, game);        // 坐骑落位沉降
    for (let t = 0; t < 220; t++) { p.inputX = 1; step(p, game); }
    expect(p.vx).toBeGreaterThan(3.5);                 // additive 帽 maxRun=3+1=4
    expect(p.vx).toBeLessThanOrEqual(4.3);             // 越帽锯齿容差
    expect(Math.round(p.vx * MPH)).toBe(20);           // 秒表读出 20（216000/42240 换算面）
  });

  it('沥青跑道极速 25.875 px/t ≈ 132mph：(3×3.5+1)×2.25——旧 !mnt 门时帽 4,×2.25 局部副本不传帽', async () => {
    const { p, game } = await mkPlayer('v_198_asphalt_block');
    p.mount.setMount(58, p);
    for (let t = 0; t < 10; t++) step(p, game);
    for (let t = 0; t < 400; t++) { p.inputX = 1; step(p, game); }
    expect(p.vx).toBeGreaterThan(25);                  // 修前 = 4（链跳过+帽不传播）——变异杀
    expect(p.vx).toBeLessThanOrEqual(26.2);            // 25.875+越帽过冲容差
    expect(Math.round(p.vx * MPH)).toBe(132);          // 秒表 132mph（wiki"基速×7.875+12mph"同式）
  });

  it('沥青加速段逐 tick = 原版复算 +0.18/t（runAcc=(0.08)+0.1,无地面摩擦直加段）', async () => {
    const { p, game } = await mkPlayer('v_198_asphalt_block');
    p.mount.setMount(58, p);
    for (let t = 0; t < 10; t++) step(p, game);
    p.vx = 0;
    const acc = 0.08 + 0.1;                            // RUN_ACCELERATION+mount.Acceleration(:26842)
    let ref = 0;
    for (let t = 0; t < 60; t++) {
      p.inputX = 1;
      ref += acc;                                      // 走步支 vx<maxRun(25.875) 满加速
      step(p, game);
      expect(Math.abs(p.vx - ref)).toBeLessThan(1e-9);
    }
  });

  it('沙+沙丘行者靴 accRun=(6×1.75)+1=11.5 → 极速 ≈58.8mph（"58" 出处二;旧 !mnt 门 = 7）', async () => {
    const { p, game } = await mkPlayer('sand');
    // 装备面：沙丘行者靴 4055（Item.cs:4055 accRunSpeed=6+desertBoots）
    const { ITEM_BY_KEY } = await import('../src/data/items');
    const { vanillaItemKey } = await import('../src/data/vanillaRecipes');
    const iid = ITEM_BY_KEY[vanillaItemKey(4055)!];
    if (iid) p.inv.armor[3] = { id: iid, stack: 1 };
    else withEq(p, { accRunSpeed: 6, desertBoots: true });
    p.mount.setMount(58, p);
    for (let t = 0; t < 10; t++) step(p, game);
    for (let t = 0; t < 500; t++) { p.inputX = 1; step(p, game); }
    expect(p.vx).toBeGreaterThan(11);                  // 修前 = 7（沙丘支被 !mnt 门跳过）——变异杀
    expect(p.vx).toBeLessThanOrEqual(12.3);            // 11.5+过冲容差
    expect(Math.round(p.vx * MPH)).toBe(59);           // 58.79 → 秒表 59（用户读数 ~58 同源）
  });

  it('蜂蜜块:链时钳 ±0.75（未叠加基底）+锯齿 ≤0.9——旧无钳时 ramp 到 4', async () => {
    const { p, game } = await mkPlayer('v_229_honey_block');
    p.mount.setMount(58, p);
    for (let t = 0; t < 10; t++) step(p, game);
    for (let t = 0; t < 120; t++) { p.inputX = 1; step(p, game); }
    expect(p.vx).toBeGreaterThan(0.6);                 // 钳 0.75+0.12 加速锯齿
    expect(p.vx).toBeLessThanOrEqual(0.95);            // :26727-26734 钳链时 maxRunSpeed(0.75)
  });

  it('荧光体+骑乘:乘叠加前基底 acc=(0.08×1.75)+0.1=0.24——旧序 (0.08+0.1)×1.75=0.315', async () => {
    const { p, game } = await mkPlayer('stone');
    withEq(p, { magiluminescence: true });
    p.mount.setMount(58, p);
    for (let t = 0; t < 10; t++) step(p, game);
    p.vx = 0;
    const acc = 0.08 * 1.75 + 0.1;                     // :26706 ×1.75 先于 :26842 +0.1
    for (let t = 0; t < 10; t++) { p.inputX = 1; step(p, game); }
    expect(Math.abs(p.vx - acc * 10)).toBeLessThan(1e-9);   // 2.4（旧 3.15——变异杀）
  });

  it('暗影套+骑乘:runAccMul/maxRunMul 消费面补齐,乘叠加前基底（:26711-26717 同荧光体序）', async () => {
    const { p, game } = await mkPlayer('stone');
    withEq(p, { runAccMul: 1.75, maxRunMul: 1.15, runSlowMul: 1.75 });
    p.mount.setMount(58, p);
    for (let t = 0; t < 10; t++) step(p, game);
    p.vx = 0;
    const acc = 0.08 * 1.75 + 0.1;                     // :26712 ×1.75 先于 :26842 +0.1
    for (let t = 0; t < 10; t++) { p.inputX = 1; step(p, game); }
    expect(Math.abs(p.vx - acc * 10)).toBeLessThan(1e-9);   // 2.4（旧 0.18/t=1.8——变异杀）
    for (let t = 0; t < 200; t++) { p.inputX = 1; step(p, game); }
    expect(p.vx).toBeGreaterThan(4.3);                 // maxRun=(3×1.15)+1=4.45（旧 4）
    expect(p.vx).toBeLessThanOrEqual(4.6);
  });

  it('暗影套裸装(无坐骑):×1.75/×1.15 同面补齐——acc=0.14/t、帽 3.45（此前零消费死数据）', async () => {
    const { p, game } = await mkPlayer('stone');
    withEq(p, { runAccMul: 1.75, maxRunMul: 1.15, runSlowMul: 1.75 });
    for (let t = 0; t < 10; t++) step(p, game);
    p.vx = 0;
    for (let t = 0; t < 10; t++) { p.inputX = 1; step(p, game); }
    expect(Math.abs(p.vx - 0.08 * 1.75 * 10)).toBeLessThan(1e-9);   // 1.4（旧 0.8）
    for (let t = 0; t < 200; t++) { p.inputX = 1; step(p, game); }
    expect(p.vx).toBeGreaterThan(3.3);                 // 3×1.15=3.45
    expect(p.vx).toBeLessThanOrEqual(3.6);
  });

  it('mph 读出换算面（Main.cs:47898-47900 系数 216000/42240）三点金标', () => {
    const wet = { honey: false, shimmer: false, water: false, merman: false, ignoreWater: false, trident: false };
    expect(mphOf(4, wet)).toBeCloseTo(4 * MPH, 9);           // 裸装平地 ≈20.45
    expect(mphOf(11.5, wet)).toBeCloseTo(58.8, 1);           // 沙+沙丘靴 ≈58.8 →"58" 出处二
    expect(mphOf(25.875, wet)).toBeCloseTo(132.3, 1);        // 沥青 ≈132.3
  });
});
