// 封闭门阻挡弹幕回归（2026-09-01 用户报「火箭发射器/荆棘旋刃穿门,其他枪/魔法不穿」）：
// moveAndCollide→moveAxis X 支的「跨格豁免」曾对全部图格生效——普通整块(slope0 非半砖,
// door_closed 即此类)只要身体进入该列前就已横向跨在其上便永不拦截 = 整体穿墙。
// 实锤主案：荆棘旋刃 vanilla 38×38(Projectile.cs:1154-1163) 盒心落玩家中心,贴脸对
// 关闭门掷出时出生盒右缘越门柱 9px → 全程 hitWall=false 直穿。
// 修法：跨格豁免收窄到坡/半砖;普通整块改「止步不回拉」(抵消本子步横移冻结于移前位,
// 嵌深任意大时不做整身回钳=防瞬移),hitWall 照常置位驱动 stick/bounce 响应支。
import { describe, it, expect } from 'vitest';
import { moveAndCollide, type Body } from '../src/physics/TileCollision';
import { World } from '../src/world/World';
import { T } from '../src/data/tiles';

function mkBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false, collideY: false };
}

/** 门柱 x=60,y=49..51(1×3 闭合门)落在一行实心地面上 */
function mkWorld(): World {
  const w = new World(120, 80, 42, 'doorblock');
  const st = w.store;
  for (let dy = 0; dy < 3; dy++) st.setTileSilent(60, 49 + dy, T.DOOR_CLOSED);
  for (let x = 54; x <= 66; x++) st.setTileSilent(x, 52, 1);
  return w;
}

describe('封闭门 vs moveAndCollide 弹幕', () => {
  it('贴脸掷旋刃:出生盒跨进门柱 → 止步冻结,永不越过门柱(hitWall 置位)', () => {
    const w = mkWorld();
    const spawnX = 950 - 19;                       // 荆棘旋刃 38×38,盒心=玩家中心(950)
    const b = mkBody(spawnX, 51 * 16 - 19 - 19, 38, 38); // 右缘 969 越门左缘 9px
    let everHit = false;
    let maxX = spawnX;
    for (let t = 0; t < 40; t++) {
      b.vx = 10.4;
      moveAndCollide(b, w, b.vx, 0);
      everHit ||= b.hitWall;
      maxX = Math.max(maxX, b.x);
      if (!b.hitWall) b.vx = 10.4;   // AI 每 tick 以 lastVelocity 重推
    }
    expect(everHit).toBe(true);                    // 撞墙响应置位(stick/bounce 支依赖)
    expect(maxX).toBeLessThanOrEqual(spawnX + 11); // 至多首拍浅入即钉死(止步不回拉)
    expect(maxX).toBeLessThan(60 * 16 + 9.5);      // 永不深入门柱内半格以上
  });

  it('斜下掷旋刃越过门顶:合法落在门顶面,不入格', () => {
    const w = mkWorld();
    const b = mkBody(57 * 16, 47 * 16, 38, 38);
    for (let t = 0; t < 80; t++) moveAndCollide(b, w, 10.4, 3.5);
    // 终态不得与门柱 3 格任一相交(要么停在左侧面外,要么站在门顶正上方)
    const overlap = [49, 50, 51].some((r) =>
      b.x + b.w > 60 * 16 && b.x < 61 * 16 && b.y + b.h > r * 16 && b.y < r * 16 + 16
      && !(b.y + b.h === r * 16 || b.y === r * 16));  // 贴面相切不算入格
    expect(overlap).toBe(false);
  });

  it('远距平射火箭:正常撞门钳到近侧缘(hitWall+精确钳面)', () => {
    const w = mkWorld();
    const b = mkBody(55 * 16, 50 * 16 - 6, 14, 14);
    let hitX = false;
    for (let t = 0; t < 60 && !hitX; t++) {
      b.vx = Math.min((b.vx || 10.5) * 1.1, 15);
      moveAndCollide(b, w, b.vx, 0);
      if (b.hitWall) hitX = true;
    }
    expect(hitX).toBe(true);
    expect(b.x).toBe(60 * 16 - b.w);   // 原语义精确钳面未被回归破坏
  });
});
