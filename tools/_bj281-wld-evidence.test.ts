// ★BJ281 一次性定谳仪（SW_ORACLE=1 启用）：用户二次实报「海螺落左洋平台甲板,
// 应落离海最近自然物块」。物证 behavior-log（2026-09-22T08:33, seed 118606602）
// 时间线: t=3105 玩家 (98040,6603)px=tile(6127.5,412.7)=右洋水线岸(BJ275 落点);
//         t=3119 use vi_4263_magic_conch; t=3165 玩家 (650,4971)px=tile(40.6,310.7)
//         =左洋平台甲板(cells (36..63,312)=[11,_,_,1,_] isPlatform=1)。
// cell 格式=[type,slope,half,isPlatform,wall]（Game.ts:5799），水体(type0)不入快照。
// 金标：TeleportHelpers.cs:49-241（includePlatforms 恒 true=原版）+ BJ281 分歧面
//       （两洋承位判据 includePlatforms=false）。
import { it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { readFileSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { TILE_SOLID_TOP_FAMILY, canTileHurt } from '../src/stats/TouchDamage';
import { WALL_DUNGEON_SHEETS } from '../src/world/DungeonDualZones';
import { TILE } from '../src/core/constants';

const PLATFORM_SHEETS = new Set([19, 427, 435, 436, 437, 438, 439]);

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

/** SolidOrSlopedTile(tile, includePlatforms)（WorldGen.cs:70515-70540）★参数化 */
function solidOrSloped(ctx: Ctx, x: number, y: number, includePlatforms: boolean): boolean {
  const st = ctx.st;
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if (st.wire[i] & TileStore.WIRE_ACTUATED) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d) return false;
  const isPlat = !!d.platform && PLATFORM_SHEETS.has(d.vanilla?.sheet ?? -1);
  if (isPlat && !includePlatforms) return false;
  if (!d.solid && !isPlat) return false;
  if (TILE_SOLID_TOP_FAMILY.has(st.type[i]) && !isPlat) return false;
  return true;
}

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

/** 金标爬行体（TeleportHelpers.cs:49-241）★includePlatforms 参数化（BJ281） */
function crawlTraced(ctx: Ctx, rightOcean: boolean, inclPlat: boolean): {
  ok: boolean; why: string; x: number; y: number; num7: number; num10: number; trace: string[];
} {
  const st = ctx.st;
  const dangerous = makeDangerous(ctx);
  const s = (x: number, y: number) => solidOrSloped(ctx, x, y, inclPlat);
  const num = 40;
  const x0 = rightOcean ? st.w - num : num;
  const y0 = 50;
  const num3 = Math.floor(ctx.groundLevel);
  const crawlOffsetX = rightOcean ? -1 : 1;
  let px = x0, py = y0;
  const num8 = ctx.low ? 400 * (Math.floor(ctx.groundLevel) - 10) : 5000;
  const num11 = 400;
  let num10 = 0;
  let flag = s(px, py);
  let num7 = 0;
  const trace: string[] = [];
  while (num7 < num8 && num10 < num11) {
    num7++;
    const flag2 = s(px, py) || st.liquid[st.idx(px, py)] > 0;
    const flag3 = s(px, py + 1) || st.liquid[st.idx(px, py + 1)] > 0;
    let arm = '';
    do {
      if (!flag2 && !flag3) {
        if (!s(px - 1, py) && !s(px + 1, py) && !s(px - 1, py + 1) && !s(px + 1, py + 1)
          && st.liquid[st.idx(px - 1, py)] <= 0 && st.liquid[st.idx(px + 1, py)] <= 0
          && st.liquid[st.idx(px - 1, py + 1)] <= 0 && st.liquid[st.idx(px + 1, py + 1)] <= 0) {
          py++;
          arm = 'descend';
          if (ctx.low && py >= num3) { py = y0; px += crawlOffsetX; num10++; arm = 'descend-wrap'; }
          break;
        }
        arm = 'nbrBlock';
      }
      if (blockedGold(ctx, px, py)) { py += flag ? 1 : -1; arm = (flag ? 'boxDown' : 'boxUp'); break; }
      if (flag2) { py += flag ? 1 : -1; arm = (flag ? 'flag2Down' : 'flag2Up'); break; }
      flag = false;
      if (!blockedGold(ctx, px, py + 1) && !flag3 && py < ctx.groundLevel) {
        py++;
        arm = 'sink';
        if (ctx.low && py >= num3) { py = y0; px += crawlOffsetX; num10++; arm = 'sink-wrap'; }
        break;
      }
      if (st.liquid[st.idx(px, py + 1)] > 0 && !s(px, py + 1)) { px += crawlOffsetX; num10++; arm = 'liquidCrawl'; break; }
      if (dangerous(px - crawlOffsetX, py) || dangerous(px, py)) { px += crawlOffsetX; num10++; arm = 'dangerCrawl0'; break; }
      if (dangerous(px - crawlOffsetX, py + 1) || dangerous(px, py + 1)) { px += crawlOffsetX; num10++; arm = 'dangerCrawl1'; break; }
      if (py < 40) { py++; arm = 'skyClamp'; break; }
      if (!ctx.low && !s(px, py + 1)) { px += crawlOffsetX; num10++; arm = 'finalCrawl'; }
      arm = arm || 'break';
      break;
    } while (false);
    if (trace.length < 400) trace.push(`#${num7} (${px},${py}) ${arm}${flag2 ? ' f2' : ''}${flag3 ? ' f3' : ''}`);
    if (arm === 'break') break;
  }
  const cap = num7 === num8 || num10 >= num11;
  if (cap) return { ok: false, why: `cap n7=${num7} n10=${num10} @(${px},${py})`, x: px, y: py, num7, num10, trace };
  if (px < 40 || py < 40 || px >= st.w - 40 || py >= st.h - 40) {
    return { ok: false, why: `InWorld40 @(${px},${py})`, x: px, y: py, num7, num10, trace };
  }
  const num13 = ctx.low ? 10 : 20;
  let flag7 = s(px, py) || st.liquid[st.idx(px, py)] > 0;
  if (!flag7) {
    for (let i = 0; i < num13; i++) {
      if (s(px, py + i) || st.liquid[st.idx(px, py + i)] > 0) { flag7 = true; py += Math.max(0, i - 1); break; }
    }
  }
  if (ctx.low && !flag7) {
    for (let j = 0; j < num13; j++) {
      if (s(px - 1, py + j) || st.liquid[st.idx(px - 1, py + j)] > 0) { flag7 = true; px--; py += Math.max(0, j - 1); break; }
    }
  }
  if (ctx.low && !flag7) {
    for (let k = 0; k < num13; k++) {
      if (s(px + 1, py + k) || st.liquid[st.idx(px + 1, py + k)] > 0) { flag7 = true; px++; py += Math.max(0, k - 1); break; }
    }
  }
  return flag7
    ? { ok: true, why: '', x: px, y: py, num7, num10, trace }
    : { ok: false, why: `noFloor20 @(${px},${py})`, x: px, y: py, num7, num10, trace };
}

function tileDesc(ctx: Ctx, x: number, y: number): string {
  const st = ctx.st;
  const i = st.idx(x, y);
  const d = TILE_DEFS[st.type[i]];
  return `${st.flags[i] ? `T${st.type[i]}${d?.platform ? '(plat)' : ''}` : '-'}${st.liquid[i] > 0 ? `~L${st.liquid[i]}(${st.liquidType[i]})` : ''}`;
}

/** 左洋几何：甲板范围/水线/自然岸线 */
function leftGeo(ctx: Ctx): void {
  const st = ctx.st;
  console.log('LEFT-OCEAN GEOMETRY (x=0..140):');
  for (let x = 0; x <= 140; x++) {
    // 水线=自 y=250 向下首个 liquid>0；自然实心=首个非平台 active tile
    let waterY = -1, solidY = -1, solidKind = '';
    for (let y = 250; y < st.h; y++) {
      const i = st.idx(x, y);
      if (waterY < 0 && st.liquid[i] > 0) waterY = y;
      if (solidY < 0 && st.flags[i]) {
        const d = TILE_DEFS[st.type[i]];
        const isPlat = !!d?.platform && PLATFORM_SHEETS.has(d?.vanilla?.sheet ?? -1);
        solidY = y; solidKind = isPlat ? 'plat' : `nat(T${st.type[i]})`;
      }
      if (waterY >= 0 && solidY >= 0) break;
    }
    if (x % 1 === 0 && (waterY >= 0 || solidY >= 0)) {
      console.log(`  x=${x}: water@${waterY} ${solidKind}@${solidY}`);
    }
  }
  // 关键列剖面 rows 305..330
  for (const x of [38, 40, 50, 63, 64, 65, 70, 80, 100, 120]) {
    const rows: string[] = [];
    for (let y = 305; y <= 330; y++) rows.push(`${y}:${tileDesc(ctx, x, y)}`);
    console.log(`  COL x=${x}: ${rows.join(' ')}`);
  }
}

function analyze(name: string, world: World): void {
  const ctx = makeCtx(world);
  const st = ctx.st;
  console.log(`\n===== ${name} ===== w=${st.w} h=${st.h} groundLevel=${ctx.groundLevel} low=${ctx.low}`);
  leftGeo(ctx);
  for (const side of [false, true]) {
    for (const incl of [true, false]) {
      const r = crawlTraced(ctx, side, incl);
      console.log(`crawl rightOcean=${side} inclPlat=${incl}: ok=${r.ok} why="${r.why}" land=(${r.x},${r.y}) n7=${r.num7} n10=${r.num10}`);
      if (!r.ok || side === false) {
        const tail = r.trace.slice(-14).join(' | ');
        console.log('  trace[-14:]:', tail);
      }
    }
  }
}

function liveCalls(world: World, tag: string): void {
  const g = Object.create(Game.prototype) as unknown as {
    world: World;
    player: { equipStats: { fireWalk: boolean }; buffs: null; w: number; h: number };
    requestMagicConchTeleportPosition: (r: boolean, retry?: boolean) => { x: number; y: number } | null;
  };
  g.world = world;
  g.player = { equipStats: { fireWalk: false }, buffs: null, w: 20, h: 42 };
  const toTile = (p: { x: number; y: number }) => `(${Math.round((p.x + 10 - 8) / TILE)},${Math.round((p.y + 42 - 16) / TILE)})`;
  const left = g.requestMagicConchTeleportPosition(false);
  console.log(`LIVE[${tag}] left :`, left ? toTile(left) : 'null');
  console.log(`LIVE[${tag}] right:`, g.requestMagicConchTeleportPosition(true) ? toTile(g.requestMagicConchTeleportPosition(true)!) : 'null');
  console.log(`LIVE[${tag}] right,retry:`, g.requestMagicConchTeleportPosition(true, true) ? toTile(g.requestMagicConchTeleportPosition(true, true)!) : 'null');
}

(RUNgated() ? it : it.skip)('bj281 evidence map conch analysis', async () => {
  // 候选 wld 指纹核对（behavior-log cells: (36..63,312) isPlatform=1 type11;
  //   (35,311)/(45,311)/(58,311) type12; 玩家落点 (40.6,310.7)）
  const candidates: Array<[string, string]> = [
    ['TMP_BJ275', '/tmp/bj275-user-map.wld'],
    ['DL_WLD', '/Users/vinlic/Downloads/天真的钴最高点.wld'],
    ['DL_WLD1', '/Users/vinlic/Downloads/天真的钴最高点(1).wld'],
  ];
  let chosen: { name: string; world: World } | null = null;
  for (const [name, path] of candidates) {
    try {
      const buf = new Uint8Array(readFileSync(path));
      const { save } = parseWldToSave(buf);
      const { world } = loadSave(JSON.stringify(save));
      const st = world.store;
      const cell = (x: number, y: number) => {
        const i = st.idx(x, y);
        return `${st.flags[i] ? st.type[i] : 0},${st.slope[i]},${st.half[i]},st.isPlatform?${st.isPlatform(x, y) ? 1 : 0},${st.wall[i]}`;
      };
      const fp40312 = cell(40, 312);
      const fp35311 = cell(35, 311);
      const deck = Array.from({ length: 28 }, (_, k) => st.isPlatform(36 + k, 312) ? 1 : 0).join('');
      console.log(`FP ${name}: (40,312)=[${fp40312}] (35,311)=[${fp35311}] deck(36..63,312)=${deck}`);
      const logMatch = deck === '1'.repeat(28) && st.isPlatform(40, 312);
      console.log(`  logMatch=${logMatch}`);
      if (logMatch && !chosen) chosen = { name, world };
    } catch (e) {
      console.log(`FP ${name}: LOAD FAIL ${e}`);
    }
  }
  expect(chosen, '须有候选 wld 与 behavior-log 甲板指纹匹配').not.toBeNull();
  const world = chosen!.world;
  console.log(`CHOSEN=${chosen!.name}`);
  analyze('EVIDENCE ' + chosen!.name, world);
  // 关键格配方核对
  const ctxE = makeCtx(world);
  console.log('KEYTILE (40,311)=', tileDesc(ctxE, 40, 311), ' (40,312)=', tileDesc(ctxE, 40, 312), ' (40,313)=', tileDesc(ctxE, 40, 313));
  // LIVE 现状（刀前基线：inclPlat 左洋=true）
  liveCalls(world, 'pre-knife');
});

function RUNgated(): boolean { return process.env.SW_ORACLE === '1'; }
