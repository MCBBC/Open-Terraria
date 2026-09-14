// ★BJ71（2026-09-14）：bannerKills（旗击杀计数,BannerSystem.killCount）生产存读双缝守卫。
// 定谳：生产保存走 SaveClient.doSave（worker 路径,mainFlow.doSave:1448 → saveClient.save）,
// 其 meta 装配与主线程回退路径 saveGame（SaveFile.ts:39）双轨——bannerKills 曾只在 saveGame
// 喂入,worker 路径落盘 JSON 无 bannerKills 键（JSON.stringify 丢 undefined）→ 读档
// loadSaveData `if (data.bannerKills)` 不成立 → 重进存档计数归零（用户实报）。
// 同理 worker 读档回传包 packWorld/WorldPacket.fromPacket 曾不携 bannerKills——即使修好
// 保存缝,worker 读档路径（worldGen.worker:215 packWorld → WorldGenClient:199 fromPacket）
// 仍会在包缝丢失。既有 tests/banner-kills-save.test.ts 全走同步 saveGame → 全绿掩盖实机断链
// （fx43 bgStyles「meta 装配漏喂」同族判例）。
// 本测试伪装 Worker：①走真实 SaveClient 生产装配 + save.worker.ts:100-121 视图重建契约 +
// 真实 serializeSave → loadSaveData round-trip；②loadSaveData → packWorld → fromPacket
// 包缝 round-trip（bannerKills + 同缝族 seedFlags/meteorShowerCount/oreTiersPH）。
import { describe, it, expect } from 'vitest';
import { SaveClient } from '../src/workers/SaveClient';
import { serializeSave, loadSaveData } from '../src/save/SaveFile';
import type { SaveData, SaveMeta, SaveStoreView } from '../src/save/serialize';
import { loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { packWorld } from '../src/workers/worldPacket';

const KILLS = { 5: 42, 87: 1, 292: 999 };

function makeWorld(): World {
  const world = new World(64, 32, 42, '测试');
  world.bannerKills = { ...KILLS };
  world.meteorShowerCount = 3;
  world.oreTiersPH = { copper: 5, iron: 4, silver: 8, gold: 6 };
  world.seedFlags = { drunkWorld: true };
  return world;
}

/** 伪装 Worker：捕获 postMessage 载荷并按 save.worker.ts 的视图重建契约同步回包。
 *  复刻 save.worker.ts:100-121（view 自 bufs 重建 + meta 透传 + serializeSave）+
 *  SaveClient.ensure 的 onmessage 分派（'saved' 分支,pending 表直查——真件在 ensure()
 *  内接线,伪装件须自接等价分派）。 */
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
        playTimeMs: number; townNpcs?: SaveData['npcs']; events?: SaveData['events'];
        pillarNpcs?: SaveData['pillarNpcs']; pressurePlates?: SaveData['pressurePlates'];
      };
      if (req.type !== 'save') return;
      captured.push(msg as Record<string, unknown>);
      const n = Math.floor(req.bufs.type.byteLength / 2);
      const view: SaveStoreView = {
        type: new Uint16Array(req.bufs.type),
        flags: new Uint8Array(req.bufs.flags),
        frameX: new Uint16Array(req.bufs.frameX),
        frameY: new Uint16Array(req.bufs.frameY),
        wall: new Uint16Array(req.bufs.wall),
        liquid: new Uint8Array(req.bufs.liquid),
        liquidType: new Uint8Array(req.bufs.liquidType),
        wire: new Uint8Array(req.bufs.wire),
        half: new Uint8Array(req.bufs.half),
        slope: new Uint8Array(req.bufs.slope),
        paint: new Uint8Array(req.bufs.paint ?? new ArrayBuffer(n)),
        paintWall: new Uint8Array(req.bufs.paintWall ?? new ArrayBuffer(n)),
        coat: req.bufs.coat ? new Uint8Array(req.bufs.coat) : undefined,
        explored: req.bufs.explored ? new Uint8Array(req.bufs.explored) : undefined,
      };
      const meta: SaveMeta = { ...req.meta, w: req.w, h: req.h };
      const json = serializeSave(view, meta, req.player, req.playTimeMs, req.townNpcs,
        req.events, req.pillarNpcs, req.pressurePlates);
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
  c.worker = fake;   // 绕过 ensure()，不产真实 Worker
  c.broken = false;
  return captured;
}

describe('bannerKills 生产存读双缝（SaveClient worker 路径 / packWorld 包缝）', () => {
  it('保存缝：SaveClient worker 路径 meta 携行 bannerKills，JSON round-trip 保值', async () => {
    const client = new SaveClient();
    const captured = attachFakeSaveWorker(client);
    const json = await client.save(makeWorld(), new Player(100, 100, new Inventory()), 0);
    const meta = captured[0].meta as SaveMeta;
    expect(meta.bannerKills).toEqual(KILLS);          // 生产装配必须喂入（断点 A）
    expect(JSON.parse(json as string).bannerKills).toEqual(KILLS);   // 落盘 JSON 必须有键
    const back = loadSave(json as string);
    expect(back.world.bannerKills).toEqual(KILLS);
  });

  it('读档缝：loadSaveData → packWorld → fromPacket 包缝保值（断点 B）', async () => {
    const { world: workerWorld } = loadSaveData(
      JSON.parse(await produceSaveJson(makeWorld(), new Player(100, 100, new Inventory()))) as SaveData);
    const { packet } = packWorld(workerWorld);        // transfer 语义:workerWorld 至此不可再用
    const w3 = World.fromPacket(packet);
    expect(w3.bannerKills).toEqual(KILLS);
  });

  it('同缝族：seedFlags/meteorShowerCount/oreTiersPH 双缝携行（fx43 漏喂同族）', async () => {
    const client = new SaveClient();
    const captured = attachFakeSaveWorker(client);
    const json = await client.save(makeWorld(), new Player(100, 100, new Inventory()), 0);
    const meta = captured[0].meta as SaveMeta;
    expect(meta.seedFlags).toEqual({ drunkWorld: true });
    expect(meta.meteorShowerCount).toBe(3);
    expect(meta.oreTiersPH).toEqual({ copper: 5, iron: 4, silver: 8, gold: 6 });
    expect(JSON.parse(json as string).header.seedFlags).toEqual({ drunkWorld: true });
    expect(JSON.parse(json as string).meteorShowerCount).toBe(3);
    expect(JSON.parse(json as string).oreTiersPH).toEqual({ copper: 5, iron: 4, silver: 8, gold: 6 });
    // 包缝：worker 读档回传主线程后三件不丢
    const { world: workerWorld } = loadSaveData(JSON.parse(json as string) as SaveData);
    const w3 = World.fromPacket(packWorld(workerWorld).packet);
    expect(w3.seedFlags).toEqual({ drunkWorld: true });
    expect(w3.meteorShowerCount).toBe(3);
    expect(w3.oreTiersPH).toEqual({ copper: 5, iron: 4, silver: 8, gold: 6 });
  });
});

/** 生产装配直出 JSON（SaveClient worker 路径 + save.worker 契约复刻） */
async function produceSaveJson(world: World, player: Player): Promise<string> {
  const client = new SaveClient();
  attachFakeSaveWorker(client);
  return (await client.save(world, player, 0)) as string;
}

