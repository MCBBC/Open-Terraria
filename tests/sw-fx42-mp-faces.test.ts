// ============================================================================
// SW-FX42 联机域补债（2026-09-12）回归测试：
//   ① module15 渔夫任务/季节位（msg74/75 + msg7 bitsByte9[6]/[7] 等价承载）——
//      编解码字节级往返 / ClientNet 收包分发 / Room 权威门+记账+进房补发
//   ② 在用箱（msg33 ChestOpenState / msg80 ChestInUse）——Room 占用锁
//      （Chest.UsingChest Chest.cs:492-503 等价）/ 换箱释放 / 断线释放 / 进房补发 /
//      ClientNet 镜像
//   ③ 死亡收尾同步包文本面（msg118 SendPlayerDeath 的本仓 chatBroadcast 面）——
//      Game.ts 源锚 tripwire（Player.cs:39221-39223 BroadcastChatMessage 等价单口）
//   ④ M11 随从目标 MP 面免接线判据（设计定谳 tripwire——防未来误加死码镜像）
// 标杆行号全部 1457（Terarria1457）；传输层 mock 同 journey-mp / mp-sync-pack 先例。
// ============================================================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['server'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));

import { NetWriter, NetReader, Msg, NetModule } from '../src/net/protocol';
import {
  AnglerQuestSub, writeAnglerQuestModule, readAnglerQuestModule,
  writeSeasonBitsModule, SeasonBitsFlags,
} from '../src/net/syncModules';
import { ClientNet } from '../src/net/ClientNet';
import { World } from '../src/world/World';

/** 假 ws（journey-mp 同款） */
function fakeWs() {
  const sent: Uint8Array[] = [];
  const ws = {
    sent, readyState: 1, bufferedAmount: 0,
    send: (data: ArrayBuffer | Uint8Array) => { sent.push(new Uint8Array(data as ArrayBuffer)); },
    close: () => { ws.readyState = 3; },
    onopen: null, onmessage: null, onclose: null, onerror: null,
  };
  return ws;
}

/** 帧流切分（mp-sync-pack 同款） */
function parseFrames(frames: Uint8Array[]): Array<{ msgId: number; payload: NetReader }> {
  const out: Array<{ msgId: number; payload: NetReader }> = [];
  for (const f of frames) {
    let p = 0;
    while (p + 3 <= f.length) {
      const len = f[p] | (f[p + 1] << 8);
      out.push({ msgId: f[p + 2], payload: new NetReader(f.subarray(p + 3, p + len)) });
      p += len;
    }
  }
  return out;
}

function feedNet(net: ClientNet, frame: Uint8Array): void {
  (net as unknown as { handle(msgId: number, r: NetReader): void })
    .handle(frame[2], new NetReader(frame.subarray(3)));
}

// ---------------- Room 夹具（b1-clamp-purity 同款） ----------------

interface RcStub {
  ws: { sent: Uint8Array[]; readyState: number };
  slot: number; state: number; isHost: boolean;
  lastX: number; lastY: number; lastPosAt: number;
  [k: string]: unknown;
}
interface RoomStub {
  handle(c: RcStub, msgId: number, r: NetReader): void;
  flushOutbox(): void;
  newClient(ws: unknown): RcStub;
  disconnect(c: RcStub): void;
  readonly clients: Set<RcStub>;
  anglerQuest: number | null;
  anglerFinishedSlots: Set<number>;
  seasonBits: number | null;
  chestUserBySlot: Map<number, number>;
  chestUserOf(idx: number): number;
}

async function mkRoom(): Promise<{ room: RoomStub; mkClient(s: number, h?: boolean): RcStub }> {
  const { Room } = await import('../../server/src/room');
  const worldMod = await import('../src/world/World');
  const room = new Room(new worldMod.World(64, 32, 42, 'fx42-room')) as unknown as RoomStub;
  const mkClient = (slot: number, isHost = false): RcStub => {
    const c = room.newClient(fakeWs());
    c.slot = slot; c.state = 10; c.isHost = isHost;
    room.clients.add(c);
    c.lastX = 100; c.lastY = 100; c.lastPosAt = Date.now();
    return c;
  };
  return { room, mkClient };
}

async function relay(room: RoomStub, c: RcStub, msgId: number, frame: Uint8Array): Promise<void> {
  room.handle(c, msgId, new NetReader(frame.subarray(3)));
  room.flushOutbox();
}

/** 采集 sent 中 moduleId=AnglerQuest 的 msg82 帧（原始字节重扫——NetReader 单向消费） */
function module15Payloads(frames: Uint8Array[]): Array<{ sub: number; value: number }> {
  const out: Array<{ sub: number; value: number }> = [];
  for (const f of frames) {
    let p = 0;
    while (p + 3 <= f.length) {
      const len = f[p] | (f[p + 1] << 8);
      const msgId = f[p + 2];
      if (msgId === Msg.NetModules) {
        const r = new NetReader(f.subarray(p + 3, p + len));
        if (r.u16() === NetModule.AnglerQuest) {
          const sub = r.u8();
          out.push({ sub, value: r.remaining > 0 ? r.u8() : -1 });
        }
      }
      p += len;
    }
  }
  return out;
}

/** 塞一只世界箱进服务器世界（msg31 邻域匹配以锚点 ±1 命中） */
function seedChest(room: RoomStub, x: number, y: number): void {
  (room as unknown as { world: { chests: Array<{ x: number; y: number; items: unknown[] }> } })
    .world.chests.push({ x, y, items: [] });
}

// ============================================================================
// 1. module15 渔夫任务/季节位
// ============================================================================

describe.skipIf(EXT_MISSING)('SW-FX42 module15 渔夫任务/季节位编解码', () => {
  it('sub0/sub1：{u8 sub, u8 value}，帧头 msg82+moduleId=15', () => {
    const q = writeAnglerQuestModule(AnglerQuestSub.Quest, 7);
    expect(q[2]).toBe(Msg.NetModules);
    const rq = new NetReader(q.subarray(3));
    expect(rq.u16()).toBe(NetModule.AnglerQuest);
    expect(readAnglerQuestModule(rq)).toEqual({ sub: AnglerQuestSub.Quest, quest: 7 });

    const f = writeAnglerQuestModule(AnglerQuestSub.Finished, 3);
    const rf = new NetReader(f.subarray(3));
    expect(rf.u16()).toBe(NetModule.AnglerQuest);
    expect(readAnglerQuestModule(rf)).toEqual({ sub: AnglerQuestSub.Finished, slot: 3 });
  });

  it('sub2 季节位：u8 直载 + 四位旗编解码（联合读取器一体解析）', () => {
    const bits = SeasonBitsFlags.Halloween | SeasonBitsFlags.ForceHalloweenToday;
    const f = writeSeasonBitsModule(bits);
    const r = new NetReader(f.subarray(3));
    expect(r.u16()).toBe(NetModule.AnglerQuest);
    expect(readAnglerQuestModule(r)).toEqual({ sub: 2, bits });
  });

  it('未知 sub / 截断帧 → readAnglerQuestModule 返回 null（静默丢弃同 readDoorEvent 先例）', () => {
    const w = new NetWriter(Msg.NetModules);
    w.u16(NetModule.AnglerQuest); w.u8(9); w.u8(1);
    const r = new NetReader(w.finish().subarray(3));
    r.u16();                                    // moduleId 消费
    expect(readAnglerQuestModule(r)).toBeNull();
    const w2 = new NetWriter(Msg.NetModules);
    w2.u16(NetModule.AnglerQuest);
    const r2 = new NetReader(w2.finish().subarray(3));
    r2.u16();
    expect(readAnglerQuestModule(r2)).toBeNull();   // 无载荷（截断）
  });

  it('ClientNet 分发：sub0/sub1/sub2 → 对应 hook（sub1 非 self 照达,Game 侧自滤）', () => {
    const got: Array<[string, number]> = [];
    const net = new ClientNet({ player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never, {
      onWorldReady: () => {},
      onAnglerQuest: (q) => got.push(['quest', q]),
      onAnglerFinished: (s) => got.push(['finished', s]),
      onSeasonBits: (b) => got.push(['season', b]),
    });
    (net as unknown as { mySlot: number }).mySlot = 2;
    feedNet(net, writeAnglerQuestModule(AnglerQuestSub.Quest, 5));
    feedNet(net, writeAnglerQuestModule(AnglerQuestSub.Finished, 3));
    feedNet(net, writeSeasonBitsModule(SeasonBitsFlags.XMas | SeasonBitsFlags.ForceXMasToday));
    expect(got).toEqual([['quest', 5], ['finished', 3],
      ['season', SeasonBitsFlags.XMas | SeasonBitsFlags.ForceXMasToday]]);
  });
});

describe.skipIf(EXT_MISSING)('SW-FX42 Room module15 权威门/记账/进房补发', () => {
  it('非房主 sub0/sub2 断言静默丢弃；房主断言 → 服务器记账 + 排除发送者广播', async () => {
    const { room, mkClient } = await mkRoom();
    const host = mkClient(0, true);
    const guest = mkClient(1);
    // 访客伪造断言：无广播、无记账
    await relay(room, guest, Msg.NetModules, writeAnglerQuestModule(AnglerQuestSub.Quest, 9));
    await relay(room, guest, Msg.NetModules, writeSeasonBitsModule(7));
    expect(room.anglerQuest).toBeNull();
    expect(room.seasonBits).toBeNull();
    expect(host.ws.sent).toHaveLength(0);
    // 房主断言：guest 收到中继（host 排除）
    await relay(room, host, Msg.NetModules, writeAnglerQuestModule(AnglerQuestSub.Quest, 4));
    await relay(room, host, Msg.NetModules, writeSeasonBitsModule(3));
    expect(room.anglerQuest).toBe(4);
    expect(room.seasonBits).toBe(3);
    const payloads = module15Payloads(guest.ws.sent);
    expect(payloads).toEqual([
      { sub: AnglerQuestSub.Quest, value: 4 },
      { sub: 2, value: 3 },
    ]);
  }, 20000);

  it('sub1 交付：slot 服务器回填写账 + 中继；sub0 断言清空今日交付集（AnglerQuestSwap :3805 面）', async () => {
    const { room, mkClient } = await mkRoom();
    const host = mkClient(0, true);
    const guest = mkClient(1);
    await relay(room, guest, Msg.NetModules, writeAnglerQuestModule(AnglerQuestSub.Finished, 99));
    expect(room.anglerFinishedSlots.has(1)).toBe(true);   // slot 权威回填（99 丢弃）
    // 新的一天：房主 sub0 断言 → 交付集清空
    await relay(room, host, Msg.NetModules, writeAnglerQuestModule(AnglerQuestSub.Quest, 2));
    expect(room.anglerFinishedSlots.size).toBe(0);
  }, 20000);

  it('进房补发：任务号 + 已交付集 + 季节位（NetMessage.cs:2682 msg74 进场下发同位）', async () => {
    const { room, mkClient } = await mkRoom();
    const host = mkClient(0, true);
    // 无断言前（quest=null）进房不下发——先验证 null 门（图鉴/晶塔进场全量属既有
    // module 通道,须按 moduleId 过滤）
    const early = mkClient(5);
    relay(room, early, Msg.SpawnTileData, new NetWriter(Msg.SpawnTileData).i32(100).i32(100).finish());
    expect(module15Payloads(early.ws.sent)).toEqual([]);
    // 权威断言后：新进房者收到 quest+finished+season 三帧
    await relay(room, host, Msg.NetModules, writeAnglerQuestModule(AnglerQuestSub.Quest, 6));
    await relay(room, host, Msg.NetModules, writeAnglerQuestModule(AnglerQuestSub.Finished, 0));
    await relay(room, host, Msg.NetModules, writeSeasonBitsModule(1));
    const joiner = mkClient(2);
    relay(room, joiner, Msg.SpawnTileData, new NetWriter(Msg.SpawnTileData).i32(100).i32(100).finish());
    const payloads = module15Payloads(joiner.ws.sent);
    expect(payloads.map((p) => p.sub)).toEqual([0, 1, 2]);
    expect(payloads.map((p) => p.value)).toEqual([6, 0, 1]);
  }, 20000);
});

// ============================================================================
// 2. 在用箱（msg31 锁 / msg33 公告 / msg80 镜像）
// ============================================================================

describe.skipIf(EXT_MISSING)('SW-FX42 Room 在用箱（Chest.UsingChest Chest.cs:492-503 等价）', () => {
  it('msg31 授予：内容帧 + 排除申请者的 msg80 广播 + 占用记账', async () => {
    const { room, mkClient } = await mkRoom();
    const host = mkClient(0, true);
    const guest = mkClient(1);
    seedChest(room, 20, 10);
    await relay(room, guest, Msg.RequestChestOpen,
      new NetWriter(Msg.RequestChestOpen).i32(20).i32(10).finish());
    const guestFrames = parseFrames(guest.ws.sent);
    expect(guestFrames.some((f) => f.msgId === Msg.SyncChestItem)).toBe(true);
    expect(guestFrames.some((f) => f.msgId === Msg.ChestInUse)).toBe(false); // 排除申请者
    expect(room.chestUserOf(0)).toBe(1);
    const host80 = parseFrames(host.ws.sent).filter((f) => f.msgId === Msg.ChestInUse);
    expect(host80).toHaveLength(1);
    expect(host80[0].payload.u8()).toBe(1);
    expect(host80[0].payload.i16()).toBe(0);
  }, 20000);

  it('他人占用：msg31 拒发内容,请求端收占用者 msg80 镜像（原版静默不弹面板 MessageBuffer.cs:1869）', async () => {
    const { room, mkClient } = await mkRoom();
    mkClient(0, true);
    const a = mkClient(1);
    const b = mkClient(2);
    seedChest(room, 20, 10);
    await relay(room, a, Msg.RequestChestOpen,
      new NetWriter(Msg.RequestChestOpen).i32(20).i32(10).finish());
    a.ws.sent.length = 0;
    b.ws.sent.length = 0;                       // 清掉 a 开箱时的占用广播,只看拒绝响应
    await relay(room, b, Msg.RequestChestOpen,
      new NetWriter(Msg.RequestChestOpen).i32(20).i32(10).finish());
    const bFrames = parseFrames(b.ws.sent);
    expect(bFrames.some((f) => f.msgId === Msg.SyncChestItem)).toBe(false);
    const b80 = bFrames.filter((f) => f.msgId === Msg.ChestInUse);
    expect(b80).toHaveLength(1);
    expect(b80[0].payload.u8()).toBe(1);      // 占用者=slot1
    expect(room.chestUserOf(0)).toBe(1);
  }, 20000);

  it('msg33 关闭公告：镜像释放 + msg80(-1) 广播；换箱：旧箱随单值 map 自动让位', async () => {
    const { room, mkClient } = await mkRoom();
    const host = mkClient(0, true);
    const a = mkClient(1);
    seedChest(room, 20, 10);
    seedChest(room, 30, 10);
    await relay(room, a, Msg.RequestChestOpen,
      new NetWriter(Msg.RequestChestOpen).i32(20).i32(10).finish());
    // 关闭（msg33 chestIdx=-1）
    host.ws.sent.length = 0;
    await relay(room, a, Msg.ChestOpenState,
      new NetWriter(Msg.ChestOpenState).i16(-1).i32(-1).i32(-1).finish());
    expect(room.chestUserOf(0)).toBe(-1);
    const close80 = parseFrames(host.ws.sent).filter((f) => f.msgId === Msg.ChestInUse);
    expect(close80).toHaveLength(1);
    expect(close80[0].payload.u8()).toBe(1);   // 释放者 slot
    expect(close80[0].payload.i16()).toBe(-1);
    // 换箱：直接开第二只（原版 msg33 单值 chest 语义——旧箱无需显式关闭）
    host.ws.sent.length = 0;
    await relay(room, a, Msg.ChestOpenState,
      new NetWriter(Msg.ChestOpenState).i16(1).i32(30).i32(10).finish());
    expect(room.chestUserOf(0)).toBe(-1);
    expect(room.chestUserOf(1)).toBe(1);
  }, 20000);

  it('占用者非法 chestIdx 的 msg33 被拒（不产生幽灵占用）', async () => {
    const { room, mkClient } = await mkRoom();
    const host = mkClient(0, true);
    const a = mkClient(1);
    await relay(room, a, Msg.ChestOpenState,
      new NetWriter(Msg.ChestOpenState).i16(77).i32(0).i32(0).finish());
    expect(parseFrames(host.ws.sent).filter((f) => f.msgId === Msg.ChestInUse)).toHaveLength(0);
  }, 20000);

  it('断线释放：占用者 disconnect → 镜像清 + msg80(-1) 广播；进房补发含在用箱镜像', async () => {
    const { room, mkClient } = await mkRoom();
    const host = mkClient(0, true);
    const a = mkClient(1);
    seedChest(room, 20, 10);
    await relay(room, a, Msg.RequestChestOpen,
      new NetWriter(Msg.RequestChestOpen).i32(20).i32(10).finish());
    // 进房补发：新端收到 slot1 的占用镜像（NetMessage.cs:2924 SyncOnePlayer 捆包段）
    const joiner = mkClient(3);
    relay(room, joiner, Msg.SpawnTileData, new NetWriter(Msg.SpawnTileData).i32(100).i32(100).finish());
    const j80 = parseFrames(joiner.ws.sent).filter((f) => f.msgId === Msg.ChestInUse);
    expect(j80).toHaveLength(1);
    expect(j80[0].payload.u8()).toBe(1);
    // 断线
    a.ws.sent.length = 0;
    host.ws.sent.length = 0;
    room.disconnect(a);
    room.flushOutbox();
    expect(room.chestUserOf(0)).toBe(-1);
    const rel = parseFrames(host.ws.sent).filter((f) => f.msgId === Msg.ChestInUse);
    expect(rel).toHaveLength(1);
    expect(rel[0].payload.u8()).toBe(1);
    expect(rel[0].payload.i16()).toBe(-1);
  }, 20000);
});

describe.skipIf(EXT_MISSING)('SW-FX42 ClientNet 在用箱镜像', () => {
  it('msg80 → chestOpenByPlayer 镜像（-1 释放）+ 他人占用触发 onChestInUse、self 不触发', () => {
    const got: Array<[number, number]> = [];
    const net = new ClientNet({ player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never, {
      onWorldReady: () => {},
      onChestInUse: (slot, idx) => got.push([slot, idx]),
    });
    (net as unknown as { mySlot: number }).mySlot = 0;
    const f = (slot: number, idx: number) =>
      new NetWriter(Msg.ChestInUse).u8(slot).i16(idx).i32(20).i32(10).finish();
    feedNet(net, f(1, 0));
    expect(net.chestOpenByPlayer.get(1)).toBe(0);
    expect(net.isChestInUseByOther(0)).toBe(true);
    expect(got).toEqual([[1, 0]]);
    feedNet(net, f(0, 2));                    // self 占用：入镜像但不触发 hook
    expect(net.chestOpenByPlayer.get(0)).toBe(2);
    expect(got).toHaveLength(1);
    feedNet(net, f(1, -1));                   // 释放
    expect(net.chestOpenByPlayer.has(1)).toBe(false);
    expect(net.isChestInUseByOther(0)).toBe(false);
  });

  it('sendChestOpenState 帧形：{i16 chestIdx, i32 x, i32 y}（关闭=-1）', () => {
    const net = new ClientNet({ player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never,
      { onWorldReady: () => {} });
    const ws = fakeWs();
    (net as unknown as { ws: unknown }).ws = ws;
    (net as unknown as { active: boolean }).active = true;
    net.sendChestOpenState(3, 20, 10, false);
    net.sendChestOpenState(-1, -1, -1, true);
    const frames = parseFrames(ws.sent).filter((f) => f.msgId === Msg.ChestOpenState);
    expect(frames).toHaveLength(2);
    expect(frames[0].payload.i16()).toBe(3);
    expect(frames[0].payload.i32()).toBe(20);
    expect(frames[1].payload.i16()).toBe(-1);
  });
});

// ============================================================================
// 3. 死亡收尾同步包文本面（msg118 SendPlayerDeath 本仓等价=chatBroadcast 单口）
// ============================================================================

describe.skipIf(EXT_MISSING)('SW-FX42 死亡文本联机面（Player.cs:39221-39223 tripwire）', () => {
  const src = readFileSync('src/core/Game.ts', 'utf8');
  it('handlePlayerDeath 走 chatBroadcast（本地消息列+联机中继）,不再 newText 只显本端', () => {
    const iDeath = src.indexOf('private handlePlayerDeath()');
    expect(iDeath).toBeGreaterThan(0);
    const bodyEnd = src.indexOf('\n  }', iDeath);
    expect(bodyEnd).toBeGreaterThan(iDeath);
    const body = src.slice(iDeath, bodyEnd);
    expect(body).toContain('this.chatBroadcast(deathText, 225, 25, 25)');
    expect(body).not.toContain('this.newText(deathText');
  });
  it('渔夫任务重掷带 netMode 门（Main.cs:3851-3855 `if (netMode == 1) return;` 等价）', () => {
    expect(src).toContain('if (!this.net || this.net.policy.isHost) {\n          this.anglerQuestSwap();');
  });
  it('交付上行（msg75 等价 Main.cs:40948）与季节位断言挂点在位', () => {
    expect(src).toContain('this.net?.sendAnglerFinishedClaim()');
    expect(src).toContain('this.net?.sendSeasonAssert(');
    expect(src).toContain('this.net?.sendChestOpenState(ci, cxyOpen.x, cxyOpen.y, false)');
  });
});
