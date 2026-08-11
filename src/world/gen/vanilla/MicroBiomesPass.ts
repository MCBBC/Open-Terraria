// 原版 pass "Micro Biomes"(WorldGen.cs:21785)中的两个地表/洞穴微群系 1:1 移植:
//  - CampsiteBiome(cs:21915-21936 + Terraria.GameContent.Biomes/CampsiteBiome.cs):
//    露营地标——Slime 形状(num=Next(6,10))拍平的硬化沙/土墙平台 + 金币堆帐篷 +
//    倒木 186 + 未点燃篝火 215。墙类型按地表材质(沙漠→171/冰雪→40/丛林→204-207/
//    大理石→178/花岗岩→180,默认泥土 196-199)。位置 RandomWorldPoint(worldSurface,
//    beachDistance, 200, beachDistance)。
//  - MiningExplosivesBiome(cs:21951-21975 + MiningExplosivesBiome.cs):
//    炸药陷阱屋——ShapeRunner(10,20,dir) 矿石地板 + Circle(5) 房间 + 炸药桶 141 +
//    起爆器 411 + 红线直连。位置 RandomWorldPoint(rockLayer, beachDistance, 200,
//    beachDistance)。数量 ExplosiveTrapCount 14-29 × WorldArea。
// 数量 CampsiteCount 6-11 × WorldArea(Configuration.json)。
// 已知偏差(注明):
//  - 无全局 StructureMap:仅本 pass 内部互斥保护(原版结构与全图其它结构共享保护图)
//  - Main.tileDungeon 用 dungeon 砖 tile 近似(41/43/44),容器用 chest 族 key 近似
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';

const SAND = TILE_BY_KEY['sand']!;
const SANDSTONE = TILE_BY_KEY['sandstone']!;
const HARDSAND = TILE_BY_KEY['hardened_sand']!;
const FOSSIL = TILE_BY_KEY['desert_fossil']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MARBLE = TILE_BY_KEY['v_367_marble_block']!;
const GRANITE = TILE_BY_KEY['v_368_granite_block']!;
const HARDSAND_TILE = TILE_BY_KEY['hardened_sand']!; // 原版 SetTile(397)
const COIN_PILE = TILE_BY_KEY['v_332_gold_coin_pile']!;
const LARGE_PILES = TILE_BY_KEY['v_186_decos_3x2']!;
const CAMPFIRE = TILE_BY_KEY['v_215_campfires']!;
const EXPLOSIVES = TILE_BY_KEY['v_141_explosives']!;
const DETONATOR = TILE_BY_KEY['v_411_detonator']!;
const STONE = TILE_BY_KEY['stone']!;
const DUNGEON_BLUE = TILE_BY_KEY['v_41_blue_brick']!;
const DUNGEON_GREEN = TILE_BY_KEY['v_43_green_brick']!;
const DUNGEON_PINK = TILE_BY_KEY['v_44_pink_brick']!;
const LIHARD = TILE_BY_KEY['v_226_lihzahrd_brick']!;
const LIHARD_ALTAR = TILE_BY_KEY['v_237_lihzahrd_altar']!;
const WIRE_RED = TileStore.WIRE_RED;

interface Rect { x0: number; y0: number; x1: number; y1: number }

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

const solidAt = (st: TileStore, x: number, y: number) =>
  st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0 && !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;

export function runMicroBiomesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const protectedRects: Rect[] = [];
  // WorldGenRange ×WorldArea(w*h/5040000,ScaleValue=(int)截断)
  const areaScale = (w * h) / 5040000;
  const campCount = rng.int(Math.max(1, Math.trunc(areaScale * 6)), Math.max(1, Math.trunc(areaScale * 11)));
  const trapCount = rng.int(Math.max(1, Math.trunc(areaScale * 14)), Math.max(1, Math.trunc(areaScale * 29)));

  // cs:21915-21936:Campsites(最多 1000 次尝试)
  let placed = 0, tries = 0;
  while (placed < campCount) {
    if (++tries > 1000) break;
    const ox = rng.int(gs.beachDistance, w - gs.beachDistance - 1); // RandomWorldPoint(top,right,bottom,left)
    const oy = rng.int(Math.floor(gs.worldSurface), h - 201);
    if (placeCampsite(st, rng, protectedRects, ox, oy)) placed++;
  }
  // cs:21951-21975:Mining Explosives(最多 3000 次尝试)
  placed = 0; tries = 0;
  while (placed < trapCount) {
    if (++tries > 3000) break;
    const ox = rng.int(gs.beachDistance, w - gs.beachDistance - 1);
    const oy = rng.int(Math.floor(gs.rockLevel), h - 201);
    if (placeMiningExplosives(st, rng, gs, protectedRects, ox, oy)) placed++;
  }
}

/** CampsiteBiome.Place(CampsiteBiome.cs:9-116) */
function placeCampsite(st: TileStore, rng: RNG, protectedRects: Rect[], ox: number, oy: number): boolean {
  // Circle(10):实心占比门禁(solid ≥ total-5,cs:12-17)
  {
    let total = 0, solid = 0;
    const r = 10, rr = (r + 1) * (r + 1);
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.min(r, Math.trunc(Math.sqrt(rr - dy * dy)));
      for (let dx = -half; dx <= half; dx++) {
        total++;
        if (solidAt(st, ox + dx, oy + dy)) solid++;
      }
    }
    if (solid < total - 5) return false;
  }
  const num = rng.int(6, 9);  // Next(6,10)
  const num2 = rng.int(1, 4); // Next(1,5)
  const rect: Rect = { x0: ox - num, y0: oy - num, x1: ox + num + 1, y1: oy + num + 1 };
  if (protectedRects.some((p) => overlaps(rect, p))) return false;
  // (num+3)² 内禁地牢砖/容器/神庙砖/祭坛(cs:24-35)
  {
    const n3 = num + 3;
    for (let dx = -n3; dx <= n3; dx++) {
      for (let dy = -n3; dy <= n3; dy++) {
        if (!st.inBounds(ox + dx, oy + dy)) continue;
        const i = st.idx(ox + dx, oy + dy);
        if (!st.flags[i]) continue;
        const t = st.type[i];
        if (t === LIHARD || t === LIHARD_ALTAR) return false;
        // Main.tileDungeon 近似:三种地牢砖(41/43/44)
        if (t === DUNGEON_BLUE || t === DUNGEON_GREEN || t === DUNGEON_PINK) return false;
        const key = TILE_DEFS[t]?.key ?? '';
        if (key.includes('chest') || key.includes('dresser')) return false; // IsAContainer 近似
      }
    }
  }
  // 墙类型按地表材质(cs:36-66)
  let wallType = 196 + rng.int(0, 3);
  for (let dx = -num; dx <= num; dx++) {
    for (let dy = -num; dy <= num; dy++) {
      if (!st.inBounds(ox + dx, oy + dy)) continue;
      const i = st.idx(ox + dx, oy + dy);
      if (!st.flags[i]) continue;
      const t = st.type[i];
      if (t === SAND || t === SANDSTONE || t === HARDSAND || t === FOSSIL) wallType = 171;
      else if (t === SNOW || t === ICE) wallType = 40;
      else if (t === JUNGLE_GRASS) wallType = 204 + rng.int(0, 3);
      else if (t === MARBLE) wallType = 178;
      else if (t === GRANITE) wallType = 180;
    }
  }
  // Slime(num) + Blotches(num2,num2,num2,1,chance 1.0) 形状(cs:67-68):
  //  blotch 点入 ShapeData;Offset(0,-2) 后沙 53→397;空墙 → wallType
  const data = new Set<number>();
  const r2 = (num + 1) * (num + 1);
  const slimeRows: Array<[number, number]> = [];
  for (let dy = -num; dy <= 0; dy++) {
    slimeRows.push([dy, Math.min(num, Math.trunc(Math.sqrt(r2 - dy * dy)))]);
  }
  for (let k = 1; k <= Math.trunc(num * 0.5) - 1; k++) {
    slimeRows.push([k, Math.min(num, Math.trunc(Math.sqrt(r2 - (k * 2) ** 2)))]);
  }
  for (const [dy, half] of slimeRows) {
    for (let dx = -half; dx <= half; dx++) {
      // Blotches(Apply:先掷 1 次 NextDouble 丢弃,再判 chance=1.0;矩形 x[1-n2,n2-1] y[1-n2,0])
      rng.next();
      rng.next();
      const bx0 = rng.int(1 - num2, 0), bx1 = rng.int(0, num2 - 1);
      const by0 = rng.int(1 - num2, 0), by1 = 0;
      for (let bi = bx0; bi <= bx1; bi++) {
        for (let bj = by0; bj <= by1; bj++) {
          const px = ox + dx + bi, py = oy + dy + bj;
          data.add(py * st.w + px);
          if (!st.inBounds(px, py)) continue;
          const up = py - 2; // Modifiers.Offset(0,-2)
          if (st.inBounds(px, up)) {
            const ui = st.idx(px, up);
            if (st.flags[ui] && st.type[ui] === SAND) st.type[ui] = HARDSAND_TILE;
          }
          const pi = st.idx(px, py);
          if (st.wall[pi] === 0) st.wall[pi] = wallType;
        }
      }
    }
  }
  // All(data):ClearTile + SetLiquid(0,0) + 空墙刷墙(cs:69)
  for (const key of data) {
    const px = key % st.w, py = Math.trunc(key / st.w);
    if (!st.inBounds(px, py)) continue;
    const i = st.idx(px, py);
    st.flags[i] = 0;
    st.liquid[i] = 0; st.liquidType[i] = 0;
    if (st.wall[i] === 0) st.wall[i] = wallType;
  }
  // 向下 10 格找地面(cs:70-74)
  let groundY = oy;
  {
    let found = false;
    for (let k = 0; k < 10 && !found; k++) {
      if (solidAt(st, ox, oy + k)) { groundY = oy + k; found = true; }
    }
    if (!found) return false;
  }
  const num4 = groundY - 1;
  const flag = rng.next() < 0.5; // Next() % 2 == 0
  // 金币堆帐篷(cs:76-88,1/10 跳过)
  if (Math.trunc(rng.next() * 10) !== 0) {
    const num5 = rng.int(1, 3); // Next(1,4)
    const num6 = flag ? 4 : -Math.trunc(num / 2);
    for (let m = 0; m < num5; m++) {
      const num7 = rng.int(1, 2); // Next(1,3)
      for (let n = 0; n < num7; n++) {
        const px = ox + num6 - m, py = num4 - n;
        if (!st.inBounds(px, py)) continue;
        const i = st.idx(px, py);
        if (!st.flags[i] && solidAt(st, px, py + 1)) st.setTileSilent(px, py, COIN_PILE, 0, 0);
      }
    }
  }
  // 倒木 186(cs:89-93,1/10 跳过)
  const num8 = (num - 3) * (flag ? -1 : 1);
  if (Math.trunc(rng.next() * 10) !== 0) {
    const px = ox + num8;
    placeLargePile(st, px, num4);
  }
  // 篝火 215(cs:94-113,1/10 跳过;frameY+36 = 未点燃行)
  if (Math.trunc(rng.next() * 10) !== 0) {
    let ok = true;
    for (let dx = 0; dx < 3 && ok; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        if (!st.inBounds(ox + dx, num4 + dy) || st.flags[st.idx(ox + dx, num4 + dy)]) ok = false;
      }
    }
    if (ok) {
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
          st.setTileSilent(ox + dx, num4 + dy, CAMPFIRE, dx * 18, dy * 18 + 36);
        }
      }
    }
  }
  protectedRects.push(rect);
  return true;
}

/** tile 186 LargePiles 3×2(style 0 帧,PlaceTile 默认 style)。
 *  原版经 PlaceTile → case 186 的 SolidTileAllowBottomSlope 门（WorldGen.cs:49284）：
 *  地面须实心且非半砖非顶坡——斜坡格上不生成（与 pilesPass 同门） */
function placeLargePile(st: TileStore, x: number, y: number): void {
  for (let dx = 0; dx < 3; dx++) {
    if (!st.inBounds(x + dx, y)) return;
    const gi = st.idx(x + dx, y);
    if (!solidAt(st, x + dx, y)
      || st.half[gi] === 1 || (st.slope[gi] >= 1 && st.slope[gi] <= 2)) return;
  }
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      if (!st.inBounds(x + dx, y - 1 + dy)) continue;
      const i = st.idx(x + dx, y - 1 + dy);
      if (st.flags[i]) continue;
      st.setTileSilent(x + dx, y - 1 + dy, LARGE_PILES, dx * 18, dy * 18);
    }
  }
}

/** MiningExplosivesBiome.Place(MiningExplosivesBiome.cs:10-76) */
function placeMiningExplosives(st: TileStore, rng: RNG, gs: GenState, protectedRects: Rect[], ox: number, oy: number): boolean {
  if (solidAt(st, ox, oy)) return false;
  {
    const wl = st.inBounds(ox, oy) ? st.wall[st.idx(ox, oy)] : -1;
    if (wl === 216 || wl === 187) return false; // 地下沙漠墙门禁(cs:17-20)
  }
  const barType = [gs.oreTiers.gold, gs.oreTiers.silver, gs.oreTiers.iron, gs.oreTiers.copper][rng.int(0, 3)];
  const dir = rng.next() * 2 - 1; // cs:22
  // Find(origin, Right(40)|Left(40) 直到实心) → origin(MiningExplosivesBiome.cs:23-26)
  let x = ox, y = oy;
  {
    const step = dir > 0 ? 1 : -1;
    let found = false;
    for (let k = 0; k < 40 && !found; k++) {
      x += step;
      if (solidAt(st, x, y)) found = true;
    }
    if (!found) return false;
  }
  // Find(origin, Down(80) 直到实心)(cs:27-30)
  {
    let found = false;
    for (let k = 0; k < 80 && !found; k++) {
      y++;
      if (solidAt(st, x, y)) found = true;
    }
    if (!found) return false;
  }
  // ShapeRunner(10, 20, (dir,1)) + Blotches(2, 0.3):矿石地板形状(cs:31-38)
  const data = new Set<number>();
  let total = 0, solid = 0;
  {
    let steps = 20.0, strength = 10.0;
    let px = x + 0.0, py = y + 0.0;
    let vx = dir + 0.0, vy = 1.0;
    while (steps > 0 && strength > 0) {
      strength = 10 * (steps / 20);
      steps -= 1;
      const bx0 = Math.max(1, Math.trunc(px - strength * 0.5)), by0 = Math.max(1, Math.trunc(py - strength * 0.5));
      const bx1 = Math.min(st.w, Math.trunc(px + strength * 0.5)), by1 = Math.min(st.h, Math.trunc(py + strength * 0.5));
      for (let i = bx0; i < bx1; i++) {
        for (let j = by0; j < by1; j++) {
          if (Math.abs(i - px) + Math.abs(j - py) >= strength * 0.5 * (1 + rng.int(-10, 10) * 0.015)) continue;
          // Blotches(2, 0.3)(Modifiers.cs:92-157)
          rng.next();
          const pts: Array<[number, number]> = [];
          if (rng.next() < 0.3) {
            const ox0 = rng.int(-1, 0), ox1 = rng.int(0, 1), oy0 = rng.int(-1, 0), oy1 = rng.int(0, 1);
            for (let bi = ox0; bi <= ox1; bi++) for (let bj = oy0; bj <= oy1; bj++) pts.push([i + bi, j + bj]);
          } else {
            pts.push([i, j]);
          }
          for (const [qx, qy] of pts) {
            data.add(qy * st.w + qx);
            total++;
            if (solidAt(st, qx, qy)) solid++;
          }
        }
      }
      const n8 = Math.trunc(strength / 50) + 1;
      steps -= n8;
      px += vx; py += vy;
      for (let k = 0; k < n8; k++) {
        px += vx; py += vy;
        vx += rng.range(-0.5, 0.5); vy += rng.range(-0.5, 0.5);
      }
      vx += rng.range(-0.5, 0.5); vy += rng.range(-0.5, 0.5);
      vx = Math.max(-1, Math.min(1, vx));
      vy = Math.max(-1, Math.min(1, vy));
    }
  }
  if (solid < Math.trunc(total / 2)) return false; // cs:35-38
  const area: Rect = { x0: x - 15, y0: y - 10, x1: x + 15, y1: y + 10 };
  if (protectedRects.some((p) => overlaps(area, p))) return false;
  // 矿石地板(cs:44)
  for (const key of data) {
    const qx = key % st.w, qy = Math.trunc(key / st.w);
    if (!st.inBounds(qx, qy)) continue;
    const i = st.idx(qx, qy);
    st.type[i] = barType; st.flags[i] = 1;
  }
  // Circle(5) + Blotches 挖房(cs:45):中心 = (origin.X - dir*-5, origin.Y - 5)
  {
    const cx = x - Math.trunc(-dir * 5), cy = y - 5;
    const r = 5, rr = (r + 1) * (r + 1);
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.min(r, Math.trunc(Math.sqrt(rr - dy * dy)));
      for (let dx = -half; dx <= half; dx++) {
        rng.next();
        const pts: Array<[number, number]> = [];
        if (rng.next() < 0.3) {
          const ox0 = rng.int(-1, 0), ox1 = rng.int(0, 1), oy0 = rng.int(-1, 0), oy1 = rng.int(0, 1);
          for (let bi = ox0; bi <= ox1; bi++) for (let bj = oy0; bj <= oy1; bj++) pts.push([cx + dx + bi, cy + dy + bj]);
        } else {
          pts.push([cx + dx, cy + dy]);
        }
        for (const [qx, qy] of pts) {
          if (!st.inBounds(qx, qy)) continue;
          const i = st.idx(qx, qy);
          st.flags[i] = 0; // ClearTile(frameNeighbors)
        }
      }
    }
  }
  // 两侧落点向下 10 格找地面(cs:47-52)
  const findDown = (fx: number, fy: number): number => {
    for (let k = 0; k < 10; k++) {
      if (solidAt(st, fx, fy + k)) return fy + k;
    }
    return -1;
  };
  const barX = x - (dir > 0 ? 3 : -3);
  const num3 = rng.int(0, 3) === 0 ? 3 : 7; // cs:48
  const detX = x - (dir > 0 ? -num3 : num3);
  let barGround = findDown(barX, y - 3);
  const detGround = findDown(detX, y - 3);
  if (barGround < 0 || detGround < 0) return false;
  barGround--; // result.Y--
  const detTop = detGround - 1; // result2.Y--
  // 起爆器下方 3 列整平(cs:55-70)
  for (let i = -1; i <= 1; i++) {
    const px = detX + i, py = detTop;
    if (st.inBounds(px, py)) st.flags[st.idx(px, py)] = 0;
    const below = detTop + 1;
    if (st.inBounds(px, below) && !solidAt(st, px, below)) {
      st.type[st.idx(px, below)] = STONE; st.flags[st.idx(px, below)] = 1;
    }
  }
  // 炸药桶 141 + 起爆器 411(2×2)+ 红线直连(cs:71-73)
  if (st.inBounds(barX, barGround) && !st.flags[st.idx(barX, barGround)]) {
    st.setTileSilent(barX, barGround, EXPLOSIVES, 0, 0);
  }
  // 起爆器 411:PlaceTile(..., forced: true)(cs:72)——无视支撑/占位检查强制 2×2 落块
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      if (!st.inBounds(detX + dx, detTop + dy)) continue;
      st.setTileSilent(detX + dx, detTop + dy, DETONATOR, dx * 18, dy * 18);
    }
  }
  // WorldUtils.WireLine(WorldUtils.cs:111-131):L 形红线
  {
    const sx = Math.min(barX, detX), ex = Math.max(barX, detX);
    const sy = Math.min(barGround, detTop), ey = Math.max(barGround, detTop);
    for (let i = sx; i <= ex; i++) {
      if (st.inBounds(i, barGround)) st.wire[st.idx(i, barGround)] |= WIRE_RED;
    }
    for (let j = sy; j <= ey; j++) {
      if (st.inBounds(detX, j)) st.wire[st.idx(detX, j)] |= WIRE_RED;
    }
  }
  protectedRects.push(area);
  return true;
}
