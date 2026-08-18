// ZZZ 探针 5：vanilla 终态 .wld（含真帧）二次跑 FinalCleanup 扫——谓词正确性验收。
// 原版终态已无失锚物体（vanilla 扫已杀过）→ 正确实现二次杀应≈0；大量击杀=谓词 bug。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runFinalCleanupPass, __zzzLastStats } from '../src/world/gen/vanilla/FinalCleanupPass';
import { restoreGenSolid, flipGenSolid } from '../src/world/gen/vanilla/GenSolid';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') { SHEET[i] = s; if (!REV.has(s)) REV.set(s, i); }
}

for (const f of ['s111.wld', 'm111.wld']) {
  it(`second-run on vanilla final ${f}`, () => {
    const wld = parseWld(new Uint8Array(readFileSync(`/tmp/vserver86/${f}`)));
    const w = wld.tilesWide, h = wld.tilesHigh, n = w * h;
    const st = new TileStore(w, h);
    for (let i = 0; i < n; i++) {
      st.flags[i] = wld.tiles.active[i]!;
      const vt = wld.tiles.type[i]!;
      st.type[i] = wld.tiles.active[i] || vt ? (vt === 0 && !wld.tiles.active[i] ? 0 : (REV.get(vt) ?? 0)) : 0;
      if (vt === 0 && wld.tiles.active[i]) st.type[i] = REV.get(0) ?? 0;  // dirt sheet0
      st.wall[i] = wld.tiles.wall[i]!;
      st.liquid[i] = wld.tiles.liquid[i]!;
      const lt = wld.tiles.liquidType[i]!;
      st.liquidType[i] = st.liquid[i] ? lt === 1 ? LIQUID_TYPE.WATER : lt === 2 ? LIQUID_TYPE.LAVA : lt === 3 ? LIQUID_TYPE.HONEY : LIQUID_TYPE.SHIMMER : 0;
      st.half[i] = wld.tiles.half[i]!;
      st.slope[i] = wld.tiles.slope[i]!;
      st.frameX[i] = wld.tiles.frameX[i]!;
      st.frameY[i] = wld.tiles.frameY[i]!;
    }
    const gs: Partial<GenState> = {
      seed: 111,
      worldSurface: wld.groundLevel,
      rockLevel: wld.rockLevel,
      beachDistance: 380,
      shimmerX: -1, shimmerY: -1,   // 关 shimmer 段（.wld 无中心锚;单独验证扫）
    };
    const pre: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      if (st.flags[i]) {
        const sh = SHEET[st.type[i]!] ?? -1;
        pre[sh] = (pre[sh] ?? 0) + 1;
      }
    }
    restoreGenSolid(new Map());
    flipGenSolid([484], false);
    const t0 = Date.now();
    runFinalCleanupPass(st, gs as GenState, undefined, { frameSparse: false });
    const post: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      if (st.flags[i]) {
        const sh = SHEET[st.type[i]!] ?? -1;
        post[sh] = (post[sh] ?? 0) + 1;
      }
    }
    const deltas: string[] = [];
    for (const k of new Set([...Object.keys(pre), ...Object.keys(post)])) {
      const d = (post[k] ?? 0) - (pre[k] ?? 0);
      if (d !== 0) deltas.push(`${k}:${d > 0 ? '+' : ''}${d}(pre${pre[k] ?? 0})`);
    }
    const s = __zzzLastStats;
    console.log(`${f}: 二次杀 delta = ${deltas.length ? deltas.join(' ') : '零（全族不动）'}`);
    console.log(`${f}: mossVisited=${s.mossVisited} roll184=${s.roll184} mossKilled=${s.mossKilled} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }, 240_000);
}
