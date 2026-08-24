// 嵌入自救 pass 回归(2026-08-24 僵尸卡地形修复):
// 盒中心格实心(非坡/半砖) = 真嵌入 → 上移/平移脱出;正常站立/贴墙不触发。
import { describe, it, expect } from 'vitest';
import { moveAndCollide, type Body } from '../src/physics/TileCollision';
import { World } from '../src/world/World';

function mkBody(x: number, y: number, w = 18, h = 42): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false, collideY: false };
}

describe('unembedPass(嵌入自救)', () => {
  it('嵌在实心格中心:moveAndCollide 后被上移脱出', () => {
    const w = new World(120, 120, 42, 'unembed');
    const st = w.store;
    // 实心块 2 行(y51..52)——盒(42 高)嵌 y51..53.6,中心 y52 实心,头顶 y50 净空
    // (报告形态:下半埋上半露)
    for (let x = 50; x < 54; x++) for (let y = 51; y < 53; y++) st.setTileSilent(x, y, 1);
    const b = mkBody(51 * 16, 51 * 16, 18, 42);   // 中心 (51.6, 52.3) = 实心
    for (let t = 0; t < 30; t++) {
      b.vy = 0;
      moveAndCollide(b, w, 0, 0);
    }
    const cx = Math.floor((b.x + b.w / 2) / 16);
    const cy = Math.floor((b.y + b.h / 2) / 16);
    const i = st.idx(cx, cy);
    const stillEmbed = st.isSolid(cx, cy) && st.slope[i] === 0 && !st.half[i];
    expect(stillEmbed).toBe(false);   // 30 tick 内必脱出
  });

  it('正常站立(中心在空中):不被误判不位移', () => {
    const w = new World(120, 120, 42, 'stand');
    const st = w.store;
    for (let x = 40; x < 60; x++) st.setTileSilent(x, 60, 1);   // 地板
    const b = mkBody(50 * 16, 60 * 16 - 42);
    const x0 = b.x, y0 = b.y;
    for (let t = 0; t < 20; t++) { b.vy = 0.3; moveAndCollide(b, w, 0, 0.3); }
    expect(b.x).toBe(x0);
    expect(b.y).toBe(y0);          // 站在地板上不动
    expect(b.onGround).toBe(true);
  });

  it('贴墙站立(中心在空中,盒缘触墙):不被误推', () => {
    const w = new World(120, 120, 42, 'wall');
    const st = w.store;
    for (let y = 50; y < 60; y++) { st.setTileSilent(52, y, 1); st.setTileSilent(40, y, 1); }
    for (let x = 40; x < 52; x++) st.setTileSilent(x, 60, 1);
    const b = mkBody(50 * 16 + 14, 60 * 16 - 42, 18, 42);   // 右缘贴 (52) 墙
    const x0 = b.x;
    for (let t = 0; t < 20; t++) { b.vx = 1; b.vy = 0; moveAndCollide(b, w, 1, 0); b.vx = 1; }
    expect(b.x).toBe(x0);          // 贴墙顶住不穿不弹
    const cx = Math.floor((b.x + b.w / 2) / 16);
    expect(st.isSolid(cx, Math.floor((b.y + b.h / 2) / 16))).toBe(false);
  });
});
