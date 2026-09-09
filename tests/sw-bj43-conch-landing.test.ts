// SW-BJ43 2026-09-09 魔法海螺落点回归（用户实报「不一定会传送到海边」）。
// 金标：Terarria1457/Terraria.GameContent/TeleportHelpers.cs:49-241（1458 全域零 diff）
//       + Player.MagicConch（Player.cs:56755-56825）+ Collision.cs:2299 TileCollision/
//       SolidCollision。1458 同域核对：TeleportHelpers.cs / Player.MagicConch /
//       Item.cs case 4263 三面 diff=same。
// 三刀修复面（Game.ts requestMagicConchTeleportPosition + fireRecallTeleport）：
//   ①boxBlocked = IsInSolidTilesExtended 定谳形态：TileCollision 四探针 start=P∓16px、
//     velocity=±16px → 终点盒恒 ≡ P 锚盒（Collision.cs:2299 vector2=Position+Velocity；
//     侧/上臂 !tileSolidTop、DOWN 臂 fallThrough+fall2 豁免）⇒ 合取面 = Lava∨Hurting∨
//     SolidCollision @ 锚盒 20×42（9 格逐格判≡像素判）。旧刀外扩 px−2 列/py−3 行 →
//     海滩沙柱面「弹升↔下落」垂直振荡（弹/落零 num10 消耗）烧穿 num7=5000 → 尝试
//     假性失败（修复前实机探针：6 种子 12 尝试 ≥4 败、bj43-c 双洋全败=原地不动）。
//   ②solidOrSloped 平台臂复活：SolidOrSlopedTile(tile, includePlatforms:true)
//     （WorldGen.cs:23724-23749,IL_004c）= active && tileSolid && (solidTop ?
//     Platforms : true) && !inActive——旧刀 `!d.solid 先行返回` 使平台臂死码。
//   ③落位换算 = landingPoint.ToWorldCoordinates(8f,16f) − (w/2,h)（Player.cs:56811-56813）
//     = 脚底钉 py 格底+盒心钉 px 格心。旧刀 {px*16+6, py*16}（头格顶惯例误植）→
//     Y +26px 埋进实心 py+1、X +8px 半格偏海侧。
// 判别力：本文件内置 OLD 复刻体（4×4 外扩盒 + 头格顶落位）同瓦对拍——每处新行为
// 断言在 OLD 语义下取相反值（修复前实机 live=null 的三例已由 _bj43-crawl-probe 记录）。
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { TILE_SOLID_TOP_FAMILY, canTileHurt } from '../src/stats/TouchDamage';
import { WALL_DUNGEON_SHEETS } from '../src/world/DungeonDualZones';
import { TILE } from '../src/core/constants';

const PLATFORM_SHEETS = new Set([19, 427, 435, 436, 437, 438, 439]); // TileID.Sets.Platforms

type Ctx = {
  st: TileStore;
  groundLevel: number;
  low: boolean;
  flags: Record<string, unknown>;
  seedFlags: Record<string, unknown>;
};

const makeCtx = (world: World): Ctx => ({
  st: world.store,
  groundLevel: world.groundLevel,
  low: !!world.skyblockLowTiles,
  flags: (world.flags ?? {}) as Record<string, unknown>,
  seedFlags: (world.seedFlags ?? {}) as Record<string, unknown>,
});

function makeDangerous(ctx: Ctx) {
  const st = ctx.st;
  const downedPlant = !!ctx.flags['downed_262'];
  const downedBoss3 = !!(ctx.flags.downedSkeletron || ctx.flags['downed_35']);
  const sf = ctx.seedFlags as never;
  return (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (st.liquid[i] > 0 && st.liquidType[i] === LIQUID_TYPE.LAVA) return true;
    if (st.wall[i] === 87 && y > ctx.groundLevel && !downedPlant) return true;
    if (WALL_DUNGEON_SHEETS.has(st.wall[i]) && y > ctx.groundLevel && !downedBoss3) return true;
    return !!st.flags[i] && canTileHurt(st.type[i], false, sf);
  };
}

/** vanilla SolidOrSlopedTile(tile, includePlatforms:true)（WorldGen.cs:23724-23749） */
function solidVanilla(ctx: Ctx, x: number, y: number): boolean {
  const st = ctx.st;
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if (st.wire[i] & TileStore.WIRE_ACTUATED) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d) return false;
  const isPlat = !!d.platform && PLATFORM_SHEETS.has(d.vanilla?.sheet ?? -1);
  if (!d.solid && !isPlat) return false;
  if (TILE_SOLID_TOP_FAMILY.has(st.type[i]) && !isPlat) return false;
  return true;
}

/** 金标 IsInSolidTilesExpanded：Lava∨Hurting∨SolidCollision @ 锚盒 20×42
 *  （(px*16+8, py*16+15)−(10,42) → tile px−1…px+1 × py−2…py；半砖=上半盒） */
function blockedGold(ctx: Ctx, tx: number, ty: number): boolean {
  const st = ctx.st;
  const sf = ctx.seedFlags as never;
  const downedPlant = !!ctx.flags['downed_262'];
  const downedBoss3 = !!(ctx.flags.downedSkeletron || ctx.flags['downed_35']);
  const x = tx * TILE - 2, y = ty * TILE - 27;
  const x1 = x + 20, y1 = y + 42;
  const tx0 = Math.max(0, Math.floor(x / TILE) - 1), tx1 = Math.min(st.w - 1, Math.floor(x1 / TILE) + 2);
  const ty0 = Math.max(0, Math.floor(y / TILE) - 1), ty1 = Math.min(st.h - 1, Math.floor(y1 / TILE) + 2);
  for (let cx = tx0; cx <= tx1; cx++) {
    for (let cy = ty0; cy <= ty1; cy++) {
      const i = st.idx(cx, cy);
      const bx0 = cx * TILE;
      const top = st.half[i] ? cy * TILE + 8 : cy * TILE;
      if (!(x1 > bx0 && x < bx0 + TILE && y1 > top && y < cy * TILE + TILE)) continue;
      if (st.liquid[i] > 0 && st.liquidType[i] === LIQUID_TYPE.LAVA) return true;
      if (st.wall[i] === 87 && cy > ctx.groundLevel && !downedPlant) return true;
      if (WALL_DUNGEON_SHEETS.has(st.wall[i]) && cy > ctx.groundLevel && !downedBoss3) return true;
      if (st.flags[i]) {
        if (canTileHurt(st.type[i], false, sf)) return true;
        if (!(st.wire[i] & TileStore.WIRE_ACTUATED)) {
          const d = TILE_DEFS[st.type[i]];
          if (d?.solid && !TILE_SOLID_TOP_FAMILY.has(st.type[i])) return true;
        }
      }
    }
  }
  return false;
}

/** 修复前（IIIII228 原刀）语义：4×4 外扩盒（dx −2..+1、dy −3..0,OOB=blocked） */
function blockedOld(ctx: Ctx, tx: number, ty: number): boolean {
  const st = ctx.st;
  const sf = ctx.seedFlags as never;
  for (let dx = -2; dx <= 1; dx++) {
    for (let dy = -3; dy <= 0; dy++) {
      const cx = tx + dx, cy = ty + dy;
      if (!st.inBounds(cx, cy)) return true;
      const i = st.idx(cx, cy);
      if (st.liquid[i] > 0 && st.liquidType[i] === LIQUID_TYPE.LAVA) return true;
      if (!st.flags[i] || (st.wire[i] & TileStore.WIRE_ACTUATED)) continue;
      const d = TILE_DEFS[st.type[i]];
      if (d?.solid && !d.platform && !TILE_SOLID_TOP_FAMILY.has(st.type[i])) return true;
      if (canTileHurt(st.type[i], false, sf)) return true;
    }
  }
  return false;
}

/** 修复前 solidOrSloped：`!d.solid 先行返回` → 平台臂死码 */
function solidOld(ctx: Ctx, x: number, y: number): boolean {
  const st = ctx.st;
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if (st.wire[i] & TileStore.WIRE_ACTUATED) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d?.solid) return false;
  if ((!!d.platform || TILE_SOLID_TOP_FAMILY.has(st.type[i])) && !d.platform) return false;
  return true;
}

type Sem = { solid: (x: number, y: number) => boolean; blocked: (x: number, y: number) => boolean };

/** 爬行体骨架 = TeleportHelpers.cs:49-239 逐臂（与 Game.ts 移植同构,仅语义可换装） */
function crawl(ctx: Ctx, rightOcean: boolean, sem: Sem): { ok: boolean; why: string; x: number; y: number } {
  const st = ctx.st;
  const dangerous = makeDangerous(ctx);
  const num = 40;
  const x0 = rightOcean ? st.w - num : num;
  const y0 = 50;
  const num3 = Math.floor(ctx.groundLevel);
  const crawlOffsetX = rightOcean ? -1 : 1;
  let px = x0, py = y0;
  const num8 = ctx.low ? 400 * (Math.floor(ctx.groundLevel) - 10) : 5000;
  const num11 = 400;
  let num10 = 0;
  let flag = sem.solid(px, py);
  let num7 = 0;
  while (num7 < num8 && num10 < num11) {
    num7++;
    const flag2 = sem.solid(px, py) || st.liquid[st.idx(px, py)] > 0;
    const flag3 = sem.solid(px, py + 1) || st.liquid[st.idx(px, py + 1)] > 0;
    if (!flag2 && !flag3) {
      if (!sem.solid(px - 1, py) && !sem.solid(px + 1, py)
        && !sem.solid(px - 1, py + 1) && !sem.solid(px + 1, py + 1)
        && st.liquid[st.idx(px - 1, py)] <= 0 && st.liquid[st.idx(px + 1, py)] <= 0
        && st.liquid[st.idx(px - 1, py + 1)] <= 0 && st.liquid[st.idx(px + 1, py + 1)] <= 0) {
        py++;
        if (ctx.low && py >= num3) { py = y0; px += crawlOffsetX; num10++; }
        continue;
      }
    }
    if (sem.blocked(px, py)) { py += flag ? 1 : -1; continue; }
    if (flag2) { py += flag ? 1 : -1; continue; }
    flag = false;
    if (!sem.blocked(px, py + 1) && !flag3 && py < ctx.groundLevel) {
      py++;
      if (ctx.low && py >= num3) { py = y0; px += crawlOffsetX; num10++; }
      continue;
    }
    if (st.liquid[st.idx(px, py + 1)] > 0 && !sem.solid(px, py + 1)) { px += crawlOffsetX; num10++; continue; }
    if (dangerous(px - crawlOffsetX, py) || dangerous(px, py)) { px += crawlOffsetX; num10++; continue; }
    if (dangerous(px - crawlOffsetX, py + 1) || dangerous(px, py + 1)) { px += crawlOffsetX; num10++; continue; }
    if (py < 40) { py++; continue; }
    if (!ctx.low && !sem.solid(px, py + 1)) { px += crawlOffsetX; num10++; }
    break;
  }
  const cap = num7 === num8 || num10 >= num11;
  if (cap) return { ok: false, why: `cap n7=${num7} n10=${num10} @(${px},${py})`, x: px, y: py };
  if (px < 40 || py < 40 || px >= st.w - 40 || py >= st.h - 40) {
    return { ok: false, why: `InWorld40 @(${px},${py})`, x: px, y: py };   // WorldGen.InWorld(_,_,40)
  }
  const num13 = ctx.low ? 10 : 20;
  let flag7 = sem.solid(px, py) || st.liquid[st.idx(px, py)] > 0;
  if (!flag7) {
    for (let i = 0; i < num13; i++) {
      if (sem.solid(px, py + i) || st.liquid[st.idx(px, py + i)] > 0) { flag7 = true; py += Math.max(0, i - 1); break; }
    }
  }
  if (ctx.low && !flag7) {
    for (let j = 0; j < num13; j++) {
      if (sem.solid(px - 1, py + j) || st.liquid[st.idx(px - 1, py + j)] > 0) { flag7 = true; px--; py += Math.max(0, j - 1); break; }
    }
  }
  if (ctx.low && !flag7) {
    for (let k = 0; k < num13; k++) {
      if (sem.solid(px + 1, py + k) || st.liquid[st.idx(px + 1, py + k)] > 0) { flag7 = true; px++; py += Math.max(0, k - 1); break; }
    }
  }
  return flag7 ? { ok: true, why: '', x: px, y: py } : { ok: false, why: `noFloor20 @(${px},${py})`, x: px, y: py };
}

function stubGame(world: World) {
  const g = Object.create(Game.prototype) as unknown as {
    world: World;
    player: { equipStats: { fireWalk: boolean }; buffs: null; w: number; h: number };
    requestMagicConchTeleportPosition: (r: boolean) => { x: number; y: number } | null;
  };
  g.world = world;
  g.player = { equipStats: { fireWalk: false }, buffs: null, w: 20, h: 42 };
  return g;
}

/** 合成世界画格（ sand=sheet53 本仓 type22；水带 LIQUID_TYPE.WATER） */
function paintWaterBand(st: TileStore, x0: number, x1: number, y0: number, y1: number): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) st.setLiquid(x, y, 200, LIQUID_TYPE.WATER);
  }
}
function paintRect(st: TileStore, x0: number, x1: number, y0: number, y1: number, type: number): void {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) st.setTileSilent(x, y, type);
  }
}

describe('SW-BJ43 魔法海螺落点（TeleportHelpers.cs:49-241 金标）', () => {
  // 修复前实机探针（_bj43-crawl-probe,已删）实测：bj43-bR/bj43-cL/bj43-cR live=null
  // （迭代帽燃尽）、bj43-c 双洋全败 → 用户原地不动。金标复刻在同瓦全部成功落位。
  it('真世界同瓦对拍：仓库爬行体与金标成败/落格全等（含修复前 null 种子）', async () => {
    for (const seed of ['bj43-b', 'bj43-c']) {
      const world = await generateWorld({ width: 4200, height: 1200, seedText: seed });
      const ctx = makeCtx(world);
      const g = stubGame(world);
      for (const side of [false, true]) {
        const gold = crawl(ctx, side, { solid: (x, y) => solidVanilla(ctx, x, y), blocked: (x, y) => blockedGold(ctx, x, y) });
        expect(gold.ok, `${seed} side=${side} 金标应成功落位（${gold.why}）`).toBe(true);
        const live = g.requestMagicConchTeleportPosition(side);
        expect(live, `${seed} side=${side} 仓库应成功（修复前=迭代帽假性失败）`).not.toBeNull();
        // 落格全等
        expect(live!.x, `${seed} side=${side} 落格 X`).toBe(gold.x * TILE + 8 - 10);   // ToWorldCoordinates(8,16)−(w/2,h)
        expect(live!.y, `${seed} side=${side} 落格 Y（脚底钉 py 格底）`).toBe(gold.y * TILE + 16 - 42);
        // 安全落位面：脚下 = vanilla 实心/平台/液（flag7 语义；末支 X 爬行后 break
        // 不复检盒=原版本相,故不断言盒自由）
        expect(solidVanilla(ctx, gold.x, gold.y + 1) || ctx.st.liquid[ctx.st.idx(gold.x, gold.y + 1)] > 0).toBe(true);
      }
    }
  }, 900000);

  it('合成几何·沙柱振荡死锁：锚盒 9 格判不再被 2 列外沙柱误挡（OLD 复刻体=死锁对照）', () => {
    const w = new World(300, 240, 7, 'bj43-syn1');
    w.groundLevel = 128;
    const st = w.store;
    const sand = TILE_BY_KEY['sand'];
    expect(TILE_DEFS[sand]?.vanilla?.sheet).toBe(53);
    paintWaterBand(st, 40, 260, 130, 152);      // 右洋水带（液面 y=130）
    paintRect(st, 100, 102, 100, 152, sand);    // 3 宽沙柱（顶 y=100,高出液面）
    const ctx = makeCtx(w);
    const gold = crawl(ctx, true, { solid: (x, y) => solidVanilla(ctx, x, y), blocked: (x, y) => blockedGold(ctx, x, y) });
    // 金标：游进→贴柱面爬升→final 支爬 1 格即 break（不复检危险=原版松弛面）→落柱顶 (102,99)
    expect(gold.ok, `金标应落柱顶（${gold.why}）`).toBe(true);
    expect([gold.x, gold.y]).toEqual([102, 99]);
    const live = stubGame(w).requestMagicConchTeleportPosition(true);
    expect(live).not.toBeNull();
    expect(live!.x).toBe(102 * TILE + 8 - 10);
    expect(live!.y).toBe(99 * TILE + 16 - 42);
    // 判别力：OLD 外扩盒在同瓦=「弹升↔下落」垂直振荡烧穿迭代帽 → null
    const old = crawl(ctx, true, { solid: (x, y) => solidOld(ctx, x, y), blocked: (x, y) => blockedOld(ctx, x, y) });
    expect(old.ok, `OLD 复刻体应保持死锁失败（${old.why}）`).toBe(false);
    expect(old.why).toContain('cap');
  });

  it('合成几何·平台落位面：SolidOrSlopedTile(includePlatforms) 复活（OLD=平台臂死码对照）', () => {
    const w = new World(300, 240, 7, 'bj43-syn2');
    w.groundLevel = 128;
    const st = w.store;
    const plat = TILE_BY_KEY['platform'];
    expect(TILE_DEFS[plat]?.vanilla?.sheet).toBe(19);
    paintWaterBand(st, 40, 120, 130, 152);      // 左洋水带
    paintWaterBand(st, 40, 120, 121, 129);      // 平台下方水体（OLD 落穿后坠入）
    paintRect(st, 36, 84, 120, 120, plat);      // 平台层（液面上方 10 格）
    const ctx = makeCtx(w);
    const gold = crawl(ctx, false, { solid: (x, y) => solidVanilla(ctx, x, y), blocked: (x, y) => blockedGold(ctx, x, y) });
    expect(gold.ok, `金标应落平台（${gold.why}）`).toBe(true);
    expect([gold.x, gold.y]).toEqual([40, 119]);   // 头(119) 脚底钉 120 格底=站平台
    const live = stubGame(w).requestMagicConchTeleportPosition(false);
    expect(live).not.toBeNull();
    expect(live!.y).toBe(119 * TILE + 16 - 42);    // 脚底=平台顶面（原版脚底位）
    // 判别力：OLD 平台臂死码 → 落穿平台坠入水体 → 沿液面游出带外 → noFloor20 失败
    const old = crawl(ctx, false, { solid: (x, y) => solidOld(ctx, x, y), blocked: (x, y) => blockedOld(ctx, x, y) });
    expect(old.ok, `OLD 复刻体应落穿平台失败（${old.why}）`).toBe(false);
  });

  it('双尝试序与边界钳：先对侧洋、失败回同侧洋；InWorld(_,_,40) 恒成立（Player.cs:56788-56795）', () => {
    const w = new World(300, 240, 7, 'bj43-syn3');
    w.groundLevel = 128;
    const st = w.store;
    const dirt = TILE_BY_KEY['dirt'];
    const sand = TILE_BY_KEY['sand'];
    paintWaterBand(st, 40, 120, 130, 152);      // 左洋水带
    paintRect(st, 56, 80, 130, 152, dirt);      // 没顶泥坝（非窒息族→可承落位面）
    paintRect(st, 256, 299, 40, 239, sand);     // 右缘整墙 → 对侧尝试必败
    const g = stubGame(w);
    // 玩家在左半（leftHalf=true）→ 首选右洋（rightOcean=true）=墙 → null
    expect(g.requestMagicConchTeleportPosition(true)).toBeNull();
    // 回退左洋 → 泥坝首列落位,且落点恒在 InWorld 40 钳内
    const dest = g.requestMagicConchTeleportPosition(false);
    expect(dest).not.toBeNull();
    expect(dest!.x).toBe(56 * TILE + 8 - 10);       // 游进首列 (56,129)
    expect(dest!.y).toBe(129 * TILE + 16 - 42);
    const px = Math.round((dest!.x + 10 - 8) / TILE);
    const py = Math.round((dest!.y + 42 - 16) / TILE);
    expect(px).toBeGreaterThanOrEqual(40);
    expect(px).toBeLessThan(st.w - 40);
    expect(py).toBeGreaterThanOrEqual(40);
    expect(py).toBeLessThan(st.h - 40);
    expect(solidVanilla(makeCtx(w), px, py + 1) || st.liquid[st.idx(px, py + 1)] > 0).toBe(true);
  });

  it('窒息族避走=原版本相：TileIsDangerous 消费 CanTileHurt(Suffocate) → 沙坝不可落位（TeleportHelpers.cs:149-154+Collision.cs:3209-3229+TileID.cs:387）', () => {
    // vanilla CanTileHurt 含 Suffocate[type]（沙族 53/112/116/123/224/234）→ 沙下方列
    // 全部 danger-crawl 走避 → 液面沙坝被游越、带外 noFloor=null。此语义若被人
    // 「好心修掉」本测试即红。
    const w = new World(300, 240, 7, 'bj43-syn4');
    w.groundLevel = 128;
    const st = w.store;
    const sand = TILE_BY_KEY['sand'];
    paintWaterBand(st, 40, 120, 130, 152);
    paintRect(st, 56, 80, 130, 152, sand);      // 沙坝（窒息族）
    const ctx = makeCtx(w);
    const g = stubGame(w);
    const gold = crawl(ctx, false, { solid: (x, y) => solidVanilla(ctx, x, y), blocked: (x, y) => blockedGold(ctx, x, y) });
    expect(gold.ok, `金标应同样避沙失败（${gold.why}）`).toBe(false);
    expect(g.requestMagicConchTeleportPosition(false)).toBeNull();
  });
});
