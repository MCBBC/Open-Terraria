// ============================================================================
// ★X4 清偿刀D（2026-09-29）MP netCameraTarget（msg13 字段）判别测试：
//   原版链 = Main.UpdateCameraPan 置 LocalPlayer.netCameraTarget=trackedPosition
//   （Main.cs:63636 复位/:63650 写;三域 GetObjectTrackingCameraPan :63677-63699——
//   观战/无人机 DroneCameraTracker/高尔夫 LocalGolfState）+ 发送门 HasValue 翻转∨
//   位移>160px → SendData(13)（Main.cs:63671-63676）;线上=msg13 第 4 控制字节
//   bitsByte24[5] + 条件尾随 Vector2（NetMessage.cs:487/:507-509）;接收
//   MessageBuffer.cs:1049;唯一消费者 = 服务器 NPC.StreamUpdatesToNearbyPlayers 的
//   ReportedCameraPosition（NPC.cs:91765 + Player.cs:3896-3905 = netCameraTarget??
//   position）——本仓等价活消费 = room.ts msg23/27 逐接收端 AOI 过滤中心
//   （entityAoiCenter）。
// 覆盖矩阵：
//   - 发送门四象限：null→值（翻转发）/值→值 ≤160px（不发）/值→值 >160px（发）/
//     值→null（翻转发）;net 未激活零发送（单机零影响）
//   - msg13 尾段编解码 round-trip（bit5 + f32×2 逐值）;无跟踪帧零尾段字节差
//   - 降级矩阵：旧 server 剥尾（位在段不在）→ 拒读不错位 camTarget=null;
//     旧 client 帧（无位）→ null;NaN 尾段 → 服务器弃段（S6）不上行
//   - 服务器中继透传（排除发送者;team 段共存不错位）
//   - AOI 判别：相机位（2000,0）处 NPC 只在带相机尾段的接收端到货（avatar 位
//     2000px 落滞回带不入视野）——刀D 的行为判别面
//   - 旧端观战回退：spectateSlot（msg150）目标位兜底（旧 client 无相机尾段）
// 全程 mock 传输层（pvp-immune-net 同款假 ws 字节流直连）。
// ============================================================================
import { existsSync } from 'node:fs';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['server'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));

import { describe, it, expect } from 'vitest';
import { NetWriter, NetReader, Msg } from '../src/net/protocol';
import { ClientNet } from '../src/net/ClientNet';

// ---------------------------------------------------------------------------
// 测试基建（house harness 先例,pvp-immune-net 同款）
// ---------------------------------------------------------------------------

function fakeWs() {
  const sent: Uint8Array[] = [];
  const ws = {
    sent,
    readyState: 1,
    bufferedAmount: 0,
    send: (data: ArrayBuffer | Uint8Array) => { sent.push(new Uint8Array(data as ArrayBuffer)); },
    close: () => { ws.readyState = 3; },
    onopen: null, onmessage: null, onclose: null, onerror: null,
  };
  return ws;
}

function parseFrames(frames: Uint8Array[]): Array<{ msgId: number; payload: NetReader; len: number }> {
  const out: Array<{ msgId: number; payload: NetReader; len: number }> = [];
  for (const f of frames) {
    let p = 0;
    while (p + 3 <= f.length) {
      const len = f[p] | (f[p + 1] << 8);
      out.push({ msgId: f[p + 2], payload: new NetReader(f.subarray(p + 3, p + len)), len });
      p += len;
    }
  }
  return out;
}

function framesRaw(sent: Uint8Array[], msgId: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const f of sent) {
    let p = 0;
    while (p + 3 <= f.length) {
      const len = f[p] | (f[p + 1] << 8);
      if (f[p + 2] === msgId) out.push(f.subarray(p, p + len));
      p += len;
    }
  }
  return out;
}

function feedNet(net: ClientNet, frame: Uint8Array): void {
  (net as unknown as { handle(msgId: number, r: NetReader): void })
    .handle(frame[2], new NetReader(frame.subarray(3)));
}

type NetPriv = { ws: { sent: Uint8Array[] } };
const wsOf = (net: ClientNet) => (net as unknown as NetPriv).ws;

function mkNet(mySlot: number, player: Record<string, unknown> = {}) {
  const net = new ClientNet(
    {
      player: {
        appearance: null, hostile: false, team: 0,
        inv: { slots: [], armor: [], dye: [], selected: 0 },
        x: 0, y: 0, vx: 0, vy: 0, facing: 1, dead: false, sleeping: false,
        inputX: 0, inputJump: false, inputDown: false, inputUp: false,
        hp: 100, maxHp: 100, deathsPve: 0, deathsPvp: 0, mana: 50, maxMana: 100, luck: 0,
        ...player,
      },
    } as never,
    { onWorldReady: () => {} } as never,
  );
  net.mySlot = mySlot;
  net.active = true;
  (net as unknown as NetPriv).ws = fakeWs();
  return net;
}

/** 手工构 msg13 帧（逐字段=ClientNet.sendPlayerState 写序）;形变开关用于降级矩阵。
 *  ★team 段缺省恒写（=真实客户端契约：sendPlayerState 无条件写 team——相机尾段
 *  位置序跟在 team 后,v<7 旧形须显式 withTeam:false 且不得携 cam,否则服务器/收端
 *  把 cam 首字节当 team 读=位置歧义,该歧义只由畸形帧可达） */
function playerStateFrame(slot: number, opts?: {
  x?: number; y?: number; ctrl?: number;
  cam?: { x: number; y: number } | null;   // 值=bit5+尾段;null=无位无段
  bit5NoTail?: boolean;                    // 旧 server 剥尾形：位在段不在
  withTeam?: boolean;                      // v7 team 段（缺省恒写;v<7 旧形显式 false）
  team?: number;
}): Uint8Array {
  const o = { x: 0, y: 0, ctrl: 64, team: 3, withTeam: true, ...(opts ?? {}) };
  const hasBit5 = !!o.cam || !!o.bit5NoTail;
  const flag = 4 | (hasBit5 ? 32 : 0);     // bit2=hasVelocity + bit5=hasCameraTarget
  const w = new NetWriter(Msg.PlayerState);
  w.u8(slot);
  w.u8(o.ctrl).u8(flag).u8(0);
  w.f32(o.x).f32(o.y);
  w.f32(0).f32(0);
  if (o.withTeam) w.u8(o.team);
  if (o.cam) w.f32(o.cam.x).f32(o.cam.y);
  return w.finish();
}

/** msg23 上行帧（房主→服务器;与 room.ts SyncNPC 读序同构） */
function npcSnapFrame(entries: Array<{ netId: number; key: string; x: number; y: number }>): Uint8Array {
  const w = new NetWriter(Msg.SyncNPC);
  w.u16(entries.length);
  for (const e of entries) {
    w.u32(e.netId); w.str(e.key);
    w.f32(e.x); w.f32(e.y); w.f32(0); w.f32(0);
    w.i16(100); w.i16(100); w.u16(0); w.u8(0);
  }
  return w.finish();
}

interface RcStub {
  ws: { sent: Uint8Array[]; readyState: number };
  slot: number; state: number; isHost: boolean;
  [k: string]: unknown;
}
interface RoomStub {
  handle(c: RcStub, msgId: number, r: NetReader): void;
  flushOutbox(): void;
  newClient(ws: unknown): RcStub;
  readonly clients: Set<RcStub>;
}

async function mkRig(): Promise<{
  room: RoomStub;
  rc: Record<'host' | 'a' | 'b' | 'target', RcStub>;
  relay(c: RcStub, msgId: number, frame: Uint8Array): void;
}> {
  const { Room } = await import('../../server/src/room');
  const worldMod = await import('../src/world/World');
  const room = new Room(new worldMod.World(400, 60, 42, 'cam-target-room')) as unknown as RoomStub;
  const mkClient = (slot: number, isHost = false) => {
    const c = room.newClient(fakeWs());
    c.slot = slot; c.state = 10; c.isHost = isHost;
    room.clients.add(c);
    return c;
  };
  const relay = (c: RcStub, msgId: number, frame: Uint8Array) => {
    room.handle(c, msgId, new NetReader(frame.subarray(3)));
    room.flushOutbox();
  };
  return {
    room,
    rc: { host: mkClient(0, true), a: mkClient(1), b: mkClient(2), target: mkClient(3) },
    relay,
  };
}

/** 接收端 rc.sent 里 SyncNPC 帧是否包含 netId（S→C 短码格式逐条解） */
function syncNpcHasNetId(rc: RcStub, netId: number): boolean {
  for (const f of framesRaw(rc.ws.sent, Msg.SyncNPC)) {
    const r = new NetReader(f.subarray(3));
    const n = r.u16();
    for (let i = 0; i < n; i++) {
      const eflags = r.u8();
      const full = (eflags & 1) !== 0;
      const id = full ? r.u32() : -1;
      if (full) r.u16();
      if (full) r.str();
      r.f32(); r.f32(); r.f32(); r.f32(); r.i16(); r.i16(); r.u16();
      if (id === netId) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// ① 发送门（Main.cs:63671-63676 四象限 + 单机零影响）
// ---------------------------------------------------------------------------
describe.skipIf(EXT_MISSING)('刀D 发送门：notifyCameraTarget（HasValue 翻转 ∨ 位移>160px）', () => {
  it('net 未激活零发送（单机零影响）', () => {
    const net = mkNet(0);
    net.active = false;
    net.notifyCameraTarget({ x: 100, y: 200 });
    net.notifyCameraTarget(null);
    expect(wsOf(net).sent.length).toBe(0);
  });

  it('null→值（翻转）→ 强制发 1 帧,bit5 置位+尾段逐值', () => {
    const net = mkNet(0);
    const before = framesRaw(wsOf(net).sent, Msg.PlayerState).length;
    net.notifyCameraTarget({ x: 100.5, y: 200.25 });
    const frames = framesRaw(wsOf(net).sent, Msg.PlayerState);
    expect(frames.length).toBe(before + 1);
    const r = new NetReader(frames[0].subarray(3));
    r.u8();                                   // slot
    r.u8();                                   // ctrl
    const flag = r.u8();
    expect(flag & 32).not.toBe(0);            // flagBits[5]=hasCameraTarget
    r.u8();                                   // sel
    r.f32(); r.f32();                         // pos
    r.f32(); r.f32();                         // vel
    expect(r.u8()).toBe(0);                   // team
    expect(r.f32()).toBeCloseTo(100.5);       // camX 逐值
    expect(r.f32()).toBeCloseTo(200.25);      // camY 逐值
    expect(r.remaining).toBe(0);              // 无多余字节
  });

  it('值→值 位移≤160px → 不发（原版门直读语义）', () => {
    const net = mkNet(0);
    net.notifyCameraTarget({ x: 1000, y: 1000 });
    const after1 = framesRaw(wsOf(net).sent, Msg.PlayerState).length;
    expect(after1).toBeGreaterThanOrEqual(1);
    net.notifyCameraTarget({ x: 1100, y: 1060 });   // dist=√(100²+60²)≈116.6≤160
    expect(framesRaw(wsOf(net).sent, Msg.PlayerState).length).toBe(after1);
  });

  it('值→值 位移>160px → 强制发;基准随每次 msg13 上行刷新（OnControlsSynced 同相）', () => {
    const net = mkNet(0);
    net.notifyCameraTarget({ x: 1000, y: 1000 });
    const after1 = framesRaw(wsOf(net).sent, Msg.PlayerState).length;
    net.notifyCameraTarget({ x: 1200, y: 1000 });   // dist=200>160
    expect(framesRaw(wsOf(net).sent, Msg.PlayerState).length).toBe(after1 + 1);
    // 门基准已刷到 (1200,1000)：再挪 100px 不发
    net.notifyCameraTarget({ x: 1300, y: 1000 });
    expect(framesRaw(wsOf(net).sent, Msg.PlayerState).length).toBe(after1 + 1);
  });

  it('值→null（翻转）→ 强制发 1 帧,bit5 清零且无尾段（零多余字节）', () => {
    const net = mkNet(0);
    net.notifyCameraTarget({ x: 100, y: 200 });
    net.notifyCameraTarget(null);
    const frames = framesRaw(wsOf(net).sent, Msg.PlayerState);
    const r = new NetReader(frames[frames.length - 1].subarray(3));
    r.u8(); r.u8();
    const flag = r.u8();
    expect(flag & 32).toBe(0);
    r.u8(); r.f32(); r.f32(); r.f32(); r.f32(); r.u8();
    expect(r.remaining).toBe(0);              // 无相机目标=无段（旧帧零字节差）
  });
});

// ---------------------------------------------------------------------------
// ② 接收解码（MessageBuffer.cs:1049 等价）+ 降级矩阵
// ---------------------------------------------------------------------------
describe.skipIf(EXT_MISSING)('刀D 接收面：msg13 尾段解码 + 旧形降级矩阵', () => {
  it('bit5+尾段 → camTarget 逐值入镜像;team 段共存不错位', () => {
    const net = mkNet(0);
    feedNet(net, playerStateFrame(2, { x: 5, y: 6, cam: { x: 3000.5, y: -12.25 }, withTeam: true }));
    const p = net.players.get(2)!;
    expect(p.camTarget).not.toBeNull();
    expect(p.camTarget!.x).toBeCloseTo(3000.5);
    expect(p.camTarget!.y).toBeCloseTo(-12.25);
    expect(p.team).toBe(3);
    expect(p.x).toBeCloseTo(5);
  });

  it('无位无段（v<7 旧 client 帧,连 team 段也无）→ camTarget=null', () => {
    const net = mkNet(0);
    feedNet(net, playerStateFrame(2, { withTeam: false }));
    expect(net.players.get(2)!.camTarget).toBeNull();
  });

  it('旧 server 剥尾形（位在段不在）→ 拒读不错位:camTarget=null 且 team 正常', () => {
    const net = mkNet(0);
    feedNet(net, playerStateFrame(2, { bit5NoTail: true, withTeam: true }));
    const p = net.players.get(2)!;
    expect(p.camTarget).toBeNull();
    expect(p.team).toBe(3);
  });

  it('逐包覆写：带值帧后跟无位帧 → camTarget 归 null（tracking 停止同相）', () => {
    const net = mkNet(0);
    feedNet(net, playerStateFrame(2, { cam: { x: 1, y: 2 } }));
    expect(net.players.get(2)!.camTarget).not.toBeNull();
    feedNet(net, playerStateFrame(2, {}));
    expect(net.players.get(2)!.camTarget).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ③ 服务器中继（room.ts PlayerState 位）+ NaN 弃段（S6）
// ---------------------------------------------------------------------------
describe.skipIf(EXT_MISSING)('刀D 服务器面：尾段透传 + NaN 弃段 + AOI 判别', () => {
  it('上行带尾 → 他人收到的重打包帧保留位+值（排除发送者）', async () => {
    const rig = await mkRig();
    // 接收端位置新鲜度（broadcastAt 盲端门——各先发一条定位 msg13）
    rig.relay(rig.rc.b, Msg.PlayerState, playerStateFrame(2, { x: 0, y: 0 }));
    rig.relay(rig.rc.a, Msg.PlayerState, playerStateFrame(99, { x: 0, y: 0, cam: { x: 1000, y: 2000 } }));
    expect(framesRaw(rig.rc.a.ws.sent, Msg.PlayerState).length).toBe(0);   // 发送者排除
    const got = framesRaw(rig.rc.b.ws.sent, Msg.PlayerState);
    expect(got.length).toBe(1);
    const r = new NetReader(got[0].subarray(3));
    expect(r.u8()).toBe(1);                   // 权威 slot 覆写
    r.u8(); const flag = r.u8(); r.u8();
    expect(flag & 32).not.toBe(0);
    r.f32(); r.f32(); r.f32(); r.f32();
    expect(r.u8()).toBe(3);                   // team 段先存活
    expect(r.f32()).toBeCloseTo(1000);        // 相机尾段逐值存活
    expect(r.f32()).toBeCloseTo(2000);
    expect(r.remaining).toBe(0);
  });

  it('旧 client 形（无位无段）上行 → 下行帧也不携带（对旧接收端零字节差）', async () => {
    const rig = await mkRig();
    rig.relay(rig.rc.b, Msg.PlayerState, playerStateFrame(2, { x: 0, y: 0 }));
    rig.relay(rig.rc.a, Msg.PlayerState, playerStateFrame(99, { x: 0, y: 0 }));
    const got = framesRaw(rig.rc.b.ws.sent, Msg.PlayerState);
    expect(got.length).toBe(1);
    const r = new NetReader(got[0].subarray(3));
    r.u8(); r.u8(); r.u8(); r.u8();
    r.f32(); r.f32(); r.f32(); r.f32();
    expect(r.u8()).toBe(3);
    expect(r.remaining).toBe(0);
  });

  it('NaN 尾段 → 服务器弃段（S6）:hasCam 置 false,下行帧位在段不在（收端拒读兜底）', async () => {
    const rig = await mkRig();
    rig.relay(rig.rc.b, Msg.PlayerState, playerStateFrame(2, { x: 0, y: 0 }));
    // 位在段在但值 NaN：手工帧（playerStateFrame 只收有限值,故手拼）
    const w = new NetWriter(Msg.PlayerState);
    w.u8(1); w.u8(64); w.u8(4 | 32); w.u8(0);
    w.f32(0); w.f32(0); w.f32(0); w.f32(0);
    w.u8(0);
    w.f32(NaN); w.f32(NaN);
    rig.relay(rig.rc.a, Msg.PlayerState, w.finish());
    const got = framesRaw(rig.rc.b.ws.sent, Msg.PlayerState);
    expect(got.length).toBe(1);
    const r = new NetReader(got[0].subarray(3));
    r.u8(); r.u8(); const flag = r.u8(); r.u8();
    expect(flag & 32).not.toBe(0);            // flag 原样过墙（位在）
    r.f32(); r.f32(); r.f32(); r.f32(); r.u8();
    expect(r.remaining).toBe(0);              // 段不在（服务器弃段）
    // 收端拒读兜底：位在段不在 → camTarget=null 不越界
    const net = mkNet(0);
    feedNet(net, got[0]);
    expect(net.players.get(1)!.camTarget).toBeNull();
  });

  it('AOI 判别：相机位 NPC 只入带相机尾段接收端的视野（avatar 位落滞回带不入）', async () => {
    const rig = await mkRig();
    const NPC = { netId: 7, key: 'BlueSlime', x: 2000, y: 0 };
    // 接收端 b：avatar (0,0) 无相机尾段（旧形）→ NPC 2000px 落滞回带（>1536 内径,
    // 未可见不入）→ 不收
    rig.relay(rig.rc.b, Msg.PlayerState, playerStateFrame(2, { x: 0, y: 0 }));
    rig.relay(rig.rc.host, Msg.SyncNPC, npcSnapFrame([NPC]));
    expect(syncNpcHasNetId(rig.rc.b, 7)).toBe(false);
    // 同 avatar 位 + 相机尾段 (2000,0)（无人机跟拍面）→ 过滤中心切相机位 → 收
    rig.relay(rig.rc.b, Msg.PlayerState, playerStateFrame(2, { x: 0, y: 0, cam: { x: 2000, y: 0 } }));
    rig.relay(rig.rc.host, Msg.SyncNPC, npcSnapFrame([NPC]));
    expect(syncNpcHasNetId(rig.rc.b, 7)).toBe(true);
  });

  it('相机目标停发（无位帧）→ 过滤中心退回 avatar 位（改动前行为）', async () => {
    const rig = await mkRig();
    const NPC = { netId: 8, key: 'BlueSlime', x: 2000, y: 0 };
    rig.relay(rig.rc.b, Msg.PlayerState, playerStateFrame(2, { x: 0, y: 0, cam: { x: 2000, y: 0 } }));
    rig.relay(rig.rc.b, Msg.PlayerState, playerStateFrame(2, { x: 0, y: 0 }));   // tracking 停
    rig.relay(rig.rc.host, Msg.SyncNPC, npcSnapFrame([NPC]));
    expect(syncNpcHasNetId(rig.rc.b, 8)).toBe(false);
  });

  it('旧端观战回退：spectateSlot（msg150）目标位兜底（旧 client 无相机尾段）', async () => {
    const rig = await mkRig();
    const NPC = { netId: 9, key: 'BlueSlime', x: 3000, y: 0 };
    // 观战目标 slot3 在 (3000,0);观战者 b（旧 client,无相机尾段）avatar (0,0)
    rig.relay(rig.rc.target, Msg.PlayerState, playerStateFrame(3, { x: 3000, y: 0 }));
    rig.relay(rig.rc.b, Msg.SpectateFocus, new NetWriter(Msg.SpectateFocus).i16(3).finish());
    rig.relay(rig.rc.b, Msg.PlayerState, playerStateFrame(2, { x: 0, y: 0 }));
    rig.relay(rig.rc.host, Msg.SyncNPC, npcSnapFrame([NPC]));
    expect(syncNpcHasNetId(rig.rc.b, 9)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ④ 全链 round-trip：ClientNet A → room → ClientNet B
// ---------------------------------------------------------------------------
describe.skipIf(EXT_MISSING)('刀D 全链：发送门 → 服务器中继 → 接收镜像', () => {
  it('A notify(相机) → 强制 msg13 → B 侧 camTarget 逐值镜像;门不发时零包', async () => {
    const rig = await mkRig();
    const a = mkNet(1, { x: 0, y: 0 });
    const b = mkNet(2, { x: 0, y: 0 });
    /** 服务器下行帧 → 各 ClientNet 入站（pvp-immune-net roomToNets 同款） */
    const roomToNets = (sentOwner: Uint8Array[], nets: ClientNet[]) => {
      for (const frame of sentOwner.splice(0)) {
        let p = 0;
        while (p + 3 <= frame.length) {
          const len = frame[p] | (frame[p + 1] << 8);
          for (const n of nets) feedNet(n, frame.subarray(p, p + len));
          p += len;
        }
      }
    };
    // 双端位置新鲜度（aoiBlind 门——各发一条定位 msg13）
    rig.relay(rig.rc.a, Msg.PlayerState, playerStateFrame(1, { x: 0, y: 0 }));
    rig.relay(rig.rc.b, Msg.PlayerState, playerStateFrame(2, { x: 0, y: 0 }));
    roomToNets(rig.rc.a.ws.sent, [a, b]);
    roomToNets(rig.rc.b.ws.sent, [a, b]);
    // A 相机跟拍：null→值翻转 → 强制上行
    a.notifyCameraTarget({ x: 3200.5, y: -40.25 });
    const up = framesRaw(wsOf(a).sent, Msg.PlayerState);
    expect(up.length).toBe(1);
    for (const f of up) {
      let p = 0;
      while (p + 3 <= f.length) {
        const len = f[p] | (f[p + 1] << 8);
        rig.relay(rig.rc.a, f[p + 2], f.subarray(p, p + len));
        p += len;
      }
    }
    roomToNets(rig.rc.b.ws.sent, [b]);        // 服务器下行 → B 入站
    const rp = b.players.get(1)!;
    expect(rp).toBeDefined();
    expect(rp.camTarget).not.toBeNull();
    expect(rp.camTarget!.x).toBeCloseTo(3200.5);
    expect(rp.camTarget!.y).toBeCloseTo(-40.25);
    // A 相机缓移（≤160px）→ 门不发 → B 镜像保持原值（零包零抖动）
    a.notifyCameraTarget({ x: 3250.5, y: -40.25 });
    expect(framesRaw(wsOf(a).sent, Msg.PlayerState).length).toBe(1);
    expect(rp.camTarget!.x).toBeCloseTo(3200.5);
  });
});
