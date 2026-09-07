// 存档序列化 worker:接收 tilestore 副本(结构化克隆,不 transfer——主线程数组是活的)
// + 世界元数据,在后台线程完成 RLE/base64/JSON 全套序列化,回传 JSON 字符串。
// 与主线程 SaveFile.saveGame 共用 ./save/serialize 纯核心,输出逐位一致。
// 导入域(2026-08-27 用户报「导入卡住 UI」):.wld 解析(parseWldToSave 是主线程
// 同步重活,大图数秒)+存档 JSON.stringify 全搬本线程;buf transfer 零拷贝。
// WldImport 无 DOM 依赖(纯数据表+SaveFile 纯函数),worker 可安全加载。
import './procShim';   // ★process 兜底首导入(见 procShim.ts;2026-09-02 worldGen 同款扩面)
import { serializeSave } from '../save/serialize';
import type { SaveData, SaveMeta, SaveStoreView } from '../save/serialize';
import { parseWldToSave } from '../wld/WldImport';
import { exportWld } from '../wld/WldExport';

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
    /** 涂层四位（WF:1539-1552；旧客户端可缺省 → 不落 coat 段） */
    coat?: ArrayBuffer;
    /** 战争迷雾 0/1 位图（旧客户端可缺省 → 不落 explored 段 = 读档全 0 旧行为） */
    explored?: ArrayBuffer;
  };
  meta: Omit<SaveMeta, 'w' | 'h'>;
  player: SaveData['player'];
  playTimeMs: number;
  townNpcs?: import('../save/serialize').SaveData['npcs'];
  events?: import('../save/serialize').SaveData['events'];
}

type SaveWorkerRequest = SaveRequest
  | { type: 'importWld'; id: number; buf: ArrayBuffer }
  | { type: 'inspectSave'; id: number; text: string }
  // ★导出 worker 化(2026-09-07 用户报「导出卡一下主线程」):存档 json 的
  //  JSON.parse(大档数十 ms)+ 全图 tile 编码全搬本线程;产物 ArrayBuffer transfer
  | { type: 'exportWld'; id: number; json: string };

self.onmessage = (e: MessageEvent<SaveWorkerRequest>) => {
  const req = e.data;
  // ---- 导入:.wld → SaveData(json) + 槽位元数据（世界列表「导入」,不进世界）----
  if (req.type === 'importWld') {
    try {
      const { save, seedText, gameMode } = parseWldToSave(new Uint8Array(req.buf));
      (self as unknown as Worker).postMessage({
        type: 'imported', id: req.id, json: JSON.stringify(save),
        meta: {
          name: save.header.name ?? '', seedText,
          seedNum: save.header.seed, gameMode,
          w: save.header.width, h: save.header.height,
          evil: save.header.crimson ? 1 : 0,
        },
      });
    } catch (err) {
      (self as unknown as Worker).postMessage({ type: 'error', id: req.id, message: String(err) });
    }
    return;
  }
  // ---- 导入:.json 档校验+提头（JSON.parse 大档本身也是主线程阻塞点）----
  if (req.type === 'inspectSave') {
    try {
      const h = (JSON.parse(req.text) as {
        header?: { name?: string; seed?: number | string; width?: number; height?: number;
          difficulty?: number; crimson?: boolean; hardMode?: boolean; playTimeMs?: number };
      }).header;
      const ok = !!h && typeof h.width === 'number' && typeof h.height === 'number';
      (self as unknown as Worker).postMessage({
        type: 'inspected', id: req.id, ok,
        meta: ok ? {
          name: h.name ?? '', seed: String(h.seed ?? ''), w: h.width, h: h.height,
          difficulty: h.difficulty ?? 0, evil: h.crimson ? 1 : 0, hardMode: !!h.hardMode,
          playTimeMs: typeof h.playTimeMs === 'number' && Number.isFinite(h.playTimeMs) ? h.playTimeMs : 0,   // SW-BJ5 2026-09-07
        } : undefined,
      });
    } catch {
      (self as unknown as Worker).postMessage({ type: 'inspected', id: req.id, ok: false });
    }
    return;
  }
  // ---- 导出:存档 json → 原版 .wld 字节(2026-09-07,红队 P0-1 勘误:曾只声明
  //  类型未挂处理器,客户端固定空等 20s 超时再回退主线程) ----
  if (req.type === 'exportWld') {
    try {
      const buf = exportWld(JSON.parse(req.json) as SaveData);
      (self as unknown as Worker).postMessage({ type: 'exported-wld', id: req.id, buf }, [buf]);
    } catch (err) {
      (self as unknown as Worker).postMessage({ type: 'error', id: req.id, message: String(err) });
    }
    return;
  }
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
      // 涂层四位（WF:1539-1552；旧客户端缺省 → undefined = 不落 coat 段）
      coat: req.bufs.coat ? new Uint8Array(req.bufs.coat) : undefined,
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
