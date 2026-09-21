// ★BJ223（2026-09-20）saveParse 三源恢复守卫（json/save 源恢复 + BJ90 定谳勘误面）。
// 断链史：BJ90 债④（2026-09-15）移除 v6 二进制死路径时把 json/save 两源连坐删除
// （「零消费方」grep 漏计 mainFlow.loadFromJson 的 client.loadSave({json})——探针
// __swLoadJson/世界导入/主线程 fallback 的镜像消费方）→ 该路径必抛「存档数据缺失」，
// loadFromJson catch 的 alert 同步阻塞主线程=探针 protocolTimeout 挂死。
// 测试台装配（node 环境无 self/Worker）：
//  ①伪装 self 承接 worldGen.worker 顶层 ctx 绑定（ctx=self → onmessage 挂桩 /
//    postMessage 事件收集），动态 import 后即得真 saveParse 处理器的进程内直测台；
//  ②伪 Worker 桥：client.postMessage → 真 handler 异步回灌，handler 的
//    ctx.postMessage → 当前伪实例 onmessage → client.onEvent（全缝 round-trip）。
// key 源正向覆盖=真 IDB 域，由实机探针/人工 F5 既有面承担（node 无 IDB；
// save-binary-deadpath/sw-bj5/banner-kills-worker-seam 回归绿=key 源不回归证明）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { saveGame } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { WorldPacket } from '../src/workers/protocol';
import { WorldGenClient } from '../src/workers/WorldGenClient';

// —— 装配：必须先于 worker 模块求值（静态导入不涉 self，动态 import 在其后） ——
type WkEv = { id: number; type: string; message?: string; [k: string]: unknown };
const wkEvents: WkEv[] = [];
let fakeWorkerSink: ((ev: { data: unknown }) => void) | null = null;   // 当前伪 Worker 的 client 侧 onmessage
const fakeSelf: {
  addEventListener: () => void;
  postMessage: (m: WkEv) => void;
  onmessage: ((e: { data: unknown }) => void) | null;
} = {
  addEventListener: () => {},
  postMessage: (m) => { wkEvents.push(m); fakeWorkerSink?.({ data: m }); },
  onmessage: null,
};
(globalThis as unknown as { self?: unknown }).self = fakeSelf;
await import('../src/workers/worldGen.worker');
const handler = fakeSelf.onmessage!;   // worker 模块顶层挂上的真 onmessage 处理器

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  constructor() { fakeWorkerSink = (ev) => this.onmessage?.(ev); }
  postMessage(msg: unknown): void {
    // 异步化近似真 worker 消息时序（握手 ping/任务请求都走事件环）
    void Promise.resolve().then(() => fakeSelf.onmessage?.({ data: msg }));
  }
  terminate(): void { /* 伪件无进程 */ }
}
(globalThis as unknown as { Worker?: unknown }).Worker = FakeWorker;

// —— 夹具：小世界真 saveGame 产物（json 文本=①号源；parse 对象=②号源） ——
function makeFixture(): { json: string; data: ReturnType<typeof JSON.parse> } {
  const world = new World(64, 32, 42, 'BJ223夹具');
  world.spawnX = 30; world.spawnY = 10;
  const player = new Player(100, 100, new Inventory());
  const json = saveGame(world, player, 123_456);
  return { json, data: JSON.parse(json) };
}

function resultOf(id: number): {
  world: WorldPacket; player?: unknown;
  save?: { header?: { playTimeMs?: number; difficulty?: number } };
} | undefined {
  return wkEvents.find((e) => e.type === 'result' && e.id === id) as never;
}

describe('BJ223 saveParse 三源（真 worker 处理器进程内直测）', () => {
  it('json 源：saveParse({json}) → result（world 就绪 + 存档头字段正确）', async () => {
    wkEvents.length = 0;
    const { json } = makeFixture();
    await handler({ data: { id: 101, type: 'saveParse', json } });
    const result = resultOf(101);
    expect(result, 'json 源必须产出 result（断链修复前此路径 error「存档数据缺失」）').toBeTruthy();
    expect(wkEvents.some((e) => e.type === 'error')).toBe(false);
    const w = World.fromPacket(result!.world);
    expect(w.w).toBe(64);
    expect(w.h).toBe(32);
    expect(w.name).toBe('BJ223夹具');
    expect(w.spawnX).toBe(30);
    // BJ90 内存削减逻辑（savedPlayMs 提取+回传）保留——SW-BJ5 读档吸合数据源
    expect(result!.save?.header?.playTimeMs).toBe(123_456);
  });

  it('save 源：saveParse({save:SaveData对象}) → result（.wld 导入面零再解析）', async () => {
    wkEvents.length = 0;
    const { data } = makeFixture();
    await handler({ data: { id: 102, type: 'saveParse', save: data } });
    const result = resultOf(102);
    expect(result, 'save 源必须产出 result（断链修复前此路径 error「存档数据缺失」）').toBeTruthy();
    expect(wkEvents.some((e) => e.type === 'error')).toBe(false);
    const w = World.fromPacket(result!.world);
    expect(w.w).toBe(64);
    expect(w.h).toBe(32);
    expect(result!.save?.header?.playTimeMs).toBe(123_456);
  });

  it('三源皆空：throw「存档数据缺失」→ error 事件回传（不静默 pending）', async () => {
    wkEvents.length = 0;
    await handler({ data: { id: 103, type: 'saveParse' } });
    const err = wkEvents.find((e) => e.type === 'error' && e.id === 103);
    expect(err?.message).toContain('存档数据缺失');
    expect(wkEvents.some((e) => e.type === 'result')).toBe(false);
  });
});

describe('BJ223 全缝（WorldGenClient 伪 Worker 桥真 handler）', () => {
  it('client.loadSave({json}) 三源透传契约 → world/player/save 回传', async () => {
    const { json } = makeFixture();
    const client = new WorldGenClient();
    const { world, player, save } = await client.loadSave({ json }, { timeoutMs: 60_000 });
    const hdr = save as { header?: { playTimeMs?: number } } | undefined;
    expect(world.w).toBe(64);
    expect(world.h).toBe(32);
    expect(world.name).toBe('BJ223夹具');
    expect(hdr?.header?.playTimeMs).toBe(123_456);
    expect(player).toBeTruthy();
  });

  it('client.loadSave({save}) 直传对象全缝 round-trip', async () => {
    const { data } = makeFixture();
    const client = new WorldGenClient();
    const { world, save } = await client.loadSave({ save: data }, { timeoutMs: 60_000 });
    const hdr = save as { header?: { playTimeMs?: number } } | undefined;
    expect(world.w).toBe(64);
    expect(hdr?.header?.playTimeMs).toBe(123_456);
  });
});

describe('BJ223 结构锁（源文本锚，防连坐再删除）', () => {
  const codeOf = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/^\s*\/\/.*$/gm, '');

  it('worker saveParse 三源分派形状在（key→idb / json→parse / save→直传）', () => {
    const s = codeOf('../src/workers/worldGen.worker.ts');
    expect(s).toContain('if (req.key) {');
    expect(s).toContain("'json' in req && typeof req.json === 'string'");
    expect(s).toContain("'save' in req && req.save");
  });

  it('mainFlow.loadFromJson json 源消费端在（BJ90 勘误的事实面）', () => {
    const s = codeOf('../src/mainFlow.ts');
    expect(s).toContain('client.loadSave({ json: text }');
  });
});
