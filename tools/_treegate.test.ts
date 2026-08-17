// 树木数量大额差异专项 · 归因探针（2026-08-17）
// 在「向日葵」pass 末态（= Trees pass 输入，已验证与原版 081 dump 四数组一致）上，
// 对每个潜在树基座格分别用【我们 TreePass 现行谓词】vs【原版 1456 谓词】评估
// GrowTree 全部门（液体/基座/墙/侧格/净空盒），统计各门的通过率差——定位数量差根因。
// 高度固定 h=10（净空盒 14；丛林草 +5）消除 RNG 高度差，只比谓词。
// 跑法：npx vitest run tools/_treegate.test.ts
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { idsByVanillaSheet } from '../src/world/gen/vanilla/TileRunner';
import { TILE_DEFS } from '../src/data/tiles';
import type { World } from '../src/world/World';

/** 内部 id → 原版 sheet id（墙 id 本就是原版空间，直接用裸表） */
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const vanOf = (internal: number) => (internal >= 0 && internal < SHEET.length ? SHEET[internal] : -1);

const PLANTS = idsByVanillaSheet(20);
const FIT_OURS = idsByVanillaSheet(2, 23, 60, 70, 109, 147, 199, 477, 492);            // TreePass.ts 现行 9 项
const FIT_VAN = idsByVanillaSheet(2, 23, 60, 70, 109, 147, 199, 477, 492, 633, 661, 662); // 1456 cs:29852 12 项
const WALLS_OURS = new Set([0, 80, 106, 107, 138, 139, 140, 141, 145, 150, 152]);                 // 1405 旧表 11 项（st.wall 是原版 id）
const WALLS_VAN = new Set([0, 150, 138, 145, 107, 152, 140, 139, 141, 106, 245, 315, 317, 63, 64, 65, 66, 67, 68, 69, 81, 70, 264, 268, 265, 74, 80]); // AllowsPlantsToGrow
/** EmptyTileCheck ignoreID=20 容忍集（1456 cs:31611）：CommonSapling{20,590,595,615} ∪ 装饰表 */
const IGNORE_VAN = idsByVanillaSheet(20, 590, 595, 615, 3, 24, 32, 61, 62, 69, 71, 73, 74, 82, 83, 84, 110, 113, 184, 201, 233, 352, 485, 529, 530, 637, 655);
const JUNGLE = idsByVanillaSheet(60);

interface Ctx { st: World['store']; surface: number }

function boxClear(ctx: Ctx, x: number, j: number, h: number, ignore: Set<number> | null): { ok: boolean; blocker: number } {
  const { st } = ctx;
  const clear = h + 4 + (JUNGLE.has(st.type[st.idx(x, j)]) ? 5 : 0);
  const x0 = x - 2, x1 = x + 2, y0 = j - clear, y1 = j - 1;
  if (x0 < 0 || x1 >= st.w || y0 < 0 || y1 >= st.h) return { ok: false, blocker: -2 };
  for (let xx = x0; xx <= x1; xx++) for (let yy = y0; yy <= y1; yy++) {
    const i = st.idx(xx, yy);
    if (!st.flags[i]) continue;
    if (ignore && ignore.has(st.type[i])) continue;
    return { ok: false, blocker: vanOf(st.type[i]) };
  }
  return { ok: true, blocker: 0 };
}

describe('GrowTree 门谓词归因（9293480 evil=0 4200×1200）', { timeout: 300_000 }, () => {
  it('逐门通过率对比', async () => {
    let pre: World | null = null;
    await generateWorld({
      seedText: '9293480', width: 4200, height: 1200, evil: 0,
      onWorldPartial: (w, _i, name) => { if (name === '向日葵') pre = w; },
    });
    const st = pre!.store;
    const worldSurface = Math.floor((pre as unknown as { worldSurface: number }).worldSurface ?? 250);
    const ctx: Ctx = { st, surface: worldSurface };

    // 候选 = AddTrees 会把 GrowTree 带到 nactive+fit 门的所有格（含非表面格，
    // 但液体/基座门会滤掉绝大多数；我们只在「基座门通过」集合上统计下游门）
    let cand = 0;                     // 基座门通过（两边相同）
    let liq = 0;
    const wallOurs = { pass: 0, fail: 0 }, wallVan = { pass: 0, fail: 0 };
    const sideOurs = { pass: 0, fail: 0 }, sideVan = { pass: 0, fail: 0 };
    const boxOurs = { pass: 0, fail: 0 }, boxVan = { pass: 0, fail: 0 };
    const allOurs = { pass: 0 }, allVan = { pass: 0 };
    const boxBlockersOurs = new Map<number, number>(), boxBlockersVan = new Map<number, number>();
    const wallFailIds = new Map<number, number>(), sideFailShape = { half: 0, slope: 0 };

    for (let x = 1; x < st.w - 1; x++) {
      for (let y = 20; y < worldSurface; y++) {
        // GrowTree 头：越 plants（pass82 表面无 20，等价直落）
        let j = y;
        while (st.inBounds(x, j) && st.flags[st.idx(x, j)] && PLANTS.has(st.type[st.idx(x, j)])) j++;
        const i = st.idx(x, j);
        if (!st.flags[i]) continue;
        if (!(!st.half[i] && st.slope[i] === 0)) continue;       // nactive+整砖（两边同）
        const fitOurs = FIT_OURS.has(st.type[i]), fitVan = FIT_VAN.has(st.type[i]);
        if (!fitOurs && !fitVan) continue;
        // 液体门（两边同）
        if (st.liquid[st.idx(x - 1, j - 1)] > 0 || st.liquid[st.idx(x, j - 1)] > 0 || st.liquid[st.idx(x + 1, j - 1)] > 0) { liq++; continue; }
        cand++;

        const w = st.wall[st.idx(x, j - 1)];
        const wOKo = WALLS_OURS.has(w), wOKv = WALLS_VAN.has(w);
        wOKo ? wallOurs.pass++ : wallOurs.fail++;
        wOKv ? wallVan.pass++ : wallVan.fail++;
        if (!wOKv && wOKo) wallFailIds.set(w, (wallFailIds.get(w) ?? 0) + 1);

        const sideOK = (dx: number, fit: Set<number>, strict: boolean) => {
          if (!st.inBounds(x + dx, j)) return false;
          const si = st.idx(x + dx, j);
          if (!st.flags[si] || !fit.has(st.type[si])) return false;
          if (strict && (st.half[si] || st.slope[si] !== 0)) return false;
          return true;
        };
        const sOKo = sideOK(-1, FIT_OURS, true) || sideOK(1, FIT_OURS, true);
        const sOKv = sideOK(-1, FIT_VAN, false) || sideOK(1, FIT_VAN, false);
        sOKo ? sideOurs.pass++ : sideOurs.fail++;
        sOKv ? sideVan.pass++ : sideVan.fail++;
        if (sOKv && !sOKo) {
          for (const dx of [-1, 1]) {
            const si = st.idx(x + dx, j);
            if (st.flags[si] && FIT_VAN.has(st.type[si])) { if (st.half[si]) sideFailShape.half++; else if (st.slope[si] !== 0) sideFailShape.slope++; }
          }
        }

        const bo = boxClear(ctx, x, j, 10, null);
        const bv = boxClear(ctx, x, j, 10, IGNORE_VAN);
        bo.ok ? boxOurs.pass++ : (boxOurs.fail++, boxBlockersOurs.set(bo.blocker, (boxBlockersOurs.get(bo.blocker) ?? 0) + 1));
        bv.ok ? boxVan.pass++ : (boxVan.fail++, boxBlockersVan.set(bv.blocker, (boxBlockersVan.get(bv.blocker) ?? 0) + 1));

        if (wOKo && sOKo && bo.ok) allOurs.pass++;
        if (wOKv && sOKv && bv.ok) allVan.pass++;
      }
    }

    const mkSheet = (m: Map<number, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`候选基座格(基座门+液体门通过)=${cand}（液体拒绝另 ${liq}）`);
    console.log(`墙门: ours通过=${wallOurs.pass} vanilla通过=${wallVan.pass}（ ours多拒 ${wallOurs.fail - wallVan.fail}——墙id分布 ${mkSheet(wallFailIds)}）`);
    console.log(`侧格门: ours=${sideOurs.pass} vanilla=${sideVan.pass}（ours多拒 ${sideVan.pass - sideOurs.pass}，其中半砖 ${sideFailShape.half} 坡面 ${sideFailShape.slope} 计数含双邻）`);
    console.log(`净空盒(h=10): ours=${boxOurs.pass} vanilla=${boxVan.pass}（ours多拒 ${boxVan.pass - boxOurs.pass}）`);
    console.log(`  ours盒挡路tile: ${mkSheet(boxBlockersOurs)}`);
    console.log(`  van 盒挡路tile: ${mkSheet(boxBlockersVan)}`);
    console.log(`全门连乘: ours=${allOurs.pass} vanilla=${allVan.pass} → 谓词差致缺 ${(allVan.pass / Math.max(1, allOurs.pass)).toFixed(2)}x`);
  });
});
