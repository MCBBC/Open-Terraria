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
  };
  meta: Omit<SaveMeta, 'w' | 'h'>;
  player: SaveData['player'];
  playTimeMs: number;
  townNpcs?: import('../save/serialize').SaveData['npcs'];
}

self.onmessage = (e: MessageEvent<SaveRequest>) => {
  const req = e.data;
  if (req.type !== 'save') return;
  try {
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
    };
    const meta: SaveMeta = { ...req.meta, w: req.w, h: req.h };
    const json = serializeSave(view, meta, req.player, req.playTimeMs, req.townNpcs);
    (self as unknown as Worker).postMessage({ type: 'saved', id: req.id, json });
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', id: req.id, message: String(err) });
  }
};
