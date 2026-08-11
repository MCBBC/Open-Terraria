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

/** 格子的半砖碰撞盒（原版 Collision.cs:1320-1324 三处一致）：下半 8px。
 *  返回 null = 非实心；[top, bottom] = 碰撞盒的像素 y 区间 */
function solidSpan(world: World, tx: number, ty: number): [number, number] | null {
  const st = world.store;
  if (!st.isSolid(tx, ty)) return null;
  const top = ty * TILE + (st.half[st.idx(tx, ty)] ? 8 : 0);
  return [top, (ty + 1) * TILE];
}

/** 单个轴的移动 + 碰撞解析。返回是否发生碰撞。 */
function moveAxis(b: Body, world: World, dx: number, dy: number): { hitX: boolean; hitY: boolean } {
  let hitX = false, hitY = false;
  const st = world.store;
  const avx = Math.abs(b.vx);
  // 原版坡面放行门（Collision.cs:2361-2387 flag3）：从高/低侧贴面走近的坡面格
  // 不参与本轴碰撞（交给 slopeCollide 对角线贴合）。
  // slope1 左高右低 / 2 右高左低 / 3 左低右高(天花板) / 4 右低左高(天花板)
  const slopePass = (tx: number, ty: number): boolean => {
    const j = st.idx(tx, ty);
    const sl = st.slope[j];
    if (sl === 0 || st.half[j]) return false;
    const top = ty * TILE;
    if (sl === 1) return b.y + b.h - avx <= top && b.x >= tx * TILE;
    if (sl === 2) return b.y + b.h - avx <= top && b.x + b.w <= tx * TILE + TILE;
    if (sl === 3) return b.y + avx >= top && b.x >= tx * TILE;
    return b.y + avx >= top && b.x + b.w <= tx * TILE + TILE; // 4
  };
  // X 轴
  if (dx !== 0) {
    b.x += dx;
    const dir = Math.sign(dx);
    const edgeX = dir > 0 ? b.x + b.w : b.x;
    const tx = Math.floor(edgeX / TILE);
    const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      if (slopePass(tx, ty)) continue;
      const span = solidSpan(world, tx, ty);
      // 半砖只占下半：身体底部没超过半砖顶面（ty*16+8）则不拦
      if (span && b.y + b.h > span[0]) {
        // hoik 坡链放行（:2412/:2432）：身后格是配套坡面（同向坡链中段）→ 不拦
        const bj = st.idx(tx - Math.sign(dir), ty);
        if (dir > 0 && (st.slope[bj] === 2 || st.slope[bj] === 4)) continue;
        if (dir < 0 && (st.slope[bj] === 1 || st.slope[bj] === 3)) continue;
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
    // 原版取整行最高面（Collision.cs:1610-1631 num13 取最大盒顶），不能 break 在最左列——
    // 否则左列半砖/右列整砖时身体会嵌进整砖 8px
    let bestTop = Infinity;
    for (let tx = x0; tx <= x1; tx++) {
      const solid = world.store.isSolid(tx, ty);
      const span = solidSpan(world, tx, ty);
      const plat = !b.dropThrough && dir > 0 && world.store.isPlatform(tx, ty)
        && (b.y + b.h) - dy <= ty * TILE + 1; // 上一位置在平台之上
      if (dir > 0) {
        if (!solid && !plat) continue;
        if (slopePass(tx, ty)) continue; // 坡面格交给 slopeCollide 对角线贴合
        // 落地门槛（Collision.cs:1610/1631）：新底部越过盒顶 且 上一位置在盒顶之上，
        // 否则（嵌入/侧入）不吸附——半砖盒顶是 ty*16+8，只进入行上半不算落地
        const top = span ? span[0] : ty * TILE;
        if (b.y + b.h <= top || (b.y + b.h) - dy > top + 0.01) continue;
        if (top < bestTop) bestTop = top;
      } else {
        if (!solid) continue;
        if (slopePass(tx, ty)) continue;
        // 上顶：上一位置在盒底之下才命中；取最低盒底（最先撞到的天花板）
        const bottom = (ty + 1) * TILE;
        if (b.y >= bottom || b.y - dy < bottom - 0.01) continue;
        if (bottom < bestTop) bestTop = bottom;
      }
    }
    if (bestTop !== Infinity) {
      if (dir > 0) { b.y = bestTop - b.h; b.onGround = true; }
      else { b.y = bestTop; b.hitHead = true; }
      b.vy = 0;
      hitY = true;
    }
  }
  return { hitX, hitY };
}

/** 原版 Collision.SlopeCollision（1456 Collision.cs:1796-2036）适配：
 *  常规碰撞后对重叠坡面格做对角线贴合——身体沉到斜面下时抬回斜面上
 *  （走路沿坡爬升;多格取最高贴合位,与原版 y 最小值机制一致）。
 *  slope1/2 地面坡:slope1 左高右低(右移爬升)、slope2 右高左低;
 *  slope3/4 天花板坡:对称向下推离。 */
function slopeCollide(b: Body, world: World): void {
  const st = world.store;
  const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
  const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
  let bestLift = 0;      // 最大抬升量（负 y 位移;0 = 无贴合）
  let bestDrop = 0;      // 天花板最大下推量
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      if (!st.inBounds(tx, ty)) continue;
      const i = st.idx(tx, ty);
      const slope = st.slope[i];
      if (slope === 0 || st.half[i] || !st.isSolid(tx, ty)) continue;
      const vx0 = tx * TILE, vy0 = ty * TILE;
      if (b.x + b.w <= vx0 || b.x >= vx0 + TILE || b.y + b.h <= vy0 || b.y >= vy0 + TILE) continue;
      // 对角线水平偏移（:1882-1893/1927-1934）：slope1/3 取身体左缘进格深度,
      // slope2/4 取右缘
      let num4: number;
      if (slope === 1 || slope === 3) num4 = b.x - vx0;
      else num4 = vx0 + TILE - (b.x + b.w);
      if (num4 < 0) continue;
      if (slope === 3 || slope === 4) {
        // 天花板坡（:1883-1921）：头在斜面上方才贴合下推
        if (b.y <= vy0 + TILE - num4) {
          const num5 = vy0 + TILE - b.y - num4;
          if (num5 > bestDrop) bestDrop = num5;
        }
      } else {
        // 地面坡（:1935-1966）：脚沉到斜面之下才抬回（num7<0 即抬升）
        if (b.y + b.h < vy0 + num4) continue;
        const num7 = vy0 - (b.y + b.h) + num4;
        if (num7 < bestLift) bestLift = num7;
      }
    }
  }
  if (bestLift < 0) {
    const ny = b.y + bestLift;
    // 抬升后不能嵌进实心（原版 :2003 抬升受阻时回退 X 的守卫近似）
    let blocked = false;
    const bx0 = Math.floor(b.x / TILE), bx1 = Math.floor((b.x + b.w - 0.01) / TILE);
    const by0 = Math.floor(ny / TILE), by1 = Math.floor((ny + b.h - 0.01) / TILE);
    for (let tx = bx0; tx <= bx1 && !blocked; tx++) {
      for (let ty = by0; ty <= by1; ty++) {
        if (!st.inBounds(tx, ty)) continue;
        const j = st.idx(tx, ty);
        if (!st.isSolid(tx, ty) || st.slope[j] > 0 || st.half[j]) continue;
        const top = ty * TILE + (st.half[j] ? 8 : 0);
        if (b.x + b.w > tx * TILE && b.x < tx * TILE + TILE && ny + b.h > top && ny < (ty + 1) * TILE) { blocked = true; break; }
      }
    }
    if (!blocked) {
      b.y = ny;
      if (b.vy > 0) b.vy = 0;
      b.onGround = true;
    }
  }
  if (bestDrop > 0) {
    b.y += bestDrop;
    if (b.vy < 0.0101) b.vy = 0.0101; // 原版向下推离（:1902-1905）
  }
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
  slopeCollide(b, world);
}
