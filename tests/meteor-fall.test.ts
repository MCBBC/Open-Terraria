// 陨石坠落 1:1 测试（WorldGen.dropMeteor :6196-6316 / meteor :6318-6508 对照）
//   合成世界：平地石头地表 + 玩家远离。验证：
//   1) 落点产生陨石块 + 空腔（主体内部有空气格）
//   2) 玩家保护区（±1022/±639px）命中 → 该列作废（落点不在玩家附近）
//   3) 上限：地表以上 37 块 > 400×w/4200 → null
//   4) 云块打分 −100（落点避开浮岛云层列）
import { describe, it, expect } from 'vitest';
import { dropMeteor, type MeteorHost } from '../src/world/MeteorFall';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import type { RNG } from '../src/core/rng';

function makeHost(over: Partial<MeteorHost> & { seedW?: number; seedH?: number } = {}): MeteorHost {
  const W = over.seedW ?? 420, H = over.seedH ?? 200;
  const st = new TileStore(W, H);
  const DIRT = TILE_BY_KEY['dirt'] ?? 1, STONE = TILE_BY_KEY['stone'] ?? 1;
  for (let x = 0; x < W; x++) {
    for (let y = 90; y < H; y++) st.setTileSilent(x, y, y < 110 ? DIRT : STONE);
  }
  let s = 42;
  const rngLike = {
    rand: () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff,
    int: (a: number, b: number) => a + Math.floor((s = (s * 1103515245 + 12345) & 0x7fffffff) % (b - a + 1)),
  } as Pick<RNG, 'rand' | 'int'>;
  return {
    w: W, h: H, spawnX: Math.floor(W / 2), groundLevel: 85, rockLevel: 140, store: st,
    players: [{ x: 10 * 16, y: 80 * 16, w: 20, h: 42 }],   // 左上远离多数落点
    npcs: [], rand: rngLike.rand, int: rngLike.int,
    announce: () => {},
    ...over,
  } as MeteorHost;
}

const METEOR = () => TILE_BY_KEY['ore_meteorite'] ?? -1;

describe('陨石坠落（WorldGen.dropMeteor/meteor 1:1）', () => {
  it('落点产生陨石块主体 + 内部空腔（五层独立循环语义）', () => {
    const h = makeHost();
    const spot = dropMeteor(h);
    expect(spot).not.toBeNull();
    const st = h.store;
    let ore = 0, hollow = 0;
    const R = 45;
    for (let y = spot!.j - R; y <= spot!.j + R; y++) {
      for (let x = spot!.i - R; x <= spot!.i + R; x++) {
        if (st.type[st.idx(x, y)] === METEOR() && st.flags[st.idx(x, y)]) ore++;
        if (st.type[st.idx(x, y)] === 0 && Math.hypot(x - spot!.i, y - spot!.j) < 10) hollow++;
      }
    }
    expect(ore).toBeGreaterThan(100);       // 主体规模（r1≈17-22 半径球壳）
    expect(hollow).toBeGreaterThan(0);      // 空腔（②层在主体后雕刻——单遍合并会丢失）
    expect(hollow).toBeLessThan(360);       // 但不是全挖空
  });

  it('玩家保护区：玩家盒覆盖全部候选列 → null（w=420 场景）', () => {
    const h = makeHost();   // 420 宽,spawnX=210,候选列 [150,270] 扣 spawn±33.6
    h.players = [{ x: 210 * 16, y: 80 * 16, w: 20, h: 42 }];  // ±1022px=±64 格全盖
    expect(dropMeteor(h)).toBeNull();
  });

  it('落点必远离玩家盒 ±1022/±639px', () => {
    const h = makeHost();
    h.players = [{ x: 330 * 16, y: 80 * 16, w: 20, h: 42 }];  // 右侧 1/3 处
    const spot = dropMeteor(h);
    if (spot) {
      const cx = 330 * 16 + 10, cy = 80 * 16 + 21;
      const mx = spot.i * 16, my = spot.j * 16;
      const overlap = !(cx - 1022 > mx + 35 * 16 || cx + 1022 < mx - 35 * 16
        || cy - 639 > my + 35 * 16 || cy + 639 < my - 35 * 16);
      expect(overlap).toBe(false);
    }
  });

  it('上限：地表以上陨石块超 400×w/4200 → 拒绝', () => {
    const h = makeHost({ seedW: 420, seedH: 200 });
    const cap = Math.floor(400 * 420 / 4200);   // 40
    for (let n = 0, x = 5; x < 415 && n < cap + 1; x++) {
      for (let y = 5; y < 85 && n < cap + 1; y++) {
        h.store.setTileSilent(x, y, METEOR()); n++;
      }
    }
    expect(dropMeteor(h)).toBeNull();
  });

  it('云块列打分 −100：云岛上不落（打分远低于阈值,最后要么落别处要么 null）', () => {
    const h = makeHost({ seedW: 240, seedH: 200 });
    // 全图唯一实心面 = 高空云层（sheet 189 云）→ 地表无其他实心,落点只能打云
    const CLOUD = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 189);
    if (CLOUD < 0) return; // 云块未定义则跳过（数据集依赖）
    const st = h.store;
    for (let x = 0; x < 240; x++) for (let y = 90; y < 200; y++) st.setTileSilent(x, y, 0);
    for (let x = 0; x < 240; x++) for (let y = 30; y < 45; y++) st.setTileSilent(x, y, CLOUD);
    // 玩家挪走避保护；列首实心=云（solid+1 再 −100 → 大幅负分 < 阈值）
    h.players = [{ x: -5000, y: -5000, w: 20, h: 42 }];
    expect(dropMeteor(h)).toBeNull();
  });
});
