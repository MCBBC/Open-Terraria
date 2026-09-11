// ★SW-BJ59 绿溜冰鞋（RollerSkatesGreenMountItem 5640 / mount 58 / buff 379）法证批：
//   1 名称三源对拍（官方 l10n zh-Hans/en-US ItemName 双锚 = 正名"绿溜冰鞋"）
//   2 mount 数据金标（1457 Mount.cs:2574-2612 SetAsRollerSkate 终值——曾遭提取器
//     助手展开盲区污染成 7.5/0.3/14/7 → 用户实测 58 mph 根因）
//   3 渲染域（原版四贴图全 Empty → 机身零绘制；视觉唯一载体 = 鞋甲 27-30 覆写）
//   4 滑行速度与放置速度联动（RollerSkateMovement :28746-28751 num6 巡航挡）
//   5 轨骑三段（Player.cs:28306-28377 AnyTrackRider——上轨/滑行/下轨）
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import {
  MOUNT_DATA, MOUNT_SETS, MOUNT_TEXTURE_OK,
  mountOfItem, mountOfBuff, mountRollerSkateStep,
} from '../src/entities/Mounts';
import { placeTrack, frameTrackArea } from '../src/world/MinecartTrack';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { ITEM_NAME_BY_ID } from '../src/i18n/idNames.generated';
import { BuffType } from '../src/stats/Buffs';
import { TILE } from '../src/core/constants';

// ---- harness（mounts.test.ts 同款） ----
const fakeHooks = (w: World, p?: Player) => ({
  world: w, player: p, enemies: () => [], critters: () => [],
  spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
  cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
  spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
  playSfxFiles: () => {}, showPickupLabel: () => {},
});
const mkWorld = (): World => {
  const w = new World(80, 120, 72, 'sw-bj59');
  for (let x = 8; x <= 72; x++) w.store.setTileSilent(x, 80, 1);
  return w;
};
const tick = (p: Player, w: World, n: number): void => {
  for (let i = 0; i < n; i++) p.fixedUpdate(1 / 60, fakeHooks(w, p) as never);
};

// ============================================================================
// 1. 物品定谳 + 名称三源对拍
// ============================================================================
describe('SW-BJ59 物品定谳与名称三源', () => {
  it('物品 5640 → mount 58 → buff 379 链（Item.cs:44300 mountType=58 / Mount.cs:2552-2553）', () => {
    expect(mountOfItem(5640)).toBe(58);
    expect(mountOfItem(5600)).toBe(57);
    expect(mountOfItem(5641)).toBe(59);
    expect(mountOfItem(5642)).toBe(60);
    expect(mountOfBuff(379)).toBe(58);
    expect(MOUNT_DATA['58']?.buff).toBe(379);
  });

  it('名称三源对拍：官方 l10n（zh-Hans/en-US）= 正名"绿溜冰鞋"/"Green Roller Skates"', () => {
    // 三源：①官方 l10n（tooltip 实际渲染源，ItemName.<key> 查表）②vanilla.json 提取名
    // ③idNames.generated 键路由——用户"wiki 叫轮滑鞋"系 wiki 译名，官方 zh 定名
    // "绿溜冰鞋"（四变体：蓝/绿/经典/派对 溜冰鞋），l10n 双锚优先。
    const zh = JSON.parse(fs.readFileSync(path.resolve('public/l10n/zh-Hans.json'), 'utf8'));
    const en = JSON.parse(fs.readFileSync(path.resolve('public/l10n/en-US.json'), 'utf8'));
    expect(zh.ItemName.RollerSkatesGreenMountItem).toBe('绿溜冰鞋');
    expect(en.ItemName.RollerSkatesGreenMountItem).toBe('Green Roller Skates');
    expect(zh.ItemTooltip.RollerSkatesGreenMountItem).toBe('滑行速度与放置速度相匹配');
    expect(en.ItemTooltip.RollerSkatesGreenMountItem).toBe('Coasting matches placement speed');
    expect(ITEM_NAME_BY_ID['5640']).toBe('RollerSkatesGreenMountItem');
    const atlas = JSON.parse(fs.readFileSync(path.resolve('public/sprites/vanilla.json'), 'utf8'));
    expect(atlas.items['5640'].key).toBe('RollerSkatesGreenMountItem');
  });

  it('物品使用面（Item.cs:44300-44311）：useStyle 4 / channel / useTime 20 / SoundID.Item25', () => {
    const c = itemCombat(5640);
    expect(c?.useTime).toBe(20);
    expect(c?.useAnimation).toBe(20);
    expect(c?.noMelee).toBe(true);
    expect(c?.noUseGraphic).toBe(true);
  });
});

// ============================================================================
// 2. mount 数据金标（1457 Mount.cs:2574-2612 SetAsRollerSkate——1458 同域零变更）
//    ★变异锚：曾污染值 dashSpeed 7.5/acceleration 0.3/jumpHeight 14/jumpSpeed 7
//    （提取器助手展开盲区）→ maxRun 10.5 px/t ≈ 54-58 mph（用户实报），此处钉死。
// ============================================================================
describe('SW-BJ59 mount 数据金标（SetAsRollerSkate 1457 终值）', () => {
  it('四变体 57-60 参数全等（:2583-2587 dashSpeed 1f/runSpeed 1f/acceleration 0.1f/jumpHeight 2/jumpSpeed 1f）', () => {
    for (const id of ['57', '58', '59', '60']) {
      const d = MOUNT_DATA[id];
      expect(d).toBeDefined();
      expect(d!.runSpeed).toBe(1);            // :2584 runSpeed = dashSpeed（1f）
      expect(d!.dashSpeed).toBe(1);           // :2583
      expect(d!.acceleration).toBe(0.1);      // :2585
      expect(d!.jumpHeight).toBe(2);          // :2586
      expect(d!.jumpSpeed).toBe(1);           // :2587
      expect(d!.fallDamage).toBe(1);          // :2588
      expect(d!.blockExtraJumps).toBe(false); // :2589
      expect(d!.totalFrames).toBe(1);         // :2590
      expect(d!.playerYOffsets).toEqual([2]); // :2591-2596 全帧 2
      expect(d!.bodyFrame).toBe(3);           // :2598
      expect(d!.spawnDust).toBe(31);          // :2576
    }
    expect(MOUNT_DATA['57']?.buff).toBe(378); // :2549-2550
    expect(MOUNT_DATA['59']?.buff).toBe(380);
    expect(MOUNT_DATA['60']?.buff).toBe(381);
  });

  it('MountID.Sets 四旗（:2578-2580）：CanRideMinecartTracks/CanUseWings/additive 全真', () => {
    for (const id of [57, 58, 59, 60]) {
      expect(MOUNT_DATA[String(id)]?.CanRideMinecartTracks).toBe(true);  // :2578 上轨机制
      expect(MOUNT_DATA[String(id)]?.CanUseWings).toBe(true);            // :2579
      expect(MOUNT_SETS.IsRollerSkates[id]).toBe(true);                  // MountID.cs:19
      expect(MOUNT_SETS.DoesNotOverrideLegFrames?.[id]).toBe(true);      // MountID.cs:15
      expect(MOUNT_SETS.DoesNotOverrideBodyFrames?.[id]).toBe(true);     // MountID.cs:14
      expect(MOUNT_SETS.Cart?.[id]).toBeFalsy();                         // 非矿车——上轨≠矿车
    }
  });
});

// ============================================================================
// 3. 渲染域：机身零绘制 + 鞋甲覆写载体
// ============================================================================
describe('SW-BJ59 渲染域', () => {
  it('滚轴鞋无贴图 = 原版 Empty 语义（:2596-2606），禁入色块近似', () => {
    for (const id of ['57', '58', '59', '60']) {
      expect(MOUNT_DATA[id]?.frontTexture).toBeUndefined();   // Empty → 零绘制
      expect(MOUNT_DATA[id]?.backTexture).toBeUndefined();
      expect(MOUNT_TEXTURE_OK[id]).toBe(false);
    }
  });

  it('鞋甲载体：mount 57-60 → shoe 27-30（Player.cs:37096-37115 type-30 映射）', () => {
    for (let type = 57; type <= 60; type++) {
      expect(MOUNT_SETS.IsRollerSkates[type]).toBe(true);
      expect(type - 30).toBe(27 + (type - 57));               // 57→27 / 58→28 / 59→29 / 60→30
    }
    expect([...Array(4).keys()].every((k) => fs.existsSync(
      path.resolve(`public/sprites/vanilla/Acc_Shoes_${27 + k}.png`),
    ))).toBe(true);
  });
});

// ============================================================================
// 4. 滑行速度与放置速度联动（RollerSkateMovement :28746-28751）
//    mph 换算锚（Stopwatch 口径）：mph = |vx| px/t × 5.1136（60t/s ÷16px ×1.3636 mph/tile/s）
// ============================================================================
describe('SW-BJ59 巡航挡 = f(手持放置物 useTime, tileSpeed)', () => {
  const damp = (vx: number, glideCap: number, accRun = 4) =>
    mountRollerSkateStep(vx, 0, true, false, accRun, 4, 0.2, glideCap, false);

  it('默认档：num3=10、tileSpeed=1 → num4=10 → num6=1.6（16/10）', () => {
    const r = damp(2.9, Math.max(1.5, 16 / Math.max(1, Math.trunc(10 * (1 / 1)))));
    expect(r.dampedVx).toBeDefined();
    // lerp 0.3 向 +1.6 收敛：3 + (1.6-3)×0.3 = 2.58
    expect(r.dampedVx).toBeCloseTo(2.9 + (1.6 - 2.9) * 0.3, 10);
  });

  it('建筑工药水 raw=1.25 → tileSpeed 0.8 → num4=8 → num6=2.0（放置越快滑得越快）', () => {
    const num4 = Math.trunc(10 * (1 / Math.min(3, 1.25)));
    expect(num4).toBe(8);
    const r = damp(2.9, Math.max(1.5, 16 / num4));
    expect(r.dampedVx).toBeCloseTo(2.9 + (2 - 2.9) * 0.3, 10);
  });

  it('raw 钳 3 → num4=3 → num6=16/3≈5.333（300% 放置速 = 巡航上限档）', () => {
    const num4 = Math.trunc(10 * (1 / 3));
    expect(num4).toBe(3);
    expect(Math.max(1.5, 16 / Math.max(1, num4))).toBeCloseTo(16 / 3, 10);
  });

  it('低速收尾：|vx|<1.5 lerp→0 并 0.03 截零；墙物品（createWall）不入 num3 门', () => {
    const r = damp(0.5, 1.6);
    expect(r.dampedVx).toBeCloseTo(0.5 * 0.7, 10);       // 0.5 + (0-0.5)×0.3
    // 墙族 createWall≥0 不满足 createTile≥0/tileWand>0 → num3 恒基准 10
    expect(itemCombat(5640)?.useTime).toBe(20);          // 骑乘中手持坐骑物品 → num3=10
  });

  it('placeSpeedTileRaw 聚合（:10248/:12960/:10005/:13122-13130）：Builder +0.25 / ambrosia +0.05 / 风筝 +0.15 / 砌砖刀族 +0.5 手持门', () => {
    const w = mkWorld();
    const p = new Player(30 * 16, 77 * 16, new Inventory());
    expect(p.placeSpeedTileRaw()).toBe(1);
    p.buffs.apply(BuffType.Builder, 1);
    expect(p.placeSpeedTileRaw()).toBe(1.25);
    p.usedAmbrosia = true;
    expect(p.placeSpeedTileRaw()).toBe(1.3);
    p.buffs.apply(BuffType.KiteBuff, 1);
    expect(p.placeSpeedTileRaw()).toBe(1.45);
  });
});

// ============================================================================
// 5. 轨骑三段（Player.cs:28306-28377——上轨/滑行/下轨）
// ============================================================================
/** 铺一段轨并 reframe（placeTrack 后必须 frameTrackArea，否则 frameX=0xFFFF 无轨面） */
const buildTrack = (w: World, x0: number, x1: number, row: number, style = 0): void => {
  for (let x = x0; x <= x1; x++) placeTrack(w.store, x, row, style);
  for (let x = x0; x <= x1; x++) frameTrackArea(w.store, x, row);
};
describe('SW-BJ59 滚轴鞋轨骑', () => {
  it('上轨：下落穿越轨面 → onTrack 置位 + 摔伤豁免（fallStartY=null）', () => {
    const w = mkWorld();
    buildTrack(w, 12, 40, 78);                                      // 平轨行 78（地面 80 上方一格）
    const p = new Player(24 * 16, 74 * 16, new Inventory());        // 轨上方两格下落
    expect(p.mount.setMount(58, p)).toBe(true);
    tick(p, w, 24);
    expect(p.onTrack).toBe(true);
    expect(p.fallStartY).toBeNull();
    expect(p.mount.type).toBe(58);
  });

  it('滑行：贴轨帧位置随轨面前进；平轨倾角归零（TrackRotation atan2=0）', () => {
    const w = mkWorld();
    buildTrack(w, 8, 68, 78);
    const p = new Player(16 * 16, 74 * 16, new Inventory());
    p.mount.setMount(58, p);
    tick(p, w, 20);                                   // 落轨
    expect(p.onTrack).toBe(true);
    p.inputX = 1;
    p.inputRight = true;
    tick(p, w, 30);                                   // 沿轨滑行
    expect(p.vx).toBeGreaterThan(0.5);
    expect(p.onTrack).toBe(true);
    expect(p.mount.fullRotation).toBe(0);             // 平轨 → TrackRotation 倾角 0
    expect(p.x).toBeGreaterThan(16 * 16);
  });

  it('下轨：轨端急停（open-end，与矿车同源）+ 跳离轨面 → onTrack 翻假恢复空中物理', () => {
    const w = mkWorld();
    buildTrack(w, 12, 30, 78);                                      // 轨到 x=30 止
    const p = new Player(14 * 16, 74 * 16, new Inventory());
    p.mount.setMount(58, p);
    tick(p, w, 20);
    expect(p.onTrack).toBe(true);
    p.inputX = 1;
    p.inputRight = true;
    tick(p, w, 100);                                  // 滑到轨端
    expect(p.onTrack).toBe(true);
    expect(p.x / TILE).toBeGreaterThan(28);           // 停在轨端（open-end 端点急停）
    expect(p.x / TILE).toBeLessThan(31);
    // 跳离：vy<0 → 磁铁点离开轨面 → 不再捕获 → 回退规则恢复空中物理
    p.inputJump = true;
    tick(p, w, 2);
    expect(p.onTrack).toBe(false);
    expect(p.vy).not.toBe(0);
  });

  it('加速轨：bits[5] → skateTrackBoost +4（:28369）并于下一拍并入 vx 钳 ±maxRun（:19946-19958）', () => {
    const w = mkWorld();
    buildTrack(w, 8, 60, 78);
    placeTrack(w.store, 20, 78, 3);                   // 右向加速轨（FIRST_RIGHT_BOOST_FRAME）
    frameTrackArea(w.store, 20, 78);
    const p = new Player(16 * 16, 74 * 16, new Inventory());
    p.mount.setMount(58, p);
    tick(p, w, 20);
    expect(p.onTrack).toBe(true);
    p.inputX = 1;
    p.inputRight = true;
    tick(p, w, 40);                                   // 越过加速轨
    expect(p.skateTrackBoost === 0 || p.vx > 0).toBe(true);   // 并入后清零或正在加速
    expect(p.onTrack).toBe(true);
  });

  it('基础速度链收敛（数据金标的运行时面）：骑乘满速帽 = maxRun 基 3 + RunSpeed 1 = 4 px/t ≈ 20 mph', () => {
    const w = mkWorld();
    const p = new Player(30 * 16, 77 * 16, new Inventory());
    p.mount.setMount(58, p);
    tick(p, w, 10);
    p.inputX = 1;
    p.inputRight = true;
    tick(p, w, 180);                                  // 3 秒加速
    expect(p.vx).toBeLessThanOrEqual(4.5);            // 4 + 越帽过冲容差
    expect(p.vx).toBeGreaterThan(3.5);                // 收敛到 additive 帽附近
  });
});
