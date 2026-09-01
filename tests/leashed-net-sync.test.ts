// 拴绳实体联机同步（msg82 module13 = 原版 LeashedEntity.NetModule）测试——
// 标杆 Terarria1456：
//   Terraria.GameContent/LeashedEntity.cs:13-107（NetModule 三消息：Remove :43-49 /
//     Sync full :51-69 / Deserialize :22-41 / HandleFullSync :79-96 /
//     HandlePartialSync :98-106 / StreamNetUpdates :461-467 / SyncEntitiesInSection :469-472）
//   Terraria.GameContent.LeashedEntities/LeashedCritter.cs:59-101（NetSend/NetReceive）
//   Terraria.GameContent.LeashedEntities/LeashedKite.cs:58-107（含 FixFirstTimeAppearance）
//   Terraria/Utils.cs:1395（WritePackedVector2 = HalfVector2 半精度）
// 覆盖：f16 编解码位级 / FullSync 逐字段往返（walker+蝶族 variant/scale）/ 风筝
//   FullSync 重建（fastForward 档拖尾）/ PartialSync 收敛+netOffset / Remove /
//   放置→广播→重建→位置同步→破坏→移除全链 / 同锚点去重 / section 再激活不归位 /
//   信封脏包防御。
// 全程 mock 传输层（NetWriter/NetReader 字节流直连，不起任何真实连接）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { T } from '../src/data/tiles';
import {
  NetWriter, NetReader, Msg, NetModule, f32ToHalf, halfToF32,
} from '../src/net/protocol';
import {
  writeLeashedFullSync, writeLeashedPartialSync, writeLeashedRemove,
  writeLeashedPlaceRequest, readLeashedMessage, internalIdOfVid,
} from '../src/net/leashedSync';
import {
  LeashedEntityManager, LeashedCritterEntity, LeashedKiteEntity,
  prototypeOfNpc, KITE_ITEM_PROJ, KITE_TRAIL_LENGTH,
  LEASHED_SUB_FULL, LEASHED_SUB_PARTIAL, LEASHED_SUB_REMOVE, LEASHED_SUB_PLACE_REQUEST,
  LEASHED_KIND_CRITTER, LEASHED_KIND_KITE,
  type LeashedEnv, type LeashedNetMsg,
} from '../src/entities/LeashedCritter';

// ----------------------------------------------------------------------------
// 测试环境
// ----------------------------------------------------------------------------

function mkEnv(over: Partial<LeashedEnv> = {}): LeashedEnv {
  return {
    timeForVisualEffects: 0,
    dayTime: true,
    worldSurface: 100,
    windForVisuals: 0.5,
    cloudAlpha: 0,
    playerCx: -99999,
    playerCy: -99999,
    addLight: () => { },
    ...over,
  };
}

/** W×H 世界：groundY 行及以下全实心（ Dirt），上方空气 */
function groundWorld(w = 120, h = 80, groundY = 40): TileStore {
  const st = new TileStore(w, h);
  for (let x = 0; x < w; x++) {
    for (let y = groundY; y < h; y++) st.setTile(x, y, T.DIRT);
  }
  return st;
}

/** 模拟线上传输：帧 →（跳过 [u16 len][u8 id][u16 moduleId]）→ 信封解析。
 *  与 ClientNet.handle 的 msg82 分支同构（moduleId 先消费） */
function deliver(frame: Uint8Array): LeashedNetMsg | null {
  const r = new NetReader(frame.subarray(3));
  expect(r.u16()).toBe(NetModule.LeashedEntity);
  return readLeashedMessage(r);
}

/** 帧头合法性：len 前缀 / msgId=82 / moduleId=13 */
function expectFrameHeader(frame: Uint8Array) {
  const len = frame[0] | (frame[1] << 8);
  expect(len).toBe(frame.length);
  expect(frame[2]).toBe(Msg.NetModules);
}

// ----------------------------------------------------------------------------
// f16（HalfVector2）编解码
// ----------------------------------------------------------------------------

describe('f16 编解码（Utils.cs:1395 WritePackedVector2 = HalfVector2）', () => {
  it('已知半精度位型逐位精确', () => {
    // IEEE 754 binary16 标准值
    expect(f32ToHalf(0)).toBe(0x0000);
    expect(f32ToHalf(-0)).toBe(0x8000);
    expect(f32ToHalf(1)).toBe(0x3c00);
    expect(f32ToHalf(-2)).toBe(0xc000);
    expect(f32ToHalf(0.5)).toBe(0x3800);
    expect(f32ToHalf(1.5)).toBe(0x3e00);
    expect(f32ToHalf(-2.25)).toBe(0xc080);
    expect(f32ToHalf(32000)).toBe(0x77d0);
    expect(f32ToHalf(65504)).toBe(0x7bff);       // 最大正规数
    expect(f32ToHalf(65520)).toBe(0x7c00);       // 上溢 → +Inf
    expect(f32ToHalf(5.960464477539063e-8)).toBe(0x0001);  // 最小亚正规
    expect(halfToF32(0x0001)).toBeCloseTo(5.960464477539063e-8, 30);
    expect(halfToF32(0x3c00)).toBe(1);
    expect(halfToF32(0xc080)).toBe(-2.25);
    expect(halfToF32(0x7bff)).toBe(65504);
    expect(Number.isNaN(halfToF32(0x7e01))).toBe(true);
    expect(halfToF32(0x7c00)).toBe(Infinity);
  });

  it('位移/速度域（±600px）往返相对误差 ≤ 半精度规范 4.9e-4', () => {
    let maxRel = 0;
    for (let i = 0; i < 20000; i++) {
      const v = (Math.random() - 0.5) * 1200;
      const back = halfToF32(f32ToHalf(v));
      expect(Number.isFinite(back)).toBe(true);
      maxRel = Math.max(maxRel, Math.abs(back - v) / Math.max(1e-9, Math.abs(v)));
    }
    expect(maxRel).toBeLessThan(4.9e-4);
  });

  it('NetWriter.f16 / NetReader.f16 通道一致', () => {
    const w = new NetWriter(Msg.Ping);
    w.f16(123.5); w.f16(-0.25);
    const r = new NetReader(w.finish().subarray(3));
    expect(r.f16()).toBeCloseTo(123.5, 2);
    expect(r.f16()).toBeCloseTo(-0.25, 4);
  });
});

// ----------------------------------------------------------------------------
// FullSync 逐字段往返
// ----------------------------------------------------------------------------

describe('FullSync 逐字段往返（LeashedCritter.cs:59-101 字段序）', () => {
  /** 纯编解码层：跳过 manager 的 NetReceive(full)→Update() 尾段，逐字段位级对账 */
  function roundtripCritter(e: LeashedCritterEntity): LeashedCritterEntity {
    const frame = writeLeashedFullSync(e);
    expectFrameHeader(frame);
    const r = new NetReader(frame.subarray(3));
    expect(r.u16()).toBe(NetModule.LeashedEntity);
    expect(r.u8()).toBe(LEASHED_SUB_FULL);
    expect(r.u32()).toBe(e.netId);
    const ax = r.i32(), ay = r.i32();
    expect(ax).toBe(e.ax); expect(ay).toBe(e.ay);
    expect(r.u8()).toBe(LEASHED_KIND_CRITTER);
    // 身份头（manager 在构造前消费——HandleFullSync :79-90 拆分点）
    const npcType = r.u16(), w = r.u16(), h = r.u16();
    const g = new LeashedCritterEntity(ax, ay, npcType, prototypeOfNpc(npcType), 0);
    g.w = w; g.h = h;
    g.fromNet(r, true);
    return g;
  }

  function roundtripKite(e: LeashedKiteEntity): LeashedKiteEntity {
    const frame = writeLeashedFullSync(e);
    expectFrameHeader(frame);
    const r = new NetReader(frame.subarray(3));
    expect(r.u16()).toBe(NetModule.LeashedEntity);
    expect(r.u8()).toBe(LEASHED_SUB_FULL);
    expect(r.u32()).toBe(e.netId);
    const ax = r.i32(), ay = r.i32();
    expect(ax).toBe(e.ax); expect(ay).toBe(e.ay);
    expect(r.u8()).toBe(LEASHED_KIND_KITE);
    const projType = r.u16(), w = r.u16(), h = r.u16();
    const g = new LeashedKiteEntity(ax, ay, projType, w, h);
    g.fromNet(r, true);
    return g;
  }

  it('walker 兔（npcType 46）：位置/朝向/rand/等待/状态/目标全字段位级', () => {
    const st = groundWorld();
    const host = new LeashedEntityManager();
    host.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 39 * 16 });
    // vid 2019（兔）→ makeNPC 46 → walker
    const e = host.spawnCritter(60, 39, 2019)!;
    // 推进 90t：离锚游走 + rand 前进 + 状态翻转
    for (let i = 0; i < 90; i++) host.update({ store: st }, env, env.playerCx, env.playerCy);
    expect(e.cx).not.toBe(60 * 16 + 8);

    const g = roundtripCritter(e);
    // 身份
    expect(g.npcType).toBe(46);
    expect(g.ax).toBe(60); expect(g.ay).toBe(39);
    expect(g.w).toBe(e.w); expect(g.h).toBe(e.h);
    // 恒有段（位置半精度——位移对幅度 ≤ 游走半径，误差 ≪ 0.1px；其余位级相等）
    expect(Math.abs(g.cx - e.cx)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(g.cy - e.cy)).toBeLessThanOrEqual(0.1);
    expect(g.direction).toBe(e.direction);
    expect(g.rand.state).toBe(e.rand.state);        // LCG 位级（确定性 AI 的根）
    expect(g.waitTime).toBe(e.waitTime);
    expect(g.state).toBe(e.state);
    expect(g.tx).toBe(e.tx); expect(g.ty).toBe(e.ty);
    // full 尾部
    expect(g.variant).toBe(e.variant);
    expect(g.scale).toBeCloseTo(e.scale, 2);
    // netOffset 语义：full 清零（LeashedCritter.cs:89-91）
    expect(g.netOffsetX).toBe(0); expect(g.netOffsetY).toBe(0);
  });

  it('蝶族（npcType 356）：variant（placeStyle）与 Fly 随机缩放随包带走', () => {
    const st = groundWorld();
    const host = new LeashedEntityManager();
    host.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 39 * 16 });
    // vid 1997（八色蝴蝶之一）→ makeNPC 356 → normalButterfly（variant=placeStyle）
    const e = host.spawnCritter(60, 30, 1997, { placeStyle: 4 })!;
    expect(e.variant).toBe(4);
    expect(e.proto.family).toBe('normalButterfly');
    for (let i = 0; i < 60; i++) host.update({ store: st }, env, env.playerCx, env.playerCy);

    const g = roundtripCritter(e);
    expect(g.npcType).toBe(356);
    expect(g.variant).toBe(4);                        // NormalButterfly.cs:23-30 尾部
    expect(g.proto.family).toBe('normalButterfly');
    expect(g.scale).toBeCloseTo(e.scale, 2);         // 本仓扩展 scale100（原版不传→失配）
    expect(e.scale).toBeGreaterThanOrEqual(0.75);    // Fly 族 0.75-1.11 随机档
    expect(e.scale).toBeLessThanOrEqual(1.11);
    expect(g.rand.state).toBe(e.rand.state);
  });

  it('微光之灵（npcType 677）：ShimmerFly 拖尾长度随包重建', () => {
    const st = groundWorld();
    const host = new LeashedEntityManager();
    host.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 39 * 16 });
    // vid 5350 → makeNPC 677 → shimmerFly
    const e = host.spawnCritter(60, 30, 5350)!;
    expect(e.npcType).toBe(677);
    for (let i = 0; i < 10; i++) host.update({ store: st }, env, env.playerCx, env.playerCy);

    const g = roundtripCritter(e);
    expect(g.oldPositions).not.toBeNull();
    expect(g.oldPositions!.length).toBe(60);          // TrailCacheLength[677]（ShimmerFly.cs:35-41）
  });

  it('风筝（projType 766）：位置/速度/朝向角/风态/时间计数位级', () => {
    const st = groundWorld();
    const host = new LeashedEntityManager();
    host.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 20 * 16, windForVisuals: 0.6, cloudAlpha: 0.3 });
    const e = host.spawnKite(60, 39, 766, env, 4);
    expect(e.projType).toBe(766);
    // 原版风档语义（LeashedKite.cs:149-157）：windCurrent 每帧 = Lerp(0, windTarget,
    // 0.05) ≤ 0.05×target，恒低于 0.2 飞行门 → 锚桩风筝常态下垂（timeWithoutWind
    // 累积、线长 250→48 收缩）——断言下垂 + 湍流水平漂移（字段非平凡）
    for (let i = 0; i < 200; i++) host.update({ store: st }, env, env.playerCx, env.playerCy);
    expect(e.timeWithoutWind).toBeGreaterThan(120);
    expect(e.kiteDistance).toBeLessThan(250);
    expect(Math.abs(e.cx - (60 * 16 + 8))).toBeGreaterThan(1);
    expect(e.timeCounter).toBeGreaterThan(0);

    const g = roundtripKite(e);
    expect(g.projType).toBe(766);
    expect(g.w).toBe(4); expect(g.h).toBe(4);
    // LeashedKite.cs:64-70 恒有段：position f32 / velocity 半精度 / 角度 256 档。
    // position = WriteVector2（f32）：|x|~1000 量级的 f32 量子 ≈ 6e-5 → 3 位小数容差
    expect(g.cx).toBeCloseTo(e.cx, 3);
    expect(g.cy).toBeCloseTo(e.cy, 3);
    expect(g.vx).toBeCloseTo(e.vx, 3);
    expect(g.vy).toBeCloseTo(e.vy, 3);
    // 角度 = u8 256 档（:66/:81）——C# (byte) 截断按 mod 2π 回绕（负角 → [0,2π)），
    // 比较须取角差主值（原版同语义：DrawKite 消费角对 2π 等价）
    const angDiff = (a: number, b: number): number => {
      const TAU = Math.PI * 2;
      let d = (a - b) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    };
    expect(Math.abs(angDiff(g.rotation, e.rotation))).toBeLessThanOrEqual((Math.PI * 2) / 256 + 1e-6);
    // f32 线精度（原版 writer.Write(single) 同款）：0.6 → 0.6000000238…
    expect(g.windTarget).toBeCloseTo(e.windTarget, 6);
    expect(g.cloudAlpha).toBeCloseTo(e.cloudAlpha, 6);
    expect(g.timeCounter).toBeCloseTo(e.timeCounter, 6);
    expect(g.netOffsetX).toBe(0); expect(g.netOffsetY).toBe(0);
  });

  it('manager 重建（NetReceive(full) → Update() + FixFirstTimeAppearance 尾段）：风筝拖尾初始化且可续跑', () => {
    const st = groundWorld();
    const host = new LeashedEntityManager();
    host.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 20 * 16, windForVisuals: 0.6, cloudAlpha: 0.3 });
    const e = host.spawnKite(60, 39, 766, env, 4);
    for (let i = 0; i < 200; i++) host.update({ store: st }, env, env.playerCx, env.playerCy);

    const msg = deliver(writeLeashedFullSync(e))!;
    expect(msg.kind).toBe(LEASHED_KIND_KITE);
    const guest = new LeashedEntityManager();
    const guestSt = groundWorld();
    guest.attach({ store: guestSt });
    guest.netApplyFull(msg, env);
    const g = guest.kites[0];
    expect(g.netId).toBe(e.netId);
    expect(g.netPuppet).toBe(true);
    // LeashedKite.cs:93-97 尾段：拖尾初始化 + 吸附当前位（不拉丝）
    expect(g.oldPos.length).toBe(KITE_TRAIL_LENGTH[766]);
    expect(Math.abs(g.oldPos[0].x - g.cx)).toBeLessThanOrEqual(4);   // 一帧步长内
    // 重建后继续本地跑不产生 NaN（fastForward 档重建语义）
    for (let i = 0; i < 30; i++) guest.update({ store: guestSt }, env, env.playerCx, env.playerCy);
    expect(Number.isFinite(g.cx) && Number.isFinite(g.cy)).toBe(true);
    // 位置仍贴权威端（同帧同风态，差 ≤ 一帧步长 × 推进帧数 的量级）
    expect(Math.abs(g.cx - e.cx)).toBeLessThanOrEqual(128);
    expect(Math.abs(g.cy - e.cy)).toBeLessThanOrEqual(128);
  });
});

// ----------------------------------------------------------------------------
// PartialSync / netOffset / Remove
// ----------------------------------------------------------------------------

describe('PartialSync 与 Remove（LeashedEntity.cs:98-106 / :71-77）', () => {
  it('PartialSync：位置校正 + netOffset 累积并按帧收敛（:90-96 / :110-112）', () => {
    const st = groundWorld();
    const host = new LeashedEntityManager();
    host.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 39 * 16 });
    const e = host.spawnCritter(60, 39, 2019)!;
    for (let i = 0; i < 30; i++) host.update({ store: st }, env, env.playerCx, env.playerCy);

    const guest = new LeashedEntityManager();
    const guestSt = groundWorld();
    guest.attach({ store: guestSt });
    guest.netApplyFull(deliver(writeLeashedFullSync(e))!, env);
    const g = guest.critters[0];

    // 权威端再走 40t（访客端不推进）→ 双端分叉
    for (let i = 0; i < 40; i++) host.update({ store: st }, env, env.playerCx, env.playerCy);
    const driftX = g.cx - e.cx;
    expect(Math.abs(driftX)).toBeGreaterThan(0.01);

    const frame = writeLeashedPartialSync(e);
    expectFrameHeader(frame);
    const msg = deliver(frame)!;
    expect(msg.sub).toBe(LEASHED_SUB_PARTIAL);
    expect(msg.netId).toBe(e.netId);
    guest.netApplyPartial(msg);
    // 半包后位置贴权威端，netOffset = 旧位 - 新位（Draw 平滑源，:95）
    expect(Math.abs(g.cx - e.cx)).toBeLessThanOrEqual(0.5);
    expect(g.netOffsetX).toBeCloseTo(driftX, 1);
    // LeashedCritter.Update :110-112：每帧向 0 收敛 2px → 30t 内归零
    for (let i = 0; i < 30; i++) guest.update({ store: guestSt }, env, env.playerCx, env.playerCy);
    expect(Math.abs(g.netOffsetX)).toBeLessThanOrEqual(0.001);
    // getDrawOffset 出口叠加 netOffset（Draw :198 `netOffset + GetDrawOffset()`）
    const off = g.getDrawOffset(env);
    expect(off.dx).toBeCloseTo(g.netOffsetX, 6);
  });

  it('未知 netId 的 PartialSync 被丢弃（等条带补发 FullSync 兜底）', () => {
    // 用真实体产线格式帧，但访客端没有该 netId → HandlePartialSync 查无实体丢弃
    const host = new LeashedEntityManager();
    host.attach({ store: groundWorld() });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 39 * 16 });
    const e = host.spawnCritter(60, 39, 2019)!;
    const frame = writeLeashedPartialSync(e);
    expect(frame.length).toBeGreaterThan(0);

    const guest = new LeashedEntityManager();
    guest.attach({ store: groundWorld() });
    const msg = deliver(frame)!;
    expect(msg.netId).toBe(e.netId);
    guest.netApplyPartial(msg);   // 不应抛错
    expect(guest.critters.length).toBe(0);
    expect(guest.kites.length).toBe(0);
  });

  it('Remove：实体消散且列表收缩（LeashedEntity.Remove :385-398）', () => {
    const st = groundWorld();
    const host = new LeashedEntityManager();
    host.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 39 * 16 });
    const e = host.spawnCritter(60, 39, 2019)!;
    const guest = new LeashedEntityManager();
    guest.attach({ store: groundWorld() });
    guest.netApplyFull(deliver(writeLeashedFullSync(e))!, env);
    expect(guest.critters.length).toBe(1);
    const netId = e.netId;

    const frame = writeLeashedRemove(netId);
    expectFrameHeader(frame);
    const msg = deliver(frame)!;
    expect(msg.sub).toBe(LEASHED_SUB_REMOVE);
    expect(msg.netId).toBe(netId);
    guest.netRemove(msg.netId);
    expect(guest.critters.length).toBe(0);
  });
});

// ----------------------------------------------------------------------------
// 全链：放置 → 广播 → 重建 → 位置同步 → 破坏 → 移除
// ----------------------------------------------------------------------------

describe('放置→广播→重建→同步→破坏→移除 全链（mock 传输）', () => {
  it('critter 全链', () => {
    const st = groundWorld();
    const host = new LeashedEntityManager();
    host.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 39 * 16 });

    // 1. 房主放置（Game.tryPlace 724 钩 → spawnCritter + sendLeashedFull）
    const e = host.spawnCritter(60, 39, 2019)!;
    expect(e.netId).toBeGreaterThan(0);
    // 2. 广播 → 访客重建
    const guest = new LeashedEntityManager();
    guest.attach({ store: groundWorld() });
    guest.netApplyFull(deliver(writeLeashedFullSync(e))!, env);
    expect(guest.critters.length).toBe(1);
    // 3. 双端各自推进 → 周期位置同步
    for (let i = 0; i < 50; i++) {
      host.update({ store: st }, env, env.playerCx, env.playerCy);
      guest.update({ store: groundWorld() }, env, env.playerCx, env.playerCy);
    }
    guest.netApplyPartial(deliver(writeLeashedPartialSync(e))!);
    expect(Math.abs(guest.critters[0].cx - e.cx)).toBeLessThanOrEqual(0.5);
    // 4. 房主破坏：netIdsAt 捕获 → removeAt → Remove 广播 → 访客移除
    const ids = host.netIdsAt(60, 39);
    expect(ids).toEqual([e.netId]);
    host.removeAt(60, 39);
    expect(host.critters.length).toBe(0);
    for (const id of ids) {
      const msg = deliver(writeLeashedRemove(id))!;
      expect(msg.sub).toBe(LEASHED_SUB_REMOVE);
      guest.netRemove(msg.netId);
    }
    expect(guest.critters.length).toBe(0);
  });

  it('同锚点异源实体去重：本地实体被权威 FullSync 替换（防双实体）', () => {
    const st = groundWorld();
    const host = new LeashedEntityManager();
    host.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 39 * 16 });
    const e = host.spawnCritter(60, 39, 2019)!;

    const guest = new LeashedEntityManager();
    guest.attach({ store: groundWorld() });
    // 访客本地先有一个同锚点实体（乐观放置/陈旧会话残留场景）
    const local = guest.spawnCritter(60, 39, 2019)!;
    expect(local.netId).toBeGreaterThan(0);      // 本地序号与权威 netId 撞号也无妨
    guest.netApplyFull(deliver(writeLeashedFullSync(e))!, env);
    expect(guest.critters.length).toBe(1);       // 锚点唯一
    expect(guest.critters[0].netId).toBe(e.netId);
  });

  it('访客端傀儡 section 再激活不归位锚桩（原版 client Activate 不调 Spawn，:216）', () => {
    const st = groundWorld();
    const host = new LeashedEntityManager();
    host.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 39 * 16 });
    const e = host.spawnCritter(60, 39, 2019)!;
    for (let i = 0; i < 80; i++) host.update({ store: st }, env, env.playerCx, env.playerCy);
    const moved = e.cx;

    const guestSt = groundWorld();
    const guest = new LeashedEntityManager();
    guest.attach({ store: guestSt });
    guest.netApplyFull(deliver(writeLeashedFullSync(e))!, env);
    const g = guest.critters[0];
    expect(g.netId).toBeGreaterThan(0);
    // 玩家离开（section 失活）→ 回来（再激活）
    const far = mkEnv({ playerCx: 1000 * 16, playerCy: 1000 * 16 });
    const near = mkEnv({ playerCx: 60 * 16, playerCy: 39 * 16 });
    guest.update({ store: guestSt }, far, far.playerCx, far.playerCy);
    guest.update({ store: guestSt }, far, far.playerCx, far.playerCy);
    guest.update({ store: guestSt }, near, near.playerCx, near.playerCy);
    guest.update({ store: guestSt }, near, near.playerCx, near.playerCy);
    // netId>0：不归位锚桩（状态以同步为准）；本机实体（netId 0）才会 Spawn(false) 归位
    expect(Math.abs(g.cx - (60 * 16 + 8))).toBeGreaterThan(Math.abs(moved - (60 * 16 + 8)) - 64);
    expect(g.cx).not.toBe(60 * 16 + 8);
  });

  it('kite 傀儡不覆写风态（LeashedKite.cs:144-148 netMode!=1 门）', () => {
    const st = groundWorld();
    const host = new LeashedEntityManager();
    host.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 20 * 16, windForVisuals: 0.6 });
    const e = host.spawnKite(60, 39, 766, env, 4);
    const guest = new LeashedEntityManager();
    guest.attach({ store: groundWorld() });
    guest.netApplyFull(deliver(writeLeashedFullSync(e))!, env);
    const g = guest.kites[0];
    // 访客端换环境风（PartialSync 之间）：不覆写（权威值保持）
    const otherWind = mkEnv({ playerCx: 60 * 16, playerCy: 20 * 16, windForVisuals: -0.8 });
    guest.update({ store: groundWorld() }, otherWind, otherWind.playerCx, otherWind.playerCy);
    expect(g.windTarget).toBeCloseTo(e.windTarget, 5);
  });
});

// ----------------------------------------------------------------------------
// 信封防御与 PlaceRequest
// ----------------------------------------------------------------------------

describe('信封防御（NetModule.Deserialize :22-41 default 分支）', () => {
  it('未知 sub / 脏包返回 null', () => {
    const bad1 = new NetWriter(Msg.NetModules).u16(NetModule.LeashedEntity).u8(99).finish();
    expect(deliver(bad1)).toBeNull();
    // 越界锚点
    const bad2 = new NetWriter(Msg.NetModules).u16(NetModule.LeashedEntity).u8(LEASHED_SUB_FULL)
      .u32(1).i32(-5).i32(3).u8(LEASHED_KIND_CRITTER).finish();
    expect(deliver(bad2)).toBeNull();
    // 非法 kind
    const bad3 = new NetWriter(Msg.NetModules).u16(NetModule.LeashedEntity).u8(LEASHED_SUB_FULL)
      .u32(1).i32(5).i32(3).u8(7).finish();
    expect(deliver(bad3)).toBeNull();
    // netId=0
    const bad4 = new NetWriter(Msg.NetModules).u16(NetModule.LeashedEntity).u8(LEASHED_SUB_REMOVE)
      .u32(0).finish();
    expect(deliver(bad4)).toBeNull();
  });

  it('PlaceRequest 信封往返（sub3：锚格 + 物品 vid）', () => {
    const frame = writeLeashedPlaceRequest(72, 35, 2019);
    expectFrameHeader(frame);
    const msg = deliver(frame)!;
    expect(msg.sub).toBe(LEASHED_SUB_PLACE_REQUEST);
    expect(msg.ax).toBe(72); expect(msg.ay).toBe(35);
    expect(msg.vid).toBe(2019);
  });

  it('internalIdOfVid：vid → 内部 item id（房主落账记录用）', () => {
    for (const vid of [2019, 1997, 5350, 4610]) {   // 兔 / 蝶 / 微光之灵 / 风筝
      const id = internalIdOfVid(vid);
      expect(id).toBeGreaterThan(0);
    }
    // ★2026-09-02 哨兵改 -1（def 下标 0=合法位,恰为 vi_109_mana_crystal;
    //   见 leashedSync.internalIdOfVid 注）
    expect(internalIdOfVid(999999)).toBe(-1);
    // 风筝 vid 的 projType 与捕获小动物的 makeNPC 双向可查（房主校验链数据源）
    expect(KITE_ITEM_PROJ[4610]).toBe(822);
  });
});

// ----------------------------------------------------------------------------
// 锚桩存物取回（sub4 RetrieveRequest → 房主权威落账 → msg21 掉物）——访客端
// 无 furnitureItems 记录，取回必须经房主；= msg31/32 箱子请求同款信任模型。
// 标杆：TELeashedEntityAnchorWithItem.cs:20-30（DropItemForTileBreak）/ :36-38
//（InsertItem）+ TELeashedEntityAnchor.cs:16-21（OnRemoved → DespawnLeashedEntity）。
// 注意：原版锚桩无 OnPlayerInteraction，右键取回是本仓扩展交互（备案）。
// ----------------------------------------------------------------------------
import {
  writeLeashedRetrieveRequest, applyLeashedRetrieve, type LeashedRetrieveHost,
} from '../src/net/leashedSync';
import {
  LEASHED_SUB_RETRIEVE_REQUEST,
} from '../src/entities/LeashedCritter';
import {
  leashedAnchorPlace, type FurnitureItemRecord,
} from '../src/world/FurnitureItems';

/** 房主世界绑定 mock：记录表 + 实体表 + 掉物/广播采集（零 Game 依赖） */
function mkHost(records: FurnitureItemRecord[], entityIds: number[]) {
  const drops: Array<{ x: number; y: number; key: string; stack: number }> = [];
  const removes: number[] = [];
  const alive = new Set(entityIds);
  const host: LeashedRetrieveHost = {
    records,
    netIdsAt: (x, y) => (x === 60 && y === 39 ? entityIds : []),
    removeAt: () => { for (const id of entityIds) alive.delete(id); return entityIds.length > 0; },
    dropItem: (x, y, key, stack) => drops.push({ x, y, key, stack }),
    broadcastRemove: (id) => removes.push(id),
    keyOf: (id) => `vi_${id}_bunny`,
  };
  return { host, drops, removes, alive };
}

describe('RetrieveRequest 信封（sub4：锚格 + kind）', () => {
  it('帧头/字段往返', () => {
    const frame = writeLeashedRetrieveRequest(60, 39, LEASHED_KIND_CRITTER);
    expectFrameHeader(frame);
    const msg = deliver(frame)!;
    expect(msg.sub).toBe(LEASHED_SUB_RETRIEVE_REQUEST);
    expect(msg.ax).toBe(60); expect(msg.ay).toBe(39);
    expect(msg.kind).toBe(LEASHED_KIND_CRITTER);
    // kite 档
    const m2 = deliver(writeLeashedRetrieveRequest(61, 40, LEASHED_KIND_KITE))!;
    expect(m2.kind).toBe(LEASHED_KIND_KITE);
  });
  it('脏包防御：越界锚点 / 非法 kind → null', () => {
    expect(deliver(new NetWriter(Msg.NetModules).u16(NetModule.LeashedEntity)
      .u8(LEASHED_SUB_RETRIEVE_REQUEST).i32(-1).i32(3).u8(0).finish())).toBeNull();
    expect(deliver(new NetWriter(Msg.NetModules).u16(NetModule.LeashedEntity)
      .u8(LEASHED_SUB_RETRIEVE_REQUEST).i32(5).i32(-2).u8(1).finish())).toBeNull();
    expect(deliver(new NetWriter(Msg.NetModules).u16(NetModule.LeashedEntity)
      .u8(LEASHED_SUB_RETRIEVE_REQUEST).i32(5).i32(3).u8(7).finish())).toBeNull();
  });
});

describe('取回落账（applyLeashedRetrieve：校验 → 弹存物 → 消散实体 → 掉物 → 广播）', () => {
  it('全链：记录存在 → 存物掉落(msg21 载荷形态) + 记录/实体清除 + sub0 广播', () => {
    const records: FurnitureItemRecord[] = [];
    leashedAnchorPlace(records, 'critter_anchor', 60, 39, { id: 4321, stack: 1 });
    const { host, drops, removes, alive } = mkHost(records, [77]);
    expect(applyLeashedRetrieve(host, 60, 39, LEASHED_KIND_CRITTER)).toBe(true);
    // 存物掉落：锚格像素位（×16+8, ×16）与破坏掉物同位——msg21 spawn 载荷
    expect(drops).toHaveLength(1);
    expect(drops[0].x).toBe(60 * 16 + 8);
    expect(drops[0].y).toBe(39 * 16);
    expect(drops[0].key).toBe('vi_4321_bunny');
    expect(drops[0].stack).toBe(1);
    // 记录清除 + 实体消散 + Remove 广播
    expect(records.find((r) => r.x === 60 && r.y === 39)).toBeUndefined();
    expect(alive.size).toBe(0);
    expect(removes).toEqual([77]);
  });

  it('host 权威边界：无记录 / 空桩 / kind 不匹配 → 零副作用拒绝', () => {
    // 无记录
    const empty = mkHost([], []);
    expect(applyLeashedRetrieve(empty.host, 60, 39, LEASHED_KIND_CRITTER)).toBe(false);
    expect(empty.drops).toHaveLength(0);
    expect(empty.removes).toHaveLength(0);
    // 空桩（记录在、存物槽空）
    const blank: FurnitureItemRecord[] = [];
    leashedAnchorPlace(blank, 'critter_anchor', 60, 39, { id: 4321, stack: 1 });
    blank[0].slots[0] = null;
    const b = mkHost(blank, []);
    expect(applyLeashedRetrieve(b.host, 60, 39, LEASHED_KIND_CRITTER)).toBe(false);
    expect(b.drops).toHaveLength(0);
    // kind 不匹配：critter 记录用 kite kind 请求
    const mixed: FurnitureItemRecord[] = [];
    leashedAnchorPlace(mixed, 'critter_anchor', 60, 39, { id: 4321, stack: 1 });
    const m = mkHost(mixed, [5]);
    expect(applyLeashedRetrieve(m.host, 60, 39, LEASHED_KIND_KITE)).toBe(false);
    expect(m.drops).toHaveLength(0);
    expect(m.removes).toHaveLength(0);
    expect(m.alive.size).toBe(1);        // 实体保留
    // 非法 kind
    expect(applyLeashedRetrieve(m.host, 60, 39, 9)).toBe(false);
  });

  it('访客→房主全链（mock 传输）：请求帧 → 房主落账 → 掉物/Remove 到访客侧', () => {
    // 1. 房主世界：记录 + 实体（spawnCritter 真产线）
    const st = groundWorld();
    const hostMgr = new LeashedEntityManager();
    hostMgr.attach({ store: st });
    const env = mkEnv({ playerCx: 60 * 16, playerCy: 39 * 16 });
    const e = hostMgr.spawnCritter(60, 39, 2019)!;
    const records: FurnitureItemRecord[] = [];
    leashedAnchorPlace(records, 'critter_anchor', 60, 39, { id: 4321, stack: 1 });
    // 2. 访客右键 → sub4 请求帧（服务器定向转发 = 字节直连 mock）
    const req = deliver(writeLeashedRetrieveRequest(60, 39, LEASHED_KIND_CRITTER))!;
    expect(req.sub).toBe(LEASHED_SUB_RETRIEVE_REQUEST);
    // 3. 房主落账（Game.netApplyLeashed sub4 分支 → retrieveLeashedAnchor 的纯约简）
    const { host, drops, removes } = mkHost(records, hostMgr.netIdsAt(60, 39));
    host.removeAt = (x, y) => hostMgr.removeAt(x, y);
    expect(applyLeashedRetrieve(host, req.ax, req.ay, req.kind)).toBe(true);
    expect(hostMgr.critters).toHaveLength(0);         // 实体消散（OnRemoved 等价）
    // 4. 掉物 = msg21 spawn 载荷 → 访客收包拾取；Remove → 访客实体移除
    expect(drops[0].key).toBe('vi_4321_bunny');
    expect(removes).toEqual([e.netId]);
    const guest = new LeashedEntityManager();
    guest.attach({ store: groundWorld() });
    guest.netApplyFull(deliver(writeLeashedFullSync(e))!, env);
    expect(guest.critters).toHaveLength(1);
    for (const id of removes) guest.netRemove(deliver(writeLeashedRemove(id))!.netId);
    expect(guest.critters).toHaveLength(0);
  });
});
