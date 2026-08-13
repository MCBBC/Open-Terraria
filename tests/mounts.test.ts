// 坐骑系统 1:1 回归（Terarria1456 Mount.cs + MountID.cs + Player.cs 骑乘接管段）：
//   1 数据表（tools/extract-mounts.mjs ← Mount.cs Initialize）：每坐骑参数/帧组/贴图
//   2 召唤物品链（Item.cs `mountType = N`）：1914 驯鹿/2428 胡萝卜/2429 松果/
//     2430 粘鞍/2491 硬鞍/2502 花蜜 + 矿车族 2343→6
//   3 MountInstance 状态机：上下坐/能量/疲劳/帧态/特例 RunSpeed 与跳跃加成
//   4 三模物理接管（Player.fixedUpdate）：陆行参数覆写 / 飞行 hover 能量 / 游泳 ignoreWater
//   5 摔伤系数（fallDamage）与 extraFall 豁免、海龟免淹（:22953）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import {
  MOUNT_DATA, MOUNT_NAMES, MOUNT_SETS, MOUNT_TEXTURE_OK,
  mountOfItem, mountOfBuff, MountInstance, isCartMount,
  FRAME_STANDING, FRAME_RUNNING, FRAME_IN_AIR, FRAME_FLYING, FRAME_SWIMMING,
  type MountedPlayerView,
} from '../src/entities/Mounts';
import { TILE } from '../src/core/constants';
import { BuffType } from '../src/stats/Buffs';

// ---- 测试世界/玩家（breath.test.ts 同款 harness） ----
const fakeHooks = (w: World, p?: Player) => ({
  world: w, player: p, enemies: () => [], critters: () => [],
  spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
  cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
  spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
  playSfxFiles: () => {}, showPickupLabel: () => {},
});
const mkWorld = (): World => {
  const w = new World(80, 120, 72, 'mounts');
  for (let x = 20; x <= 60; x++) w.store.setTileSilent(x, 80, 1);
  return w;
};
const mkPlayer = (w: World): Player => new Player(30 * 16, 77 * 16, new Inventory());
const tick = (p: Player, w: World, n: number): void => {
  for (let i = 0; i < n; i++) p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
};
/** MountInstance 单元测试用的玩家视图桩 */
const view = (over: Partial<MountedPlayerView> = {}): MountedPlayerView => ({
  x: 100, y: 100, w: 20, h: 42, vx: 0, vy: 0,
  onGround: true, inWater: false, facing: 1,
  inputX: 0, inputJump: false, inputUp: false, inputDown: false,
  prevInputJump: false, gravDir: 1, store: null, ...over,
});

describe('坐骑数据表（Mount.cs Initialize 提取）', () => {
  it('64 坐骑全量登记 + 名称表', () => {
    expect(Object.keys(MOUNT_DATA)).toHaveLength(64);
    expect(MOUNT_NAMES['0']).toBe('Rudolph');
    expect(MOUNT_NAMES['7']).toBe('UFO');
    expect(MOUNT_NAMES['63']).toBe('ChilletIgnis');
  });

  it('陆行族参数：驯鹿/兔兔/史莱姆/蜥蜴/独角兽', () => {
    expect(MOUNT_DATA['0']).toMatchObject({ buff: 90, flightTimeMax: 160, runSpeed: 5.5, dashSpeed: 12, acceleration: 0.09, jumpHeight: 17, jumpSpeed: 5.31 });
    expect(MOUNT_DATA['1']).toMatchObject({ buff: 128, runSpeed: 4, dashSpeed: 7.8, acceleration: 0.13, fallDamage: 0.8 });
    expect(MOUNT_DATA['3']).toMatchObject({ constantJump: true, fallDamage: 0.5, extraFall: 10, jumpSpeed: 8.25 });
    expect(MOUNT_DATA['14']).toMatchObject({ buff: 193, runSpeed: 8, jumpHeight: 20 });
    expect(MOUNT_DATA['10']).toMatchObject({ buff: 162, fallDamage: 0.2, dashSpeed: 12 });
  });

  it('飞行族参数：UFO/蜜蜂/猪鲨崽/巫婆扫帚（usesHover + 能量双池）', () => {
    expect(MOUNT_DATA['7']).toMatchObject({ usesHover: true, flightTimeMax: 320, fatigueMax: 320, runSpeed: 8, fallDamage: 0 });
    expect(MOUNT_DATA['5']).toMatchObject({ usesHover: true, flightTimeMax: 320, fatigueMax: 320, runSpeed: 2 });
    expect(MOUNT_DATA['12']).toMatchObject({ usesHover: true, swimSpeed: 16, fallDamage: 0 });
    expect(MOUNT_DATA['23']).toMatchObject({ usesHover: true, flightTimeMax: 320, runSpeed: 9 });
    // 非 hover 的飞行坐骑：驯鹿/猪龙只有 flightTimeMax
    expect(MOUNT_DATA['2']).toMatchObject({ flightTimeMax: 160 });
    expect(MOUNT_DATA['2'].usesHover).toBeUndefined();
  });

  it('游泳族参数：海龟 swimSpeed 10 / buff 131', () => {
    expect(MOUNT_DATA['4']).toMatchObject({ buff: 131, swimSpeed: 10, runSpeed: 2, heightBoost: 26 });
    expect(MOUNT_DATA['49']).toMatchObject({ buff: 305, swimSpeed: 14 });
  });

  it('MountID.Sets 能力位（Cart/CanUseHooks/IsTransformationMount）', () => {
    expect(MOUNT_SETS.Cart[6]).toBe(true);
    expect(MOUNT_SETS.Cart[53]).toBe(true);
    expect(MOUNT_SETS.Cart[0]).toBe(false);
    expect(MOUNT_SETS.CanUseHooks).toEqual(expect.arrayContaining([true]));
    expect(MOUNT_SETS.IsTransformationMount[52]).toBe(true);
    expect(MOUNT_SETS.IsTransformationMount[0]).toBe(false);
  });

  it('贴图可得性登记：主贴图 60/64；滚轴鞋族（57-60）无贴图走色块近似', () => {
    const ok = Object.entries(MOUNT_TEXTURE_OK).filter(([, v]) => v).length;
    expect(ok).toBe(60);
    expect(MOUNT_TEXTURE_OK['57']).toBe(false);
    expect(MOUNT_TEXTURE_OK['0']).toBe(true);
  });

  it('召唤物品链（Item.cs mountType）：鞍族 + 矿车族', () => {
    expect(mountOfItem(1914)).toBe(0);   // 驯鹿铃铛
    expect(mountOfItem(2428)).toBe(1);   // 绒毛胡萝卜
    expect(mountOfItem(2429)).toBe(2);   // 带鳞松果
    expect(mountOfItem(2430)).toBe(3);   // 粘鞍
    expect(mountOfItem(2491)).toBe(4);   // 硬鞍
    expect(mountOfItem(2502)).toBe(5);   // 花蜜
    expect(mountOfItem(3260)).toBe(10);  // 独角兽
    expect(mountOfItem(2769)).toBe(7);   // UFO
    expect(mountOfItem(4716)).toBe(37);  // 火烈鸟
    expect(mountOfItem(2343)).toBe(6);   // 矿车（DefaultToMinecart）
    expect(mountOfItem(3353)).toBe(11);  // 机械矿车
    expect(mountOfItem(8)).toBe(-1);     // 非召唤物
  });

  it('坐骑 buff 表（BuffID.Sets.MountType）', () => {
    expect(mountOfBuff(90)).toBe(0);
    expect(mountOfBuff(131)).toBe(4);
    expect(mountOfBuff(141)).toBe(7);
    expect(mountOfBuff(118)).toBe(6);
  });
});

describe('MountInstance 状态机（Mount.cs 行为）', () => {
  it('setMount/dismount 生命周期 + isCart 门', () => {
    const m = new MountInstance();
    expect(m.active).toBe(false);
    expect(m.setMount(1, view())).toBe(true);
    expect(m.active && m.type).toBe(1);
    expect(m.isCart).toBe(false);
    expect(m.setMount(6, view())).toBe(true);
    expect(m.isCart).toBe(true);          // 矿车族标记（物理仍由 Minecart 接管）
    m.dismount(view());
    expect(m.active).toBe(false);
    expect(m.type).toBe(-1);
  });

  it('蜜蜂浸水不可上（SetMount :6190 m==5 && wet）', () => {
    const m = new MountInstance();
    expect(m.setMount(5, view({ inWater: true }))).toBe(false);
    expect(m.setMount(5, view({ inWater: false }))).toBe(true);
  });

  it('同型重复上坐被拒（SetMount :6189 _type == m）', () => {
    const m = new MountInstance();
    m.setMount(1, view());
    expect(m.setMount(1, view())).toBe(false);
    expect(m.type).toBe(1);
  });

  it('RunSpeed 特例（:451-486）：蜜蜂空中随疲劳衰减 / 猪鲨崽空中 +13.5 / 海龟游泳态', () => {
    const bee = new MountInstance();
    bee.setMount(5, view());
    bee.frameState = FRAME_STANDING;
    expect(bee.runSpeed()).toBe(2);
    bee.frameState = FRAME_IN_AIR;
    expect(bee.runSpeed()).toBeCloseTo(6);        // 2 + 4×(1-0)
    // 疲劳半池 → 加成减半
    (bee as unknown as { fatigue: number }).fatigue = 160;
    (bee as unknown as { fatigueMax: number }).fatigueMax = 320;
    expect(bee.runSpeed()).toBeCloseTo(4);
    const fish = new MountInstance();
    fish.setMount(12, view());
    fish.frameState = FRAME_IN_AIR;
    expect(fish.runSpeed()).toBeCloseTo(15.5);    // 2 + 13.5
    const turtle = new MountInstance();
    turtle.setMount(4, view());
    turtle.frameState = FRAME_SWIMMING;
    expect(turtle.runSpeed()).toBe(10);           // swimSpeed
    turtle.frameState = FRAME_STANDING;
    expect(turtle.runSpeed()).toBe(2);
  });

  it('跳跃参数特例（:2767-2816）：驯鹿 |vx|/4 与 /7；海龟游泳态 +5/+2.5', () => {
    const rud = new MountInstance();
    rud.setMount(0, view());
    expect(rud.jumpHeight(8)).toBe(17 + 2);       // trunc(8/4)
    expect(rud.jumpSpeed(7)).toBeCloseTo(5.31 + 1);
    const turtle = new MountInstance();
    turtle.setMount(4, view());
    expect(turtle.jumpHeight(0)).toBe(12);
    turtle.frameState = FRAME_SWIMMING;
    expect(turtle.jumpHeight(0)).toBe(17);        // +5
    expect(turtle.jumpSpeed(0)).toBeCloseTo(6.2); // 3.7 + 2.5
  });

  it('canFly/canHover（:2817-2859）：陆行不可飞、hover 族可悬停、熔岩鲨限水中', () => {
    const bunny = new MountInstance();
    bunny.setMount(1, view());
    expect(bunny.canFly(view())).toBe(false);
    expect(bunny.canHover(view())).toBe(false);
    const ufo = new MountInstance();
    ufo.setMount(7, view());
    expect(ufo.canFly(view())).toBe(true);
    expect(ufo.canHover(view())).toBe(true);
    const shark = new MountInstance();
    shark.setMount(49, view());
    shark.frameState = FRAME_IN_AIR;
    expect(shark.canHover(view())).toBe(false);
    shark.frameState = FRAME_SWIMMING;
    expect(shark.canHover(view())).toBe(true);
  });

  it('飞行时量与疲劳（Flight :2937 / FatigueRecovery :2925 / ResetFlightTime :5260）', () => {
    const rud = new MountInstance();
    rud.setMount(0, view({ vx: 4 }));
    rud.resetFlightTime(view({ vx: 4 }));
    // 驯鹿落地续飞：160 + trunc(4×20) = 240
    expect(rud.flyTime).toBe(240);
    let n = 0;
    while (rud.flight()) n++;
    expect(n).toBe(240);
    expect(rud.flight()).toBe(false);
    // 疲劳恢复：每 tick -2 直至 0
    const bee = new MountInstance() as unknown as { fatigue: number; fatigueMax: number } & MountInstance;
    bee.setMount(5, view());
    bee.fatigueMax = 320;
    bee.fatigue = 5;
    bee.fatigueRecovery();
    expect(bee.fatigue).toBe(3);
    bee.fatigueRecovery();
    expect(bee.fatigue).toBe(1);                  // ≤2 档下一次归 0
    bee.fatigueRecovery();
    expect(bee.fatigue).toBe(0);
  });

  it('悬停能量池（Hover :3310）：flyTime 先耗、尽后累积疲劳、满池失升力', () => {
    const ufo = new MountInstance() as unknown as { flyTime: number; fatigue: number; fatigueMax: number } & MountInstance;
    ufo.setMount(7, view());
    ufo.fatigueMax = 320;
    ufo.flyTime = 2;
    ufo.frameState = FRAME_IN_AIR;
    ufo.hover(view({ inputUp: true }));
    expect(ufo.flyTime).toBe(1);
    ufo.hover(view({ inputUp: true }));
    expect(ufo.flyTime).toBe(0);
    ufo.hover(view({ inputUp: true }));
    expect(ufo.fatigue).toBe(1);                  // flyTime 尽后转入疲劳累积
    // 爬升速度：vy 向 -(2 + 6×(1-疲劳比)) 带 deadzone 钳
    ufo.fatigue = 0;
    const v2 = view({ inputUp: true, vy: 0 });
    ufo.hover(v2);
    expect(v2.vy).toBeLessThan(0);
    // 疲劳满 → 无升力输入时钳在 4×1=4 的下落带
    ufo.fatigue = 320;
    const v3 = view({ inputUp: true, vy: 0 });
    ufo.hover(v3);
    expect(v3.vy).toBeGreaterThanOrEqual(0);
  });

  it('帧态机（UpdateFrame :3563）：静止→站立 / 移动→跑动 / 离地→空中 / UFO 恒飞行', () => {
    const bunny = new MountInstance();
    bunny.setMount(1, view());
    bunny.updateFrame(view(), FRAME_STANDING, 0, 0);
    expect(bunny.frameState).toBe(FRAME_STANDING);
    bunny.updateFrame(view(), FRAME_RUNNING, 4, 0);
    expect(bunny.frameState).toBe(FRAME_RUNNING);
    expect(bunny.frame).toBeGreaterThanOrEqual(0);
    bunny.updateFrame(view(), FRAME_IN_AIR, 0, -3);
    expect(bunny.frameState).toBe(FRAME_IN_AIR);
    const ufo = new MountInstance();
    ufo.setMount(7, view());
    ufo.updateFrame(view(), FRAME_STANDING, 0, 0);
    expect(ufo.frameState).toBe(FRAME_STANDING);  // frameState 不被改写（:3688 只改帧组）
    expect(ufo.frame).toBe(0);                    // 空中组起点 0（inAirFrameStart 0）
  });

  it('abilityRecovery（:2897）：充能单向爬升、冷却/持续时间递减', () => {
    const scut = new MountInstance();
    scut.setMount(9, view());                     // abilityChargeMax 40 / cooldown 20
    scut.abilityCooldown = 20;
    scut.abilityRecovery();
    expect(scut.abilityCooldown).toBe(19);
    scut.abilityCharging = true;
    for (let i = 0; i < 45; i++) scut.abilityRecovery();
    expect(scut.abilityCharge).toBe(40);          // 钳在 max
  });

  it('canDismount：头顶 42px 被实心占据时拒绝下坐（:6600 空间检查）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    tick(p, w, 8);                                // 落地
    p.mount.setMount(1, p);
    expect(p.mount.canDismount(p)).toBe(true);
    // 正上方填实心 → 放不下 42 高玩家盒
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor((p.y + p.h - 42) / TILE);
    w.store.setTileSilent(tx, ty, 1);
    w.store.setTileSilent(tx, ty - 1, 1);
    expect(p.mount.canDismount(p)).toBe(false);
    expect(p.mount.tryDismount(p)).toBe(false);
    expect(p.ridingMount).toBe(true);             // 下坐失败仍骑乘
  });

  it('upkeep：控场（冰冻）强制下坐（Player.cs:26556 frozen → TryDismount）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    tick(p, w, 8);
    p.mount.setMount(1, p);
    expect(p.ridingMount).toBe(true);
    p.buffs.apply(BuffType.Frozen, 1);
    tick(p, w, 1);
    expect(p.ridingMount).toBe(false);
  });
});

describe('三模物理接管（Player.fixedUpdate 挂钩）', () => {
  it('陆行族：Run 段参数覆写（Player.cs:26329-26331）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    tick(p, w, 8);
    p.mount.setMount(14, p);                      // 蜥蜴 runSpeed 8
    p.inputX = 1;
    const x0 = p.x;
    tick(p, w, 30);
    expect(p.x).toBeGreaterThan(x0 + 16 * 3);     // 蜥蜴 8px/t ≫ 步行 3px/t
    // 限速 = mount.RunSpeed（8）而非玩家 maxRun
    expect(Math.abs(p.vx)).toBeLessThanOrEqual(8.5);
    expect(p.ridingMount).toBe(true);
  });

  it('史莱姆鞍 constantJump：地面移动自动连跳（autoJump）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    tick(p, w, 8);
    p.mount.setMount(3, p);                       // constantJump = true
    expect(p.mount.autoJump).toBe(true);
    const restY = p.y;
    p.inputX = 1;
    let minY = p.y;
    for (let i = 0; i < 60; i++) { p.fixedUpdate(1 / 60, fakeHooks(w, p) as never); minY = Math.min(minY, p.y); }
    // 自动连跳（无需按跳）应离地腾空：最低 y 显著高于站定高度
    expect(minY).toBeLessThan(restY - 16);
  });

  it('飞行族 hover 接管：按上升键消耗 flyTime 且免摔', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    tick(p, w, 8);
    p.mount.setMount(7, p);                       // UFO hover
    p.inputJump = true;
    tick(p, w, 30);
    // 起跳离地后进入 hover 帧态，vy 不应坠回地面终端速度
    expect(p.mount.frameState === FRAME_FLYING || p.mount.frameState === FRAME_IN_AIR).toBe(true);
    expect(p.fallStartY).toBeNull();              // 悬停免摔（fallStart 重置）
  });

  it('非 hover 飞行（驯鹿）：flyTime 耗尽后缓降（重力/3 带）', () => {
    const m = new MountInstance();
    m.setMount(0, view({ vx: 0 }));
    m.resetFlightTime(view({ vx: 0 }));
    expect(m.flyTime).toBe(160);
  });

  it('游泳族：海龟浸水走干燥分支（ignoreWater）+ 免淹', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    tick(p, w, 8);
    p.mount.setMount(4, p);                       // 海龟 buff 131 → swimFree
    expect(p.ridingMountSwimFree).toBe(true);
    expect(p.mount.swimFree).toBe(true);
    // 注水没顶：非骑乘会耗 breath，海龟不淹（:22953）
    const headTy = Math.floor((p.y + 2) / TILE);
    for (let j = headTy; j < 80; j++) {
      for (let i = Math.floor(p.x / TILE) - 1; i <= Math.floor((p.x + p.w) / TILE) + 1; i++) {
        w.store.setLiquid(i, j, 255, 1);
      }
    }
    tick(p, w, 1);
    expect(p.inWater).toBe(true);
    const breath0 = p.breath;
    tick(p, w, 60 * 3);
    expect(p.breath).toBe(breath0);               // 免淹：breath 不减
    expect(p.hp).toBe(p.maxHp);                   // 不掉血
  });

  it('摔伤系数（Player.cs:25081 ×mount.FallDamage）：兔兔 0.8 / 飞行族 0', () => {
    const bunny = new MountInstance();
    bunny.setMount(1, view());
    expect(bunny.fallDamageFactor).toBeCloseTo(0.8);
    const ufo = new MountInstance();
    ufo.setMount(7, view());
    expect(ufo.fallDamageFactor).toBe(0);
    const slime = new MountInstance();
    slime.setMount(3, view());
    expect(slime.extraFall).toBe(10);             // extraFall 起步豁免（:25011）
  });

  it('isCartMount：矿车族判定（Minecart.ts 接管路径不回退）', () => {
    expect(isCartMount(6)).toBe(true);
    expect(isCartMount(0)).toBe(false);
  });
});
