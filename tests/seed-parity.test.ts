// 种子等价 diff（L2 工具）：我们 generateWorld(同种子+同 evil) 的网格
// ↔ 原版 1.4.5.6 金标 .wld 逐格对比。
// 当前处于 L1 迭代期：本测试只断言工具链自洽（维度一致），
// 差异数值以 console 报告输出（按 tile 对/区域/深度归因），随 L1 收敛逐步转硬断言。
// 跑全 5 金标：SEED_PARITY_ALL=1 npx vitest run tests/seed-parity.test.ts
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { GOLDEN_WORLDS, loadGolden } from './golden-wld-meta.test';

/** 内部 tile id → 原版 tile id（TILE_DEFS[].vanilla.sheet 即原版 tile id） */
const V_ID = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sheet = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sheet === 'number') V_ID[i] = sheet;
}

interface DiffReport {
  cells: number;
  typeMismatch: number;
  wallMismatch: number;
  liquidMismatch: number;
  topTypePairs: Array<[string, number]>;
  byXBand: Array<{ band: number; mismatch: number }>;
  byYBand: Array<{ band: string; mismatch: number }>;
  surface: { exactCols: number; meanAbsDy: number; firstDx: number; corr: number };
  sample: Array<{ x: number; y: number; ours: string; golden: string }>;
}

function diffSeed(seedText: string, evil: 0 | 1, file: string): DiffReport {
  const g = loadGolden(file);
  const gt = g.tiles;
  return generateWorld({ width: 4200, height: 1200, seedText, evil }).then((world) => {
    const st = world.store;
    const n = gt.type.length;
    let typeMismatch = 0, wallMismatch = 0, liquidMismatch = 0;
    const pairs = new Map<string, number>();
    const xBand = new Float64Array(21); // 每 200 列一段
    const yBands = ['天空0-90', '表层90-300', '洞穴300-600', '深层600-900', '地狱900+'].map((band) => ({ band, mismatch: 0 }));
    const sample: DiffReport['sample'] = [];
    for (let i = 0; i < n; i++) {
      // --- tile type ---
      const ourType = st.flags[i] ? V_ID[st.type[i]] ?? -2 : 0;
      const goldenType = gt.active[i] ? gt.type[i] : 0;
      const y = (i / 4200) | 0;
      const x = i % 4200;
      let mismatch = false;
      if (ourType !== goldenType) {
        typeMismatch++;
        mismatch = true;
        const key = `${ourType < 0 ? `OURS(${st.type[i]})` : ourType}→${goldenType}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
        if (sample.length < 8) sample.push({ x, y, ours: key.split('→')[0], golden: String(goldenType) });
      }
      // --- wall ---
      if (st.wall[i] !== gt.wall[i]) { wallMismatch++; mismatch = true; }
      // --- liquid（类型+有无；液量有沉降时序差异，先比类型格数） ---
      const ourL = st.liquid[i] > 0 ? st.liquidType[i] : 0;
      const goldenL = gt.liquid[i] > 0 ? gt.liquidType[i] : 0;
      if (ourL !== goldenL) { liquidMismatch++; mismatch = true; }
      if (mismatch) {
        xBand[Math.min(20, (x / 200) | 0)]++;
        yBands[y < 90 ? 0 : y < 300 ? 1 : y < 600 ? 2 : y < 900 ? 3 : 4].mismatch++;
      }
    }
    const topTypePairs = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24)
      .map(([k, v]) => [k, v] as [string, number]);
    // 地表剖面诊断：每列首个活性格 y 对比（判断分歧是否从 TerrainPass 开始）
    let exactCols = 0, sumDy = 0, firstDx = -1;
    let sxy = 0, sx = 0, sy = 0, sxx = 0, syy = 0;
    const W = 4200;
    for (let x = 0; x < W; x++) {
      let oy = -1, gy = -1;
      for (let y = 0; y < 1200; y++) {
        const i = y * W + x;
        if (oy < 0 && st.flags[i]) oy = y;
        if (gy < 0 && gt.active[i]) gy = y;
        if (oy >= 0 && gy >= 0) break;
      }
      const dy = Math.abs(oy - gy);
      sumDy += dy;
      if (dy === 0) exactCols++;
      else if (firstDx < 0) firstDx = x;
      sxy += oy * gy; sx += oy; sy += gy; sxx += oy * oy; syy += gy * gy;
    }
    const corr = (W * sxy - sx * sy) / Math.sqrt((W * sxx - sx * sx) * (W * syy - sy * sy));
    return {
      cells: n,
      typeMismatch, wallMismatch, liquidMismatch,
      topTypePairs,
      byXBand: [...xBand].map((m, band) => ({ band, mismatch: m })),
      byYBand: yBands,
      surface: { exactCols, meanAbsDy: sumDy / W, firstDx, corr },
      sample,
    };
  }) as unknown as DiffReport;
}

const RUN_ALL = !!process.env.SEED_PARITY_ALL;
const targets = RUN_ALL ? GOLDEN_WORLDS : GOLDEN_WORLDS.filter((g) => g.seedText === '9293480');

describe('种子等价 diff（L1 迭代期报告）', () => {
  for (const g of targets) {
    it(`种子 ${g.seedText} vs 金标`, async () => {
      const r = await diffSeed(g.seedText, g.evil, g.file);
      const pct = (v: number) => `${((v / r.cells) * 100).toFixed(2)}%`;
      console.log(`\n=== 种子 ${g.seedText}（${g.evil ? '猩红' : '腐化'}）===`);
      console.log(`tile 差异: ${r.typeMismatch} (${pct(r.typeMismatch)})  wall: ${r.wallMismatch} (${pct(r.wallMismatch)})  liquid: ${r.liquidMismatch} (${pct(r.liquidMismatch)})`);
      console.log('tile 对 TOP:', r.topTypePairs.map(([k, v]) => `${k}×${v}`).join('  '));
      console.log('X 段(200列):', r.byXBand.map((b) => b.mismatch).join(','));
      console.log('深度段:', r.byYBand.map((b) => `${b.band}:${b.mismatch}`).join('  '));
      console.log(`地表剖面: 完全一致列 ${r.surface.exactCols}/4200, 平均|Δy|=${r.surface.meanAbsDy.toFixed(2)}, 首个分歧列 x=${r.surface.firstDx}, 相关系数=${r.surface.corr.toFixed(4)}`);
      console.log('样本(x,y, ours→golden):', r.sample.map((s) => `(${s.x},${s.y}) ${s.ours}→${s.golden}`).join('  '));
      // 工具链自洽断言（L1 收敛后把差异数转硬断言）
      expect(r.cells).toBe(4200 * 1200);
      expect(r.typeMismatch).toBeLessThan(r.cells); // 有意义的差异报告而非全错
    }, 600000);
  }
});
