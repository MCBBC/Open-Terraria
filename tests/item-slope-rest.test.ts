// 掉落物斜坡贴合回归（2026-08-25 用户实报：斜坡上掉落物"下移→瞬移上抬→再下移"
// 循环,存档氙奇葩标记 (2294,249)/(2314,251) 等四处坡面草）。
// 根因：unembedPass 中心格嵌入判据未排除坡格——12px 高掉落物站斜面对角线低侧时
// 中心点沉入坡面实心三角（合法贴合姿态）→ 被判真嵌入 → 15t 后上抬 16px → 重力
// 落回 → 循环。修 = 中心判据补 slope/half/platform 排除（与顶行变体同款）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE } from '../src/core/constants';

const W = 80, H = 256;

/** 坡面世界：行 40 起实心地台,x∈[20,40) 为 slope1(左高右低)坡面行,x≥40 整砖 */
function slopeWorld(): World {
  const w = new World(W, H, 7, 'item-slope-test');
  const st = w.store;
  for (let x = 0; x < W; x++) {
    st.setTile(x, 41, 1);            // 地台下垫整砖
    if (x >= 20 && x < 40) {
      st.setTile(x, 40, 1);
      st.setSlope(x, 40, 1);         // slope1 左高右低
    } else {
      st.setTile(x, 40, 1);          // 两侧整砖
    }
  }
  return w;
}

/** 模拟掉落物物理（重力 + moveAndCollide,与 ItemDrop.fixedUpdate 同参） */
function settle(w: World, x: number, y: number, ticks: number): { y: number; vy: number; onGround: boolean } {
  const b = {
    x, y, w: 12, h: 12, vx: 0, vy: 0,
    onGround: false, hitWall: false, hitHead: false,
  };
  for (let i = 0; i < ticks; i++) {
    b.vy = Math.min(b.vy + 0.1, 7);   // ITEM_GRAVITY/ITEM_MAX_FALL 近似
    moveAndCollide(b, w, b.vx, b.vy);
  }
  return { y: b.y, vy: b.vy, onGround: b.onGround };
}

describe('掉落物斜坡贴合（unembedPass 中心判据坡格排除）', () => {
  it('坡面低侧静置：60t 内 y 漂移 ≤2px（无瞬移上抬循环）', () => {
    const w = slopeWorld();
    // 坡面低侧（x≈37,坡面对角线深区,12px 盒中心必入坡格实心三角）
    const a = settle(w, 37 * TILE - 2, 40 * TILE - 20, 60);
    const b = settle(w, 37 * TILE - 2, a.y, 60);
    expect(a.vy, '应贴合静置(vy=0)').toBe(0);
    expect(Math.abs(b.y - a.y), `后 60t y 漂移 ${Math.abs(b.y - a.y).toFixed(1)}px 应≤2(无 16px 瞬移)`).toBeLessThanOrEqual(2);
  });

  it('坡面高侧静置：同样稳定', () => {
    const w = slopeWorld();
    const r = settle(w, 21 * TILE, 40 * TILE - 20, 60);
    expect(r.vy).toBe(0);
  });

  it('坡面中段静置 120t：y 单调稳定（回归原 bug 周期≈15t+落体）', () => {
    const w = slopeWorld();
    const a = settle(w, 30 * TILE - 6, 40 * TILE - 20, 60);
    const b = settle(w, 30 * TILE - 6, a.y, 60);
    expect(Math.abs(b.y - a.y), '后 60t y 应零漂移').toBeLessThanOrEqual(0.5);
  });

  it('真嵌入自救不受影响：实心盒内的嵌入体仍能被 unembedPass 上抬', () => {
    const w = slopeWorld();
    const st = w.store;
    // 造真嵌入:x=50 行 39-40 实心(行 38 留净空=上抬出口),盒整体没入行 39 实心
    st.setTile(50, 39, 1);
    const y0 = 39 * TILE + 4;
    const b = {
      x: 50 * TILE + 2, y: y0, w: 12, h: 12, vx: 0, vy: 0,
      onGround: false, hitWall: false, hitHead: false, embedTicks: 20,
    };
    for (let i = 0; i < 30; i++) moveAndCollide(b, w, 0, 0);
    expect(b.y, `真嵌入应被上抬出实心(嵌入时 y=${y0})`).toBeLessThan(y0);
  });
});
