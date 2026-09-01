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
   *  （Player.cs:23258/:27753）。★对抗修复批③2026-09-01（NPC.cs:54513-54527）：
   *  城镇 NPC 该参【不是】恒 true——原版传的是每拍计算的 flag22（家平线门：
   *  homeTileY*16−32 > position.Y ⇔ 本体高于家线 32px+ 时 false→holds=false,
   *  不再踏站台面）；TownNPC.fixedUpdate 每 tick 按 flag22 写本字段，其余族仍恒 true。 */
  stepUpHolds?: boolean;
  stepUpNpc?: boolean;
  /** StepDown 触发门。原版两处均为 == 精确等值（NPC.cs:54374 velocity.Y==0、
   *  Player.cs:23252 velocity.Y==gravity）——语义 = 仅"贴地行走"吸附,空中实体不吸附。
   *  本仓 NPC 族重力在碰撞【前】累加（贴地时 vy=GRAVITY≠0）,故 NPC 门取语义等价的
   *  onGround；玩家取原版字面 vy===GRAVITY（'gravity'）。
   *  'never' = 恒不吸附：AI_007 的 !flag22 门取反形（NPC.cs:54518 `!flag22 && vy==0`
   *  才调 Collision.StepDown——flag22 为真〔本体不低于「家平线−32px」〕时不吸附；
   *  TownCritter 族 homeTileY=-1 ⇒ flag22 恒真 ⇒ 即本档,2026-08-19；★对抗修复批③
   *  起城镇 NPC 全体由 TownNPC.fixedUpdate 按 flag22 三态写本字段）。
   *  ★曾用 vy>=0 宽门：低空飞行小动物（萤火虫/蝴蝶平飞 vy≥0）脚下 7~17px 有落面
   *  即被瞬移按压 → "怪力按地+闪现"周期循环（飞行 AI 抬升后再次触发） */
  stepDownGate?: 'grounded' | 'gravity' | 'never';
  /** 液体位移减速因子（原版 waterMovementSpeed 族，NPC.cs:5946：水/岩浆 .5、蜂蜜 .25、
   *  微光 .375；dry=1）。Entity 基类缺省 1，Enemy 侧由 npcLiquid.updateNpcLiquid 写入 */
  liqFactor?: number;
  /** 连续中心格嵌入 tick 计数（unembedPass 延迟门用；脱出/未嵌入即复位） */
  embedTicks?: number;
  /** 本嵌入会话（embedTicks 未清零期）topEmbedded 横推已消耗预算 px
   *  （2026-09-01 tent 弹飞收敛帽；脱出即清零） */
  embedPushed?: number;
  /** 原版 Collision.TileCollision 第 9 参 hoik（默认 false）：钻洞弹幕类 AI 显式传
   *  true 才启用天花板坡链水平穿越放行。普通实体恒 false——曾误开为无条件规则，
   *  导致天花板坡邻接实心格被永久豁免（tent 悬臂案例：幽灵入场+hitWall 恒 false）。 */
  hoik?: boolean;
  /** ★斜坡 G2 门入口快照（2026-08-31 统一阻尼修复）：moveAndCollide 每 tick 在
   *  速度辅助/分轴解析【前】记录——slopeCollide 的贴合门用（原版
   *  `y = Position.Y + Velocity.Y`，Collision.cs G2 `Position.Y + num7 < y`） */
  vyEntry?: number;
  feetEntry?: number;
  /** 坡面受阻推离已发射（一次性；脱坡复位） */
  slopeBlockFired?: boolean;
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
        // 抬升,否则上坡会被每帧推回卡死。
        // ★2026-09-01 穿门定罪收窄：跨格豁免此前对【全部】图格生效 → 普通整块
        //   （slope0 非半砖,如闭合门 door_closed/箱柜架体）只要身体在进入该列前
        //   就已横向跨在其上,此后逐子步全部放行 = 整体穿墙。实锤两案：
        //   ① 荆棘旋刃 38×38 盒心落玩家中心(Projectile.cs:1154-1163 width/height=38),
        //     贴脸对关闭门掷出时出生盒右缘越门柱内 9px → 全程 hw=false 直穿;
        //   ② 斜下轨迹以行未重叠姿态先入柱、再下行压入门带 → 同理跨格态永拦失效。
        //   修法：跨格态仅对坡(slope≠0)/半砖(half)维持放行(其几何由 slopeCollide
        //   对角贴合接管);普通整块改为【止步不回拉】——抵消本子步横移冻结在移前位,
        //   不做整身回钳（嵌深任意大时回钳=瞬移,走滑下坡接平地的脚线沉降帧会被拽）。
        //   与原版可观测结果一致(vanilla TileCollision :2355 目标盒相交 + Vector3 跨格
        //   双支全假时同样无推离,但 vanilla 弹幕 Update 逐帧原速复位,玩家盒 20 宽中心
        //   出膛不会跨进邻柱;本仓旋刃族盒尺寸放大后必须引擎层兜底)。closeDoor 有
        //   EmptyTile 占格拒关门(Door.ts blocked 回调),关门压人不由此触发。
        const jw = st.idx(tx, ty);
        const wasAcross = dir > 0 ? oldX + b.w > tx * TILE + 0.01 : oldX < (tx + 1) * TILE - 0.01;
        if (wasAcross) {
          if (st.slope[jw] !== 0 || st.half[jw]) continue; // 坡/半砖跨格态:原放行语义不变
          b.x -= dx;                                       // 整块跨格态:止步(移前位),零回拉
          b.vx = 0;
          hitX = true;
          break;
        }
        // hoik 坡链放行（:2412/:2432）：身后格是配套坡面（同向坡链中段）→ 不拦。
        // ★原版为 TileCollision 形参（默认 false），仅钻洞弹幕 AI 显式传 true，
        //   普通实体碰撞恒不可达此支。曾无条件启用 → 天花板坡邻接实心格被永久
        //   豁免：玩家/NPC 幽灵穿入净空不足的悬臂禁区（2026-09-01 tent 案例定罪：
        //   x591 墙被右邻 (592,328) slope3 放走 1px 入场 → 头顶嵌实心 → 弹飞；
        //   且 hitWall 恒 false，NPC 检测不到墙无限重试）。对齐 vanilla 默认关。
        if (b.hoik) {
          const bj = st.idx(tx - Math.sign(dir), ty);
          if (dir > 0 && (st.slope[bj] === 2 || st.slope[bj] === 4)) continue;
          if (dir < 0 && (st.slope[bj] === 1 || st.slope[bj] === 3)) continue;
        }
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
        // ★天花板坡(3/4)顶面=实体地面（原版 topSlopes() 仅指 1/2：slope3/4 只参与
        //   "从下方顶头"结算，从上方踩其顶面按整块落地——Collision.cs:1610 solid 判
        //   `!tile.topSlopes()`。曾全坡一律交给 slopePass → 嵌入 6px 的 walked-on
        //   3/4 被拒重新着地 = 僵尸/掉落物在锤型天花坡上永久钉死+3px 抖动判例）
        const slv = st.slope[st.idx(tx, ty)] ?? 0;
        if (slv !== 3 && slv !== 4 && slopePass(tx, ty, b.x, oldY)) continue; // 坡面格交给 slopeCollide 对角线贴合
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

/** ★WalkDownSlope 预备阶段开关（2026-09-01 用户"角色阻尼滑入斜坡"终局修复）：
 *  vanilla 移动前阶段 Collision.WalkDownSlope（Collision.cs:1691-1795）全量移植。
 *  旧"速度辅助"其实是它的残缺尾巴（:1776-1794 vy+=|vx|），缺了 ：1696 活性门
 *  与全宽落面扫描 → 上/下坡起步帧 X 先走 Y 未跟上 = 脚悬空再被贴合拉回的
 *  阻尼沉浮。★回退开关：localStorage sw_slope_wd='0'（重进世界生效）。 */
let WALKDOWN_PRE = (() => {
  try { return typeof localStorage === 'undefined' || localStorage.getItem('sw_slope_wd') !== '0'; }
  catch { return true; }
})();
export const WALKDOWN_PRE_ENABLED = WALKDOWN_PRE;
export function setWalkDownPre(v: boolean): void { WALKDOWN_PRE = v; }

/** 原版 Collision.WalkDownSlope（1457 Collision.cs:1691-1795）逐字适配：
 *  贴地行走者即将步入下行地面坡（slope1 右行 / slope2 左行）时，于分轴移动【前】
 *  给 vy 追加 |vx| —— 让 Y 与 X 同帧同步走对角线，消灭"先平移再被轴后贴合拽回"
 *  的每帧沉浮循环。玩家 SlopingCollision 前置调用、NPC UpdateCollision 首步
 *  Collision_WalkDownSlopes 同源。与旧速度辅助的差异：
 *  ① 门：仅 vy==gravity 的纯贴地态激活（vanilla :1695 字面早退）；
 *  ② 落面扫描：【全身体宽度】[x..x+w] × (feet+4)/16 行起两行的矩形上探窗
 *     （17px 窗,:1717-1719 + Intersects 判定），取最贴脚候选——不再是只看中心列,
 *     接近坡第一列即同步补偿（阻尼残差根因）;
 *  ③ 表面等高续链门（:1735-1743）：同层表面并列时只跟随与行走方向配套的同侧
 *     坡链（slope==dirCode），防跨结构误触发。 */
function walkDownSlopePre(b: Body, world: World, wasGround: boolean): void {
  if (!WALKDOWN_PRE) return;
  // 活性门（:1695 字面 `Velocity.Y != gravity` 早退）：玩家侧 vy===GRAVITY 字面
  // 等价；NPC 族本仓重力先累加、碰撞头已清 onGround——贴地判据用入口快照
  // wasGround（'grounded' 档）;跳起首帧 vy<0 / 飞行体照旧早退。
  // TownCritter 'never' 档不参与（AI_007 flag22 语义）。
  if (!b.stepUp) return;
  const gate = b.stepDownGate ?? 'grounded';
  if (gate === 'never') return;
  if (gate === 'gravity' ? b.vy !== GRAVITY : !(wasGround && b.vy >= 0)) return;
  const st = world.store;
  // 扫描窗（:1698-1720）：j0=(feet+4)/16；候选面须在 (j*16-17, j*16) 的 17px 上探带内
  // 与身体盒相交，且 num5 <= num(初始 (j0+3)*16 大帽)。solid||solidTop(平台族)均可作面。
  const xC0 = Math.floor(b.x / TILE), xC1 = Math.floor((b.x + b.w) / TILE);
  const jA = Math.floor((b.y + b.h + 4) / TILE);
  let bestTop = (jA + 3) * TILE;    // num 初始
  let txB = -1, tyB = -1;           // num2/num3
  for (let i = xC0; i <= xC1; i++) {
    for (let j = jA; j <= jA + 1; j++) {
      if (!st.inBounds(i, j)) continue;
      if (!st.isActive(i, j)) continue;
      if (!st.isSolid(i, j) && !st.isPlatform(i, j)) continue;
      let top = j * TILE;
      if (st.half[st.idx(i, j)]) top += 8;   // halfBrick 面 +8（:1721-1723）
      // 17px 上探带矩形相交（:1717 Rectangle(j*16-17,…,16,16) vs 身体盒）+ 高度帽
      const bandOk = b.x + b.w > i * TILE && b.x < i * TILE + TILE
        && j * TILE - 17 < b.y + b.h && j * TILE - 17 + TILE > b.y;
      if (!bandOk || top > bestTop) continue;
      if (top === bestTop && txB !== -1 && tyB !== -1) {
        // 等高并列续链（:1735-1743）：前候选是坡时，只接受坡型==行走方向档位的新格;
        // 前候选非坡(平坦/半砖)则照单全收（else 分支直落）
        const prevIsSlope = st.slope[st.idx(txB, tyB)] !== 0;
        if (prevIsSlope && st.slope[st.idx(i, j)] !== (b.vx < 0 ? 2 : 1)) continue;
      }
      bestTop = top;
      txB = i; tyB = j;
    }
  }
  // 终段（:1766-1794）：选中面为下行坡且方向/进深满足 → vy += |vx|（纯加法,+不取反）
  if (txB === -1 || tyB === -1) return;
  const sl = st.slope[st.idx(txB, tyB)];
  if (sl !== 1 && sl !== 2) return;
  const vx0 = txB * TILE;
  if (sl === 1) {
    const depth = b.x - vx0;
    if (b.y + b.h >= tyB * TILE + depth && b.vx > 0) b.vy += Math.abs(b.vx);
  } else {
    const depth = vx0 + TILE - (b.x + b.w);
    if (b.y + b.h >= tyB * TILE + depth && b.vx < 0) b.vy += Math.abs(b.vx);
  }
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
function slopeCollide(
  b: Body, world: World, feetEntry: number, vyEntry: number, wasGround: boolean,
  captureOnly = false,
): boolean {
  const st = world.store;
  const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
  const y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.01) / TILE);
  let bestLift = 0;      // 最大抬升量（负 y 位移;0 = 无贴合）
  let bestDrop = 0;      // 天花板最大下推量
  let bestSnapY = -1;    // ★面随下贴候选（对角线目标 y；>0 = 有下贴）
  let bestSnapGap = 17;  // 脚底到对角线的正距离（越小越优先）
  let positionChanged = false;  // 贴合是否实际移动了 body（消费方 Y 冻结判定）
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
      const vx0 = tx * TILE, vy0 = ty * TILE;
      // ★面随下贴候选（真·must-be-first，2026-08-31 存档复现定案）：必须置于
      // 【所有】前进性 continue（平台脚带门/上行方向档/重叠门）之前——跨两坡格
      // 交界瞬间旧格已水平出窗、新格脚底未入其脚带,任一前门先跑都会让该格在
      // 交界帧不可见（实心坡 v5-t47 / 平台坡存档 t32 双例定罪）。门 =
      // wasGround + vy≥0 + !dropThrough + gap∈(0.05,17px)(=StepDown 吸附窗界
      // Collision.cs:3629)；线 = vy0 + num4(num4 按左/右缘进深钳 [0,TILE],
      // tip-over 场景 num4=0 ⇒ 线=格顶,gap≈0 防误拉)；候选取最贴近脚下者。
      //   ★上行排除门（2026-09-01 用户日志「上坡一段后掉落」定罪）：爬升方向
      //   与本坡下落向相反时（slope1 向左爬 / slope2 向右爬），身后仍重叠的
      //   低位格会持续发候选，把爬势按帽速逐帧拽回低线→爬升停滞致脱梯坠落。
      //   日志实录：L行 dx-26~79 同帧 dy+16~30 的反向拖拽段。
      //   ★wasGround 软门（2026-09-01 交替处阶梯下行漏帧终修，用户 F5 地形快照
      //   回放实锤）：坡格交界帧 slopeCollide 双候选皆缺席 → onGround 掉一帧 →
      //   walkDownSlopePre/速度辅助的 vy===GRAVITY 精确门就此失活（空中 vy
      //   只会越来越大永不复位）→ 整段纯重力坠落直到落地（实测 SPD3.0 每级台阶
      //   边界漏 2-3 帧、vy 序列 0.4/0.8/1.2）。修 = 非贴地帧只要缺口仍在「近线
      //   窗口」（≤ 半身 + 本帧行程：正常衔接最大浮空就是踏上下一坡格前的一步）
      //   也发候选——恢复通道不再依赖 wasGround 自愈；大缺口（真高空/坠崖）与
      //   上行排除门维持原语义不变。
      const nearLine = Math.abs(b.vx) > 0.01;   // 行走中才有近线豁免（静止浮空照旧走 wasGround 门）
      if ((wasGround || nearLine) && b.vy >= 0 && !b.dropThrough && (slope === 1 || slope === 2)
        && !((slope === 1 && b.vx < -0.01) || (slope === 2 && b.vx > 0.01))) {
        const n4s = Math.max(0, Math.min(TILE,
          slope === 1 ? b.x - vx0 : vx0 + TILE - (b.x + b.w)));
        const gapS = vy0 + n4s - (b.y + b.h);          // >0 浮于面上 / ≤0 沉入
        if (gapS > 0.05 && gapS <= b.w / 2 + Math.abs(b.vx) && gapS < bestSnapGap) {
          bestSnapGap = gapS;
          bestSnapY = vy0 + n4s;
        }
      }
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
      if (b.x + b.w <= vx0 || b.x >= vx0 + TILE || b.y + b.h <= vy0 || b.y >= vy0 + TILE) continue;
      // 对角线水平偏移（:1882-1893/1927-1934）：slope1/3 取身体左缘进格深度,
      // slope2/4 取右缘。钳到 ≥0（与原版 num4<0 即跳过的差异,见函数头注释）：
      // 坡顶过渡瞬间(高侧缘越过坡面)原版会脱钩,脚底残留在对角线端点下方数像素,
      // 落地门槛不补救 → 角色沉进坡格;钳位后贴合保持到水平重叠结束,送脚到
      // 对角线高端点(=相邻整砖顶),由常规落地无缝接管
      let num4: number;
      // 平台坡【不钳 0】（原版 :1935+ num4<0 即跳过 = 高端侧外脱钩，楼梯竖柱
      // 里侧可走过）；实心坡维持钳 0（坡顶过渡贴合，见函数头注释）
      // ★2026-09-01 交替处坠落修（用户存档 3222-3223/275 实录）：num4 以【缘】
      //   进深判定——玩家右缘越过坡格右缘(num4<0)即跳过，但站在坡面高端末
      //   1-2px 的玩家（脚沉入 vy0 仅数 px）本应由邻接平平台接管，其着陆门槛
      //   (≤top+1)差 0.6px 边界失败 → 两侧都撒手 = 站着穿透坠落 4 格。
      //   修 = 沉深门：脚在坡顶 vy0 之下 ≤8px（坡顶过渡带）时钳 0 支持
      //   （坡顶 = 邻接平台面等高，钳 0 零跳变）；深陷（竖柱里侧穿越,沉>8px）
      //   维持原版跳过语义。
      if (slope === 1 || slope === 3) num4 = b.x - vx0;
      else num4 = vx0 + TILE - (b.x + b.w);
      if (isPlatSlope) {
        if (num4 < 0) {
          if (b.y + b.h - vy0 > 8) continue;
          num4 = 0;
        }
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
  // [临时取证口] 探针观测用，用后即删
  {
    const dbg = (globalThis as Record<string, unknown>)?.__SW_SCDBG as unknown[] | undefined;
    if (dbg) dbg.push({ wl: bestLift, ws: bestSnapY, wg: bestSnapGap });
  }
  if (bestLift >= 0) b.slopeBlockFired = false;   // 不再受阻：复位一次性标记
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
      positionChanged = true;
      if (b.vy > 0) b.vy = 0;
      // ★onGround 仅下落/静止贴合置位（原版 velocity.Y==0 落地语义）：上升期（vy<0）
      //   空中经过坡面格的贴合不置——否则裸装半空再按跳会走地面跳跃门=免费二段跳
      //   （2026-08-19 用户报+行为录制定位；探针 _slopejump.mjs 复现 vy+2.31→-2.55）
      if (b.vy >= 0) b.onGround = true;
    } else {
      // ★shortfall X-slide（原版 Collision.cs:2008-2036 核心机制）：
      //   坡面贴合被上方实心堵住时，将受阻量转为水平滑动而非清零速度。
      //   原版流程：贴合位移 → 递归 TileCollision 校验 → Y 被截短的差额
      //   转为 X 滑动（:2010-2015 bitsByte[1]/[2] → ±num9）。这使玩家走复杂
      //   坡结构时碰墙就滑过去而非卡死。
      //   本仓实现：限制滑行量 ≤ TILE（一格），方向 = 贴合方向的反向
      //   （被堵住意味着上方有障碍 → 沿墙面水平退让）。
      // ★2026-09-01 用户反馈"弹飞太远"定罪：此 slide 每 tick 触发，持续
      //   滑行 ~8px/tick × 多 tick = 累计数远超 1 格。修=一次性 4px 半格推离
      //   （slopeBlockFired 门），接触期不重复，离开坡面后复位。
      if (!b.slopeBlockFired) {
        b.slopeBlockFired = true;
        b.x += (b.vx >= 0 ? -1 : 1) * 4;          // 半格推离（固定量，非比例）
      }
      b.vy = 0;
      // 物理埋点（探针取证用；window.__swPhysDbg 为真时计数）
      const dbg = (globalThis as Record<string, unknown> | undefined)?.__swPhysDbg as Record<string, number> | undefined;
      if (dbg) dbg.shortfall = (dbg.shortfall ?? 0) + 1;
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
      // ★下行速率帽（2026-09-01 锯齿收官,用户实录贴平15帧+单帧+10~16px猛坠）：
      //   贴线的竖向位移超过对角线理论速度(|vx| 推进对应落差+1.2 容差)即说明
      //   候选跨了共线远端/多级格顶——按速度帽渐进追线,缺口后续 tick 闭合；
      //   离散台阶的整级位移由 StepDown 负责(不经此路),不受本帽影响。
      const diagCap = Math.abs(b.vx) + 1.2;
      const drop = ny - b.y;                 // >0 = 向下追线
      if (drop > diagCap) {
        b.y += diagCap;
        if (b.vy > diagCap) b.vy = diagCap;
        b.onGround = true;
      } else {
        b.y = ny;
        if (b.vy > 0) b.vy = 0;
        b.onGround = true;       // wasGround 门已挡飞行体/跳起首帧,无二段跳外溢
      }
    }
  }
  if (bestDrop > 0) {
    positionChanged = true;
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
      // 天花板坡下推受阻——★2026-09-01 阻尼定罪修复：旧实现此处 vx=0/vy=0，
      // 与输入加速度构成「加 0.08 → 清零」每帧循环 = 蠕动+站立态滑行（实机探针
      // i19 起逐样本同步定罪）。vanilla SlopeCollision 天花推离【无任何受阻清零】：
      // :1897-1921 成功仅 vy≥0.0101；截短发生在收尾 TileCollision 校验，按
      // bitsByte[3]/[4] 转水平滑动或直接采纳更短位移，从不碰 X 速度。分轴架构
      // 等价做法 = 放弃本次下推（不应用 ny）、速度保持，X 交给下一帧正常链路。
      const dbg = (globalThis as Record<string, unknown> | undefined)?.__swPhysDbg as Record<string, number> | undefined;
      if (dbg) dbg.ceilDropBlocked = (dbg.ceilDropBlocked ?? 0) + 1;
    }
  }
  return bestLift < 0 || bestDrop > 0;
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
    // ★对抗修复批③2026-09-01 D-F3（cs:54525-54527）：原版 AI_007 的 StepUp 整个
    // 包在 `if (velocity.Y >= 0f)` 里——上升帧（跳跃首 tick / 击退上抛）不探台面,
    // 杜绝半空中贴身探测到 16.1px 内落脚格被瞬移抬升的"怪力上吸"。玩家侧原版同形
    // （Player.cs:23726/:28273 的 `(carpetFrame != -1 || velocity.Y >= gravity)` 门）;
    // 其余走 moveAndCollide 的族——AI_107 ImprovedWalkers（NPC.cs:64911 无门）与
    // 弹系步进体——本闸对它们只在 vy<0（离地上行）帧收紧探柱,贴地/下落行为零变化。
    if (b.vy >= 0) applyStepUp(b, world, !!b.stepUpHolds, b.stepUpNpc === true);
  }
  // ★WalkDownSlope 预备阶段（2026-09-01 全量移植,见 walkDownSlopePre 注释）：
  //   vanilla 玩家 SlopingCollision 前置/NPC UpdateCollision 首步同源。开启后
  //   接管 vy+=|vx| 的全部职责；旧中心列"速度辅助"保留为回退开关路径（二选一,
  //   防双重补偿把下坡吸成急坠）。
  walkDownSlopePre(b, world, wasGround);
  // 速度辅助（Collision.cs:1773-1790 = WalkDownSlope 尾巴的残缺移植）：脚底中心
  // 所在格是 slope1/2、水平速度朝低侧、脚已沉到对角线 → dy += |dx|。
  // ★仅在 WALKDOWN_PRE 关闭时执行（旧语义回退路径;sw_slope_wd='0' 复原）
  if (!WALKDOWN_PRE) {
    const st = world.store;
    const feetRow = Math.floor((b.y + b.h) / TILE);
    const midCol = Math.floor((b.x + b.w / 2) / TILE);
    if (dx !== 0 && st.inBounds(midCol, feetRow)) {
      // ★坡格下探(2026-09-01 交替处踏入下坠终修):浮在坡面上方的玩家 feetRow
      //   在坡格上方 1-3 行——只查 feetRow 会失明(漂移累积成 4-5px 下坠)。
      //   向下探测 3 行找同向坡格,按【中心面】算落差,落差 ≤半身时一步补齐。
      for (let dr = 0; dr <= 3; dr++) {
        const fy = feetRow + dr;
        if (!st.inBounds(midCol, fy)) break;
        const fi = st.idx(midCol, fy);
        const fs = st.slope[fi];
        if ((fs !== 1 && fs !== 2) || st.half[fi]
          || !(st.isSolid(midCol, fy) || st.isPlatform(midCol, fy))) {
          if (st.isActive(midCol, fy) && st.isSolid(midCol, fy)) break;  // 实心挡路=下方无坡
          continue;
        }
        const vx0 = midCol * TILE;
        const centerX = b.x + b.w / 2;
        const surfCenter = fs === 1
          ? fy * TILE + (centerX - vx0)
          : fy * TILE + (vx0 + TILE - centerX);
        const num4 = fs === 1 ? b.x - vx0 : vx0 + TILE - (b.x + b.w);
        // ★门终形(2026-09-01 踏入下坠终修):窗口 = 半身 + 单帧位移。
        //   踏入瞬间落差 = 半身(w/2≈10px)——定值门 deficit≤10 被浮空增长
        //   (无辅助时落差每帧增长 |dx|)一步越限后【永久关闭】,且浮空时
        //   wasGround=false 锁死 wasGround 门 → 无恢复路径 → 自由落体
        //   (用户实录 125px)。动态窗 = b.w/2 + |dx| 恰容纳「上帧未辅助的
        //   本帧增长」,跳跃跨越(落差按弧线增长远超 |dx|)仍被排除;
        //   补差帽同窗,单帧贴面不瞬移。
        const deficitCap = b.w / 2 + Math.abs(dx);
        const deficit = surfCenter - (b.y + b.h);
        const ztr = (globalThis as { __GLUETRACE?: unknown[] }).__GLUETRACE;
        if (ztr && ztr.length < 400) ztr.push({ dx: +dx.toFixed(2), mid: midCol, fy, fs, num4: +num4.toFixed(1), def: +deficit.toFixed(1), feet: +(b.y + b.h).toFixed(1), vy: +b.vy.toFixed(2), applied: false });
        if (num4 >= 0 && deficit >= -TILE && deficit <= deficitCap
          && ((fs === 1 && b.vx > 0) || (fs === 2 && b.vx < 0))) {
          const add = Math.max(Math.abs(dx), Math.min(deficit, deficitCap));
          dy += add;
          if (ztr && ztr.length) (ztr[ztr.length - 1] as { applied?: number }).applied = +add.toFixed(2);
        }
        break;   // 找到首个坡格即止(无论是否命中辅助)
      }
    }
  }
  // ★G2 入口快照（速度辅助之后、分轴之前——原版 y = Position.Y + Velocity.Y
  //   在 TileCollision 头部、速度辅助(:1773)之前）
  const feetEntry = b.y + b.h;
  const vyEntry = b.vy;
  b.vyEntry = vyEntry; b.feetEntry = feetEntry;
  // ★★2026-08-31 终版：贴合在分轴【前】+ 贴合后 dy=0（分轴 Y 不再推移）。
  //   旧序（轴后贴合）棘轮阻尼（-16px 恒定）;首版重排序（轴前贴合但分轴仍推）
  //   正反馈弹射（±40-90px 传送）。根因=贴合定位坡面后，分轴 Y 仍按原始重力
  //   dy 推移 → 身体被推离坡面 → 下一帧再贴回 → 循环。
  //   修=贴合后 dy=0：坡面贴合即最终 Y 定位（等同原版 SlopeCollision 先行、
  //   Y-sweep 见 vy=0 无附加位移）。X 分轴照常（行走不受影响）。
  //   面随 assist 的 dy+=|dx| 已被贴合本身覆盖（贴合=定位在坡面上）。
  const maxStep = 8;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  for (let i = 0; i < steps; i++) {
    const sx = dx / steps, sy = dy / steps;
    const { hitX, hitY } = moveAxis(b, world, sx, sy);
    if (hitX) { b.hitWall = true; dx = 0; }
    if (hitY) { b.collideY = true; dy = 0; }
    if (dx === 0 && dy === 0) break;
  }
  // ★轴后贴合（稳定序）+ 振幅限幅 + G2 + collideY：分轴架构下最稳组合
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
    b.embedPushed = 0;  // 横推预算同会话复位(2026-09-01 tent 收敛帽)
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
  // ★2026-09-01 tent 弹飞定罪:topEmbedded 一口气 min(max(l,r),4) 格爆推 =
  //  "阻尼走到悬臂尽头被弹出数格以外"的元凶(vanilla 无 unembed 等价机制,本支
  //  纯 worldgen 坏形自愈兜底)。收敛:每 tick 至多 1 格,本嵌入会话累计 ≤2 格,
  //  超帽即放弃本支(降级驻留,① 垂直支每 tick 重试)——禁止远程传送弹射。
  const wide = Math.min(Math.max(l, r), topEmbedded ? 1 : 4);
  const used = b.embedPushed ?? 0;
  const budget = topEmbedded ? Math.max(0, 2 * TILE - used) : wide * TILE;
  const push = Math.min(wide * TILE, budget);
  if (push <= 0) return;
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
    if (topEmbedded) b.embedPushed = used + push;   // 预算记账(会话帽)
    const dbg = (globalThis as Record<string, unknown> | undefined)?.__swPhysDbg as Record<string, number> | undefined;
    if (dbg) dbg.unembedH = (dbg.unembedH ?? 0) + 1;
  }
}
