// 分轴扫描 tile AABB 碰撞
import { TILE, GRAVITY } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';
import type { World } from '../world/World';

export interface Body {
  x: number; y: number;       // 左上角（px）
  w: number; h: number;
  vx: number; vy: number;
  onGround: boolean;
  hitWall: boolean;
  hitHead: boolean;
  /** 原版 collideY（NPC.cs:93804，Collision_MoveWhileDry `oldVelocity.Y != velocity.Y`）：
   *  本轴 tile 碰撞改写了 vy（落地/顶头清零）。★取值时点 = 分轴碰撞循环后、
   *  slopeCollide 之前——与原版 collideY 在 ApplyTileCollision 后、SlopeCollision 前
   *  写出的时序一致（坡面贴合清零 vy 不置位）。消费点：AI_001 携物梯
   *  :61309 气球弹跳 / :61932/:62124 落地嵌固回退（preCollideVy 配对读）。 */
  collideY?: boolean;
  /** 平台单向碰撞：仅当开启且下落时与平台碰撞 */
  dropThrough?: boolean;
  /** Projectile.tileCollide 镜像（AI 逐态直写,如蜘蛛 :62843-62860 穿平台/归位飞行
   *  :61410、蛙 :50648/:51266）——false 时 Collision.TileCollision 整段跳过、位移直写
   *  （原版弹幕 Update :17000+ 同构）。缺省 true=照常碰撞 */
  tileCollide?: boolean;
  /** 启用原版自动上台阶（Collision.StepUp）：行走实体（玩家/敌人/小动物/城镇NPC）置 true；
   *  掉落物/弹幕/墓碑等不参与（原版它们不调 StepUp） */
  stepUp?: boolean;
  /** StepUp holdsMatching（Collision.StepUp 第 8 参）：true 时允许把站台面
   *  （tileSolidTop 顶行：平台/桌子/铁砧/笼子…）当落脚格抬升——玩家传 controlUp
   *  （Player.cs:23258/:27753），NPC 恒 true（NPC.cs:54382 flag22，飞行态除外）。
   *  specialChecksMode==1 的 IgnoredByNpcStepUp 排除集（14/469/18/16/134）由
   *  stepUpNpc=true 启用 */
  stepUpHolds?: boolean;
  stepUpNpc?: boolean;
  /** StepDown 触发门。原版两处均为 == 精确等值（NPC.cs:54374 velocity.Y==0、
   *  Player.cs:23252 velocity.Y==gravity）——语义 = 仅"贴地行走"吸附,空中实体不吸附。
   *  本仓 NPC 族重力在碰撞【前】累加（贴地时 vy=GRAVITY≠0）,故 NPC 门取语义等价的
   *  onGround；玩家取原版字面 vy===GRAVITY（'gravity'）。
   *  'never' = 恒不吸附：AI_007 TownCritter（NPC.cs:54373 flag22 恒 true——homeTileY=-1
   *  使 StepDown 分支永不可达）专用档,2026-08-19。
   *  ★曾用 vy>=0 宽门：低空飞行小动物（萤火虫/蝴蝶平飞 vy≥0）脚下 7~17px 有落面
   *  即被瞬移按压 → "怪力按地+闪现"周期循环（飞行 AI 抬升后再次触发） */
  stepDownGate?: 'grounded' | 'gravity' | 'never';
  /** 液体位移减速因子（原版 waterMovementSpeed 族，NPC.cs:5946：水/岩浆 .5、蜂蜜 .25、
   *  微光 .375；dry=1）。Entity 基类缺省 1，Enemy 侧由 npcLiquid.updateNpcLiquid 写入 */
  liqFactor?: number;
}

/** Collision.StepUp（Collision.cs:3641-3770，gravDir=1、holdsMatching=false）：
 *  水平行走【意图速度】先探前方一列 → 满足净空门即抬升最多 16.1px
 *  （半砖 8px / 整砖台阶 16px）。玩家（Player.cs:23258/:27753）与全部 NPC
 *  （NPC.cs:54382，先于 TileCollision 用未受阻的速度调用）共用——
 *  此前只有玩家有自研版上台阶，敌人/小动物/城镇 NPC 全部卡死在半砖/台阶。
 *  gfxOffY 视觉缓动无对应渲染通道，位置直接抬升（原版 NPC 同样瞬间抬）。 */
function applyStepUp(b: Body, world: World, holds: boolean, npcMode: boolean): void {
  const vx = b.vx;
  if (vx === 0) return;
  const dir = Math.sign(vx);
  const st = world.store;
  const probeX = b.x + vx;                       // vector.X = position.X + velocity.X
  const num2 = Math.floor((probeX + b.w / 2 + (b.w / 2 + 1) * dir) / TILE);
  const num3 = Math.floor((b.y + b.h - 1) / TILE); // 脚底行（gravDir=1）
  const num4 = Math.floor(b.h / TILE) + (b.h % TILE !== 0 ? 1 : 0);
  if (!st.inBounds(num2, num3) || num3 >= st.h - 40) return;
  const solidAt = (x: number, y: number): boolean =>
    st.inBounds(x, y) && st.isSolid(x, y);       // 平台非 tileSolid → 不阻挡（vanilla 语义）
  const halfAt = (x: number, y: number): boolean =>
    st.inBounds(x, y) && !!st.half[st.idx(x, y)];
  const slopeAt = (x: number, y: number): number =>
    st.inBounds(x, y) ? st.slope[st.idx(x, y)] : 0;
  // 站台面（:3713 holdsMatching 门 = `(tileSolidTop&&frameY==0) || Platforms(19/427/
  //  435-439) || type==380`）——★不含 239 矿锭（可站可下穿但 StepUp 不踏），
  //  在 isPlatform（平台行为族含 239）基础上排除
  const platAt = (x: number, y: number): boolean => st.inBounds(x, y) && st.isPlatform(x, y)
    && TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet !== 239;
  // IgnoredByNpcStepUp（TileID.cs:209：14 篝火桌?/469 Tables2/18 工作台/16 铁砧/134 秘银砧——NPC 不踏）
  const NPC_STEPUP_IGNORE = new Set([14, 469, 18, 16, 134]);
  const sheetAt = (x: number, y: number): number => {
    const d = st.inBounds(x, y) ? TILE_DEFS[st.type[st.idx(x, y)]] : undefined;
    return (d as unknown as { vanilla?: { sheet?: number } })?.vanilla?.sheet ?? -1;
  };
  // flag（:3700-3708）：身体放入探柱（j=2..num4 上方行全净空）
  for (let j = 2; j <= num4; j++) if (solidAt(num2, num3 - j)) return;
  // flag2（:3710-3714）：后上方对角净空
  if (solidAt(num2 - dir, num3 - num4)) return;
  const centerX = b.x + b.w / 2;
  // flag3（:3725-3728）：脚上一格净空 / 面朝坡 / 半砖且其上净空
  {
    const s = slopeAt(num2, num3 - 1);
    const ok = !solidAt(num2, num3 - 1)
      || (s === 1 && centerX > num2 * TILE)
      || (s === 2 && centerX < num2 * TILE + TILE)
      || (halfAt(num2, num3 - 1) && !solidAt(num2, num3 - num4 - 1));
    if (!ok) return;
  }
  // flag4（:3713-3721）：落脚格实心（面朝坡且身体沉入）/ 或脚上一格是半砖 /
  //   holdsMatching 站台面落脚（(solidTop&&frameY==0)||Platforms||type==380，
  //   上一格非实心且非站台（flag4 &= !solidTop[type]||!solidTop[tile2]），NPC 排除集）
  {
    const fs = slopeAt(num2, num3);
    const topSlope = fs === 1 || fs === 2;
    const a = solidAt(num2, num3)
      && (!topSlope || (fs === 1 && centerX < num2 * TILE) || (fs === 2 && centerX > num2 * TILE + TILE))
      && (!topSlope || b.y + b.h > num3 * TILE);
    const bb = halfAt(num2, num3 - 1) && solidAt(num2, num3 - 1);
    const cc = holds && platAt(num2, num3)
      && !solidAt(num2, num3 - 1)
      && !platAt(num2, num3 - 1)
      && (!npcMode || !NPC_STEPUP_IGNORE.has(sheetAt(num2, num3)));
    if (!(a || bb || cc)) return;
  }
  // X 重叠门（:3745-3748）：探柱与移动后身体横向相交
  if (!(num2 * TILE < probeX + b.w && num2 * TILE + TILE > probeX)) return;
  // 抬升（:3750-3770）：半砖上一格 → rowTop-8；本格半砖 → rowTop+8；上限 16.1px
  let target = num3 * TILE;
  if (halfAt(num2, num3 - 1)) target -= 8;
  else if (halfAt(num2, num3)) target += 8;
  if (target >= b.y + b.h) return;
  if (b.y + b.h - target > 16.1) return;
  b.y = target - b.h;
}

/** 格子的半砖碰撞盒（原版 Collision.cs:1320-1324 三处一致）：下半 8px。
 *  返回 null = 非实心；[top, bottom] = 碰撞盒的像素 y 区间 */
function solidSpan(world: World, tx: number, ty: number): [number, number] | null {
  const st = world.store;
  if (!st.isSolid(tx, ty)) return null;
  const top = ty * TILE + (st.half[st.idx(tx, ty)] ? 8 : 0);
  return [top, (ty + 1) * TILE];
}

/** Collision.StepDown（Collision.cs:3577-3638，gravDir=1、waterWalk=false）：
 *  贴地行走时脚下 7~17px 内有落面（半砖顶/台阶/平台）→ 直接吸附下去，
 *  消除下楼梯的腾空帧（onGround 连续，AI 跳跃/攻击门不抖动）。
 *  玩家（Player.cs:23252，vy==gravity 时）与 NPC（NPC.cs:54377，vy==0 时）共用。 */
function applyStepDown(b: Body, world: World): void {
  const vx = b.vx;
  if (vx === 0) return;
  const st = world.store;
  const probeX = b.x + vx;                          // vector.X = position.X + velocity.X
  // vector.Y = ⌊(y+h)/16⌋×16 - h（:3581 先把脚底吸附到格线）
  const snapY = Math.floor((b.y + b.h) / TILE) * TILE - b.h;
  const rowA = Math.floor((snapY + b.h + 4) / TILE); // num3（:3585）
  const col0 = Math.floor(probeX / TILE), col1 = Math.floor((probeX + b.w) / TILE);
  const num4 = Math.floor(b.h / TILE) + (b.h % TILE !== 0 ? 1 : 0);
  let best = (rowA + num4) * TILE;                  // num5 初始（远下方默认）
  for (let i = col0; i <= col1; i++) {
    for (let j = rowA; j <= rowA + 1; j++) {
      if (!st.inBounds(i, j)) continue;
      const ji = st.idx(i, j);
      if (!(st.isSolid(i, j) || st.isPlatform(i, j))) continue; // tileSolid||tileSolidTop（:3614）
      let top = j * TILE;
      if (st.half[ji]) top += 8;                    // 半砖顶 +8（:3618-3621）
      // FloatIntersect(tile 行, 以原 position 判定 :3623)
      if (i * TILE < b.x + b.w && i * TILE + TILE > b.x
        && j * TILE - 17 < b.y + b.h && j * TILE - 17 + TILE > b.y && top < best) {
        best = top;
      }
    }
  }
  const gap = best - (b.y + b.h);                   // num10（:3630）
  if (gap > 7 && gap < 17) b.y = best - b.h;        // :3632-3637
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
      if (slope === 0 || st.half[i]) continue;
      // 坡面平台（平台锤楼梯，slope 恒 1/2——3/4 不存在于平台锤循环）：单向门
      // 1:1（Collision.cs:1851-1866）——上升中不挡（交给 stepUp 爬楼梯）；
      // 脚带内 [格顶, 格底+1+|vx|] 才接；上行方向档（slope1 且 vx≥0 /
      // slope2 且 vx≤0 且脚恰在上一行）不接
      const isPlatSlope = !st.isSolid(tx, ty) && st.isPlatform(tx, ty)
        && (slope === 1 || slope === 2);
      if (!st.isSolid(tx, ty) && !isPlatSlope) continue;
      if (isPlatSlope) {
        if (b.dropThrough) continue;   // 按住下 = 楼梯下穿（stairFall 可见语义）
        if (b.vy < 0) continue;
        if (b.y + b.h < ty * TILE || b.y + b.h - (1 + Math.abs(b.vx)) > ty * TILE + TILE) continue;
        if (((slope === 1 && b.vx >= 0) || (slope === 2 && b.vx <= 0))
          && Math.floor((b.y + b.h) / TILE) - 1 === ty) continue;
      }
      const vx0 = tx * TILE, vy0 = ty * TILE;
      if (b.x + b.w <= vx0 || b.x >= vx0 + TILE || b.y + b.h <= vy0 || b.y >= vy0 + TILE) continue;
      // 对角线水平偏移（:1882-1893/1927-1934）：slope1/3 取身体左缘进格深度,
      // slope2/4 取右缘。钳到 ≥0（与原版 num4<0 即跳过的差异,见函数头注释）：
      // 坡顶过渡瞬间(高侧缘越过坡面)原版会脱钩,脚底残留在对角线端点下方数像素,
      // 落地门槛不补救 → 角色沉进坡格;钳位后贴合保持到水平重叠结束,送脚到
      // 对角线高端点(=相邻整砖顶),由常规落地无缝接管
      let num4: number;
      // 平台坡【不钳 0】（原版 :1935+ num4<0 即跳过 = 高端侧外脱钩，楼梯竖柱
      // 里侧可走过）；实心坡维持钳 0（坡顶过渡贴合，见函数头注释）
      if (slope === 1 || slope === 3) num4 = b.x - vx0;
      else num4 = vx0 + TILE - (b.x + b.w);
      if (isPlatSlope) {
        if (num4 < 0) continue;
      } else {
        num4 = Math.max(0, num4);
      }
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
      // ★onGround 仅下落/静止贴合置位（原版 velocity.Y==0 落地语义）：上升期（vy<0）
      //   空中经过坡面格的贴合不置——否则裸装半空再按跳会走地面跳跃门=免费二段跳
      //   （2026-08-19 用户报+行为录制定位；探针 _slopejump.mjs 复现 vy+2.31→-2.55）
      if (b.vy >= 0) b.onGround = true;
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
  // tileCollide=false（Projectile.tileCollide 镜像,蜘蛛 :62852-62860 穿平台/归位飞行
  // :61410、蛙 :50648 等 AI 逐态直写）→ 碰撞整段跳过,位移直写（原版 Update 逐子步
  // `if (tileCollide) { TileCollision... } position += velocity` 同构）
  if (b.tileCollide === false) {
    b.x += dx; b.y += dy;
    b.onGround = false; b.hitWall = false; b.hitHead = false; b.collideY = false;
    return;
  }
  // NPC Collision_MoveWhileWet（NPC.cs:93986）：wet 时位移 ×liquidMoveFactor（velocity 不变，
  // 只缩位移）。由 npcLiquid.updateNpcLiquid 每 tick 写入（dry=1 跳过）；实体基类缺省 1。
  const lf = b.liqFactor;
  if (lf !== undefined && lf !== 1) { dx *= lf; dy *= lf; }
  const wasGround = b.onGround;   // 上一 tick 落地态（StepDown 贴地门用——重置前捕获）
  b.onGround = false;
  b.hitWall = false;
  b.hitHead = false;
  b.collideY = false;            // 原版 collideY 逐 tick 复位（NPC.cs:93741）
  // 原版 StepUp/StepDown 在 TileCollision 之前用未受阻的意图速度探测
  // （Player.cs:23252-23263 / NPC.cs:54377-54382）。StepDown 门：玩家 vy===GRAVITY
  // （原版字面 :23252）、NPC 族 onGround（原版 :54374 vy==0 在该时点=贴地语义；
  // 本仓重力先加,==0 恒假,取等价门）——宽门 vy>=0 会把低空飞行小动物周期性
  // 瞬移按压到地面（萤火虫/蝴蝶"怪力按地+闪现"根因）
  if (b.stepUp) {
    const gate = b.stepDownGate ?? 'grounded';
    // 'never'（AI_007 TownCritter flag22 恒 true 档）跳过 StepDown,StepUp 照常
    if (gate === 'never') { /* no StepDown */ }
    else if (gate === 'gravity' ? b.vy === GRAVITY : wasGround) applyStepDown(b, world);
    applyStepUp(b, world, !!b.stepUpHolds, b.stepUpNpc === true);
  }
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
    if (hitY) { b.collideY = true; dy = 0; }
    if (dx === 0 && dy === 0) break;
  }
  slopeCollide(b, world);
  unembedPass(b, world);
}

/** 嵌入自救 pass(2026-08-24 僵尸卡地形终案):盒【中心格】为实心(非坡/半砖/平台)
 *  = 真嵌入(正常站立/贴墙时中心必在空中)——坡面贴合/StepUp/生成期残留在极端
 *  地形(坡格上压实心盖等)下会把实体楔进实心,此后 X/Y 碰撞互相锁死(移动后仍
 *  与实心相交=恒拦),AI 跳跃(vy=-7)在实心顶盖下无效 → 永久卡死(用户实报:
 *  火把僵尸半嵌土丘,vy=-7 反复跳不出)。
 *  脱出:向上找最近连续净空(≤3 格)直接上移(重力场景天然出口);上方封死 →
 *  测左右 2 格净空宽的一侧平移。每 tick 至多一次,脱出后交还常规碰撞。 */
function unembedPass(b: Body, world: World): void {
  const st = world.store;
  const cx = Math.floor((b.x + b.w / 2) / TILE);
  const cy = Math.floor((b.y + b.h / 2) / TILE);
  if (!st.inBounds(cx, cy)) return;
  const ci = st.idx(cx, cy);
  if (!st.isSolid(cx, cy) || st.slope[ci] > 0 || st.half[ci] || st.isPlatform(cx, cy)) return;
  // ① 向上:从盒顶行上方起找连续净空(≤3 格),上移到盒顶达净空区
  const topRow = Math.floor(b.y / TILE);
  let clear = 0;
  for (let k = 1; k <= 3; k++) {
    const ty = topRow - k;
    if (!st.inBounds(cx, ty) || st.isSolid(cx, ty)) break;
    clear = k;
  }
  if (clear > 0) {
    // 上移量 = 盒顶到净空区底部(顶行上方第 clear 格的底) + 2px 余量
    const lift = Math.min(clear * TILE, b.y - (topRow - clear) * TILE + 2);
    if (lift > 0) {
      const ny = b.y - lift;
      // ★整盒验证(2026-08-24 review 加固):上移后盒占的所有格非实心
      // (中心格单点验证不够——盒高 2.6 格,顶/底格可能撞进别的实心)
      const nx0 = Math.floor(b.x / TILE), nx1 = Math.floor((b.x + b.w - 0.01) / TILE);
      const ny0 = Math.floor(ny / TILE), ny1 = Math.floor((ny + b.h - 0.01) / TILE);
      let fits = true;
      for (let tx = nx0; tx <= nx1 && fits; tx++) {
        for (let ty = ny0; ty <= ny1; ty++) {
          if (!st.inBounds(tx, ty)) continue;
          const ti = st.idx(tx, ty);
          if (st.isSolid(tx, ty) && st.slope[ti] === 0 && !st.half[ti] && !st.isPlatform(tx, ty)) {
            fits = false;
            break;
          }
        }
      }
      if (fits) {
        b.y = ny;
        if (b.vy > 0) b.vy = 0;
        return;
      }
    }
  }
  // ② 水平:左右各探 2 格,取连续净空更宽的一侧平移
  const sideClear = (dir: number): number => {
    let n = 0;
    for (let k = 1; k <= 2; k++) {
      const tx = cx + dir * k;
      if (!st.inBounds(tx, cy) || st.isSolid(tx, cy)) break;
      n = k;
    }
    return n;
  };
  const l = sideClear(-1), r = sideClear(1);
  if (l === 0 && r === 0) return;
  const dir = r >= l ? 1 : -1;
  const push = Math.max(l, r) * TILE;
  const nx = b.x + dir * push;
  // 整盒验证(同上移支)
  const nx0 = Math.floor(nx / TILE), nx1 = Math.floor((nx + b.w - 0.01) / TILE);
  const nyc = Math.floor((b.y + b.h / 2) / TILE);
  let fits = true;
  for (let tx = nx0; tx <= nx1 && fits; tx++) {
    for (let ty = Math.floor(b.y / TILE); ty <= Math.floor((b.y + b.h - 0.01) / TILE); ty++) {
      if (!st.inBounds(tx, ty)) continue;
      const ti = st.idx(tx, ty);
      if (st.isSolid(tx, ty) && st.slope[ti] === 0 && !st.half[ti] && !st.isPlatform(tx, ty)) {
        fits = false;
        break;
      }
    }
  }
  if (fits) {
    b.x = nx;
    b.vx = 0;
  }
}
