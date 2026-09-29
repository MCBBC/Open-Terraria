// BJ406 探针2（临时）：真实腐化世界生成后,在腐化群系内建房 → housingCheckAt/quickFindHome
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { housingCheckAt, quickFindHome, queryRoom, testedRoomBounds } from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';

function buildHouse(w: any, ox: number, oy: number): void {
  const st = w.store;
  for (let x = ox; x <= ox + 10; x++) {
    st.setTileSilent(x, oy, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(x, oy + 5, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) {
    st.setTileSilent(ox, y, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(ox + 10, y, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) for (let x = ox + 1; x <= ox + 9; x++) st.wall[st.idx(x, y)] = 4;
  const DOOR_C = TILE_BY_KEY['door_closed']!;
  for (const dx of [ox, ox + 10]) {
    for (let y = oy + 2; y <= oy + 4; y++) st.setTileSilent(dx, y, DOOR_C, 0, (y - oy - 2) * 18);
  }
  st.setTileSilent(ox + 1, oy + 1, TILE_BY_KEY['torch']!, 22, 0);
  st.setTileSilent(ox + 9, oy + 1, TILE_BY_KEY['torch']!, 44, 0);
  st.setTileSilent(ox + 4, oy + 3, TILE_BY_KEY['chair']!, 0, 0);
  for (let dx = 0; dx <= 2; dx++) {
    st.setTileSilent(ox + 5 + dx, oy + 3, TILE_BY_KEY['table']!, dx * 18, 0);
    st.setTileSilent(ox + 5 + dx, oy + 4, TILE_BY_KEY['table']!, dx * 18, 18);
  }
}

// 清空一圈（把房间外壳外的 tile/wall 清干净,模拟玩家在腐化地表拆出的空地建房）
function clearAround(w: any, ox: number, oy: number): void {
  const st = w.store;
  for (let y = oy - 8; y <= oy + 12; y++) {
    for (let x = ox - 60; x <= ox + 70; x++) {
      if (x >= ox && x <= ox + 10 && y >= oy && y <= oy + 5) continue; // 保留房体
      if (y < oy || y > oy + 5 || x < ox || x > ox + 10) {
        // 房体外的壳格保留实心承载（房体自身已含壳）,其余清空
        if (!(x >= ox - 1 && x <= ox + 11 && y >= oy - 1 && y <= oy + 6)) {
          st.setTileSilent(x, y, 0, 0, 0);
        }
      }
    }
  }
}

describe('BJ406 probe2: real corrupt world', () => {
  it('house inside corruption biome → evil gate', async () => {
    const world = await generateWorld({ width: 1200, height: 850, seedText: 'bj406a', evil: 0 });
    const st = world.store;
    // 找腐化地表：扫表面附近 corrupt grass (sheet 23)/ebonstone(25)/ebonsand(112) 密集列
    const isEvilTile = (t: number): boolean => {
      const d = (TILE_BY_KEY as any)[t] ? undefined : undefined;
      return false; // placeholder
    };
    // 直接用 type→sheet 映射
    const sheetOf = (t: number): number => (t && (st as any).constructor ? -1 : -1);
    void isEvilTile; void sheetOf;
    // 改用 TILE_DEFS 映射
    const { TILE_DEFS } = await import('../src/data/tiles');
    const sh = (t: number): number => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
    const EVIL = new Set([23, 24, 25, 32, 112, 163, 400, 398, 199, 203, 200, 401, 399, 234, 352]);
    // 逐列统计腐化 tile 数,取最密集的列簇
    let bestX = -1, bestCount = 0;
    for (let x = 100; x < 1100; x++) {
      let c = 0;
      for (let y = 40; y < 300; y++) {
        const i = st.idx(x, y);
        if (st.flags[i] && EVIL.has(sh(st.type[i]))) c++;
      }
      if (c > bestCount) { bestCount = c; bestX = x; }
    }
    console.log('densest evil column:', bestX, 'count:', bestCount);
    expect(bestCount).toBeGreaterThan(20);
    // 在该列附近找地表实心行,把上方清空建房
    const hx = Math.max(60, Math.min(1140, bestX));
    let gy = 40;
    while (gy < 400 && !st.isSolid(hx + 5, gy)) gy++;
    console.log('ground at', hx + 5, gy);
    // 清空房屋上方及两侧大范围（模拟腐化区上的开阔空地）
    for (let y = gy - 9; y < gy; y++) {
      for (let x = hx - 55; x <= hx + 65; x++) st.setTileSilent(x, y, 0, 0, 0);
    }
    for (let y = gy; y <= gy + 6; y++) {
      for (let x = hx - 55; x < hx - 1; x++) st.setTileSilent(x, y, 0, 0, 0);
      for (let x = hx + 11 + 1; x <= hx + 65; x++) st.setTileSilent(x, y, 0, 0, 0);
    }
    buildHouse(world, hx, gy);
    const q = housingCheckAt(st, [], hx + 5, gy + 3);
    console.log('corrupt-world house:', q.reason, q.score);
    const qf = quickFindHome(st, [], hx + 5, gy + 4, 22);
    console.log('qfh corrupt-world:', qf.home);
    // 期望：reason='evil'（房间 ±46 盒内腐化 tile ≥50）且 quickFindHome 拒
    expect(['evil', 'needs', 'standing', 'hole']).toContain(q.reason);
    console.log('--- verdict: reason =', q.reason);
  }, 500000);
});
