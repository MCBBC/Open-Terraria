// ★TileShine 挖掘相首曝重烘单帧钳制锁（2026-10-04 主刀;WASM 双旗 trace x-ray 定谳）
//
// 【定谳锚】36s 挖掘相单秒爆发 176ms/s=32 慢帧直接成因。机制级核对（ensureEntry
//   六条烘焙支逐支）：首曝冷烘焙在缺省路径走 scheduleShineBakes 的 deadline 盒
//   （严格意义上未绕过），爆发由三个盒上/盒外成分构成——①盒值：挖掘相相机静止
//   →速度门不触发→缺省盒恒 4ms/帧每帧烧满；②行粒度过冲：bakeShineChunk 死线
//   只在行首检查,密集 shine 地形一行 16 格 stamp 链 ~2ms+；③指纹 mix2 盒外：
//   shineChunkFingerprint 在 budgetExhausted 之前执行,每 pending-needy chunk
//   每帧至多 2 次（schedule+扫描 SHINE_NO_BAKE 跳过路径）,冷烘焙另有烘后重算
//   → 435ms/36s。
// 【修面】①爆发闩 shineBurstLatch：上帧有冷工作（bakes/skips）⇒ 本帧缺省盒压到
//   SHINE_TRANSIT_BUDGET_MS（与滚屏态盒一致;显式逐字不吃闩;resume 不计=静止恢复
//   排干保持 base 盒）。超线 chunk 入 pendingQ 顺延=既有机制。②指纹脏标缓存
//   shineFpCache：(pair,q) 键控——pair 身份=底图重烘信号（TileShine 文件头注/
//   ChunkCache 每烘恒 new pair）,同 pair 同 q 复用=跳 mix2,pair 换代自然失忆。
// 【反伪影】延迟烘焙不改产物：零随机备案（TileShine.ts bake 链无 RNG 消费）+
//   行断点续烘逐位恒等（shine-transit-degrade 锁）——钳制只改【何时烘】,不改
//   【烘出什么】;指纹缓存只改【何时算】,mix2 函数本体零触碰。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import type { ChunkPair } from '../src/render/ChunkCache';
import type { World } from '../src/world/World';
import {
  SHINE_TRANSIT_BUDGET_MS,
  shineBurstClamp, shineBurstLatch,
  shineChunkFingerprintCached, shineFpCacheSlotsForTest,
  shineBudgetExplicit,
} from '../src/render/TileShine';

const TSHINE = readFileSync(join(__dirname, '../src/render/TileShine.ts'), 'utf8');
const fakePair = (tag: number): ChunkPair =>
  ({ wall: {}, tile: {}, sx: 0, sy: 0, cell: tag } as unknown as ChunkPair);

afterEach(() => { shineBurstLatch.reset(); });

describe('首曝钳制 ① shineBurstClamp — 爆发闩纯函数', () => {
  it('闩 off = 逐字（缺省 4ms 不被静默钳小;稳态零触碰）', () => {
    expect(shineBurstLatch.active).toBe(false);
    expect(shineBurstClamp(4)).toBe(4);
    expect(shineBurstClamp(1.5)).toBe(1.5);
    expect(shineBurstClamp(0)).toBe(0);
  });
  it('闩 on（缺省 explicit=null）= 压到 SHINE_TRANSIT_BUDGET_MS,只降不升', () => {
    shineBurstLatch.active = true;
    expect(shineBurstClamp(4)).toBe(SHINE_TRANSIT_BUDGET_MS);
    expect(SHINE_TRANSIT_BUDGET_MS).toBe(1.5);   // 与滚屏态盒一致（定参锁）
    expect(shineBurstClamp(2)).toBe(1.5);
    expect(shineBurstClamp(1)).toBe(1);          // tbNow 更小时取 tbNow(只降不升)
    expect(shineBurstClamp(0)).toBe(0);
  });
  it('显式传参（explicit≠null）= 逐字,闩不吃（确定性仪器面,与 adaptive 同纪律）', () => {
    shineBurstLatch.active = true;
    expect(shineBurstClamp(8, 8)).toBe(8);
    expect(shineBurstClamp(4, 0)).toBe(4);       // 显式 0 逐字(计数路径选择在上层)
    expect(shineBurstClamp(16, 16)).toBe(16);    // 高档位显式也不被钳(逐字)
  });
  it('reset() 复位（探针/单测面）', () => {
    shineBurstLatch.active = true;
    shineBurstLatch.reset();
    expect(shineBurstLatch.active).toBe(false);
  });
  it('Node 装载语义:explicit=null（闩吃缺省路径;浏览器显式传参由 location 判）', () => {
    expect(shineBudgetExplicit).toBeNull();
  });
});

describe('首曝钳制 ② shineFpCache — (pair,q) 键控指纹脏标缓存', () => {
  // 夹具:TileStore 真实例（fp 只读 type/flags/frameX/frameY/paint/wire/coat/
  // showInvisibleBlocks + world.chests）+ 恒等 stub pair（缓存只消费 pair 身份）。
  const mkWorld = (): World => {
    const store = new TileStore(64, 64);
    store.type[store.idx(10, 10)] = 25;   // Ebonstone(shine2 成员,非容器型)
    store.flags[store.idx(10, 10)] = 1;
    return { store, chests: [] } as unknown as World;
  };
  it('同 pair 同 q = 缓存命中（槽位 1,重复调用零新增）', () => {
    const world = mkWorld();
    const pair = fakePair(1);
    const fp1 = shineChunkFingerprintCached(world, pair, 0, 0, 0);
    expect(fp1).toBeTypeOf('number');
    expect(shineFpCacheSlotsForTest(pair)).toBe(1);
    expect(shineChunkFingerprintCached(world, pair, 0, 0, 0)).toBe(fp1);
    expect(shineFpCacheSlotsForTest(pair)).toBe(1);
  });
  it('★同 pair 内容变更 = 返回旧值（缓存跳 mix2 的直接证明;重算必得新值）', () => {
    const world = mkWorld();
    const pair = fakePair(2);
    const fp0 = shineChunkFingerprintCached(world, pair, 0, 0, 0);
    world.store.type[world.store.idx(3, 3)] = 25;   // 挖出/填入 shine 格(±1 环带内)
    expect(shineChunkFingerprintCached(world, pair, 0, 0, 0)).toBe(fp0);
    // 对照:换 pair（=底图重烘信号）后重算,值随内容变
    const fpNewPair = shineChunkFingerprintCached(world, fakePair(3), 0, 0, 0);
    expect(fpNewPair).not.toBe(fp0);
  });
  it('pair 换代自然失忆 + 内容确定性:同内容异 pair = 同 fp（跨 pair memo 复用的前提）', () => {
    const worldA = mkWorld();
    const worldB = mkWorld();   // 同构建序列 = 同内容
    const fpA = shineChunkFingerprintCached(worldA, fakePair(4), 0, 0, 0);
    const fpB = shineChunkFingerprintCached(worldB, fakePair(5), 0, 0, 0);
    expect(fpB).toBe(fpA);
  });
  it('q 键控:shimmer 档位各占槽（8+1 档域,互不串档）', () => {
    const world = mkWorld();
    const pair = fakePair(6);
    const fp0 = shineChunkFingerprintCached(world, pair, 0, 0, 0);
    const fpHalf = shineChunkFingerprintCached(world, pair, 0, 0, 0.5);
    expect(fpHalf).not.toBe(fp0);
    expect(shineFpCacheSlotsForTest(pair)).toBe(2);
    expect(shineChunkFingerprintCached(world, pair, 0, 0, 0.5)).toBe(fpHalf);
  });
});

describe('首曝钳制 ③ 源级锁 — 接线在位（防静默拆除）', () => {
  it('爆发闩内嵌在 tbNow 构造（adaptive 外层,同点只降不升）', () => {
    expect(TSHINE).toContain('? shineBurstClamp(adaptiveShineBudgetMs(shineBudgetExplicit,');
    expect(TSHINE).toContain('export function shineBurstClamp(');
    expect(TSHINE).toContain('if (explicit !== null || !shineBurstLatch.active) return tbNow;');
    expect(TSHINE).toContain('return Math.min(tbNow, SHINE_TRANSIT_BUDGET_MS);');
  });
  it('闩收账挂在 if (timeBudget) 内:schedule 前快照 bakes/skips,后置收账', () => {
    expect(TSHINE).toContain('const bakes0 = shineStats.bakes, skips0 = shineStats.skips;');
    expect(TSHINE).toContain('shineBurstLatch.active = shineBudgetExplicit === null &&');
    expect(TSHINE).toContain('(shineStats.bakes > bakes0 || shineStats.skips > skips0);');
    // 收账在 scheduleShineBakes 调用之后（同块内,防挪到盒外漏收/提前收）
    const block = TSHINE.slice(
      TSHINE.indexOf('if (timeBudget) {'),
      TSHINE.indexOf('const scanBudget'),
    );
    expect(block).toContain('scheduleShineBakes(');
    expect(block.indexOf('scheduleShineBakes(')).toBeLessThan(block.indexOf('shineBurstLatch.active ='));
  });
  it('指纹缓存三调用点全换装（schedule memo 门/首曝 memo 门/烘后 memo 存）', () => {
    // 旧直调仅剩缓存函数体内部一处（唯一 mix2 执行点）;生产调用面零直调残留
    expect(TSHINE.match(/shineChunkFingerprint\(world, cx, cy, shimmerQ\)/g)?.length).toBe(1);
    expect(TSHINE.match(/shineChunkFingerprintCached\(world, pair, cx, cy, shimmerQ\)/g)?.length).toBe(3);
    expect(TSHINE).toContain('const shineFpCache = new WeakMap<ChunkPair, Map<number, number>>();');
  });
  it('逃生门未被拆除（显式逐字/计数路径/__SW_SHINE_OFF/__SW_SHINE_MEMO_OFF）', () => {
    expect(TSHINE).toContain('if (explicit !== null || !shineBurstLatch.active) return tbNow;');
    expect(TSHINE).toContain("(globalThis as { __SW_SHINE_MEMO_OFF?: boolean }).__SW_SHINE_MEMO_OFF");
    expect(TSHINE).toContain("if ((globalThis as { __SW_SHINE_OFF?: boolean }).__SW_SHINE_OFF) return;");
  });
});
