// 分轴扫描 tile AABB 碰撞
import { TILE } from '../core/constants';
import type { World } from '../world/World';

export interface Body {
  x: number; y: number;       // 左上角（px）
  w: number; h: number;
  vx: number; vy: number;
  onGround: boolean;
  hitWall: boolean;
  hitHead: boolean;
  /** 平台单向碰撞：仅当开启且下落时与平台碰撞 */
  dropThrough?: boolean;
}

/** 单个轴的移动 + 碰撞解析。返回是否发生碰撞。 */
function moveAxis(b: Body, world: World, dx: number, dy: number): { hitX: boolean; hitY: boolean } {
  let hitX = false, hitY = false;
  // X 轴
  if (dx !== 0) {
    b.x += dx;
    const dir = Math.sign(dx);
    const edgeX = dir > 0 ? b.x + b.w : b.x;
    const tx = Math.floor(edgeX / TILE);
    const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      if (world.store.isSolid(tx, ty)) {
        if (dir > 0) b.x = tx * TILE - b.w;
        else b.x = (tx + 1) * TILE;
        b.vx = 0;
        hitX = true;
        break;
      }
    }
  }
  // Y 轴
  if (dy !== 0) {
    b.y += dy;
    const dir = Math.sign(dy);
    const edgeY = dir > 0 ? b.y + b.h : b.y;
    const ty = Math.floor(edgeY / TILE);
    const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      const solid = world.store.isSolid(tx, ty);
      const plat = !b.dropThrough && dir > 0 && world.store.isPlatform(tx, ty)
        && (b.y + b.h) - dy <= ty * TILE + 1; // 上一位置在平台之上
      if (solid || plat) {
        if (dir > 0) {
          b.y = ty * TILE - b.h;
          b.onGround = true;
        } else {
          b.y = (ty + 1) * TILE;
          b.hitHead = true;
        }
        b.vy = 0;
        hitY = true;
        break;
      }
    }
  }
  return { hitX, hitY };
}

/** 移动并碰撞。高速时分子步防穿透。 */
export function moveAndCollide(b: Body, world: World, dx: number, dy: number) {
  b.onGround = false;
  b.hitWall = false;
  b.hitHead = false;
  const maxStep = 8;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  for (let i = 0; i < steps; i++) {
    const sx = dx / steps, sy = dy / steps;
    const { hitX, hitY } = moveAxis(b, world, sx, sy);
    if (hitX) { b.hitWall = true; dx = 0; }
    if (hitY) dy = 0;
    if (dx === 0 && dy === 0) break;
  }
}
