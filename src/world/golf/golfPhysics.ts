// ============================================================================
// 高尔夫球物理 1:1 —— Terraria.Physics/BallCollision.cs 全量移植
// （GolfHelper.PhysicsProperties/ContactListener/OnPassThrough 一并内联）。
// 行号注释全部对准 /Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/。
// ============================================================================
//   BallCollision.Step          :24-89   主步进（drag→限速→子步→反弹→Resting）
//   CheckForPassThrough         :91-123  穿过判定（实心格/坡面半砖/液体面）
//   IsPositionInsideTile        :125-141 坡面/半砖内部判定
//   IsBallInWorld               :143-150 世界边界 32px 收缩
//   GetClosestEdgeToCircle      :152-180 球圆心 vs 扫掠格最近边
//   GetCollisionPointForTile    :182-229 坡面/上下/左右边候选
//   GetSlopeEdge                :231-276 四种坡面斜边
//   GetTopOrBottomEdge          :278-307 上下边（邻格实心则跳过）
//   GetLeftOrRightEdge          :309-344 左右边（同上）
//   GetTileBounds               :346-353 球盒覆盖格范围
//   IsNeighborSolid             :355-362 邻格实心（tileSolid && !tileSolidTop）
//   ClosestPointOnLineSegment   :364-379 线段最近点
//   GolfHelper.PhysicsProperties:273     (gravity=0.3, drag=0.99)
//   GolfHelper.ContactListener.OnCollision :34-84 材质阻尼+传送带+球洞
//   GolfHelper.ContactListener.OnPassThrough :137-159 水/蜂蜜/材质穿阻
//   材质表：Terraria.GameContent.Metadata.MaterialData.Materials.json +
//           MaterialData.Tiles.json（14 材质，非 Default 的 133 个 tile 全表）
// ============================================================================
import { LIQUID_TYPE, TileStore } from '../TileStore';
import { TILE_DEFS } from '../../data/tiles';

/** BallState.cs:3-7 */
export const enum BallState { Resting = 0, Moving = 1, OutOfBounds = 2 }

/** PhysicsProperties.cs（GolfHelper.cs:273 构造实参 0.3f, 0.99f） */
export const GOLF_PHYSICS = Object.freeze({ gravity: 0.3, drag: 0.99 });

// ---------------------------------------------------------------------------
// 材质表（MaterialData.Materials.json 逐条 1:1）
// ---------------------------------------------------------------------------
export interface GolfPhysicsValues {
  /** 法向（正对）撞击阻尼 */
  direct: number;
  /** 侧向（切向）撞击阻尼 */
  side: number;
  /** 球杆击球阻尼（HitGolfBall :451-461） */
  club: number;
  /** 穿过阻尼（OnPassThrough :150-155） */
  passThrough: number;
  /** 粗糙保留效率（HitGolfBall 的 Lerp 权重 ×杆 RoughLandResistance） */
  resistanceEfficiency: number;
}

const MATERIALS: Record<string, GolfPhysicsValues> = {
  Default: { direct: 0.95, side: 0.98, club: 1, passThrough: 1, resistanceEfficiency: 0 },
  Dirt: { direct: 0.9, side: 0.95, club: 0.9, passThrough: 1, resistanceEfficiency: 0.5 },
  Grass: { direct: 0.9, side: 0.95, club: 1, passThrough: 1, resistanceEfficiency: 0.5 },
  Snow: { direct: 0.5, side: 0.2, club: 0.6, passThrough: 1, resistanceEfficiency: 1 },
  Wood: { direct: 0.94, side: 0.99, club: 0.99, passThrough: 1, resistanceEfficiency: 0 },
  Ice: { direct: 0.95, side: 1.0, club: 0.99, passThrough: 1, resistanceEfficiency: 0 },
  Sand: { direct: 0.3, side: 0.2, club: 0.4, passThrough: 1, resistanceEfficiency: 1 },
  PinkSlime: { direct: 1, side: 1, club: 1, passThrough: 1, resistanceEfficiency: 0 },
  Organic: { direct: 0.7, side: 0.4, club: 0.8, passThrough: 1, resistanceEfficiency: 0.5 },
  Sticky: { direct: 0.1, side: 0.1, club: 0.2, passThrough: 1, resistanceEfficiency: 0.5 },
  Plant: { direct: 0.98, side: 0.98, club: 0.98, passThrough: 0.99, resistanceEfficiency: 0.5 },
  Web: { direct: 0.98, side: 0.98, club: 0.98, passThrough: 0.95, resistanceEfficiency: 0.5 },
  GolfGrass: { direct: 0.9, side: 0.98, club: 1.5, passThrough: 1, resistanceEfficiency: 0 },
  GolfTee: { direct: 0.9, side: 0.98, club: 1.8, passThrough: 1, resistanceEfficiency: 0 },
};

/** MaterialData.Tiles.json 非 Default 全表（133 条；未列出的 tile 一律 Default） */
const TILE_MATERIAL: Record<number, string> = {
  0: 'Dirt', 2: 'Grass', 3: 'Plant', 20: 'Plant', 23: 'Plant', 24: 'Plant', 27: 'Plant',
  30: 'Wood', 32: 'Plant', 51: 'Web', 52: 'Plant', 53: 'Sand', 59: 'Organic', 60: 'Grass',
  61: 'Plant', 62: 'Plant', 69: 'Plant', 70: 'Grass', 71: 'Plant', 73: 'Plant', 74: 'Plant',
  82: 'Plant', 83: 'Plant', 84: 'Plant', 109: 'Grass', 110: 'Plant', 112: 'Sand', 113: 'Plant',
  115: 'Plant', 116: 'Sand', 123: 'Sand', 124: 'Wood', 127: 'Ice', 147: 'Snow', 157: 'Wood',
  159: 'Wood', 161: 'Ice', 162: 'Ice', 163: 'Ice', 164: 'Ice', 179: 'Grass', 180: 'Grass',
  181: 'Grass', 182: 'Grass', 183: 'Grass', 184: 'Plant', 188: 'Organic', 189: 'Sand',
  190: 'Organic', 191: 'Wood', 192: 'Sand', 193: 'Organic', 195: 'Organic', 196: 'Sand',
  197: 'Ice', 199: 'Grass', 200: 'Ice', 201: 'Plant', 205: 'Plant', 206: 'Ice', 208: 'Wood',
  224: 'Sand', 225: 'Organic', 227: 'Plant', 229: 'Sticky', 230: 'Organic', 232: 'Wood',
  234: 'Sand', 236: 'Plant', 238: 'Plant', 249: 'Sticky', 251: 'Organic', 252: 'Snow',
  253: 'Wood', 311: 'Wood', 321: 'Wood', 322: 'Wood', 352: 'Plant', 371: 'PinkSlime',
  381: 'Grass', 382: 'Plant', 383: 'Wood', 384: 'Sand', 446: 'PinkSlime', 447: 'PinkSlime',
  448: 'PinkSlime', 460: 'Sand', 474: 'Organic', 477: 'GolfGrass', 484: 'Plant', 485: 'Plant',
  492: 'GolfGrass', 494: 'GolfTee', 495: 'Organic', 498: 'Organic', 512: 'Grass', 513: 'Grass',
  514: 'Grass', 515: 'Grass', 516: 'Grass', 517: 'Grass', 519: 'Plant', 528: 'Plant',
  529: 'Plant', 530: 'Plant', 534: 'Grass', 535: 'Grass', 536: 'Grass', 537: 'Grass',
  539: 'Grass', 540: 'Grass', 549: 'Plant', 562: 'Wood', 563: 'Wood', 571: 'Plant',
  590: 'Plant', 595: 'Plant', 615: 'Plant', 624: 'Plant', 625: 'Grass', 626: 'Grass',
  627: 'Grass', 628: 'Grass', 633: 'Grass', 635: 'Wood', 636: 'Plant', 637: 'Plant',
  638: 'Plant', 655: 'Plant', 656: 'Plant', 659: 'PinkSlime', 666: 'Sticky', 668: 'Dirt',
};

/** TileMaterials.GetByTileId(type).GolfPhysics（TileMaterials.cs 空表回 Default） */
export function golfPhysicsForTile(tileType: number): GolfPhysicsValues {
  return MATERIALS[TILE_MATERIAL[tileType]] ?? MATERIALS.Default;
}

// ---------------------------------------------------------------------------
// 地图访问（与 TileStore 解耦，测试注入假地图）
// ---------------------------------------------------------------------------
export interface GolfTileMap {
  widthTiles: number;
  heightTiles: number;
  /** Tile.nactive()（active && !inActive） */
  nactive(x: number, y: number): boolean;
  tileType(x: number, y: number): number;
  /** Main.tileSolid[type]（致动位归 isSolid 内处理） */
  tileSolid(x: number, y: number): boolean;
  /** Main.tileSolidTop[type] */
  tileSolidTop(x: number, y: number): boolean;
  /** Tile.slope() 0-4（Tile.cs 编码：1=左下斜 2=右下斜 3=左上斜 4=右上斜） */
  slope(x: number, y: number): number;
  /** Tile.halfBrick() */
  halfBrick(x: number, y: number): boolean;
  /** Tile.liquid 0-255 */
  liquid(x: number, y: number): number;
  /** 原版 Tile.liquidType() 编码：0=Water 1=Lava 2=Honey（本仓 +1 编码需先归一） */
  liquidTypeVanilla(x: number, y: number): number;
  /** Tile.frameY（平台非首行 frameY!=0 不参与碰撞，BallCollision.cs:189-191） */
  frameY(x: number, y: number): number;
}

/** 内部 tile id → 原版 tile id（Main.tile[].type；TILE_DEFS.vanilla.sheet）。
 *  材质表 TILE_MATERIAL 以原版 id 为键——**禁止**把内部 id 直接喂给 golfPhysicsForTile */
export function golfVanillaTileId(st: TileStore, x: number, y: number): number {
  if (!st.inBounds(x, y)) return 0;
  return TILE_DEFS[st.type[st.idx(x, y)]]?.vanilla?.sheet ?? 0;
}

/** TileStore → GolfTileMap 适配（液型按 TileStore.ts 头注 +1 编码归一成原版值；
 *  tileSolid = TILE_DEFS.solid && 未致动，即 Main.tileSolid + nactive 语义） */
export function golfMapFromStore(st: TileStore): GolfTileMap {
  const solidRaw = (x: number, y: number): boolean =>
    st.inBounds(x, y) && !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;
  return {
    widthTiles: st.w, heightTiles: st.h,
    nactive: (x, y) => st.isActive(x, y),
    tileType: (x, y) => golfVanillaTileId(st, x, y),   // 原版 id（材质表键）
    tileSolid: (x, y) => solidRaw(x, y)
      && (st.wire[st.idx(x, y)] & TileStore.WIRE_ACTUATED) === 0,
    tileSolidTop: (x, y) => st.isPlatform(x, y),
    slope: (x, y) => (st.inBounds(x, y) ? st.slope[st.idx(x, y)] : 0),
    halfBrick: (x, y) => st.inBounds(x, y) && st.half[st.idx(x, y)] !== 0,
    liquid: (x, y) => (st.inBounds(x, y) ? st.liquid[st.idx(x, y)] : 0),
    liquidTypeVanilla: (x, y) => {
      if (!st.inBounds(x, y)) return 0;
      const t = st.liquidType[st.idx(x, y)];
      return t === LIQUID_TYPE.LAVA ? 1 : t === LIQUID_TYPE.HONEY ? 2 : 0;
    },
    frameY: (x, y) => (st.inBounds(x, y) ? st.frameY[st.idx(x, y)] : 0),
  };
}

// ---------------------------------------------------------------------------
// BallPassThroughType.cs:3-9
// ---------------------------------------------------------------------------
const enum PassThroughType { None = 0, Water = 1, Honey = 2, Lava = 3, Tile = 4 }

/** TileEdges 位集（BallCollision.cs:11-22） */
const EDGE_NONE = 0, EDGE_TOP = 1, EDGE_BOTTOM = 2, EDGE_LEFT = 4, EDGE_RIGHT = 8;
const EDGE_TL_SLOPE = 0x10, EDGE_TR_SLOPE = 0x20, EDGE_BL_SLOPE = 0x40, EDGE_BR_SLOPE = 0x80;

/** 步进用的球引用（就地改 position/velocity/angular） */
export interface GolfBallBody {
  x: number; y: number;         // position（左上角）
  vx: number; vy: number;       // velocity
  w: number; h: number;         // size
  angular: number;              // localAI[0] 角速度
}

/** 碰撞回调（ContactListener.OnCollision 的落洞分支需要对外结算） */
export interface GolfBallHooks {
  /** 球洞 476 捕获（GolfHelper.cs:59-71：velocity*=0 后 PutBallInCup）。
   *  传洞杯格坐标（ImpactPoint - Normal*0.5 取整，:90） */
  onCupCapture?(tileX: number, tileY: number): void;
}

/**
 * BallCollision.Step（BallCollision.cs:24-89）+ ContactListener/OnPassThrough 内联。
 * 返回 BallStepResult.State（Resting/Moving/OutOfBounds）。
 */
export function stepGolfBall(body: GolfBallBody, map: GolfTileMap, hooks?: GolfBallHooks): BallState {
  let px = body.x, py = body.y;            // position（:26）
  let vx = body.vx, vy = body.vy;          // velocity（:27）
  const sizeX = body.w, sizeY = body.h;    // size（:28）
  let ang = body.angular;                  // num = entityAngularVelocity（:29）
  const radius = sizeX * 0.5;              // num2 = size.X * 0.5（:30）
  ang *= GOLF_PHYSICS.drag;                // num *= Drag（:31）
  vx *= GOLF_PHYSICS.drag;                 // velocity *= Drag（:32）
  vy *= GOLF_PHYSICS.drag;
  let speed = Math.hypot(vx, vy);          // num3（:33）
  if (speed > 1000) {                      // :34-38 限速 1000
    vx = 1000 * (vx / speed); vy = 1000 * (vy / speed);
    speed = 1000;
  }
  const substeps = Math.max(1, Math.ceil(speed / 2));   // num4（:39）
  const timeScale = 1 / substeps;                        // num5（:40）
  vx *= timeScale; vy *= timeScale;                      // velocity *= num5（:41）
  ang *= timeScale;                                      // num *= num5（:42）
  const subGravity = GOLF_PHYSICS.gravity / (substeps * substeps);  // num6（:43）
  let collided = false;                                   // flag（:44）
  for (let i = 0; i < substeps; i++) {
    vy += subGravity;                                     // velocity.Y += num6（:47）
    // ---- CheckForPassThrough（:48-61 / :91-123） ----
    const cx = px + sizeX * 0.5, cy = py + sizeY * 0.5;
    const pass = checkForPassThrough(cx, cy, map);
    if (pass !== PassThroughType.None) {
      const tx = Math.floor(cx / 16), ty = Math.floor(cy / 16);
      if (pass === PassThroughType.Tile && map.tileSolid(tx, ty) && !map.tileSolidTop(tx, ty)) {
        vx = 0; vy = 0;                                   // 嵌死在实心格内（:52-53）
        ang = 0;
        collided = true;
      } else {
        // ---- OnPassThrough（GolfHelper.cs:137-159） ----
        if (pass === PassThroughType.Water) { vx *= 0.91; vy *= 0.91; ang *= 0.91; }
        else if (pass === PassThroughType.Honey) { vx *= 0.8; vy *= 0.8; ang *= 0.8; }
        else if (pass === PassThroughType.Tile) {
          const d = golfPhysicsForTile(map.tileType(tx, ty)).passThrough;
          vx *= d; vy *= d; ang *= d;
        }
        // Lava 无阻尼（:156-157）
      }
    }
    px += vx; py += vy;                                   // position += velocity（:62）
    if (!isBallInWorld(px, py, sizeX, sizeY, map)) {      // :63-66
      // 原版直接 return，不回写 entity.position/velocity（:65）
      return BallState.OutOfBounds;
    }
    // ---- GetClosestEdgeToCircle（:67-76 / :152-180） ----
    const hit = getClosestEdgeToCircle(px, py, sizeX, sizeY, vx, vy, map);
    if (hit) {
      const centerX = px + sizeX * 0.5, centerY = py + sizeY * 0.5;
      let nx = centerX - hit.px, ny = centerY - hit.py;    // vector（:69）
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;                                   // Normalize
      // position = point + normal*(radius+0.0001) - size*0.5（:70）
      px = hit.px + nx * (radius + 0.0001) - sizeX * 0.5;
      py = hit.py + ny * (radius + 0.0001) - sizeY * 0.5;
      collided = true;                                      // flag = true（:72）
      // velocity = Reflect(velocity, normal)（:73）
      const dot = 2 * (vx * nx + vy * ny);
      vx = vx - dot * nx; vy = vy - dot * ny;
      // ---- ContactListener.OnCollision（GolfHelper.cs:34-84） ----
      const mat = golfPhysicsForTile(hit.tileType);
      // vector = velocity * Side（:37）；vector2 = normal*dot*(Direct-Side)（:38）
      const along = vx * mat.side, alongY = vy * mat.side;
      const vn = vx * nx + vy * ny;
      const addX = nx * vn * (mat.direct - mat.side), addY = ny * vn * (mat.direct - mat.side);
      vx = along + addX; vy = alongY + addY;                // velocity = vector + vector2（:39）
      if (hit.tileType === 421 || hit.tileType === 422) {   // 传送带（:43-58）
        const boost = 2.5 * timeScale;                      // num2 = 2.5 * TimeScale（:46）
        let tX = -ny, tY = nx;                              // (-Normal.Y, Normal.X)（:47）
        if (hit.tileType === 422) { tX = -tX; tY = -tY; }   // 422 反向（:48-51）
        const t = vx * tX + vy * tY;                        // num3（:52）
        if (t < boost) {                                    // :53-56
          const k = Math.min(Math.max(boost - t, 0), boost * 0.5);
          vx += tX * k; vy += tY * k;
        }
      } else if (hit.tileType === 476) {                    // 球洞（:59-71）
        const sp = Math.hypot(vx, vy) / timeScale;          // num = velocity.Length()/TimeScale（:61）
        if (!(ny > -0.01) && !(sp > 100)) {                 // 自上而下且 ≤100px/tick（:62）
          vx = 0; vy = 0;                                   // velocity *= 0f（:64）
          if (hooks?.onCupCapture) {
            // hitLocation = (ImpactPoint - Normal*0.5).ToTileCoordinates()（:90）
            const hlx = Math.floor((hit.px - nx * 0.5) / 16);
            const hly = Math.floor((hit.py - ny * 0.5) / 16);
            hooks.onCupCapture(hlx, hly);
          }
        }
      }
      // num = (Normal.X*vel.Y - Normal.Y*vel.X)/radius（:75）
      ang = (nx * vy - ny * vx) / radius;
    }
  }
  vx /= timeScale; vy /= timeScale;                        // velocity /= num5（:78）
  ang /= timeScale;                                        // num /= num5（:79）
  let result: BallState = BallState.Moving;                // Moving（:80）
  // Resting（:81-84）：碰撞过 + X 近停 + Y 在 (−gravity, 0]
  if (collided && vx > -0.01 && vx < 0.01 && vy <= 0 && vy > -GOLF_PHYSICS.gravity) {
    result = BallState.Resting;
  }
  body.x = px; body.y = py;                                // entity.position（:85）
  body.vx = vx; body.vy = vy;                              // entity.velocity（:86）
  body.angular = ang;                                      // entityAngularVelocity（:87）
  return result;                                           // :88
}

// ---------------------------------------------------------------------------
// CheckForPassThrough（BallCollision.cs:91-123）
// ---------------------------------------------------------------------------
function checkForPassThrough(cx: number, cy: number, map: GolfTileMap): PassThroughType {
  const tx = Math.floor(cx / 16), ty = Math.floor(cy / 16);   // ToTileCoordinates（:93）
  if (tx < 0 || ty < 0 || tx >= map.widthTiles || ty >= map.heightTiles) return PassThroughType.None;
  if (map.nactive(tx, ty)) {                                   // tile.nactive()（:100）
    return isPositionInsideTile(cx, cy, tx, ty, map)            // :102-103
      ? PassThroughType.Tile : PassThroughType.None;
  }
  const liq = map.liquid(tx, ty);
  if (liq > 0) {                                               // tile.liquid > 0（:105）
    // num = (ty+1)*16 - liquid/255*16（:107）—— 液面高度（y 向下为正）
    const surfaceY = (ty + 1) * 16 - (liq / 255) * 16;
    if (surfaceY < cy) {                                       // :120
      switch (map.liquidTypeVanilla(tx, ty)) {                 // :108-118
        case 1: return PassThroughType.Lava;
        case 2: return PassThroughType.Honey;
        default: return PassThroughType.Water;
      }
    }
  }
  return PassThroughType.None;
}

/** IsPositionInsideTile（BallCollision.cs:125-141） */
function isPositionInsideTile(px: number, py: number, tx: number, ty: number, map: GolfTileMap): boolean {
  const slope = map.slope(tx, ty);
  const half = map.halfBrick(tx, ty);
  if (slope === 0 && !half) return true;                       // :127-128
  const lx = px / 16 - tx, ly = py / 16 - ty;                  // vector（:131）
  switch (slope) {                                             // :132-139
    case 0: return ly > 0.5;                                   // 半砖：下半
    case 1: return ly > lx;                                    // 左下斜（\）
    case 2: return ly > 1 - lx;                                // 右下斜（/）
    case 3: return ly < 1 - lx;                                // 左上斜（/）
    case 4: return ly < lx;                                    // 右上斜（\）
    default: return false;
  }
}

/** IsBallInWorld（BallCollision.cs:143-150）：四边各收缩 32px */
function isBallInWorld(px: number, py: number, sx: number, sy: number, map: GolfTileMap): boolean {
  return px > 32 && py > 32
    && px + sx < map.widthTiles * 16 - 32
    && py + sy < map.heightTiles * 16 - 32;
}

interface TileEdgeHit { px: number; py: number; tileX: number; tileY: number; tileType: number }

/** GetClosestEdgeToCircle（BallCollision.cs:152-180） */
function getClosestEdgeToCircle(
  px: number, py: number, sx: number, sy: number, vx: number, vy: number, map: GolfTileMap,
): TileEdgeHit | null {
  const left = Math.floor(px / 16), top = Math.floor(py / 16);            // :348-349
  const right = Math.floor((px + sx) / 16), bottom = Math.floor((py + sy) / 16);  // :350-351
  const centerX = px + sx * 0.5, centerY = py + sy * 0.5;                 // vector（:155）
  let edges = EDGE_NONE;                                                   // :156
  // :157-160 按速度方向裁边
  edges |= vy < 0 ? EDGE_BOTTOM : EDGE_TOP;
  edges |= vx < 0 ? EDGE_RIGHT : EDGE_LEFT;
  edges |= vy > vx ? EDGE_BL_SLOPE : EDGE_TR_SLOPE;
  edges |= vy > -vx ? EDGE_BR_SLOPE : EDGE_TL_SLOPE;
  let best: TileEdgeHit | null = null;                                    // :161-162
  let bestDist = Number.MAX_VALUE;                                        // num（:163）
  let outX = 0, outY = 0, outDist = 0;                                    // closestPointOut/distanceSquaredOut（:164-165）
  for (let i = left; i <= right; i++) {                                   // :166-168
    for (let j = top; j <= bottom; j++) {
      const r = getCollisionPointForTile(edges, i, j, centerX, centerY, map, outX, outY, outDist);
      if (!r.hit) continue;
      outX = r.x; outY = r.y; outDist = r.dist;
      // :170 命中且更近且速度朝向该点
      if (outDist >= bestDist) continue;
      if (vx * (centerX - outX) + vy * (centerY - outY) > 0) continue;    // Dot(velocity, center-point) > 0 → 背离
      bestDist = outDist;
      best = { px: outX, py: outY, tileX: i, tileY: j, tileType: map.tileType(i, j) };
    }
  }
  const half = sx / 2;                                                     // num2（:178）
  return bestDist < half * half ? best : null;                             // :179
}

/** GetCollisionPointForTile（BallCollision.cs:182-229）——返回候选点或 null */
function getCollisionPointForTile(
  edgesIn: number, x: number, y: number, cx: number, cy: number, map: GolfTileMap,
  _inX: number, _inY: number, _inD: number,
): { hit: boolean; x: number; y: number; dist: number } {
  if (x < 0 || y < 0 || x >= map.widthTiles || y >= map.heightTiles) return { hit: false, x: 0, y: 0, dist: 0 };
  if (!map.nactive(x, y)) return { hit: false, x: 0, y: 0, dist: 0 };      // :185
  const solid = map.tileSolid(x, y), solidTop = map.tileSolidTop(x, y);
  if (!solid && !solidTop) return { hit: false, x: 0, y: 0, dist: 0 };      // :185
  // :189-191 平台族（tileSolidTop）非首行 frameY!=0 不参与碰撞
  if (!solid && solidTop && map.frameY(x, y) !== 0) {
    return { hit: false, x: 0, y: 0, dist: 0 };
  }
  let edges = edgesIn;
  if (solidTop) {                                                          // :193-195
    edges &= EDGE_TOP | EDGE_BL_SLOPE | EDGE_BR_SLOPE;
  }
  const tpX = x * 16, tpY = y * 16;                                        // tilePosition（:197）
  let found = false;                                                       // flag（:198）
  let outX = 0, outY = 0, outDist = 0;
  // ---- GetSlopeEdge（:200-205 / :231-276） ----
  const slope = map.slope(x, y);
  if (slope !== 0) {
    let sX = 0, sY = 0, eX = 0, eY = 0, ok = false;
    switch (slope) {
      case 1:                                                              // :236-245
        edges &= EDGE_BOTTOM | EDGE_LEFT | EDGE_BL_SLOPE;
        if (edges & EDGE_BL_SLOPE) { sX = tpX; sY = tpY; eX = tpX + 16; eY = tpY + 16; ok = true; }
        break;
      case 2:                                                              // :246-255
        edges &= EDGE_BOTTOM | EDGE_RIGHT | EDGE_BR_SLOPE;
        if (edges & EDGE_BR_SLOPE) { sX = tpX; sY = tpY + 16; eX = tpX + 16; eY = tpY; ok = true; }
        break;
      case 3:                                                              // :256-265
        edges &= EDGE_TOP | EDGE_LEFT | EDGE_TL_SLOPE;
        if (edges & EDGE_TL_SLOPE) { sX = tpX; sY = tpY + 16; eX = tpX + 16; eY = tpY; ok = true; }
        break;
      case 4:                                                              // :266-275
        edges &= EDGE_TOP | EDGE_RIGHT | EDGE_TR_SLOPE;
        if (edges & EDGE_TR_SLOPE) { sX = tpX; sY = tpY; eX = tpX + 16; eY = tpY + 16; ok = true; }
        break;
    }
    if (ok) {
      const p = closestPointOnLineSegment(cx, cy, sX, sY, eX, eY);          // :202
      outX = p.x; outY = p.y; outDist = (outX - cx) ** 2 + (outY - cy) ** 2; // :203
      found = true;
    }
  }
  // ---- GetTopOrBottomEdge（:206-216 / :278-307） ----
  {
    let sX = 0, sY = 0, eX = 0, eY = 0, ok = false;
    if (edges & EDGE_BOTTOM) {                                              // :280-290
      const nb = map.nactive(x, y + 1) && y + 1 < map.heightTiles
        && map.tileSolid(x, y + 1) && !map.tileSolidTop(x, y + 1);
      const nbSlope = y + 1 < map.heightTiles ? map.slope(x, y + 1) : 0;
      const nbHalf = y + 1 < map.heightTiles && map.halfBrick(x, y + 1);
      if (nb && nbSlope !== 1 && nbSlope !== 2 && !nbHalf) ok = false;      // 邻格实心挡下边（:283-286）
      else { sX = tpX; sY = tpY + 16; eX = tpX + 16; eY = tpY + 16; ok = true; }
    } else if (edges & EDGE_TOP) {                                          // :291-305
      const upSolid = y - 1 >= 0 && map.nactive(x, y - 1) && map.tileSolid(x, y - 1)
        && !map.tileSolidTop(x, y - 1);
      const upSlope = y - 1 >= 0 ? map.slope(x, y - 1) : 0;
      const half = map.halfBrick(x, y);
      if (!half && upSolid && upSlope !== 3 && upSlope !== 4) ok = false;   // :294-297
      else {
        const yy = half ? tpY + 8 : tpY;                                    // halfBrick 上移 8（:298-301）
        sX = tpX; sY = yy; eX = tpX + 16; eY = yy; ok = true;
      }
    }
    if (ok) {
      const p = closestPointOnLineSegment(cx, cy, sX, sY, eX, eY);          // :208
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;                          // :209
      if (!found || d < outDist) { outX = p.x; outY = p.y; outDist = d; }   // :210-214
      found = true;
    }
  }
  // ---- GetLeftOrRightEdge（:217-227 / :309-344） ----
  {
    let sX = 0, sY = 0, eX = 0, eY = 0, ok = false;
    if (edges & EDGE_LEFT) {                                                // :311-325
      const lSolid = x - 1 >= 0 && map.nactive(x - 1, y) && map.tileSolid(x - 1, y)
        && !map.tileSolidTop(x - 1, y);
      const lSlope = x - 1 >= 0 ? map.slope(x - 1, y) : 0;
      const lHalf = x - 1 >= 0 && map.halfBrick(x - 1, y);
      const half = map.halfBrick(x, y);
      // :315 邻格实心且坡面非 1/3 且（非半砖或本格也半砖）→ 不出左边
      if (lSolid && lSlope !== 1 && lSlope !== 3 && (!lHalf || half)) ok = false;
      else { sX = tpX; sY = tpY + (half ? 8 : 0); eX = tpX; eY = tpY + 16; ok = true; }
    } else if (edges & EDGE_RIGHT) {                                        // :327-341
      const rSolid = x + 1 < map.widthTiles && map.nactive(x + 1, y) && map.tileSolid(x + 1, y)
        && !map.tileSolidTop(x + 1, y);
      const rSlope = x + 1 < map.widthTiles ? map.slope(x + 1, y) : 0;
      const rHalf = x + 1 < map.widthTiles && map.halfBrick(x + 1, y);
      const half = map.halfBrick(x, y);
      if (rSolid && rSlope !== 2 && rSlope !== 4 && (!rHalf || half)) ok = false;
      else { sX = tpX + 16; sY = tpY + (half ? 8 : 0); eX = tpX + 16; eY = tpY + 16; ok = true; }
    }
    if (ok) {
      const p = closestPointOnLineSegment(cx, cy, sX, sY, eX, eY);          // :219
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;                          // :220
      if (!found || d < outDist) { outX = p.x; outY = p.y; outDist = d; }   // :221-225
      found = true;
    }
  }
  return { hit: found, x: outX, y: outY, dist: outDist };                    // :228
}

/** ClosestPointOnLineSegment（BallCollision.cs:364-379） */
function closestPointOnLineSegment(px: number, py: number, sx: number, sy: number, ex: number, ey: number) {
  const vx = px - sx, vy = py - sy;                     // value（:366）
  const dx = ex - sx, dy = ey - sy;                     // vector（:367）
  const lenSq = dx * dx + dy * dy;                      // num（:368）
  let t = lenSq === 0 ? 0 : (vx * dx + vy * dy) / lenSq; // num2（:369）
  if (t < 0) t = 0;                                      // :370-372
  if (t > 1) t = 1;                                      // :373-375
  return { x: sx + dx * t, y: sy + dy * t };             // :377
}

// ---------------------------------------------------------------------------
// HitGolfBall（GolfHelper.cs:451-474）—— 杆面材质阻尼 + ai[1]/localAI 语义由调用方处理
// ---------------------------------------------------------------------------
/** 击球阻尼（GolfHelper.cs:453-461）：脚下格实心时按材质 ClubImpactDampening 与
 *  ImpactDampeningResistanceEfficiency×rough 做 Lerp；否则原速 */
export function clubDampenVelocity(
  vx: number, vy: number, roughLandResistance: number,
  belowTileType: number | null,
): { vx: number; vy: number } {
  if (belowTileType === null) return { vx, vy };              // tile==null（:457）
  const mat = golfPhysicsForTile(belowTileType);
  // velocity = Lerp(velocity*Club, velocity, Efficiency*rough)（:460）
  const k = mat.resistanceEfficiency * roughLandResistance;
  return {
    vx: vx * mat.club * (1 - k) + vx * k,
    vy: vy * mat.club * (1 - k) + vy * k,
  };
}
