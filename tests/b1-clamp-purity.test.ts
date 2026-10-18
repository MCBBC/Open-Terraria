// ★B1 钳位纯度批（2026-08-31）回归——独立文件防并行会话 buffer 覆写。
// 原版真值锚：SendData case 117 writer.Write((short)number2)（NetMessage.cs:1447，
// SendPlayerHurt :2615 族）＝ dmg 写层 short 直写回绕；读侧 ReadInt16 零改写直入 Hurt
// （MessageBuffer.cs:3888/:3894，Hurt 内经 CalculateDamagePlayersTake floor≥1 归一,
// Main.cs:67146-67155）；msg27 快照读值即赋、TrySendData 复播零改写（:1701/:1744）；
// 原版 msg44 弃槽无载荷（MessageBuffer.cs:4502 case 44 break）。
import { existsSync } from 'node:fs';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['server'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));

import { describe, it, expect } from 'vitest';
import { NetWriter, NetReader, Msg, PlayerHurtFlags, readPlayerHurt, writePlayerHurt } from '../src/net/protocol';

/** 假 ws（pvp-immune-net 同款）：send 采集帧 */
interface FakeWs {
  sent: Uint8Array[];
  readyState: number;
  bufferedAmount: number;
  send(data: ArrayBuffer | Uint8Array): void;
  close(): void;
  onopen: unknown; onmessage: unknown; onclose: unknown; onerror: unknown;
}
function fakeWs(): FakeWs {
  const sent: Uint8Array[] = [];
  const ws: FakeWs = {
    sent,
    readyState: 1,
    bufferedAmount: 0,
    send(data: ArrayBuffer | Uint8Array) { sent.push(new Uint8Array(data as ArrayBuffer)); },
    close() { ws.readyState = 3; },
    onopen: null, onmessage: null, onclose: null, onerror: null,
  };
  return ws;
}

/** 帧流解析出 (msgId, payload) 列表 */
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

describe.skipIf(EXT_MISSING)('★B1 msg117 写层：short 直写回绕语义（min(9999) 自造钳撤除）', () => {
  it('32767 上界原样落线;40000 按 unchecked (short) 回绕 −25536（字节型同 C# 强转）', () => {
    const f = writePlayerHurt({ slot: 0, dmg: 32767, x: 0, y: 0, dir: 1, flags: 0 });
    const rr = new NetReader(f.subarray(3));
    rr.u8();
    expect(rr.i16()).toBe(32767);
    // 帧布局 [u16 len][u8 msgId][u8 slot][i16 dmg] → dmg LE @ [4..5]
    const f2 = writePlayerHurt({ slot: 0, dmg: 40000, x: 0, y: 0, dir: 1, flags: 0 });
    expect(f2[4]).toBe(40000 & 0xff);                 // 0x40
    expect(f2[5]).toBe((40000 >> 8) & 0xff);          // 0x9c 符号位落位
    expect(readPlayerHurt(new NetReader(f2.subarray(3)))).toBeNull();   // 出合约脏帧整拒
    const f3 = writePlayerHurt({ slot: 0, dmg: -32768, x: 0, y: 0, dir: 1, flags: 0 });
    expect(f3[5]).toBe(0x80);                         // 下界直写不抬不钳
  });

  it('读侧拒收门边界：30000 合法 i16 全量通行（>9999 线值不再被任何层吞）', () => {
    const m = readPlayerHurt(new NetReader(
      writePlayerHurt({ slot: 2, dmg: 30000, x: 1, y: 2, dir: 0, flags: PlayerHurtFlags.Pvp }).subarray(3),
    ))!;
    expect(m.dmg).toBe(30000);
    expect(m.flags & PlayerHurtFlags.Pvp).not.toBe(0);
  });
});

// ---------------- Room 中继分层（server/src/room.ts） ----------------

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
  readonly clients: Set<RcStub>;
}

async function mkRoom(): Promise<{ room: RoomStub; mkClient(s: number, h?: boolean): RcStub }> {
  const { Room } = await import('../../server/src/room');
  const worldMod = await import('../src/world/World');
  const room = new Room(new worldMod.World(64, 32, 42, 'b1-room')) as unknown as RoomStub;
  const mkClient = (slot: number, isHost = false): RcStub => {
    const c = room.newClient(fakeWs());
    c.slot = slot; c.state = 10; c.isHost = isHost;
    room.clients.add(c);
    // 入 AOI（newClient 缺省 lastX=-1e9/lastPosAt=0 ⇒ aoiBlind 会跳过广播）
    c.lastX = 100; c.lastY = 100; c.lastPosAt = Date.now();
    return c;
  };
  return { room, mkClient };
}

async function relay(room: RoomStub, c: RcStub, msgId: number, frame: Uint8Array): Promise<void> {
  room.handle(c, msgId, new NetReader(frame.subarray(3)));
  room.flushOutbox();
}

describe.skipIf(EXT_MISSING)('★B1 Room 中继分层：msg27 纯透传 / msg42·44 策略层上帽保留', () => {
  it('msg27：>9999 dmg 快照全量透传（协议语义=原版弹幕案零改写），kind>12 脏条仍剥', async () => {
    // ★X2 重锚（2026-10-01）:合法 kind 表三次上移（9=星璇之音/10=雨云/11=帕鲁机件
    //  双弹,room.ts 脏条门随更 >12）——脏样本 12→13 保「超门剥除」判别力
    // （0x3f 段内取值,避开 0x40 PvP/0x80 NPC 位语义）。
    const { room, mkClient } = await mkRoom();
    const host = mkClient(0, true);
    const guest = mkClient(1);
    const w = new NetWriter(Msg.SyncProjectile);
    w.u16(2);
    w.u32(900); w.u8(1); w.str('ab'); w.i16(30000); w.i16(5);
    w.f32(100); w.f32(100); w.f32(0); w.f32(0);
    w.u32(901); w.u8(13); w.str('cd'); w.i16(50); w.i16(5);
    w.f32(120); w.f32(120); w.f32(0); w.f32(0);
    await relay(room, host, Msg.SyncProjectile, w.finish());
    const got = parseFrames(guest.ws.sent).filter((f) => f.msgId === Msg.SyncProjectile);
    expect(got).toHaveLength(1);
    expect(got[0].payload.u16()).toBe(1);             // kind>12 脏条剥除=余 1
    expect(got[0].payload.u32()).toBe(900);
    got[0].payload.u8(); got[0].payload.str();
    expect(got[0].payload.i16()).toBe(30000);         // ★30000 存活（修复前钳 9999）
    expect(got[0].payload.remaining).toBeGreaterThan(0);
  }, 20000);

  it('msg42：访客→权威端 dmg 上帽 9999=策略层滥用治理（>帽截断;≤帽逐值透传）', async () => {
    const { room, mkClient } = await mkRoom();
    const host = mkClient(0, true);
    const guest = mkClient(1);
    for (const [id, dmg] of [[777, 30000], [778, 250]] as Array<[number, number]>) {
      await relay(room, guest, Msg.StrikeNPC,
        new NetWriter(Msg.StrikeNPC).u32(id).i16(dmg).f32(0.25).f32(-0.5).finish());
    }
    const backs = parseFrames(host.ws.sent).filter((f) => f.msgId === Msg.StrikeNPC);
    expect(backs).toHaveLength(2);
    const a = backs[0].payload;
    expect(a.u32()).toBe(777);
    expect(a.i16()).toBe(9999);                       // 策略上帽生效
    const b = backs[1].payload;
    expect(b.u32()).toBe(778);
    expect(b.i16()).toBe(250);                        // ≤帽区间不折损
    expect(b.remaining).toBeGreaterThan(0);           // M3 fromSlot 尾段仍在
  }, 20000);

  it('msg44：bit7 爆炸意向任意房放行,中继上帽 9999 同为策略层（>帽截断;≤帽透传）', async () => {
    const { room, mkClient } = await mkRoom();
    const attacker = mkClient(1);
    const target = mkClient(2);
    for (const dmg of [30000, 250]) {
      await relay(room, attacker, Msg.StrikePlayer,
        new NetWriter(Msg.StrikePlayer).u8(2).i16(dmg).i16(1).i16(0)
          .u16(45).u8(0x80).finish());
    }
    const backs = parseFrames(target.ws.sent).filter((f) => f.msgId === Msg.StrikePlayer);
    expect(backs).toHaveLength(2);
    const p0 = backs[0].payload;
    expect(p0.u8()).toBe(2);
    expect(p0.i16()).toBe(9999);                      // 策略上帽
    const p1 = backs[1].payload;
    expect(p1.u8()).toBe(2);
    expect(p1.i16()).toBe(250);
    p1.i16(); p1.i16();                               // kbx/kby 段
    expect(p1.u16()).toBe(45);                        // weaponId 不受钳影响
    expect(p1.u8()).toBe(0x80);                       // flags 透传
    expect(p1.u8()).toBe(1);                          // 尾部 fromSlot=发送者槽位
  }, 20000);
});
