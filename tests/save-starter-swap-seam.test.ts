// ★BJ90（2026-09-15）starterSwapMigrated 死字段激活守卫（BJ71 登记①清偿）。
// 定谳：IIIII20b 换人一次性迁移标此前只在类型层声明（serialize.ts SaveData.header:79/
// SaveMeta:335）而 serializeSave header 无写位 → Game.ts IIIII20b 打标（:6950
// world.starterSwapMigrated=true「此后入库为保真态」）从未真正入库，每次读档恒假重跑。
// 恒假的实害：换人族世界（infectedSeed/vampireSeed/remix/drunk 族）里玩家**合法补招的
// 向导**（如派对女孩世界空房后 Guide 自然入住）在 starter 条目缺位（死亡/未重生）的
// 存档上会被 IIIII20b 迁移臂 splice 顶替——旗标本应打标后豁免。
// 修刀六落点（BJ71 双轨判例:凡 meta 装配多轨必逐轨核对）：①serializeSave header 写位
// ②SaveClient.doSave 生产 meta ③buildSaveParts 服务器件 meta ④protocol WorldPacket 字段
// ⑤packWorld 携行 ⑥World.fromPacket 回填（缺省不置,与 loadSaveData SaveFile.ts:358
// 「只落真值」同口径）。本测试四缝全量：同步轨/生产 worker 轨/服务器件轨/读档包缝。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SaveClient } from '../src/workers/SaveClient';
import { saveGame, saveWorldOnly, loadSave, loadSaveData, serializeSave } from '../src/save/SaveFile';
import type { SaveData, SaveMeta, SaveStoreView } from '../src/save/serialize';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { packWorld } from '../src/workers/worldPacket';

const ROOT = resolve(__dirname, '..');

function makeWorld(migrated: boolean): World {
  const w = new World(64, 32, 42, '换人标测试');
  w.spawnX = 30; w.spawnY = 10;
  if (migrated) w.starterSwapMigrated = true;
  return w;
}

/** 伪装 Worker：按 save.worker.ts:100-121 视图重建契约同步回包（复刻
 *  banner-kills-worker-seam.test.ts 同款,捕获 meta 断言生产装配喂入面） */
function attachFakeSaveWorker(client: SaveClient): Array<Record<string, unknown>> {
  const captured: Array<Record<string, unknown>> = [];
  const clientAny = client as unknown as {
    pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  };
  const fake = {
    onmessage: null as ((e: { data: unknown }) => void) | null,
    postMessage(msg: unknown) {
      const req = msg as {
        type: string; id: number; w: number; h: number;
        bufs: Record<string, ArrayBuffer>; meta: SaveMeta; player: SaveData['player'];
        playTimeMs: number;
      };
      if (req.type !== 'save') return;
      captured.push(msg as Record<string, unknown>);
      const n = Math.floor(req.bufs.type.byteLength / 2);
      const view: SaveStoreView = {
        type: new Uint16Array(req.bufs.type), flags: new Uint8Array(req.bufs.flags),
        frameX: new Uint16Array(req.bufs.frameX), frameY: new Uint16Array(req.bufs.frameY),
        wall: new Uint16Array(req.bufs.wall), liquid: new Uint8Array(req.bufs.liquid),
        liquidType: new Uint8Array(req.bufs.liquidType), wire: new Uint8Array(req.bufs.wire),
        half: new Uint8Array(req.bufs.half), slope: new Uint8Array(req.bufs.slope),
        paint: new Uint8Array(req.bufs.paint ?? new ArrayBuffer(n)),
        paintWall: new Uint8Array(req.bufs.paintWall ?? new ArrayBuffer(n)),
        coat: req.bufs.coat ? new Uint8Array(req.bufs.coat) : undefined,
        explored: req.bufs.explored ? new Uint8Array(req.bufs.explored) : undefined,
      };
      const meta: SaveMeta = { ...req.meta, w: req.w, h: req.h };
      const json = serializeSave(view, meta, req.player, req.playTimeMs);
      fake.onmessage?.({ data: { type: 'saved', id: req.id, json } });
    },
    terminate() { /* noop */ },
  };
  fake.onmessage = (e: { data: unknown }) => {
    const d = e.data as { type: string; id: number; json?: string };
    const p = clientAny.pending.get(d.id);
    if (!p) return;
    clientAny.pending.delete(d.id);
    if (d.type === 'saved') p.resolve(d.json);
    else p.reject(new Error('fake save worker error'));
  };
  const c = client as unknown as { worker: unknown; broken: boolean };
  c.worker = fake;
  c.broken = false;
  return captured;
}

describe('starterSwapMigrated 存读全缝（★BJ90 债①,BJ71 登记①）', () => {
  it('保存缝·生产 worker 轨：SaveClient meta 喂入 + header 落键 + round-trip 保值', async () => {
    const client = new SaveClient();
    const captured = attachFakeSaveWorker(client);
    const json = await client.save(makeWorld(true), new Player(100, 100, new Inventory()), 0);
    expect((captured[0].meta as SaveMeta).starterSwapMigrated).toBe(true);   // 装配面（断点 A）
    const header = (JSON.parse(json as string) as SaveData).header;
    expect(header.starterSwapMigrated).toBe(true);                            // 写位（根死字段）
    const back = loadSave(json as string);
    expect(back.world.starterSwapMigrated).toBe(true);                        // 读面
  });

  it('保存缝·同步回退轨 + 服务器件轨（saveGame/saveWorldOnly）', () => {
    const world = makeWorld(true);
    const json = saveGame(world, new Player(100, 100, new Inventory()), 0);
    expect((JSON.parse(json) as SaveData).header.starterSwapMigrated).toBe(true);
    // 服务器件轨（buildSaveParts→saveWorldOnly,占位玩家）
    const worldOnly = JSON.parse(saveWorldOnly(world)) as SaveData;
    expect(worldOnly.header.starterSwapMigrated).toBe(true);
  });

  it('旧档缺省零迁移：未打标世界不落键,loadSaveData 后保持未迁移（undefined）', () => {
    const json = saveGame(makeWorld(false), new Player(100, 100, new Inventory()), 0);
    const data = JSON.parse(json) as SaveData;
    expect('starterSwapMigrated' in data.header).toBe(false);   // undefined 键被 stringify 丢弃
    const back = loadSaveData(data);
    expect(back.world.starterSwapMigrated).toBeFalsy();         // IIIII20b 迁移臂仍可首载执行
  });

  it('读档包缝：loadSaveData → packWorld → fromPacket 保值（断点 B）；缺省不置', () => {
    // 已打标世界:包缝携行
    const { world: workerWorld } = loadSaveData(
      JSON.parse(saveGame(makeWorld(true), new Player(100, 100, new Inventory()), 0)) as SaveData);
    const { packet } = packWorld(workerWorld);   // transfer 语义:此后 workerWorld 不可再用
    expect(packet.starterSwapMigrated).toBe(true);
    const w3 = World.fromPacket(packet);
    expect(w3.starterSwapMigrated).toBe(true);   // 主线程态保真 → 下次存档不再恒假

    // 未打标世界:包缺省不置（fromPacket 缺省不置,与 loadSaveData 同口径）
    const { world: fresh } = loadSaveData(
      JSON.parse(saveGame(makeWorld(false), new Player(100, 100, new Inventory()), 0)) as SaveData);
    const w4 = World.fromPacket(packWorld(fresh).packet);
    expect(w4.starterSwapMigrated).toBeFalsy();
  });

  it('结构锁：IIIII20b 消费臂仍以 world.starterSwapMigrated 为门（Game.ts 迁移标区）', () => {
    const gameSrc = readFileSync(resolve(ROOT, 'src/core/Game.ts'), 'utf8');
    expect(gameSrc).toMatch(
      /if \(starterKey !== 'guide' && !this\.world\.starterSwapMigrated\) \{[\s\S]*?world\.starterSwapMigrated = true;/,
    );
  });
});
