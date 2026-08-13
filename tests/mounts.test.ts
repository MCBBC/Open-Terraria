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
  FRAME_STANDING, FRAME_RUNNING, FRAME_IN_AIR, FRAME_FLYING, FRAME_SWIMMING, FRAME_DASHING,
  type MountedPlayerView,
  DRILL_PICK_POWER, DRILL_PICK_TIME, DRILL_MAX_LENGTH,
  drillBlockTarget, drillWallTarget, clampToDeadZone, scutlixFindTarget,
  inAPlaceWithWind,
  type DrillStore, type DrillBeam,
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
/** 钻头光束判定用世界桩：solid 集填内部 id 1（泥土，pick 0 可挖），walls 为 "x,y"→墙 id */
const fakeDrillStore = (solid: Array<[number, number]> = [],
  walls: Record<string, number> = {}, w = 40, h = 40): DrillStore => {
  const type = new Uint16Array(w * h);
  const wall = new Uint16Array(w * h);
  const idx = (x: number, y: number) => y * w + x;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  for (const [x, y] of solid) if (inBounds(x, y)) type[idx(x, y)] = 1;
  for (const [k, v] of Object.entries(walls)) {
    const [x, y] = k.split(',').map(Number);
    if (inBounds(x, y)) wall[idx(x, y)] = v;
  }
  return { w, h, type, wall, idx, inBounds, isActive: (x, y) => inBounds(x, y) && type[idx(x, y)] !== 0 };
};
const idleBeams = (): DrillBeam[] => [{ tx: -1, ty: -1, cooldown: 0, purpose: 0 },
  { tx: -1, ty: -1, cooldown: 0, purpose: 0 }];
/** 玩家中心位于格 (10,20) 中心的世界像素坐标 */
const DRILL_CX = 10 * 16 + 8, DRILL_CY = 20 * 16 + 8;

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
    bee.fatigue = 160;
    bee.fatigueMax = 320;
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
    const bee = new MountInstance();
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
    // 蜜蜂（5）不在疲劳豁免集（DoesHoverIgnoresFatigue :3534 = {7,8,12,23,44,49,56,61}）
    const bee = new MountInstance();
    bee.setMount(5, view());
    bee.fatigueMax = 320;
    bee.flyTime = 2;
    bee.frameState = FRAME_IN_AIR;
    bee.hover(view({ inputUp: true }));
    expect(bee.flyTime).toBe(1);
    bee.hover(view({ inputUp: true }));
    expect(bee.flyTime).toBe(0);
    bee.hover(view({ inputUp: true }));
    expect(bee.fatigue).toBe(1);                  // flyTime 尽后转入疲劳累积
    // 爬升速度：vy 向 -(2 + 6×(1-疲劳比)) 带 deadzone 钳
    bee.fatigue = 0;
    const v2 = view({ inputUp: true, vy: 0 });
    bee.hover(v2);
    expect(v2.vy).toBeLessThan(0);
    // 疲劳满 → 无升力输入时钳在 4×1=4 的下落带
    bee.fatigue = 320;
    const v3 = view({ inputUp: true, vy: 0 });
    bee.hover(v3);
    expect(v3.vy).toBeGreaterThanOrEqual(0);
    // UFO（7）在豁免集内：hover 不耗能量不积疲劳
    const ufo = new MountInstance();
    ufo.setMount(7, view());
    ufo.flyTime = 2;
    ufo.frameState = FRAME_IN_AIR;
    ufo.hover(view({ inputUp: true }));
    expect(ufo.flyTime).toBe(2);
    expect(ufo.fatigue).toBe(0);
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

  it('constantJump 族 autoJump 语义（Player.cs:20366/:20406）：免松键连跳、不按跳不弹', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    tick(p, w, 8);
    p.mount.setMount(3, p);                       // constantJump = true（Mount.cs:848）
    expect(p.mount.autoJump).toBe(true);
    const groundY = p.y;
    // 不按跳仅移动：原版整条跳跃链在 if(controlJump) 门内（:20366），autoJump 只免
    // releaseJump（:20406）——绝不无输入自动弹跳（曾误实现为"移动即弹跳"）
    p.inputX = 1;
    let minY = p.y;
    for (let i = 0; i < 90; i++) { p.fixedUpdate(1 / 60, fakeHooks(w, p) as never); minY = Math.min(minY, p.y); }
    expect(minY).toBe(groundY);                   // 始终贴地
    // 按住跳不松手：autoJump 免 releaseJump 落地即重跳 → 持续弹跳
    p.inputX = 0; p.vx = 0; p.inputJump = true;
    minY = p.y;
    let landings = 0; let wasAir = false;
    for (let i = 0; i < 180; i++) {
      p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
      minY = Math.min(minY, p.y);
      if (!p.onGround) wasAir = true;
      else if (wasAir) { landings++; wasAir = false; }
    }
    expect(minY).toBeLessThan(groundY - 16);      // 离地腾空
    expect(landings).toBeGreaterThanOrEqual(2);   // 多次落地重跳（无需松键）
  });

  it('悬停爬升接受单按上（Hover :3396-3424 controlUp）：松键截断段让位', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    tick(p, w, 8);
    p.mount.setMount(7, p);                       // UFO hover
    p.inputUp = true;                             // 只按上、不按跳（原版合法爬升输入）
    const y0 = p.y;
    tick(p, w, 90);
    // 曾被"松键截断上升"手感段反复掐回 vy=2，90t 只爬 35px
    expect(p.y).toBeLessThan(y0 - 100);
    expect(p.mount.frameState === FRAME_FLYING || p.mount.frameState === FRAME_IN_AIR).toBe(true);
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

describe('钻头坐骑（mount 8）：激光挖掘纯函数（Mount.cs :3145-3218）', () => {
  it('drillBlockTarget：射线带内首个可破坏实体格（穿透前方）', () => {
    // 玩家在 (10,20)，正右方 3 格外一堵竖墙 → 光束命中第一块实体
    const st = fakeDrillStore([[13, 20]]);
    const t = drillBlockTarget(st, DRILL_CX, DRILL_CY, DRILL_CX + 400, DRILL_CY, idleBeams());
    expect(t).toEqual({ x: 13, y: 20 });
    // 空射线（全空气）→ 无目标
    const empty = fakeDrillStore();
    expect(drillBlockTarget(empty, DRILL_CX, DRILL_CY, DRILL_CX + 400, DRILL_CY, idleBeams())).toBeNull();
  });

  it('射程钳制：min(鼠标距,224)+32 —— 16 格外无目标', () => {
    // 224+32 = 256px = 16 格；PlotLine 不含终点格 → 最远可命中第 25 格（15 格之外）
    const st = fakeDrillStore([[30, 20]]);
    expect(drillBlockTarget(st, DRILL_CX, DRILL_CY, DRILL_CX + 1000, DRILL_CY, idleBeams())).toBeNull();
    // 射程内（14 格）→ 命中
    const st2 = fakeDrillStore([[24, 20]]);
    expect(drillBlockTarget(st2, DRILL_CX, DRILL_CY, DRILL_CX + 1000, DRILL_CY, idleBeams()))
      .toEqual({ x: 24, y: 20 });
  });

  it('光束分工：已被他束锁定的格跳过（两束不打同一块）', () => {
    const st = fakeDrillStore([[13, 20]]);
    const beams = idleBeams();
    beams[0] = { tx: 13, ty: 20, cooldown: 1, purpose: 0 };
    expect(drillBlockTarget(st, DRILL_CX, DRILL_CY, DRILL_CX + 400, DRILL_CY, beams)).toBeNull();
    // 拆墙目的（purpose 1）锁定的格不影响挖块目标
    beams[0] = { tx: 13, ty: 20, cooldown: 1, purpose: 1 };
    expect(drillBlockTarget(st, DRILL_CX, DRILL_CY, DRILL_CX + 400, DRILL_CY, beams))
      .toEqual({ x: 13, y: 20 });
  });

  it('drillWallTarget：首个有墙格；wall 350（不可拆）跳过', () => {
    const st = fakeDrillStore([], { '13,20': 1 });
    expect(drillWallTarget(st, DRILL_CX, DRILL_CY, DRILL_CX + 400, DRILL_CY, idleBeams()))
      .toEqual({ x: 13, y: 20 });
    const st350 = fakeDrillStore([], { '13,20': 350 });
    expect(drillWallTarget(st350, DRILL_CX, DRILL_CY, DRILL_CX + 400, DRILL_CY, idleBeams())).toBeNull();
  });

  it('clampToDeadZone：瞄准点贴身时外推到死区边缘（Mount.cs :5294）', () => {
    const c = clampToDeadZone(0, 0, 5, 0, 45, 54);
    expect(Math.hypot(c.x, c.y)).toBeGreaterThanOrEqual(45);
    const far = clampToDeadZone(0, 0, 500, 0, 45, 54);
    expect(far.x).toBe(500);
    expect(far.y).toBe(0);
  });
});

describe('钻头坐骑（mount 8）：MountInstance 状态机（UseDrill/UpdateDrill/AimAbility）', () => {
  it('setDrillActive 开合 + updateDrill 光束冷却衰减与二极管 lerp（:3000-3021）', () => {
    const m = new MountInstance();
    m.setMount(8, view());
    expect(m.abilityActive).toBe(false);
    m.setDrillActive(true);
    expect(m.abilityActive).toBe(true);          // 按压边沿开
    m.setDrillActive(true);
    expect(m.abilityActive).toBe(true);
    m.setDrillActive(false);                     // 双松关
    expect(m.abilityActive).toBe(false);
    // 光束冷却 ==1 档：衰减并清目标
    m.beams[0].tx = 5; m.beams[0].ty = 6; m.beams[0].cooldown = 1;
    m.diodeRotation = 0; m.diodeRotationTarget = 1;
    m.updateDrill();
    expect(m.beams[0].cooldown).toBe(0);
    expect(m.beams[0].tx).toBe(-1);              // 冷却尽 → curTileTarget 复位
    expect(m.diodeRotation).toBeCloseTo(0.15);   // 0×0.85 + 1×0.15
  });

  it('aimDrill：光标记录 + 二极管目标角取最短旋转路径（:5465-5498）', () => {
    const m = new MountInstance();
    m.setMount(8, view());
    m.aimDrill(DRILL_CX, DRILL_CY, DRILL_CX + 100, DRILL_CY);
    expect(m.crosshairX).toBe(DRILL_CX + 100);
    expect(m.diodeRotationTarget).toBeCloseTo(0);
    m.aimDrill(DRILL_CX, DRILL_CY, DRILL_CX, DRILL_CY + 100);
    expect(m.diodeRotationTarget).toBeCloseTo(Math.PI / 2);
    // 从 ~π/2 转到 ~0：最短路径应经正向递减而非绕远
    m.aimDrill(DRILL_CX, DRILL_CY, DRILL_CX + 100, DRILL_CY);
    expect(m.diodeRotation).toBeLessThan(Math.PI / 2 + 0.01);
  });

  it('useDrill：左键挖块 / 右键拆墙，两束齐射各锁一格（:3023-3143）', () => {
    const m = new MountInstance();
    const drillView = { ...view({ x: DRILL_CX - 10, y: DRILL_CY - 21, w: 20, h: 42 }) };
    m.setMount(8, drillView);
    m.setDrillActive(true);
    m.aimDrill(DRILL_CX, DRILL_CY, DRILL_CX + 400, DRILL_CY);
    const st = fakeDrillStore([[13, 20], [13, 19], [13, 21]]);
    const picked: Array<[number, number]> = [];
    const walled: Array<[number, number]> = [];
    m.useDrill({ ...drillView, store: st as never }, {
      useItem: true, useTile: false,
      pickTile: (tx, ty) => picked.push([tx, ty]),
    });
    expect(picked.length).toBe(2);               // amountOfBeamsAtOnce = 2
    expect(m.beams.every((b) => b.cooldown === DRILL_PICK_TIME)).toBe(true);
    expect(m.beams.every((b) => b.purpose === 0)).toBe(true);
    // 未激活不挖
    m.setDrillActive(false);
    m.useDrill({ ...drillView, store: st as never }, {
      useItem: true, useTile: true,
      pickTile: (tx, ty) => picked.push([tx, ty]),
      pickWall: (tx, ty) => walled.push([tx, ty]),
    });
    expect(picked.length).toBe(2);
    expect(walled).toHaveLength(0);
  });

  it('挖块镐力 210 / 每束每 tick 一击（drillPickTime=1）', () => {
    expect(DRILL_PICK_POWER).toBe(210);
    expect(DRILL_PICK_TIME).toBe(1);
    expect(DRILL_MAX_LENGTH).toBe(224);
  });
});

describe('Scutlix Gunner（mount 9）：索敌/瞄准帧/充能开火（Mount.cs :4884-4954/:5338-5418）', () => {
  it('scutlixFindTarget：850px 内、朝向锥 ±60°、视线可达的最近敌怪', () => {
    const p = { x: 100, y: 100, w: 20, h: 42, facing: 1 };
    const los = () => true;
    const near = { x: 300, y: 120, w: 20, h: 40 };      // ~208px 正前方
    const far = { x: 380, y: 130, w: 20, h: 40 };       // 更远
    expect(scutlixFindTarget(p, [far, near], los)).toEqual(near);
    // 朝向锥外（正后方）→ 无目标
    const behind = { x: -100, y: 120, w: 20, h: 40 };
    expect(scutlixFindTarget(p, [behind], los)).toBeNull();
    // 超出 850px → 无目标
    const tooFar = { x: 1100, y: 120, w: 20, h: 40 };
    expect(scutlixFindTarget(p, [tooFar], los)).toBeNull();
    // 视线被挡 → 无目标
    expect(scutlixFindTarget(p, [near], () => false)).toBeNull();
  });

  it('aimScutlix：±90° 外换向 + 眼部瞄准帧分档（6-10）', () => {
    const m = new MountInstance();
    m.setMount(9, view());
    const v = view({ x: 0, y: 0, w: 20, h: 42 });
    // 正右 → frameExtra 8 / 面右
    m.aimScutlix(v, 300, 21);
    expect(m.frameExtra).toBe(8);
    expect(v.facing).toBe(1);
    // 正上（-90°）→ frameExtra 6
    m.aimScutlix(v, 10, -200);
    expect(m.frameExtra).toBe(6);
    // 斜下 45° → 9；正下 90° → 10
    m.aimScutlix(v, 300, 300);
    expect(m.frameExtra).toBe(9);
    m.aimScutlix(v, 10, 300);
    expect(m.frameExtra).toBe(10);
    // 正后方 → 换向面左且帧归 8
    m.aimScutlix(v, -300, 21);
    expect(v.facing).toBe(-1);
    expect(m.frameExtra).toBe(8);
    // 背向移动（面右但向左跑）→ 倒放标记
    const v2 = view({ x: 0, y: 0, w: 20, h: 42, vx: -3 });
    m.aimScutlix(v2, 300, 21);
    expect(m.flipDraw).toBe(true);
  });

  it('SetMount 冷却下限 20（:6224）+ 冷却中充能 / 归零开火两连发 / 失瞄复位', () => {
    const m = new MountInstance();
    m.setMount(9, view());
    expect(m.abilityCooldown).toBe(20);          // 上坐即预热
    const target = { x: 300, y: 100, w: 20, h: 40 };
    const fired: number[][] = [];
    const v = view({ x: 100, y: 100 });
    // 冷却中：只瞄准 + 持续充能
    expect(m.updateScutlix(v, target, (x, y, vx, vy) => fired.push([x, y, vx, vy]))).toBe(false);
    expect(fired).toHaveLength(0);
    expect(m.abilityCharging).toBe(true);
    expect(m.aiming).toBe(true);
    // 冷却归零：两束眼激光 + 冷却重置 20
    m.abilityCooldown = 0;
    expect(m.updateScutlix(v, target, (x, y, vx, vy) => fired.push([x, y, vx, vy]))).toBe(true);
    expect(fired).toHaveLength(2);
    expect(m.abilityCooldown).toBe(20);
    expect(m.abilityCharging).toBe(false);
    for (const [x, y, vx, vy] of fired) {
      expect(Math.hypot(vx, vy)).toBeCloseTo(14);   // 弹速 14（:3244）
      expect(x).toBeGreaterThan(100);               // 眼部出生点在玩家前方
      void y;
    }
    // 失瞄：停充 + 头部复位
    m.updateScutlix(v, null, () => { /* 无目标不开火 */ });
    expect(m.abilityCharging).toBe(false);
    expect(m.aiming).toBe(false);
    expect(m.frameExtra).toBe(0);
  });

  it('跑动帧背向倒放（flipDraw → 帧率取负，:4245-4291）', () => {
    const m = new MountInstance();
    m.setMount(9, view());
    m.frame = 3;                                  // 跑动组 0-5
    m.flipDraw = false;
    m.updateFrame(view({ vx: 4 }), FRAME_RUNNING, 4, 0);
    expect(m.frame).toBeGreaterThanOrEqual(3);    // 正放前进
    m.flipDraw = true;
    const frBefore = m.frame;
    m.updateFrame(view({ vx: 4 }), FRAME_RUNNING, 4, 0);
    expect(m.frame).toBeLessThanOrEqual(frBefore); // 倒放不前进
  });
});

describe('蜥蜴 14 / 山羊 47：特殊跳与冲刺态（UpdateEffects + JumpMovement）', () => {
  it('jumpOption 映射 + 跳跃保持时长（:20603 trunc(20×0.75)=15 / 山羊 10×2=20）', () => {
    const goat = new MountInstance();
    goat.setMount(47, view());
    expect(goat.jumpOption).toBe('WallOfFleshGoat');
    expect(goat.mountJumpTicks()).toBe(20);
    const basilisk = new MountInstance();
    basilisk.setMount(14, view());
    expect(basilisk.jumpOption).toBe('Basilisk');
    expect(basilisk.mountJumpTicks()).toBe(15);
    const unicorn = new MountInstance();
    unicorn.setMount(10, view());
    expect(unicorn.jumpOption).toBe('Unicorn');
    expect(unicorn.mountJumpTicks()).toBe(20);
    const bunny = new MountInstance();
    bunny.setMount(1, view());
    expect(bunny.jumpOption).toBeNull();          // 其余坐骑无特殊跳
  });

  it('冲刺免击退门（:4962 |vx| > DashSpeed-RunSpeed/2；蜥蜴未设 dashSpeed 门恒过）', () => {
    const goat = new MountInstance();
    goat.setMount(47, view());
    expect(goat.dashNoKnockback(11)).toBe(true);  // 12 - 2 = 10
    expect(goat.dashNoKnockback(9)).toBe(false);
    const basilisk = new MountInstance();
    basilisk.setMount(14, view());
    expect(basilisk.dashNoKnockback(0)).toBe(true);   // 裸 dashSpeed 0 → -4 门恒过（原版怪癖）
  });

  it('冲刺帧组切换（:3827 跑动中超速 → FRAME_DASHING 帧 9-14）', () => {
    const goat = new MountInstance();
    goat.setMount(47, view());
    goat.updateFrame(view({ vx: 12 }), FRAME_RUNNING, 12, 0);
    expect(goat.frame).toBeGreaterThanOrEqual(9);     // dashingFrameStart 9
    expect(goat.frame).toBeLessThan(15);
    // 低速跑动 → 常规跑动帧组
    goat.frame = 9;
    goat.updateFrame(view({ vx: 2 }), FRAME_RUNNING, 2, 0);
    expect(goat.frame).toBeLessThan(8);               // 回到 running 组 1-7
    void FRAME_DASHING;
  });

  it('Player 挂钩：空中再跳触发特殊跳（vy 脉冲 + 保持 20t + 常驻加速标记）', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    tick(p, w, 8);                                    // 落地（mountJumpReady 就绪）
    p.mount.setMount(47, p);
    p.inputJump = true;
    tick(p, w, 6);                                    // 起跳离地，首跳保持(10t)未耗尽
    expect(p.onGround).toBe(false);
    expect(p.mount.mountJumpPerforming).toBe(false);
    tick(p, w, 10);                                   // jumpHold 耗尽 → 空中再跳（按住不松）
    expect(p.mount.mountJumpPerforming).toBe(true);
    expect(p.jumpHold).toBeGreaterThan(0);            // 保持 = jumpHeight×2 = 20t（逐 tick 递减中）
    expect(p.jumpHold).toBeLessThanOrEqual(20);
    expect(p.vy).toBeLessThan(0);                     // -jumpSpeed 脉冲
    expect(p.mount.mountJumpReady).toBe(false);       // 已消费，落地才恢复
    p.inputJump = false;
    tick(p, w, 120);                                  // 落地恢复
    expect(p.mount.mountJumpReady).toBe(true);
  });
});

describe('猪鲨崽 12：MountFishronSpecial 湿身语义（Player.cs:3882 + Mount.cs:3354/:4996）', () => {
  const fv = (over: Partial<Parameters<MountInstance['fishronSpecial']>[0]> = {}) => ({
    hp: 100, maxHp: 100, inWater: false, inLava: false, inHoney: false,
    raining: false, windExposed: false, ...over,
  });

  it('增益真值表：湿身/半血以下/雨中露天 = 全额；干爽满血无雨 = 减半', () => {
    const m = new MountInstance();
    m.setMount(12, view());
    expect(m.fishronSpecial(fv())).toBe(false);               // 干爽满血无雨
    expect(m.fishronSpecial(fv({ inWater: true }))).toBe(true);   // ★湿身是全额（旧实现误减半）
    expect(m.fishronSpecial(fv({ inLava: true }))).toBe(false);   // 岩浆湿不算
    expect(m.fishronSpecial(fv({ inHoney: true }))).toBe(false);  // 蜂蜜湿不算
    expect(m.fishronSpecial(fv({ hp: 40 }))).toBe(true);      // 半血以下
    expect(m.fishronSpecial(fv({ raining: true, windExposed: true }))).toBe(true);
    expect(m.fishronSpecial(fv({ raining: true, windExposed: false }))).toBe(false);
  });

  it('计数器维护（:4996-5003：半血→60 / 湿身或雨中露天→420）', () => {
    const m = new MountInstance();
    m.setMount(12, view());
    m.updateFishron(fv({ inWater: true }));
    expect(m.fishronCounter).toBe(420);
    expect(m.fishronBoost).toBe(true);
    m.updateFishron(fv({ hp: 40 }));
    expect(m.fishronCounter).toBe(60);
    // 计数器 >0 期间即便已干爽也保持增益（出水后 420t 余效）
    m.updateFishron(fv());
    expect(m.fishronBoost).toBe(true);
    expect(m.fishronCounter).toBe(59);                        // 先衰减再判（:25340）
    m.fishronCounter = 0;
    expect(m.fishronSpecial(fv())).toBe(false);
  });

  it('hover 增益态全额 / 非增益态加速度减半（:3354 num=0.5）', () => {
    const m = new MountInstance();
    m.setMount(12, view());
    m.frameState = FRAME_IN_AIR;
    m.fatigueMax = 320;
    m.flyTime = 320;
    m.fishronBoost = false;
    const v1 = view({ inputUp: true, vy: 0 });
    m.hover(v1);
    expect(v1.vy).toBeCloseTo(-0.1);                          // 0.2 × 0.5
    m.fishronBoost = true;
    m.flyTime = 320;
    const v2 = view({ inputUp: true, vy: 0 });
    m.hover(v2);
    expect(v2.vy).toBeCloseTo(-0.2);                          // 全额
  });

  it('Player 挂钩：fixedUpdate 内计数器维护 + 四系伤害 +15%', () => {
    const w = mkWorld();
    const p = mkPlayer(w);
    tick(p, w, 8);
    p.mount.setMount(12, p);
    expect(p.mount.fishronBoost).toBe(false);                 // 干爽满血无雨
    expect(p.damageMult('melee')).toBeCloseTo(1);
    p.hp = 20;                                                // 半血以下 → 增益
    tick(p, w, 1);
    expect(p.mount.fishronBoost).toBe(true);
    expect(p.damageMult('melee')).toBeCloseTo(1.15);
    expect(p.damageMult('summon')).toBeCloseTo(1.15);
  });

  it('inAPlaceWithWind：地表以上无液无墙（WorldGen.cs:66135）', () => {
    const st = fakeDrillStore([], {}, 40, 200);
    const liquid = new Uint8Array(40 * 200);
    (st as unknown as { liquid: Uint8Array }).liquid = liquid;
    // y=10 格（< worldSurface 72）且无液无墙 → 露天
    expect(inAPlaceWithWind(st as never, 160, 160, 20, 42, 72)).toBe(true);
    // 地下（y ≥ 72 格）→ 非露天
    expect(inAPlaceWithWind(st as never, 160, 72 * 16, 20, 42, 72)).toBe(false);
    // 贴墙 → 非露天
    const walled = fakeDrillStore([], { '10,10': 1 }, 40, 200);
    expect(inAPlaceWithWind(walled as never, 160, 160, 20, 42, 72)).toBe(false);
  });
});

describe('史后坐骑 50 + constantJump 表核对', () => {
  it('挤压副帧（:4041-4061）：落地恒 3；空中 0-3 循环（flyTime 双倍速）', () => {
    const m = new MountInstance();
    m.setMount(50, view());
    m.updateFrame(view(), FRAME_STANDING, 0, 0);
    expect(m.frameExtra).toBe(3);
    // 空中 8 tick（counter > 7）→ 越过 3 回卷 0
    for (let i = 0; i < 8; i++) m.updateFrame(view({ vy: -3 }), FRAME_IN_AIR, 0, -3);
    expect(m.frameExtra).toBe(0);
    m.flyTime = 80;
    for (let i = 0; i < 4; i++) m.updateFrame(view({ vy: -3 }), FRAME_FLYING, 0, -3);
    expect(m.frameExtra).toBe(1);                             // flyTime 双倍速推进
  });

  it('RenderTarget 主贴图 = QueenSlime 着色器纯装饰（静态近似，登记）；四层贴图可得', () => {
    // PlayerQueenSlimeMountTextureContent 仅把 Extra_204 过一遍 QueenSlime misc shader
    //（结晶微光重着色）——非大眼跟随等行为语义，静态贴图近似不损失玩法
    expect(MOUNT_DATA['50'].backTexture).toBe('Extra_204.png');
    expect(MOUNT_TEXTURE_OK['50']).toBe(true);
  });

  it('constantJump 表 = {3,43,50}（Mount.cs Initialize 提取）', () => {
    const cj = Object.keys(MOUNT_DATA).filter((k) => MOUNT_DATA[k].constantJump)
      .map(Number).sort((a, b) => a - b);
    expect(cj).toEqual([3, 43, 50]);
    // 兔兔 1 非 autoJump：常规跳跃链已覆盖其免松键连跳语义
    expect(MOUNT_DATA['1'].constantJump).toBeUndefined();
  });
});
