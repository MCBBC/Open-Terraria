// ★BJ90（2026-09-15）v6 二进制快路径死重量退役守卫（BJ71 登记②清偿）。
// 评估定谳（grep 全库）：
//  · packSaveBinary/kvSetBinary 唯一调用方=mainFlow kvSetCompat（快照写）——先 kvSetBinary
//    写二进制副本、再 kvSet 同 key 写 JSON；IDB 同 store readwrite 串行（创建序提交）→
//    JSON 恒后写覆盖二进制副本 ⇒ 快路径零活跃消费方（worldGen.worker:174 的 ArrayBuffer
//    分支★RB20b 勘误 2026-09-15:连该「崩溃窗口」都不可达——worker 读侧 kvGetIdb 是
//    string-only 过滤,二进制副本在落库后即被同拍 JSON 覆写+读侧先滤,死码三重;
//    且该残留是 meta={} 元数据全丢损毁态: unpack 后 loadSaveData 读 data.header.width
//    即 TypeError,无法救）。
//  · isBinarySave/kvGetBinary 全库零调用方；BinarySave.ts:4 头注引用的 loadFromKey
//    自动迁移链不存在。宣称的「-300MB 峰值」收益从未实现（二进制副本活不过同帧）。
// 处置=移除死路径：kvSetCompat 二进制分支/worker 二进制读分支/BinarySave.ts/
// KvStore.kvSetBinary+kvGetBinary 全撤,存档权威格式=JSON 字符串。本文件锁死退役态
// 防静默回植（结构锁+模块消失锁）。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { kvSet, kvGet } from '../src/save/KvStore';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const ROOT = resolve(__dirname, '..');
/** 源码剥行注释后取码面（结构锁只禁代码复植,判定注释含词不误伤） */
const codeOf = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/^\s*\/\/.*$/gm, '');

describe('v6 二进制快路径退役态（★BJ90 债④,BJ71 登记②）', () => {
  it('BinarySave.ts 模块已删除,动态 import 必拒', async () => {
    expect(existsSync(resolve(ROOT, 'src/save/BinarySave.ts'))).toBe(false);
    // 运行期拼接防 vite 变换期静态解析（否则炸整文件 transform）
    const spec = '../src/save/Binary' + 'Save';
    await expect(import(/* @vite-ignore */ spec)).rejects.toThrow();
  });

  it('写缝：mainFlow 无 kvSetBinary/packSaveBinary 复植（kvSetCompat 已撤）', () => {
    const s = codeOf('src/mainFlow.ts');
    expect(s).not.toMatch(/kvSetBinary|packSaveBinary|BinarySave/);
    expect(s).toMatch(/void kvSet\(QUICK_SAVE_KEY, json\)/);   // 快照写=JSON 单写
  });

  it('读缝：worldGen.worker 二进制分支不复植（kvGetIdb 直读 JSON）', () => {
    const s = codeOf('src/workers/worldGen.worker.ts');
    expect(s).not.toMatch(/unpackSaveBinary|BinarySave|instanceof ArrayBuffer/);
  });

  it('KvStore 二进制助手不复植', () => {
    const s = codeOf('src/save/KvStore.ts');
    expect(s).not.toMatch(/kvSetBinary|kvGetBinary/);
  });

  it('行为面：快照读写走纯 JSON 链（kvSet→kvGet→JSON.parse→loadSaveData）', async () => {
    // node 环境 IndexedDB 不可用 → kvSet 走 localStorage 副本/IDB 失败兜底;垫最小
    // localStorage 桩以覆盖 kvGet 回读链（真 IDB 环境由探针/人工 F5 验证）
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    };
    const world = new World(64, 32, 42, '纯JSON快照');
    world.spawnX = 30; world.spawnY = 10;
    world.flags.hardMode = true;
    const json = saveGame(world, new Player(100, 100, new Inventory()), 0);
    // 同进程 IDB 不可用（node 环境）→ kvSet 兜底 localStorage 或 fail,但返回值非二进制;
    // 真读写契约由 save.test.ts round-trip 主判据覆盖,此处锁「写入口返回 string 通道语义」
    const where = await kvSet('sandboxworld.test.deadpath', json);
    expect(where).toBe('local');   // ≤2MB 快路径命中 shim（IDB 在 node 不可用=兜底链）
    const back = await kvGet('sandboxworld.test.deadpath');
    expect(back).not.toBeNull();   // 回读必为字符串（非 ArrayBuffer——v6 二进制残留即在此炸）
    const w2 = loadSave(back as string);
    expect(w2.world.flags.hardMode).toBe(true);
  });
});
