// ★BJ240 一次性定谳仪（SW_ORACLE=1 启用）：用户实报「贝壳电话只能传到左海洋」
// 物证地图 /tmp/bj240-evidence.wld（已脱库）右洋目标计算失败特征提取。
// 金标：Terarria1457/Terraria.GameContent/TeleportHelpers.cs:49-241 + Player.cs:56755-56830
//       + WorldGen.InWorld（WorldGen.cs:9642-9648, x<maxTilesX-fluff）。
import { it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { readFileSync } from 'node:fs';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { loadFixtureWorld } from '../tests/world-fixtures';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
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

/** 金标爬行体 + 臂迹（arm 每迭代记录） */
function crawlTraced(ctx: Ctx, rightOcean: boolean): {
  ok: boolean; why: string; x: number; y: number; num7: number; num10: number; trace: string[];
} {
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
  let flag = solidVanilla(ctx, px, py);
  let num7 = 0;
  const trace: string[] = [];
  while (num7 < num8 && num10 < num11) {
    num7++;
    const flag2 = solidVanilla(ctx, px, py) || st.liquid[st.idx(px, py)] > 0;
    const flag3 = solidVanilla(ctx, px, py + 1) || st.liquid[st.idx(px, py + 1)] > 0;
    let arm = '';
    do {
      if (!flag2 && !flag3) {
        if (!solidVanilla(ctx, px - 1, py) && !solidVanilla(ctx, px + 1, py)
          && !solidVanilla(ctx, px - 1, py + 1) && !solidVanilla(ctx, px + 1, py + 1)
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
      if (st.liquid[st.idx(px, py + 1)] > 0 && !solidVanilla(ctx, px, py + 1)) { px += crawlOffsetX; num10++; arm = 'liquidCrawl'; break; }
      if (dangerous(px - crawlOffsetX, py) || dangerous(px, py)) { px += crawlOffsetX; num10++; arm = 'dangerCrawl0'; break; }
      if (dangerous(px - crawlOffsetX, py + 1) || dangerous(px, py + 1)) { px += crawlOffsetX; num10++; arm = 'dangerCrawl1'; break; }
      if (py < 40) { py++; arm = 'skyClamp'; break; }
      if (!ctx.low && !solidVanilla(ctx, px, py + 1)) { px += crawlOffsetX; num10++; arm = 'finalCrawl'; }
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
  let flag7 = solidVanilla(ctx, px, py) || st.liquid[st.idx(px, py)] > 0;
  if (!flag7) {
    for (let i = 0; i < num13; i++) {
      if (solidVanilla(ctx, px, py + i) || st.liquid[st.idx(px, py + i)] > 0) { flag7 = true; py += Math.max(0, i - 1); break; }
    }
  }
  if (ctx.low && !flag7) {
    for (let j = 0; j < num13; j++) {
      if (solidVanilla(ctx, px - 1, py + j) || st.liquid[st.idx(px - 1, py + j)] > 0) { flag7 = true; px--; py += Math.max(0, j - 1); break; }
    }
  }
  if (ctx.low && !flag7) {
    for (let k = 0; k < num13; k++) {
      if (solidVanilla(ctx, px + 1, py + k) || st.liquid[st.idx(px + 1, py + k)] > 0) { flag7 = true; px++; py += Math.max(0, k - 1); break; }
    }
  }
  return flag7
    ? { ok: true, why: '', x: px, y: py, num7, num10, trace }
    : { ok: false, why: `noFloor20 @(${px},${py})`, x: px, y: py, num7, num10, trace };
}

/** 列剖面：自 y=40 向下首个 active/liquid 特征 */
function colProfile(ctx: Ctx, x: number): { firstActY: number; firstKind: string; firstTile: number; floorType: number } {
  const st = ctx.st;
  for (let y = 0; y < st.h; y++) {
    const i = st.idx(x, y);
    if (st.liquid[i] > 0) return { firstActY: y, firstKind: 'liquid', firstTile: st.liquidType[i], floorType: -1 };
    if (st.flags[i]) return { firstActY: y, firstKind: 'tile', firstTile: st.type[i], floorType: st.type[i] };
  }
  return { firstActY: -1, firstKind: 'void', firstTile: -1, floorType: -1 };
}

function analyze(name: string, world: World): void {
  const ctx = makeCtx(world);
  const st = ctx.st;
  const w = st.w;
  console.log(`\n===== ${name} ===== w=${w} h=${st.h} groundLevel=${ctx.groundLevel} low=${ctx.low}`);
  // 两缘各 46 列剖面
  const edge = (xs: number[]) => xs.map((x) => {
    const p = colProfile(ctx, x);
    const tn = p.firstKind === 'tile' ? (TILE_DEFS[p.firstTile]?.vanilla?.sheet ?? p.firstTile) : p.firstTile;
    return `${x}:${p.firstKind}@${p.firstActY}(sheet${tn})`;
  }).join(' ');
  console.log('LEFT  edge[0..45]  :', edge(Array.from({ length: 46 }, (_, k) => k)));
  console.log('RIGHT edge[w-46..w-1]:', edge(Array.from({ length: 46 }, (_, k) => w - 46 + k)));
  // 金标爬行双洋
  for (const side of [true, false]) {
    const r = crawlTraced(ctx, side);
    console.log(`crawl rightOcean=${side}: ok=${r.ok} why="${r.why}" land=(${r.x},${r.y}) n7=${r.num7} n10=${r.num10}`);
    console.log('  trace[0..30]:', r.trace.slice(0, 30).join(' | '));
    if (r.trace.length > 30) console.log('  trace[-12:]:', r.trace.slice(-12).join(' | '));
  }
  // MagicConch 双尝试序（Player.cs:56785-56830）：leftHalf 首选右洋
  const sim = (playerLeftHalf: boolean) => {
    const first = crawlTraced(ctx, playerLeftHalf);
    const second = first.ok ? null : crawlTraced(ctx, !playerLeftHalf);
    const dest = first.ok ? first : (second && second.ok ? second : null);
    console.log(`  playerLeftHalf=${playerLeftHalf}: first(right=${playerLeftHalf}) ok=${first.ok} ${first.why}; fallback ok=${second ? second.ok : 'NA'} ${second && !second.ok ? second.why : ''}; dest=${dest ? `(${dest.x},${dest.y})` : '原地'}`);
  };
  sim(true);
  sim(false);
}

(RUNgated() ? it : it.skip)('bj240 evidence map conch analysis', async () => {
  const buf = new Uint8Array(readFileSync('/tmp/bj240-evidence.wld'));
  const { save } = parseWldToSave(buf);
  const { world } = loadSave(JSON.stringify(save));
  console.log('BJ240 evidence title:', (save as { title?: string }).title);
  analyze('EVIDENCE 天真的钴最高点(3)', world);
  // 关键格配方核对（反伪影）：左落点下格 (40,312) 与右起点下格 (6360,414)
  const stE = world.store;
  const tileAt = (x: number, y: number) => {
    const i = stE.idx(x, y);
    const d = TILE_DEFS[stE.type[i]];
    return `(${x},${y}) active=${!!stE.flags[i]} type=${stE.type[i]} sheet=${d?.vanilla?.sheet} solid=${d?.solid} plat=${d?.platform} liquid=${stE.liquid[i]} lt=${stE.liquidType[i]} wall=${stE.wall[i]}`;
  };
  console.log('KEYTILE', tileAt(40, 311), '|', tileAt(40, 312), '|', tileAt(40, 313));
  console.log('KEYTILE', tileAt(6360, 413), '|', tileAt(6360, 414), '|', tileAt(6360, 415), '|', tileAt(6359, 414), '|', tileAt(6361, 414));
  // ★live 直判：仓库 requestMagicConchTeleportPosition 实体在同瓦 ≡ 金标爬行体
  const g = Object.create(Game.prototype) as unknown as {
    world: World;
    player: { equipStats: { fireWalk: boolean }; buffs: null; w: number; h: number };
    requestMagicConchTeleportPosition: (r: boolean) => { x: number; y: number } | null;
  };
  g.world = world;
  g.player = { equipStats: { fireWalk: false }, buffs: null, w: 20, h: 42 };
  const ctxE = makeCtx(world);
  for (const side of [true, false]) {
    const gold = crawlTraced(ctxE, side);
    const live = g.requestMagicConchTeleportPosition(side);
    console.log(`LIVE rightOcean=${side}: ${live ? `(${Math.round((live.x + 10 - 8) / TILE)},${Math.round((live.y + 42 - 16) / TILE)})` : 'null'} | gold ok=${gold.ok} ${gold.why}`);
    if (gold.ok) expect(live, `live 应成功(${side})`).not.toBeNull();
    else expect(live, `live 应失败(${side})=${gold.why}`).toBeNull();
  }
  // 对照组 1：BJ43 档案世界（正常传送类型）
  analyze('CONTROL fixture bj43-b', loadFixtureWorld('bj43-b'));
  // 对照组 1b：BJ240 合成自然世界（右缘水带+泥架）
  {
    const { TILE_BY_KEY: TBK } = await import('../src/data/tiles');
    const wS = new World(600, 300, 7, 'bj240-syn-nat');
    wS.groundLevel = 200;
    const stS = wS.store;
    const paint = (x0: number, x1: number, y0: number, y1: number, t: number) => {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) stS.setTileSilent(x, y, t);
    };
    const water = (x0: number, x1: number, y0: number, y1: number, a = 200) => {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) stS.setLiquid(x, y, a, LIQUID_TYPE.WATER);
    };
    paint(554, 565, 164, 164, 0);
    water(566, 599, 165, 195, 0);
    water(550, 599, 165, 195);
    paint(550, 599, 196, 196, TBK['dirt']);
    paint(540, 549, 164, 196, TBK['dirt']);
    water(30, 60, 112, 143);
    paint(36, 46, 112, 112, TBK['platform']);
    stS.setLiquid(40, 112, 127, LIQUID_TYPE.WATER);
    analyze('CONTROL synthetic natural 600', wS);
    // LIVE 直判同一合成世界
    const gS = Object.create(Game.prototype) as unknown as {
      world: World; player: { equipStats: { fireWalk: boolean }; buffs: null; w: number; h: number };
      requestMagicConchTeleportPosition: (r: boolean) => { x: number; y: number } | null;
    };
    gS.world = wS; gS.player = { equipStats: { fireWalk: false }, buffs: null, w: 20, h: 42 };
    console.log('LIVE-syn right:', gS.requestMagicConchTeleportPosition(true), 'left:', gS.requestMagicConchTeleportPosition(false));
    // 复刻测试文件构造路径（先物证特征再清除改造）对照
    const wT = new World(600, 300, 7, 'bj240-ev');
    wT.groundLevel = 200;
    const stT = wT.store;
    const platT = TBK['platform'], dirtT = TBK['dirt'];
    const paintT = (x0: number, x1: number, y0: number, y1: number, t: number) => {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) stT.setTileSilent(x, y, t);
    };
    const waterT = (x0: number, x1: number, y0: number, y1: number, a = 200) => {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) stT.setLiquid(x, y, a, LIQUID_TYPE.WATER);
    };
    paintT(554, 565, 164, 164, platT);
    waterT(566, 599, 165, 195);
    paintT(36, 46, 112, 112, platT);
    waterT(30, 60, 112, 143);
    stT.setLiquid(40, 112, 127, LIQUID_TYPE.WATER);
    console.log('LIVE-evtest right:', (() => {
      const gT = Object.create(Game.prototype) as unknown as {
        world: World; player: { equipStats: { fireWalk: boolean }; buffs: null };
        requestMagicConchTeleportPosition: (r: boolean) => { x: number; y: number } | null;
      };
      gT.world = wT; gT.player = { equipStats: { fireWalk: false }, buffs: null, w: 20, h: 42 };
      return gT.requestMagicConchTeleportPosition(true);
    })());
    // 物证特征构造的右洋爬行（应 InWorld40 败）
    analyze('evtest signature', wT);
    // 再走清除改造
    paintT(554, 565, 164, 164, 0);
    waterT(566, 599, 165, 195, 0);
    waterT(550, 599, 165, 195);
    paintT(550, 599, 196, 196, dirtT);
    paintT(540, 549, 164, 196, dirtT);
    analyze('evtest→natural', wT);
    console.log('LIVE-evtest-natural right:', (() => {
      const gT2 = Object.create(Game.prototype) as unknown as {
        world: World; player: { equipStats: { fireWalk: boolean }; buffs: null };
        requestMagicConchTeleportPosition: (r: boolean) => { x: number; y: number } | null;
      };
      gT2.world = wT; gT2.player = { equipStats: { fireWalk: false }, buffs: null, w: 20, h: 42 };
      return gT2.requestMagicConchTeleportPosition(true);
    })());
  }
  // 对照组 2：小世界生成
  const w2 = new World(4200, 1200, 7, 'bj240-control-small');
  analyze('CONTROL generated small 4200', w2);
});

function RUNgated(): boolean { return process.env.SW_ORACLE === '1'; }
void TILE_BY_KEY;
