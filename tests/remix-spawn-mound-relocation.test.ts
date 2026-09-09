// IIIII214b 回归：remix 出生 relocation（SpawnPoint 委托尾,1457/1458 cs:19740-19748 /
// 1456 cs:19722-19730）——spawnTileX=maxTilesX/2、spawnTileY 自 maxTilesY-10 沿 SolidTile
// 上行首空+1（地狱土墩顶,GenerateUnderworldStartingMound cs:13874 造的 ash 柱列）。
//
// 历史事故：此前整臂缺失 ⇒ remix/zenith 世界出生留在地表采样点 ⇒ FinishRemixWorld
// ④ 出生列复检窗 [spawnY-14, spawnY+10]（cs:26908-26912）落在地表（④ 清扫带
// [h-200, h-125) 之外）⇒ 带清永远清不到复检窗,窗内既定液体（地表穴袋熔岩）永不干
// ⇒ while(flag) 零进展死循环——UI 'getfixedboi' 生成卡死（watchdog 37s 无进展→
// 3min 硬超时,2026-09-08 用户实报）。本测试锁两件事：
//   ① 单元：remix 世界 spawn 必落土墩顶（X=w/2 整除,Y=柱顶行,X0/Y0 快照同步）;
//   ② 非 remix 世界 spawn 不受本臂扰动（回归护栏）。
// ③ e2e（SW_ZENITH_GEN_E2E=1 启用,全程 ~2min）：UI 路径 'getfixedboi' 全程完成——
//   ④ while 对真实卡死籽的有界性永久回归。
import { describe, it, expect } from 'vitest';
import { generateWorld, spawnPointPass, type GenCtx } from '../src/world/gen/WorldGen';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { TILE_BY_KEY } from '../src/data/tiles';

/** 合成土墩世界：w/2 列自 yTop 起 fill 实心 dirt（模拟 GenerateUnderworldStartingMound
 *  的 ash 柱——SpawnPoint remix 臂唯一依赖=该列 SolidTile 连续到 h-10） */
function makeMoundWorld(opts?: { remix?: boolean; hollowColumn?: boolean }) {
  const w = 420, h = 300;
  const world = new World(w, h, 536635823, 'iii214b-unit');
  world.seedFlags = { ...(opts?.remix ? { remix: true } : {}) };
  const store = world.store;
  const dirt = TILE_BY_KEY['dirt']!;
  const cx = Math.floor(w / 2);
  const yTop = 140; // 土墩顶（ash 柱自 yTop 到 h-1 实心）
  if (!opts?.hollowColumn) {
    for (let y = yTop; y < h; y++) {
      const i = store.idx(cx, y);
      store.type[i] = dirt;
      store.flags[i] = 1;
    }
  }
  return { world, store, w, h, cx, yTop };
}

describe('IIIII214b remix 出生 relocation（SpawnPoint cs:19740-19748）', () => {
  it('remix 世界：spawn 落土墩顶（X=w/2、Y=柱顶行、X0/Y0 同步）', () => {
    const { world, store, w, yTop } = makeMoundWorld({ remix: true });
    const ctx = { world, store, rng: new RNG(1), surface: new Float32Array(w) } as unknown as GenCtx;
    spawnPointPass(ctx);
    expect(world.spawnX).toBe(Math.floor(w / 2));      // cs:19741 整除
    expect(world.spawnY).toBe(yTop);                   // 自 h-10 上行首空(139)+1=140
    expect(world.spawnX0).toBe(world.spawnX);          // X0/Y0 快照同步（床回退锚）
    expect(world.spawnY0).toBe(world.spawnY);
  });

  it('remix 且柱顶带坡/半砖/致动格：SolidTile 口径不含之（首空判定）', () => {
    const { world, store, w, yTop } = makeMoundWorld({ remix: true });
    // 柱顶行做成 halfBrick → SolidTile=false（vanilla cs:70650 排除 halfBrick）
    // ⇒ 上行穿过它,spawn 落到下一实心行
    const i = store.idx(Math.floor(w / 2), yTop);
    store.half[i] = 1;
    const ctx = { world, store, rng: new RNG(1), surface: new Float32Array(w) } as unknown as GenCtx;
    spawnPointPass(ctx);
    expect(world.spawnY).toBe(yTop + 1);
  });

  it('remix 空柱退化世界：不越界、Y≥4（JS 偿垫,原版无界）', () => {
    const { world, store, w } = makeMoundWorld({ remix: true, hollowColumn: true });
    const ctx = { world, store, rng: new RNG(1), surface: new Float32Array(w) } as unknown as GenCtx;
    expect(() => spawnPointPass(ctx)).not.toThrow();
    expect(world.spawnY).toBeGreaterThanOrEqual(4);
    expect(world.spawnX).toBe(Math.floor(w / 2));
  });

  it('非 remix 世界：出生不受本臂扰动（地表采样结果原样保留）', () => {
    const { world, store, w, yTop } = makeMoundWorld({});
    const ctx = { world, store, rng: new RNG(1), surface: new Float32Array(w) } as unknown as GenCtx;
    spawnPointPass(ctx);
    // 非 remix 走地表采样（中心扩张+首活性格）；柱顶实心行是可采样结果之一,
    // 但断言核心=不落土墩 relocation 的 X 钉死语义即可（采样含 rng 抖动）
    expect(world.spawnX0).toBe(world.spawnX);
    expect(world.spawnY0).toBe(world.spawnY);
    // ★IIIII229（⑫ 212 章 M6 护栏强化）：本测的声明是「非 remix 不受 relocation 臂
    //   扰动」,旧断言 X0==X/Y0==Y 对「remix 臂误无条件执行」恒绿（两断言在 remix 臂
    //   执行后同样成立）——补**择一硬断言**：非 remix 落点必须至少一维不等于
    //   relocation 结果（X=w/2 且 Y=柱顶行 yTop 的组合被拒）。真护栏仍是
    //   world-final-hash 双籽,本测补的是单元层误执行即时红。
    const relocated = world.spawnX === Math.floor(w / 2) && world.spawnY === yTop;
    expect(relocated, `非 remix 世界落到了 relocation 结果 (spawnX=${world.spawnX}, spawnY=${world.spawnY}, ` +
      `w/2=${Math.floor(w / 2)}, yTop=${yTop})——remix 臂疑似被无条件执行`).toBe(false);
  });

  // ③ 全程 e2e（默认跳过——整场 ~2min；CI/回归验证时启用）
  const itE2E = process.env.SW_ZENITH_GEN_E2E ? it : it.skip;
  itE2E('UI 路径 getfixedboi 全程生成完成（④ 出生腔清液 while 有界性）', async () => {
    const world = await generateWorld(
      {
        size: 0, width: 0, height: 0, seedText: 'getfixedboi', evil: -1,
        name: 'iii214b-e2e',
      } as never,
      () => {},
    );
    // 卡死籽的 relocation 语义终态断言（终清理槽后 spawn=土墩顶）
    expect(world.spawnX).toBe(Math.floor(world.store.w / 2));
    expect(world.spawnY).toBeGreaterThanOrEqual(world.store.h - 161);
    expect(world.spawnY).toBeLessThanOrEqual(world.store.h - 134);
  }, 600_000);
});
