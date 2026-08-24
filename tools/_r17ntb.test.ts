// 一次性红队测量（R17 1458 对拍）：NTB 1458 两处 worldgen 变更的逐调用位定量——
//   ① 首支地牢漆（cs:25414-25421 tileDungeon/CrackedBricks→color(14)、wallDungeon→wallColor(14)）
//   ② 蜂巢墙转化玻璃豁免（cs:25582 wall!=21 → !WallID.Sets.Glass[wall]，集={21,88-93,241-243}）
// 量化口径（每次 NotTheBees() 调用 in→out）：
//   glassIn        入口玻璃墙格数（21/88-93/241-243）
//   glassRollSkip  入口玻璃墙格中、除玻璃豁免外其余条件全过者 = 1457 语义下会消耗
//                  Next(0,2) 掷的格数（=1458 相对 1457 的掷流相移量/调用）
//   glassToHive    in 玻璃 → out 86（蜂巢墙）——1458 豁免下应为 0
//   paintTileΔ     方块漆变化且 sheet∈tileDungeon{41,43,44,677-679}（首支新漆,1457 无此写）
//   paintWallΔ     墙漆变化且 wall∈wallDungeon{7,8,9,94-99}（首支新写+转化支 1457 既有,按
//                  首支带内/带外拆分：带内=新漆,带外=1457 既有转化支漆）
//   rngDraws       in→out 间 UnifiedRandom 抽取总数（相移上界交叉核对）
// 用法：cd game && SW_R17NTB=1 npx vitest run tools/_r17ntb.test.ts
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_R17NTB === '1';
const W = Number(process.env.SW_R17NTB_W ?? 4200), H = Number(process.env.SW_R17NTB_H ?? 1200);
const SEED = process.env.SW_R17NTB_SEED ?? '1372357239';
const N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const GLASS = new Set([21, 88, 89, 90, 91, 92, 241, 93, 243, 242]);
const TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
const HIVE_EXCL = new Set([2, 196, 197, 198, 199, 63, 3, 83, 73, 62, 180, 178, 13, 14, 312, 313]);
const OUTER_EXCL = new Set([15, 64, 204, 205, 206, 207, 87]);

interface Call {
  tag: string; n: number;
  glassIn: number; glassRollSkip: number; glassToHive: number;
  paintTileBand: number; paintTileOut: number;
  paintWallBand: number; paintWallOut: number;
  rngDraws: number;
}
const calls: Call[] = [];
let draws = 0;
let cur: { inWall: Uint16Array; inPaint: Uint8Array; inPaintWall: Uint8Array; glassIdx: Int32Array; glassN: number; band: Uint8Array } | null = null;

// 掷骰计数（UnifiedRandom 原型包裹——NTB 内全部经 RNG→ur）
const urp = UnifiedRandom.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
for (const m of ['nextDouble', 'nextInt', 'nextIntRange']) {
  const o = urp[m]!;
  urp[m] = function (this: unknown, ...a: unknown[]) { draws++; return o.apply(this, a); };
}

(RUN ? it : it.skip)('R17 NTB 1458 delta probe', async () => {
  const g0 = globalThis as { __swNTBCap?: (phase: string, gs: unknown, st: import('../src/world/TileStore').TileStore) => void };
  g0.__swNTBCap = (phase, gs, st) => {
    const g = gs as import('../src/world/gen/vanilla/GenState').GenState;
    if (phase === 'in') {
      const stack = new Error().stack ?? '';
      let tag = '?';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('NotTheBeesPass') && !m[1].includes('_r17ntb')) {
          tag = `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`; break;
        }
      }
      const inWall = st.wall.slice();
      const inPaint = st.paint.slice();
      const inPaintWall = st.paintWall.slice();
      const glassIdx = new Int32Array(N); let glassN = 0;
      const ws = g.worldSurface, rock = g.rockLevel, bd = g.beachDistance;
      const bandTop = (ws + rock * 2) / 3 + 2;
      const band = new Uint8Array(N);
      for (let x = 0; x < W; x++) {
        const sideHit = (g.dungeonSide <= -1 && x < W / 2) || (g.dungeonSide >= 1 && x > W / 2);
        const ocean = x < bd || x > W - bd;
        for (let y = 0; y < H; y++) {
          const i = y * W + x;
          const wv = inWall[i]!;
          if (wv > 0 && GLASS.has(wv)) glassIdx[glassN++] = i;
          const od = ocean && y <= (ws + rock) / 2 + 40;
          if (sideHit && (od || y < bandTop)) band[i] = 1;
        }
      }
      cur = { inWall, inPaint, inPaintWall, glassIdx, glassN, band };
      draws = 0;
      calls.push({ tag, n: calls.length + 1, glassIn: 0, glassRollSkip: 0, glassToHive: 0, paintTileBand: 0, paintTileOut: 0, paintWallBand: 0, paintWallOut: 0, rngDraws: 0 });
      return;
    }
    // out
    const c = calls[calls.length - 1]!;
    const s = cur!;
    for (let k = 0; k < s.glassN; k++) {
      const i = s.glassIdx[k]!;
      const iw = s.inWall[i]!, ow = st.wall[i]!;
      if (ow === 86 && iw !== 86) c.glassToHive++;
      if (GLASS.has(ow)) c.glassKept = (c.glassKept ?? 0) + 1;
      // 1457 语义会掷 Next(0,2) 的判定链（去掉玻璃豁免位后逐条复算,首支 continue 格不计）
      const x = i % W, y = (i / W) | 0;
      if (OUTER_EXCL.has(iw)) continue;
      if (iw !== 23 && iw !== 24 && iw !== 42 && iw !== 10 && iw !== 82 && iw !== 187 && iw !== 216 && iw !== 34 && iw !== 244
        && !HIVE_EXCL.has(iw)) c.glassRollSkip++;
    }
    for (let i = 0; i < N; i++) {
      if (st.paint[i] !== s.inPaint[i]) {
        const t = st.flags[i] ? SHEET[st.type[i]!] : -1;
        if (t >= 0 && TILE_DUNGEON.has(t)) { if (s.band[i]) c.paintTileBand++; else c.paintTileOut++; }
      }
      if (st.paintWall[i] !== s.inPaintWall[i]) {
        if (WALL_DUNGEON.has(st.wall[i]!)) { if (s.band[i]) c.paintWallBand++; else c.paintWallOut++; }
      }
    }
    c.glassIn = s.glassN;
    c.rngDraws = draws;
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
      seedFlags: { notTheBees: true } as never,
    });
  } finally {
    delete g0.__swNTBCap;
  }
  console.log('\n=== R17 NTB 1458 delta per NotTheBees() call ===');
  console.log('call site                          glassIn rollSkip toHive kept  pTile(band/out) pWall(band/out) rngDraws');
  for (const c of calls) {
    console.log(
      `#${c.n} ${c.tag.padEnd(34)} ${String(c.glassIn).padStart(6)} ${String(c.glassRollSkip).padStart(7)} ` +
      `${String(c.glassToHive).padStart(6)} ${String(c.glassKept ?? 0).padStart(5)} ` +
      `${String(c.paintTileBand).padStart(6)}/${String(c.paintTileOut).padStart(5)} ` +
      `${String(c.paintWallBand).padStart(6)}/${String(c.paintWallOut).padStart(5)} ${String(c.rngDraws).padStart(7)}`);
  }
}, 600_000);
