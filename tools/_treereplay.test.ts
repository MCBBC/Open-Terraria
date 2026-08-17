// 树木专项 · 隔离重放（2026-08-17）：dump081（原版 Sunflowers 末态 = Trees pass 输入）
// 直构 TileStore 跑我们的 TreePass，对拍 dump082 的树干格增量。
// dump 无 half/slope 数组——用我们「向日葵」末态的 half/slope 作代理（变体 A），
// 另附全零 half/slope（变体 B）夹逼真值区间。
// 跑法：npx vitest run tools/_treereplay.test.ts
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runTreePass } from '../src/world/gen/vanilla/TreePass';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { generateWorld } from '../src/world/gen/WorldGen';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') {
    SHEET[i] = s;
    if (!REV.has(s)) REV.set(s, i);
  }
}

function loadDump(idx: number, name: string) {
  const base = `/tmp/sw-num4/van_x86_g/${String(idx).padStart(3, '0')}_${name}`;
  return {
    typ: new Uint16Array(readFileSync(`${base}.typ`).buffer, 0, N),
    act: readFileSync(`${base}.act`),
  };
}

function buildStore(d81: ReturnType<typeof loadDump>, half?: Uint8Array, slope?: Uint8Array) {
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    if (d81.act[i]) {
      st.flags[i] = 1;
      st.type[i] = REV.get(d81.typ[i]) ?? 0;
    }
    st.wall[i] = 0; // 081 无 wal 读取需求——墙门只在 j-1；从 wal dump 补
  }
  if (half) st.half.set(half);
  if (slope) st.slope.set(slope);
  return st;
}

/** 从 081→082 的 type∈set 增量格集合（原版 Trees pass 实际放置） */
function vanillaDelta(d81: ReturnType<typeof loadDump>, d82: ReturnType<typeof loadDump>, sheets: number[]) {
  const set = new Set(sheets);
  const cells = new Set<string>();
  for (let i = 0; i < N; i++) {
    if (!d82.act[i] || !set.has(d82.typ[i])) continue;
    if (d81.act[i] && set.has(d81.typ[i])) continue;
    cells.add(`${i % W},${(i / W) | 0}`);
  }
  return cells;
}

function storeTrees(st: TileStore, sheet: number) {
  // 干列算法（与量化探针同款）
  const trees: string[] = [];
  for (let x = 0; x < W; x++) {
    let run = 0, runEnd = -1;
    for (let y = 0; y <= H; y++) {
      const on = y < H && st.flags[y * W + x] === 1 && SHEET[st.type[y * W + x]] === sheet;
      if (on) { run++; runEnd = y; } else { if (run >= 5) trees.push(`${x},${runEnd}`); run = 0; }
    }
  }
  return trees;
}

describe('Trees 隔离重放（dump081 → TreePass vs dump082）', { timeout: 300_000 }, () => {
  it('两变体 half/slope 夹逼', async () => {
    // 拿我们「向日葵」末态的 half/slope 代理 + groundLevel
    let proxyHalf: Uint8Array | null = null, proxySlope: Uint8Array | null = null;
    let ground = 0;
    await generateWorld({
      seedText: '9293480', width: W, height: H, evil: 0,
      onWorldPartial: (w, _i, name) => {
        if (name === '向日葵') {
          proxyHalf = w.store.half.slice(); proxySlope = w.store.slope.slice();
          ground = w.groundLevel;
        }
      },
    });
    console.log('[groundLevel]', ground);

    const d81 = loadDump(81, 'Sunflowers');
    const d82 = loadDump(82, 'Planting_Trees');
    // 墙数组 081 有 dump——补进 store
    const wal = new Uint16Array(readFileSync('/tmp/sw-num4/van_x86_g/081_Sunflowers.wal').buffer, 0, N);
    const liq = readFileSync('/tmp/sw-num4/van_x86_g/081_Sunflowers.liq');

    const vanTrees5 = vanillaDelta(d81, d82, [5]);
    const vanPalms = vanillaDelta(d81, d82, [323]);
    const vanVanity = vanillaDelta(d81, d82, [596, 616]);
    console.log(`[vanilla 082 增量] 干列树格=${vanTrees5.size} 棕榈格=${vanPalms.size} 观赏树格=${vanVanity.size}`);

    for (const [label, half, slope] of [['A:half/slope=我们代理', proxyHalf!, proxySlope!], ['B:half/slope=全零', undefined, undefined]] as const) {
      const st = buildStore(d81, half as Uint8Array | undefined, slope as Uint8Array | undefined);
      st.wall.set(wal); st.liquid.set(liq);
      const rng = new RNG(9293480);
      const gs = { worldSurface: ground, genTrees: [] } as unknown as GenState;
      runTreePass(st, rng, gs);
      const ourTrees = storeTrees(st, 5);
      const ourSet = new Set(ourTrees);
      // vanilla 侧干列（dump082 上同款 ≥5 连算法，与量化探针一致 =161 的口径）
      const vanTrunks: string[] = [];
      for (let x = 0; x < W; x++) {
        let run = 0, runEnd = -1;
        for (let y = 0; y <= H; y++) {
          const on = y < H && d82.act[y * W + x] === 1 && d82.typ[y * W + x] === 5;
          if (on) { run++; runEnd = y; } else { if (run >= 5) vanTrunks.push(`${x},${runEnd}`); run = 0; }
        }
      }
      const vanSet = new Set(vanTrunks);
      const vanColSet = new Set(vanTrunks.map(t => +t.split(',')[0]));
      const ourCols = new Set(ourTrees.map(t => +t.split(',')[0]));
      const samePos = [...ourSet].filter(k => vanSet.has(k)).length;
      let sameCol = 0, near = 0;
      for (const x of ourCols) {
        if (vanColSet.has(x)) sameCol++;
        else {
          let n = false;
          for (let d = -4; d <= 4; d++) if (d !== 0 && vanColSet.has(x + d)) { n = true; break; }
          if (n) near++;
        }
      }
      let palmpalm = 0;
      for (let x = 0; x < W; x++) { let has = false; for (let y = 0; y < H; y++) { const i = y * W + x; if (st.flags[i] && SHEET[st.type[i]] === 323) { has = true; break; } } if (has) palmpalm++; }
      console.log(`[${label}] 干列树=${ourSet.size}（vanilla 干列=${vanSet.size}）同坐标=${samePos} 同列=${sameCol} 邻近±4=${near} 棕榈列=${palmpalm}（vanilla≈${new Set([...vanPalms].map(c => +c.split(',')[0])).size}）`);
      const missCols = [...vanColSet].filter(x => !ourCols.has(x));
      const extraCols = [...ourCols].filter(x => !vanColSet.has(x));
      console.log(`   vanilla 独有列=${missCols.length} 样本: ${missCols.slice(0, 15).join(',')}`);
      console.log(`   我们独有列=${extraCols.length} 样本: ${extraCols.slice(0, 15).join(',')}`);
      if (label.startsWith('A')) {
        // 归因：vanilla 成树而重放未成的干位，跑一遍我们的门——报首个拒绝门 + 半砖/坡面
        const FITS = new Set([2, 23, 60, 70, 109, 147, 199, 477, 492, 633, 661, 662]);
        const WALLS = new Set([0, 150, 138, 145, 107, 152, 140, 139, 141, 106, 245, 315, 317, 63, 64, 65, 66, 67, 68, 69, 81, 70, 264, 268, 265, 74, 80]);
        const DECOR = new Set([3, 24, 32, 61, 62, 69, 71, 73, 74, 82, 83, 84, 110, 113, 184, 201, 233, 352, 485, 529, 530, 637, 655]);
        const gate = (x: number, y: number): string => {
          const i = y * W + x;
          if (!d81.act[i]) return 'inactive-base';
          if (!FITS.has(d81.typ[i])) return `base-type-${d81.typ[i]}`;
          if (st.half[i]) return `base-half`;
          if (st.slope[i] !== 0) return `base-slope${st.slope[i]}`;
          const wv = wal[i - W];
          if (!WALLS.has(wv)) return `wall-${wv}`;
          const l = liq[i - W]; if (l > 0) return 'liquid';
          const sideOk = (dx: number) => { const si = (y) * W + x + dx; return d81.act[si] === 1 && FITS.has(d81.typ[si]); };
          if (!sideOk(-1) && !sideOk(1)) return 'side-fit';
          return 'box/liquid-above(rng)';
        };
        const vanTrunkMap = new Map<number, number>();
        for (const t of vanTrunks) { const [x, y] = t.split(',').map(Number); vanTrunkMap.set(x, y); }
        const reasons = new Map<string, number>();
        for (const x of missCols) {
          const yb = vanTrunkMap.get(x)!;
          const r = gate(x, yb + 1); // yBase=干底行, 基座在其下一行
          reasons.set(r, (reasons.get(r) ?? 0) + 1);
        }
        console.log('   [miss 归因]', [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
      }
    }
  });
});
