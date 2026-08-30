// DoorEvent(msg19 等价通道)codec 回环 + 残包防御单测
// ★NetWriter.finish() 输出带 [u16 len][u8 msgId] 帧头 —— 读侧一律 subarray(3)(与
//   生产分发处 FrameParser 一致);裸喂会错位 3 字节。
import { describe, it, expect } from 'vitest';
import { writeDoorEvent, readDoorEvent, NetReader, Msg } from '../src/net/protocol';

const payloadOf = (ev: Parameters<typeof writeDoorEvent>[0]) =>
  new Uint8Array(writeDoorEvent(ev)).subarray(3);

describe('DoorEvent codec', () => {
  it('开/关 × 门/高门 四形回环逐字段相等', () => {
    for (const closing of [false, true]) {
      for (const gate of [false, true]) {
        const ev = { closing, gate, x: 3975, y: 468, dir: -1 };
        const out = readDoorEvent(new NetReader(payloadOf(ev)))!;
        expect(out).toEqual(ev);
      }
    }
  });
  it('负坐标(边界外)也能原样承载——合法性由服务器侧判定', () => {
    const ev = { closing: true, gate: false, x: -3, y: -9, dir: 1 };
    const out = readDoorEvent(new NetReader(payloadOf(ev)))!;
    expect(out.x).toBe(-3);
    expect(out.y).toBe(-9);
    expect(out.closing).toBe(true);
  });
  it('残包(<10B payload)返回 null;帧头 msgId=19 锚定原版 DoorOpen', () => {
    const full = payloadOf({ closing: false, gate: true, x: 1, y: 2, dir: -1 });
    expect(full.length).toBe(10);
    expect(readDoorEvent(new NetReader(full.subarray(0, 9)))).toBeNull();
    expect(readDoorEvent(new NetReader(full))!.gate).toBe(true);
    const raw = new Uint8Array(writeDoorEvent({ closing: false, gate: false, x: 0, y: 0, dir: 0 }));
    expect(raw[2]).toBe(Msg.DoorEvent);
    expect(Msg.DoorEvent).toBe(19);
  });
});
