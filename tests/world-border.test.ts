// 世界边界钳制回归(原版 Player.BordersMovement,Player.cs:23771-23844):
// 边缘内缩 640px(40 格)硬墙 + 顶下推 + 底部出界即死——修复"走出地图边缘直接掉落"。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const mkWorld = (): World => new World(200, 200, 100, 'border-test');

describe('Player.bordersMovement(原版 :23771-23844)', () => {
  it('左缘:越线钳回 640px 且 vx 清零', () => {
    const w = mkWorld();
    const p = new Player(100, 100 * 16, new Inventory());
    p.vx = -5;
    p.bordersMovement(w);
    expect(p.x).toBe(640);
    expect(p.vx).toBe(0);
  });

  it('右缘:钳回 rightWorld-640-宽 且 vx 清零', () => {
    const w = mkWorld();
    const p = new Player(200 * 16 - 10, 100 * 16, new Inventory());
    p.vx = 5;
    p.bordersMovement(w);
    expect(p.x).toBe(200 * 16 - 640 - p.w);
    expect(p.vx).toBe(0);
  });

  it('顶:钳回 + vy≥0.11 下推 + gravDir 复位', () => {
    const w = mkWorld();
    const p = new Player(100 * 16, 100, new Inventory());
    p.vy = -8;
    p.gravDir = -1;
    p.bordersMovement(w);
    expect(p.y).toBe(640);
    expect(p.vy).toBeGreaterThanOrEqual(0.11);
    expect(p.gravDir).toBe(1);
  });

  it('底:出界即死(KillMe 原因 21)+ 位置钳回', () => {
    const w = mkWorld();
    const p = new Player(100 * 16, 200 * 16 - 10, new Inventory());
    p.iframes = 60; // 出生/受击无敌帧在场——KillMe 必须无视它
    p.bordersMovement(w);
    expect(p.hp).toBe(0);              // 直杀(hp 归零;dead 由 fixedUpdate 尾部统一结算)
    expect(p.y).toBe(200 * 16 - 640);
    expect(p.vy).toBe(0);
  });

  it('界内不干预', () => {
    const w = mkWorld();
    const p = new Player(100 * 16, 100 * 16, new Inventory());
    const x0 = p.x, y0 = p.y, vx0 = p.vx, vy0 = p.vy;
    p.bordersMovement(w);
    expect(p.x).toBe(x0); expect(p.y).toBe(y0);
    expect(p.vx).toBe(vx0); expect(p.vy).toBe(vy0);
  });

  it('最小世界门:任一边 ≤80 格(2×640px)时整体豁免(单测手搓小世界)', () => {
    const w = new World(60, 60, 30, 'tiny');
    const p = new Player(20 * 16, 27 * 16, new Inventory()); // x=320<640,若不豁免必被钳
    const x0 = p.x;
    p.bordersMovement(w);
    expect(p.x).toBe(x0);
  });
});
