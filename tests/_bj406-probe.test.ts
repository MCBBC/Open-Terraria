// BJ406 一次性定谳探针（临时,勿提交）：腐化环境门在位性
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { housingCheckAt, quickFindHome } from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';

function buildHouse(w: World, ox: number, oy: number): void {
  const st = w.store;
  for (let x = ox; x <= ox + 10; x++) {
    st.setTileSilent(x, oy, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(x, oy + 5, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) {
    st.setTileSilent(ox, y, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(ox + 10, y, TILE_BY_KEY['wood']!, 0, 0);
  }
  for (let y = oy; y <= oy + 5; y++) for (let x = ox; x <= ox + 10; x++) st.wall[st.idx(x, y)] = 4;
  for (let y = oy; y <= oy + 5; y++) for (let x = ox + 1; x <= ox + 9; x++) st.wall[st.idx(x, y)] = 4;
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

function corruptRing(w: World, ox: number, oy: number, count: number, tkey: string): void {
  const st = w.store;
  // 在房间下方/右侧 60 格外圈铺 corrupt tile（不接触房间边界格）
  let placed = 0;
  for (let y = oy + 7; y <= oy + 16 && placed < count; y++) {
    for (let x = ox; x <= ox + 10 && placed < count; x++) {
      st.setTileSilent(x, y, TILE_BY_KEY[tkey]!, 0, 0);
      placed++;
    }
  }
}

describe('BJ406 probe', () => {
  it('clean house → ok', () => {
    const w = new World(4200, 1200, 91, 'open');
    buildHouse(w, 2000, 300);
    const q = housingCheckAt(w.store, [], 2005, 303);
    console.log('clean:', q.reason, q.score);
    expect(q.reason).toBe('ok');
  });
  it('60 ebonstone ring → evil', () => {
    const w = new World(4200, 1200, 92, 'open');
    buildHouse(w, 2000, 300);
    corruptRing(w, 2000, 300, 60, 'v_25_ebonstone_block');
    const q = housingCheckAt(w.store, [], 2005, 303);
    console.log('60-evil:', q.reason, q.score);
    expect(q.reason).toBe('evil');
  });
  it('49 ebonstone ring → ok (below threshold)', () => {
    const w = new World(4200, 1200, 93, 'open');
    buildHouse(w, 2000, 300);
    corruptRing(w, 2000, 300, 49, 'v_25_ebonstone_block');
    const q = housingCheckAt(w.store, [], 2005, 303);
    console.log('49-evil:', q.reason, q.score);
    expect(q.reason).toBe('ok');
  });
  it('quickFindHome in corruption → home null', () => {
    const w = new World(4200, 1200, 94, 'open');
    buildHouse(w, 2000, 300);
    const r1 = quickFindHome(w.store, [], 2005, 304, 22);
    console.log('qfh clean:', r1.home);
    expect(r1.home).not.toBeNull();
    corruptRing(w, 2000, 300, 80, 'v_23_corrupt_grass_block');
    const r2 = quickFindHome(w.store, [], 2005, 304, 22);
    console.log('qfh corrupt:', r2.home);
    expect(r2.home).toBeNull();
  });
});
