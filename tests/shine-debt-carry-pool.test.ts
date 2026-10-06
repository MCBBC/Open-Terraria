// ★TileShine 三债清偿锁（2026-10-06;滚屏刀遗留三笔登记债）
//
// 【债1 画布池化】重烘 churn 的孤儿 256² 画布喂 GC（base 实测 36s 挖掘窗 184 张
//   ≈46MB churn）→ 死点归还+池复用。锁面：抽壳幂等/池纪律/获取点惰性语义
//   （hasMul 语义逐位）+ 源级锁（acquire 接线 + bumpTexEpoch 身份税——池画布被
//   原地重烘,shim er:texId:epoch 纹理键必须换代,否则首帧内容永久冻结 =
//   生命水晶 tileShine 案同族根病）。死点证明面（不当前 slots ∧ 不 memo ⇒ 永不
//   绘出）在 TileShine.ts 池化注,此处锁机制不锁证明。
// 【债2 跨 pair carry】pair 换代丢 partial 进度（base 实测 catchupMax=450 帧/
//   均值 57）→ 前缀凭证（shineFpPrefix）收养。锁面：依赖域演算（行 [-1,r] 全列
//   ∪ 行 r+1 列 [-1,c]）正/反例、carry 成功=slots 收养+memo 删除（撤销场景混态
//   条目防误复用）、carry 拒绝=真编辑落在已烘域、r=0/完成条目/新 pair 已有档/
//   __SW_SHINE_MEMO_OFF 逃生门。
// 【债3 格级断行】死线检查下沉到格级 stamp 点——非幂等不变量本体=「不重踏已
//   stamp 格+stamp 全序不变」,(row,col) 精确续点两者皆保(旧注「行内断点会重踏」
//   指「行内断、行首续」错位续烘)。锁面：断点凭证存 (row,col,fp)、完成态清
//   三标、停滞判据 row∧col 双未动;产物逐位恒等由 shineDebugResumeIdentity
//   cellSplits(浏览器面,scripts/_shine-debt-ab.mjs digest 通道)闭环。
import { describe, expect, it, beforeEach } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import type { ChunkPair } from '../src/render/ChunkCache';
import type { World } from '../src/world/World';
import type { ShineChunkEntry } from '../src/render/TileShine';
import {
  shineStats,
  shineFpPrefix,
  shineDebugSeedSlotsForTest, shineDebugSlotsForTest, shineDebugMemoPeekForTest,
  shineDebugMemoSeedForTest, shineDebugTryCarryForTest,
  shinePoolDepthForTest, shinePoolReleaseForTest,
  shineEntryComplete,
} from '../src/render/TileShine';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChunkCache } from '../src/render/ChunkCache';

const TSHINE = readFileSync(join(__dirname, '../src/render/TileShine.ts'), 'utf8');
const fakePair = (tag: number): ChunkPair =>
  ({ wall: {}, tile: {}, sx: 0, sy: 0, cell: tag } as unknown as ChunkPair);

// 夹具：TileStore 真实例（fp 读 type/flags/frameX/frameY/paint/wire/coat/half/
// slope/showInvisibleBlocks + world.chests）+ shine2 成员铺面（25 Ebonstone）。
// chunk (0,0) = 世界格 [0,16)²。25 的 delta=(0,0,0.1)>0 且 shouldTileShine default
// true ⇒ 是活 shine 格（但 Node 无 DOM 不可真 stamp——本文件只锁指纹/carry/池
// 机制面,画布产物面归 scripts/_shine-debt-ab.mjs digest 通道）。
const mkWorld = (opts?: { chestAt?: [number, number] }): World => {
  const store = new TileStore(64, 64);
  for (let y = 2; y < 14; y += 3) {
    for (let x = 2; x < 14; x += 3) {
      store.type[store.idx(x, y)] = 25;
      store.flags[store.idx(x, y)] = 1;
      store.frameX[store.idx(x, y)] = 0;
      store.frameY[store.idx(x, y)] = 0;
    }
  }
  const w = { store, chests: [] } as unknown as World;
  if (opts?.chestAt) {
    // hasChest 探测按【格 type】(TILE_DEFS vanilla.sheet===21/467) — 光有 chests
    // 数组条目不够,须真铺一枚容器格(chestLidPoseAt 的消费前提同源)。
    const chestType = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 21);
    const [cxp, cyp] = opts.chestAt;
    store.type[store.idx(cxp, cyp)] = chestType;
    store.flags[store.idx(cxp, cyp)] = 1;
    (w as unknown as { chests: { x: number; y: number; frame: number }[] }).chests =
      [{ x: cxp, y: cyp, frame: 0 }];
  }
  return w;
};
const partialEntry = (world: World, q: number, row: number, col: number): ShineChunkEntry =>
  ({ shimmerQ: q, _resumeRow: row, _resumeCol: col,
    _resumeFp: shineFpPrefix(world, null, 0, 0, row, col, q) } as ShineChunkEntry);

beforeEach(() => { shineStats.reset(); });

describe('债2 前缀指纹 shineFpPrefix — 依赖域演算（行 [-1,r] 全列 ∪ 行 r+1 列 [-1,c]）', () => {
  it('同内容同指纹（确定性——carry 收养的前提）', () => {
    const a = mkWorld(), b = mkWorld();
    expect(shineFpPrefix(b, null, 0, 0, 5, 0, 0)).toBe(shineFpPrefix(a, null, 0, 0, 5, 0, 0));
    expect(shineFpPrefix(b, null, 0, 0, 5, 7, 0)).toBe(shineFpPrefix(a, null, 0, 0, 5, 7, 0));
  });
  it('行首断点（c=0）：已烘行 [0,r) 的依赖=行 [-1,r] 全列——行 r 内编辑=域内（拒),行 r+1 编辑=域外（收）', () => {
    const a = mkWorld();
    const fp0 = shineFpPrefix(a, null, 0, 0, 5, 0, 0);
    // 行 5（=r）列 3 编辑：既被行 4 的 stamp 取帧读到（+1 行邻接）,也属已烘域边界 → 域内
    a.store.type[a.store.idx(3, 5)] = 1;
    expect(shineFpPrefix(a, null, 0, 0, 5, 0, 0)).not.toBe(fp0);
    // 行 6（=r+1）列 3 编辑：c=0 无行 r stamp → 不读 r+1 → 域外
    const b = mkWorld();
    const fpB = shineFpPrefix(b, null, 0, 0, 5, 0, 0);
    b.store.type[b.store.idx(3, 6)] = 1;
    expect(shineFpPrefix(b, null, 0, 0, 5, 0, 0)).toBe(fpB);
  });
  it('格级断点（c>0）：行 r+1 的依赖列窗 [-1,c]——c 内编辑=域内,c 外=域外', () => {
    // c=7：stamp(5,6) 读行 6 列 [5,7] → 列 7 域内,列 8 域外
    const a = mkWorld();
    const fp0 = shineFpPrefix(a, null, 0, 0, 5, 7, 0);
    a.store.type[a.store.idx(7, 6)] = 1;   // 行 6 列 7（=c）→ 域内
    expect(shineFpPrefix(a, null, 0, 0, 5, 7, 0)).not.toBe(fp0);
    const b = mkWorld();
    const fpB = shineFpPrefix(b, null, 0, 0, 5, 7, 0);
    b.store.type[b.store.idx(8, 6)] = 1;   // 行 6 列 8（>c）→ 域外
    expect(shineFpPrefix(b, null, 0, 0, 5, 7, 0)).toBe(fpB);
  });
  it('已烘域内（行 < r）编辑恒域内（=carry 必拒的正确性面）', () => {
    const a = mkWorld();
    const fp0 = shineFpPrefix(a, null, 0, 0, 5, 0, 0);
    a.store.type[a.store.idx(3, 2)] = 1;   // 行 2 < 5 → 已烘行
    expect(shineFpPrefix(a, null, 0, 0, 5, 0, 0)).not.toBe(fp0);
  });
  it('半砖/坡面位入配方面（drawVanillaCell 产物依赖形状;setHalfBrick/setSlope 发监听换代但原 fp 缺位=锤改后 memo 误复用首烘形状）', () => {
    const a = mkWorld();
    const fp0 = shineFpPrefix(a, null, 0, 0, 5, 0, 0);
    a.store.half[a.store.idx(3, 3)] = 1;   // half 变（type/flags/frame 不变）
    expect(shineFpPrefix(a, null, 0, 0, 5, 0, 0)).not.toBe(fp0);
    const b = mkWorld();
    const fpB = shineFpPrefix(b, null, 0, 0, 5, 0, 0);
    b.store.slope[b.store.idx(3, 3)] = 2;  // slope 变
    expect(shineFpPrefix(b, null, 0, 0, 5, 0, 0)).not.toBe(fpB);
  });
  it('q 参与指纹（档位隔离）;chest 格入域 ⇒ 箱摘要参与（chestLidPoseAt 消费面）', () => {
    const a = mkWorld();
    expect(shineFpPrefix(a, null, 0, 0, 5, 0, 0)).not.toBe(shineFpPrefix(a, null, 0, 0, 5, 0, 0.5));
    const c1 = mkWorld({ chestAt: [3, 3] });      // 箱在已烘域内
    const c2 = mkWorld({ chestAt: [3, 3] });
    const fp1 = shineFpPrefix(c1, null, 0, 0, 5, 0, 0);
    c2.chests![0].frame = 2;                       // 箱盖态变
    expect(shineFpPrefix(c2, null, 0, 0, 5, 0, 0)).not.toBe(fp1);
  });
});

describe('债2 tryCarryShineProgress — 换代收养/拒绝/一致性', () => {
  it('凭证全等 ⇒ 收养：条目进新 pair slots、memo 槽【改签】为收养时点全量 fp（混态条目防按烘始 fp 误复用）、carries/carriedRows 记账', () => {
    const world = mkWorld();
    const p1 = fakePair(1), p2 = fakePair(2);
    const e = partialEntry(world, 0, 5, 0);
    shineDebugSeedSlotsForTest(p1, [{ q: 0, e }]);
    // 伪造 memo 槽（收养必须改签——条目内容=前缀@暂停态+尾段@当前态,旧烘始 fp 不再
    //   描述它;改签为收养时点全量 fp 后:内容再变 ⇒ 换代 fp 门 miss ⇒ 不误服）
    shineDebugMemoSeedForTest(ChunkCache.key(0, 0), [{ q: 0, fp: 12345, e }]);
    expect(shineDebugTryCarryForTest(world, null, p1, p2, 0, 0, 0)).toBe(true);
    const slots2 = shineDebugSlotsForTest(p2);
    expect(slots2?.length).toBe(1);
    expect(slots2?.[0].e).toBe(e);
    expect(slots2?.[0].q).toBe(0);
    const memoSlot = shineDebugMemoPeekForTest(ChunkCache.key(0, 0));
    expect(memoSlot?.length).toBe(1);
    expect(memoSlot?.[0].e).toBe(e);
    expect(memoSlot?.[0].fp).not.toBe(12345);   // 改签=当前全量 fp（非旧烘始值）
    expect(shineStats.carries).toBe(1);
    expect(shineStats.carriedRows).toBe(5);
    // 旧 pair 槽位不动（旧 pair 永不再 current,残留=WeakMap GC 面）
    expect(shineDebugSlotsForTest(p1)?.[0].e).toBe(e);
  });
  it('memo 改签换下的旧槽条目：不在当前 slots ⇒ 死点池化（债1×债2 联动:收养不孤儿化）', () => {
    const world = mkWorld();
    const p1 = fakePair(21), p2 = fakePair(22);
    const e = partialEntry(world, 0, 5, 0);
    shineDebugSeedSlotsForTest(p1, [{ q: 0, e }]);
    const fakeC = () => ({ width: 256, height: 256 }) as unknown as HTMLCanvasElement;
    const stale: ShineChunkEntry = { shimmerQ: 0, mul: fakeC(), add: fakeC() };   // 旧 memo 条目（≠收养条目）
    shineDebugMemoSeedForTest(ChunkCache.key(0, 0), [{ q: 0, fp: 777, e: stale }]);
    const depth0 = shinePoolDepthForTest();
    expect(shineDebugTryCarryForTest(world, null, p1, p2, 0, 0, 0)).toBe(true);
    expect(shinePoolDepthForTest()).toBe(depth0 + 2);   // stale 的 mul/add 入池
    expect(stale.mul).toBeUndefined();                   // 抽壳
  });
  it('凭证不匹配（真编辑落在已烘依赖域）⇒ 拒绝:carriesMiss 记账,新 pair 不被写', () => {
    const world = mkWorld();
    const p1 = fakePair(3), p2 = fakePair(4);
    const e = partialEntry(world, 0, 5, 0);
    shineDebugSeedSlotsForTest(p1, [{ q: 0, e }]);
    // 收养前真编辑:行 2（<r,已烘域）
    world.store.type[world.store.idx(3, 2)] = 1;
    expect(shineDebugTryCarryForTest(world, null, p1, p2, 0, 0, 0)).toBe(false);
    expect(shineStats.carriesMiss).toBe(1);
    expect(shineStats.carries).toBe(0);
    expect(shineDebugSlotsForTest(p2)).toBeUndefined();
  });
  it('r=0（无已烘行）/完成条目（无断点）/缺 _resumeFp ⇒ 不收养（落回常规路径）', () => {
    const world = mkWorld();
    const p1 = fakePair(5), p2 = fakePair(6);
    shineDebugSeedSlotsForTest(p1, [{ q: 0, e: { shimmerQ: 0, _resumeRow: 0, _resumeCol: 0,
      _resumeFp: shineFpPrefix(world, null, 0, 0, 0, 0, 0) } as ShineChunkEntry }]);
    expect(shineDebugTryCarryForTest(world, null, p1, p2, 0, 0, 0)).toBe(false);
    shineDebugSeedSlotsForTest(p1, [{ q: 0, e: { shimmerQ: 0 } as ShineChunkEntry }]);   // 完成
    expect(shineDebugTryCarryForTest(world, null, p1, p2, 0, 0, 0)).toBe(false);
    shineDebugSeedSlotsForTest(p1, [{ q: 0, e: { shimmerQ: 0, _resumeRow: 5, _resumeCol: 0 } as ShineChunkEntry }]);
    expect(shineDebugTryCarryForTest(world, null, p1, p2, 0, 0, 0)).toBe(false);   // 无凭证
    expect(shineDebugSlotsForTest(p2)).toBeUndefined();
  });
  it('新 pair 已有本档槽位 ⇒ 不动（memo 命中先行/既有重烘接管）', () => {
    const world = mkWorld();
    const p1 = fakePair(7), p2 = fakePair(8);
    const e1 = partialEntry(world, 0, 5, 0);
    shineDebugSeedSlotsForTest(p1, [{ q: 0, e: e1 }]);
    const e2 = partialEntry(world, 0, 3, 0);
    shineDebugSeedSlotsForTest(p2, [{ q: 0, e: e2 }]);
    expect(shineDebugTryCarryForTest(world, null, p1, p2, 0, 0, 0)).toBe(false);
    expect(shineDebugSlotsForTest(p2)?.[0].e).toBe(e2);
    expect(shineStats.carries).toBe(0);
  });
  it('q 档隔离：异档 partial 不收养本档缺口', () => {
    const world = mkWorld();
    const p1 = fakePair(9), p2 = fakePair(10);
    shineDebugSeedSlotsForTest(p1, [{ q: 0.5, e: partialEntry(world, 0.5, 5, 0) }]);
    expect(shineDebugTryCarryForTest(world, null, p1, p2, 0, 0, 0)).toBe(false);
    expect(shineDebugSlotsForTest(p2)).toBeUndefined();
  });
  it('__SW_SHINE_MEMO_OFF = 世代复用族总闸:carry 关（旧行为逐字）', () => {
    const world = mkWorld();
    const p1 = fakePair(11), p2 = fakePair(12);
    shineDebugSeedSlotsForTest(p1, [{ q: 0, e: partialEntry(world, 0, 5, 0) }]);
    (globalThis as { __SW_SHINE_MEMO_OFF?: boolean }).__SW_SHINE_MEMO_OFF = true;
    try {
      expect(shineDebugTryCarryForTest(world, null, p1, p2, 0, 0, 0)).toBe(false);
      expect(shineDebugSlotsForTest(p2)).toBeUndefined();
    } finally {
      delete (globalThis as { __SW_SHINE_MEMO_OFF?: boolean }).__SW_SHINE_MEMO_OFF;
    }
  });
});

describe('债1 画布池 — 抽壳幂等/池纪律（Node 面;获取点接线由源级锁+digest 通道闭环）', () => {
  it('归还抽壳:mul/add/_mulCtx/_addCtx 全清（fail-safe:误判死点最坏=画不出,绝不画陈旧内容）', () => {
    const fakeC = () => ({ width: 256, height: 256 }) as unknown as HTMLCanvasElement;
    const e: ShineChunkEntry = { shimmerQ: 0, mul: fakeC(), add: fakeC(),
      _mulCtx: {} as CanvasRenderingContext2D, _addCtx: {} as CanvasRenderingContext2D };
    shinePoolReleaseForTest(e);
    expect(e.mul).toBeUndefined();
    expect(e.add).toBeUndefined();
    expect(e._mulCtx).toBeUndefined();
    expect(e._addCtx).toBeUndefined();
    expect(shinePoolDepthForTest()).toBeGreaterThanOrEqual(2);   // 池为模块态,相对断言
  });
  it('抽壳幂等:空壳重复归还零操作（SITE-2 shift 与 memo 换代同条目双归还判例）', () => {
    const fakeC = () => ({ width: 256, height: 256 }) as unknown as HTMLCanvasElement;
    const e: ShineChunkEntry = { shimmerQ: 0, mul: fakeC() };
    shinePoolReleaseForTest(e);
    const depth = shinePoolDepthForTest();
    shinePoolReleaseForTest(e);
    expect(shinePoolDepthForTest()).toBe(depth);
  });
  it('池深上界 8:溢出回落 GC（poolOverflow 记账,旧行为残面）', () => {
    const fakeC = () => ({ width: 256, height: 256 }) as unknown as HTMLCanvasElement;
    const entries = Array.from({ length: 6 }, () => ({ shimmerQ: 0, mul: fakeC(), add: fakeC() } as ShineChunkEntry));
    for (const e of entries) shinePoolReleaseForTest(e);
    expect(shinePoolDepthForTest()).toBe(8);
    const overflow0 = shineStats.poolOverflow;
    const extra: ShineChunkEntry = { shimmerQ: 0, mul: fakeC() };
    shinePoolReleaseForTest(extra);
    expect(shinePoolDepthForTest()).toBe(8);
    expect(shineStats.poolOverflow).toBe(overflow0 + 1);
    expect(extra.mul).toBeUndefined();   // 溢出仍抽壳(池满回落 GC=旧行为)
  });
});

describe('债3 格级断行 — 断点凭证与完成态语义', () => {
  it('shineEntryComplete 语义不变:_resumeRow undefined=完成(格级断点必带 row)', () => {
    expect(shineEntryComplete({ shimmerQ: 0 } as never)).toBe(true);
    expect(shineEntryComplete({ shimmerQ: 0, _resumeRow: 5, _resumeCol: 3 } as never)).toBe(false);
    expect(shineEntryComplete({ shimmerQ: 0, _resumeRow: undefined, _resumeCol: undefined } as never)).toBe(true);
  });
});

describe('三债源级锁 — 接线在位（防静默拆除）', () => {
  it('债1:bake 获取点走池（entry 画布零 createElement 直建）;身份税 bumpTexEpoch 在获取点', () => {
    expect(TSHINE).toContain('entry.add = acquireShineCanvas();');
    expect(TSHINE).toContain('entry.mul = acquireShineCanvas();');
    expect(TSHINE).not.toContain('entry.add = document.createElement');
    expect(TSHINE).not.toContain('entry.mul = document.createElement');
    expect(TSHINE).toContain('bumpTexEpoch(c);');
    expect(TSHINE).toContain("import { bumpTexEpoch } from './texId';");
  });
  it('债1:死点归还五面在位（memo 命中 shift/烘焙 shift×2/memo 换代×2+carry 改签换下）', () => {
    expect(TSHINE.match(/releaseShineEntryCanvases\(dropped\.e\);/g)?.length).toBe(3);
    expect(TSHINE.match(/releaseShineEntryCanvases\(om\.e\);/g)?.length).toBe(3);
  });
  it('债2:schedule ① 换代支走 carry;凭证在暂停点写入;完成态清三标;memo 改签（非删除）', () => {
    expect(TSHINE).toContain('if (tryCarryShineProgress(world, atlas, it.pair, cur, it.cx, it.cy, shimmerQ)) {');
    expect(TSHINE.match(/entry\._resumeFp = shineFpPrefix\(world, atlas, cx, cy, ly, lx, shimmerQ\);/g)?.length).toBe(1);
    expect(TSHINE).toContain('entry._resumeRow = undefined;');
    expect(TSHINE).toContain('entry._resumeCol = undefined;');
    expect(TSHINE).toContain('entry._resumeFp = undefined;');
    expect(TSHINE).toContain('shineMemo.set(mkey, [{ q: shimmerQ, fp: shineChunkFingerprintCached(world, atlas, cur, cx, cy, shimmerQ), e }]);');
  });
  it('债3:死线检查在格级 stamp 点(row,col 断点);行首退化=resumeCol=0;停滞判据双未动', () => {
    expect(TSHINE).toContain("if ((deadline !== undefined && performance.now() > deadline)\n        || ly * CHUNK + lx >= cellCap) {");
    expect(TSHINE).toContain('entry._resumeRow = ly;');
    expect(TSHINE).toContain('entry._resumeCol = lx;');
    expect(TSHINE).toContain('lxStart = 0;');
    expect(TSHINE).toContain('e._resumeRow === beforeRow && e._resumeCol === beforeCol');
  });
  it('既有锁面未被拆除（timeBudget 构造/计数路径/逃生门/fp 缓存三调用点）', () => {
    expect(TSHINE).toContain('const timeBudget = tbNow > 0 ? { deadline: performance.now() + tbNow } : null;');
    expect(TSHINE).toContain('const countBudget: ShineBakeBudget | undefined = timeBudget ? undefined : { left: 2 };');
    expect(TSHINE.match(/shineChunkFingerprintCached\(world, atlas, pair, cx, cy, shimmerQ\)/g)?.length).toBe(3);
    expect(TSHINE.match(/shineChunkFingerprint\(world, atlas, cx, cy, shimmerQ\)/g)?.length).toBe(1);
    expect(TSHINE).toContain("(globalThis as { __SW_SHINE_MEMO_OFF?: boolean }).__SW_SHINE_MEMO_OFF");
  });
});
