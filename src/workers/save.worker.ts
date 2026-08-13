// 存档序列化 worker:接收 tilestore 副本(结构化克隆,不 transfer——主线程数组是活的)
// + 世界元数据,在后台线程完成 RLE/base64/JSON 全套序列化,回传 JSON 字符串。
// 与主线程 SaveFile.saveGame 共用 ./save/serialize 纯核心,输出逐位一致。
import { serializeSave } from '../save/serialize';
import type { SaveData, SaveMeta, SaveStoreView } from '../save/serialize';

interface SaveRequest {
  type: 'save';
  id: number;
  w: number; h: number;
  bufs: {
    type: ArrayBuffer; flags: ArrayBuffer;
    frameX: ArrayBuffer; frameY: ArrayBuffer;
    wall: ArrayBuffer; liquid: ArrayBuffer; liquidType: ArrayBuffer; wire: ArrayBuffer;
    half: ArrayBuffer; slope: ArrayBuffer;
    /** 油漆双通道（旧客户端可缺省 → 全 0 = 无漆，与 explored 同款缺省容忍） */
    paint?: ArrayBuffer; paintWall?: ArrayBuffer;
    /** 战争迷雾 0/1 位图（旧客户端可缺省 → 不落 explored 段 = 读档全 0 旧行为） */
    explored?: ArrayBuffer;
  };
  meta: Omit<SaveMeta, 'w' | 'h'>;
  player: SaveData['player'];
  playTimeMs: number;
  townNpcs?: import('../save/serialize').SaveData['npcs'];
  events?: import('../save/serialize').SaveData['events'];
}

self.onmessage = (e: MessageEvent<SaveRequest>) => {
  const req = e.data;
  if (req.type !== 'save') return;
  try {
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
      // 油漆双通道（旧客户端缺省 → 全 0 无漆）
      paint: new Uint8Array(req.bufs.paint ?? new ArrayBuffer(n)),
      paintWall: new Uint8Array(req.bufs.paintWall ?? new ArrayBuffer(n)),
      // 战争迷雾（旧客户端缺省 → undefined = 不落 explored 段，读档按全 0 旧行为）
      explored: req.bufs.explored ? new Uint8Array(req.bufs.explored) : undefined,
    };
    const meta: SaveMeta = { ...req.meta, w: req.w, h: req.h };
    const json = serializeSave(view, meta, req.player, req.playTimeMs, req.townNpcs, req.events);
    (self as unknown as Worker).postMessage({ type: 'saved', id: req.id, json });
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', id: req.id, message: String(err) });
  }
};
