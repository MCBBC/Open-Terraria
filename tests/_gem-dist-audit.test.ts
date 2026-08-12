// 一次性诊断：暴露晶簇(tile 178)分布对账——原版金标 12345世界.wld vs 我们 generateWorld(12345)
// 运行：npx vitest run tests/_gem-dist-audit.test.ts
import { describe, it } from 'vitest';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';
import { loadGolden } from './golden-wld-meta.test';

const EXPOSED = TILE_BY_KEY['v_178_gems']!;

interface Stats {
  total: number;
  bands: Record<string, number>;   // 深度带计数
  floating: number;                // 四邻无实心且无背景墙(悬空)
  noWall: number;                  // 无背景墙
  styles: number[];                // style(frameX/18)分布
}

function statsOf(
  w: number, h: number,
  get: (x: number, y: number) => { t: number; a: number; fx: number; wall: number; solidNb: boolean },
): Stats {
  const s: Stats = { total: 0, bands: {}, floating: 0, noWall: 0, styles: new Array(8).fill(0) };
  const solid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return get(x, y).a === 1 && get(x, y).t !== EXPOSED && true;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = get(x, y);
      if (c.a !== 1 || c.t !== EXPOSED) continue;
      s.total++;
      const band = y < 337 ? 'surface' : y < 457 ? 'dirt' : y < 802 ? 'rock' : y < 900 ? 'hellTop' : 'hell';
      s.bands[band] = (s.bands[band] ?? 0) + 1;
      if (c.wall === 0) s.noWall++;
      const nb = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
      if (!nb && c.wall === 0) s.floating++;
      const st = Math.round(c.fx / 18);
      if (st >= 0 && st < 8) s.styles[st]++;
    }
  }
  return s;
}

describe('宝石分布对账(一次性)', () => {
  it('金标 vs 我们: tile 178 总量/深度带/悬空比例', async () => {
    const g = loadGolden('12345世界.wld');
    const gw = g.tilesWide, gh = g.tilesHigh;
    const golden = statsOf(gw, gh, (x, y) => {
      const i = y * gw + x;
      // 金标 type 是原版 id:宝石=178
      return { t: g.tiles.type[i] === 178 ? EXPOSED : g.tiles.type[i], a: g.tiles.active[i], fx: g.tiles.frameX[i], wall: g.tiles.wall[i], solidNb: false };
    });
    console.log('GOLDEN 178:', JSON.stringify(golden));

    // 并行会话常在改后期 pass（如 DeadMansChestBiome 中途态）——宝石系统在微群系之前，
    // 抓 onWorldPartial 快照即可，容忍后续 pass 抛错
    let st: import('../src/world/TileStore').TileStore | undefined;
    try {
      await generateWorld({
        width: 4200, height: 1200, seedText: '12345', evil: 0,
        onWorldPartial: (w, _i, name) => { if (name === '宝石系统') st = w.store; },
      });
    } catch (e) {
      console.log('(generateWorld 后段抛错，用宝石系统快照继续:', String(e).slice(0, 80), ')');
    }
    if (!st) throw new Error('未拿到宝石系统快照');
    const ours = statsOf(st.w, st.h, (x, y) => {
      const i = st.idx(x, y);
      const d = (dx: number, dy: number) => {
        if (x + dx < 0 || y + dy < 0 || x + dx >= st.w || y + dy >= st.h) return false;
        const j = st.idx(x + dx, y + dy);
        return st.flags[j] === 1;
      };
      return {
        t: st.type[i], a: st.flags[i], fx: st.frameX[i], wall: st.wall[i],
        solidNb: d(-1, 0) || d(1, 0) || d(0, -1) || d(0, 1),
      };
    });
    console.log('OURS   178:', JSON.stringify(ours));

    // ---- 背景指标：y∈[rockLevel,h-300) 空气比例; y∈[ws,h-300) 沙漠墙(187/216)空气格数 ----
    const bandAir = (cells: Array<{ a: number; wall: number }>) => {
      let air = 0; let desertWallAir = 0;
      for (const c of cells) { if (!c.a) { air++; if (c.wall === 187 || c.wall === 216) desertWallAir++; } }
      return { n: cells.length, air, desertWallAir };
    };
    const gCells: Array<{ a: number; wall: number }> = [];
    for (let y = 457; y < 900; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; gCells.push({ a: g.tiles.active[i], wall: g.tiles.wall[i] }); }
    console.log('GOLDEN band:', JSON.stringify(bandAir(gCells)));
    const gCells2: Array<{ a: number; wall: number }> = [];
    for (let y = 337; y < 900; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; gCells2.push({ a: g.tiles.active[i], wall: g.tiles.wall[i] }); }
    console.log('GOLDEN amberBand:', JSON.stringify(bandAir(gCells2)));
    const oCells: Array<{ a: number; wall: number }> = [];
    for (let y = 457; y < 900; y++) for (let x = 0; x < st.w; x++) { const i = st.idx(x, y); oCells.push({ a: st.flags[i], wall: st.wall[i] }); }
    console.log('OURS   band:', JSON.stringify(bandAir(oCells)));
    const oCells2: Array<{ a: number; wall: number }> = [];
    for (let y = 337; y < 900; y++) for (let x = 0; x < st.w; x++) { const i = st.idx(x, y); oCells2.push({ a: st.flags[i], wall: st.wall[i] }); }
    console.log('OURS   amberBand:', JSON.stringify(bandAir(oCells2)));

    // ---- 归属拆分：冰系(雪界内) / 沙漠墙腔(187/216) / 其余=地下单格 ----
    const gs = lastGenState();
    let ice = 0, desert = 0, other = 0;
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (!st.flags[i] || st.type[i] !== EXPOSED) continue;
        const inSnow = gs?.snowMinX && y < gs.snowMinX.length
          && x >= (gs.snowMinX[y] ?? 1e9) && x <= (gs.snowMaxX?.[y] ?? -1e9);
        if (inSnow) ice++;
        else if (st.wall[i] === 187 || st.wall[i] === 216) desert++;
        else other++;
      }
    }
    console.log('OURS split:', JSON.stringify({ ice, desert, other }));
    // 金标同口径（无 gs，用沙漠墙分；冰系用 y<(ws+rl)/2 且 style!=6 近似不可行——直接报沙漠墙数）
    let gDesert = 0, gOther = 0;
    for (let i = 0; i < gw * gh; i++) {
      if (!g.tiles.active[i] || g.tiles.type[i] !== 178) continue;
      if (g.tiles.wall[i] === 187 || g.tiles.wall[i] === 216) gDesert++; else gOther++;
    }
    console.log('GOLDEN split(desertWall):', JSON.stringify({ gDesert, gOther }));

    // ---- 腔体开阔度:沙漠墙(187/216)空气格连通域分布 + 内部无贴格比例 ----
    const cavity = (w: number, h: number, get: (x: number, y: number) => { a: number; wall: number; solidNb: boolean }) => {
      const seen = new Uint8Array(w * h);
      const isCav = (x: number, y: number) => {
        const c = get(x, y);
        return !c.a && (c.wall === 187 || c.wall === 216);
      };
      const hist = { '1': 0, '2-3': 0, '4-8': 0, '9-20': 0, '21-50': 0, '51+': 0 };
      let comps = 0, cells = 0, interior = 0, total = 0;
      const stack: Array<[number, number]> = [];
      for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
        if (!isCav(sx, sy) || seen[sy * w + sx]) continue;
        comps++; let size = 0; let inter = 0;
        stack.push([sx, sy]); seen[sy * w + sx] = 1;
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          size++; total++;
          if (!get(cx, cy).solidNb) inter++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (seen[ny * w + nx] || !isCav(nx, ny)) continue;
            seen[ny * w + nx] = 1; stack.push([nx, ny]);
          }
        }
        cells += size; interior += inter;
        if (size === 1) hist['1']++;
        else if (size <= 3) hist['2-3']++;
        else if (size <= 8) hist['4-8']++;
        else if (size <= 20) hist['9-20']++;
        else if (size <= 50) hist['21-50']++;
        else hist['51+']++;
      }
      return { comps, cells, interiorRatio: total ? +(interior / total).toFixed(3) : 0, hist };
    };
    console.log('GOLDEN cavity:', JSON.stringify(cavity(gw, gh, (x, y) => {
      const i = y * gw + x;
      let nb = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const j = (y + dy) * gw + (x + dx);
        if (x + dx >= 0 && y + dy >= 0 && x + dx < gw && y + dy < gh && g.tiles.active[j]) nb = true;
      }
      return { a: g.tiles.active[i], wall: g.tiles.wall[i], solidNb: nb };
    })));
    console.log('OURS   cavity:', JSON.stringify(cavity(st.w, st.h, (x, y) => {
      const i = st.idx(x, y);
      let nb = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!st.inBounds(x + dx, y + dy)) continue;
        if (st.flags[st.idx(x + dx, y + dy)]) nb = true;
      }
      return { a: st.flags[i], wall: st.wall[i], solidNb: nb };
    })));
  }, 600000);
});
