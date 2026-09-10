// 枭首者头部残影载荷旋位回归（DoDeadCellsBeheadedParticles Player.cs:24491-24510
// 旋位支清偿,2026-09-03;同日 R3 复核批扩矿车轨面支+速度旋支接线）：
//   fullRotation≠0 → 载荷位 = 基位绕 position+fullRotationOrigin 旋（:24497-24500
//   vector.RotatedBy(fullRotation, pivot)）——矿车轨面 TrackRotation（:28325-28326
//   origin=(w/2,h)）∪ UFO 7/钻头 8/扫帚 23 倾斜机身；旋后值直入 module8 载荷
//   （broadcastParticleOrchestra 载荷坐标即旋后值）。
//   骑乘速度旋转支（:24501-24504 vector2.RotatedBy(fullRotation, Zero)）——E3 曾登记
//   "AnyTrackRider∩fullRotation 写面=∅ 死支保留",R3 复核推翻（:28325 ref 写玩家
//   fullRotation ∧ 矿车族 AnyTrackRider 恒真,交集非空）→ 已按同一 fullRotation 源
//   接线；非轨道坐骑（UFO 等）门假不旋。
//   载荷纵项（红队R3②③）：gfxOffY 聚合（gfxOffY+stepRenderY+cart.gfxOffY）与
//   MountedTop（:3333-3346,gravDir=−1 走 Bottom−HOC 分支）。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { playerFullRotationOf, rotatedBy } from '../src/entities/Mounts';
import { ParticleOrchestraType } from '../src/net/syncModules';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import type { GameHooks } from '../src/entities/types';

/** 枭首者头部 5457（vanilla-itemstats hs=282 → head==282 门） */
const HEAD_5457 = ITEM_BY_KEY[vanillaItemKey(5457)!];

const hooksWithCapture = () => {
  const payloads: Array<{ type: number; x: number; y: number; moveX: number; moveY: number }> = [];
  const g = {
    world: new World(80, 80, 42, 'dc-head-rot'),
    player: null,
    enemies: () => [],
    broadcastParticleOrchestra: (type: number, x: number, y: number, moveX = 0, moveY = 0) => {
      payloads.push({ type, x, y, moveX, moveY });
    },
  } as unknown as GameHooks & { world: World };
  return { g, payloads };
};

const mkPlayer = (g: GameHooks & { world: World }): Player => {
  const p = new Player(20 * 16, 30 * 16, new Inventory());
  p.inv.armor[0] = { id: HEAD_5457, stack: 1 };   // head==282（枭首者头部 5457）
  g.player = p as never;
  return p;
};

describe('playerFullRotationOf / rotatedBy（Mounts.ts 纯函数）', () => {
  it('rotatedBy = Vector2.RotatedBy(rotation, center) 1:1', () => {
    const r = rotatedBy(10, 0, Math.PI / 2, 0, 0);        // +X 旋 π/2 → +Y
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(10, 12);
    const c = rotatedBy(11, 13, Math.PI / 2, 1, 1);       // 绕 (1,1)
    expect(c.x).toBeCloseTo(1 - 12, 12);
    expect(c.y).toBeCloseTo(1 + 10, 12);
  });

  it('UFO 7：pivot = 盒中心（SetMount Size/2 换算 42+boost）;扫帚 23：pivot = 盒底心', () => {
    const { g } = hooksWithCapture();
    const p = mkPlayer(g);
    p.mount.active = true;
    p.mount.type = 7;
    p.mount.fullRotation = 0.3;
    const fr7 = playerFullRotationOf(p, p.mount)!;
    expect(fr7.angle).toBe(0.3);
    expect(fr7.pivotX).toBeCloseTo(p.x + p.w / 2, 12);
    expect(fr7.pivotY).toBeCloseTo(p.y + p.h - (42 + (p.mount.heightBoost || 0)) / 2, 12);
    p.mount.type = 23;
    const fr23 = playerFullRotationOf(p, p.mount)!;
    expect(fr23.pivotY).toBeCloseTo(p.y + p.h, 12);       // Hover :3520 (w/2,h)
  });

  it('fullRotation=0 / 非倾斜族 / 未骑乘 → null（旋位支不触发）', () => {
    const { g } = hooksWithCapture();
    const p = mkPlayer(g);
    p.mount.active = true;
    p.mount.type = 7;
    p.mount.fullRotation = 0;
    expect(playerFullRotationOf(p, p.mount)).toBeNull();
    p.mount.fullRotation = 0.3;
    p.mount.type = 12;                                    // 写面外坐骑
    expect(playerFullRotationOf(p, p.mount)).toBeNull();
    p.mount.type = 7;
    p.mount.active = false;
    expect(playerFullRotationOf(p, p.mount)).toBeNull();
  });
});

describe('deadCellsBeheadedStep 旋位支（:24497-24500）', () => {
  it('fullRotation≠0：载荷位绕 pivot 旋（速度旋支门假——UFO 非 AnyTrackRider,vx/vy 原值直穿）', () => {
    const { g, payloads } = hooksWithCapture();
    const p = mkPlayer(g);
    p.mount.active = true;
    p.mount.type = 7;
    p.mount.fullRotation = 0.3;
    p.vx = 2;                                             // Remap(|vx|,0,3,0,−4) 生效
    const baseX = p.cx;
    // ★SW-FX25 重锚（2026-09-10，定谳=测试陈旧非源偏差）：骑乘态 vanilla position.Y
    //   经 SetMount（Mount.cs:6317-6323）底边保位、盒上扩 heightBoost → = 仓内
    //   p.y − heightBoost（UFO heightBoost=16,Mount.cs:1228;playerYOffsets 全帧 16
    //   :1237-1244）。MountedTop.Y = position.Y + HOC（Player.cs:3336-3338）,
    //   HOC = PlayerOffsetHitbox = −PlayerOffset + heightBoost（Mount.cs:427-433）
    //   = −16+16 = 0 → MountedTop.Y = p.y − 16。旧锚 p.y 漏 SetMount 底边保位换算
    //   = 期望整体低 16px（旋位测试的 x 差 = sin(0.3)×16 = 4.728 即同根）。
    const baseY = p.y - 16 + 0 + 8 + Math.max(0, Math.min(1, 2 / 3)) * -4;   // posVY+HOC +8×gravDir + Remap
    const fr = playerFullRotationOf(p, p.mount)!;
    const want = rotatedBy(baseX, baseY, fr.angle, fr.pivotX, fr.pivotY);
    p.deadCellsBeheadedStep(g);
    expect(payloads.length).toBe(1);
    expect(payloads[0].type).toBe(ParticleOrchestraType.DeadCellsBeheadedEffect);
    expect(payloads[0].x).toBeCloseTo(want.x, 9);
    expect(payloads[0].y).toBeCloseTo(want.y, 9);
    expect(payloads[0].moveX).toBe(2);                    // MovementVector = velocity 原值（门假:UFO∉AnyTrackRider :24501-24504）
    expect(payloads[0].moveY).toBe(p.vy);
  });

  it('fullRotation=0：载荷位 = 基位原值（回归保护）', () => {
    const { g, payloads } = hooksWithCapture();
    const p = mkPlayer(g);
    p.mount.active = true;
    p.mount.type = 7;
    p.mount.fullRotation = 0;
    p.deadCellsBeheadedStep(g);
    expect(payloads.length).toBe(1);
    expect(payloads[0].x).toBeCloseTo(p.cx, 9);
    // ★SW-FX25 重锚（同上注）：posVY = p.y − heightBoost(16) + HOC(0) + 8×gravDir
    expect(payloads[0].y).toBeCloseTo(p.y - 16 + 0 + 8, 9);
  });

  it('未骑乘：载荷位 = 基位原值（机身倾斜写面仅在骑乘态）', () => {
    const { g, payloads } = hooksWithCapture();
    const p = mkPlayer(g);
    p.deadCellsBeheadedStep(g);
    expect(payloads.length).toBe(1);
    expect(payloads[0].y).toBeCloseTo(p.y + 8, 9);
  });
});

describe('矿车轨面旋位支（Player.cs:28325-28326,R3 复核翻案接线）', () => {
  const mkCart = (p: Player, over: Partial<{ rotation: number; h: number; gfxOffY: number; mountId: number }> = {}): void => {
    p.ridingCart = true;
    p.cart = { mountId: 6, h: 52, rotation: 0, gfxOffY: 0, ...over } as never;
  };

  it('playerFullRotationOf 矿车支：angle=cart.rotation、pivot=position+(w/2,cart.h)（:28326 origin=(w/2,h),cart.h=42+boost=原版 mounted 盒高）', () => {
    const { g } = hooksWithCapture();
    const p = mkPlayer(g);
    mkCart(p, { rotation: 0.4 });
    const fr = playerFullRotationOf(p, p.mount, p.cart)!;
    expect(fr.angle).toBe(0.4);
    expect(fr.pivotX).toBeCloseTo(p.cx, 12);
    expect(fr.pivotY).toBeCloseTo(p.y + 52, 12);
    expect(playerFullRotationOf(p, p.mount, { rotation: 0, h: 52 })).toBeNull();   // 平轨 atan2=0 → 无旋位
  });

  it('载荷位：MountedTop(矿车 HOC=boost−bob=10−8=+2)+8+cart.gfxOffY 绕车盒底心旋;速度绕 Zero 旋（:24501-24504）', () => {
    const { g, payloads } = hooksWithCapture();
    const p = mkPlayer(g);
    mkCart(p, { rotation: 0.4, gfxOffY: 2 });
    p.vx = 2; p.vy = -1;
    const baseX = p.cx;
    const baseY = p.y + 2 + 8 + 2 + Math.max(0, Math.min(1, 2 / 3)) * -4;   // topY=y+HOC、+8×gravDir、+cart.gfxOffY、Remap(|vx|)×gravDir
    const fr = playerFullRotationOf(p, p.mount, p.cart)!;
    const want = rotatedBy(baseX, baseY, fr.angle, fr.pivotX, fr.pivotY);
    const wantV = rotatedBy(2, -1, fr.angle);             // pivot = Vector2.Zero
    p.deadCellsBeheadedStep(g);
    expect(payloads.length).toBe(1);
    expect(payloads[0].x).toBeCloseTo(want.x, 9);
    expect(payloads[0].y).toBeCloseTo(want.y, 9);
    expect(payloads[0].moveX).toBeCloseTo(wantV.x, 9);    // 速度旋支接线（原值≠旋后值）
    expect(payloads[0].moveY).toBeCloseTo(wantV.y, 9);
  });

  it('矿车 51/53：bob=10（SetAsMinecart (−10,−8)→10,Mount.cs:1102/:1110）→ HOC=0、基位 = y+8（rotation=0 无旋位）', () => {
    const { g, payloads } = hooksWithCapture();
    const p = mkPlayer(g);
    mkCart(p, { mountId: 51 });
    p.deadCellsBeheadedStep(g);
    expect(payloads[0].y).toBeCloseTo(p.y + 8, 9);
  });
});

describe('载荷纵项（红队R3②③）', () => {
  it('gfxOffY 聚合 = this.gfxOffY + stepRenderY（未骑乘：滑轮 :19837 + StepUp :28267 本仓等价系统）', () => {
    const { g, payloads } = hooksWithCapture();
    const p = mkPlayer(g);
    (p as unknown as { gfxOffY: number }).gfxOffY = 5;
    (p as unknown as { stepRenderY: number }).stepRenderY = 3;
    p.deadCellsBeheadedStep(g);
    expect(payloads[0].y).toBeCloseTo(p.y + 8 + 5 + 3, 9);
  });

  it('gravDir=−1（FTW 倒挂）：MountedTop 走 Bottom−HOC 分支 → 基位 = y+h−8（旧实现 y−8 = 锚差整盒高）', () => {
    const { g, payloads } = hooksWithCapture();
    const p = mkPlayer(g);
    p.gravDir = -1;
    p.deadCellsBeheadedStep(g);
    expect(payloads[0].y).toBeCloseTo(p.y + p.h - 8, 9);
  });

  it('gravDir=−1 + 坐骑：Bottom−HOC,HOC=boost−bob（兔 0:boost=20、bob=pyo[0]=30 → HOC=−10）', () => {
    const { g, payloads } = hooksWithCapture();
    const p = mkPlayer(g);
    p.gravDir = -1;
    p.mount.active = true;
    p.mount.type = 0;                                     // 兔：json pyo[0]=30、heightBoost=20（在档,无提取缺口）
    p.mount.fullRotation = 0;
    p.deadCellsBeheadedStep(g);
    expect(payloads[0].y).toBeCloseTo(p.y + p.h - (20 - 30) - 8, 9);   // (y+h)−HOC+8×gravDir
  });
});
