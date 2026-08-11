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
  // 不参与本轴碰撞（交给 slopeCollide 对角线贴合）。全部以【移动前】位置判定
  // （原版 vector3,:2306）——传参 ox/oy,勿用移动后的 b.x/b.y。
  // 地面坡门是 feet-|vx| <= 格底(top+16,:2375/:2379 的 num7=格高)——不是格顶!
  // 写成格顶会让低侧贴地进入永远不过 → 孤立坡前一格被 X 拦截卡死。
  // slope1 左高右低 / 2 右高左低 / 3 左低右高(天花板) / 4 右低左高(天花板)
  const slopePass = (tx: number, ty: number, ox: number, oy: number): boolean => {
    const j = st.idx(tx, ty);
    const sl = st.slope[j];
    if (sl === 0 || st.half[j]) return false;
    const top = ty * TILE;
    if (sl === 1) return oy + b.h - avx <= top + TILE && ox >= tx * TILE;
    if (sl === 2) return oy + b.h - avx <= top + TILE && ox + b.w <= tx * TILE + TILE;
    if (sl === 3) return oy + avx >= top && ox >= tx * TILE;
    return oy + avx >= top && ox + b.w <= tx * TILE + TILE; // 4
  };
  // X 轴
  if (dx !== 0) {
    b.x += dx;
    const dir = Math.sign(dx);
    const oldX = b.x - dx; // 本步移动前位置（原版 vector3）
    const edgeX = dir > 0 ? b.x + b.w : b.x;
    const tx = Math.floor(edgeX / TILE);
    const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      if (slopePass(tx, ty, oldX, b.y)) continue;
      const span = solidSpan(world, tx, ty);
      // 半砖只占下半：身体底部没超过半砖顶面（ty*16+8）则不拦
      if (span && b.y + b.h > span[0]) {
        // 原版拦截前提（:2406/:2426）：上一位置【完全】在该格一侧（贴面接近）才拦；
        // 身体已横向跨在格上（上坡爬升中段,脚沉在斜面下）不拦——交给 slopeCollide
        // 抬升,否则上坡会被每帧推回卡死
        if (dir > 0 ? oldX + b.w > tx * TILE + 0.01 : oldX < (tx + 1) * TILE - 0.01) continue;
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
    const oldY = b.y; // 移动前位置（原版 vector3.Y）
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
        if (slopePass(tx, ty, b.x, oldY)) continue; // 坡面格交给 slopeCollide 对角线贴合
        // 落地门槛（Collision.cs:1610/1631）：新底部越过盒顶 且 上一位置在盒顶之上，
        // 否则（嵌入/侧入）不吸附——半砖盒顶是 ty*16+8，只进入行上半不算落地
        const top = span ? span[0] : ty * TILE;
        if (b.y + b.h <= top || (b.y + b.h) - dy > top + 0.01) continue;
        if (top < bestTop) bestTop = top;
      } else {
        if (!solid) continue;
        if (slopePass(tx, ty, b.x, oldY)) continue;
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
 *  slope1/2 地面坡:slope1 左高右低(左行爬升)、slope2 右高左低;
 *  slope3/4 天花板坡:对称向下推离。
 *  受阻回退已对齐原版 :2004-2033（速度清零 + slope 向性 X 补偿）。
 *  与原版的偏差（稳定性取舍,均在行内注释标记）：
 *  - num4 钳 ≥0（原版 num4<0 跳过）：坡顶过渡瞬间防脱钩下沉
 *  - 未移植 :2003 的"重跑 TileCollision 校验"本体（分轴结构代价高,
 *    钳位已覆盖其主收益;受阻回退语义由嵌入守卫分支等价提供） */
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
      // slope2/4 取右缘。钳到 ≥0（与原版 num4<0 即跳过的差异,见函数头注释）：
      // 坡顶过渡瞬间(高侧缘越过坡面)原版会脱钩,脚底残留在对角线端点下方数像素,
      // 落地门槛不补救 → 角色沉进坡格;钳位后贴合保持到水平重叠结束,送脚到
      // 对角线高端点(=相邻整砖顶),由常规落地无缝接管
      let num4: number;
      if (slope === 1 || slope === 3) num4 = Math.max(0, b.x - vx0);
      else num4 = Math.max(0, vx0 + TILE - (b.x + b.w));
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
    // 抬升后不能嵌进实心
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
    } else {
      // 抬升受阻回退（原版 :2004-2018 的速度清零语义）——墙角坡干净挡停而非楔进角落。
      // 原版另有按 shortfall 的 X 滑动补偿,但其"重跑校验"保证每帧只作用一次;
      // 我们的分轴结构下输入每帧重新加速,X 推会变棘轮,故只取清零、不推 X
      b.vx = 0;
      b.vy = 0;
    }
  }
  if (bestDrop > 0) {
    // 下推守卫:推离后不能嵌进下方实心(对称于抬升守卫)
    const ny = b.y + bestDrop;
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
      if (b.vy < 0.0101) b.vy = 0.0101; // 原版向下推离（:1902-1905）
    } else {
      // 天花板坡下推受阻（原版 :2020-2033 镜像）：速度清零（X 补偿同上不取）
      b.vx = 0;
      b.vy = 0;
    }
  }
}

/** 移动并碰撞。高速时分子步防穿透。 */
export function moveAndCollide(b: Body, world: World, dx: number, dy: number) {
  b.onGround = false;
  b.hitWall = false;
  b.hitHead = false;
  // 速度辅助（Collision.cs:1773-1790）：脚底中心所在格(原版为整行落地候选格的近似)
  // 是 slope1/2、水平速度朝低侧、脚已沉到对角线 → dy += |dx|
  // （等价 Velocity.Y += |Velocity.X|）把身体粘到斜面,消除坡顶角/高速下坡 1 帧的格顶滑行
  {
    const st = world.store;
    const feetRow = Math.floor((b.y + b.h) / TILE);
    const midCol = Math.floor((b.x + b.w / 2) / TILE);
    if (dx !== 0 && st.inBounds(midCol, feetRow)) {
      const fi = st.idx(midCol, feetRow);
      const fs = st.slope[fi];
      if ((fs === 1 || fs === 2) && !st.half[fi] && st.isSolid(midCol, feetRow)) {
        const vx0 = midCol * TILE;
        const num4 = fs === 1 ? b.x - vx0 : vx0 + TILE - (b.x + b.w);
        if (num4 >= 0 && b.y + b.h >= feetRow * TILE + num4
          && ((fs === 1 && b.vx > 0) || (fs === 2 && b.vx < 0))) {
          dy += Math.abs(dx);
        }
      }
    }
  }
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
