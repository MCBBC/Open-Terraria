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
  /** slopeEmbedRevert 回退锚:moveAndCollide 入口处记录的本 tick 移动前位置 */
  px?: number; py?: number;
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
  /** 连续中心格嵌入 tick 计数（unembedPass 延迟门用；脱出/未嵌入即复位） */
  embedTicks?: number;
  /** ★斜坡 G2 门入口快照（2026-08-31 统一阻尼修复）：moveAndCollide 每 tick 在
   *  速度辅助/分轴解析【前】记录——slopeCollide 的贴合门用（原版
   *  `y = Position.Y + Velocity.Y`，Collision.cs G2 `Position.Y + num7 < y`） */
  vyEntry?: number;
  feetEntry?: number;
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

/** ★斜坡贴合 G2 速度门 + collideY 回写（2026-08-31 统一"阻尼陷入/逃出"修复）：
 *  原版 SlopeCollision 的贴合带两道我们缺失的门——
 *  · G2（:1947 `Position.Y + num7 < y`，y=入口英尺+本帧速度Y）：只有当贴合把
 *    身体抬到【高于本帧速度目标】时才生效——上升中/掠过的碰撞盒（飞行眼球/
 *    上抛物/高速穿越）被拒贴，杜绝逐帧拉拽（=用户报"阻尼陷入/逃出"，任何
 *    走 moveAndCollide 的主体统一中招：玩家/NPC/眼球/掉落物）；
 *  · collideY 回写（:1954 bitsByte[num3]=true）：贴合成功置 collideY——飞行
 *    AI（AI_002 collideY→oldVy×-0.5 弹跳）与掉落物结算靠它离场，缺失=贴着
 *    坡面爬行不反弹。
 *  天花板坡对称：门取 max(当前头，入口头+速度Y)。
 *  ★回退开关：localStorage sw_slope_g2='0'（重进世界生效）恢复旧无条件贴合。 */
let SLOPE_G2 = (() => {
  try { return typeof localStorage === 'undefined' || localStorage.getItem('sw_slope_g2') !== '0'; }
  catch { return true; }
})();
/** 回退审计用（tests/slope-g2 kill-switch 断言）：G2 门当前是否启用 */
export const SLOPE_G2_ENABLED = SLOPE_G2;
/** 运行时切换（探针 A/B 鉴别用；生产回退仍走 localStorage 重进世界） */
export function setSlopeG2(v: boolean): void { SLOPE_G2 = v; }

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
function slopeCollide(
  b: Body, world: World, feetEntry: number, vyEntry: number, wasGround: boolean,
): void {
  const st = world.store;
  const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
  const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
  let bestLift = 0;      // 最大抬升量（负 y 位移;0 = 无贴合）
  let bestDrop = 0;      // 天花板最大下推量
  let bestSnapY = -1;    // ★面随下贴候选（对角线目标 y；>0 = 有下贴）
  let bestSnapGap = 17;  // 脚底到对角线的正距离（越小越优先）
  // ★贴地前瞻行（+1）：跨坡格交界时脚底尚未探入下一行、旧格又已水平出窗——
  // 两候选皆不可见的裸奔缝（v5 探针 t47 定案,每列一次 5 帧空簇的根源）。
  // 仅贴地下行时多扫一行,让下一列对角线提前一帧进入候选窗。
  const yProbe = (wasGround && b.vy >= 0) ? y1 + 1 : y1;
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= yProbe; ty++) {
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
      // ★面随下贴候选——必须在重叠门前评估（下坡丢接地对症,2026-08-31 楼梯
      //   下行=跌落感定案）：跨两坡格交界的瞬间旧格已水平出窗、新格脚底尚未
      //   垂直入格，第 326 行的重叠门两侧都拒收 → 候选窗裸奔 4~5 帧（v5 探针
      //   t47 定案）→ vy 自由落体成簇 → FindFrame 腾空帧。此处对【贴地下行】
      //   的实心地面坡（1/2）提前发候选：线 = vy0 + num4（num4 仍按本格左/右缘
      //   进深钳 [0,TILE]——天然防误拉：tip-over 场景 num4=0 → 线=格顶=平地
      //   齐平,gap≈0 不触发）。门 = wasGround + vy≥0 + gap∈(0.05,17px)
      //   （=StepDown 吸附窗界,Collision.cs:3629）；候选取最贴近脚下者。
      if (wasGround && b.vy >= 0 && !isPlatSlope && slope <= 2) {
        const n4s = Math.max(0, Math.min(TILE,
          slope === 1 ? b.x - vx0 : vx0 + TILE - (b.x + b.w)));
        const gapS = vy0 + n4s - (b.y + b.h);          // >0 浮于面上 / ≤0 沉入
        if (gapS > 0.05 && gapS < bestSnapGap) {
          bestSnapGap = gapS;
          bestSnapY = vy0 + n4s;
        }
      }
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
          // G2 对称门（头目标=入口头+速度Y 与当前头取大）+ 命中即回写 collideY
          if (SLOPE_G2 && b.y + num5 <= Math.max(b.y, feetEntry - b.h + vyEntry)) continue;
          if (num5 > bestDrop) { bestDrop = num5; if (SLOPE_G2) b.collideY = true; }
        }
      } else {
        // 地面坡（:1935-1966）：沉到斜面下才抬回（gap<0 即抬升；面随下贴候选
        // 已上提到重叠门前,此处只保留抬升路径）
        const gap = vy0 + num4 - (b.y + b.h);          // >0 浮于面上 / ≤0 沉入面下
        if (gap >= 0) continue;                        // 未沉入 → 无抬升（原 :3621 面）
        const num7 = gap;
        // ★G2 速度门（:1947）：贴合结果必须高于「入口英尺+本帧速度Y」与当前
        //   落地位的较小者——上升/掠过者拒贴（阻尼根因）
        if (SLOPE_G2 && !(b.y + num7 < Math.min(b.y + b.h, feetEntry + vyEntry))) continue;
        if (num7 < bestLift) {
          bestLift = num7;
          if (SLOPE_G2) b.collideY = true;   // bitsByte[num3]=true（:1954）
        }
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
  } else if (bestSnapY > 0) {
    // ★面随下贴执行（与抬升互斥——本 tick 有沉入贴合时无需下贴）：
    //   脚底压回对角线 + 置接地 + 清落速（原版面随态 velocity.Y==0 同效）。
    //   守卫对称抬升守卫：目标位不得嵌进整砖/半砖（坡线端点紧贴支撑砖顶的畸形地形）
    const ny = bestSnapY - b.h;
    let blocked = false;
    const bx0 = Math.floor(b.x / TILE), bx1 = Math.floor((b.x + b.w - 0.01) / TILE);
    const by0 = Math.floor(ny / TILE), by1 = Math.floor((ny + b.h - 0.01) / TILE);
    for (let tx = bx0; tx <= bx1 && !blocked; tx++) {
      for (let ty = by0; ty <= by1; ty++) {
        if (!st.inBounds(tx, ty)) continue;
        const j = st.idx(tx, ty);
        if (!st.isSolid(tx, ty) || st.slope[j] > 0 || st.half[j]) continue;
        const top = ty * TILE + (st.half[j] ? 8 : 0);
        if (b.x + b.w > tx * TILE && b.x < tx * TILE + TILE && ny + b.h > top + 0.05 && ny < (ty + 1) * TILE) { blocked = true; break; }
      }
    }
    if (!blocked) {
      b.y = ny;
      if (b.vy > 0) b.vy = 0;
      b.onGround = true;       // wasGround 门已挡飞行体/跳起首帧,无二段跳外溢
    }
  }
  if (bestDrop > 0) {
    // 下推守卫:推离后不能嵌进下方实心(对称于抬升守卫)
    const ny = b.y + bestDrop;    let blocked = false;
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

/** 原版 Collision.noSlopeCollision（Collision.cs:2038-2113）+ NPC.Collision_MoveBlazingWheel
 *  （NPC.cs:93918-93926）——type 72 刺球专用碰撞（ApplyTileCollision :93755-93757 按
 *  type==72 分派；且 :93715 把 type 72 排除在 MoveSlopesAndStairFall 之外）：
 *  · 碰撞盒 = 身体中心 12×12（num=num2=12 :93921-93924），非全身盒
 *  · 斜面当整块（noSlope 无坡面放行/贴合）、平台穿透（fallThrough+fall2 :93925）
 *  · 速度按盒夹取 → 整体位移；collideX/collideY 按「速度是否被改」置位
 *    （Collision_MoveWhileDry :93734-93747：天花板接触 up→vy=0.01 下推也置 collideY）
 *  通用 moveAndCollide 的 slopeCollide 推离不置 collideY 旗 → AI_021 永远看不到
 *  Y 碰撞、永不翻向 = 刺球在地牢凹袋楔死（2026-08-25 用户报，种子 12345 复现实录） */
export function moveNoSlopeBox(b: Body, world: World, dx: number, dy: number): void {
  const st = world.store;
  const oldVX = dx, oldVY = dy;
  const bx = b.x + b.w / 2 - 6, by = b.y + b.h / 2 - 6;   // 12×12 盒左上 = 中心-6
  let rx = dx, ry = dy;
  let up = false, down = false;
  const tx0 = Math.max(0, Math.floor(bx / TILE) - 1), tx1 = Math.min(st.w - 1, Math.floor((bx + 12) / TILE) + 2);
  const ty0 = Math.max(0, Math.floor(by / TILE) - 1), ty1 = Math.min(st.h - 1, Math.floor((by + 12) / TILE) + 2);
  for (let i = tx0; i <= tx1; i++) {
    for (let j = ty0; j <= ty1; j++) {
      if (!st.inBounds(i, j)) continue;
      const ji = st.idx(i, j);
      if (!st.isActive(i, j)) continue;
      const solidTop = !st.isSolid(i, j) && st.isPlatform(i, j);
      if (!st.isSolid(i, j) && !solidTop) continue;
      let vy4 = j * TILE, h7 = TILE;
      if (st.half[ji]) { vy4 += 8; h7 -= 8; }
      const vx4 = i * TILE;
      // 目标位盒不重叠 → 跳过（noSlopeCollision 的 vector2 = Position+Velocity）
      if (bx + dx + 12 <= vx4 || bx + dx >= vx4 + TILE || by + dy + 12 <= vy4 || by + dy >= vy4 + h7) continue;
      if (by + 12 <= vy4) {
        // 从上方来 = 地板；fallThrough+fall2 → 平台顶穿透（:1902 前置条件取反）
        if (solidTop) continue;
        ry = Math.min(ry, vy4 - (by + 12));
        down = true;
      } else if (bx + 12 <= vx4 && !solidTop) {
        rx = Math.min(rx, vx4 - (bx + 12));            // 从左来,右侧墙
      } else if (bx >= vx4 + TILE && !solidTop) {
        rx = Math.max(rx, vx4 + TILE - bx);            // 从右来,左侧墙
      } else if (by >= vy4 + h7 && !solidTop) {
        up = true;                                      // 从下方来,天花板
        ry = Math.max(ry, vy4 + h7 - by);
      }
    }
  }
  b.x += rx; b.y += ry;
  b.vx = rx; b.vy = ry;
  if (up) b.vy = 0.01;                                 // Collision.up → vy=0.01（:93736-93738）
  b.hitWall = rx !== oldVX;
  b.hitHead = up;
  b.onGround = down;
  b.collideY = ry !== oldVY;
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
    // 'never'（AI_007 TownCritter flag22 恒 true 档）跳过 StepDown,StepUp 照常。
    // ★'grounded' 门补 vy>=0（2026-08-25）：原版字面 vy==0（NPC.cs:54374）在跳起
    //   首 tick（AI 已置 vy=-8）同样不吸附——曾只查 wasGround，跳起首 tick 被
    //   StepDown 先拽下 16px 再起跳（观感=起跳顿挫/沉一下；探针 tick=56 实录
    //   from y3928→3944 且 v=(−1.5,−8)）。vy>=0 不复活旧"低空飞虫被按地"bug
    //   （那需要无 wasGround 门；飞虫 wasGround 恒 false 本就不吸附）
    if (gate === 'never') { /* no StepDown */ }
    else if (gate === 'gravity' ? b.vy === GRAVITY : (wasGround && b.vy >= 0)) applyStepDown(b, world);
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
  // ★G2 入口快照（速度辅助之后、分轴之前——原版 y = Position.Y + Velocity.Y
  //   在 TileCollision 头部、速度辅助(:1773)之前）
  const feetEntry = b.y + b.h;
  const vyEntry = b.vy;
  b.vyEntry = vyEntry; b.feetEntry = feetEntry;
  const maxStep = 8;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  for (let i = 0; i < steps; i++) {
    const sx = dx / steps, sy = dy / steps;
    const { hitX, hitY } = moveAxis(b, world, sx, sy);
    if (hitX) { b.hitWall = true; dx = 0; }
    if (hitY) { b.collideY = true; dy = 0; }
    if (dx === 0 && dy === 0) break;
  }
  slopeCollide(b, world, feetEntry, vyEntry, wasGround);
  unembedPass(b, world);
}

const EMBED_DELAY_TICKS = 15;
function unembedPass(b: Body, world: World): void {
  const st = world.store;
  const cx = Math.floor((b.x + b.w / 2) / TILE);
  const cy = Math.floor((b.y + b.h / 2) / TILE);
  if (!st.inBounds(cx, cy)) return;
  const ci = st.idx(cx, cy);
  // ★顶带嵌入 variant（2026-08-25 用户存档凹龛实锤）：盒中心在空气袋但【顶行】
  // 压进悬突天花板（1 宽×2 高凹龛容不下 42px 高僵尸,头部嵌锡矿 8-10px）——
  // 中心格判空气→旧触发器恒不点火;而头部嵌入使 X/Y 碰撞互锁(移动目的地仍与
  // 实心相交=恒拦)→原版物理也自愈不能。顶行任一实心(非坡/半砖/平台)计入触发,
  // 15t 延迟门照旧滤瞬态(跳跃磕檐/StepUp 抬升的瞬时顶接触每帧复位计数)。
  // 站立/行走态顶行必为空气(42px 盒站 16px 地面,顶行高于地面 2 行)无误触发。
  const topRow = Math.floor(b.y / TILE);
  let topEmbedded = false;
  if (!st.isSolid(cx, cy)) {
    const nx0 = Math.floor(b.x / TILE), nx1 = Math.floor((b.x + b.w - 0.01) / TILE);
    for (let tx = nx0; tx <= nx1; tx++) {
      if (!st.inBounds(tx, topRow)) continue;
      const ti = st.idx(tx, topRow);
      if (st.isSolid(tx, topRow) && st.slope[ti] === 0 && !st.half[ti] && !st.isPlatform(tx, topRow)) {
        topEmbedded = true;
        break;
      }    }
  }
  // ★中心格判据须排除坡/半砖/平台(与上方顶行变体及函数头注释同款)——掉落物
  //  12px 高,站斜面对角线低侧时中心点必沉入坡面实心三角(合法贴合姿态,
  //  slopeCollide 逐 tick 管理),无排除=被判真嵌入→15t 后上抬 16px→重力落回
  //  →循环("掉落物在斜坡上下移-瞬移-再下移",2026-08-25 用户实报+存档标记定位)
  const centerSolid = st.isSolid(cx, cy) && st.slope[ci] === 0 && !st.half[ci] && !st.isPlatform(cx, cy);
  const embedded = centerSolid || topEmbedded;
  if (!embedded) {
    b.embedTicks = 0;   // 脱出/未嵌入:计数复位(瞬态嵌片靠原版物理自愈)
    return;
  }
  const emb = (b.embedTicks ?? 0) + 1;
  b.embedTicks = emb;
  // ★topEmbedded 快速响应(2026-08-31):头顶 solid 区嵌入的 15t 延迟期 = 无限上下
  //  弹跳期(站台+上方家具 1 格空隙),观感不可接受。top-embed 检出可靠性高(逐列扫
  //  solid 含坡面三角判定),2t 即可确认非瞬态。
  const delay = topEmbedded ? 2 : EMBED_DELAY_TICKS;
  if (emb < delay) return;
  // ① 向上:从盒顶行上方起找连续净空(≤3 格),每 tick 至多上移 1 格
  let clear = 0;
  for (let k = 1; k <= 3; k++) {
    const ty = topRow - k;
    if (!st.inBounds(cx, ty) || st.isSolid(cx, ty)) break;
    clear = k;
  }
  if (clear > 0) {
    const lift = Math.min(clear * TILE, TILE);
    if (lift > 0) {
      const ny = b.y - lift;
      // ★增量条带验证(2026-08-25 限速改):只验新扫过的顶带(旧顶行以上至新顶行)
      // ——限速后盒下半仍嵌在原实心里(救援前提),整盒验证恒假自否。
      // 原整盒验证(2026-08-24)配全深抬升,语义=一次到位;限速后逐格爬出,
      // 每步只须保证新进入的行净空(坡/半砖/平台不拦,同原判)。
      const nx0 = Math.floor(b.x / TILE), nx1 = Math.floor((b.x + b.w - 0.01) / TILE);
      const newRow = Math.floor(ny / TILE);
      const oldRow = Math.floor(b.y / TILE);
      let fits = true;
      for (let tx = nx0; tx <= nx1 && fits; tx++) {
        for (let ty = newRow; ty < oldRow && fits; ty++) {
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
    for (let k = 1; k <= 4; k++) {
      const tx = cx + dir * k;
      if (!st.inBounds(tx, cy) || st.isSolid(tx, cy)) break;
      n = k;
    }
    return n;
  };
  const l = sideClear(-1), r = sideClear(1);
  if (l === 0 && r === 0) return;
  const dir = r >= l ? 1 : -1;
  // ★topEmbedded 一口气推到最远净空(上限 4 格)——原 1 格/tick 期=连续弹跳窗口
  const push = Math.min(Math.max(l, r), 4) * TILE;
  const nx = b.x + dir * push;
  // 增量条带验证（同上移支）：只验新扫入的前缘列
  const leadCol = dir > 0 ? Math.floor((nx + b.w - 0.01) / TILE) : Math.floor(nx / TILE);
  let fits = true;
  for (let ty = Math.floor(b.y / TILE); ty <= Math.floor((b.y + b.h - 0.01) / TILE); ty++) {
    if (!st.inBounds(leadCol, ty)) continue;
    const ti = st.idx(leadCol, ty);
    if (st.isSolid(leadCol, ty) && st.slope[ti] === 0 && !st.half[ti] && !st.isPlatform(leadCol, ty)) {
      fits = false;
      break;
    }
  }
  if (fits) {
    b.x = nx;
    b.vx = 0;
  }
}
