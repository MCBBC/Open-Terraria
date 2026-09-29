// BJ406 探针3（临时）：真实腐化世界,把房间直接嵌进腐化地层（不清腐化）
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { housingCheckAt, quickFindHome, scoreRoom, queryRoom, testedRoomBounds } from '../src/world/Housing';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import type { Room } from '../src/world/Housing';

describe('BJ406 probe3: real corrupt biome, room carved in', () => {
  it('gate verdict', async () => {
    const world = await generateWorld({ width: 1200, height: 850, seedText: 'bj406a', evil: 0 });
    const st = world.store;
    const sh = (t: number): number => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
    const EVIL = new Set([23, 24, 25, 32, 112, 163, 400, 398, 199, 203, 200, 401, 399, 234, 352]);
    // 找最深腐化列
    let bestX = -1, bestCount = 0;
    for (let x = 100; x < 1100; x++) {
      let c = 0;
      for (let y = 100; y < 400; y++) {
        const i = st.idx(x, y);
        if (st.flags[i] && EVIL.has(sh(st.type[i]))) c++;
      }
      if (c > bestCount) { bestCount = c; bestX = x; }
    }
    // 房间嵌进腐化层：室内 10 宽×8 高,取 bestX 右侧实心区
    const ox = bestX + 5, oy = 220;
    // 确保外壳是实心（若非实心,跳过此点继续找实心行）
    let gy = -1;
    for (let y = 150; y < 400; y++) {
      let solidOk = true;
      for (let x = ox - 1; x <= ox + 11; x++) {
        if (!(st.isSolid(x, y - 1) && st.isSolid(x, y + 8))) { solidOk = false; break; }
      }
      for (let y2 = y; y2 <= y + 7 && solidOk; y2++) {
        if (!(st.isSolid(ox - 1, y2) && st.isSolid(ox + 11, y2))) solidOk = false;
      }
      if (solidOk) { gy = y; break; }
    }
    console.log('embed at', ox, gy, 'evil col:', bestX, bestCount);
    expect(gy).toBeGreaterThan(0);
    // 清室内 + 铺背景墙（玩家建房同款）
    for (let y = gy; y <= gy + 7; y++) for (let x = ox; x <= ox + 10; x++) {
      st.setTileSilent(x, y, 0, 0, 0);
      st.wall[st.idx(x, y)] = 4;
    }
    // 家具:平台门(19)当门,桌/椅/火把
    for (let x = ox + 2; x <= ox + 8; x++) st.setTileSilent(x, gy + 7, TILE_BY_KEY['wood_platform']!, 0, 0);
    st.setTileSilent(ox + 1, gy + 1, TILE_BY_KEY['torch']!, 22, 0);
    st.setTileSilent(ox + 3, gy + 6, TILE_BY_KEY['chair']!, 0, 0);
    for (let dx = 0; dx <= 2; dx++) {
      st.setTileSilent(ox + 5 + dx, gy + 6, TILE_BY_KEY['table']!, dx * 18, 0);
      st.setTileSilent(ox + 5 + dx, gy + 7, TILE_BY_KEY['table']!, dx * 18, 18);
    }
    // 泛洪确认
    const q = queryRoom(st, ox + 1, gy + 1, { ignoreNeeds: true });
    console.log('flood:', q.room ? q.room.tiles.size : null, q.reason);
    if (q.room) {
      // 数邪恶度
      let rx1 = st.w, rx2 = 0, ry1 = st.h, ry2 = 0;
      for (const i of q.room.tiles) {
        const x = i % st.w, y = (i / st.w) | 0;
        if (x < rx1) rx1 = x; if (x > rx2) rx2 = x; if (y < ry1) ry1 = y; if (y > ry2) ry2 = y;
      }
      const b = testedRoomBounds(st, rx1, rx2, ry1, ry2);
      let evil = 0;
      for (let y = b.y0 + 2; y <= b.y1 + 1; y++) for (let x = b.x0 + 1; x <= b.x1 - 1; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] && EVIL.has(sh(st.type[i]))) evil++;
      }
      console.log('box evil tiles:', evil, 'bounds:', b);
      const room: Room = { standX: ox + 1, standY: gy + 6, tiles: q.room.tiles };
      const s = scoreRoom(st, room, []);
      console.log('scoreRoom:', s.score, 'roomEvil:', s.roomEvil, 'standing:', s.hasStandingSpace);
    }
    const hc = housingCheckAt(st, [], ox + 1, gy + 1);
    console.log('housingCheckAt:', hc.reason, hc.score);
    const qf = quickFindHome(st, [], ox + 5, gy + 8, 22);
    console.log('qfh:', qf.home);
    expect(hc.reason).toBe('evil');
    expect(qf.home).toBeNull();
  }, 500000);
});
