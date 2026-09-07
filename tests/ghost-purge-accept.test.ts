// ★幽灵净化战役验收(2026-09-07 方案B):读档/生成边界净化,全面对齐原版
//  ——①旧档(v5 差分)迁移:差分还原 flags=0 → 净化清 type(正常迁移)
//  ②正常格/wall/liquid/wire 零损伤 ③致动格(flags=1+wire bit5)不受净化影响
//  ④导出→导入:净化后源无幽灵,回读亦无(三分类渲染面一致)
import { describe, it, expect } from 'vitest';
import { rlePairs, bytesToB64, rleTiles, loadSaveData, type SaveData } from '../src/save/SaveFile';
import { TileStore } from '../src/world/TileStore';
import { TILE_STABLE_OF_INTERNAL } from '../src/data/tiles';

const W = 40, H = 30, N = W * H;

/** 构造带幽灵差分的 v5 存档(模拟旧档) */
function mkSaveWithGhosts(): SaveData {
  const st = new TileStore(W, H);
  st.onTileChanged = () => {};
  // 正常活格:石头墙三排(y=10..12)
  for (let y = 10; y <= 12; y++) for (let x = 5; x < 35; x++) {
    const i = y * W + x;
    st.type[i] = TILE_STABLE_OF_INTERNAL[TILE_BY_KEY_STONE];
    st.flags[i] = 1;
    st.frameX[i] = 18; st.frameY[i] = 0;
  }
  // 致动格(y=15):flags=1+wire bit5(玩家致动的隐藏层)
  for (let x = 5; x < 15; x++) {
    const i = 15 * W + x;
    st.type[i] = TILE_STABLE_OF_INTERNAL[TILE_BY_KEY_STONE];
    st.flags[i] = 1;
    st.wire[i] = 0x20;   // bit5 已致动
    st.frameX[i] = 18;
  }
  // 幽灵格(y=20):flags=0+type≠0(带 wall/liquid 保真项)
  for (let x = 5; x < 25; x++) {
    const i = 20 * W + x;
    st.type[i] = TILE_STABLE_OF_INTERNAL[TILE_BY_KEY_STONE];
    st.flags[i] = 0;              // 幽灵
    st.wall[i] = 63;              // 石墙(flag 外通道,净化必须保留)
    st.frameX[i] = 18; st.frameY[i] = 0;
  }
  // 幽灵湿格(y=25):flags=0+type≠0+liquid(幽灵湿格,g#98 族)
  for (let x = 5; x < 15; x++) {
    const i = 25 * W + x;
    st.type[i] = TILE_STABLE_OF_INTERNAL[TILE_BY_KEY_STONE];
    st.flags[i] = 0;
    st.liquid[i] = 200; st.liquidType[i] = 1;
    st.frameX[i] = 18;
  }
  // 差分:v=(flags&1) XOR (type≠0) → 幽灵格 v=1,其余 v=0
  const v = new Uint16Array(N);
  for (let i = 0; i < N; i++) v[i] = ((st.flags[i] & 1) ^ (st.type[i] !== 0 ? 1 : 0));
  return {
    format: 'sandboxworld.save', version: 5,
    header: { name: '净化验收', seed: 1, width: W, height: H,
      spawn: [20, 14], groundLevel: 10, rockLevel: 20, created: 0, playTimeMs: 0,
      dungeonX: 5, dungeonY: 5, crimson: false, difficulty: 0 },
    clock: { timeOfDay: 0.3, dayCount: 1, moonPhase: 0 },
    invasion: { type: 0, size: 0, sizeStart: 0, x: 0, delay: 0 },
    player: { hp: 100, x: 0, y: 0, inventory: [], selected: 0 },
    tiles: bytesToB64(rleTiles({ type: st.type, frameX: st.frameX, frameY: st.frameY }, TILE_STABLE_OF_INTERNAL)),
    walls: bytesToB64(rlePairs(st.wall)),
    liquid: bytesToB64(rlePairs(st.liquid)),
    liquidType: bytesToB64(rlePairs(st.liquidType)),
    wire: bytesToB64(rlePairs(st.wire)),
    blocks: bytesToB64(rlePairs(new Uint8Array(N))),
    paint: bytesToB64(rlePairs(new Uint8Array(N))),
    paintWall: bytesToB64(rlePairs(new Uint8Array(N))),
    coat: bytesToB64(rlePairs(new Uint8Array(N))),
    tileActive: bytesToB64(rlePairs(v)),
    chests: [], npcs: [], flags: {},
  } as unknown as SaveData;
}
import { TILE_BY_KEY } from '../src/data/tiles';
const TILE_BY_KEY_STONE = TILE_BY_KEY['stone']!;

describe('幽灵净化战役验收(方案B)', () => {
  it('旧档迁移:幽灵清零+正常格/致动格/wall/liquid 零损伤', () => {
    const { world } = loadSaveData(mkSaveWithGhosts());
    const st = world.store;
    let ghosts = 0, stones = 0, actuated = 0;
    for (let i = 0; i < N; i++) {
      if (st.flags[i] === 0 && st.type[i] !== 0) ghosts++;
      if (st.flags[i] === 1 && st.type[i] === TILE_STABLE_OF_INTERNAL[TILE_BY_KEY_STONE] && st.wire[i] === 0) {
        const y = Math.floor(i / W);
        if (y >= 10 && y <= 12) stones++;
      }
      if (st.flags[i] === 1 && (st.wire[i] & 0x20) !== 0) actuated++;
    }
    expect(ghosts).toBe(0);          // 净化:幽灵清零
    expect(stones).toBe(30 * 3);     // 正常格零损伤
    expect(actuated).toBe(10);       // 致动格(隐藏层)保真
    // wall/liquid(flag 外通道)保留
    expect(st.wall[20 * W + 5]).toBe(63);
    expect(st.liquid[25 * W + 5]).toBe(200);
  });
  it('净化原语:幂等+只清幽灵', () => {
    const st = new TileStore(W, H);
    st.onTileChanged = () => {};
    st.type[0] = 5; st.flags[0] = 0;         // 幽灵
    st.type[1] = 5; st.flags[1] = 1;         // 正常
    const n1 = st.purgeGhostTiles();
    expect(n1).toBe(1);
    expect(st.type[0]).toBe(0);
    expect(st.frameX[0]).toBe(65535);        // -1 帧(原版非活格语义)
    expect(st.type[1]).toBe(5);              // 正常格无损
    const n2 = st.purgeGhostTiles();         // 幂等
    expect(n2).toBe(0);
  });
});
