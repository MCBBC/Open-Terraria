// 枭首者头部残影载荷旋位回归（DoDeadCellsBeheadedParticles Player.cs:24491-24510
// 旋位支清偿,2026-09-03）：
//   fullRotation≠0 → 载荷位 = 基位绕 position+fullRotationOrigin 旋（:24497-24503
//   vector.RotatedBy(fullRotation, pivot)）——UFO 7/钻头 8/扫帚 23 倾斜机身；
//   旋后值直入 module8 载荷（broadcastParticleOrchestra 载荷坐标即旋后值）。
//   骑乘速度旋转支（:24504-24506）= AnyTrackRider∩fullRotation 写面 ∅ 构造性死支,
//   不建模（登记保留）。
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

describe('deadCellsBeheadedStep 旋位支（:24497-24503）', () => {
  it('fullRotation≠0：载荷位绕 pivot 旋（vx/vy 直穿——速度旋支死支不建模）', () => {
    const { g, payloads } = hooksWithCapture();
    const p = mkPlayer(g);
    p.mount.active = true;
    p.mount.type = 7;
    p.mount.fullRotation = 0.3;
    p.vx = 2;                                             // Remap(|vx|,0,3,0,−4) 生效
    const baseX = p.cx;
    const baseY = p.y + 8 + Math.max(0, Math.min(1, 2 / 3)) * -4;   // gravDir=1
    const fr = playerFullRotationOf(p, p.mount)!;
    const want = rotatedBy(baseX, baseY, fr.angle, fr.pivotX, fr.pivotY);
    p.deadCellsBeheadedStep(g);
    expect(payloads.length).toBe(1);
    expect(payloads[0].type).toBe(ParticleOrchestraType.DeadCellsBeheadedEffect);
    expect(payloads[0].x).toBeCloseTo(want.x, 9);
    expect(payloads[0].y).toBeCloseTo(want.y, 9);
    expect(payloads[0].moveX).toBe(2);                    // MovementVector = velocity 原值
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
    expect(payloads[0].y).toBeCloseTo(p.y + 8, 9);
  });

  it('未骑乘：载荷位 = 基位原值（机身倾斜写面仅在骑乘态）', () => {
    const { g, payloads } = hooksWithCapture();
    const p = mkPlayer(g);
    p.deadCellsBeheadedStep(g);
    expect(payloads.length).toBe(1);
    expect(payloads[0].y).toBeCloseTo(p.y + 8, 9);
  });
});
