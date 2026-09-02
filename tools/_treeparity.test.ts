// 树木数量大额差异专项（2026-08-17）· 量化探针
// 通道：
//  A) 原版逐 pass dump（/tmp/sw-num4/van_x86_g，seed=9293480 evil=0 4200×1200）
//     082_Planting_Trees = Trees pass 输出（无帧数组 → 干列算法数树）
//  B) JS generateWorld 同种子/尺寸/evil，onWorldPartial 截「栽树」pass 末态
//  C) 客户端金标最终 .wld（12345世界 / 9293480世界）帧级冠层标记数树 vs JS 完整生成最终态
// 干列算法（帧无关，A/B 两侧同算法）：列内连续 type==5(vanilla id) 且 active ≥5 行 = 一棵树干
//  （普通树高 5-16、Epic 20-29；侧枝/根单格不成 5 连）。
// 注意：我们的 store.type 是内部 id 空间——经 TILE_DEFS[].vanilla.sheet 映射回原版 id。
// 跑法：npx vitest run tools/_treeparity.test.ts
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';
import type { World } from '../src/world/World';

const RUN = process.env.SW_ORACLE === "1";   // ★一次性 rig/oracle 仪(2026-09-02 补门):夹具在 /tmp 不入库,缺省 skip 防默认 sweep 红;SW_ORACLE=1 启用

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface RawTiles {
  w: number; h: number;
  act: Uint8Array; van: Int32Array;   // van = 原版 sheet id
  fx?: Uint16Array; fy?: Uint16Array;
}
const mk = (w: number, h: number): RawTiles => ({
  w, h, act: new Uint8Array(w * h), van: new Int32Array(w * h).fill(-1),
});

function fromDump(base: string, w: number, h: number, n: number): RawTiles {
  const t = mk(w, h);
  const typ = new Uint16Array(readFileSync(`${base}.typ`).buffer, 0, n);
  const act = readFileSync(`${base}.act`);
  for (let i = 0; i < n; i++) { t.act[i] = act[i]; t.van[i] = typ[i]; }
  return t;
}

function fromStore(world: World): RawTiles {
  const st = world.store;
  const t = mk(st.w, st.h);
  for (let i = 0; i < st.w * st.h; i++) {
    t.act[i] = st.flags[i] ? 1 : 0;
    t.van[i] = SHEET[st.type[i]] ?? -1;
  }
  t.fx = st.frameX.slice(); t.fy = st.frameY.slice();
  return t;
}

function fromWld(wld: ReturnType<typeof parseWld>): RawTiles {
  const t = mk(wld.tilesWide, wld.tilesHigh);
  const N = t.w * t.h;
  for (let i = 0; i < N; i++) { t.act[i] = wld.tiles.active[i]; t.van[i] = wld.tiles.type[i]; }
  t.fx = wld.tiles.frameX; t.fy = wld.tiles.frameY;
  return t;
}

/** 干列检测：每棵树 {x, yBase}（yBase=干底行） */
function trunkColumns(t: RawTiles, minRun = 5) {
  const trees: { x: number; yBase: number; run: number }[] = [];
  for (let x = 0; x < t.w; x++) {
    let run = 0, runEnd = -1;
    for (let y = 0; y <= t.h; y++) {
      const on = y < t.h && t.act[y * t.w + x] === 1 && t.van[y * t.w + x] === 5;
      if (on) { run++; runEnd = y; } else { if (run >= minRun) trees.push({ x, yBase: runEnd, run }); run = 0; }
    }
  }
  return trees;
}

/** 帧级冠层标记（需要 fx/fy） */
function crownMarkers(t: RawTiles) {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const i = y * t.w + x;
    if (t.act[i] !== 1 || t.van[i] !== 5) continue;
    if ((t.fx![i] === 0 || t.fx![i] === 22) && (t.fy![i] === 198 || t.fy![i] === 220 || t.fy![i] === 242)) out.push({ x, y });
  }
  return out;
}

function typeStats(t: RawTiles, vanId: number) {
  let tiles = 0; const cols = new Set<number>();
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const i = y * t.w + x;
    if (t.act[i] === 1 && t.van[i] === vanId) { tiles++; cols.add(x); }
  }
  return { tiles, cols: cols.size };
}

function regionStats(trees: { x: number }[], treeX: number[], w: number) {
  const b = [0, treeX[0], treeX[1], treeX[2], w];
  const by = [0, 0, 0, 0];
  for (const tr of trees) {
    let r = 3;
    for (let k = 0; k < 4; k++) if (tr.x >= b[k] && tr.x < b[k + 1]) { r = k; break; }
    by[r]++;
  }
  return by;
}

const TREE_FAMILY = [323, 191, 192, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634];

(RUN ? describe : describe.skip)('树木数量大额差异专项', { timeout: 600_000 }, () => {
  it('AB：Trees pass 输出对账（9293480 evil=0 4200×1200）', async () => {
    const W = 4200, H = 1200, N = W * H;
    const van = fromDump('/tmp/sw-num4/van_x86_g/082_Planting_Trees', W, H, N);
    const vanPre = fromDump('/tmp/sw-num4/van_x86_g/081_Sunflowers', W, H, N);
    const vanTrees = trunkColumns(van);
    console.log('[vanilla 082] 干列树数 =', vanTrees.length, '（081 前=, 应 0:', trunkColumns(vanPre).length, '）');

    let snap: World | null = null;
    const world = await generateWorld({
      seedText: '9293480', width: W, height: H, evil: 0,
      onWorldPartial: (w, _i, name) => { if (name === '栽树') snap = w; },
    });
    const our = fromStore(snap!);
    const ourTrees = trunkColumns(our);
    console.log('[ours 栽树末] 干列树数 =', ourTrees.length, ' 冠层标记 =', crownMarkers(our).length);

    const vanSet = new Set(vanTrees.map(t => `${t.x},${t.yBase}`));
    const ourSet = new Set(ourTrees.map(t => `${t.x},${t.yBase}`));
    const miss = [...vanSet].filter(k => !ourSet.has(k));
    const extra = [...ourSet].filter(k => !vanSet.has(k));
    console.log(`[对账] 同坐标=${vanSet.size - miss.length} 原版独有(缺)=${miss.length} 我们独有=${extra.length}`);
    if (miss.length) console.log('  缺失样本(前40):', miss.slice(0, 40).join(' '));
    if (extra.length) console.log('  多出样本(前40):', extra.slice(0, 40).join(' '));

    const tx: number[] = (world as unknown as { treeX: number[] }).treeX ?? [0, 0, 0];
    console.log('[treeX]', JSON.stringify(tx), '[分区][原版]', regionStats(vanTrees, tx, W), '[我们]', regionStats(ourTrees, tx, W));

    for (const ty of TREE_FAMILY) {
      const a = typeStats(van, ty), b = typeStats(our, ty);
      if (a.tiles || b.tiles) console.log(`  tile ${ty}: vanilla tiles=${a.tiles} cols=${a.cols} | ours tiles=${b.tiles} cols=${b.cols}`);
    }
  });

  it('C：最终 .wld vs JS 完整生成（12345 / 9293480）', async () => {
    for (const [f, seedText] of [['12345世界', '12345'], ['9293480世界', '9293480']] as const) {
      const wld = parseWld(new Uint8Array(readFileSync(`tests/golden/wld/${f}.wld`)));
      const raw = fromWld(wld);
      const vanCrowns = crownMarkers(raw), vanTrunks = trunkColumns(raw);
      console.log(`[${f}.wld ${wld.tilesWide}x${wld.tilesHigh} evil=${wld.isCrimson ? 1 : 0}] 冠层=${vanCrowns.length} 干列=${vanTrunks.length} treeX=${JSON.stringify(wld.treeX)} style=${JSON.stringify(wld.treeStyle)}`);
      const world = await generateWorld({ seedText, width: wld.tilesWide, height: wld.tilesHigh, evil: wld.isCrimson ? 1 : 0 });
      const our = fromStore(world);
      const ourCrowns = crownMarkers(our), ourTrunks = trunkColumns(our);
      console.log(`  [ours 最终] 冠层=${ourCrowns.length} 干列=${ourTrunks.length} treeX=${JSON.stringify((world as unknown as { treeX: number[] }).treeX)}`);
      const vc = new Set(vanCrowns.map(c => `${c.x},${c.y}`)), oc = new Set(ourCrowns.map(c => `${c.x},${c.y}`));
      const miss = [...vc].filter(k => !oc.has(k)), extra = [...oc].filter(k => !vc.has(k));
      console.log(`  [冠层对账] 同位=${vc.size - miss.length} 缺=${miss.length} 多=${extra.length}`);
      console.log('  [分区干列][原版]', regionStats(vanTrunks, wld.treeX, wld.tilesWide), '[我们]', regionStats(ourTrunks, wld.treeX, wld.tilesWide));
      for (const ty of TREE_FAMILY) {
        const a = typeStats(raw, ty), b = typeStats(our, ty);
        if (a.tiles || b.tiles) console.log(`  tile ${ty}: vanilla tiles=${a.tiles} cols=${a.cols} | ours tiles=${b.tiles} cols=${b.cols}`);
      }
    }
  });
});
