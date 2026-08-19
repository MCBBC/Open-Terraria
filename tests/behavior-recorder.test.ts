// 行为录制系统单测：环形淘汰 / 开窗导出 / 无窗 snapshotTail / toggle 幂等语义
import { describe, it, expect } from 'vitest';
import {
  BehaviorRecorder, REC_RING_CAPACITY,
} from '../src/debug/BehaviorRecorder';

/** 便捷构造：tick 源 = 每写一条 +1（模拟游戏 tick 推进） */
function makeRec(): BehaviorRecorder {
  const rec = new BehaviorRecorder();
  let t = 0;
  rec.tickSource = () => t;
  const rawLog = rec.log.bind(rec);
  rec.log = (k: string, d: unknown) => { rawLog(k, d); t++; };
  rec.worldInfo = () => ({ worldName: '测试世界', seed: 12345, w: 100, h: 200, hardMode: false, dayTime: true });
  return rec;
}

describe('BehaviorRecorder', () => {
  it('log 恒安全：无窗也进环（追溯能力根基）', () => {
    const rec = makeRec();
    rec.log('key', { c: 'Space', down: true });
    rec.log('tile', { x: 1, y: 2, from: 'dirt', to: 0, cause: 'mine' });
    const tail = rec.snapshotTail(10);
    expect(tail).toHaveLength(2);
    expect(tail[0]).toMatchObject({ t: 0, k: 'key' });
    expect(tail[1]).toMatchObject({ t: 1, k: 'tile' });
  });

  it('环形淘汰：超容量后保最旧丢弃、total 持续增长', () => {
    const rec = makeRec();
    const over = REC_RING_CAPACITY + 100;
    for (let i = 0; i < over; i++) rec.log('key', { i });
    expect(rec.totalLogged).toBe(over);
    const buf = rec.buffer;
    expect(buf).toHaveLength(REC_RING_CAPACITY);            // 恒满
    const first = buf[0].d as { i: number };
    const last = buf[buf.length - 1].d as { i: number };
    expect(first.i).toBe(100);                              // 最旧 100 条被淘汰
    expect(last.i).toBe(over - 1);                          // 最新在尾部
    // 快照只取最近 n 条且不越界
    const t3 = rec.snapshotTail(3);
    expect((t3[0].d as { i: number }).i).toBe(over - 3);
  });

  it('snapshotTail 单调 t 序（环形回绕后仍正确）', () => {
    const rec = makeRec();
    for (let i = 0; i < REC_RING_CAPACITY + 5; i++) rec.log('sample', { i });
    const tail = rec.snapshotTail(100);
    const ts = tail.map((e) => e.t);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]);
  });

  it('toggle 开窗：export 只含开窗以来事件', () => {
    const rec = makeRec();
    rec.log('key', { c: 'KeyA', down: true });   // 窗前事件，不应入导出
    expect(rec.toggle()).toBe(true);             // 开窗
    expect(rec.recording).toBe(true);
    rec.log('tile', { x: 5, y: 6, from: 0, to: 'stone', cause: 'place' });
    rec.log('spawn', { b: 'enemies', id: 1, vid: 1, x: 0, y: 0 });
    const dump = rec.export();                   // 开窗中导出 = 开窗以来全部
    expect(dump.meta.eventCount).toBe(2);
    expect(dump.events.map((e) => e.k)).toEqual(['tile', 'spawn']);
    expect(dump.meta.truncated).toBe(false);
    expect(dump.meta.worldName).toBe('测试世界');
    expect(dump.meta.seed).toBe(12345);
    expect(typeof dump.meta.exportedAt).toBe('string');
    expect(new Date(dump.meta.exportedAt).getTime()).not.toBeNaN();
  });

  it('toggle 关窗后 export 仍取该窗全量（关窗=保存链）', () => {
    const rec = makeRec();
    rec.toggle();
    rec.log('hurt', { id: 1, vid: 3, dmg: 5, hp: 10 });
    expect(rec.toggle()).toBe(false);            // 关窗
    expect(rec.recording).toBe(false);
    const dump = rec.export();
    expect(dump.meta.eventCount).toBe(1);        // 窗内容仍在（lastStart 语义）
    expect(dump.events[0].k).toBe('hurt');
    // 关窗后继续 log 不进该窗快照（再 export 仍是原窗口——除非开新窗）
    rec.log('drop', { key: 'vi_1', n: 1, x: 0, y: 0 });
    expect(rec.export().meta.eventCount).toBe(1);
  });

  it('toggle 幂等方向切换：连续开窗重置窗口', () => {
    const rec = makeRec();
    rec.toggle();                                 // 开
    rec.log('a', 1);
    rec.toggle();                                 // 关（快照留存）
    rec.toggle();                                 // 再开 = 新窗，旧窗作废
    rec.log('b', 2);
    const dump = rec.export();
    expect(dump.meta.eventCount).toBe(1);
    expect(dump.events[0].d).toBe(2);
  });

  it('跨淘汰开窗导出：起点被风暴淘汰 → truncated:true 且截到最旧可达', () => {
    const rec = makeRec();
    rec.toggle();                                 // 开窗（total=0）
    for (let i = 0; i < REC_RING_CAPACITY + 50; i++) rec.log('bomb', { i });
    const dump = rec.export();
    expect(dump.meta.truncated).toBe(true);
    expect(dump.meta.eventCount).toBe(REC_RING_CAPACITY);   // 环满即上限
    const first = dump.events[0].d as { i: number };
    expect(first.i).toBe(50);                     // 前 50 条已被淘汰
  });

  it('从未开窗：export 退化为全环快照（探针口任意时刻可用）', () => {
    const rec = makeRec();
    rec.log('chat', { text: 'hello' });
    const dump = rec.export();
    expect(dump.meta.eventCount).toBe(1);
    expect(dump.meta.truncated).toBe(false);
    expect(dump.meta.startTick).not.toBeNull();
  });
});
